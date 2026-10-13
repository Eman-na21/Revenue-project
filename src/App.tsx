import { FormEvent, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Bell, CalendarDays, Camera, Check, ClipboardCheck, ClipboardList, Download, FileText, Globe, Home, KeyRound, LogOut, Menu, MessageSquareText, MoreHorizontal, Plus, Receipt, Search, Settings2, Settings, ShieldCheck, Target, UserRound, Users, X } from 'lucide-react';
import {
  Agent, Category, Collection, Recommendation, Session, Tab, compact, etb,
  formatDayLabel, isoToday, todayISO, currentDateLabel, currentMonth, currentYear, fiscalYearLabel,
  initialsOf, normalizeCategory, normalizeRoyaltyType, bucketTotals, bucketOf, collectionLabel,
} from '@/types';
import { LangProvider, useLang } from '@/i18n';
import { AgentSettings } from '@/components/AgentSettings';
import { AdminSettings } from '@/components/AdminSettings';
import { AgentHome } from '@/components/AgentHome';
import { AgentEntry } from '@/components/AgentEntry';
import { AgentHistory } from '@/components/AgentHistory';
import { AdminRecommendations } from '@/components/AdminRecommendations';
import { supabase } from '@/supabase';
import { toEmail } from '@/auth';
import { AdminCorrections } from '@/components/AdminCorrections';
import { CORRECTION_COLUMNS, CorrectionRequest, CorrectionRow, NewCorrectionInput, rowToCorrection } from '@/corrections';
import { countReceiptPhotos, downloadReceiptsZip, receiptsInRange } from '@/receipts';
import { ReceiptButton } from '@/components/ReceiptViewer';

/* ---------- Shared normalization helpers ---------- */

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function sameAgentId(left: unknown, right: unknown): boolean {
  const a = normalizeId(left);
  const b = normalizeId(right);
  return a !== '' && b !== '' && a === b;
}

/* ---------- Database rows -> UI objects ---------- */

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
  daily_target: number | string | null;
};

type CollectionRow = {
  id: string;
  agent_id: string;
  category: unknown;
  royalty_type?: string | null;
  receipt_path?: string | null;
  receipt_paths?: string[] | null;
  amount: unknown;
  receipt_number: string | null;
  notes: string | null;
  collected_at: string | null;
  created_at: string | null;
};

type RecommendationRow = {
  id: string;
  agent_id: string;
  message: string;
  created_at: string;
};

const PROFILE_COLUMNS = 'id, username, full_name, role, active, daily_target';
const COLLECTION_COLUMNS = 'id, agent_id, category, royalty_type, receipt_path, receipt_paths, amount, receipt_number, notes, collected_at, created_at';
const RECOMMENDATION_COLUMNS = 'id, agent_id, message, created_at';

function profileToAgent(profile: ProfileRow): Agent {
  const username = String(profile.username ?? '').trim();
  const name = String(profile.full_name ?? '').trim() || username;
  const daily = Number(profile.daily_target) || 0;
  return {
    id: normalizeId(profile.id),
    name,
    username,
    daily,
    monthly: daily * 30,
    annual: daily * 365,
    active: profile.active !== false,
    avatar: initialsOf(name),
  };
}

function rowToCollection(item: CollectionRow): Collection {
  const rawDate = item.collected_at ?? item.created_at ?? '';
  return {
    id: String(item.id),
    agentId: normalizeId(item.agent_id),
    category: normalizeCategory(item.category),
    royaltyType: normalizeCategory(item.category) === 'Royalty' ? normalizeRoyaltyType(item.royalty_type) : null,
    amount: Number(item.amount) || 0,
    receipt: item.receipt_number ?? '',
    // receipt_paths is the list; receipt_path is the old single-photo column (kept as a fallback)
    receiptPaths: item.receipt_paths?.length ? item.receipt_paths : item.receipt_path ? [item.receipt_path] : [],
    notes: item.notes ?? '',
    date: String(rawDate).trim().split('T')[0],
  };
}

function rowToRecommendation(item: RecommendationRow): Recommendation {
  return {
    id: String(item.id),
    agentId: normalizeId(item.agent_id),
    message: item.message,
    createdAt: item.created_at,
  };
}

/**
 * Supabase returns at most 1000 rows per request, so read the table page by page.
 * The result is OLDEST -> NEWEST (the rest of the app calls .reverse() to show newest first).
 */
async function fetchAllCollections(sb: SupabaseClient): Promise<CollectionRow[]> {
  const pageSize = 1000;
  const rows: CollectionRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('collections')
      .select(COLLECTION_COLUMNS)
      .order('collected_at', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as CollectionRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

type SessionResult = { session: Session | null; reason?: 'inactive' | 'missing' };

/** Reads the signed-in user's profile and decides if he is an admin or an agent. */
async function buildSession(userId: string): Promise<SessionResult> {
  if (!supabase) return { session: null, reason: 'missing' };
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error || !data) return { session: null, reason: 'missing' };
  const profile = data as ProfileRow;
  if (profile.active === false) return { session: null, reason: 'inactive' };
  const agent = profileToAgent(profile);
  return {
    session: profile.role === 'admin'
      ? { role: 'admin', name: agent.name }
      : { role: 'agent', agentId: agent.id, name: agent.name },
  };
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#102a43]">
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    </div>
  );
}

function App() {
  return (
    <LangProvider>
      <AppInner />
    </LangProvider>
  );
}

