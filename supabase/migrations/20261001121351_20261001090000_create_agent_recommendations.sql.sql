/*
# Create agent performance recommendations

1. New Tables
- `agent_recommendations`: one current recommendation per field agent.
- `agent_id`: the app's field-agent identifier.
- `message`: the recommendation written by the administrator.
- `updated_at`: timestamp for the latest administrator update.

2. Security
- Row level security is enabled on the new table.
- This app uses its existing shared, local sign-in screen rather than Supabase Auth, so the anon and authenticated roles can read and update the shared recommendations.
- Separate policies are provided for SELECT, INSERT, UPDATE, and DELETE.

3. Important Notes
- Recommendations are intentionally shared between the administrator view and field-agent view.
- Each agent has at most one current recommendation, enforced by the primary key on `agent_id`.
*/

CREATE TABLE IF NOT EXISTS public.agent_recommendations (
  agent_id text PRIMARY KEY,
  message text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shared recommendations can be viewed" ON public.agent_recommendations;
CREATE POLICY "Shared recommendations can be viewed"
  ON public.agent_recommendations FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Shared recommendations can be created" ON public.agent_recommendations;
CREATE POLICY "Shared recommendations can be created"
  ON public.agent_recommendations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Shared recommendations can be updated" ON public.agent_recommendations;
CREATE POLICY "Shared recommendations can be updated"
  ON public.agent_recommendations FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Shared recommendations can be removed" ON public.agent_recommendations;
CREATE POLICY "Shared recommendations can be removed"
  ON public.agent_recommendations FOR DELETE
  TO anon, authenticated
  USING (true);
