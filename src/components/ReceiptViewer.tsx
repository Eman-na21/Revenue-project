import { useEffect, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useLang } from '@/i18n';
import { getReceiptUrls } from '@/receipts';

/** Opens the receipt photos of one collection in a pop-up (use the arrows to move between them). */
function ReceiptViewer({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  const { lang } = useLang();
  const [urls, setUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(false);
  const key = paths.join('|');
  const count = paths.length;

  useEffect(() => {
    let cancelled = false;
    getReceiptUrls(paths)
      .then((signed) => {
        if (!cancelled) setUrls(signed);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(count - 1, i + 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, onClose]);

  const url = urls[index] ?? '';

  return (
    <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-[#102a43]/70 p-4 animate-fade-in" onClick={onClose}>
      <div className="relative max-h-[92vh] w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e9eff5] px-4 py-3">
          <span className="font-display text-sm font-bold text-[#102a43]">
            {lang === 'am' ? 'የደረሰኝ ፎቶ' : 'Receipt photo'}
            {count > 1 && <span className="ml-2 text-xs font-semibold text-[#829ab1]">{index + 1} / {count}</span>}
          </span>
          <div className="flex items-center gap-2">
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#2d7dd2] hover:underline">
                <ExternalLink size={13} /> {lang === 'am' ? 'ሙሉ መጠን' : 'Full size'}
              </a>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-[#627d98] hover:bg-[#f4f7fb]"><X size={18} /></button>
          </div>
        </div>

        <div className="relative flex max-h-[80vh] min-h-[220px] items-center justify-center overflow-auto bg-[#f4f7fb] p-2">
          {error ? (
            <p className="px-6 py-10 text-center text-sm text-[#c0392b]">{lang === 'am' ? 'ፎቶውን መክፈት አልተቻለም።' : 'Could not open the photo.'}</p>
          ) : url ? (
            <img key={url} src={url} alt="" className="max-h-[76vh] w-auto max-w-full rounded-lg object-contain" />
          ) : (
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#d9e2ec] border-t-[#2cb67d]" />
          )}

          {count > 1 && !error && (
            <>
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-[#102a43] shadow transition hover:bg-white disabled:opacity-30"
                aria-label="Previous photo"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}
                disabled={index === count - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-[#102a43] shadow transition hover:bg-white disabled:opacity-30"
                aria-label="Next photo"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A small camera button (with the number of photos when there are several). Shows nothing for records without photos. */
export function ReceiptButton({ paths }: { paths: string[] | null | undefined }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  if (!paths || paths.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={lang === 'am' ? 'የደረሰኝ ፎቶ ይመልከቱ' : 'View receipt photos'}
        className="ml-1.5 inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-md bg-[#eaf2fb] px-1.5 align-middle text-[11px] font-bold text-[#2d7dd2] transition hover:bg-[#d7e8fa]"
      >
        <Camera size={13} />
        {paths.length > 1 && <span>{paths.length}</span>}
      </button>
      {open && <ReceiptViewer paths={paths} onClose={() => setOpen(false)} />}
    </>
  );
}
