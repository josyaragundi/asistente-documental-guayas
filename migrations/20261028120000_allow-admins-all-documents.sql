-- Los administradores gestionan un repositorio documental compartido.
-- La función SECURITY DEFINER evita recursión al consultar app_admins desde RLS.
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_admins
    WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

DROP POLICY IF EXISTS documents_select_own ON public.documents;
CREATE POLICY documents_select_own_or_admin
  ON public.documents FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR public.is_app_admin());

DROP POLICY IF EXISTS documents_delete_own ON public.documents;
CREATE POLICY documents_delete_own_or_admin
  ON public.documents FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR public.is_app_admin());

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
  WHERE (d.owner_id = (SELECT auth.uid()) OR public.is_app_admin())
    AND 1 - (d.embedding <=> query_embedding) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.match_documents(vector, INTEGER, DOUBLE PRECISION)
  TO authenticated;
