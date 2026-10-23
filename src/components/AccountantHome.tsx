import { useMemo } from 'react';
import { ArrowUpRight, CalendarDays, ClipboardList, Plus, Receipt, Target, TrendingUp } from 'lucide-react';
import { etb, etbShort, formatDayLabel, isoToday, currentMonth } from '@/types';
import { useLang } from '@/i18n';
import { OfficeAccountant, OfficeRevenue, RevenueCode, codeColors, codeLabel, monthlyPlanOf, percentOf, sortNewestFirst, sumAmount, totalsByCode } from '@/office';

type Props = {
  accountant: OfficeAccountant;
  office: OfficeRevenue[];
  codes: RevenueCode[];
  onNavigate: (tab: 'accEntry' | 'accHistory') => void;
};

/** The accountant's start page: today against the daily plan set by the administrator. */
export function AccountantHome({ accountant, office, codes, onNavigate }: Props) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const today = useMemo(() => office.filter((item) => item.date === isoToday), [office]);
  const todayTotal = sumAmount(today);
  const monthTotal = sumAmount(office.filter((item) => item.date.startsWith(currentMonth)));
  const percent = Math.min(100, percentOf(todayTotal, accountant.daily));
  const remaining = Math.max(0, accountant.daily - todayTotal);
  const monthlyPlan = monthlyPlanOf(accountant.daily);
  const todayByCode = totalsByCode(today);
  const recent = sortNewestFirst(office).slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="animate-slide-up rounded-3xl bg-gradient-to-br from-[#102a43] to-[#1c3d5a] p-6 text-white shadow-xl shadow-[#102a43]/15 sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#9fb3c8]">{tr('Welcome back', 'እንኳን ደህና መጡ')}</p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">{accountant.name}</h1>
            <p className="mt-1 text-sm text-[#bcccdc]">{tr('Revenue office accountant', 'የገቢዎች ጽሕፈት ቤት የሂሳብ ባለሙያ')}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#2cb67d]">
            <Target size={24} />
          </div>
        </div>

        <div className="mt-8 flex items-center gap-6">
          <div className="relative h-32 w-32 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="7" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="#2cb67d" strokeWidth="7" strokeLinecap="round" strokeDasharray="283" strokeDashoffset={283 - (283 * percent) / 100} className="progress-ring" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-bold">{percent}%</span>
              <span className="text-[10px] uppercase tracking-wider text-[#9fb3c8]">{tr('of plan', 'ከዕቅድ')}</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-[#bcccdc]">{tr('Recorded today', 'ዛሬ የተመዘገበ')}</p>
            <p className="mt-1 font-display text-3xl font-bold">{etb(todayTotal)}</p>
            {accountant.daily > 0 ? (
              <>
                <p className="mt-2 text-sm text-[#9fb3c8]">{tr('of the daily plan', 'ከዕለታዊ ዕቅድ')} {etbShort(accountant.daily)}</p>
                {remaining > 0 ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#e4b44c]">
                    <Target size={13} /> {etb(remaining)} {tr('to go', 'ይቀራል')}
                  </div>
                ) : (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#2cb67d]/20 px-3 py-1 text-xs font-bold text-[#2cb67d]">
                    <TrendingUp size={13} /> {tr('Plan reached', 'ዕቅዱ ተሳክቷል')}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-[#9fb3c8]">{tr('The administrator has not set a daily plan yet.', 'አስተዳዳሪው ዕለታዊ ዕቅድ ገና አላወጣም።')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <CalendarDays size={16} />
            <span className="text-xs font-semibold">{tr('This month', 'ይህ ወር')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{etb(monthTotal)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#2cb67d]">
            <ArrowUpRight size={12} /> {percentOf(monthTotal, monthlyPlan)}% {tr('of the monthly plan', 'ከወርሃዊ ዕቅድ')}
          </p>
        </div>
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <ClipboardList size={16} />
            <span className="text-xs font-semibold">{tr('Entries today', 'የዛሬ መዝገቦች')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{today.length}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{office.length} {tr('in total', 'በጠቅላላው')}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:col-span-1">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <Target size={16} />
            <span className="text-xs font-semibold">{tr('Daily plan', 'ዕለታዊ ዕቅድ')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{etbShort(accountant.daily)}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{etbShort(monthlyPlan)} {tr('per month', 'በወር')}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
        <h3 className="font-display font-bold text-[#102a43]">{tr("Today's revenue by code", 'የዛሬ ገቢ በኮድ')}</h3>
        {todayByCode.length === 0 ? (
          <p className="mt-4 text-sm text-[#829ab1]">{tr('Nothing recorded today yet.', 'ዛሬ ምንም አልተመዘገበም።')}</p>
        ) : (
          <div className="mt-5 space-y-4">
            {todayByCode.map((row, index) => {
              const share = todayTotal > 0 ? Math.round((row.amount / todayTotal) * 100) : 0;
              const color = codeColors[index % codeColors.length];
              return (
                <div key={row.code}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-semibold text-[#334e68]">{codeLabel(row.code, codes, lang)}</span>
                      <span className="text-xs text-[#829ab1]">×{row.count}</span>
                    </span>
                    <span className="font-bold text-[#102a43]">{etb(row.amount)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f4f8]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${share}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-[#102a43]">{tr('Latest entries', 'የቅርብ ጊዜ መዝገቦች')}</h3>
          <button onClick={() => onNavigate('accHistory')} className="text-xs font-bold text-[#2d7dd2] hover:underline">{tr('View all', 'ሁሉንም ይመልከቱ')}</button>
        </div>
        <div className="mt-4 space-y-3">
          {recent.length === 0 && (
            <div className="py-8 text-center text-sm text-[#829ab1]">
              {tr('No entries yet.', 'እስካሁን ምንም መዝገብ የለም።')}{' '}
              <button onClick={() => onNavigate('accEntry')} className="font-bold text-[#2cb67d]">{tr('Record the first one', 'የመጀመሪያውን ይመዝግቡ')}</button>
            </div>
          )}
          {recent.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-[#e9eff5] p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf2fb] text-[#2d7dd2]">
                  <Receipt size={18} />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#102a43]">{codeLabel(item.code, codes, lang)}</div>
                  <div className="text-xs text-[#829ab1]">{formatDayLabel(item.date)} · {item.receipt}</div>
                </div>
              </div>
              <span className="font-display font-bold text-[#102a43]">{etb(item.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => onNavigate('accEntry')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2cb67d] py-4 text-sm font-bold text-white shadow-lg shadow-[#2cb67d]/20 transition hover:bg-[#239b68] active:scale-[.99]">
        <Plus size={18} /> {tr('Record revenue', 'ገቢ ይመዝግቡ')}
      </button>
    </div>
  );
}
