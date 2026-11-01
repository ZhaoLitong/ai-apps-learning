-- Runs automatically the first time the Postgres container starts.
-- pgvector is the Postgres extension that adds the `vector` column type
-- and the similarity operators (<=> etc.) used for semantic search.
CREATE EXTENSION IF NOT EXISTS vector;