function AppInner() {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);

  /* 1. Restore the saved Supabase sign-in when the app opens */
  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      setBooting(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) {
        const result = await buildSession(data.session.user.id);
        if (result.session) {
          if (!cancelled) setSession(result.session);
        } else {
          await sb.auth.signOut();
        }
      }
      if (!cancelled) setBooting(false);
    })();

    const { data: listener } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setSession(null);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  /* 2. Load agents, collections and recommendations once signed in.
        Row Level Security in the database decides what each person may read. */
  useEffect(() => {
    const sb = supabase;
    if (!session || !sb) {
      setAgents([]);
      setCollections([]);
      setRecommendations([]);
      setCorrections([]);
      setDataReady(false);
      return;
    }
    let cancelled = false;
    setDataReady(false);
    setLoadError('');

    (async () => {
      try {
        const profilesRequest = session.role === 'admin'
          ? sb.from('profiles').select(PROFILE_COLUMNS).neq('role', 'admin').order('username')
          : sb.from('profiles').select(PROFILE_COLUMNS).eq('id', session.agentId ?? '');

        const [profilesResult, collectionRows, recommendationsResult] = await Promise.all([
          profilesRequest,
          fetchAllCollections(sb),
          sb.from('recommendations').select(RECOMMENDATION_COLUMNS).order('created_at', { ascending: false }),
        ]);

        if (profilesResult.error) throw profilesResult.error;
        if (recommendationsResult.error) throw recommendationsResult.error;

        // Correction requests: if this table does not exist yet, the rest of the app still works.
        let correctionRows: CorrectionRow[] = [];
        try {
          const correctionsResult = await sb.from('correction_requests').select(CORRECTION_COLUMNS).order('created_at', { ascending: false });
          if (correctionsResult.error) console.warn('Correction requests are not available:', correctionsResult.error.message);
          else correctionRows = (correctionsResult.data ?? []) as unknown as CorrectionRow[];
        } catch (err) {
          console.warn('Correction requests are not available:', err);
        }

        if (cancelled) return;

        setAgents(((profilesResult.data ?? []) as ProfileRow[]).map(profileToAgent));
        setCollections(collectionRows.map(rowToCollection));
        setRecommendations(((recommendationsResult.data ?? []) as RecommendationRow[]).map(rowToRecommendation));
        setCorrections(correctionRows.map(rowToCorrection));
        setDataReady(true);
      } catch (err) {
        console.error('Data load error:', err);
        if (!cancelled) setLoadError((err as { message?: string })?.message ?? 'Unknown error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  /* 3. Live updates: new collections / recommendations appear without refreshing */
  useEffect(() => {
    const sb = supabase;
    if (!session || !sb) return;

    const channel = sb
      .channel('live-data')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collections' }, (payload) => {
        const row = rowToCollection(payload.new as CollectionRow);
        setCollections((current) => (current.some((item) => item.id === row.id) ? current : [...current, row]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'collections' }, (payload) => {
        const row = rowToCollection(payload.new as CollectionRow);
        setCollections((current) => current.map((item) => (item.id === row.id ? row : item)));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recommendations' }, (payload) => {
        const row = rowToRecommendation(payload.new as RecommendationRow);
        setRecommendations((current) => (current.some((item) => item.id === row.id) ? current : [row, ...current]));
      })
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [session]);

  /* 3b. Live updates for correction requests (own channel, so a missing table can never disturb the other updates) */
  useEffect(() => {
    const sb = supabase;
    if (!session || !sb) return;

    const upsert = (row: CorrectionRequest) =>
      setCorrections((current) =>
        current.some((item) => item.id === row.id) ? current.map((item) => (item.id === row.id ? row : item)) : [row, ...current],
      );

    const channel = sb
      .channel('live-corrections')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'correction_requests' }, (payload) => {
        upsert(rowToCorrection(payload.new as CorrectionRow));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'correction_requests' }, (payload) => {
        upsert(rowToCorrection(payload.new as CorrectionRow));
      })
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [session]);

  /* 4. "Today" is calculated when the page loads. If the app stays open past midnight, reload it. */
  useEffect(() => {
    const check = () => {
      if (todayISO() !== isoToday) window.location.reload();
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const handleLogin = async (userId: string): Promise<'inactive' | 'missing' | null> => {
    const result = await buildSession(userId);
    if (result.session) {
      setSession(result.session);
      return null;
    }
    await supabase?.auth.signOut();
    return result.reason ?? 'missing';
  };

  const handleLogout = async () => {
    await supabase?.auth.signOut();
    setSession(null);
  };

  /** Saves the recommendation in the database (it used to live only in the browser). Throws on failure. */
  const handleSaveRecommendation = async (recommendation: Recommendation) => {
    if (!supabase) throw new Error('Database connection is not configured.');
    const { data, error } = await supabase
      .from('recommendations')
      .insert({ agent_id: recommendation.agentId, message: recommendation.message })
      .select(RECOMMENDATION_COLUMNS)
      .single();
    if (error) throw error;
    const saved = rowToRecommendation(data as RecommendationRow);
    setRecommendations((current) => (current.some((item) => item.id === saved.id) ? current : [saved, ...current]));
  };

  /** An agent asks for a correction. The database fills in the old values and who he is. Throws on failure. */
  const handleSubmitCorrection = async (input: NewCorrectionInput) => {
    if (!supabase) throw new Error('Database connection is not configured.');
    const { data, error } = await supabase
      .from('correction_requests')
      .insert({
        collection_id: input.collectionId,
        new_category: input.category,
        new_royalty_type: input.category === 'Royalty' ? input.royaltyType : null,
        new_amount: input.amount,
        new_receipt_number: input.receipt,
        new_notes: input.notes,
        reason: input.reason,
      })
      .select(CORRECTION_COLUMNS)
      .single();
    if (error) throw error;
    const saved = rowToCorrection(data as unknown as CorrectionRow);
    setCorrections((current) => (current.some((item) => item.id === saved.id) ? current : [saved, ...current]));
  };

  /** The administrator approves (the wrong values are replaced) or rejects a request. Throws on failure. */
  const handleDecideCorrection = async (id: string, decision: 'approve' | 'reject', note: string) => {
    if (!supabase) throw new Error('Database connection is not configured.');
    const { error } = await supabase.rpc(decision === 'approve' ? 'approve_correction' : 'reject_correction', {
      p_request: id,
      p_note: note || null,
    });
    if (error) throw error;

    const { data } = await supabase.from('correction_requests').select(CORRECTION_COLUMNS).eq('id', id).single();
    if (!data) return;
    const updated = rowToCorrection(data as unknown as CorrectionRow);
    setCorrections((current) => current.map((item) => (item.id === id ? updated : item)));
    if (decision === 'approve') {
      setCollections((current) =>
        current.map((item) =>
          item.id === updated.collectionId
            ? { ...item, category: updated.newCategory, royaltyType: updated.newRoyaltyType, amount: updated.newAmount, receipt: updated.newReceipt, notes: updated.newNotes }
            : item,
        ),
      );
    }
  };

  if (booting) return <Splash />;

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#102a43] p-6 text-center text-sm text-[#bcccdc]">
        {tr(
          'Database connection is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
          'የዳታቤዝ ግንኙነት አልተዘጋጀም (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)።',
        )}
      </div>
    );
  }

  if (!session) return <Login onLogin={handleLogin} />;

  if (!dataReady) {
    if (!loadError) return <Splash />;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#102a43] p-6 text-center">
        <p className="max-w-md text-sm text-[#bcccdc]">
          {tr('Could not load data', 'መረጃውን መጫን አልተቻለም')}: {loadError}
        </p>
        <div className="flex gap-3">
          <button onClick={() => window.location.reload()} className="rounded-xl bg-[#2cb67d] px-5 py-3 text-sm font-bold text-white">
            {tr('Try again', 'እንደገና ሞክር')}
          </button>
          <button onClick={handleLogout} className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-[#bcccdc]">
            {tr('Sign out', 'ውጣ')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Shell
      session={session}
      agents={agents}
      collections={collections}
      setAgents={setAgents}
      setCollections={setCollections}
      recommendations={recommendations}
      onSaveRecommendation={handleSaveRecommendation}
      corrections={corrections}
      onSubmitCorrection={handleSubmitCorrection}
      onDecideCorrection={handleDecideCorrection}
      onLogout={handleLogout}
    />
  );
}

/* ---------- Language toggle ---------- */

function LangToggle({ dark }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'am' : 'en')}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
        dark
          ? 'border-white/20 text-[#bcccdc] hover:bg-white/10 hover:text-white'
          : 'border-[#d9e2ec] text-[#627d98] hover:bg-[#f4f7fb]'
      }`}
    >
      <Globe size={14} />
      {lang === 'en' ? 'አማ' : 'EN'}
    </button>
  );
}

/* ---------- Login (Supabase Auth) ---------- */

function Login({ onLogin }: { onLogin: (userId: string) => Promise<'inactive' | 'missing' | null> }) {
  const { t, lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || loading) return;
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: toEmail(username),
      password,
    });

    if (authError || !data.user) {
      setError(t('incorrectCredentials'));
      setLoading(false);
      return;
    }

    const problem = await onLogin(data.user.id);
    if (problem === 'inactive') {
      setError(tr('This account is inactive. Please contact the administrator.', 'ይህ መለያ ንቁ አይደለም። እባክዎ አስተዳዳሪውን ያነጋግሩ።'));
    } else if (problem) {
      setError(tr('Your profile was not found. Please contact the administrator.', 'የእርስዎ ፕሮፋይል አልተገኘም። እባክዎ አስተዳዳሪውን ያነጋግሩ።'));
    }
    setLoading(false);
  };

  const inputClass = 'w-full rounded-xl border border-[#d9e2ec] bg-[#f8fafc] px-4 py-3.5 text-sm outline-none transition focus:border-[#2cb67d] focus:ring-4 focus:ring-[#2cb67d]/10';

  return (
    <div className="min-h-screen bg-[#102a43] flex items-center justify-center p-5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-25 noise" />
      <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-[#2cb67d]/30 blur-3xl" />
      <div className="absolute -left-40 -bottom-40 h-96 w-96 rounded-full bg-[#2d7dd2]/30 blur-3xl" />
      <div className="absolute right-5 top-5">
        <LangToggle dark />
      </div>
      <div className="relative w-full max-w-[430px]">
        <div className="mb-8 flex items-center gap-3 text-white">
          <div className="h-12 w-12 rounded-2xl bg-[#2cb67d] flex items-center justify-center shadow-xl shadow-[#2cb67d]/20">
            <img src="/logo.jpg" alt={t('revenueOffice')} className="h-full w-full rounded-2xl object-cover" />
          </div>
          <div>
            <div className="font-display text-xl font-bold tracking-tight">{t('revenueOffice')}</div>
            <div className="text-xs text-[#bcccdc] tracking-[.2em] uppercase">{t('collectionControl')}</div>
          </div>
        </div>
        <div className="rounded-[28px] bg-white p-7 sm:p-9 shadow-2xl">
          {mode === 'login' ? (
            <>
              <div className="mb-8">
                <h1 className="font-display text-3xl font-bold text-[#102a43]">{t('welcomeBack')}</h1>
                <p className="mt-2 text-sm leading-6 text-[#627d98]">{t('signInDescription')}</p>
              </div>
              <form onSubmit={submit} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#334e68]">{t('usernameOrEmail')}</span>
                  <div className="relative">
                    <UserRound className="absolute left-4 top-3.5 text-[#829ab1]" size={18} />
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="username"
                      className={`${inputClass} pl-11`}
                      placeholder={t('enterUsername')}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#334e68]">{t('password')}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className={inputClass}
                    placeholder={t('enterPassword')}
                  />
                </label>
                {error && <div className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">{error}</div>}
                <button disabled={loading} className="w-full rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white transition hover:bg-[#173f61] disabled:opacity-70">
                  {loading ? t('signingIn') : t('signInToWorkspace')}
                </button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => setMode('forgot')} className="text-xs font-semibold text-[#2d7dd2] hover:underline">
                  {t('forgotPassword')}
                </button>
              </div>
              <div className="mt-7 flex items-start gap-3 border-t border-[#e9eff5] pt-5">
                <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#2cb67d]" />
                <p className="text-xs leading-5 text-[#627d98]">{t('accessManagedByAdmin')}</p>
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#eaf2fb]">
                <KeyRound size={30} className="text-[#2d7dd2]" />
              </div>
              <h1 className="font-display text-2xl font-bold text-[#102a43]">{t('forgotPasswordTitle')}</h1>
              <p className="mt-3 text-sm leading-6 text-[#627d98]">
                {tr(
                  'For security, passwords are reset by the office administrator. Please contact the administrator and ask for a new password.',
                  'ለደህንነት ሲባል የይለፍ ቃል የሚቀይረው የቢሮው አስተዳዳሪ ነው። እባክዎ አስተዳዳሪውን አነጋግረው አዲስ የይለፍ ቃል ይጠይቁ።',
                )}
              </p>
              <button onClick={() => setMode('login')} className="mt-6 w-full rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white hover:bg-[#173f61]">
                {t('backToSignIn')}
              </button>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-[#9fb3c8]">{t('revenueCollectionOffice')} · {fiscalYearLabel}</p>
      </div>
    </div>
  );
}

type ShellProps = {
  session: Session;
  agents: Agent[];
  collections: Collection[];
  setAgents: (next: Agent[] | ((current: Agent[]) => Agent[])) => void;
  setCollections: (next: Collection[] | ((current: Collection[]) => Collection[])) => void;
  recommendations: Recommendation[];
  onSaveRecommendation: (recommendation: Recommendation) => Promise<void>;
  corrections: CorrectionRequest[];
  onSubmitCorrection: (input: NewCorrectionInput) => Promise<void>;
  onDecideCorrection: (id: string, decision: 'approve' | 'reject', note: string) => Promise<void>;
  onLogout: () => void;
};

function NotificationBell({ agents, collections, isAdmin, agentId }: { agents: Agent[]; collections: Collection[]; isAdmin: boolean; agentId?: string }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const seenKey = `revenue-notifications-seen-${isAdmin ? 'admin' : agentId ?? ''}`;
  const seenCount = parseInt(localStorage.getItem(seenKey) ?? '0', 10);

  const relevant = (isAdmin ? collections : collections.filter((c) => sameAgentId(c.agentId, agentId))).slice().reverse();
  const recent = relevant.slice(0, 8);
  const unseen = Math.max(0, relevant.length - seenCount);

  const markAllRead = () => {
    localStorage.setItem(seenKey, String(relevant.length));
    setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-xl border border-[#d9e2ec] p-2.5 text-[#627d98] transition hover:bg-[#f4f7fb]">
        <Bell size={18} />
        {unseen > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e4b44c] px-1 text-[10px] font-bold text-white">{unseen > 9 ? '9+' : unseen}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-2xl border border-[#d9e2ec] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#e9eff5] px-4 py-3">
              <span className="font-display text-sm font-bold">{t('notifications')}</span>
              {unseen > 0 && <button onClick={markAllRead} className="text-xs font-bold text-[#2d7dd2] hover:underline">{t('markAllRead')}</button>}
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar">
              {recent.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#829ab1]">{t('noNotifications')}</div>
              ) : recent.map((item, index) => {
                const agent = agents.find((a) => sameAgentId(a.id, item.agentId));
                const style = bucketOf(item);
                const isNew = index < unseen;
                return (
                  <div key={item.id} className={`flex items-start gap-3 border-b border-[#f0f4f8] px-4 py-3 last:border-0 ${isNew ? 'bg-[#f8fbff]' : ''}`}>
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.bg} ${style.text}`}><Receipt size={15} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{agent?.name ?? t('agent')}</div>
                      <div className="mt-0.5 text-xs text-[#627d98]">{t('newCollection')} · {collectionLabel(item, lang)}</div>
                      <div className="mt-0.5 text-xs text-[#829ab1]">{formatDayLabel(item.date)} · {etb(item.amount)}</div>
                    </div>
                    {isNew && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e4b44c]" />}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Shell({ session, agents, collections, setAgents, setCollections, recommendations, onSaveRecommendation, corrections, onSubmitCorrection, onDecideCorrection, onLogout }: ShellProps) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<Tab>(session.role === 'admin' ? 'overview' : 'entry');
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = session.role === 'admin';
  const pendingCount = corrections.filter((request) => request.status === 'pending').length;

  const adminNav: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'overview', label: t('overview'), icon: BarChart3 },
    { id: 'agents', label: t('fieldAgents'), icon: Users },
    { id: 'reports', label: t('monthlyReports'), icon: FileText },
    { id: 'recommendations', label: t('recommendations'), icon: MessageSquareText },
    { id: 'corrections', label: lang === 'am' ? 'የእርማት ጥያቄዎች' : 'Corrections', icon: ClipboardCheck },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];
  const agentNav: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'entry', label: t('home'), icon: Home },
    { id: 'collect', label: t('newRecord'), icon: Receipt },
    { id: 'history', label: t('history'), icon: ClipboardList },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];
  const nav = isAdmin ? adminNav : agentNav;
  const go = (next: Tab) => { setTab(next); setMobileOpen(false); };

  const currentAgent = agents.find((a) => sameAgentId(a.id, session.agentId)) ?? agents[0];

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#102a43]">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col bg-[#102a43] px-5 py-6 text-white transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2cb67d]">
            <img src="/logo.jpg" alt={t('revenueOffice')} className="h-full w-full rounded-xl object-cover" />
          </div>
          <div>
            <div className="font-display font-bold">{t('revenueOffice')}</div>
            <div className="text-[10px] uppercase tracking-[.2em] text-[#9fb3c8]">{t('controlCenter')}</div>
          </div>
        </div>
        <div className="mt-12 flex-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#829ab1]">{t('workspace')}</div>
          <div className="mt-3 space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} onClick={() => go(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${tab === item.id ? 'bg-white/12 text-white' : 'text-[#bcccdc] hover:bg-white/6 hover:text-white'}`}>
                  <Icon size={18} /> {item.label}
                  {item.id === 'corrections' && pendingCount > 0 && (
                    <span className="ml-auto rounded-full bg-[#e4b44c] px-2 py-0.5 text-[11px] font-bold text-[#102a43]">{pendingCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-t border-white/10 pt-5">
          <div className="mb-4 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e4b44c] text-xs font-bold text-[#102a43]">
              {session.name.split(' ').map((x) => x[0]).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{session.name}</div>
              <div className="text-xs capitalize text-[#9fb3c8]">{isAdmin ? t('administrator') : t('fieldAgent')}</div>
            </div>
            <LangToggle dark />
          </div>
          <button onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#bcccdc] hover:bg-white/6 hover:text-white">
            <LogOut size={17} /> {t('signOut')}
          </button>
        </div>
      </aside>

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-[#d9e2ec] bg-white/90 px-5 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-[#f0f4f8] lg:hidden">
              <Menu size={21} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#829ab1]">{currentDateLabel}</p>
              <h2 className="font-display text-lg font-bold text-[#102a43]">
                {isAdmin ? t('officeOverview') : `${t('goodMorning')}, ${session.name.split(' ')[0]}`}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell agents={agents} collections={collections} isAdmin={isAdmin} agentId={session.agentId} />
            <div className="hidden h-8 w-px bg-[#d9e2ec] sm:block" />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{session.name}</div>
              <div className="text-xs text-[#829ab1]">{isAdmin ? t('administrator') : t('fieldAgent')}</div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1100px] p-5 pb-28 sm:p-8 lg:pb-8">
          {isAdmin && pendingCount > 0 && tab !== 'corrections' && (
            <button
              onClick={() => go('corrections')}
              className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e4b44c]/50 bg-[#fff9e8] px-5 py-4 text-left text-sm font-bold text-[#8b650b] transition hover:bg-[#fff3d1]"
            >
              <span>
                {lang === 'am'
                  ? `${pendingCount} የእርማት ጥያቄ ማጽደቅዎን እየጠበቀ ነው`
                  : `${pendingCount} correction request${pendingCount === 1 ? ' is' : 's are'} waiting for your approval`}
              </span>
              <span aria-hidden="true">→</span>
            </button>
          )}
          {isAdmin ? (
            tab === 'overview' ? (
              <AdminOverview agents={agents} collections={collections} onNavigate={go} />
            ) : tab === 'agents' ? (
              <AgentManagement agents={agents} setAgents={setAgents} collections={collections} />
            ) : tab === 'corrections' ? (
              <AdminCorrections agents={agents} collections={collections} corrections={corrections} onDecide={onDecideCorrection} />
            ) : tab === 'recommendations' ? (
              <AdminRecommendations agents={agents} collections={collections} recommendations={recommendations} onSave={onSaveRecommendation} />
            ) : tab === 'settings' ? (
              <AdminSettings name={session.name} onLogout={onLogout} />
            ) : (
              <Reports agents={agents} collections={collections} />
            )
          ) : tab === 'entry' ? (
            <AgentHome agent={currentAgent} collections={collections} recommendations={recommendations.filter((item) => sameAgentId(item.agentId, currentAgent.id))} onNavigate={go} />
          ) : tab === 'collect' ? (
            <AgentEntry agent={currentAgent} collections={collections} setCollections={setCollections} onDone={() => go('history')} />
          ) : tab === 'settings' ? (
            <AgentSettings agent={currentAgent} onLogout={onLogout} />
          ) : (
            <AgentHistory agent={currentAgent} collections={collections} corrections={corrections.filter((request) => sameAgentId(request.agentId, currentAgent.id))} onSubmitCorrection={onSubmitCorrection} />
          )}
        </main>
      </div>

      {!isAdmin && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-[#d9e2ec] bg-white/95 px-2 py-2 backdrop-blur lg:hidden">
          {agentNav.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button key={item.id} onClick={() => go(item.id)} className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition ${active ? 'text-[#2cb67d]' : 'text-[#829ab1]'}`}>
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[11px] font-bold">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/* ---------- Shared UI helpers ---------- */

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#2cb67d]">{eyebrow}</div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#102a43]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#627d98]">{description}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, change, tone, icon }: { label: string; value: string; change: string; tone: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          {icon}
        </div>
        <div className="text-xs font-semibold text-[#829ab1]">{change}</div>
      </div>
      <div className="mt-5 text-xs font-semibold text-[#829ab1]">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tracking-tight text-[#102a43]">{value}</div>
    </div>
  );
}

/* ---------- Admin Overview ---------- */

function AdminOverview({ agents, collections, onNavigate }: { agents: Agent[]; collections: Collection[]; onNavigate: (tab: Tab) => void }) {
  const { t, lang } = useLang();
  const todayTotal = collections.filter((item) => item.date === isoToday).reduce((sum, item) => sum + item.amount, 0);
  const monthTotal = collections.filter((item) => item.date.startsWith(currentMonth)).reduce((sum, item) => sum + item.amount, 0);
  const yearTotal = collections.filter((item) => item.date.startsWith(currentYear)).reduce((sum, item) => sum + item.amount, 0);
  const allTimeTotal = collections.reduce((sum, item) => sum + item.amount, 0);
  const categoryData = bucketTotals(collections).map(({ bucket, amount }) => ({
    name: lang === 'am' ? bucket.am : bucket.en,
    value: amount,
    hex: bucket.hex,
  }));
  const chartData = agents.map((agent) => ({
    id: agent.id,
    name: agent.name.split(' ')[0],
    target: agent.daily,
    actual: collections.filter((item) => sameAgentId(item.agentId, agent.id) && item.date === isoToday).reduce((sum, item) => sum + item.amount, 0),
  }));

  return (
    <>
      <PageTitle eyebrow={t('executiveSummary')} title={t('collectionPerformance')} description={t('liveViewDescription')}
        action={<button onClick={() => onNavigate('reports')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102a43] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#173f61]"><FileText size={17} /> {t('generateReport')}</button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('collectedToday')} value={etb(todayTotal)} change={t('today')} tone="bg-[#e5f6ef] text-[#157a56]" icon={<Receipt size={20} />} />
        <StatCard label={t('thisMonth')} value={etb(monthTotal)} change={currentMonth} tone="bg-[#eaf2fb] text-[#2d7dd2]" icon={<CalendarDays size={20} />} />
        <StatCard label={t('thisYear')} value={etb(yearTotal)} change={currentYear} tone="bg-[#fff5dc] text-[#a36b05]" icon={<Target size={20} />} />
        <StatCard label={t('activeAgents')} value={`${agents.filter((item) => item.active).length} / ${agents.length}`} change={t('all')} tone="bg-[#f1edff] text-[#6f5acb]" icon={<Users size={20} />} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold">{t('dailyAgentPerformance')}</h3>
              <p className="mt-1 text-xs text-[#829ab1]">{t('actualVsTarget')}</p>
            </div>
            <button onClick={() => onNavigate('agents')} className="text-xs font-bold text-[#2d7dd2]">{t('viewAllAgents')}</button>
          </div>
          <div className="mt-6 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid stroke="#e9eff5" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#829ab1', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#829ab1', fontSize: 11 }} tickFormatter={compact} />
                <Tooltip formatter={(v) => etb(Number(v))} contentStyle={{ border: '1px solid #d9e2ec', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="target" radius={[5, 5, 0, 0]} name={t('dailyTarget')}>
                  {chartData.map((entry) => (
                    <Cell key={`target-${entry.id}`} fill="#2cb67d" />
                  ))}
                </Bar>
                <Bar dataKey="actual" radius={[5, 5, 0, 0]} name={t('totalCollected')}>
                  {chartData.map((entry) => {
                    const performance = entry.target > 0
                      ? (entry.actual / entry.target) * 100
                      : 0;
                    const fill = performance >= 50 ? '#e4b44c' : '#c0392b';
                    return <Cell key={`actual-${entry.id}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-center gap-5 text-xs text-[#627d98]">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#2cb67d]" />{t('dailyTarget')}</span>
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#e4b44c]" />≥ 50%</span>
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#c0392b]" />&lt; 50%</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 sm:p-6">
          <h3 className="font-display font-bold">{t('revenueByCategory')}</h3>
          <p className="mt-1 text-xs text-[#829ab1]">{t('currentReportingPeriod')}</p>
          <div className="relative mt-4 h-[205px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={86} paddingAngle={4}>
                  {categoryData.map((item) => <Cell key={item.name} fill={item.hex} />)}
                </Pie>
                <Tooltip formatter={(v) => etb(Number(v))} contentStyle={{ border: '1px solid #d9e2ec', borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-xl font-bold">{etb(allTimeTotal)}</span>
              <span className="text-[10px] uppercase tracking-wider text-[#829ab1]">{t('total')}</span>
            </div>
          </div>
          <div className="space-y-3">
            {categoryData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-[#627d98]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.hex }} />
                  {item.name}
                </span>
                <span className="font-semibold">{etb(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-[#d9e2ec] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold">{t('recentCollectionActivity')}</h3>
            <p className="mt-1 text-xs text-[#829ab1]">{t('latestSubmissions')}</p>
          </div>
          <button onClick={() => onNavigate('agents')} className="rounded-lg p-2 text-[#829ab1] hover:bg-[#f4f7fb]"><MoreHorizontal size={19} /></button>
        </div>
        <div className="mt-4 overflow-x-auto scrollbar">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-[#e9eff5] text-xs text-[#829ab1]">
              <tr>
                <th className="pb-3 font-semibold">{t('agent')}</th>
                <th className="pb-3 font-semibold">{t('category')}</th>
                <th className="pb-3 font-semibold">{t('receipt')}</th>
                <th className="pb-3 text-right font-semibold">{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 && (<tr><td colSpan={4} className="py-12 text-center text-sm text-[#829ab1]">{t('noCollectionsYet')}</td></tr>)}
              {collections.slice().reverse().slice(0, 5).map((item) => {
                const agent = agents.find((a) => sameAgentId(a.id, item.agentId));
                const style = bucketOf(item);
                return (
                  <tr key={item.id} className="border-b border-[#f0f4f8] last:border-0">
                    <td className="py-3.5 font-semibold">{agent?.name}</td>
                    <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>{collectionLabel(item, lang)}</span></td>
                    <td className="py-3.5 text-[#627d98]">{item.receipt}<ReceiptButton paths={item.receiptPaths} /></td>
                    <td className="py-3.5 text-right font-bold">{etb(item.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ---------- Agent Management ---------- */

/** Calls the admin-only edge function (needed for creating logins / resetting passwords). */
async function callManageAgent(body: Record<string, unknown>): Promise<{ id?: string; error?: string }> {
  if (!supabase) return { error: 'Database connection is not configured.' };
  const { data, error } = await supabase.functions.invoke('manage-agent', { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const parsed = await context.json();
        if (parsed?.error) message = String(parsed.error);
      } catch {
        /* keep the default message */
      }
    }
    return { error: message };
  }
  if (data?.error) return { error: String(data.error) };
  return { id: data?.id as string | undefined };
}

function AgentManagement({ agents, setAgents, collections }: { agents: Agent[]; setAgents: (next: Agent[] | ((current: Agent[]) => Agent[])) => void; collections: Collection[] }) {
  const { t, lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Agent | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const query = search.trim().toLowerCase();
  const visible = agents.filter((a) => a.name.toLowerCase().includes(query) || a.username.toLowerCase().includes(query));

  const closeEdit = () => {
    setEditing(null);
    setDraft(null);
    setNewPassword('');
    setSaveError('');
  };

  const save = async () => {
    if (!draft || saving) return;

    if (!supabase) {
      setSaveError('Database connection is not configured.');
      return;
    }

    const name = draft.name.trim();
    const dailyTarget = Number(draft.daily);
    if (!name) {
      setSaveError(tr('Full name is required.', 'ሙሉ ስም ያስፈልጋል።'));
      return;
    }
    if (!Number.isFinite(dailyTarget) || dailyTarget < 0) {
      setSaveError(tr('Please enter a valid daily target.', 'ትክክለኛ ዕለታዊ ኢላማ ያስገቡ።'));
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setSaveError(t('passwordTooShort'));
      return;
    }

    setSaving(true);
    setSaveError('');

    // The database is updated first; the screen changes only if that succeeds.
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name, daily_target: dailyTarget, active: draft.active })
      .eq('id', draft.id);

    if (error) {
      console.error('Agent profile update error:', error);
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    if (newPassword) {
      const result = await callManageAgent({ action: 'reset-password', id: draft.id, password: newPassword });
      if (result.error) {
        setSaveError(`${tr('Saved, but the password was not changed', 'ተቀምጧል፣ ግን የይለፍ ቃሉ አልተቀየረም')}: ${result.error}`);
        setSaving(false);
        setAgents((current) => current.map((a) => (a.id === draft.id ? { ...draft, name, daily: dailyTarget, monthly: dailyTarget * 30, annual: dailyTarget * 365, avatar: initialsOf(name) } : a)));
        return;
      }
    }

    const savedDraft: Agent = {
      ...draft,
      name,
      avatar: initialsOf(name),
      daily: dailyTarget,
      monthly: dailyTarget * 30,
      annual: dailyTarget * 365,
    };

    setAgents((current) => current.map((a) => (a.id === savedDraft.id ? savedDraft : a)));
    setSaving(false);
    closeEdit();
  };

  return (
    <>
      <PageTitle eyebrow={t('officeControl')} title={t('fieldAgents')} description={t('manageAgentsDescription')}
        action={<button onClick={() => setShowAdd(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2cb67d] px-4 py-3 text-sm font-bold text-white hover:bg-[#239b68]"><Plus size={17} /> {t('addAgent')}</button>} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3.5 top-3.5 text-[#829ab1]" size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchAgents')} className="input pl-10" />
        </div>
        <div className="rounded-xl border border-[#d9e2ec] bg-white px-4 py-3 text-sm text-[#627d98]">
          <Users size={16} className="mr-2 inline text-[#2cb67d]" /> {agents.length} {t('totalAgents')}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#d9e2ec] bg-white">
        <div className="overflow-x-auto scrollbar">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#f8fafc] text-xs text-[#829ab1]">
              <tr>
                <th className="px-5 py-4 font-semibold">{t('agent')}</th>
                <th className="px-5 py-4 font-semibold">{t('status')}</th>
                <th className="px-5 py-4 font-semibold">{t('dailyTarget')}</th>
                <th className="px-5 py-4 font-semibold">{t('todayCollected')}</th>
                <th className="px-5 py-4 font-semibold">{t('achievement')}</th>
                <th className="px-5 py-4 text-right font-semibold">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((agent) => {
                const actual = collections.filter((c) => sameAgentId(c.agentId, agent.id) && c.date === isoToday).reduce((s, c) => s + c.amount, 0);
                const percent = agent.daily > 0 ? Math.min(100, Math.round((actual / agent.daily) * 100)) : 0;
                return (
                  <tr key={agent.id} className="border-t border-[#e9eff5]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf2fb] text-xs font-bold text-[#2d7dd2]">{agent.avatar}</div>
                        <div>
                          <div className="font-semibold">{agent.name}</div>
                          <div className="text-xs text-[#829ab1]">@{agent.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${agent.active ? 'bg-[#e5f6ef] text-[#157a56]' : 'bg-[#f0f4f8] text-[#829ab1]'}`}>
                        {agent.active ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold">{etb(agent.daily)}</td>
                    <td className="px-5 py-4 font-semibold">{etb(actual)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-[#e9eff5]">
                          <div className="h-full rounded-full bg-[#2cb67d]" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-xs font-bold">{percent}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(agent.id); setDraft({ ...agent }); setNewPassword(''); setSaveError(''); }} className="rounded-lg p-2 text-[#627d98] hover:bg-[#f4f7fb]"><Settings2 size={17} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showAdd && <AddAgentModal onClose={() => setShowAdd(false)} onAdd={(agent) => { setAgents((current) => [...current, agent]); setShowAdd(false); }} />}
      {editing && draft && (
        <EditAgentModal
          draft={draft}
          setDraft={setDraft}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          saving={saving}
          error={saveError}
          onClose={closeEdit}
          onSave={save}
        />
      )}
    </>
  );
}

function AddAgentModal({ onClose, onAdd }: { onClose: () => void; onAdd: (agent: Agent) => void }) {
  const { t, lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [daily, setDaily] = useState('20000');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    const dailyNum = Number(daily);

    if (!/^[a-z0-9._-]{3,30}$/.test(cleanUsername)) {
      setError(tr('Username must be 3–30 characters: letters (a–z), numbers, . _ -', 'የተጠቃሚ ስም 3–30 ቁምፊ መሆን አለበት፦ ፊደል (a–z)፣ ቁጥር፣ . _ -'));
      return;
    }
    if (password.length < 6) {
      setError(t('passwordTooShort'));
      return;
    }
    if (!Number.isFinite(dailyNum) || dailyNum < 0) {
      setError(tr('Please enter a valid daily target.', 'ትክክለኛ ዕለታዊ ኢላማ ያስገቡ።'));
      return;
    }

    setBusy(true);
    setError('');
    const result = await callManageAgent({ action: 'create', name: cleanName, username: cleanUsername, password, daily: dailyNum });
    setBusy(false);

    if (result.error || !result.id) {
      setError(result.error ?? tr('Could not create the agent.', 'ወኪሉን መፍጠር አልተቻለም።'));
      return;
    }

    onAdd({
      id: result.id,
      name: cleanName,
      username: cleanUsername,
      daily: dailyNum,
      monthly: dailyNum * 30,
      annual: dailyNum * 365,
      active: true,
      avatar: initialsOf(cleanName),
    });
  };

  return (
    <Modal title={t('addFieldAgent')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('fullName')}><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Eden Kebede" /></Field>
        <Field label={t('username')}><input required value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" className="input" placeholder="e.g. eden" /></Field>
        <Field label={t('temporaryPassword')}><input required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder={t('setInitialPassword')} /></Field>
        <Field label={t('dailyTargetETB')}><input required type="number" min="0" value={daily} onChange={(e) => setDaily(e.target.value)} className="input" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-[#f4f7fb] px-4 py-3">
            <div className="text-xs font-semibold text-[#829ab1]">{t('monthlyTargetETB')}</div>
            <div className="mt-1 font-display font-bold text-[#102a43]">{etb(Number(daily) * 30)}</div>
          </div>
          <div className="rounded-xl bg-[#f4f7fb] px-4 py-3">
            <div className="text-xs font-semibold text-[#829ab1]">{t('annualTargetETB')}</div>
            <div className="mt-1 font-display font-bold text-[#102a43]">{etb(Number(daily) * 365)}</div>
          </div>
        </div>
        <p className="rounded-xl bg-[#eaf2fb] p-3 text-xs leading-5 text-[#2d7dd2]">{t('autoCalculatedHint')}</p>
        <p className="rounded-xl bg-[#fff5dc] p-3 text-xs leading-5 text-[#8b650b]">{t('tempPasswordHint')}</p>
        {error && <div className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">{error}</div>}
        <button disabled={busy} className="w-full rounded-xl bg-[#2cb67d] py-3.5 text-sm font-bold text-white disabled:opacity-70">
          {busy ? t('saving') : t('createAgent')}
        </button>
      </form>
    </Modal>
  );
}

function EditAgentModal({ draft, setDraft, newPassword, setNewPassword, saving, error, onClose, onSave }: {
  draft: Agent;
  setDraft: (agent: Agent) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t, lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);
  return (
    <Modal title={t('manageAgent')} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t('fullName')}><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" /></Field>
        <Field label={t('dailyTargetETB')}><input type="number" min="0" value={draft.daily} onChange={(e) => { const d = Number(e.target.value); setDraft({ ...draft, daily: d, monthly: d * 30, annual: d * 365 }); }} className="input" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-[#f4f7fb] px-4 py-3">
            <div className="text-xs font-semibold text-[#829ab1]">{t('monthlyTargetETB')}</div>
            <div className="mt-1 font-display font-bold text-[#102a43]">{etb(draft.monthly)}</div>
          </div>
          <div className="rounded-xl bg-[#f4f7fb] px-4 py-3">
            <div className="text-xs font-semibold text-[#829ab1]">{t('annualTargetETB')}</div>
            <div className="mt-1 font-display font-bold text-[#102a43]">{etb(draft.annual)}</div>
          </div>
        </div>

        <Field label={`${t('newPassword')} (${tr('optional', 'አማራጭ')})`}>
          <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder={tr('Leave empty to keep the current password', 'አሁን ያለውን ለማቆየት ባዶ ይተዉ')} />
        </Field>

        <div className="flex items-center justify-between rounded-xl border border-[#d9e2ec] p-4">
          <div>
            <div className="text-sm font-semibold">{t('accountStatus')}</div>
            <div className="text-xs text-[#829ab1]">{t('allowSignIn')}</div>
          </div>
          <button type="button" onClick={() => setDraft({ ...draft, active: !draft.active })} className={`h-6 w-11 rounded-full p-1 transition ${draft.active ? 'bg-[#2cb67d]' : 'bg-[#bcccdc]'}`}>
            <span className={`block h-4 w-4 rounded-full bg-white transition ${draft.active ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        {error && <div className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">{error}</div>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[#d9e2ec] py-3 text-sm font-bold text-[#627d98]">{t('cancel')}</button>
          <button onClick={onSave} disabled={saving} className="flex-1 rounded-xl bg-[#102a43] py-3 text-sm font-bold text-white disabled:opacity-70">{saving ? t('saving') : t('saveChanges')}</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#102a43]/40 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="relative flex max-h-[100vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl animate-slide-up">
        <div className="flex shrink-0 items-center justify-between border-b border-[#e9eff5] p-6">
          <h3 className="font-display text-xl font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-2 text-[#829ab1] hover:bg-[#f4f7fb]"><X size={19} /></button>
        </div>
        <div className="overflow-y-auto scrollbar p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

/* ---------- Reports ---------- */

/**
 * Exports all collection records in the selected date range as an
 * Excel-compatible .xls workbook. This intentionally uses browser APIs
 * only, so no extra npm package is required.
 */
function downloadAllAgentsExcel(
  agents: Agent[],
  collections: Collection[],
  rangeStart: string,
  rangeEnd: string,
) {
  const cleanDate = (value: unknown) =>
    String(value ?? '').trim().split('T')[0].slice(0, 10);

  const escapeCell = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const money = (value: number) => Math.round(Number(value) || 0);
  const percentValue = (actual: number, plan: number) =>
    plan > 0 ? (actual / plan) * 100 : 0;
  const percent = (actual: number, plan: number) =>
    plan > 0 ? `${Math.round(percentValue(actual, plan))}%` : '—';

  const startDate = new Date(`${rangeStart}T00:00:00`);
  const endDate = new Date(`${rangeEnd}T00:00:00`);
  const dayCount =
    Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())
      ? 0
      : Math.max(
          1,
          Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1,
        );

  // Only collections inside the selected From/To dates are included.
  const filtered = collections.filter((row) => {
    const date = cleanDate(row.date);
    return date >= rangeStart && date <= rangeEnd;
  });

  const categoryTotal = (agent: Agent, category: Category) =>
    filtered
      .filter(
        (row) =>
          sameAgentId(row.agentId, agent.id) &&
          normalizeCategory(row.category) === category,
      )
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const reportRows = agents.map((agent) => {
    const chat = categoryTotal(agent, 'Chat');
    const royalty = categoryTotal(agent, 'Royalty');
    const other = categoryTotal(agent, 'Other Revenue');
    const totalActual = chat + royalty + other;

    // Plan comes from the agent's configured DAILY TARGET.
    // Total Plan = daily target × number of selected days.
    const dailyPlan = money(Number(agent.daily) || 0);
    const totalPlan = money(dailyPlan * dayCount);

    return {
      agent,
      dailyPlan,
      chat,
      royalty,
      other,
      totalActual,
      totalPlan,
      chatPercent: percentValue(chat, dailyPlan),
      royaltyPercent: percentValue(royalty, dailyPlan),
      otherPercent: percentValue(other, dailyPlan),
      totalPercentValue: percentValue(totalActual, totalPlan),
      chatDisplay: percent(chat, dailyPlan),
      royaltyDisplay: percent(royalty, dailyPlan),
      otherDisplay: percent(other, dailyPlan),
      totalDisplay: percent(totalActual, totalPlan),
    };
  });

  
  const createRankMap = (
    percentageKey:
      | 'chatPercent'
      | 'royaltyPercent'
      | 'otherPercent'
      | 'totalPercentValue',
    amountKey: 'chat' | 'royalty' | 'other' | 'totalActual',
  ) => {
    const ranked = [...reportRows].sort(
      (a, b) =>
        b[percentageKey] - a[percentageKey] ||
        b[amountKey] - a[amountKey] ||
        a.agent.name.localeCompare(b.agent.name),
    );

    const rankMap = new Map<string, number>();
    ranked.forEach((row, index) => {
      rankMap.set(normalizeId(row.agent.id), index + 1);
    });
    return rankMap;
  };

  const chatRankMap = createRankMap('chatPercent', 'chat');
  const royaltyRankMap = createRankMap('royaltyPercent', 'royalty');
  const otherRankMap = createRankMap('otherPercent', 'other');
  const totalRankMap = createRankMap('totalPercentValue', 'totalActual');

  const bodyRows = reportRows
    .map(
      (row) => `
      <tr>
        <td class="agent">${escapeCell(row.agent.name)}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.chat)}</td>
        <td class="number">${row.chatDisplay}</td>
        <td class="rank">${chatRankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.royalty)}</td>
        <td class="number">${row.royaltyDisplay}</td>
        <td class="rank">${royaltyRankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.other)}</td>
        <td class="number">${row.otherDisplay}</td>
        <td class="rank">${otherRankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>

        <td class="number">${money(row.totalPlan)}</td>
        <td class="number">${money(row.totalActual)}</td>
        <td class="number">${row.totalDisplay}</td>
        <td class="rank">${totalRankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>
      </tr>
    `,
    )
    .join('');

  const totalDailyPlan = reportRows.reduce(
    (sum, row) => sum + row.dailyPlan,
    0,
  );
  const totalPlan = reportRows.reduce((sum, row) => sum + row.totalPlan, 0);
  const totalChat = reportRows.reduce((sum, row) => sum + row.chat, 0);
  const totalRoyalty = reportRows.reduce(
    (sum, row) => sum + row.royalty,
    0,
  );
  const totalOther = reportRows.reduce((sum, row) => sum + row.other, 0);
  const grandTotal = totalChat + totalRoyalty + totalOther;

  // Royalty split: Forest vs Sand (old records without a type go to "Not specified")
  const royaltyOf = (agent: Agent, type: 'forest' | 'sand' | 'unspecified') =>
    filtered
      .filter(
        (row) =>
          sameAgentId(row.agentId, agent.id) &&
          normalizeCategory(row.category) === 'Royalty' &&
          (type === 'unspecified' ? !row.royaltyType : row.royaltyType === type),
      )
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const royaltyRows = agents.map((agent) => {
    const forest = royaltyOf(agent, 'forest');
    const sand = royaltyOf(agent, 'sand');
    const unspecified = royaltyOf(agent, 'unspecified');
    return { name: agent.name, forest, sand, unspecified, total: forest + sand + unspecified };
  });
  const showUnspecified = royaltyRows.some((row) => row.unspecified > 0);
  const royaltyBody = royaltyRows
    .map(
      (row) => `
      <tr>
        <td class="agent">${escapeCell(row.name)}</td>
        <td class="number">${money(row.forest)}</td>
        <td class="number">${money(row.sand)}</td>
        ${showUnspecified ? `<td class="number">${money(row.unspecified)}</td>` : ''}
        <td class="number">${money(row.total)}</td>
      </tr>`,
    )
    .join('');
  const royaltySum = (key: 'forest' | 'sand' | 'unspecified' | 'total') =>
    money(royaltyRows.reduce((sum, row) => sum + row[key], 0));

 
  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Calibri, Arial, sans-serif;
            color: #000000;
            margin: 18px;
          }

          .title {
            font-size: 16pt;
            font-weight: bold;
            text-align: center;
            padding: 4px;
          }

          .subtitle {
            font-size: 14pt;
            font-weight: bold;
            text-align: center;
            padding: 4px;
          }

          .period {
            font-size: 12pt;
            text-align: center;
            padding: 4px 4px 12px;
          }

          table {
            border-collapse: collapse;
            width: 100%;
            min-width: 1500px;
            font-family: Calibri, Arial, sans-serif;
          }

          th, td {
            border: 1px solid #000000;
            padding: 7px 8px;
            white-space: nowrap;
            font-size: 11pt;
          }

          th {
            background: #D3D3D3;
            color: #000000;
            font-weight: bold;
            text-align: center;
            vertical-align: middle;
          }

          .group {
            background: #D3D3D3;
            font-weight: bold;
            text-align: center;
          }

          .subhead {
            background: #D3D3D3;
            font-weight: bold;
            text-align: center;
          }

          .agent {
            text-align: left;
          }

          .number {
            text-align: right;
          }

          .rank {
            text-align: center;
            font-weight: bold;
          }

          .total td {
            font-weight: bold;
            background: #FFFFFF;
          }

          .footer {
            margin-top: 12px;
            font-size: 11pt;
            text-align: left;
          }
        </style>
      </head>

      <body>
        <div class="title">Kalu Revenue Collection Office</div>
        <div class="subtitle">Agent Collection Performance Report</div>
        <div class="period">
          Selected Date: ${escapeCell(rangeStart)} to ${escapeCell(rangeEnd)}
          &nbsp; | &nbsp; ${dayCount} day${dayCount === 1 ? '' : 's'}
        </div>

        <table>
          <thead>
            <tr>
              <th rowspan="2">Name of Agents</th>
              <th class="group" colspan="4">Chat</th>
              <th class="group" colspan="4">Royalty</th>
              <th class="group" colspan="4">Other Revenue</th>
              <th class="group" colspan="4">Total</th>
            </tr>
            <tr>
              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
              <th class="subhead">Rank</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
              <th class="subhead">Rank</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
              <th class="subhead">Rank</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
              <th class="subhead">Rank</th>
            </tr>
          </thead>

          <tbody>
            ${
              bodyRows ||
              `<tr><td colspan="17">No agents found.</td></tr>`
            }

            <tr class="total">
              <td>TOTAL</td>

              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalChat)}</td>
              <td class="number">${percent(totalChat, totalDailyPlan)}</td>
              <td class="rank">—</td>

              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalRoyalty)}</td>
              <td class="number">${percent(totalRoyalty, totalDailyPlan)}</td>
              <td class="rank">—</td>

              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalOther)}</td>
              <td class="number">${percent(totalOther, totalDailyPlan)}</td>
              <td class="rank">—</td>

              <td class="number">${money(totalPlan)}</td>
              <td class="number">${money(grandTotal)}</td>
              <td class="number">${percent(grandTotal, totalPlan)}</td>
              <td class="rank">—</td>
            </tr>
          </tbody>
        </table>

        <div class="subtitle" style="margin-top:28px">Royalty Breakdown: Forest vs Sand</div>
        <table style="min-width:520px; width:auto;">
          <thead>
            <tr>
              <th>Name of Agents</th>
              <th>Forest Royalty</th>
              <th>Sand Royalty</th>
              ${showUnspecified ? '<th>Royalty (not specified)</th>' : ''}
              <th>Total Royalty</th>
            </tr>
          </thead>
          <tbody>
            ${royaltyBody || '<tr><td colspan="5">No agents found.</td></tr>'}
            <tr class="total">
              <td>TOTAL</td>
              <td class="number">${royaltySum('forest')}</td>
              <td class="number">${royaltySum('sand')}</td>
              ${showUnspecified ? `<td class="number">${royaltySum('unspecified')}</td>` : ''}
              <td class="number">${royaltySum('total')}</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob(
    [`\ufeff${html}`],
    { type: 'application/vnd.ms-excel;charset=utf-8' },
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `revenue-performance-${rangeStart}-to-${rangeEnd}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Reports Component (Strict Date Range & Format Handling) ---------- */

type ReportDuration = 'daily' | 'monthly';

function Reports({ agents, collections }: { agents: Agent[]; collections: Collection[] }) {
  const { t, lang } = useLang();
  const [agentId, setAgentId] = useState(agents[0]?.id || '');
  const [mode, setMode] = useState<ReportDuration>('monthly');
  const [day, setDay] = useState(isoToday);
  const [month, setMonth] = useState(currentMonth); // Format: "YYYY-MM"
  const [rangeStart, setRangeStart] = useState(`${currentMonth}-01`);
  const [rangeEnd, setRangeEnd] = useState(isoToday);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipStatus, setZipStatus] = useState('');

  useEffect(() => {
    if (agents.length === 0) {
      setAgentId('');
      return;
    }

    if (!agents.some((a) => sameAgentId(a.id, agentId))) {
      setAgentId(normalizeId(agents[0].id));
    }
  }, [agents, agentId]);

  const selectedAgentId = normalizeId(agentId);

  const agent =
    agents.find((a) => sameAgentId(a.id, selectedAgentId)) ??
    agents[0];

  const cleanDate = (rawDate: unknown): string => {
    if (!rawDate) return '';

    const str = String(rawDate).trim();

    if (!str) return '';

    return str.split('T')[0].slice(0, 10);
  };

  // Filter collections by Agent & Selected Date Range/Day/Month
  const rows = collections.filter((item) => {
    const itemAgentId = normalizeId(item.agentId);

    if (!sameAgentId(itemAgentId, selectedAgentId)) {
      return false;
    }

    const itemDay = cleanDate(item.date);

    if (mode === 'daily') {
      return itemDay === day;
    }

    return itemDay.startsWith(month);
  });

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const targetValue = mode === 'daily' ? (agent?.daily || 0) : (agent?.monthly || 0);
  const targetLabel = mode === 'daily' ? t('dailyTargetLabel') : t('monthlyTarget');
  
  const breakdown = bucketTotals(rows).map(({ bucket, amount }) => ({
    key: bucket.key,
    label: lang === 'am' ? bucket.am : bucket.en,
    amount,
  }));

  const canExport = rangeStart <= rangeEnd;
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);
  const receiptCount = countReceiptPhotos(receiptsInRange(collections, rangeStart, rangeEnd));

  const downloadReceipts = async () => {
    if (zipBusy) return;
    setZipBusy(true);
    setZipStatus('');
    try {
      const result = await downloadReceiptsZip(agents, collections, rangeStart, rangeEnd, (done, totalCount) =>
        setZipStatus(`${done} / ${totalCount}`),
      );
      setZipStatus(
        result.failed > 0
          ? tr(`Saved ${result.saved} photos. ${result.failed} could not be downloaded.`, `${result.saved} ፎቶዎች ተቀምጠዋል። ${result.failed} ማውረድ አልተቻለም።`)
          : tr(`Done: ${result.saved} photos.`, `ተጠናቋል፦ ${result.saved} ፎቶዎች።`),
      );
    } catch {
      setZipStatus(tr('Download failed. Please try again.', 'ማውረድ አልተሳካም። እንደገና ይሞክሩ።'));
    }
    setZipBusy(false);
  };

  return (
    <>
      <PageTitle eyebrow={t('reporting')} title={t('monthlyReportsTitle')} description={t('reportDescription')} />
      
      <div className="no-print mb-6 flex flex-col gap-4 rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label={t('exportFromDate')}><input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="input" /></Field>
          <Field label={t('exportToDate')}><input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="input" /></Field>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-col gap-2 sm:flex-row">
        <button onClick={() => void downloadAllAgentsExcel(agents, collections, rangeStart, rangeEnd)} disabled={!canExport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2cb67d] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#239b67] disabled:cursor-not-allowed disabled:opacity-50">
          <Download size={17} /> {t('exportToExcel')}
        </button>
            <button onClick={() => void downloadReceipts()} disabled={!canExport || zipBusy || receiptCount === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102a43] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#173f61] disabled:cursor-not-allowed disabled:opacity-50">
              <Camera size={17} /> {zipBusy ? tr('Preparing…', 'በማዘጋጀት ላይ…') : tr('Receipt photos (ZIP)', 'የደረሰኝ ፎቶዎች (ZIP)')} ({receiptCount})
            </button>
          </div>
          {zipStatus && <p className="text-xs text-[#627d98]">{zipStatus}</p>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[.65fr_1.35fr]">
        <div className="no-print rounded-2xl border border-[#d9e2ec] bg-white p-6 shadow-sm">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf2fb] text-[#2d7dd2]"><FileText size={20} /></div>
          <h3 className="font-display text-xl font-bold">{t('reportSettings')}</h3>
          <p className="mt-2 text-sm leading-6 text-[#627d98]">{t('chooseAgentAndPeriod')}</p>
          
          <div className="mt-6 space-y-5">
            <Field label={t('fieldAgent')}>
              <select value={selectedAgentId} onChange={(e) => setAgentId(normalizeId(e.target.value))} className="input">
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>

            <Field label={t('reportType')}>
              <div className="flex rounded-xl bg-[#f4f7fb] p-1">
                <button onClick={() => setMode('daily')} className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${mode === 'daily' ? 'bg-white text-[#102a43] shadow-sm' : 'text-[#829ab1]'}`}>{t('dailyReport')}</button>
                <button onClick={() => setMode('monthly')} className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${mode === 'monthly' ? 'bg-white text-[#102a43] shadow-sm' : 'text-[#829ab1]'}`}>{t('monthlyReportOpt')}</button>
              </div>
            </Field>

            {mode === 'daily' ? (
              <Field label={t('reportingDay')}>
                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="input" />
              </Field>
            ) : (
              <Field label={t('reportingMonth')}>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input" />
              </Field>
            )}

            <button onClick={() => window.print()} className="w-full rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white hover:bg-[#173f61]">{t('printSavePDF')}</button>
          </div>
        </div>

        <div className="print-area rounded-2xl border border-[#d9e2ec] bg-white p-6 shadow-sm sm:p-8 print:shadow-none">
          <div className="flex flex-col justify-between gap-5 border-b border-[#d9e2ec] pb-6 sm:flex-row">
            <div>
              <div className="text-xs font-bold uppercase tracking-[.17em] text-[#2cb67d]">{t('revenueCollectionOffice')}</div>
              <h3 className="mt-2 font-display text-2xl font-bold">{mode === 'daily' ? t('dailyCollectionReport') : t('monthlyCollectionReport')}</h3>
              <p className="mt-1 text-sm text-[#627d98]">{agent?.name} · {mode === 'daily' ? day : month}</p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-[#829ab1]">{t('reportStatus')}</div>
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#e5f6ef] px-2.5 py-1 text-xs font-bold text-[#157a56]"><Check size={13} /> {t('ready')}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[#f4f7fb] p-4"><div className="text-xs text-[#829ab1]">{targetLabel}</div><div className="mt-1 font-display font-bold">{etb(targetValue)}</div></div>
            <div className="rounded-xl bg-[#e5f6ef] p-4"><div className="text-xs text-[#157a56]">{t('totalCollected')}</div><div className="mt-1 font-display font-bold text-[#157a56]">{etb(total)}</div></div>
            <div className="rounded-xl bg-[#fff5dc] p-4"><div className="text-xs text-[#8b650b]">{t('accomplished')}</div><div className="mt-1 font-display font-bold text-[#8b650b]">{targetValue > 0 ? Math.round((total / targetValue) * 100) : 0}%</div></div>
          </div>

          <h4 className="mt-8 font-display font-bold">{t('categoryBreakdown')}</h4>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {breakdown.map((row) => (
                  <tr key={row.key} className="border-b border-[#e9eff5]">
                    <td className="py-3 text-[#627d98]">{row.label}</td>
                    <td className="py-3 text-right font-semibold">{etb(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="mt-8 font-display font-bold">{t('dailyLog')}</h4>
          <div className="mt-3 max-h-64 overflow-y-auto scrollbar">
            {rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#829ab1]">{t('noCollectionsForPeriod')}</div>
            ) : (
              <table className="w-full min-w-[430px] text-sm">
                <thead className="text-xs text-[#829ab1]">
                  <tr>
                    <th className="pb-2 text-left font-semibold">{t('date')}</th>
                    <th className="pb-2 text-left font-semibold">{t('category')}</th>
                    <th className="pb-2 text-left font-semibold">{t('receipt')}</th>
                    <th className="pb-2 text-right font-semibold">{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-[#e9eff5]">
                      <td className="py-2.5">{formatDayLabel(row.date)}</td>
                      <td className="py-2.5 text-[#627d98]">{collectionLabel(row, lang)}</td>
                      <td className="py-2.5 text-[#627d98]">{row.receipt}<ReceiptButton paths={row.receiptPaths} /></td>
                      <td className="py-2.5 text-right font-semibold">{etb(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-12 grid gap-10 sm:grid-cols-2">
            <div className="border-t border-[#829ab1] pt-2 text-xs text-[#627d98]">{t('fieldAgentSignature')}</div>
            <div className="border-t border-[#829ab1] pt-2 text-xs text-[#627d98]">{t('supervisorApproval')}</div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;