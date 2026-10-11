// Supabase Edge Function: manage-agent
// Lets the ADMIN (and only the admin) create agent logins and reset agent passwords.
// This needs the service-role key, which must never be placed in the browser app.
//
// Deploy:  supabase functions deploy manage-agent
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Keep in sync with EMAIL_DOMAIN in src/auth.ts
const EMAIL_DOMAIN = 'gmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Who is calling?
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: userData } = await caller.auth.getUser();
    if (!userData.user) return json({ error: 'Not signed in.' }, 401);

    // 2. Is the caller an active admin?
    const admin = createClient(url, serviceKey);
    const { data: me } = await admin.from('profiles').select('role, active').eq('id', userData.user.id).maybeSingle();
    if (!me || me.role !== 'admin' || me.active === false) return json({ error: 'Only the administrator can do this.' }, 403);

    const body = await req.json();

    // 3a. Create a new agent
    if (body.action === 'create') {
      const name = String(body.name ?? '').trim();
      const username = String(body.username ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const daily = Number(body.daily);

      if (!name) return json({ error: 'Full name is required.' }, 400);
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: 'Username must be 3-30 characters (a-z, 0-9, . _ -).' }, 400);
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);
      if (!Number.isFinite(daily) || daily < 0) return json({ error: 'Daily target is not valid.' }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email: `${username}@${EMAIL_DOMAIN}`,
        password,
        email_confirm: true,
        user_metadata: { username, full_name: name, daily_target: daily },
      });
      if (error || !data.user) return json({ error: error?.message ?? 'Could not create the user.' }, 400);

      // The trigger already created the profile; make sure the values are exact.
      const { error: profileError } = await admin
        .from('profiles')
        .update({ username, full_name: name, daily_target: daily, role: 'agent', active: true })
        .eq('id', data.user.id);
      if (profileError) return json({ error: profileError.message }, 400);

      return json({ id: data.user.id });
    }

    // 3b. Reset an agent's password
    if (body.action === 'reset-password') {
      const id = String(body.id ?? '');
      const password = String(body.password ?? '');
      if (!id) return json({ error: 'Agent id is missing.' }, 400);
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);

      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ id });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
