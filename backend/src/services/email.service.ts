import { Resend } from 'resend';
import config from '../config';

let resend: Resend | null = null;

if (config.resendApiKey) {
  resend = new Resend(config.resendApiKey);
}

const from = config.resendFromEmail;
const appUrl = config.appUrl;

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.log(`[Email] Skipped (no API key): "${subject}" to ${to}`);
    return;
  }
  try {
    await resend.emails.send({ from, to, subject, html });
    console.log(`[Email] Sent: "${subject}" to ${to}`);
  } catch (error) {
    console.error(`[Email] Failed: "${subject}" to ${to}`, error);
  }
}

export async function sendWelcomeEmail(email: string): Promise<void> {
  await sendEmail(
    email,
    'Welcome to SpatialDSL Studio',
    `<h2>Welcome to SpatialDSL Studio!</h2>
    <p>Your account has been created successfully.</p>
    <p>You can log in at: <a href="${appUrl}">${appUrl}</a></p>
    <p>You have been assigned the <strong>VIEWER</strong> role. To request additional permissions, use the "Request Role Upgrade" option in the application.</p>`
  );
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${appUrl}/reset-password?token=${token}`;
  await sendEmail(
    email,
    'Reset Your Password - SpatialDSL Studio',
    `<h2>Password Reset Request</h2>
    <p>You requested a password reset. Click the link below to set a new password:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
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
    <p><strong>${ownerEmail}</strong> shared a ${resourceType.toLowerCase()} with you: <strong>${resourceName}</strong></p>
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
      <p><strong>${requesterEmail}</strong> has requested a role upgrade to <strong>${requestedRole}</strong>.</p>
      <p><strong>Reason:</strong> ${reason}</p>
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
  const noteHtml = reviewNote ? `<p><strong>Note from admin:</strong> ${reviewNote}</p>` : '';
  await sendEmail(
    userEmail,
    `Role Request ${approved ? 'Approved' : 'Rejected'} - SpatialDSL Studio`,
    `<h2>Role Request ${approved ? 'Approved' : 'Rejected'}</h2>
    <p>Your request for the <strong>${requestedRole}</strong> role has been <strong>${status}</strong>.</p>
    ${noteHtml}
    <p>${approved ? 'Your role has been updated. Log in to access your new permissions.' : 'You can submit a new request with additional information if needed.'}</p>
    <p><a href="${appUrl}">${appUrl}</a></p>`
  );
}
