import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, Clock, Filter, Pencil, Receipt, Search, XCircle } from 'lucide-react';
import { Agent, BucketKey, Collection, bucketKeyOf, bucketOf, collectionLabel, etb, etbShort, formatDate, formatDayLabel, isoToday, currentMonth, revenueBuckets } from '@/types';
import { useLang } from '@/i18n';
import { AgentReport } from '@/components/AgentReport';
import { CorrectionModal } from '@/components/CorrectionModal';
import { CorrectionRequest, NewCorrectionInput } from '@/corrections';
import { ReceiptButton } from '@/components/ReceiptViewer';

type Props = {
  agent: Agent;
  collections: Collection[];
  corrections: CorrectionRequest[];
  onSubmitCorrection: (input: NewCorrectionInput) => Promise<void>;
};

type FilterChip = 'All' | BucketKey;

export function AgentHistory({ agent, collections, corrections, onSubmitCorrection }: Props) {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState<FilterChip>('All');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Collection | null>(null);

  const allMine = useMemo(() => collections.filter(c => c.agentId === agent.id), [agent.id, collections]);

  const filtered = useMemo(() => {
    let result = allMine;
    if (filter !== 'All') result = result.filter(c => bucketKeyOf(c) === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => c.receipt.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q));
    }
    return result.slice().reverse();
  }, [allMine, filter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Collection[]>();
    for (const item of filtered) {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date)!.push(item);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const monthTotal = allMine.filter(c => c.date.startsWith(currentMonth)).reduce((s, c) => s + c.amount, 0);
  const todayTotal = allMine.filter(c => c.date === isoToday).reduce((s, c) => s + c.amount, 0);
  const todayCount = allMine.filter(c => c.date === isoToday).length;

  const hasUnspecified = allMine.some(c => bucketKeyOf(c) === 'royalty_unspecified');
  const chips: FilterChip[] = ['All', ...revenueBuckets.filter(b => b.key !== 'royalty_unspecified' || hasUnspecified).map(b => b.key)];

  return (
    <div className="space-y-6">
      <div className="animate-slide-up">
        <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2cb67d]">{t('fieldCollection')}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#102a43]">{t('myHistory')}</h1>
        <p className="mt-2 text-sm text-[#627d98]">{t('reviewDescription')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <CalendarDays size={16} />
            <span className="text-xs font-semibold">{t('thisMonth')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{etb(monthTotal)}</p>
          <p className="mt-1 text-xs text-[#2d7dd2] font-semibold">{agent.monthly > 0 ? Math.round((monthTotal / agent.monthly) * 100) : 0}% {t('ofMonthlyTarget')}</p>
        </div>
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <ClipboardList size={16} />
            <span className="text-xs font-semibold">{t('today')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{etb(todayTotal)}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{todayCount} {t('submissions')}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:col-span-1">
          <div className="flex items-center gap-2 text-[#829ab1]">
            <Receipt size={16} />
            <span className="text-xs font-semibold">{t('totalEntries')}</span>
          </div>
          <p className="mt-3 font-display text-xl font-bold text-[#102a43]">{allMine.length}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{etbShort(allMine.reduce((s, c) => s + c.amount, 0))} {t('allTime')}</p>
        </div>
      </div>

      <AgentReport />

      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 text-[#829ab1]" size={17} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchByReceipt')} className="input pl-10" />
          </div>
          <div className="flex items-center gap-2 text-xs text-[#829ab1]">
            <Filter size={14} /> {t('filter')}:
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map(chip => {
              const active = filter === chip;
              const style = chip !== 'All' ? revenueBuckets.find(b => b.key === chip) ?? null : null;
              return (
                <button key={chip} onClick={() => setFilter(chip)} className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${active ? style ? `${style.solid} text-white` : 'bg-[#102a43] text-white' : style ? `${style.bg} ${style.text} hover:opacity-80` : 'bg-[#f0f4f8] text-[#627d98] hover:bg-[#e9eff5]'}`}>
                  {style ? (lang === 'am' ? style.am : style.en) : chip}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {grouped.length === 0 && (
          <div className="rounded-2xl border border-[#d9e2ec] bg-white py-16 text-center shadow-sm">
            <Receipt size={36} className="mx-auto text-[#bcccdc]" />
            <p className="mt-4 text-sm font-semibold text-[#627d98]">{t('noSubmissionsFound')}</p>
            <p className="mt-1 text-xs text-[#829ab1]">{t('tryAdjusting')}</p>
          </div>
        )}
        {grouped.map(([date, items]) => {
          const dayTotal = items.reduce((s, c) => s + c.amount, 0);
          return (
            <div key={date} className="animate-fade-in">
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#2cb67d]" />
                  <span className="text-sm font-bold text-[#102a43]">{formatDayLabel(date)}</span>
                  <span className="text-xs text-[#829ab1]">{formatDate(date)}</span>
                </div>
                <span className="text-xs font-bold text-[#627d98]">{etb(dayTotal)}</span>
              </div>
              <div className="space-y-3">
                {items.map(item => {
                  const style = bucketOf(item);
                  const requests = corrections.filter(r => r.collectionId === item.id);
                  const pendingRequest = requests.find(r => r.status === 'pending');
                  const lastDecided = requests
                    .filter(r => r.status !== 'pending')
                    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))[0];
                  return (
                    <div key={item.id} className="rounded-xl border border-[#e9eff5] bg-white p-4 shadow-sm transition hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${style.bg} ${style.text}`}>
                            <Receipt size={19} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[#102a43]">{collectionLabel(item, lang)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.bg} ${style.text}`}>{item.receipt}</span>
                              <ReceiptButton paths={item.receiptPaths} />
                            </div>
                            {item.notes && <div className="mt-1 text-xs text-[#829ab1]">{item.notes}</div>}
                          </div>
                        </div>
                        <span className="font-display text-lg font-bold text-[#102a43]">{etb(item.amount)}</span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f0f4f8] pt-3 text-xs">
                        {pendingRequest ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5dc] px-2.5 py-1 font-bold text-[#a36b05]">
                            <Clock size={12} /> {lang === 'am' ? 'እርማት ተጠይቋል፣ አስተዳዳሪው እየጠበቀ ነው' : 'Correction requested, waiting for the administrator'}
                          </span>
                        ) : lastDecided?.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e5f6ef] px-2.5 py-1 font-bold text-[#157a56]">
                            <CheckCircle2 size={12} /> {lang === 'am' ? 'ተስተካክሏል' : 'Corrected'}
                          </span>
                        ) : lastDecided?.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff1f0] px-2.5 py-1 font-bold text-[#c0392b]">
                            <XCircle size={12} /> {lang === 'am' ? 'እርማቱ ተቀባይነት አላገኘም' : 'Correction rejected'}{lastDecided.adminNote ? `: ${lastDecided.adminNote}` : ''}
                          </span>
                        ) : null}

                        {!pendingRequest && (
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-[#2d7dd2] transition hover:bg-[#eaf2fb]"
                          >
                            <Pencil size={12} /> {lang === 'am' ? 'እርማት ጠይቅ' : 'Request correction'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {editing && <CorrectionModal record={editing} onClose={() => setEditing(null)} onSubmit={onSubmitCorrection} />}
    </div>
  );
}
