-- Índices compactos para filtrar antes de ordenar por distancia vectorial.
CREATE INDEX IF NOT EXISTS documents_source_idx ON public.documents (source);
CREATE INDEX IF NOT EXISTS documents_document_id_idx ON public.documents (document_id);
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_cosine_idx
  ON public.documents USING hnsw (embedding vector_cosine_ops);

-- Mantiene el contrato existente y limita la búsqueda a cinco resultados.
DROP FUNCTION IF EXISTS public.match_documents(vector, integer, double precision);
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector,
  match_count integer DEFAULT 5,
  match_threshold double precision DEFAULT 0.0
)
RETURNS TABLE(id uuid, content text, source text, similarity double precision,
              page_start integer, page_end integer, chunk_index integer)
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT d.id, d.content, d.source,
    1 - (d.embedding <=> query_embedding) AS similarity,
    d.page_start, d.page_end, d.chunk_index
  FROM public.documents d
  WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 5);
$function$;
GRANT EXECUTE ON FUNCTION public.match_documents(vector, integer, double precision) TO authenticated;
