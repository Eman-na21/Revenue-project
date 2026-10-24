import { supabase } from '@/supabase';
import { Agent, Collection, initialsOf } from '@/types';

/* ---------- Totals of every agent, from the database ---------- */

export type LeaderRow = {
  agentId: string;
  name: string;
  dailyTarget: number;
  chat: number;
  forest: number;
  sand: number;
  royaltyUnspecified: number;
  trade: number;
  other: number;
};

/** Totals per agent for a date range. The database sends only totals, never single records. */
export async function fetchLeaderboard(start: string, end: string): Promise<LeaderRow[]> {
  if (!supabase) throw new Error('Database connection is not configured.');
  const { data, error } = await supabase.rpc('agent_leaderboard', { p_start: start, p_end: end });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    agentId: String(row.agent_id ?? ''),
    name: String(row.agent_name ?? ''),
    dailyTarget: Number(row.daily_target) || 0,
    chat: Number(row.chat) || 0,
    forest: Number(row.forest) || 0,
    sand: Number(row.sand) || 0,
    royaltyUnspecified: Number(row.royalty_unspecified) || 0,
    trade: Number(row.trade) || 0,
    other: Number(row.other) || 0,
  }));
}

/**
 * Turns the totals into the same kind of data the administrator's report is built from
 * (a list of agents and a few collection lines per agent), so the SAME Excel code can be used.
 */
export function leaderRowsToReportInput(rows: LeaderRow[], start: string): { agents: Agent[]; collections: Collection[] } {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));

  const agents: Agent[] = sorted.map((row) => ({
    id: row.agentId,
    name: row.name,
    username: row.name.toLowerCase(),
    daily: row.dailyTarget,
    monthly: row.dailyTarget * 30,
    annual: row.dailyTarget * 365,
    active: true,
    avatar: initialsOf(row.name),
  }));

  const collections: Collection[] = [];
  let counter = 0;
  const add = (agentId: string, category: Collection['category'], royaltyType: 'forest' | 'sand' | null, amount: number) => {
    if (amount <= 0) return;
    collections.push({
      id: `totals-${counter++}`,
      agentId,
      category,
      royaltyType,
      amount,
      receipt: '',
      notes: '',
      date: start,
    } as Collection);
  };

  for (const row of sorted) {
    add(row.agentId, 'Chat', null, row.chat);
    add(row.agentId, 'Royalty', 'forest', row.forest);
    add(row.agentId, 'Royalty', 'sand', row.sand);
    add(row.agentId, 'Royalty', null, row.royaltyUnspecified);
    add(row.agentId, 'Trade Revenue', null, row.trade);
    add(row.agentId, 'Other Revenue', null, row.other);
  }

  return { agents, collections };
}

/** "2026-10-11" + (-6) days -> "2026-10-05" (pure date maths, no time zone surprises). */
export const shiftDate = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
