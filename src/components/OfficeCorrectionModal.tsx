import { FormEvent, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { etb, formatDate } from '@/types';
import { useLang } from '@/i18n';
import { NewOfficeCorrectionInput, OfficeRevenue, RevenueCode, codeLabel } from '@/office';

type Props = {
  entry: OfficeRevenue;
  codes: RevenueCode[];
  onClose: () => void;
  onSubmit: (input: NewOfficeCorrectionInput) => Promise<void>;
};

/** The accountant writes the CORRECT values and a reason. The entry changes only after the administrator approves. */
export function OfficeCorrectionModal({ entry, codes, onClose, onSubmit }: Props) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const [code, setCode] = useState(entry.code);
  const [amount, setAmount] = useState(String(entry.amount));
  const [receipt, setReceipt] = useState(entry.receipt);
  const [notes, setNotes] = useState(entry.notes);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The code list: every active code, plus the entry's current code even if it was switched off later.
  const options = codes.filter((item) => item.active || item.code === entry.code);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError(tr('Please enter a valid amount.', 'ትክክለኛ መጠን ያስገቡ።'));
      return;
    }
    if (!receipt.trim()) {
      setError(tr('The receipt number is required.', 'የደረሰኝ ቁጥር ያስፈልጋል።'));
      return;
    }
    if (!reason.trim()) {
      setError(tr('Please write why the entry must be corrected.', 'መዝገቡ ለምን መስተካከል እንዳለበት ይጻፉ።'));
      return;
    }

    const unchanged =
      code === entry.code &&
      amountNumber === entry.amount &&
      receipt.trim() === entry.receipt.trim() &&
      notes.trim() === entry.notes.trim();
    if (unchanged) {
      setError(tr('Nothing has been changed. Change at least one value.', 'ምንም አልተቀየረም። ቢያንስ አንድ ዋጋ ይቀይሩ።'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSubmit({
        entryId: entry.id,
        code,
        amount: amountNumber,
        receipt: receipt.trim(),
        notes: notes.trim(),
        reason: reason.trim(),
      });
      onClose();
    } catch (err) {
      console.error('Office correction request error:', err);
      const message = (err as { message?: string })?.message;
      setError(message || tr('The request could not be sent. Please try again.', 'ጥያቄው አልተላከም። እንደገና ይሞክሩ።'));
      setBusy(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-[70] flex items-end justify-center bg-[#102a43]/60 p-0 sm:items-center sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-[#102a43]">{tr('Request a correction', 'እርማት ይጠይቁ')}</h3>
            <p className="mt-1 text-xs leading-5 text-[#829ab1]">
              {tr('Write the correct values. The entry changes only after the administrator approves.', 'ትክክለኛውን መረጃ ይጻፉ። መዝገቡ አስተዳዳሪው ሲያጸድቀው ብቻ ይቀየራል።')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#627d98] hover:bg-[#f4f7fb]" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mt-4 rounded-xl bg-[#f4f7fb] p-3.5 text-xs text-[#627d98]">
          <div className="mb-1 font-bold text-[#334e68]">{tr('Saved entry', 'የተቀመጠው መዝገብ')} · {formatDate(entry.date)}</div>
          {codeLabel(entry.code, codes, lang)} · {etb(entry.amount)} · {entry.receipt}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#334e68]">{tr('Revenue code', 'የገቢ ኮድ')}</span>
            <select value={code} onChange={(e) => setCode(e.target.value)} className="input">
              {options.map((item) => (
                <option key={item.code} value={item.code}>{codeLabel(item.code, codes, lang)}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#334e68]">{tr('Amount (ETB)', 'መጠን (ብር)')}</span>
              <input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#334e68]">{tr('Receipt number', 'የደረሰኝ ቁጥር')}</span>
              <input value={receipt} onChange={(e) => setReceipt(e.target.value)} className="input" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#334e68]">{tr('Note', 'ማስታወሻ')} <span className="font-normal text-[#829ab1]">({tr('optional', 'አማራጭ')})</span></span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#334e68]">{tr('Why must it be corrected?', 'ለምን መስተካከል አለበት?')} <span className="text-[#c0392b]">*</span></span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('For example: I typed 3000 instead of 300.', 'ለምሳሌ፦ 300 ብዬ 3000 ጽፌያለሁ።')} className="input resize-none" />
          </label>

          {error && (
            <p className="flex items-start gap-2 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[#d9e2ec] py-3.5 text-sm font-bold text-[#627d98] hover:bg-[#f4f7fb]">{tr('Cancel', 'ሰርዝ')}</button>
            <button disabled={busy} className="flex-1 rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white transition hover:bg-[#173f61] disabled:opacity-70">
              {busy ? tr('Sending…', 'በመላክ ላይ…') : tr('Send request', 'ጥያቄ ላክ')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
