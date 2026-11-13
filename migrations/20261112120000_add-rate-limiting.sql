CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_events_lookup_idx
  ON public.rate_limit_events (user_id, bucket, created_at DESC);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_user_id UUID,
  p_bucket TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_limit < 1 OR p_window_seconds < 1 THEN
    RETURN FALSE;
  END IF;
  DELETE FROM public.rate_limit_events
    WHERE created_at < now() - make_interval(secs => p_window_seconds * 2);
  SELECT COUNT(*) INTO current_count
    FROM public.rate_limit_events
    WHERE user_id = p_user_id
      AND bucket = p_bucket
      AND created_at >= now() - make_interval(secs => p_window_seconds);
  IF current_count >= p_limit THEN RETURN FALSE; END IF;
  INSERT INTO public.rate_limit_events (user_id, bucket) VALUES (p_user_id, p_bucket);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
