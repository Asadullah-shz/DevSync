import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient();

// In production, we'd handle connection pooling and disconnects here
