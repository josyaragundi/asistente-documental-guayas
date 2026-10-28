-- Los documentos son una base de conocimiento compartida: cualquier usuario
-- autenticado puede consultarlos, pero solo los administradores los gestionan.
DROP POLICY IF EXISTS documents_select_own_or_admin ON public.documents;
CREATE POLICY documents_select_authenticated
  ON public.documents FOR SELECT TO authenticated
  USING (true);

DROP FUNCTION IF EXISTS public.match_documents(vector, INTEGER, DOUBLE PRECISION);
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
  WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.match_documents(vector, INTEGER, DOUBLE PRECISION)
  TO authenticated;
