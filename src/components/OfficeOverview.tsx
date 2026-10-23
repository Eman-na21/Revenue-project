import { CalendarDays, Receipt, Target } from 'lucide-react';
import { currentMonth, etb, etbShort } from '@/types';
import { useLang } from '@/i18n';
import { OfficeAccountant, OfficeRevenue, OfficeTotals, RevenueCode, annualPlanOf, codeColors, codeLabel, monthlyPlanOf, percentOf, sumAmount, totalsByCode } from '@/office';

type Totals = { today: number; month: number; year: number };

/** Colours that tell the two sources apart everywhere on the overview. */
const AGENT_COLOR = '#2cb67d';
const OFFICE_COLOR = '#2d7dd2';

/** Grand total (field agents + office) with the split between the two, so they are never merged into one number. */
export function OfficeTotalBanner({ agents, office }: { agents: Totals; office: OfficeTotals }) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const total = agents.month + office.month;
  const agentShare = total > 0 ? Math.round((agents.month / total) * 100) : 0;
  const officeShare = total > 0 ? 100 - agentShare : 0;

  return (
    <div className="mb-6 rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#829ab1]">{tr('Total revenue this month', 'የዚህ ወር ጠቅላላ ገቢ')} · {currentMonth}</div>
          <div className="mt-1 font-display text-3xl font-bold tracking-tight text-[#102a43]">{etb(total)}</div>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="text-xs font-semibold text-[#829ab1]">{tr('Today', 'ዛሬ')}</div>
            <div className="font-display text-lg font-bold text-[#102a43]">{etb(agents.today + office.today)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#829ab1]">{tr('This year', 'ይህ ዓመት')}</div>
            <div className="font-display text-lg font-bold text-[#102a43]">{etb(agents.year + office.year)}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-[#f0f4f8]">
        <div className="h-full transition-all duration-700" style={{ width: `${agentShare}%`, backgroundColor: AGENT_COLOR }} />
        <div className="h-full transition-all duration-700" style={{ width: `${officeShare}%`, backgroundColor: OFFICE_COLOR }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <span className="flex items-center gap-2 text-[#627d98]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AGENT_COLOR }} />
          {tr('Field agents', 'Field agents')}
          <span className="font-bold text-[#102a43]">{etb(agents.month)}</span>
          <span className="text-xs text-[#829ab1]">{agentShare}%</span>
        </span>
        <span className="flex items-center gap-2 text-[#627d98]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OFFICE_COLOR }} />
          {tr('Office (accountant)', 'ቢሮ (የሂሳብ ባለሙያ)')}
          <span className="font-bold text-[#102a43]">{etb(office.month)}</span>
          <span className="text-xs text-[#829ab1]">{officeShare}%</span>
        </span>
      </div>
    </div>
  );
}

/** Small heading that names which source the cards below belong to. */
export function SourceHeading({ color, title, hint }: { color: string; title: string; hint?: string }) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-2 first:mt-0">
      <span className="h-3 w-1 rounded-full" style={{ backgroundColor: color }} />
      <h2 className="font-display text-base font-bold text-[#102a43]">{title}</h2>
      {hint && <span className="text-xs text-[#829ab1]">{hint}</span>}
    </div>
  );
}

export const agentSourceColor = AGENT_COLOR;
export const officeSourceColor = OFFICE_COLOR;

