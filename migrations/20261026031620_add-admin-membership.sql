CREATE TABLE public.app_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read own membership"
  ON public.app_admins
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.app_admins FROM anon, authenticated;
GRANT SELECT ON public.app_admins TO authenticated;

INSERT INTO public.app_admins (user_id)
VALUES ('6f102a98-b08a-40af-baca-5a9fef733f10')
ON CONFLICT (user_id) DO NOTHING;

