import { Resend } from 'resend';
import config from '../config';

let resend: Resend | null = null;

if (config.resendApiKey) {
  resend = new Resend(config.resendApiKey);
}

const from = config.resendFromEmail;
const appUrl = config.appUrl;

/**
 * Escape HTML special characters to prevent injection in email bodies
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Mask email address for safe logging (PII protection)
 */
function maskEmail(email: string): string {
  if (!email) return '';
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return email.length <= 1 ? '*' : email[0] + '***';
  }
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex);
  if (localPart.length <= 2) {
    return localPart[0] + '***' + domainPart;
  }
  return localPart.slice(0, 2) + '***' + domainPart;
}

interface EmailEnvelope {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
}

function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  emails.forEach(email => {
    const normalizedEmail = email.trim();
    const key = normalizedEmail.toLowerCase();
    if (!normalizedEmail || seen.has(key)) return;
    seen.add(key);
    unique.push(normalizedEmail);
  });

  return unique;
}

function chunkEmails(emails: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < emails.length; index += chunkSize) {
    chunks.push(emails.slice(index, index + chunkSize));
  }
  return chunks;
}

function getPositiveIntegerEnv(name: string, fallback: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function getNonNegativeIntegerEnv(name: string, fallback: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendEmailMessage(envelope: EmailEnvelope, subject: string, html: string): Promise<string | undefined> {
  const toValues = Array.isArray(envelope.to) ? envelope.to : [envelope.to];
  const maskedTo = toValues.map(maskEmail).join(', ');
  const maskedCc = envelope.cc?.map(maskEmail).join(', ');
  const maskedBccCount = envelope.bcc?.length || 0;
  if (!resend) {
    console.log(
      `[Email] Skipped (no API key): "${subject}" to ${maskedTo}`
      + `${maskedCc ? ` cc ${maskedCc}` : ''}`
      + `${maskedBccCount ? ` bcc ${maskedBccCount} recipient(s)` : ''}`
    );
    return;
  }
  try {
    const result = await resend.emails.send({ from, ...envelope, subject, html });
    const emailId = result.data?.id;
    console.log(
      `[Email] Sent: "${subject}" to ${maskedTo}`
      + `${maskedCc ? ` cc ${maskedCc}` : ''}`
      + `${maskedBccCount ? ` bcc ${maskedBccCount} recipient(s)` : ''}`
      + `${emailId ? ` id ${emailId}` : ''}`
    );
    return emailId;
  } catch (error) {
    console.error(`[Email] Failed: "${subject}" to ${maskedTo}`, error);
    throw error;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await sendEmailMessage({ to }, subject, html);
}

export async function sendWelcomeEmail(email: string): Promise<void> {
  await sendEmail(
    email,
    'Welcome to SpatialDSL Studio',
    `<h2>Welcome to SpatialDSL Studio!</h2>
    <p>Your account has been created successfully.</p>
    <p>You can log in at: <a href="${appUrl}">${appUrl}</a></p>
    <p>You have been assigned the <strong>VIEWER</strong> role. To request additional permissions, use the &quot;Request Role Upgrade&quot; option in the application.</p>`
  );
}

export async function sendEmailVerificationCodeEmail(email: string, code: string): Promise<void> {
  await sendEmail(
    email,
    'Verify Your Email - SpatialDSL Studio',
    `<h2>Verify Your Email</h2>
    <p>Use this verification code to finish creating your SpatialDSL Studio account:</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:4px;">${escapeHtml(code)}</p>
    <p>This code expires in 15 minutes. If you did not create an account, you can ignore this email.</p>
    <p><a href="${appUrl}">${appUrl}</a></p>`
  );
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail(
    email,
    'Reset Your Password - SpatialDSL Studio',
    `<h2>Password Reset Request</h2>
    <p>You requested a password reset. Click the link below to set a new password:</p>
    <p><a href="${resetUrl}">${escapeHtml(resetUrl)}</a></p>
    <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`
  );
}

export async function sendShareNotificationEmail(
  recipientEmail: string,
  ownerEmail: string,
  resourceType: string,
  resourceName: string
): Promise<void> {
  await sendEmail(
    recipientEmail,
    `A ${resourceType.toLowerCase()} has been shared with you - SpatialDSL Studio`,
    `<h2>Resource Shared With You</h2>
    <p><strong>${escapeHtml(ownerEmail)}</strong> shared a ${escapeHtml(resourceType.toLowerCase())} with you: <strong>${escapeHtml(resourceName)}</strong></p>
    <p>View it in the app: <a href="${appUrl}">${appUrl}</a></p>`
  );
}

export async function sendRoleRequestSubmittedEmail(
  adminEmails: string[],
  requesterEmail: string,
  requestedRole: string,
  reason: string
): Promise<void> {
  for (const adminEmail of adminEmails) {
    await sendEmail(
      adminEmail,
      'New Role Request - SpatialDSL Studio',
      `<h2>New Role Upgrade Request</h2>
      <p><strong>${escapeHtml(requesterEmail)}</strong> has requested a role upgrade to <strong>${escapeHtml(requestedRole)}</strong>.</p>
      <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      <p>Review this request in the <a href="${appUrl}/admin">Admin Panel</a>.</p>`
    );
  }
}

export async function sendRoleRequestReviewedEmail(
  userEmail: string,
  requestedRole: string,
  approved: boolean,
  reviewNote?: string
): Promise<void> {
  const status = approved ? 'approved' : 'rejected';
  const noteHtml = reviewNote ? `<p><strong>Note from admin:</strong> ${escapeHtml(reviewNote)}</p>` : '';
  await sendEmail(
    userEmail,
    `Role Request ${approved ? 'Approved' : 'Rejected'} - SpatialDSL Studio`,
    `<h2>Role Request ${approved ? 'Approved' : 'Rejected'}</h2>
    <p>Your request for the <strong>${escapeHtml(requestedRole)}</strong> role has been <strong>${status}</strong>.</p>
    ${noteHtml}
    <p>${approved ? 'Your role has been updated. Log in to access your new permissions.' : 'You can submit a new request with additional information if needed.'}</p>
    <p><a href="${appUrl}">${appUrl}</a></p>`
  );
}

export interface AdminBroadcastEmailResult {
  batches: number;
  ccCount: number;
  bccCount: number;
  emailIds?: string[];
}

const BROADCAST_BATCH_SIZE = getPositiveIntegerEnv('ADMIN_BROADCAST_EMAIL_BATCH_SIZE', 3, 10);
const BROADCAST_BATCH_DELAY_MS = getNonNegativeIntegerEnv('ADMIN_BROADCAST_EMAIL_BATCH_DELAY_MS', 5000, 60000);

export async function sendAdminBroadcastEmail(
  subject: string,
  message: string,
  adminEmails: string[],
  userEmails: string[]
): Promise<AdminBroadcastEmailResult> {
  const uniqueAdminEmails = uniqueEmails(adminEmails);
  const uniqueUserEmails = uniqueEmails(userEmails);
  const adminEmailSet = new Set(uniqueAdminEmails.map(email => email.toLowerCase()));
  const bccEmails = uniqueUserEmails.filter(email => !adminEmailSet.has(email));
  const adminChunks = chunkEmails(uniqueAdminEmails, BROADCAST_BATCH_SIZE);
  const bccChunks = chunkEmails(bccEmails, BROADCAST_BATCH_SIZE);
  const emailIds: string[] = [];
  const escapedMessage = escapeHtml(message)
    .split(/\r?\n/)
    .map(line => line.trim() ? `<p>${line}</p>` : '<br />')
    .join('');

  const html = `<h2>${escapeHtml(subject)}</h2>
    ${escapedMessage}
    <hr />
    <p>This notification was sent by the SpatialDSL Studio administration team.</p>
    <p><a href="${appUrl}">${appUrl}</a></p>`;

  const envelopes: EmailEnvelope[] = [
    ...adminChunks.map(cc => ({ to: from, cc })),
    ...bccChunks.map(bcc => ({ to: from, bcc })),
  ];

  for (let batchIndex = 0; batchIndex < envelopes.length; batchIndex += 1) {
    const emailId = await sendEmailMessage(
      envelopes[batchIndex],
      subject,
      html
    );
    if (emailId) emailIds.push(emailId);

    if (batchIndex < envelopes.length - 1 && BROADCAST_BATCH_DELAY_MS > 0) {
      await delay(BROADCAST_BATCH_DELAY_MS);
    }
  }

  const batches = envelopes.length;

  console.log(
    `[Email] Broadcast complete: "${subject}" ${batches} batch(es), `
    + `${uniqueAdminEmails.length} admin recipient(s), ${bccEmails.length} bcc recipient(s)`
  );

  return {
    batches,
    ccCount: uniqueAdminEmails.length,
    bccCount: bccEmails.length,
    ...(emailIds.length > 0 ? { emailIds } : {}),
  };
}