function KpiCard({ label, value, sub, subTone, icon, tone }: { label: string; value: string; sub: string; subTone?: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
        <div className={`text-xs font-semibold ${subTone ?? 'text-[#829ab1]'}`}>{sub}</div>
      </div>
      <div className="mt-5 text-xs font-semibold text-[#829ab1]">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tracking-tight text-[#102a43]">{value}</div>
    </div>
  );
}

/** Office revenue today / this month / this year, each against the plan the administrator set. */
export function OfficeKpiRow({ accountant, totals }: { accountant: OfficeAccountant | null; totals: OfficeTotals }) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const daily = accountant?.daily ?? 0;
  const hasPlan = daily > 0;

  return (
    <>
      <SourceHeading color={OFFICE_COLOR} title={tr('Office revenue', 'የቢሮ ገቢ')} hint={accountant ? accountant.name : undefined} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={tr('Recorded today', 'ዛሬ የተመዘገበ')}
          value={etb(totals.today)}
          sub={hasPlan ? `${percentOf(totals.today, daily)}% ${tr('of plan', 'ከዕቅድ')}` : tr('Today', 'ዛሬ')}
          subTone={hasPlan ? 'text-[#2d7dd2]' : undefined}
          tone="bg-[#eaf2fb] text-[#2d7dd2]"
          icon={<Receipt size={20} />}
        />
        <KpiCard
          label={tr('This month', 'ይህ ወር')}
          value={etb(totals.month)}
          sub={hasPlan ? `${percentOf(totals.month, monthlyPlanOf(daily))}% ${tr('of plan', 'ከዕቅድ')}` : currentMonth}
          subTone={hasPlan ? 'text-[#2d7dd2]' : undefined}
          tone="bg-[#e0f5f7] text-[#0b7f8a]"
          icon={<CalendarDays size={20} />}
        />
        <KpiCard
          label={tr('This year', 'ይህ ዓመት')}
          value={etb(totals.year)}
          sub={hasPlan ? `${percentOf(totals.year, annualPlanOf(daily))}% ${tr('of plan', 'ከዕቅድ')}` : tr('Year', 'ዓመት')}
          subTone={hasPlan ? 'text-[#2d7dd2]' : undefined}
          tone="bg-[#f1edff] text-[#6f5acb]"
          icon={<Target size={20} />}
        />
        <KpiCard
          label={tr('Daily plan', 'ዕለታዊ ዕቅድ')}
          value={hasPlan ? etb(daily) : '—'}
          sub={hasPlan ? `${etbShort(monthlyPlanOf(daily))} ${tr('per month', 'በወር')}` : tr('Not set', 'አልተወሰነም')}
          tone="bg-[#fff5dc] text-[#a36b05]"
          icon={<Target size={20} />}
        />
      </div>
    </>
  );
}

/** This month's office revenue split by revenue code (top codes), with a link to the full office page. */
export function OfficeBreakdown({ office, codes, onOpen }: { office: OfficeRevenue[]; codes: RevenueCode[]; onOpen: () => void }) {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const month = office.filter((item) => item.date.startsWith(currentMonth));
  const monthTotal = sumAmount(month);
  const rows = totalsByCode(month);
  const shown = rows.slice(0, 6);
  const rest = rows.slice(6);
  const restAmount = rest.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="mt-6 rounded-2xl border border-[#d9e2ec] bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-bold">{tr('Office revenue by code', 'የቢሮ ገቢ በኮድ')}</h3>
          <p className="mt-1 text-xs text-[#829ab1]">{tr('This month', 'ይህ ወር')} · {currentMonth}</p>
        </div>
        <button onClick={onOpen} className="text-xs font-bold text-[#2d7dd2] hover:underline">{tr('Open office revenue', 'የቢሮ ገቢን ክፈት')}</button>
      </div>
      {shown.length === 0 ? (
        <p className="mt-5 text-sm text-[#829ab1]">{tr('No office revenue recorded this month.', 'በዚህ ወር ምንም የቢሮ ገቢ አልተመዘገበም።')}</p>
      ) : (
        <div className="mt-5 space-y-4">
          {shown.map((row, index) => {
            const share = monthTotal > 0 ? Math.round((row.amount / monthTotal) * 100) : 0;
            const color = codeColors[index % codeColors.length];
            return (
              <div key={row.code}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="truncate font-semibold text-[#334e68]">{codeLabel(row.code, codes, lang)}</span>
                  </span>
                  <span className="shrink-0 font-bold text-[#102a43]">{etb(row.amount)} <span className="text-xs font-semibold text-[#829ab1]">{share}%</span></span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f4f8]">
                  <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
          {rest.length > 0 && (
            <div className="flex items-center justify-between text-sm text-[#627d98]">
              <span>{tr(`${rest.length} other codes`, `ሌሎች ${rest.length} ኮዶች`)}</span>
              <span className="font-semibold">{etb(restAmount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
