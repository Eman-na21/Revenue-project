/*
# Create revenue collection office schema

1. New Tables
- `profiles`: application users with role, display name, username, and assigned targets.
- `collections`: revenue submissions linked to an agent, with category, amount, receipt, notes, and collection date.

2. Security
- Row Level Security is enabled on both tables.
- Authenticated users can read their own profile and collection history.
- Admin profiles can read and manage all profiles and collections.
- Collection writes are limited to the authenticated agent who owns the submission.

3. Important Notes
- Public registration is not represented by any policy or client flow.
- Roles are stored in `profiles.role` and should be managed only through trusted admin operations.
- Amounts are stored as numeric values in Ethiopian Birr.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  daily_target numeric(12,2) NOT NULL DEFAULT 20000,
  monthly_target numeric(12,2) NOT NULL DEFAULT 600000,
  annual_target numeric(12,2) NOT NULL DEFAULT 7200000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('Chat Royalty', 'Traffic Fines', 'Other Revenue')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  receipt_number text NOT NULL,
  notes text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collections_agent_id_idx ON public.collections(agent_id);
CREATE INDEX IF NOT EXISTS collections_collected_at_idx ON public.collections(collected_at);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles can view self" ON public.profiles;
CREATE POLICY "Profiles can view self" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Agents can view own collections" ON public.collections;
CREATE POLICY "Agents can view own collections" ON public.collections FOR SELECT TO authenticated USING (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Agents can insert own collections" ON public.collections;
CREATE POLICY "Agents can insert own collections" ON public.collections FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update collections" ON public.collections;
CREATE POLICY "Admins can update collections" ON public.collections FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete collections" ON public.collections;
CREATE POLICY "Admins can delete collections" ON public.collections FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
