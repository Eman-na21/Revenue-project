import { useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Clock, X, XCircle } from 'lucide-react';
import { etb, formatDate } from '@/types';
import { useLang } from '@/i18n';
import { ReceiptButton } from '@/components/ReceiptViewer';
import { OfficeAccountant, OfficeCorrection, OfficeRevenue, RevenueCode, codeLabel } from '@/office';

type Props = {
  office: OfficeRevenue[];
  codes: RevenueCode[];
  accountant: OfficeAccountant | null;
  corrections: OfficeCorrection[];
  onDecide: (id: string, decision: 'approve' | 'reject', note: string) => Promise<void>;
};

function timeText(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The administrator sees the accountant's correction requests, compares OLD and NEW values, and approves or rejects. */
export function AdminOfficeCorrections({ office, codes, accountant, corrections, onDecide }: Props) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pending = corrections.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const decided = corrections.filter((r) => r.status !== 'pending').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')).slice(0, 30);

  const entryOf = (id: string) => office.find((item) => item.id === id);
  const who = accountant?.name ?? tr('Accountant', 'የሂሳብ ባለሙያ');

  const decide = async (request: OfficeCorrection, decision: 'approve' | 'reject') => {
    if (busyId) return;
    setBusyId(request.id);
    setErrors((current) => ({ ...current, [request.id]: '' }));
    try {
      await onDecide(request.id, decision, (notes[request.id] ?? '').trim());
    } catch (err) {
      console.error('Decision error:', err);
      const message = (err as { message?: string })?.message;
      setErrors((current) => ({ ...current, [request.id]: message || tr('Could not save the decision. Please try again.', 'ውሳኔውን ማስቀመጥ አልተቻለም። እንደገና ይሞክሩ።') }));
    }
    setBusyId(null);
  };

  const Row = ({ label, before, after }: { label: string; before: string; after: string }) => {
    const changed = before !== after;
    return (
      <div className={`grid grid-cols-[110px_1fr_1fr] items-center gap-2 rounded-lg px-3 py-2 text-xs sm:grid-cols-[130px_1fr_1fr] ${changed ? 'bg-[#fff9e8]' : 'bg-[#f8fafc]'}`}>
        <span className="font-semibold text-[#829ab1]">{label}</span>
        <span className={`break-words ${changed ? 'text-[#c0392b] line-through decoration-[#c0392b]/40' : 'text-[#627d98]'}`}>{before || '—'}</span>
        <span className={`break-words ${changed ? 'font-bold text-[#157a56]' : 'text-[#627d98]'}`}>{after || '—'}</span>
      </div>
    );
  };

  const Diff = ({ r }: { r: OfficeCorrection }) => (
    <div className="mt-4 space-y-1.5">
      <div className="grid grid-cols-[110px_1fr_1fr] gap-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[#829ab1] sm:grid-cols-[130px_1fr_1fr]">
        <span />
        <span>{tr('Saved now', 'አሁን የተቀመጠው')}</span>
        <span>{tr('Requested', 'የተጠየቀው')}</span>
      </div>
      <Row label={tr('Revenue code', 'የገቢ ኮድ')} before={codeLabel(r.oldCode, codes, lang)} after={codeLabel(r.newCode, codes, lang)} />
      <Row label={tr('Amount', 'መጠን')} before={etb(r.oldAmount)} after={etb(r.newAmount)} />
      <Row label={tr('Receipt no.', 'የደረሰኝ ቁጥር')} before={r.oldReceipt} after={r.newReceipt} />
      <Row label={tr('Note', 'ማስታወሻ')} before={r.oldNotes} after={r.newNotes} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2d7dd2]">{tr('Office revenue', 'የቢሮ ገቢ')}</div>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#102a43]">{tr('Accountant correction requests', 'የሂሳብ ባለሙያው የእርማት ጥያቄዎች')}</h2>
      </div>

      <section>
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-[#102a43]">
          <Clock size={18} className="text-[#e4b44c]" /> {tr('Waiting for approval', 'ማጽደቅ የሚጠባበቁ')} ({pending.length})
        </h3>

        {pending.length === 0 && (
          <div className="rounded-2xl border border-[#d9e2ec] bg-white py-10 text-center shadow-sm">
            <CheckCircle2 size={30} className="mx-auto text-[#2cb67d]" />
            <p className="mt-3 text-sm font-semibold text-[#627d98]">{tr('No requests are waiting.', 'የሚጠባበቅ ጥያቄ የለም።')}</p>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {pending.map((r) => {
            const entry = entryOf(r.entryId);
            return (
              <div key={r.id} className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center font-display font-bold text-[#102a43]">
                      {who}
                      <ReceiptButton paths={entry?.receiptPaths} />
                    </div>
                    <div className="mt-0.5 text-xs text-[#829ab1]">
                      {tr('Entry of', 'የመዝገብ ቀን')} {entry ? formatDate(entry.date) : '—'} · {tr('asked on', 'የተጠየቀው')} {timeText(r.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#fff5dc] px-2.5 py-1 text-xs font-bold text-[#a36b05]">{tr('Pending', 'በመጠበቅ ላይ')}</span>
                </div>

                <div className="mt-4 rounded-xl bg-[#f4f7fb] p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#829ab1]">{tr('Reason', 'ምክንያት')}</div>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#334e68]">{r.reason}</p>
                </div>

                <Diff r={r} />

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('Your note to the accountant (optional)', 'ለሂሳብ ባለሙያው ማስታወሻ (አማራጭ)')}</span>
                  <input value={notes[r.id] ?? ''} onChange={(e) => setNotes((current) => ({ ...current, [r.id]: e.target.value }))} className="input" />
                </label>

                {errors[r.id] && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#fff1f0] px-4 py-3 text-xs text-[#c0392b]">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" /> {errors[r.id]}
                  </p>
                )}

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => void decide(r, 'reject')}
                    disabled={busyId !== null}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#d9e2ec] py-3 text-sm font-bold text-[#c0392b] transition hover:bg-[#fff1f0] disabled:opacity-60"
                  >
                    <X size={16} /> {tr('Reject', 'አትቀበል')}
                  </button>
                  <button
                    onClick={() => void decide(r, 'approve')}
                    disabled={busyId !== null}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2cb67d] py-3 text-sm font-bold text-white transition hover:bg-[#239b68] disabled:opacity-60"
                  >
                    <Check size={16} /> {busyId === r.id ? tr('Saving…', 'በማስቀመጥ ላይ…') : tr('Approve and replace', 'አጽድቅና ተካ')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {decided.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-lg font-bold text-[#102a43]">{tr('Decided', 'የተወሰነባቸው')}</h3>
          <div className="space-y-3">
            {decided.map((r) => (
              <div key={r.id} className="rounded-2xl border border-[#e9eff5] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    {r.status === 'approved' ? <CheckCircle2 size={17} className="text-[#2cb67d]" /> : <XCircle size={17} className="text-[#c0392b]" />}
                    <span className="font-bold text-[#102a43]">{who}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === 'approved' ? 'bg-[#e5f6ef] text-[#157a56]' : 'bg-[#fff1f0] text-[#c0392b]'}`}>
                      {r.status === 'approved' ? tr('Approved', 'ጸድቋል') : tr('Rejected', 'ተቀባይነት አላገኘም')}
                    </span>
                  </div>
                  <span className="text-xs text-[#829ab1]">{r.decidedAt ? timeText(r.decidedAt) : ''}</span>
                </div>
                <div className="mt-2 text-xs text-[#627d98]">
                  {etb(r.oldAmount)} → <span className="font-bold text-[#102a43]">{etb(r.newAmount)}</span> · {codeLabel(r.newCode, codes, lang)} · {r.newReceipt}
                </div>
                {r.adminNote && <div className="mt-1.5 text-xs italic text-[#829ab1]">“{r.adminNote}”</div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
