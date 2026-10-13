import { Category, RoyaltyType, normalizeCategory, normalizeRoyaltyType } from '@/types';

export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

/** A request from an agent to replace the wrong values of one saved collection. */
export type CorrectionRequest = {
  id: string;
  collectionId: string;
  agentId: string;
  oldCategory: Category;
  oldRoyaltyType: RoyaltyType | null;
  oldAmount: number;
  oldReceipt: string;
  oldNotes: string;
  newCategory: Category;
  newRoyaltyType: RoyaltyType | null;
  newAmount: number;
  newReceipt: string;
  newNotes: string;
  reason: string;
  status: CorrectionStatus;
  adminNote: string;
  createdAt: string;
  decidedAt: string | null;
};

/** What the agent fills in when he asks for a correction. */
export type NewCorrectionInput = {
  collectionId: string;
  category: Category;
  royaltyType: RoyaltyType | null;
  amount: number;
  receipt: string;
  notes: string;
  reason: string;
};

export type CorrectionRow = {
  id: string;
  collection_id: string;
  agent_id: string;
  old_category: unknown;
  old_royalty_type: unknown;
  old_amount: unknown;
  old_receipt_number: string | null;
  old_notes: string | null;
  new_category: unknown;
  new_royalty_type: unknown;
  new_amount: unknown;
  new_receipt_number: string | null;
  new_notes: string | null;
  reason: string | null;
  status: string | null;
  admin_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export const CORRECTION_COLUMNS =
  'id, collection_id, agent_id, old_category, old_royalty_type, old_amount, old_receipt_number, old_notes, ' +
  'new_category, new_royalty_type, new_amount, new_receipt_number, new_notes, reason, status, admin_note, decided_at, created_at';

export function rowToCorrection(row: CorrectionRow): CorrectionRequest {
  const oldCategory = normalizeCategory(row.old_category);
  const newCategory = normalizeCategory(row.new_category);
  return {
    id: String(row.id),
    collectionId: String(row.collection_id),
    agentId: String(row.agent_id).trim(),
    oldCategory,
    oldRoyaltyType: oldCategory === 'Royalty' ? normalizeRoyaltyType(row.old_royalty_type) : null,
    oldAmount: Number(row.old_amount) || 0,
    oldReceipt: row.old_receipt_number ?? '',
    oldNotes: row.old_notes ?? '',
    newCategory,
    newRoyaltyType: newCategory === 'Royalty' ? normalizeRoyaltyType(row.new_royalty_type) : null,
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
