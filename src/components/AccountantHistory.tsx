import { useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, Receipt, Search } from 'lucide-react';
import { currentMonth, etb, etbShort, formatDate, formatDayLabel, isoToday } from '@/types';
import { useLang } from '@/i18n';
import { ReceiptButton } from '@/components/ReceiptViewer';
import { OfficeAccountant, OfficeRevenue, RevenueCode, codeLabel, monthlyPlanOf, percentOf, sortNewestFirst, sumAmount } from '@/office';

type Props = {
  accountant: OfficeAccountant;
  office: OfficeRevenue[];
  codes: RevenueCode[];
};

/** All office revenue entries, newest first, grouped by day. */
export function AccountantHistory({ accountant, office, codes }: Props) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const [codeFilter, setCodeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const usedCodes = useMemo(() => Array.from(new Set(office.map((item) => item.code))).sort(), [office]);

  const filtered = useMemo(() => {
    let result = office;
    if (codeFilter !== 'all') result = result.filter((item) => item.code === codeFilter);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((item) => item.receipt.toLowerCase().includes(q) || item.notes.toLowerCase().includes(q));
    return sortNewestFirst(result);
  }, [office, codeFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, OfficeRevenue[]>();
    for (const item of filtered) {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date)!.push(item);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const monthTotal = sumAmount(office.filter((item) => item.date.startsWith(currentMonth)));
  const todayItems = office.filter((item) => item.date === isoToday);

  return (
    <div className="space-y-6">
      <div className="animate-slide-up">
        <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2cb67d]">{tr('Office revenue', 'የቢሮ ገቢ')}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#102a43]">{tr('My entries', 'መዝገቦቼ')}</h1>
        <p className="mt-2 text-sm text-[#627d98]">{tr('To correct a mistake, tell the administrator.', 'ስህተት ለማስተካከል አስተዳዳሪውን ያሳውቁ።')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <CalendarDays size={16} />
            <span className="text-xs font-semibold">{tr('This month', 'ይህ ወር')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{etb(monthTotal)}</p>
          <p className="mt-1 text-xs font-semibold text-[#2d7dd2]">{percentOf(monthTotal, monthlyPlanOf(accountant.daily))}% {tr('of the monthly plan', 'ከወርሃዊ ዕቅድ')}</p>
        </div>
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <ClipboardList size={16} />
            <span className="text-xs font-semibold">{tr('Today', 'ዛሬ')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{etb(sumAmount(todayItems))}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{todayItems.length} {tr('entries', 'መዝገቦች')}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:col-span-1">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <Receipt size={16} />
            <span className="text-xs font-semibold">{tr('Total entries', 'ጠቅላላ መዝገቦች')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{office.length}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{etbShort(sumAmount(office))} {tr('all time', 'በጠቅላላው')}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 text-[#829ab1]" size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Search by receipt number or notes', 'በደረሰኝ ቁጥር ወይም ማስታወሻ ይፈልጉ')} className="input pl-10" />
          </div>
          <select value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} className="input sm:max-w-[240px]">
            <option value="all">{tr('All codes', 'ሁሉም ኮዶች')}</option>
            {usedCodes.map((code) => (
              <option key={code} value={code}>{codeLabel(code, codes, lang)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {grouped.length === 0 && (
          <div className="rounded-2xl border border-[#d9e2ec] bg-white py-16 text-center shadow-sm">
            <Receipt size={36} className="mx-auto text-[#bcccdc]" />
            <p className="mt-4 text-sm font-semibold text-[#627d98]">{tr('No entries found.', 'ምንም መዝገብ አልተገኘም።')}</p>
            <p className="mt-1 text-xs text-[#829ab1]">{tr('Try another code or search.', 'ሌላ ኮድ ወይም ፍለጋ ይሞክሩ።')}</p>
          </div>
        )}
        {grouped.map(([date, items]) => (
          <div key={date} className="animate-fade-in">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#2cb67d]" />
                <span className="text-sm font-bold text-[#102a43]">{formatDayLabel(date)}</span>
                <span className="text-xs text-[#829ab1]">{formatDate(date)}</span>
              </div>
              <span className="text-xs font-bold text-[#627d98]">{etb(sumAmount(items))}</span>
            </div>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-[#e9eff5] bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf2fb] text-[#2d7dd2]">
                        <Receipt size={19} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-[#102a43]">{codeLabel(item.code, codes, lang)}</span>
                          <span className="rounded-full bg-[#eaf2fb] px-2 py-0.5 text-[10px] font-bold text-[#2d7dd2]">{item.receipt}</span>
                          <ReceiptButton paths={item.receiptPaths} />
                        </div>
                        {item.notes && <div className="mt-1 text-xs text-[#829ab1]">{item.notes}</div>}
                      </div>
                    </div>
                    <span className="shrink-0 font-display text-lg font-bold text-[#102a43]">{etb(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
