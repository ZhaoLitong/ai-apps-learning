// `npm run db:seed` — wipes and re-fills documents/chunks with the built-in
// knowledge base (scripts/seed-docs.ts), and creates the pgvector HNSW index.
//
// Seeding needs an embedding model (every chunk gets embedded), so it fails
// fast with a friendly message if no API key is configured. Idempotent: run
// it any number of times; it clears its own tables first. Chat history,
// memories and traces are left alone.
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { chunks, documents } from '../src/db/schema';
import { SEED_DOCS } from './seed-docs';
import { ingestDocument } from '../src/ai/rag';
import { config, isConfigured } from '../src/lib/config';

async function main() {
  if (!isConfigured()) {
    console.error(
      'Seeding embeds every chunk, so it needs an LLM API key.\n' +
        'Copy .env.example to .env, set OPENAI_API_KEY, then run `npm run db:seed` again.',
    );
    process.exit(1);
  }

  console.log(`Connecting to ${config.databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

  // Fresh slate for RAG data (chunks cascade-delete with their documents).
  await db.delete(chunks);
  await db.delete(documents);

  for (const doc of SEED_DOCS) {
    const result = await ingestDocument({ ...doc, source: 'seed' });
    console.log(`  ✓ ${doc.title} → ${result.chunkCount} chunks`);
  }

  // HNSW index for fast approximate nearest-neighbor search. drizzle-kit
  // push can't express this index type yet, so it lives here, next to the
  // data it serves. (With ~20 chunks a plain scan is faster; at 100k+ chunks
  // this index is the difference between milliseconds and seconds.)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS memories_embedding_hnsw ON memories USING hnsw (embedding vector_cosine_ops)`,
  );
  console.log('\nDone. Knowledge base ready — try the Retrieval playground.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
