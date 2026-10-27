DROP FUNCTION IF EXISTS public.match_documents(vector, INTEGER, DOUBLE PRECISION);
DROP INDEX IF EXISTS public.documents_embedding_hnsw_idx;

ALTER TABLE public.documents
  ALTER COLUMN embedding TYPE vector(1024),
  ALTER COLUMN embedding_model SET DEFAULT '@cf/baai/bge-m3';

CREATE INDEX documents_embedding_hnsw_idx
  ON public.documents USING hnsw (embedding vector_cosine_ops);

CREATE FUNCTION public.match_documents(
  query_embedding vector(1024),
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
