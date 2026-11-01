// The Drizzle client — a thin, typed wrapper over node-postgres (pg).
//
// Two things worth noticing:
//  1. The Pool is a module-level singleton. Next.js may load this module in
//     multiple server contexts (route handlers, server components), and in
//     dev with hot-reloading a fresh pool per reload would leak connections.
//     The globalThis dance below is the standard Next.js workaround.
//  2. We never query with raw strings elsewhere — everything goes through
//     drizzle's typed query builder, EXCEPT vector similarity search, where
//     we drop to raw SQL (see src/ai/rag.ts) because pgvector operators like
//     `<=>` aren't part of the builder.
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { config } from '@/lib/config';

const globalForPg = globalThis as unknown as { __aiLearningPool?: Pool };

export const pool =
  globalForPg.__aiLearningPool ??
  new Pool({
    connectionString: config.databaseUrl,
    // Learning-scale app: a small pool is plenty. Production sizing is a
    // whole topic (pooler tools like PgBouncer, serverless drivers, etc.).
    max: 5,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.__aiLearningPool = pool;
}

export const db = drizzle(pool, { schema });

export type Db = typeof db;
