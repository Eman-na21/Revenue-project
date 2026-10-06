export type Role = 'admin' | 'agent';
export type Category = 'Chat' | 'Royalty' | 'Other Revenue';
export type Tab = 'overview' | 'agents' | 'reports' | 'recommendations' | 'entry' | 'collect' | 'history' | 'settings';

export type Agent = {
  id: string;
  name: string;
  username: string;
  password: string;
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

export const today = new Date();
export const isoToday = today.toISOString().slice(0, 10);
export const currentMonth = isoToday.slice(0, 7);
export const currentYear = isoToday.slice(0, 4);
export const currentDateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export const fiscalYearLabel = (() => {
  const ethiopianYear = today.getFullYear() - 7;
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

export const seedAgents: Agent[] = [
  { id: 'a1', name: 'Kalkidan Belgu', username: 'Kalkidan', password: 'agent123', daily: 20000, monthly: 600000, annual: 7200000, active: true, avatar: 'KB' },
  { id: 'a2', name: 'Hermon', username: 'Hermon', password: 'agent123', daily: 18000, monthly: 540000, annual: 6480000, active: true, avatar: 'H' },
  { id: 'a3', name: 'Seid', username: 'Seid', password: 'agent123', daily: 22000, monthly: 660000, annual: 7920000, active: true, avatar: 'S' },
  { id: 'a4', name: 'Abdu', username: 'Abdu', password: 'agent123', daily: 20000, monthly: 600000, annual: 7200000, active: true, avatar: 'A' },
  { id: 'a5', name: 'Aisha', username: 'Aisha', password: 'agent123', daily: 16000, monthly: 480000, annual: 5760000, active: true, avatar: 'A' },
  { id: 'a6', name: 'Netsanet', username: 'Netsanet', password: 'agent123', daily: 20000, monthly: 600000, annual: 7200000, active: true, avatar: 'N' },
  { id: 'a7', name: 'Yimer', username: 'Yimer', password: 'agent123', daily: 18000, monthly: 540000, annual: 6480000, active: true, avatar: 'Y' },
  { id: 'a8', name: 'Endris', username: 'Endris', password: 'agent123', daily: 20000, monthly: 600000, annual: 7200000, active: true, avatar: 'E' },
  
];

export const seedCollections: Collection[] = [];
