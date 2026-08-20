import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const email = 'test@example.com';
  const password = 'password123';
  
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.log('User already exists');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const id = `USR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const user = await prisma.user.create({
    data: {
      id,
      email,
      name: 'Test User',
      password: hashedPassword,
    },
  });

  console.log('User created:', user.email);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
