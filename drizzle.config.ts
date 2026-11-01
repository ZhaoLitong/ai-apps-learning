// Drizzle Kit reads this file for `drizzle-kit push` (npm run db:push).
// "push" diffs your TypeScript schema against the live database and applies
// the SQL — great for learning and prototyping. Real teams often graduate to
// generated migration files (`drizzle-kit generate`) so schema changes are
// reviewable and replayable in CI.
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/ai_learning',
  },
});
