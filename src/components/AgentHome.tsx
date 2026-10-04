import { useMemo } from 'react';
import { ArrowUpRight, CalendarDays, ClipboardList, Clock, MessageSquareText, Receipt, Target, TrendingUp } from 'lucide-react';
import { Agent, Collection, Recommendation, categories, categoryStyles, etb, etbShort, isoToday, currentMonth, formatDayLabel } from '@/types';
import { useLang } from '@/i18n';

type Props = {
  agent: Agent;
  collections: Collection[];
  recommendations: Recommendation[];
  onNavigate: (tab: 'entry' | 'collect' | 'history') => void;
};

export function AgentHome({ agent, collections, recommendations, onNavigate }: Props) {
  const { t } = useLang();
  const myCollections = useMemo(() => collections.filter(c => c.agentId === agent.id), [agent.id, collections]);
  const todayCollections = myCollections.filter(c => c.date === isoToday);
  const todayTotal = todayCollections.reduce((s, c) => s + c.amount, 0);
  const monthTotal = myCollections.filter(c => c.date.startsWith(currentMonth)).reduce((s, c) => s + c.amount, 0);
  const percent = agent.daily > 0 ? Math.min(100, Math.round((todayTotal / agent.daily) * 100)) : 0;
  const remaining = Math.max(0, agent.daily - todayTotal);
  const recent = myCollections.slice().reverse().slice(0, 3);

  const categoryTotals = categories.map(cat => ({
    cat,
    amount: todayCollections.filter(c => c.category === cat).reduce((s, c) => s + c.amount, 0),
  }));

  return (
    <div className="space-y-6">
      <div className="animate-slide-up rounded-3xl bg-gradient-to-br from-[#102a43] to-[#1c3d5a] p-6 text-white shadow-xl shadow-[#102a43]/15 sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#9fb3c8]">{t('welcomeBackAgent')}</p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">{agent.name}</h1>
            <p className="mt-1 text-sm text-[#bcccdc]">{t('revenueOfficeFieldAgent')}</p>
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
              <span className="text-[10px] uppercase tracking-wider text-[#9fb3c8]">{t('achieved')}</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-[#bcccdc]">{t('collectedToday')}</p>
            <p className="mt-1 font-display text-3xl font-bold">{etb(todayTotal)}</p>
            <p className="mt-2 text-sm text-[#9fb3c8]">{t('ofDailyTarget')} {etbShort(agent.daily)}</p>
            {remaining > 0 ? (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#e4b44c]">
                <Target size={13} /> {etb(remaining)} {t('toGo')}
              </div>
            ) : (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#2cb67d]/20 px-3 py-1 text-xs font-bold text-[#2cb67d]">
                <TrendingUp size={13} /> {t('targetReached')}
              </div>
            )}
          </div>
        </div>

        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between text-xs text-[#9fb3c8]">
            <span>{t('dailyProgress')}</span>
            <span>{percent}% {t('achieved')} — {etbShort(todayTotal)} / {etbShort(agent.daily)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#2cb67d] to-[#3dd68d] transition-all duration-1000 ease-out" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="rounded-2xl border border-[#2cb67d]/25 bg-[#e5f6ef] p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2cb67d] text-white"><MessageSquareText size={19} /></div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display font-bold text-[#102a43]">{t('recommendationFromAdmin')}</h3>
              <div className="mt-3 max-h-[260px] space-y-3 overflow-y-auto scrollbar pr-1">
                {recommendations.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[#2cb67d]/15 bg-white/70 p-3.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#829ab1]">
                      <Clock size={11} /> {t('recommendationSentOn')} {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <p className="whitespace-pre-line text-sm leading-6 text-[#334e68]">{item.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <CalendarDays size={16} />
            <span className="text-xs font-semibold">{t('thisMonth')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{etb(monthTotal)}</p>
          <p className="mt-1 text-xs text-[#2cb67d] font-semibold flex items-center gap-1">
            <ArrowUpRight size={12} /> {agent.monthly > 0 ? Math.round((monthTotal / agent.monthly) * 100) : 0}% {t('ofTarget')}
          </p>
        </div>
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <ClipboardList size={16} />
            <span className="text-xs font-semibold">{t('submissions')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{todayCollections.length}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{t('todayTotal')} · {myCollections.length} {t('total')}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:col-span-1">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <Target size={16} />
            <span className="text-xs font-semibold">{t('monthlyTargetShort')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{etbShort(agent.monthly)}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{etbShort(agent.annual)} {t('annual')}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
        <h3 className="font-display font-bold text-[#102a43]">{t('todaysBreakdown')}</h3>
        <p className="mt-1 text-xs text-[#829ab1]">{t('collectionsByCategory')}</p>
        <div className="mt-5 space-y-4">
          {categoryTotals.map(({ cat, amount }) => {
            const style = categoryStyles[cat];
            const catPercent = todayTotal > 0 ? Math.round((amount / todayTotal) * 100) : 0;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${style.solid}`} />
                    <span className="font-semibold text-[#334e68]">{cat}</span>
                  </span>
                  <span className="font-bold text-[#102a43]">{etb(amount)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f4f8]">
                  <div className={`h-full rounded-full ${style.solid} transition-all duration-700`} style={{ width: `${catPercent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-[#102a43]">{t('recentSubmissions')}</h3>
            <p className="mt-1 text-xs text-[#829ab1]">{t('yourLatestCollections')}</p>
          </div>
          <button onClick={() => onNavigate('history')} className="text-xs font-bold text-[#2d7dd2] hover:underline">{t('viewAll')}</button>
        </div>
        <div className="mt-4 space-y-3">
          {recent.length === 0 && (
            <div className="py-8 text-center text-sm text-[#829ab1]">
              {t('noSubmissionsYet')} <button onClick={() => onNavigate('collect')} className="font-bold text-[#2cb67d]">{t('recordOneNow')}</button>.
            </div>
          )}
          {recent.map(item => {
            const style = categoryStyles[item.category];
            return (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-[#e9eff5] p-3.5">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${style.bg} ${style.text}`}>
                    <Receipt size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#102a43]">{item.category}</div>
                    <div className="text-xs text-[#829ab1]">{formatDayLabel(item.date)} · {item.receipt}</div>
                  </div>
                </div>
                <span className="font-display font-bold text-[#102a43]">{etb(item.amount)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={() => onNavigate('collect')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2cb67d] py-4 text-sm font-bold text-white shadow-lg shadow-[#2cb67d]/20 transition hover:bg-[#239b68] active:scale-[.99]">
        <img src="/logo.jpg" alt="" className="h-6 w-6 rounded-lg" /> {t('recordNewCollection')}
      </button>
    </div>
  );
}
