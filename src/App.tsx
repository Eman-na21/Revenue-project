import { FormEvent, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Bell, CalendarDays, Check, ClipboardList, Download, FileText, Globe, Home, KeyRound, Lock, LogOut, Menu, MessageSquareText, MoreHorizontal, Plus, Receipt, Search, Settings2, Settings, ShieldCheck, Target, Trash2, UserRound, Users, X } from 'lucide-react';
import {
  Agent, Category, Collection, Recommendation, Session, Tab, categories, categoryStyles, compact, etb,
  formatDayLabel, isoToday, currentDateLabel, currentMonth, currentYear, fiscalYearLabel, seedAgents,
} from '@/types';
import { LangProvider, useLang } from '@/i18n';
import { AgentSettings } from '@/components/AgentSettings';
import { AdminSettings } from '@/components/AdminSettings';
import { AgentHome } from '@/components/AgentHome';
import { AgentEntry } from '@/components/AgentEntry';
import { AgentHistory } from '@/components/AgentHistory';
import { AdminRecommendations } from '@/components/AdminRecommendations';
import { supabase } from '@/supabase';

function usePersistent<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch {
      return fallback;
    }
  });

  const update = (next: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
      localStorage.setItem(key, JSON.stringify(resolved));
      return resolved;
    });
  };

  return [value, update] as const;
}


/* ---------- Shared normalization helpers ---------- */

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function sameAgentId(left: unknown, right: unknown): boolean {
  const a = normalizeId(left);
  const b = normalizeId(right);
  return a !== '' && b !== '' && a === b;
}

// Keep existing Supabase records compatible after the category rename.
// Old values: Chat Royalty -> Chat, Traffic Fines -> Royalty.
function normalizeCategory(value: unknown): Category {
  const category = String(value ?? '').trim();
  if (category === 'Chat Royalty' || category === 'Chat') return 'Chat';
  if (category === 'Traffic Fines' || category === 'Royalty') return 'Royalty';
  return 'Other Revenue';
}

function App() {
  return (
    <LangProvider>
      <AppInner />
    </LangProvider>
  );
}

