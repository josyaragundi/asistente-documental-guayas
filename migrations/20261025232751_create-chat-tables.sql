CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nuevo chat' CHECK (char_length(title) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id)
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_conversation_owner_fkey
    FOREIGN KEY (conversation_id, user_id)
    REFERENCES public.conversations(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX conversations_user_updated_idx
  ON public.conversations (user_id, updated_at DESC);

CREATE INDEX messages_conversation_created_idx
  ON public.messages (conversation_id, created_at ASC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select_own
  ON public.conversations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY conversations_insert_own
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY conversations_update_own
  ON public.conversations FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY conversations_delete_own
  ON public.conversations FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY messages_select_own
  ON public.messages FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY messages_insert_own
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY messages_delete_own
  ON public.messages FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();
