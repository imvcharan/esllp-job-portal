import 'reflect-metadata';
import { hash } from 'bcryptjs';
import { AppDataSource } from '../database/data-source';
import { User, UserRole } from '../users/user.entity';

async function bootstrapSuperadmin(): Promise<void> {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  const displayName = process.env.SUPERADMIN_NAME?.trim();
  if (!email || !password || !displayName) {
    throw new Error(
      'Set SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, and SUPERADMIN_NAME before bootstrapping.',
    );
  }
  const passwordBytes = Buffer.byteLength(password, 'utf8');
  if (password.length < 8 || passwordBytes > 72) {
    throw new Error(
      'SUPERADMIN_PASSWORD must be at least 8 characters and no more than 72 UTF-8 bytes.',
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SUPERADMIN_EMAIL must be a valid email address.');
  }

  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations();
    await AppDataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const existing = await users.findOneBy({ email });
      if (existing) {
        throw new Error(
          'That email already belongs to an account. The bootstrap command never changes or elevates existing accounts.',
        );
      }
      const existingSuperadmin = await users.findOneBy({
        role: UserRole.SUPERADMIN,
      });
      if (existingSuperadmin) {
        throw new Error(
          'A superadmin already exists. This one-time bootstrap command will not create another.',
        );
      }
      await users.save(
        users.create({
          email,
          displayName,
          passwordHash: await hash(password, 12),
          role: UserRole.SUPERADMIN,
          emailVerified: true,
          isActive: true,
        }),
      );
    });
    console.info(`Superadmin account created for ${email}.`);
  } finally {
    await AppDataSource.destroy();
  }
}

bootstrapSuperadmin().catch((error: unknown) => {
  console.error(
    'Superadmin bootstrap failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
