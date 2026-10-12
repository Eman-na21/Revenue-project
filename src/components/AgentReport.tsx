import { useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet } from 'lucide-react';
import { currentMonth, isoToday } from '@/types';
import { useLang } from '@/i18n';
import { fetchLeaderboard, leaderRowsToReportInput, shiftDate } from '@/agentReport';
import { downloadAllAgentsExcel } from '@/reportExcel';

/** The same Excel report the administrator downloads (all agents, with ranks), for a period the agent chooses. */
export function AgentReport() {
  const { lang } = useLang();
  const tr = (en: string, am: string) => (lang === 'am' ? am : en);

  const [start, setStart] = useState(`${currentMonth}-01`);
  const [end, setEnd] = useState(isoToday);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const validRange = start !== '' && end !== '' && start <= end;

  const chips: { label: string; from: string; to: string }[] = [
    { label: tr('Today', 'ዛሬ'), from: isoToday, to: isoToday },
    { label: tr('Last 7 days', 'የመጨረሻ 7 ቀናት'), from: shiftDate(isoToday, -6), to: isoToday },
    { label: tr('This month', 'ይህ ወር'), from: `${currentMonth}-01`, to: isoToday },
  ];

  const download = async () => {
    if (!validRange || busy) return;
    setBusy(true);
    setError('');
    try {
      const rows = await fetchLeaderboard(start, end);
      const { agents, collections } = leaderRowsToReportInput(rows, start);
      downloadAllAgentsExcel(agents, collections, start, end);
    } catch (err) {
      console.error('Report error:', err);
      setError(tr('The report could not be created. Please try again, or ask the administrator.', 'ሪፖርቱን ማዘጋጀት አልተቻለም። እንደገና ይሞክሩ ወይም አስተዳዳሪውን ይጠይቁ።'));
    }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5f6ef] text-[#157a56]">
          <FileSpreadsheet size={19} />
        </div>
        <div>
          <h3 className="font-display font-bold text-[#102a43]">{tr('Performance report (Excel)', 'የአፈጻጸም ሪፖርት (Excel)')}</h3>
          <p className="mt-1 text-xs leading-5 text-[#829ab1]">
            {tr(
              'Choose a period and download the report of all agents with plan, performance, % and rank, so you can compare yourself with the others.',
              'ጊዜ ይምረጡና የሁሉም ወኪሎች ዕቅድ፣ አፈጻጸም፣ % እና ደረጃ ያለበትን ሪፖርት ያውርዱ፤ ራስዎን ከሌሎች ጋር ያወዳድሩ።',
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('From', 'ከ')}</span>
          <input type="date" value={start} max={isoToday} onChange={(e) => setStart(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#627d98]">{tr('To', 'እስከ')}</span>
          <input type="date" value={end} max={isoToday} onChange={(e) => setEnd(e.target.value)} className="input" />
        </label>
      </div>

      {!validRange && (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#c0392b]">
          <AlertCircle size={14} /> {tr('The start date must not be after the end date.', 'የመጀመሪያው ቀን ከመጨረሻው ቀን መብለጥ የለበትም።')}
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#c0392b]">
          <AlertCircle size={14} /> {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void download()}
        disabled={!validRange || busy}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a43] py-3.5 text-sm font-bold text-white transition hover:bg-[#173f61] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={17} /> {busy ? tr('Preparing…', 'በማዘጋጀት ላይ…') : tr('Download report (Excel)', 'ሪፖርቱን አውርድ (Excel)')}
      </button>
    </div>
  );
}