function AppInner() {
  const { t, lang, setLang } = useLang();
  const [session, setSession] = useState<Session | null>(null);
  const [agents, setAgents] = usePersistent<Agent[]>('revenue-agents-v3', seedAgents);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [adminPassword, setAdminPassword] = usePersistent<string>('revenue-admin-pw', 'admin123');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadCollections = async () => {
      if (!supabase) return;

      // Supabase collections.agent_id stores the real profile UUID.
      // The UI agents use local ids such as a1/a2. Map UUID -> local agent id
      // so Overview, Reports, History and Agent Management all use the same id.
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, daily_target');

      if (profilesError) {
        console.error('Profiles load error:', profilesError);
      }

      const profileToLocalAgent = new Map<string, string>();

      (profiles ?? []).forEach((profile) => {
        const username = String(profile.username ?? '').trim().toLowerCase();
        const localAgent = agents.find(
          (a) => a.username.trim().toLowerCase() === username
        );

        if (localAgent) {
          const dailyTarget = Number(profile.daily_target);

          // The database value is the source of truth for the agent target.
          // Only replace the local/default value when the DB has a real target.
          if (profile.daily_target !== null && profile.daily_target !== undefined && Number.isFinite(dailyTarget) && dailyTarget >= 0) {
            const nextDaily = dailyTarget;
            if (localAgent.daily !== nextDaily) {
              setAgents((current) => current.map((a) =>
                a.id === localAgent.id
                  ? { ...a, daily: nextDaily, monthly: nextDaily * 30, annual: nextDaily * 365 }
                  : a
              ));
            }
          }

          profileToLocalAgent.set(String(profile.id).trim(), localAgent.id);
        }
      });

      const { data, error } = await supabase
        .from('collections')
        .select('id, agent_id, category, amount, receipt_number, notes, collected_at, created_at')
        .order('collected_at', { ascending: false });

      if (error || cancelled) {
        if (error) console.error('Collections load error:', error);
        return;
      }

      setCollections((data ?? []).map((item) => {
        const rawDate = item.collected_at ?? item.created_at ?? '';
        const cleanDate = String(rawDate).trim().split('T')[0];
        const supabaseAgentId = normalizeId(item.agent_id);

        return {
          id: item.id,
          // Convert the Supabase UUID back to the local agent id used by the UI.
          agentId: profileToLocalAgent.get(supabaseAgentId) ?? supabaseAgentId,
          category: normalizeCategory(item.category),
          amount: Number(item.amount) || 0,
          receipt: item.receipt_number ?? '',
          notes: item.notes ?? '',
          date: cleanDate,
        };
      }));
    };

    loadCollections();

    return () => {
      cancelled = true;
    };
  }, [agents]);

  const handleSaveRecommendation = async (recommendation: Recommendation) => {
    setRecommendations((prev) => [recommendation, ...prev]);
  };

  if (!session) {
    return <Login onLogin={setSession} agents={agents} adminPassword={adminPassword} />;
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
      adminPassword={adminPassword}
      setAdminPassword={setAdminPassword}
      onLogout={() => setSession(null)}
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

/* ---------- Login + Forgot Password ---------- */

function Login({ onLogin, agents, adminPassword }: { onLogin: (session: Session) => void; agents: Agent[]; adminPassword: string }) {
  const { t } = useLang();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // forgot password state
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotConfirmPw, setForgotConfirmPw] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (username === 'admin' && password === adminPassword) {
        onLogin({ role: 'admin', name: 'Nuru Mohammed' });
      } else {
        const agent = agents.find((item) => item.username === username);
        if (agent && agent.active && password === agent.password) {
          onLogin({ role: 'agent', agentId: agent.id, name: agent.name });
        } else {
          setError(t('incorrectCredentials'));
        }
      }
      setLoading(false);
    }, 500);
  };

  const submitForgot = (event: FormEvent) => {
    event.preventDefault();
    setForgotError('');
    const agent = agents.find((a) => a.username === forgotUsername.trim().toLowerCase());
    if (!agent) {
      setForgotError(t('usernameNotFound'));
      return;
    }
    if (forgotNewPw.length < 6) {
      setForgotError(t('passwordTooShort'));
      return;
    }
    if (forgotNewPw !== forgotConfirmPw) {
      setForgotError(t('passwordsDoNotMatch'));
      return;
    }
    const newPassword = forgotNewPw;
    const stored = localStorage.getItem('revenue-agents-v3');
    if (stored) {
      const parsed: Agent[] = JSON.parse(stored);
      const updated = parsed.map((a) => a.id === agent.id ? { ...a, password: newPassword } : a);
      localStorage.setItem('revenue-agents-v3', JSON.stringify(updated));
    }
    setForgotSuccess(true);
  };

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
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#e5f6ef] px-3 py-1 text-xs font-semibold text-[#157a56]">
                 
                </div>
                <h1 className="font-display text-3xl font-bold text-[#102a43]">{t('welcomeBack')}</h1>
                <p className="mt-2 text-sm leading-6 text-[#627d98]">{t('signInDescription')}</p>
              </div>
              <form onSubmit={submit} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#334e68]">{t('usernameOrEmail')}</span>
                  <div className="relative">
                    <UserRound className="absolute left-4 top-3.5 text-[#829ab1]" size={18} />
                    <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl border border-[#d9e2ec] bg-[#f8fafc] py-3.5 pl-11 pr-4 text-sm outline-none transition focus:border-[#2cb67d] focus:ring-4 focus:ring-[#2cb67d]/10" placeholder={t('enterUsername')} />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#334e68]">{t('password')}</span>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-[#d9e2ec] bg-[#f8fafc] px-4 py-3.5 text-sm outline-none transition focus:border-[#2cb67d] focus:ring-4 focus:ring-[#2cb67d]/10" placeholder={t('enterPassword')} />
                </label>
                {error && <div className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">{error}</div>}
                <button disabled={loading} className="w-full rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white transition hover:bg-[#173f61] disabled:opacity-70">
                  {loading ? t('signingIn') : t('signInToWorkspace')}
                </button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => { setMode('forgot'); setForgotError(''); setForgotSuccess(false); }} className="text-xs font-semibold text-[#2d7dd2] hover:underline">
                  {t('forgotPassword')}
                </button>
              </div>
              <div className="mt-7 flex items-start gap-3 border-t border-[#e9eff5] pt-5">
                <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#2cb67d]" />
                <p className="text-xs leading-5 text-[#627d98]">{t('accessManagedByAdmin')}</p>
              </div>
            </>
          ) : forgotSuccess ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#e5f6ef]">
                <Check size={32} className="text-[#2cb67d]" />
              </div>
              <h1 className="font-display text-2xl font-bold text-[#102a43]">{t('passwordResetSuccess')}</h1>
              <p className="mt-3 text-sm text-[#627d98]">{t('passwordResetSuccessDesc')}</p>
              <button onClick={() => { setMode('login'); setForgotSuccess(false); setForgotUsername(''); setForgotNewPw(''); setForgotConfirmPw(''); }} className="mt-6 w-full rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white hover:bg-[#173f61]">
                {t('backToSignIn')}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#eaf2fb] px-3 py-1 text-xs font-semibold text-[#2d7dd2]">
                  <KeyRound size={14} /> {t('resetPassword')}
                </div>
                <h1 className="font-display text-3xl font-bold text-[#102a43]">{t('forgotPasswordTitle')}</h1>
                <p className="mt-2 text-sm leading-6 text-[#627d98]">{t('forgotPasswordDesc')}</p>
              </div>
              <form onSubmit={submitForgot} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#334e68]">{t('username')}</span>
                  <input required value={forgotUsername} onChange={(e) => setForgotUsername(e.target.value)} className="w-full rounded-xl border border-[#d9e2ec] bg-[#f8fafc] px-4 py-3.5 text-sm outline-none transition focus:border-[#2cb67d] focus:ring-4 focus:ring-[#2cb67d]/10" placeholder={t('enterUsername')} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#334e68]">{t('newPassword')}</span>
                  <input type="password" required value={forgotNewPw} onChange={(e) => setForgotNewPw(e.target.value)} className="w-full rounded-xl border border-[#d9e2ec] bg-[#f8fafc] px-4 py-3.5 text-sm outline-none transition focus:border-[#2cb67d] focus:ring-4 focus:ring-[#2cb67d]/10" placeholder={t('atLeast6Chars')} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#334e68]">{t('confirmPassword')}</span>
                  <input type="password" required value={forgotConfirmPw} onChange={(e) => setForgotConfirmPw(e.target.value)} className="w-full rounded-xl border border-[#d9e2ec] bg-[#f8fafc] px-4 py-3.5 text-sm outline-none transition focus:border-[#2cb67d] focus:ring-4 focus:ring-[#2cb67d]/10" placeholder={t('reenterNewPassword')} />
                </label>
                {forgotError && <div className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">{forgotError}</div>}
                <button type="submit" className="w-full rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white transition hover:bg-[#173f61]">{t('reset')}</button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => { setMode('login'); setForgotError(''); }} className="text-xs font-semibold text-[#2d7dd2] hover:underline">{t('backToSignIn')}</button>
              </div>
            </>
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
  adminPassword: string;
  setAdminPassword: (next: string) => void;
  onLogout: () => void;
};

