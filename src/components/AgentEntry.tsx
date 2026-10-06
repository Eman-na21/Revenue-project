import { FormEvent, useState } from 'react';
import { Check, ChevronDown, FileText, Hash, MessageSquare, Plus, Receipt } from 'lucide-react';
import { Agent, Category, Collection, categories, categoryStyles, etb, isoToday } from '@/types';
import { useLang } from '@/i18n';
import { supabase } from '@/supabase';

type Props = {
  agent: Agent;
  collections: Collection[];
  setCollections: (next: Collection[] | ((current: Collection[]) => Collection[])) => void;
  onDone: () => void;
};

export function AgentEntry({ agent, collections, setCollections, onDone }: Props) {
  const { t } = useLang();
  const [category, setCategory] = useState<Category>('Chat');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [lastAmount, setLastAmount] = useState('');

  const collectedToday = collections.filter(c => c.agentId === agent.id && c.date === isoToday).reduce((s, c) => s + c.amount, 0);
  const parsedAmount = Number(amount) || 0;
  const newTotal = collectedToday + parsedAmount;
  const newPercent = agent.daily > 0 ? Math.min(100, Math.round((newTotal / agent.daily) * 100)) : 0;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!parsedAmount || parsedAmount <= 0) e.amount = t('enterValidAmount');
    if (!receipt.trim()) e.receipt = t('receiptRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

const submit = async (event: FormEvent) => {
  event.preventDefault();
  if (!validate()) return;

  if (!supabase) {
    setErrors({ submit: 'Database connection is not configured.' });
    return;
  }

  // 1. የ Aisha ን UUID ከ profiles ሰንጠረዥ በትክክል መፈለግ
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', agent.username)
    .maybeSingle();

  // ፕሮፋይሉ ከተገኘ UUID ውን ይጠቀማል፣ ካልተገኘ ኤረር እንዳያሳይ ያደርጋል
  if (profileError || !profile) {
    console.error('Profile fetch error:', profileError);
    setErrors({ 
      submit: `በ Supabase 'profiles' ሰንጠረዥ ውስጥ የ '${agent.username}' ፕሮፋይል አልተገኘም።` 
    });
    return;
  }

  // 2. በ Supabase የተገኘውን ትክክለኛ UUID በመጠቀም መረጃውን ማስገባት
  const { data, error } = await supabase
    .from('collections')
    .insert({
      agent_id: profile.id, // በትክክል የ Supabase UUID ይጠቀማል
      category,
      amount: parsedAmount,
      receipt_number: receipt.trim(),
      notes: notes.trim(),
      collected_at: isoToday,
    })
    .select()
    .single();

  if (error) {
    console.error('Collection insert error:', error);
    setErrors({ submit: error.message });
    return;
  }

  // 3. Local State ን ማዘመን
  setCollections(current => [
    ...current,
    {
      id: data.id,
      agentId: agent.id,
      category: data.category,
      amount: Number(data.amount),
      receipt: data.receipt_number ?? '',
      notes: data.notes ?? '',
      date: data.collected_at
        ? String(data.collected_at).slice(0, 10)
        : isoToday,
    },
  ]);

  setLastAmount(etb(parsedAmount));
  setAmount('');
  setReceipt('');
  setNotes('');
  setErrors({});
  setSuccess(true);

  setTimeout(() => setSuccess(false), 4000);
};
  return (
    <div className="space-y-6">
      <div className="animate-slide-up">
        <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2cb67d]">{t('fieldCollection')}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#102a43]">{t('recordCollection')}</h1>
        <p className="mt-2 text-sm text-[#627d98]">{t('submitDescription')}</p>
      </div>

      <div className="rounded-2xl bg-[#102a43] p-5 text-white shadow-lg shadow-[#102a43]/10">
        <div className="flex items-center justify-between text-xs text-[#9fb3c8]">
          <span>{t('todaysProgress')}</span>
          <span>{etb(collectedToday)} {t('collected')}</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#2cb67d] transition-all duration-700" style={{ width: `${agent.daily > 0 ? Math.min(100, Math.round((collectedToday / agent.daily) * 100)) : 0}%` }} />
        </div>
        {parsedAmount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[#3dd68d] animate-fade-in">
            <Plus size={14} /> {t('afterSubmission')}: {etb(newTotal)} ({newPercent}% {t('ofTargetShort')})
          </div>
        )}
      </div>

      {success && (
        <div className="animate-scale-in flex items-center gap-3 rounded-2xl border border-[#2cb67d]/30 bg-[#e5f6ef] px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2cb67d] text-white">
            <Check size={20} />
          </div>
          <div>
            <div className="text-sm font-bold text-[#157a56]">{t('collectionSubmitted')}</div>
            <div className="text-xs text-[#157a56]/80">{lastAmount} {t('addedToDaily')}</div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="rounded-2xl border border-[#d9e2ec] bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5f6ef] text-[#157a56]">
            <Receipt size={19} />
          </div>
          <div>
            <h3 className="font-display font-bold text-[#102a43]">{t('newRevenueEntry')}</h3>
            <p className="text-xs text-[#829ab1]">{t('completeAllFields')}</p>
          </div>
        </div>

        <div className="mb-6">
          <span className="mb-3 block text-sm font-semibold text-[#334e68]">{t('revenueCategory')}</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {categories.map(cat => {
              const style = categoryStyles[cat];
              const selected = category === cat;
              return (
                <button key={cat} type="button" onClick={() => setCategory(cat)} className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition ${selected ? `${style.light} border-current ${style.text}` : 'border-[#e9eff5] hover:border-[#d9e2ec]'}`}>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${style.solid} text-white shrink-0`}>
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-bold ${selected ? style.text : 'text-[#102a43]'}`}>{cat}</div>
                    <div className="text-xs text-[#829ab1]">{t('select')}</div>
                  </div>
                  {selected && <Check size={18} className={`ml-auto ${style.text}`} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
              <Hash size={14} className="text-[#829ab1]" /> {t('amountETB')} <span className="text-[#2cb67d]">(ETB)</span> <span className="text-[#c0392b]">*</span>
            </span>
            <input required type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="input" />
            {errors.amount && <p className="mt-1.5 text-xs text-[#c0392b]">{errors.amount}</p>}
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
              <Receipt size={14} className="text-[#829ab1]" /> {t('receiptReference')} <span className="text-[#c0392b]">*</span>
            </span>
            <input required value={receipt} onChange={e => setReceipt(e.target.value)} placeholder="e.g. CR-10490" className="input" />
            {errors.receipt && <p className="mt-1.5 text-xs text-[#c0392b]">{errors.receipt}</p>}
          </label>
        </div>
{errors.submit && (
  <p className="mt-3 text-sm text-[#c0392b]">
    {errors.submit}
  </p>
)}
        <label className="mt-5 block">
          <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
            <MessageSquare size={14} className="text-[#829ab1]" /> {t('notes')} <span className="font-normal text-[#829ab1]">({t('optional')})</span>
          </span>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('addRemarks')} className="input resize-none" />
        </label>

        <button type="submit" className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2cb67d] py-4 text-sm font-bold text-white shadow-lg shadow-[#2cb67d]/20 transition hover:bg-[#239b68] active:scale-[.99]">
          <Plus size={18} /> {t('submitCollection')}
        </button>
      </form>

      <button onClick={onDone} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9e2ec] bg-white py-3.5 text-sm font-bold text-[#627d98] transition hover:bg-[#f4f7fb]">
        <ChevronDown size={16} /> {t('viewSubmissionHistory')}
      </button>
    </div>
  );
}
