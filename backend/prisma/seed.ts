import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const DEMO_EMAIL = process.env.DEMO_EMAIL;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const DEMO_ROLE_RAW = process.env.DEMO_ROLE;

const DEMO_ROLE: UserRole =
  DEMO_ROLE_RAW && Object.values(UserRole).includes(DEMO_ROLE_RAW as UserRole)
    ? (DEMO_ROLE_RAW as UserRole)
    : UserRole.DSL_DESIGNER;

// Seeded accounts are pre-verified so reviewers and operators can log in
// without access to the account's mailbox.
async function seedUser(email: string, password: string, role: UserRole, label: string) {
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    const updates: { role?: UserRole; emailVerified?: boolean; password?: string } = {};
    if (existing.role !== role) updates.role = role;
    if (!existing.emailVerified) updates.emailVerified = true;
    // Keep the stored password in sync with the configured one, so the
    // documented demo/admin credentials always work even if the account
    // predates the seed or its password was changed in the app.
    const passwordMatches = await bcrypt.compare(password, existing.password);
    if (!passwordMatches) updates.password = await bcrypt.hash(password, 12);

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({
        where: { id: existing.id },
        data: updates,
      });
      console.log(`Updated ${label} user ${email}: ${Object.keys(updates).join(', ')}.`);
    } else {
      console.log(`${email} is already a verified ${role}.`);
    }
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      emailVerified: true,
    },
  });

  console.log(`Created ${label} user: ${email}`);
}

async function main() {
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    await seedUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'ADMIN', 'admin');
  } else {
    console.log('ADMIN_EMAIL or ADMIN_PASSWORD not set, skipping admin seed.');
  }

  if (DEMO_EMAIL && DEMO_PASSWORD) {
    await seedUser(DEMO_EMAIL, DEMO_PASSWORD, DEMO_ROLE, 'demo');
  } else {
    console.log('DEMO_EMAIL or DEMO_PASSWORD not set, skipping demo seed.');
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