function NotificationBell({ agents, collections, isAdmin, agentId }: { agents: Agent[]; collections: Collection[]; isAdmin: boolean; agentId?: string }) {
  const { t } = useLang();
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
                const style = categoryStyles[item.category];
                const isNew = index < unseen;
                return (
                  <div key={item.id} className={`flex items-start gap-3 border-b border-[#f0f4f8] px-4 py-3 last:border-0 ${isNew ? 'bg-[#f8fbff]' : ''}`}>
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.bg} ${style.text}`}><Receipt size={15} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{agent?.name ?? t('agent')}</div>
                      <div className="mt-0.5 text-xs text-[#627d98]">{t('newCollection')} · {item.category}</div>
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

function Shell({ session, agents, collections, setAgents, setCollections, recommendations, onSaveRecommendation, adminPassword, setAdminPassword, onLogout }: ShellProps) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>(session.role === 'admin' ? 'overview' : 'entry');
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = session.role === 'admin';

  const adminNav: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'overview', label: t('overview'), icon: BarChart3 },
    { id: 'agents', label: t('fieldAgents'), icon: Users },
    { id: 'reports', label: t('monthlyReports'), icon: FileText },
    { id: 'recommendations', label: t('recommendations'), icon: MessageSquareText },
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
              <div className="text-sm font-semibold">{isAdmin ? 'Nuru Mohammed' : session.name}</div>
              <div className="text-xs text-[#829ab1]">{isAdmin ? t('administrator') : t('fieldAgent')}</div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1100px] p-5 pb-28 sm:p-8 lg:pb-8">
          {isAdmin ? (
            tab === 'overview' ? (
              <AdminOverview agents={agents} collections={collections} onNavigate={go} />
            ) : tab === 'agents' ? (
              <AgentManagement agents={agents} setAgents={setAgents} collections={collections} />
            ) : tab === 'recommendations' ? (
              <AdminRecommendations agents={agents} collections={collections} recommendations={recommendations} onSave={onSaveRecommendation} />
            ) : tab === 'settings' ? (
              <AdminSettings adminPassword={adminPassword} setAdminPassword={setAdminPassword} onLogout={onLogout} />
            ) : (
              <Reports agents={agents} collections={collections} />
            )
          ) : tab === 'entry' ? (
            <AgentHome agent={currentAgent} collections={collections} recommendations={recommendations.filter((item) => sameAgentId(item.agentId, currentAgent.id))} onNavigate={go} />
          ) : tab === 'collect' ? (
            <AgentEntry agent={currentAgent} collections={collections} setCollections={setCollections} onDone={() => go('history')} />
          ) : tab === 'settings' ? (
            <AgentSettings agent={currentAgent} setAgents={setAgents} onLogout={onLogout} />
          ) : (
            <AgentHistory agent={currentAgent} collections={collections} />
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
  const catLabels: Record<string, string> = {
    'Chat': lang === 'am' ? 'ጫት' : 'Chat',
    'Royalty': lang === 'am' ? 'ሮያሊቲ' : 'Royalty',
    'Other Revenue': lang === 'am' ? 'ሌላ' : 'Other',
  };
  const categoryData = categories.map((category) => ({
    name: catLabels[category],
    value: collections.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0),
  }));
  const chartData = agents.slice(0, 6).map((agent) => ({
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
                    <Cell key={`target-${entry.name}`} fill="#2cb67d" />
                  ))}
                </Bar>
                <Bar dataKey="actual" radius={[5, 5, 0, 0]} name={t('totalCollected')}>
                  {chartData.map((entry) => {
                    const performance = entry.target > 0
                      ? (entry.actual / entry.target) * 100
                      : 0;
                    const fill = performance >= 50 ? '#e4b44c' : '#c0392b';
                    return <Cell key={`actual-${entry.name}`} fill={fill} />;
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
                  <Cell fill="#2cb67d" /><Cell fill="#2d7dd2" /><Cell fill="#e4b44c" />
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
            {categoryData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-[#627d98]">
                  <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-[#2cb67d]' : index === 1 ? 'bg-[#2d7dd2]' : 'bg-[#e4b44c]'}`} />
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
                const style = categoryStyles[item.category];
                return (
                  <tr key={item.id} className="border-b border-[#f0f4f8] last:border-0">
                    <td className="py-3.5 font-semibold">{agent?.name}</td>
                    <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>{item.category}</span></td>
                    <td className="py-3.5 text-[#627d98]">{item.receipt}</td>
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

function AgentManagement({ agents, setAgents, collections }: { agents: Agent[]; setAgents: (next: Agent[] | ((current: Agent[]) => Agent[])) => void; collections: Collection[] }) {
  const { t } = useLang();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const visible = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.username.includes(search));
  const save = async () => {
    if (!draft) return;

    if (!supabase) {
      window.alert('Database connection is not configured.');
      return;
    }

    const dailyTarget = Number(draft.daily);
    if (!Number.isFinite(dailyTarget) || dailyTarget < 0) {
      window.alert('Please enter a valid daily target.');
      return;
    }

    // Save the edited target to the real Supabase profile first.
    // The UI is updated only after the database update succeeds.
    const { error } = await supabase
      .from('profiles')
      .update({ daily_target: dailyTarget })
      .eq('username', draft.username);

    if (error) {
      console.error('Agent profile update error:', error);
      window.alert(`Could not save agent changes: ${error.message}`);
      return;
    }

    const savedDraft: Agent = {
      ...draft,
      daily: dailyTarget,
      monthly: dailyTarget * 30,
      annual: dailyTarget * 365,
    };

    setAgents((current) => current.map((a) => (a.id === savedDraft.id ? savedDraft : a)));
    setEditing(null);
    setDraft(null);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    setAgents((current) => current.filter((a) => a.id !== deleting));
    setDeleting(null);
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
                        <button onClick={() => { setEditing(agent.id); setDraft({ ...agent }); }} className="rounded-lg p-2 text-[#627d98] hover:bg-[#f4f7fb]"><Settings2 size={17} /></button>
                        <button onClick={() => setDeleting(agent.id)} className="rounded-lg p-2 text-[#c0392b] hover:bg-[#fff1f0]"><Trash2 size={16} /></button>
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
      {editing && draft && <EditAgentModal draft={draft} setDraft={setDraft} onClose={() => { setEditing(null); setDraft(null); }} onSave={save} />}
      {deleting && <DeleteAgentModal agent={agents.find((a) => a.id === deleting)!} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />}
    </>
  );
}

