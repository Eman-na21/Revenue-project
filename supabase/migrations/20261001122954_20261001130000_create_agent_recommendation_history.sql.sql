/*
# Create agent recommendation history table

1. New Tables
- `agent_recommendation_history`: stores every recommendation message the admin sends to a field agent, preserving full history.
- `id`: unique identifier for each recommendation entry.
- `agent_id`: the field-agent identifier this message belongs to.
- `message`: the recommendation text written by the administrator.
- `created_at`: timestamp when the recommendation was sent.

2. Security
- Row level security is enabled on the new table.
- This app uses a shared local sign-in screen rather than Supabase Auth, so the anon and authenticated roles can read and insert recommendation history.
- Separate policies for SELECT, INSERT, UPDATE, and DELETE are provided.

3. Important Notes
- Each agent can have many recommendation entries over time — the full history is preserved.
- The previous `agent_recommendations` table (single row per agent) is superseded by this table and is left untouched to avoid data loss.
*/

CREATE TABLE IF NOT EXISTS public.agent_recommendation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_recommendation_history_agent_id_idx ON public.agent_recommendation_history(agent_id);
CREATE INDEX IF NOT EXISTS agent_recommendation_history_created_at_idx ON public.agent_recommendation_history(created_at DESC);

ALTER TABLE public.agent_recommendation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recommendation history can be viewed" ON public.agent_recommendation_history;
CREATE POLICY "Recommendation history can be viewed"
  ON public.agent_recommendation_history FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Recommendation history can be created" ON public.agent_recommendation_history;
CREATE POLICY "Recommendation history can be created"
  ON public.agent_recommendation_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Recommendation history can be updated" ON public.agent_recommendation_history;
CREATE POLICY "Recommendation history can be updated"
  ON public.agent_recommendation_history FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Recommendation history can be removed" ON public.agent_recommendation_history;
CREATE POLICY "Recommendation history can be removed"
  ON public.agent_recommendation_history FOR DELETE
  TO anon, authenticated
  USING (true);
