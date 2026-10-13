import { supabase } from '@/supabase';
import { Agent, Collection, collectionLabel } from '@/types';
import { buildZip, ZipEntry } from '@/zip';

export const RECEIPT_BUCKET = 'receipts';

/* ---------- Shrinks a phone photo (often 5-10 MB) to about 100-200 KB, still readable ---------- */

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image'));
    };
    img.src = url;
  });

export async function compressImage(file: File, maxSide = 1280, quality = 0.65): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not supported on this device');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not compress the image');
  return blob;
}

/* ---------- Upload / view ---------- */

/** Saves the photo as "<agent id>/<random>.jpg" in the private bucket and returns that path. */
export async function uploadReceiptPhoto(agentId: string, photo: Blob): Promise<string> {
  if (!supabase) throw new Error('Database connection is not configured.');
  const path = `${agentId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, photo, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Temporary (5 minute) links to look at private photos, in the same order as `paths`. */
export async function getReceiptUrls(paths: string[]): Promise<string[]> {
  if (!supabase) throw new Error('Database connection is not configured.');
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(paths, 300);
  if (error || !data) throw error ?? new Error('Could not open the photos');
  const byPath = new Map(data.map((row) => [row.path ?? '', row.signedUrl]));
  return paths.map((path) => byPath.get(path) ?? '');
}

/* ---------- Admin: download all photos of a date range as one ZIP (folder per agent) ---------- */

const safeName = (value: string, fallback: string) => {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60);
  return cleaned || fallback;
};

export type ReceiptZipResult = { saved: number; failed: number; total: number };

export function receiptsInRange(collections: Collection[], rangeStart: string, rangeEnd: string): Collection[] {
  return collections.filter((c) => c.receiptPaths.length > 0 && c.date >= rangeStart && c.date <= rangeEnd);
}

/** Total number of photos (not records). */
export const countReceiptPhotos = (items: Collection[]): number =>
  items.reduce((sum, item) => sum + item.receiptPaths.length, 0);

export async function downloadReceiptsZip(
  agents: Agent[],
  collections: Collection[],
  rangeStart: string,
  rangeEnd: string,
  onProgress: (done: number, total: number) => void,
): Promise<ReceiptZipResult> {
  const sb = supabase;
  if (!sb) throw new Error('Database connection is not configured.');

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? 'Unknown agent';
  const items = receiptsInRange(collections, rangeStart, rangeEnd).sort(
    (a, b) => agentName(a.agentId).localeCompare(agentName(b.agentId)) || a.date.localeCompare(b.date),
  );

  // One job per PHOTO (a collection may have many)
  type Job = { item: Collection; path: string; number: number; of: number };
  const jobs: Job[] = items.flatMap((item) =>
    item.receiptPaths.map((path, i) => ({ item, path, number: i + 1, of: item.receiptPaths.length })),
  );

  const root = `receipts_${rangeStart}_to_${rangeEnd}`;
  const usedNames = new Set<string>();
  const entries: (ZipEntry | null)[] = new Array(jobs.length).fill(null);
  let done = 0;
  let failed = 0;
  let next = 0;
  onProgress(0, jobs.length);

  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      try {
        const { data, error } = await sb.storage.from(RECEIPT_BUCKET).download(job.path);
        if (error || !data) throw error ?? new Error('empty');
        const bytes = new Uint8Array(await data.arrayBuffer());

        const folder = safeName(agentName(job.item.agentId), 'Unknown agent');
        const label = collectionLabel(job.item, 'en').replace(/\s+/g, '-');
        const part = job.of > 1 ? `_${job.number}of${job.of}` : '';
        const base = `${job.item.date}_${safeName(job.item.receipt, 'receipt')}_${label}_${Math.round(job.item.amount)}ETB${part}`;
        let name = `${root}/${folder}/${base}.jpg`;
        for (let n = 2; usedNames.has(name); n++) name = `${root}/${folder}/${base}_${n}.jpg`;
        usedNames.add(name);

        entries[index] = { name, data: bytes };
      } catch {
        failed++;
      }
      done++;
      onProgress(done, jobs.length);
    }
  };

  await Promise.all([worker(), worker(), worker(), worker()]);

  const files = entries.filter((e): e is ZipEntry => e !== null);
  if (files.length > 0) {
    const blob = buildZip(files);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${root}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return { saved: files.length, failed, total: jobs.length };
}
