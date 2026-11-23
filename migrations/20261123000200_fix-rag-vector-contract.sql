-- Alinea la RPC de búsqueda con los embeddings @cf/baai/bge-m3 (1024 dimensiones).
DROP FUNCTION IF EXISTS public.match_documents(vector, integer, double precision);

CREATE FUNCTION public.match_documents(
  query_embedding vector(1024),
  match_count integer DEFAULT 5,
  match_threshold double precision DEFAULT 0.0
)
RETURNS TABLE(
  id uuid,
  content text,
  source text,
  similarity double precision,
  page_start integer,
  page_end integer,
  chunk_index integer
)
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT d.id, d.content, d.source,
    1 - (d.embedding <=> query_embedding) AS similarity,
    d.page_start, d.page_end, d.chunk_index
  FROM public.documents AS d
  WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 5);
$function$;

GRANT EXECUTE ON FUNCTION public.match_documents(vector, integer, double precision) TO authenticated;
