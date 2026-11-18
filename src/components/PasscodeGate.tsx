import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { AssistantAvatar } from './AssistantAvatar';

interface PasscodeGateProps {
  onUnlocked: (token: string) => void;
}

export function PasscodeGate({ onUnlocked }: PasscodeGateProps) {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim() || loading) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setErrorMsg(data.error || 'Senha incorreta.');
        setPasscode('');
        return;
      }

      onUnlocked(data.token);
    } catch {
      setErrorMsg('Não foi possível validar a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh w-full bg-[#0B141A] text-[#E9EDEF] flex items-center justify-center p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm bg-[#111B21] border border-[#222E35] rounded-2xl p-6 sm:p-7 space-y-5 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <AssistantAvatar size="md" />
          <div>
            <h1 className="font-display text-lg font-bold text-[#E9EDEF] tracking-tight">
              ZapAssist
            </h1>
            <p className="text-xs text-[#8696A0]">Acesso protegido por senha</p>
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="site-passcode"
            className="block text-xs font-medium text-[#AEBAC1]"
          >
            Senha de entrada
          </label>
          <div className="relative flex items-center">
            <Lock className="w-4 h-4 text-[#8696A0] absolute left-3.5 pointer-events-none" />
            <input
              id="site-passcode"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="••••••"
              className="w-full pl-10 pr-4 py-3 text-base tracking-[0.25em] rounded-xl bg-[#202C33] border border-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696A0] placeholder:tracking-widest focus:outline-none focus:border-[#00A884]"
            />
          </div>
        </div>

        {errorMsg && (
          <p className="text-xs text-rose-400 font-medium">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={!passcode.trim() || loading}
          className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#00A884] hover:bg-[#06CF9C] text-[#0B141A] font-semibold text-sm disabled:opacity-40 transition-colors cursor-pointer"
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
