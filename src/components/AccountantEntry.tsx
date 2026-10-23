import { FormEvent, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, MessageSquare, Plus, Receipt } from 'lucide-react';
import { etb, isoToday } from '@/types';
import { useLang } from '@/i18n';
import { supabase } from '@/supabase';
import { OFFICE_COLUMNS, OfficeAccountant, OfficeRevenue, OfficeRevenueRow, RevenueCode, codeName, percentOf, rowToOffice, sumAmount } from '@/office';

type Props = {
  accountant: OfficeAccountant;
  office: OfficeRevenue[];
  codes: RevenueCode[];
  setOffice: (next: OfficeRevenue[] | ((current: OfficeRevenue[]) => OfficeRevenue[])) => void;
  onDone: () => void;
};

/**
 * The accountant sees EVERY revenue code at once and types an amount next to the codes he received
 * money for. Below the list he writes ONE receipt number (required) and an optional note that belong
 * to the whole submission, then presses Submit once. Codes left empty are ignored.
 */
export function AccountantEntry({ accountant, office, codes, setOffice, onDone }: Props) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const activeCodes = useMemo(() => codes.filter((item) => item.active), [codes]);

  const [date, setDate] = useState(isoToday);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [codeErrors, setCodeErrors] = useState<Record<string, string>>({});
  const [receiptError, setReceiptError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  const setAmount = (code: string, value: string) => {
    setAmounts((current) => ({ ...current, [code]: value }));
    setCodeErrors((current) => (current[code] ? { ...current, [code]: '' } : current));
  };

  const isFilled = (code: string) => (amounts[code] ?? '').trim() !== '';
  const amountOf = (code: string) => {
    const value = Number(amounts[code]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const filledCodes = activeCodes.filter((item) => isFilled(item.code));
  const enteredTotal = activeCodes.reduce((sum, item) => sum + amountOf(item.code), 0);
  const enteredCount = activeCodes.filter((item) => amountOf(item.code) > 0).length;
  const recordedToday = sumAmount(office.filter((item) => item.date === isoToday));
  const planPercent = Math.min(100, percentOf(recordedToday, accountant.daily));
  const afterPercent = percentOf(recordedToday + (date === isoToday ? enteredTotal : 0), accountant.daily);

  const validate = () => {
    const errors: Record<string, string> = {};
    for (const item of filledCodes) {
      if (amountOf(item.code) <= 0) errors[item.code] = tr('Enter a valid amount.', 'ትክክለኛ መጠን ያስገቡ።');
    }
    setCodeErrors(errors);

    let ok = true;
    let message = '';

    if (!date || date > isoToday) {
      message = tr('Choose today or an earlier date.', 'የዛሬን ወይም ቀደም ያለ ቀን ይምረጡ።');
      ok = false;
    } else if (filledCodes.length === 0) {
      message = tr('Enter an amount next to at least one code.', 'ቢያንስ ከአንድ ኮድ አጠገብ መጠን ያስገቡ።');
      ok = false;
    } else if (Object.keys(errors).length > 0) {
      message = tr('Some amounts need attention (marked in red).', 'አንዳንድ መጠኖች ማስተካከያ ያስፈልጋቸዋል (በቀይ ተለይተዋል)።');
      ok = false;
    }

    if (!receipt.trim()) {
      setReceiptError(tr('The receipt number is required.', 'የደረሰኝ ቁጥር ያስፈልጋል።'));
      ok = false;
    } else {
      setReceiptError('');
    }

    setFormError(message);
    return ok;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !validate()) return;

    if (!supabase) {
      setFormError(tr('Database connection is not configured.', 'የዳታቤዝ ግንኙነት አልተዘጋጀም።'));
      return;
    }

    setSubmitting(true);
    setSuccess('');

    // Every code with an amount becomes one row; they all share the same receipt number, note and date.
    const rows = filledCodes.map((item) => ({
      code: item.code,
      amount: amountOf(item.code),
      receipt_number: receipt.trim(),
      notes: notes.trim(),
      revenue_date: date,
    }));

    // One request for all rows: either every row is saved, or none is.
    const { data, error } = await supabase.from('office_revenues').insert(rows).select(OFFICE_COLUMNS);

    setSubmitting(false);

    if (error || !data) {
      console.error('Office revenue insert error:', error);
      setFormError(error?.message ?? tr('Could not save the entries.', 'መዝገቦቹን ማስቀመጥ አልተቻለም።'));
      return;
    }

    // Live updates may already have added some of these rows, so never add one twice.
    const saved = (data as unknown as OfficeRevenueRow[]).map(rowToOffice);
    setOffice((current) => {
      const known = new Set(current.map((item) => item.id));
      return [...current, ...saved.filter((item) => !known.has(item.id))];
    });

    setSuccess(`${saved.length} ${tr('codes', 'ኮዶች')} · ${etb(sumAmount(saved))} · ${receipt.trim()}`);
    setAmounts({});
    setReceipt('');
    setNotes('');
    setCodeErrors({});
    setReceiptError('');
    setFormError('');
    window.setTimeout(() => setSuccess(''), 5000);
  };

  return (
    <div className="space-y-6">
      <div className="animate-slide-up">
        <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2cb67d]">{tr('Office revenue', 'የቢሮ ገቢ')}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#102a43]">{tr('Record revenue', 'ገቢ ይመዝግቡ')}</h1>
        <p className="mt-2 text-sm text-[#627d98]">
          {tr(
            'Type the amount next to every code you received money for and leave the others empty. Then write the receipt number and press Submit once.',
            'ገንዘብ ከደረሰዎት ኮዶች ሁሉ አጠገብ መጠኑን ይጻፉ፣ ሌሎቹን ባዶ ይተዉ። ከዚያ የደረሰኝ ቁጥሩን ጽፈው አንድ ጊዜ አስገባ ይበሉ።',
          )}
        </p>
      </div>

      <div className="rounded-2xl bg-[#102a43] p-5 text-white shadow-lg shadow-[#102a43]/10">
        <div className="flex items-center justify-between text-xs text-[#9fb3c8]">
          <span>{tr("Today's progress", 'የዛሬ ሂደት')}</span>
          <span>{etb(recordedToday)} {tr('recorded', 'ተመዝግቧል')}</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#2cb67d] transition-all duration-700" style={{ width: `${planPercent}%` }} />
        </div>
        {enteredTotal > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[#3dd68d] animate-fade-in">
            <Plus size={14} />
            {tr('In this form', 'በዚህ ፎርም')}: {etb(enteredTotal)} ({enteredCount} {tr('codes', 'ኮዶች')})
            {date === isoToday && accountant.daily > 0 && ` · ${tr('after saving', 'ከተቀመጠ በኋላ')} ${afterPercent}% ${tr('of the plan', 'ከዕቅድ')}`}
          </div>
        )}
      </div>

      {success && (
        <div className="animate-scale-in flex items-center gap-3 rounded-2xl border border-[#2cb67d]/30 bg-[#e5f6ef] px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2cb67d] text-white">
            <Check size={20} />
          </div>
          <div>
            <div className="text-sm font-bold text-[#157a56]">{tr('Submitted', 'ገብቷል')}</div>
            <div className="text-xs text-[#157a56]/80">{success}</div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5f6ef] text-[#157a56]">
            <Receipt size={19} />
          </div>
          <div>
            <h3 className="font-display font-bold text-[#102a43]">{tr('Revenue by code', 'ገቢ በኮድ')}</h3>
            <p className="text-xs text-[#829ab1]">{tr('Codes without an amount are not saved.', 'መጠን የሌላቸው ኮዶች አይቀመጡም።')}</p>
          </div>
        </div>

        <label className="mb-6 block max-w-xs">
          <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
            <CalendarDays size={14} className="text-[#829ab1]" /> {tr('Date', 'ቀን')} <span className="text-[#c0392b]">*</span>
          </span>
          <input type="date" value={date} max={isoToday} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>

        {activeCodes.length === 0 && (
          <p className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">{tr('No revenue codes are available. Ask the administrator.', 'ምንም የገቢ ኮድ የለም። አስተዳዳሪውን ይጠይቁ።')}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activeCodes.map((item) => {
            const name = codeName(item.code, codes, lang);
            const filled = isFilled(item.code);
            const error = codeErrors[item.code];
            return (
              <div
                key={item.code}
                className={`rounded-xl border p-3.5 transition ${error ? 'border-[#c0392b]/50 bg-[#fff8f7]' : filled ? 'border-[#2cb67d]/50 bg-[#f4fbf8]' : 'border-[#e9eff5] bg-white'}`}
              >
                <div className="min-w-0">
                  <span className="rounded-full bg-[#eaf2fb] px-2.5 py-1 text-xs font-bold text-[#2d7dd2]">{item.code}</span>
                  {name && <span className="ml-2 text-xs text-[#627d98]">{name}</span>}
                </div>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={amounts[item.code] ?? ''}
                  onChange={(e) => setAmount(item.code, e.target.value)}
                  placeholder={tr('Amount (ETB)', 'መጠን (ብር)')}
                  aria-label={`${item.code} ${tr('amount', 'መጠን')}`}
                  className="input mt-3 !py-3"
                />
                {error && <p className="mt-2 text-xs text-[#c0392b]">{error}</p>}
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-5 border-t border-[#e9eff5] pt-6">
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
              <Receipt size={14} className="text-[#829ab1]" /> {tr('Receipt number', 'የደረሰኝ ቁጥር')} <span className="text-[#c0392b]">*</span>
            </span>
            <input
              value={receipt}
              onChange={(e) => {
                setReceipt(e.target.value);
                setReceiptError('');
              }}
              placeholder="e.g. CR-10490"
              className="input"
            />
            <span className="mt-1.5 block text-xs text-[#829ab1]">{tr('One receipt number for everything in this submission.', 'በዚህ ማስገቢያ ውስጥ ላሉ ሁሉ አንድ የደረሰኝ ቁጥር።')}</span>
            {receiptError && <span className="mt-1.5 block text-xs text-[#c0392b]">{receiptError}</span>}
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
              <MessageSquare size={14} className="text-[#829ab1]" /> {tr('Note', 'ማስታወሻ')} <span className="font-normal text-[#829ab1]">({tr('optional', 'አማራጭ')})</span>
            </span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none" />
          </label>
        </div>

        {formError && <p className="mt-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">{formError}</p>}

        <button type="submit" disabled={submitting || activeCodes.length === 0} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2cb67d] py-4 text-sm font-bold text-white shadow-lg shadow-[#2cb67d]/20 transition hover:bg-[#239b68] active:scale-[.99] disabled:opacity-70">
          <Check size={18} />
          {submitting
            ? tr('Saving…', 'በማስቀመጥ ላይ…')
            : enteredCount > 0
              ? `${tr('Submit', 'አስገባ')} (${enteredCount} · ${etb(enteredTotal)})`
              : tr('Submit', 'አስገባ')}
        </button>
      </form>

      <button onClick={onDone} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9e2ec] bg-white py-3.5 text-sm font-bold text-[#627d98] transition hover:bg-[#f4f7fb]">
        <ChevronDown size={16} /> {tr('View my entries', 'መዝገቦቼን ይመልከቱ')}
      </button>
    </div>
  );
}