function AddAgentModal({ onClose, onAdd }: { onClose: () => void; onAdd: (agent: Agent) => void }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [daily, setDaily] = useState('20000');
  const [password, setPassword] = useState('agent123');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || !username || !password) return;
    const dailyNum = Number(daily);
    onAdd({ id: `a-${Date.now()}`, name, username, password, daily: dailyNum, monthly: dailyNum * 30, annual: dailyNum * 365, active: true, avatar: name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase() });
  };
  return (
    <Modal title={t('addFieldAgent')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('fullName')}><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Eden Kebede" /></Field>
        <Field label={t('username')}><input required value={username} onChange={(e) => setUsername(e.target.value)} className="input" placeholder="e.g. eden" /></Field>
        <Field label={t('temporaryPassword')}><input required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder={t('setInitialPassword')} /></Field>
        <Field label={t('dailyTargetETB')}><input required type="number" value={daily} onChange={(e) => setDaily(e.target.value)} className="input" /></Field>
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
        <button className="w-full rounded-xl bg-[#2cb67d] py-3.5 text-sm font-bold text-white">{t('createAgent')}</button>
      </form>
    </Modal>
  );
}

function EditAgentModal({ draft, setDraft, onClose, onSave }: { draft: Agent; setDraft: (agent: Agent) => void; onClose: () => void; onSave: () => void }) {
  const { t } = useLang();
  return (
    <Modal title={t('manageAgent')} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t('fullName')}><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" /></Field>
        <Field label={t('dailyTargetETB')}><input type="number" value={draft.daily} onChange={(e) => { const d = Number(e.target.value); setDraft({ ...draft, daily: d, monthly: d * 30, annual: d * 365 }); }} className="input" /></Field>
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
        
        <div className="flex items-center justify-between rounded-xl border border-[#d9e2ec] p-4">
          <div>
            <div className="text-sm font-semibold">{t('accountStatus')}</div>
            <div className="text-xs text-[#829ab1]">{t('allowSignIn')}</div>
          </div>
          <button onClick={() => setDraft({ ...draft, active: !draft.active })} className={`h-6 w-11 rounded-full p-1 transition ${draft.active ? 'bg-[#2cb67d]' : 'bg-[#bcccdc]'}`}>
            <span className={`block h-4 w-4 rounded-full bg-white transition ${draft.active ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[#d9e2ec] py-3 text-sm font-bold text-[#627d98]">{t('cancel')}</button>
          <button onClick={onSave} className="flex-1 rounded-xl bg-[#102a43] py-3 text-sm font-bold text-white">{t('saveChanges')}</button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteAgentModal({ agent, onClose, onConfirm }: { agent: Agent; onClose: () => void; onConfirm: () => void }) {
  const { t } = useLang();
  return (
    <Modal title={t('deleteAgent')} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff1f0] text-[#c0392b]">
            <Trash2 size={22} />
          </div>
          <div>
            <h4 className="font-display text-lg font-bold text-[#102a43]">{agent.name}</h4>
            <p className="text-sm text-[#829ab1]">@{agent.username}</p>
          </div>
        </div>
        <div className="rounded-xl bg-[#fff1f0] p-4">
          <p className="text-sm font-semibold text-[#c0392b]">{t('deleteAgentConfirm')}</p>
          <p className="mt-1 text-xs text-[#c0392b]/80">{t('deleteAgentWarning')}</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[#d9e2ec] py-3 text-sm font-bold text-[#627d98]">{t('cancel')}</button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-[#c0392b] py-3 text-sm font-bold text-white hover:bg-[#a93226]">{t('confirmDelete')}</button>
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
  const percent = (actual: number, plan: number) =>
    plan > 0 ? `${Math.round((actual / plan) * 100)}%` : '—';

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

    // "Plan" comes from the agent's configured DAILY TARGET.
    // For a multi-day selected period, Total Plan is daily target × number of days.
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
      totalPercent: percent(totalActual, totalPlan),
    };
  });

  // Rank by total performance percentage, highest first.
  const ranked = [...reportRows].sort((a, b) => {
    const aPct = a.totalPlan > 0 ? a.totalActual / a.totalPlan : 0;
    const bPct = b.totalPlan > 0 ? b.totalActual / b.totalPlan : 0;
    return bPct - aPct || b.totalActual - a.totalActual;
  });

  const rankMap = new Map<string, number>();
  ranked.forEach((row, index) =>
    rankMap.set(normalizeId(row.agent.id), index + 1),
  );

  const bodyRows = reportRows
    .map(
      (row) => `
      <tr>
        <td class="agent">${escapeCell(row.agent.name)}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.chat)}</td>
        <td class="number">${percent(row.chat, row.dailyPlan)}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.royalty)}</td>
        <td class="number">${percent(row.royalty, row.dailyPlan)}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.other)}</td>
        <td class="number">${percent(row.other, row.dailyPlan)}</td>

        <td class="number">${money(row.totalPlan)}</td>
        <td class="number">${money(row.totalActual)}</td>
        <td class="number">${row.totalPercent}</td>
        <td class="rank">${rankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>
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

  /*
   * The uploaded Payment Summary workbook is used ONLY as the visual
   * reference: gray header cells, black text, thin borders, white body,
   * centered headings and no extra dashboard colors/data.
   */
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
            min-width: 1250px;
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
        <div class="title">Revenue Collection Office</div>
        <div class="subtitle">Agent Collection Performance Report</div>
        <div class="period">
          Selected Date: ${escapeCell(rangeStart)} to ${escapeCell(rangeEnd)}
          &nbsp; | &nbsp; ${dayCount} day${dayCount === 1 ? '' : 's'}
        </div>

        <table>
          <thead>
            <tr>
              <th rowspan="2">Name of Agents</th>
              <th class="group" colspan="3">Chat</th>
              <th class="group" colspan="3">Royalty</th>
              <th class="group" colspan="3">Other</th>
              <th class="group" colspan="3">Total</th>
              <th rowspan="2">Rank</th>
            </tr>
            <tr>
              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
            </tr>
          </thead>

          <tbody>
            ${
              bodyRows ||
              `<tr><td colspan="14">No agents found.</td></tr>`
            }

            <tr class="total">
              <td>TOTAL</td>
              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalChat)}</td>
              <td class="number">${percent(totalChat, totalDailyPlan)}</td>

              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalRoyalty)}</td>
              <td class="number">${percent(totalRoyalty, totalDailyPlan)}</td>

              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalOther)}</td>
              <td class="number">${percent(totalOther, totalDailyPlan)}</td>

              <td class="number">${money(totalPlan)}</td>
              <td class="number">${money(grandTotal)}</td>
              <td class="number">${percent(grandTotal, totalPlan)}</td>
              <td class="rank">—</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          Plan = Agent Daily Target &nbsp; | &nbsp;
          Total Plan = Agent Daily Target × Selected Days
        </div>
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
  const { t } = useLang();
  const [agentId, setAgentId] = useState(agents[0]?.id || '');
  const [mode, setMode] = useState<ReportDuration>('monthly');
  const [day, setDay] = useState(isoToday);
  const [month, setMonth] = useState(currentMonth); // Format: "YYYY-MM"
  const [rangeStart, setRangeStart] = useState(`${currentMonth}-01`);
  const [rangeEnd, setRangeEnd] = useState(isoToday);

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
  
  const breakdown = categories.map((category) => ({
    category,
    amount: rows.filter((r) => r.category === category).reduce((s, r) => s + (Number(r.amount) || 0), 0),
  }));

  const canExport = rangeStart <= rangeEnd;

  return (
    <>
      <PageTitle eyebrow={t('reporting')} title={t('monthlyReportsTitle')} description={t('reportDescription')} />
      
      <div className="no-print mb-6 flex flex-col gap-4 rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label={t('exportFromDate')}><input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="input" /></Field>
          <Field label={t('exportToDate')}><input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="input" /></Field>
        </div>
        <button onClick={() => void downloadAllAgentsExcel(agents, collections, rangeStart, rangeEnd)} disabled={!canExport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2cb67d] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#239b67] disabled:cursor-not-allowed disabled:opacity-50">
          <Download size={17} /> {t('exportToExcel')}
        </button>
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
                  <tr key={row.category} className="border-b border-[#e9eff5]">
                    <td className="py-3 text-[#627d98]">{row.category}</td>
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
                      <td className="py-2.5 text-[#627d98]">{row.category}</td>
                      <td className="py-2.5 text-[#627d98]">{row.receipt}</td>
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