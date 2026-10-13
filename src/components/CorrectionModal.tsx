import { FormEvent, useState } from 'react';
import { AlertCircle, Check, FileText, X } from 'lucide-react';
import { Category, Collection, RoyaltyType, categories, categoryStyles, collectionLabel, etb, formatDate, revenueBuckets, royaltyTypes } from '@/types';
import { NewCorrectionInput } from '@/corrections';
import { useLang } from '@/i18n';

type Props = {
  record: Collection;
  onClose: () => void;
  onSubmit: (input: NewCorrectionInput) => Promise<void>;
};

/** The agent writes the CORRECT values and a reason. The record changes only after the administrator approves. */
export function CorrectionModal({ record, onClose, onSubmit }: Props) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const [category, setCategory] = useState<Category>(record.category);
  const [royaltyType, setRoyaltyType] = useState<RoyaltyType | null>(record.royaltyType);
  const [amount, setAmount] = useState(String(record.amount));
  const [receipt, setReceipt] = useState(record.receipt);
  const [notes, setNotes] = useState(record.notes);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    if (category === 'Royalty' && !royaltyType) {
      setError(tr('Please choose the royalty type (Forest or Sand).', 'የሮያሊቲ ዓይነት ይምረጡ (ደን ወይም አሸዋ)።'));
      return;
    }
    if (!reason.trim()) {
      setError(tr('Please write why the record must be corrected.', 'መዝገቡ ለምን መስተካከል እንዳለበት ይጻፉ።'));
      return;
    }

    const unchanged =
      category === record.category &&
      (category !== 'Royalty' || royaltyType === record.royaltyType) &&
      amountNumber === record.amount &&
      receipt.trim() === record.receipt.trim() &&
      notes.trim() === record.notes.trim();
    if (unchanged) {
      setError(tr('Nothing has been changed. Change at least one value.', 'ምንም አልተቀየረም። ቢያንስ አንድ ዋጋ ይቀይሩ።'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSubmit({
        collectionId: record.id,
        category,
        royaltyType: category === 'Royalty' ? royaltyType : null,
        amount: amountNumber,
        receipt: receipt.trim(),
        notes: notes.trim(),
        reason: reason.trim(),
      });
      onClose();
    } catch (err) {
      console.error('Correction request error:', err);
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
              {tr('Write the correct values. The record changes only after the administrator approves.', 'ትክክለኛውን መረጃ ይጻፉ። መዝገቡ አስተዳዳሪው ሲያጸድቀው ብቻ ይቀየራል።')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#627d98] hover:bg-[#f4f7fb]" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mt-4 rounded-xl bg-[#f4f7fb] p-3.5 text-xs text-[#627d98]">
          <div className="mb-1 font-bold text-[#334e68]">{tr('Saved record', 'የተቀመጠው መዝገብ')} · {formatDate(record.date)}</div>
          {collectionLabel(record, lang)} · {etb(record.amount)} · {record.receipt}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <div>
            <span className="mb-2 block text-sm font-semibold text-[#334e68]">{tr('Revenue category', 'የገቢ ምድብ')}</span>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((cat) => {
                const style = categoryStyles[cat];
                const selected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center text-xs font-bold transition ${selected ? `${style.light} border-current ${style.text}` : 'border-[#e9eff5] text-[#102a43] hover:border-[#d9e2ec]'}`}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.solid} text-white`}><FileText size={15} /></span>
                    {cat}
                  </button>
                );
              })}
            </div>

            {category === 'Royalty' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {royaltyTypes.map((type) => {
                  const bucket = revenueBuckets.find((b) => b.key === type)!;
                  const selected = royaltyType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setRoyaltyType(type)}
                      className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left text-sm font-bold transition ${selected ? `${bucket.bg} border-current ${bucket.text}` : 'border-[#e9eff5] text-[#102a43] hover:border-[#d9e2ec]'}`}
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${bucket.solid}`} />
                      {lang === 'am' ? bucket.am : bucket.en}
                      {selected && <Check size={16} className="ml-auto" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#334e68]">{tr('Amount (ETB)', 'መጠን (ብር)')}</span>
              <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#334e68]">{tr('Receipt number', 'የደረሰኝ ቁጥር')}</span>
              <input value={receipt} onChange={(e) => setReceipt(e.target.value)} className="input" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#334e68]">{tr('Notes', 'ማስታወሻ')} <span className="font-normal text-[#829ab1]">({tr('optional', 'አማራጭ')})</span></span>
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
