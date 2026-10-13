import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { Camera, Check, ChevronDown, FileText, Hash, MessageSquare, Plus, Receipt, X } from 'lucide-react';
import { Agent, Category, Collection, RoyaltyType, categories, categoryStyles, etb, isoToday, normalizeCategory, normalizeRoyaltyType, revenueBuckets, royaltyTypes, RECEIPT_PHOTO_REQUIRED, MAX_RECEIPT_PHOTOS } from '@/types';
import { useLang } from '@/i18n';
import { supabase } from '@/supabase';
import { compressImage, uploadReceiptPhoto } from '@/receipts';

type Props = {
  agent: Agent;
  collections: Collection[];
  setCollections: (next: Collection[] | ((current: Collection[]) => Collection[])) => void;
  onDone: () => void;
};

export function AgentEntry({ agent, collections, setCollections, onDone }: Props) {
  const { t, lang } = useLang();
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<Category>('Chat');
  const [royaltyType, setRoyaltyType] = useState<RoyaltyType | null>(null);
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [lastAmount, setLastAmount] = useState('');
  type PickedPhoto = { id: string; file: File; preview: string };
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [uploadProgress, setUploadProgress] = useState('');
  // Photos already uploaded in a failed attempt are remembered, so a retry does not upload them twice.
  const uploadedRef = useRef(new Map<string, string>());

  const clearPhotos = () => {
    photos.forEach((item) => URL.revokeObjectURL(item.preview));
    uploadedRef.current.clear();
    setPhotos([]);
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.id !== id);
    });
    uploadedRef.current.delete(id);
  };

  const onPhotosChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const room = MAX_RECEIPT_PHOTOS - photos.length;
    const accepted = files.slice(0, Math.max(0, room));
    setPhotos((current) => [
      ...current,
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) })),
    ]);
    setErrors((current) => ({
      ...current,
      photo: files.length > accepted.length
        ? (lang === 'am' ? `ከ${MAX_RECEIPT_PHOTOS} ፎቶ በላይ ማያያዝ አይቻልም።` : `You can attach at most ${MAX_RECEIPT_PHOTOS} photos.`)
        : '',
    }));
  };

  const collectedToday = collections.filter(c => c.agentId === agent.id && c.date === isoToday).reduce((s, c) => s + c.amount, 0);
  const parsedAmount = Number(amount) || 0;
  const newTotal = collectedToday + parsedAmount;
  const newPercent = agent.daily > 0 ? Math.min(100, Math.round((newTotal / agent.daily) * 100)) : 0;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!parsedAmount || parsedAmount <= 0) e.amount = t('enterValidAmount');
    if (!receipt.trim()) e.receipt = t('receiptRequired');
    if (RECEIPT_PHOTO_REQUIRED && photos.length === 0) {
      e.photo = lang === 'am' ? 'ቢያንስ አንድ የደረሰኝ ፎቶ ያያይዙ።' : 'Please attach at least one receipt photo.';
    }
    if (category === 'Royalty' && !royaltyType) {
      e.royaltyType = lang === 'am' ? 'የሮያሊቲ ዓይነት ይምረጡ (ደን ወይም አሸዋ)።' : 'Please choose the royalty type (Forest or Sand).';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !validate()) return;

    if (!supabase) {
      setErrors({ submit: lang === 'am' ? 'የዳታቤዝ ግንኙነት አልተዘጋጀም።' : 'Database connection is not configured.' });
      return;
    }

    setSubmitting(true);

    // 1. Shrink and upload every photo first. If any upload fails nothing is recorded.
    const receiptPaths: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const item = photos[i];
      setUploadProgress(lang === 'am' ? `ፎቶ በመላክ ላይ ${i + 1} / ${photos.length}` : `Uploading photo ${i + 1} / ${photos.length}`);
      try {
        let path = uploadedRef.current.get(item.id);
        if (!path) {
          const small = await compressImage(item.file);
          path = await uploadReceiptPhoto(agent.id, small);
          uploadedRef.current.set(item.id, path);
        }
        receiptPaths.push(path);
      } catch (err) {
        console.error('Receipt photo upload error:', err);
        setUploadProgress('');
        setSubmitting(false);
        setErrors({
          photo: lang === 'am'
            ? `ፎቶ ${i + 1} መላክ አልተቻለም። ኢንተርኔትዎን ያረጋግጡና እንደገና ይሞክሩ (የተላኩት ፎቶዎች እንደገና አይላኩም)።`
            : `Photo ${i + 1} could not be uploaded. Check your internet and try again (photos already sent will not be sent twice).`,
        });
        return;
      }
    }
    setUploadProgress('');

    // 2. Record the collection together with its photos

    // agent.id is the signed-in agent's own id. The database rule (RLS) accepts
    // a new row only when agent_id matches the logged-in user, so nobody can
    // record money on behalf of another agent.
    const { data, error } = await supabase
      .from('collections')
      .insert({
        agent_id: agent.id,
        category,
        royalty_type: category === 'Royalty' ? royaltyType : null,
        amount: parsedAmount,
        receipt_number: receipt.trim(),
        receipt_paths: receiptPaths,
        notes: notes.trim(),
        collected_at: isoToday,
      })
      .select()
      .single();

    setSubmitting(false);

    if (error || !data) {
      console.error('Collection insert error:', error);
      setErrors({ submit: error?.message ?? (lang === 'am' ? 'መረጃውን ማስቀመጥ አልተቻለም።' : 'Could not save the collection.') });
      return;
    }

    // Live updates may already have added this row, so never add it twice.
    setCollections(current =>
      current.some(c => c.id === String(data.id))
        ? current
        : [
            ...current,
            {
              id: String(data.id),
              agentId: agent.id,
              category: normalizeCategory(data.category),
              royaltyType: normalizeCategory(data.category) === 'Royalty' ? normalizeRoyaltyType(data.royalty_type) : null,
              amount: Number(data.amount),
              receipt: data.receipt_number ?? '',
              receiptPaths: Array.isArray(data.receipt_paths) ? (data.receipt_paths as string[]) : receiptPaths,
              notes: data.notes ?? '',
              date: data.collected_at ? String(data.collected_at).slice(0, 10) : isoToday,
            },
          ],
    );

    const royaltyBucket = category === 'Royalty' ? revenueBuckets.find((b) => b.key === royaltyType) : undefined;
    setLastAmount(royaltyBucket ? `${etb(parsedAmount)} (${lang === 'am' ? royaltyBucket.am : royaltyBucket.en})` : etb(parsedAmount));
    setAmount('');
    setReceipt('');
    setNotes('');
    clearPhotos();
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

          {category === 'Royalty' && (
            <div className="mt-4 animate-fade-in">
              <span className="mb-2 block text-sm font-semibold text-[#334e68]">
                {lang === 'am' ? 'የሮያሊቲ ዓይነት' : 'Royalty type'} <span className="text-[#c0392b]">*</span>
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {royaltyTypes.map((type) => {
                  const bucket = revenueBuckets.find((b) => b.key === type)!;
                  const selected = royaltyType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setRoyaltyType(type)}
                      className={`flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition ${selected ? `${bucket.bg} border-current ${bucket.text}` : 'border-[#e9eff5] hover:border-[#d9e2ec]'}`}
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${bucket.solid}`} />
                      <span className={`text-sm font-bold ${selected ? bucket.text : 'text-[#102a43]'}`}>{lang === 'am' ? bucket.am : bucket.en}</span>
                      {selected && <Check size={18} className={`ml-auto ${bucket.text}`} />}
                    </button>
                  );
                })}
              </div>
              {errors.royaltyType && <p className="mt-1.5 text-xs text-[#c0392b]">{errors.royaltyType}</p>}
            </div>
          )}
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

        <div className="mt-5">
          <span className="mb-2 flex items-center justify-between gap-1.5 text-sm font-semibold text-[#334e68]">
            <span className="flex items-center gap-1.5">
              <Camera size={14} className="text-[#829ab1]" /> {lang === 'am' ? 'የደረሰኝ ፎቶዎች' : 'Receipt photos'}
              {RECEIPT_PHOTO_REQUIRED && <span className="text-[#c0392b]">*</span>}
            </span>
            <span className="text-xs font-normal text-[#829ab1]">{photos.length} / {MAX_RECEIPT_PHOTOS}</span>
          </span>

          {photos.length > 0 && (
            <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {photos.map((item) => (
                <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg border border-[#d9e2ec] bg-[#f8fafc]">
                  <img src={item.preview} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(item.id)}
                    disabled={submitting}
                    className="absolute right-1 top-1 rounded-full bg-[#102a43]/75 p-1 text-white transition hover:bg-[#102a43] disabled:opacity-50"
                    aria-label="Remove photo"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < MAX_RECEIPT_PHOTOS && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#d9e2ec] bg-[#f8fafc] px-4 py-5 text-center text-sm text-[#627d98] transition hover:border-[#2cb67d]">
              <Camera size={22} className="text-[#2cb67d]" />
              <span className="font-semibold">
                {photos.length === 0
                  ? (lang === 'am' ? 'ፎቶ ያንሱ ወይም ከጋለሪ ይምረጡ (ብዙ ፎቶ መምረጥ ይቻላል)' : 'Take photos or choose from gallery (you can pick many)')
                  : (lang === 'am' ? '+ ተጨማሪ ፎቶ ያክሉ' : '+ Add more photos')}
              </span>
              <input type="file" accept="image/*" multiple onChange={onPhotosChange} className="hidden" />
            </label>
          )}
          {errors.photo && <p className="mt-1.5 text-xs text-[#c0392b]">{errors.photo}</p>}
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

        <button type="submit" disabled={submitting} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2cb67d] py-4 text-sm font-bold text-white shadow-lg shadow-[#2cb67d]/20 transition hover:bg-[#239b68] active:scale-[.99] disabled:opacity-70">
          <Plus size={18} /> {submitting ? (uploadProgress || (lang === 'am' ? 'በመላክ ላይ…' : 'Sending…')) : t('submitCollection')}
        </button>
      </form>

      <button onClick={onDone} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9e2ec] bg-white py-3.5 text-sm font-bold text-[#627d98] transition hover:bg-[#f4f7fb]">
        <ChevronDown size={16} /> {t('viewSubmissionHistory')}
      </button>
    </div>
  );
}
