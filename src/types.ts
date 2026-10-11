export type Role = 'admin' | 'agent';
export type Category = 'Chat' | 'Royalty' | 'Other Revenue';
export type Tab = 'overview' | 'agents' | 'reports' | 'recommendations' | 'entry' | 'collect' | 'history' | 'settings';

export type Agent = {
  id: string; // = Supabase profile / auth user UUID
  name: string;
  username: string;
  daily: number;
  monthly: number;
  annual: number;
  active: boolean;
  avatar: string;
};

export type Collection = {
  id: string;
  agentId: string;
  category: Category;
  amount: number;
  receipt: string;
  notes: string;
  date: string;
};

export type Recommendation = {
  id: string;
  agentId: string;
  message: string;
  createdAt: string;
};

export type Session = {
  role: Role;
  agentId?: string;
  name: string;
};

export const categories: Category[] = ['Chat', 'Royalty', 'Other Revenue'];

/** Converts legacy database category names to the current UI names. */
export const normalizeCategory = (value: unknown): Category => {
  const category = String(value ?? '').trim();
  if (category === 'Chat Royalty' || category === 'Chat') return 'Chat';
  if (category === 'Traffic Fines' || category === 'Royalty') return 'Royalty';
  return 'Other Revenue';
};

export const categoryStyles: Record<Category, { bg: string; text: string; solid: string; light: string }> = {
  'Chat': { bg: 'bg-[#e5f6ef]', text: 'text-[#157a56]', solid: 'bg-[#2cb67d]', light: 'bg-[#e5f6ef]' },
  'Royalty': { bg: 'bg-[#eaf2fb]', text: 'text-[#2d7dd2]', solid: 'bg-[#2d7dd2]', light: 'bg-[#eaf2fb]' },
  'Other Revenue': { bg: 'bg-[#fff5dc]', text: 'text-[#a36b05]', solid: 'bg-[#e4b44c]', light: 'bg-[#fff5dc]' },
};

/* ---------- Dates (always Ethiopian office time, independent of the phone's settings) ---------- */

const OFFICE_TIME_ZONE = 'Africa/Addis_Ababa';

/** Today's date as YYYY-MM-DD in Addis Ababa time (NOT UTC). */
export const todayISO = (): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export const isoToday = todayISO();
export const today = new Date(`${isoToday}T12:00:00`);
export const currentMonth = isoToday.slice(0, 7);
export const currentYear = isoToday.slice(0, 4);
export const currentDateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/** Ethiopian fiscal year starts on Hamle 1 (about 8 July) and is 7 or 8 years behind the Gregorian year. */
export const fiscalYearLabel = (() => {
  const [year, month, day] = isoToday.split('-').map(Number);
  const startedThisYear = month > 7 || (month === 7 && day >= 8);
  const ethiopianYear = year - (startedThisYear ? 7 : 8);
  return `Fiscal year ${ethiopianYear} E.C.`;
})();

export const etb = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value) + ' ETB';

export const etbShort = (value: number) =>
  value >= 1000000 ? `${(value / 1000000).toFixed(1)}M ETB` : value >= 1000 ? `${Math.round(value / 1000)}K ETB` : `${value} ETB`;

export const compact = (value: number) =>
  value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}K` : `${value}`;

export const formatDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatDayLabel = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  const todayDate = new Date(isoToday + 'T00:00:00');
  const diff = Math.round((todayDate.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

export const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';
