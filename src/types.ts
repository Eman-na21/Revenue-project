export type Role = 'admin' | 'vice_admin' | 'agent' | 'accountant';
export type Category = 'Chat' | 'Royalty' | 'Trade Revenue' | 'Other Revenue';
export type Tab = 'overview' | 'agents' | 'reports' | 'recommendations' | 'entry' | 'collect' | 'history' | 'settings' | 'corrections' | 'office' | 'accHome' | 'accEntry' | 'accHistory';

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

/** Royalty is split in two. Older Royalty records have no type (null). */
export type RoyaltyType = 'forest' | 'sand';

export type Collection = {
  id: string;
  agentId: string;
  category: Category;
  royaltyType: RoyaltyType | null;
  amount: number;
  receipt: string;
  /** Receipt photos in private storage (empty for older records). */
  receiptPaths: string[];
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
  /** The signed-in user's own profile id (used for agents and for the accountant). */
  agentId?: string;
  name: string;
};

export const categories: Category[] = ['Chat', 'Royalty', 'Trade Revenue', 'Other Revenue'];

/** Converts legacy database category names to the current UI names. */
export const normalizeCategory = (value: unknown): Category => {
  const category = String(value ?? '').trim();
  if (category === 'Chat Royalty' || category === 'Chat') return 'Chat';
  if (category === 'Traffic Fines' || category === 'Royalty') return 'Royalty';
  if (category === 'Trade Revenue') return 'Trade Revenue';
  return 'Other Revenue';
};

export const categoryStyles: Record<Category, { bg: string; text: string; solid: string; light: string }> = {
  'Chat': { bg: 'bg-[#e5f6ef]', text: 'text-[#157a56]', solid: 'bg-[#2cb67d]', light: 'bg-[#e5f6ef]' },
  'Royalty': { bg: 'bg-[#eaf2fb]', text: 'text-[#2d7dd2]', solid: 'bg-[#2d7dd2]', light: 'bg-[#eaf2fb]' },
  'Trade Revenue': { bg: 'bg-[#f1edff]', text: 'text-[#5b43b0]', solid: 'bg-[#7b61c9]', light: 'bg-[#f1edff]' },
  'Other Revenue': { bg: 'bg-[#fff5dc]', text: 'text-[#a36b05]', solid: 'bg-[#e4b44c]', light: 'bg-[#fff5dc]' },
};

/** true = an agent cannot submit a collection without a receipt photo. Set to false to make the photo optional. */
export const RECEIPT_PHOTO_REQUIRED = false;

/** Most photos one collection can have (the database enforces the same number). */
export const MAX_RECEIPT_PHOTOS = 30;

export const royaltyTypes: RoyaltyType[] = ['forest', 'sand'];

export const normalizeRoyaltyType = (value: unknown): RoyaltyType | null => {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'forest' || v === 'sand' ? v : null;
};

export type Lang = 'en' | 'am';

/**
 * Every place that totals money by "kind of revenue" uses these buckets,
 * so Forest Royalty and Sand Royalty always appear separately.
 * "royalty_unspecified" holds OLD royalty records that were saved before the split.
 */
export type BucketKey = 'chat' | 'forest' | 'sand' | 'royalty_unspecified' | 'trade' | 'other';

export type Bucket = {
  key: BucketKey;
  en: string;
  am: string;
  hex: string;
  bg: string;
  text: string;
  solid: string;
};

export const revenueBuckets: Bucket[] = [
  { key: 'chat', en: 'Chat', am: 'ጫት', hex: '#2cb67d', bg: 'bg-[#e5f6ef]', text: 'text-[#157a56]', solid: 'bg-[#2cb67d]' },
  { key: 'forest', en: 'Forest Royalty', am: 'የደን ሮያሊቲ', hex: '#2d7dd2', bg: 'bg-[#eaf2fb]', text: 'text-[#2d7dd2]', solid: 'bg-[#2d7dd2]' },
  { key: 'sand', en: 'Sand Royalty', am: 'የአሸዋ ሮያሊቲ', hex: '#0fa3b1', bg: 'bg-[#e0f5f7]', text: 'text-[#0b7f8a]', solid: 'bg-[#0fa3b1]' },
  { key: 'royalty_unspecified', en: 'Royalty (not specified)', am: 'ሮያሊቲ (ያልተለየ)', hex: '#8aa4bd', bg: 'bg-[#eef2f6]', text: 'text-[#52677d]', solid: 'bg-[#8aa4bd]' },
  { key: 'trade', en: 'Trade Revenue', am: 'ከንግድ የሚገኝ ገቢ', hex: '#7b61c9', bg: 'bg-[#f1edff]', text: 'text-[#5b43b0]', solid: 'bg-[#7b61c9]' },
  { key: 'other', en: 'Other Revenue', am: 'ሌላ ገቢ', hex: '#e4b44c', bg: 'bg-[#fff5dc]', text: 'text-[#a36b05]', solid: 'bg-[#e4b44c]' },
];

export const bucketKeyOf = (item: Pick<Collection, 'category' | 'royaltyType'>): BucketKey => {
  if (item.category === 'Chat') return 'chat';
  if (item.category === 'Royalty') return item.royaltyType ?? 'royalty_unspecified';
  if (item.category === 'Trade Revenue') return 'trade';
  return 'other';
};

export const bucketOf = (item: Pick<Collection, 'category' | 'royaltyType'>): Bucket =>
  revenueBuckets.find((b) => b.key === bucketKeyOf(item)) ?? revenueBuckets[revenueBuckets.length - 1];

/** Text shown for one record: "Forest Royalty" / "የደን ሮያሊቲ", otherwise the normal category name. */
export const collectionLabel = (item: Pick<Collection, 'category' | 'royaltyType'>, lang: Lang): string =>
  item.category === 'Royalty' || item.category === 'Trade Revenue' ? (lang === 'am' ? bucketOf(item).am : bucketOf(item).en) : item.category;

/** Name of a category on the category buttons (the new trade category also has an Amharic name). */
export const categoryLabel = (category: Category, lang: Lang): string =>
  category === 'Trade Revenue' ? (lang === 'am' ? 'ከንግድ የሚገኝ ገቢ' : 'Trade Revenue') : category;

/** Totals per bucket. "Royalty (not specified)" is hidden when there is nothing in it. */
export const bucketTotals = (items: Pick<Collection, 'category' | 'royaltyType' | 'amount'>[]) =>
  revenueBuckets
    .map((bucket) => ({
      bucket,
      amount: items.filter((c) => bucketKeyOf(c) === bucket.key).reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    }))
    .filter((row) => row.bucket.key !== 'royalty_unspecified' || row.amount > 0);

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
