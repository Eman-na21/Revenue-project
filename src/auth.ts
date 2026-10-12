import { supabase } from '@/supabase';

/**
 * Agents sign in with a username. Supabase Auth needs an email, so a username
 * is turned into "<username>@gmail.com" (the same pattern the existing agent accounts use). If the person types a real email
 * (anything containing "@") it is used as it is.
 * IMPORTANT: keep EMAIL_DOMAIN the same as in supabase/functions/manage-agent/index.ts
 */
export const EMAIL_DOMAIN = 'gmail.com';

export const toEmail = (input: string): string => {
  const value = input.trim().toLowerCase();
  return value.includes('@') ? value : `${value}@${EMAIL_DOMAIN}`;
};

export type ChangePasswordResult = 'ok' | 'wrong-current' | 'no-db' | 'error';

/** Checks the current password, then sets the new one in Supabase Auth. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  const sb = supabase;
  if (!sb) return 'no-db';

  const { data: userData } = await sb.auth.getUser();
  const email = userData.user?.email;
  if (!email) return 'error';

  const { error: verifyError } = await sb.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) return 'wrong-current';

  const { error } = await sb.auth.updateUser({ password: newPassword });
  return error ? 'error' : 'ok';
}