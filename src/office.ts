import type { SupabaseClient } from '@supabase/supabase-js';
import { Lang, initialsOf, isoToday, currentMonth, currentYear } from '@/types';

/* ---------- Office revenue (entered by the accountant, kept apart from the agents' collections) ---------- */

export type RevenueCode = {
  code: string;
  nameEn: string;
  nameAm: string;
  active: boolean;
};

export type OfficeRevenue = {
  id: string;
  code: string;
  amount: number;
  receipt: string;
  /** Receipt photos in private storage. */
  receiptPaths: string[];
  notes: string;
  /** YYYY-MM-DD (the date of the revenue, in Addis Ababa time). */
  date: string;
  enteredBy: string;
  createdAt: string;
};

/** The accountant's profile. `daily` is his daily plan, set by the administrator. */
export type OfficeAccountant = {
  id: string;
  name: string;
  username: string;
  daily: number;
  active: boolean;
  avatar: string;
};

export type OfficeRevenueRow = {
  id: string;
  code: string;
  amount: unknown;
  receipt_number: string | null;
  receipt_paths: string[] | null;
  notes: string | null;
  revenue_date: string | null;
  entered_by: string | null;
  created_at: string | null;
};

export type RevenueCodeRow = {
  code: string;
  name_en: string | null;
  name_am: string | null;
  active: boolean | null;
};

export type AccountantProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  active: boolean | null;
  daily_target: number | string | null;
};

export const OFFICE_COLUMNS = 'id, code, amount, receipt_number, receipt_paths, notes, revenue_date, entered_by, created_at';
export const CODE_COLUMNS = 'code, name_en, name_am, active';

export function rowToOffice(row: OfficeRevenueRow): OfficeRevenue {
  const rawDate = row.revenue_date ?? row.created_at ?? '';
  return {
    id: String(row.id),
    code: String(row.code ?? '').trim(),
    amount: Number(row.amount) || 0,
    receipt: row.receipt_number ?? '',
    receiptPaths: row.receipt_paths ?? [],
    notes: row.notes ?? '',
    date: String(rawDate).trim().split('T')[0],
    enteredBy: String(row.entered_by ?? '').trim(),
    createdAt: row.created_at ?? '',
  };
}

export function rowToCode(row: RevenueCodeRow): RevenueCode {
  return {
    code: String(row.code ?? '').trim(),
    nameEn: row.name_en ?? '',
    nameAm: row.name_am ?? '',
    active: row.active !== false,
  };
}

export function rowToAccountant(row: AccountantProfileRow): OfficeAccountant {
  const username = String(row.username ?? '').trim();
  const name = String(row.full_name ?? '').trim() || username;
  return {
    id: String(row.id ?? '').trim(),
    name,
    username,
    daily: Number(row.daily_target) || 0,
    active: row.active !== false,
    avatar: initialsOf(name),
  };
}

/** Name of a code in the chosen language (falls back to the other language, then to nothing). */
export const codeName = (code: string, codes: RevenueCode[], lang: Lang): string => {
  const found = codes.find((item) => item.code === code);
  if (!found) return '';
  return lang === 'am' ? found.nameAm || found.nameEn : found.nameEn || found.nameAm;
};

/** "1101" when the code has no name yet, otherwise "1101 Name". */
export const codeLabel = (code: string, codes: RevenueCode[], lang: Lang): string => {
  const name = codeName(code, codes, lang);
  return name ? `${code} ${name}` : code;
};

/**
 * Supabase returns at most 1000 rows per request, so read the table page by page.
 * The result is OLDEST -> NEWEST (callers use .reverse() to show newest first).
 */
