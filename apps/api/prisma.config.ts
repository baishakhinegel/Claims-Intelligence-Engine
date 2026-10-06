import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 reads the connection string from here (not from schema.prisma).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
