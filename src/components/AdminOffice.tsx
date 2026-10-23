import { useMemo, useState } from 'react';
import { AlertCircle, Check, Download, FileSpreadsheet, Receipt, Save, Search, Target } from 'lucide-react';
import { currentMonth, etb, formatDate, isoToday } from '@/types';
import { useLang } from '@/i18n';
import { ReceiptButton } from '@/components/ReceiptViewer';
import { downloadOfficeExcel, officeReportTitle } from '@/officeExcel';
import { OfficeAccountant, OfficeRevenue, RevenueCode, annualPlanOf, codeColors, codeLabel, codeName, monthlyPlanOf, percentOf, sortNewestFirst, sumAmount, totalsByCode } from '@/office';

type Props = {
  office: OfficeRevenue[];
  codes: RevenueCode[];
  accountant: OfficeAccountant | null;
  /** true for the administrator only (vice administrators can read, not change the plan) */
  canEditPlan: boolean;
  onSavePlan: (daily: number) => Promise<void>;
};

const MAX_ROWS = 200;

/** Office revenue (entered by the accountant): plan, totals by code and every entry. */
export function AdminOffice({ office, codes, accountant, canEditPlan, onSavePlan }: Props) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const [start, setStart] = useState(`${currentMonth}-01`);
  const [end, setEnd] = useState(isoToday);
  // The Excel report has its own From / To dates, chosen by the administrator (independent of the list filters below).
  const [reportStart, setReportStart] = useState(`${currentMonth}-01`);
  const [reportEnd, setReportEnd] = useState(isoToday);
  const [codeFilter, setCodeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [planDraft, setPlanDraft] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [planError, setPlanError] = useState('');

  const validRange = start !== '' && end !== '' && start <= end;

  const reportValid = reportStart !== '' && reportEnd !== '' && reportStart <= reportEnd;
  const reportItems = reportValid ? office.filter((item) => item.date >= reportStart && item.date <= reportEnd) : [];
  const reportChips: { label: string; from: string; to: string }[] = [
    { label: tr('Today', 'ዛሬ'), from: isoToday, to: isoToday },
    { label: tr('This month', 'ይህ ወር'), from: `${currentMonth}-01`, to: isoToday },
    { label: tr('This year', 'ይህ ዓመት'), from: `${isoToday.slice(0, 4)}-01-01`, to: isoToday },
  ];

  const inRange = useMemo(() => {
    if (!validRange) return [];
    let result = office.filter((item) => item.date >= start && item.date <= end);
    if (codeFilter !== 'all') result = result.filter((item) => item.code === codeFilter);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((item) => item.receipt.toLowerCase().includes(q) || item.notes.toLowerCase().includes(q));
    return result;
  }, [office, start, end, codeFilter, search, validRange]);

  const rangeTotal = sumAmount(inRange);
  const byCode = totalsByCode(inRange);
  const rows = sortNewestFirst(inRange);
  const usedCodes = useMemo(() => Array.from(new Set(office.map((item) => item.code))).sort(), [office]);

  const chips: { label: string; from: string; to: string }[] = [
    { label: tr('Today', 'ዛሬ'), from: isoToday, to: isoToday },
    { label: tr('This month', 'ይህ ወር'), from: `${currentMonth}-01`, to: isoToday },
    { label: tr('This year', 'ይህ ዓመት'), from: `${isoToday.slice(0, 4)}-01-01`, to: isoToday },
  ];

  const savePlan = async () => {
    const value = Number(planDraft);
    if (!Number.isFinite(value) || value < 0) {
      setPlanError(tr('Enter a valid amount (0 or more).', 'ትክክለኛ መጠን ያስገቡ (0 ወይም ከዚያ በላይ)።'));
      return;
    }
    setPlanBusy(true);
    setPlanError('');
    try {
      await onSavePlan(value);
      setPlanSaved(true);
      setPlanDraft('');
      window.setTimeout(() => setPlanSaved(false), 4000);
    } catch (err) {
      console.error('Plan save error:', err);
      setPlanError((err as { message?: string })?.message || tr('Could not save the plan. Please try again.', 'ዕቅዱን ማስቀመጥ አልተቻለም። እንደገና ይሞክሩ።'));
    }
    setPlanBusy(false);
  };

  return (
    <div className="space-y-6">
      <div className="animate-slide-up flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2cb67d]">{tr('Office control', 'የቢሮ ቁጥጥር')}</div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#102a43]">{tr('Office revenue', 'የቢሮ ገቢ')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#627d98]">
            {tr('Revenue entered by the office accountant under the revenue codes. It is kept apart from the field agents’ collections.', 'የቢሮው የሂሳብ ባለሙያ በገቢ ኮዶች የሚያስገባው ገቢ። ከ field agents ገቢ ተለይቶ ይቀመጣል።')}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff5dc] text-[#a36b05]">
            <Target size={19} />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-bold text-[#102a43]">{tr('Daily plan', 'ዕለታዊ ዕቅድ')}</h2>
            {accountant ? (
              <p className="mt-1 text-xs leading-5 text-[#829ab1]">
                {accountant.name} · {tr('plan', 'ዕቅድ')} {etb(accountant.daily)} {tr('per day', 'በቀን')} · {etb(monthlyPlanOf(accountant.daily))} {tr('per month', 'በወር')} · {etb(annualPlanOf(accountant.daily))} {tr('per year', 'በዓመት')}
              </p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-[#829ab1]">
                {tr('There is no accountant account yet. Create it with the steps at the end of 009_office_revenue.sql.', 'እስካሁን የሂሳብ ባለሙያ account የለም። በ 009_office_revenue.sql መጨረሻ ባሉት ደረጃዎች ይፍጠሩት።')}
              </p>
            )}
          </div>
        </div>

        {accountant && canEditPlan && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('New daily plan (ETB)', 'አዲስ ዕለታዊ ዕቅድ (ብር)')}</span>
              <input type="number" min="0" inputMode="numeric" value={planDraft} onChange={(e) => setPlanDraft(e.target.value)} placeholder={String(accountant.daily)} className="input" />
            </label>
            <button
              onClick={() => void savePlan()}
              disabled={planBusy || planDraft.trim() === ''}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2cb67d] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#239b68] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {planSaved ? <Check size={16} /> : <Save size={16} />} {planBusy ? tr('Saving…', 'በማስቀመጥ ላይ…') : planSaved ? tr('Saved', 'ተቀምጧል') : tr('Save plan', 'ዕቅዱን አስቀምጥ')}
            </button>
          </div>
        )}
        {planError && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#fff1f0] px-4 py-3 text-xs text-[#c0392b]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {planError}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5f6ef] text-[#157a56]">
            <FileSpreadsheet size={19} />
          </div>
          <div>
            <h2 className="font-display font-bold text-[#102a43]">{tr('Generate report (Excel)', 'ሪፖርት አውጣ (Excel)')}</h2>
            <p className="mt-1 text-xs leading-5 text-[#829ab1]">
              {tr(
                'Choose the From and To dates. The report lists every revenue code with its total for that period.',
                'ከ እና እስከ ቀኖችን ይምረጡ። ሪፖርቱ በዚያ ወቅት ውስጥ እያንዳንዱን የገቢ ኮድ ከድምሩ ጋር ያሳያል።',
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {reportChips.map((chip) => {
            const active = reportStart === chip.from && reportEnd === chip.to;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setReportStart(chip.from);
                  setReportEnd(chip.to);
                }}
                className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${active ? 'bg-[#102a43] text-white' : 'bg-[#f0f4f8] text-[#627d98] hover:bg-[#e9eff5]'}`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('From', 'ከ')}</span>
            <input type="date" value={reportStart} max={isoToday} onChange={(e) => setReportStart(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('To', 'እስከ')}</span>
            <input type="date" value={reportEnd} max={isoToday} onChange={(e) => setReportEnd(e.target.value)} className="input" />
          </label>
        </div>

        {reportValid ? (
          <div className="mt-4 space-y-1.5 rounded-xl bg-[#f4f7fb] p-4 text-xs leading-5 text-[#627d98]">
            <div>
              <span className="font-bold text-[#334e68]">{tr('Report title', 'የሪፖርቱ ርዕስ')}: </span>
              {officeReportTitle(reportStart, reportEnd)}
            </div>
            <div>
              <span className="font-bold text-[#334e68]">{tr('In this period', 'በዚህ ወቅት')}: </span>
              {reportItems.length} {tr('entries', 'መዝገቦች')} · {etb(sumAmount(reportItems))}
            </div>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#c0392b]">
            <AlertCircle size={14} /> {tr('The start date must not be after the end date.', 'የመጀመሪያው ቀን ከመጨረሻው ቀን መብለጥ የለበትም።')}
          </p>
        )}

        <button
          type="button"
          onClick={() => downloadOfficeExcel(office, codes, reportStart, reportEnd)}
          disabled={!reportValid}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white transition hover:bg-[#173f61] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={17} /> {tr('Generate report (Excel)', 'ሪፖርት አውጣ (Excel)')}
        </button>
      </section>

      <section className="rounded-2xl border border-[#d9e2ec] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const active = start === chip.from && end === chip.to;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setStart(chip.from);
                  setEnd(chip.to);
                }}
                className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${active ? 'bg-[#102a43] text-white' : 'bg-[#f0f4f8] text-[#627d98] hover:bg-[#e9eff5]'}`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('From', 'ከ')}</span>
            <input type="date" value={start} max={isoToday} onChange={(e) => setStart(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('To', 'እስከ')}</span>
            <input type="date" value={end} max={isoToday} onChange={(e) => setEnd(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('Revenue code', 'የገቢ ኮድ')}</span>
            <select value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} className="input">
              <option value="all">{tr('All codes', 'ሁሉም ኮዶች')}</option>
              {usedCodes.map((code) => (
                <option key={code} value={code}>{codeLabel(code, codes, lang)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('Search', 'ፈልግ')}</span>
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 text-[#829ab1]" size={17} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Receipt or notes', 'ደረሰኝ ወይም ማስታወሻ')} className="input pl-10" />
            </div>
          </label>
        </div>
        {!validRange && (
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#c0392b]">
            <AlertCircle size={14} /> {tr('The start date must not be after the end date.', 'የመጀመሪያው ቀን ከመጨረሻው ቀን መብለጥ የለበትም።')}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-[#102a43]">{tr('Total by revenue code', 'ድምር በገቢ ኮድ')}</h2>
            <p className="mt-1 text-xs text-[#829ab1]">{formatDate(start)} – {formatDate(end)} · {inRange.length} {tr('entries', 'መዝገቦች')}</p>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-[#829ab1]">{tr('Total', 'ድምር')}</div>
            <div className="font-display text-2xl font-bold text-[#102a43]">{etb(rangeTotal)}</div>
            {accountant && accountant.daily > 0 && start === end && (
              <div className="text-xs font-semibold text-[#2d7dd2]">{percentOf(rangeTotal, accountant.daily)}% {tr('of the daily plan', 'ከዕለታዊ ዕቅድ')}</div>
            )}
          </div>
        </div>
        {byCode.length === 0 ? (
          <p className="mt-5 text-sm text-[#829ab1]">{tr('No entries in this period.', 'በዚህ ጊዜ ውስጥ ምንም መዝገብ የለም።')}</p>
        ) : (
          <div className="mt-5 space-y-4">
            {byCode.map((row, index) => {
              const share = rangeTotal > 0 ? Math.round((row.amount / rangeTotal) * 100) : 0;
              const color = codeColors[index % codeColors.length];
              return (
                <div key={row.code}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="truncate font-semibold text-[#334e68]">{codeLabel(row.code, codes, lang)}</span>
                      <span className="shrink-0 text-xs text-[#829ab1]">×{row.count}</span>
                    </span>
                    <span className="shrink-0 font-bold text-[#102a43]">{etb(row.amount)} <span className="text-xs font-semibold text-[#829ab1]">{share}%</span></span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f4f8]">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-display font-bold text-[#102a43]">{tr('Entries', 'መዝገቦች')}</h2>
        <div className="mt-4 overflow-x-auto scrollbar">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[#e9eff5] text-xs text-[#829ab1]">
              <tr>
                <th className="pb-3 font-semibold">{tr('Date', 'ቀን')}</th>
                <th className="pb-3 font-semibold">{tr('Revenue code', 'የገቢ ኮድ')}</th>
                <th className="pb-3 font-semibold">{tr('Receipt', 'ደረሰኝ')}</th>
                <th className="pb-3 font-semibold">{tr('Notes', 'ማስታወሻ')}</th>
                <th className="pb-3 text-right font-semibold">{tr('Amount', 'መጠን')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-[#829ab1]">
                    <Receipt size={30} className="mx-auto mb-2 text-[#bcccdc]" />
                    {tr('No entries found.', 'ምንም መዝገብ አልተገኘም።')}
                  </td>
                </tr>
              )}
              {rows.slice(0, MAX_ROWS).map((item) => (
                <tr key={item.id} className="border-b border-[#f0f4f8] last:border-0">
                  <td className="py-3.5 text-[#627d98]">{formatDate(item.date)}</td>
                  <td className="py-3.5">
                    <span className="rounded-full bg-[#eaf2fb] px-2.5 py-1 text-xs font-semibold text-[#2d7dd2]">{item.code}</span>
                    {codeName(item.code, codes, lang) && <span className="ml-2 text-xs text-[#627d98]">{codeName(item.code, codes, lang)}</span>}
                  </td>
                  <td className="py-3.5 text-[#627d98]">{item.receipt}<ReceiptButton paths={item.receiptPaths} /></td>
                  <td className="max-w-[220px] truncate py-3.5 text-xs text-[#829ab1]">{item.notes}</td>
                  <td className="py-3.5 text-right font-bold">{etb(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > MAX_ROWS && (
          <p className="mt-3 text-xs text-[#829ab1]">
            {tr(`Showing the newest ${MAX_ROWS} of ${rows.length} entries. Narrow the dates, or download the Excel file for all of them.`, `ከ${rows.length} መዝገቦች አዲሶቹ ${MAX_ROWS} ብቻ ይታያሉ። ቀኖቹን ያጥቡ፣ ወይም ሁሉንም ለማየት Excel ያውርዱ።`)}
          </p>
        )}
      </section>
    </div>
  );
}
