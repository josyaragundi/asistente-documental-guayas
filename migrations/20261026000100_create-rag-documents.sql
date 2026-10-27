CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 1 AND 500),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  embedding_model TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, document_id, chunk_index)
);

CREATE INDEX documents_owner_source_idx
  ON public.documents (owner_id, source);

CREATE INDEX documents_embedding_hnsw_idx
  ON public.documents USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_select_own
  ON public.documents FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY documents_insert_own
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY documents_delete_own
  ON public.documents FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.documents TO authenticated;

CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 5,
  match_threshold DOUBLE PRECISION DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    d.id,
    d.content,
    d.source,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.documents AS d
  WHERE d.owner_id = (SELECT auth.uid())
    AND 1 - (d.embedding <=> query_embedding) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.match_documents(vector, INTEGER, DOUBLE PRECISION)
  TO authenticated;