export async function fetchAllOffice(sb: SupabaseClient): Promise<OfficeRevenueRow[]> {
  const pageSize = 1000;
  const rows: OfficeRevenueRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('office_revenues')
      .select(OFFICE_COLUMNS)
      .order('revenue_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as OfficeRevenueRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/* ---------- Totals ---------- */

export const sumAmount = (items: { amount: number }[]): number => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

/** Monthly / annual plan are calculated from the daily plan the same way the agents' plans are. */
export const monthlyPlanOf = (daily: number): number => daily * 30;
export const annualPlanOf = (daily: number): number => daily * 365;

export const percentOf = (actual: number, plan: number): number => (plan > 0 ? Math.round((actual / plan) * 100) : 0);

export type OfficeTotals = { today: number; month: number; year: number; all: number };

export function officeTotals(items: OfficeRevenue[]): OfficeTotals {
  return {
    today: sumAmount(items.filter((item) => item.date === isoToday)),
    month: sumAmount(items.filter((item) => item.date.startsWith(currentMonth))),
    year: sumAmount(items.filter((item) => item.date.startsWith(currentYear))),
    all: sumAmount(items),
  };
}

/** Newest first: by revenue date, then by the time the entry was saved (an older date entered today still lands in the right day). */
export const sortNewestFirst = (items: OfficeRevenue[]): OfficeRevenue[] =>
  items.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

export type CodeTotal = { code: string; amount: number; count: number };

/** Totals per code, biggest first. Codes without entries are left out. */
export function totalsByCode(items: OfficeRevenue[]): CodeTotal[] {
  const map = new Map<string, CodeTotal>();
  for (const item of items) {
    const row = map.get(item.code) ?? { code: item.code, amount: 0, count: 0 };
    row.amount += Number(item.amount) || 0;
    row.count += 1;
    map.set(item.code, row);
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code));
}

/** Colours for the per-code bars (cycled). */
export const codeColors = ['#2d7dd2', '#2cb67d', '#e4b44c', '#0fa3b1', '#6f5acb', '#c0392b', '#8aa4bd'];

/* ---------- Correction requests (the accountant asks, the administrator approves or rejects) ---------- */

export type OfficeCorrectionStatus = 'pending' | 'approved' | 'rejected';

/** A request from the accountant to replace the wrong values of one saved office revenue entry. */
export type OfficeCorrection = {
  id: string;
  entryId: string;
  requestedBy: string;
  oldCode: string;
  oldAmount: number;
  oldReceipt: string;
  oldNotes: string;
  newCode: string;
  newAmount: number;
  newReceipt: string;
  newNotes: string;
  reason: string;
  status: OfficeCorrectionStatus;
  adminNote: string;
  createdAt: string;
  decidedAt: string | null;
};

/** What the accountant fills in when he asks for a correction. */
export type NewOfficeCorrectionInput = {
  entryId: string;
  code: string;
  amount: number;
  receipt: string;
  notes: string;
  reason: string;
};

export type OfficeCorrectionRow = {
  id: string;
  office_revenue_id: string;
  requested_by: string | null;
  old_code: string | null;
  old_amount: unknown;
  old_receipt_number: string | null;
  old_notes: string | null;
  new_code: string;
  new_amount: unknown;
  new_receipt_number: string | null;
  new_notes: string | null;
  reason: string | null;
  status: string | null;
  admin_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export const OFFICE_CORRECTION_COLUMNS =
  'id, office_revenue_id, requested_by, old_code, old_amount, old_receipt_number, old_notes, ' +
  'new_code, new_amount, new_receipt_number, new_notes, reason, status, admin_note, decided_at, created_at';

export function rowToOfficeCorrection(row: OfficeCorrectionRow): OfficeCorrection {
  return {
    id: String(row.id),
    entryId: String(row.office_revenue_id),
    requestedBy: String(row.requested_by ?? '').trim(),
    oldCode: String(row.old_code ?? '').trim(),
    oldAmount: Number(row.old_amount) || 0,
    oldReceipt: row.old_receipt_number ?? '',
    oldNotes: row.old_notes ?? '',
    newCode: String(row.new_code ?? '').trim(),
    newAmount: Number(row.new_amount) || 0,
    newReceipt: row.new_receipt_number ?? '',
    newNotes: row.new_notes ?? '',
    reason: row.reason ?? '',
    status: row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending',
    adminNote: row.admin_note ?? '',
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
  };
}
