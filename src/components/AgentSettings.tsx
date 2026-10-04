import { FormEvent, useState } from 'react';
import { Check, KeyRound, Lock, LogOut, Shield, UserRound } from 'lucide-react';
import { Agent } from '@/types';
import { useLang } from '@/i18n';

type Props = {
  agent: Agent;
  setAgents: (next: Agent[] | ((current: Agent[]) => Agent[])) => void;
  onLogout: () => void;
};

export function AgentSettings({ agent, setAgents, onLogout }: Props) {
  const { t } = useLang();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (currentPassword !== agent.password) {
      setError(t('currentPasswordIncorrect'));
      return;
    }
    if (newPassword.length < 6) {
      setError(t('newPasswordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('passwordsMismatch'));
      return;
    }
    if (newPassword === agent.password) {
      setError(t('sameAsCurrent'));
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setAgents((current) =>
        current.map((a) => (a.id === agent.id ? { ...a, password: newPassword } : a))
      );
      setLoading(false);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(false), 5000);
    }, 400);
  };

  return (
    <div className="space-y-6">
      <div className="animate-slide-up">
        <div className="text-xs font-bold uppercase tracking-[.18em] text-[#2cb67d]">{t('account')}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#102a43]">{t('settings')}</h1>
        <p className="mt-2 text-sm text-[#627d98]">{t('manageSecurity')}</p>
      </div>

      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eaf2fb] text-lg font-bold text-[#2d7dd2]">
            {agent.avatar}
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-[#102a43]">{agent.name}</h3>
            <p className="text-sm text-[#829ab1]">@{agent.username}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl bg-[#f4f7fb] p-4">
            <UserRound size={18} className="text-[#829ab1]" />
            <div>
              <div className="text-xs text-[#829ab1]">{t('role')}</div>
              <div className="text-sm font-semibold text-[#102a43]">{t('fieldAgent')}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-[#f4f7fb] p-4">
            <Shield size={18} className="text-[#829ab1]" />
            <div>
              <div className="text-xs text-[#829ab1]">{t('status')}</div>
              <div className="text-sm font-semibold text-[#157a56]">{t('active')}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5f6ef] text-[#157a56]">
            <KeyRound size={19} />
          </div>
          <div>
            <h3 className="font-display font-bold text-[#102a43]">{t('changePassword')}</h3>
            <p className="text-xs text-[#829ab1]">{t('chooseNewPassword')}</p>
          </div>
        </div>

        {success && (
          <div className="animate-scale-in mb-5 flex items-center gap-3 rounded-2xl border border-[#2cb67d]/30 bg-[#e5f6ef] px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2cb67d] text-white">
              <Check size={20} />
            </div>
            <div>
              <div className="text-sm font-bold text-[#157a56]">{t('passwordUpdated')}</div>
              <div className="text-xs text-[#157a56]/80">{t('useNewPassword')}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm text-[#c0392b]">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
              <Lock size={14} className="text-[#829ab1]" /> {t('currentPassword')} <span className="text-[#c0392b]">*</span>
            </span>
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input" placeholder={t('enterCurrentPassword')} />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
              <KeyRound size={14} className="text-[#829ab1]" /> {t('newPassword')} <span className="text-[#c0392b]">*</span>
            </span>
            <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder={t('atLeast6Chars')} />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#334e68]">
              <Check size={14} className="text-[#829ab1]" /> {t('confirmPassword')} <span className="text-[#c0392b]">*</span>
            </span>
            <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" placeholder={t('reenterNewPassword')} />
          </label>
          <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2cb67d] py-4 text-sm font-bold text-white shadow-lg shadow-[#2cb67d]/20 transition hover:bg-[#239b68] active:scale-[.99] disabled:opacity-70">
            {loading ? t('saving') : (<><KeyRound size={18} /> {t('updatePassword')}</>)}
          </button>
        </form>
        <p className="mt-5 rounded-xl bg-[#f4f7fb] p-3 text-xs leading-5 text-[#627d98]">{t('securityNote')}</p>
      </div>

      <button onClick={onLogout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9e2ec] bg-white py-3.5 text-sm font-bold text-[#627d98] transition hover:bg-[#f4f7fb]">
        <LogOut size={16} /> {t('signOut')}
      </button>
    </div>
  );
}
