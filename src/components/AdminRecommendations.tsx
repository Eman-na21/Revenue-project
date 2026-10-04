import { useState } from 'react';
import { AlertCircle, Check, Clock, MessageSquareText, Save, Send, TrendingUp } from 'lucide-react';
import { Agent, Collection, Recommendation, etb, isoToday } from '@/types';
import { useLang } from '@/i18n';

type Props = {
  agents: Agent[];
  collections: Collection[];
  recommendations: Recommendation[];
  onSave: (recommendation: Recommendation) => Promise<void>;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AdminRecommendations({ agents, collections, recommendations, onSave }: Props) {
  const { t } = useLang();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const send = async (agent: Agent) => {
    const message = (drafts[agent.id] ?? '').trim();
    if (!message) return;
    setSavingId(agent.id);
    setSavedId(null);
    setErrorId(null);
    try {
      await onSave({ id: '', agentId: agent.id, message, createdAt: new Date().toISOString() });
      setDrafts((current) => ({ ...current, [agent.id]: '' }));
      setSavedId(agent.id);
      setExpandedId(agent.id);
    } catch {
      setErrorId(agent.id);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="animate-slide-up">
        <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2cb67d]">{t('officeControl')}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#102a43]">{t('recommendationsTitle')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#627d98]">{t('recommendationsDescription')}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {agents.map((agent) => {
          const todayTotal = collections.filter((item) => item.agentId === agent.id && item.date === isoToday).reduce((sum, item) => sum + item.amount, 0);
          const progress = agent.daily > 0 ? Math.min(100, Math.round((todayTotal / agent.daily) * 100)) : 0;
          const history = recommendations.filter((item) => item.agentId === agent.id);
          const hasDraft = Boolean((drafts[agent.id] ?? '').trim());
          const isExpanded = expandedId === agent.id;

          return (
            <section key={agent.id} className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eaf2fb] text-sm font-bold text-[#2d7dd2]">{agent.avatar}</div>
                  <div className="min-w-0">
                    <h2 className="truncate font-display font-bold text-[#102a43]">{agent.name}</h2>
                    <p className="text-xs text-[#829ab1]">@{agent.username}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${progress >= 100 ? 'bg-[#e5f6ef] text-[#157a56]' : 'bg-[#fff5dc] text-[#a36b05]'}`}>
                  {progress}%
                </span>
              </div>

              <div className="mt-5 rounded-xl bg-[#f4f7fb] p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-[#627d98]"><TrendingUp size={14} /> {t('performanceToday')}</span>
                  <span className="font-bold text-[#102a43]">{etb(todayTotal)} / {etb(agent.daily)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#d9e2ec]">
                  <div className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-[#2cb67d]' : 'bg-[#e4b44c]'}`} style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 text-[11px] text-[#829ab1]">{t('targetProgress')}</div>
              </div>

              <div className="mt-5">
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#334e68]">
                  <Send size={16} className="text-[#2cb67d]" />
                  {t('sendNewRecommendation')}
                </label>
                <textarea
                  value={drafts[agent.id] ?? ''}
                  onChange={(event) => setDrafts((current) => ({ ...current, [agent.id]: event.target.value }))}
                  rows={3}
                  placeholder={t('recommendationPlaceholder')}
                  className="input min-h-[88px] resize-y leading-6"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-[#829ab1]">{history.length > 0 ? `${history.length} ${t('recommendationHistory').toLowerCase()}` : t('recommendationEmpty')}</span>
                  <button onClick={() => send(agent)} disabled={savingId === agent.id || !hasDraft} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#102a43] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#173f61] disabled:cursor-not-allowed disabled:opacity-50">
                    {savingId === agent.id ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : savedId === agent.id ? <Check size={15} /> : <Save size={15} />}
                    {savedId === agent.id ? t('recommendationSaved') : t('saveRecommendation')}
                  </button>
                </div>
                {errorId === agent.id && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#c0392b]"><AlertCircle size={14} /> {t('recommendationSaveError')}</p>}
              </div>

              {history.length > 0 && (
                <div className="mt-5 border-t border-[#e9eff5] pt-4">
                  <button onClick={() => setExpandedId(isExpanded ? null : agent.id)} className="flex w-full items-center justify-between text-xs font-bold text-[#627d98] hover:text-[#102a43]">
                    <span className="flex items-center gap-1.5"><MessageSquareText size={14} /> {t('recommendationHistory')} ({history.length})</span>
                    <span className="text-[#829ab1]">{isExpanded ? '−' : '+'}</span>
                  </button>
                  {isExpanded && (
                    <div className="mt-3 max-h-[240px] space-y-3 overflow-y-auto scrollbar">
                      {history.map((item) => (
                        <div key={item.id} className="rounded-xl border border-[#e9eff5] bg-[#f8fafc] p-3.5">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#829ab1]">
                            <Clock size={11} />
                            {t('recommendationSentOn')} {timeAgo(item.createdAt)}
                          </div>
                          <p className="whitespace-pre-line text-sm leading-6 text-[#334e68]">{item.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
