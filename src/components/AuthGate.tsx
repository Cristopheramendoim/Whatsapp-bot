import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Cloud, LogIn } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { AssistantAvatar } from './AssistantAvatar';

export function AuthGate() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Não foi possível concluir o login.';
      if (msg.includes('popup-closed-by-user')) {
        setErrorMsg('Janela de login fechada antes da conclusão. Tente novamente.');
      } else if (msg.includes('popup-blocked')) {
        setErrorMsg('O navegador bloqueou o popup de login. Libere popups para este site.');
      } else {
        setErrorMsg('Erro ao entrar com Google. Tente novamente em instantes.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh w-full bg-[#0B141A] text-[#E9EDEF] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md bg-[#111B21] border border-[#222E35] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <AssistantAvatar size="md" />
          <div>
            <h1 className="font-display text-xl font-bold text-[#E9EDEF] tracking-tight">
              ZapAssist
            </h1>
            <p className="text-xs text-[#8696A0]">
              Assistente pessoal WhatsApp · Nuvem sincronizada
            </p>
          </div>
        </div>

        <div className="space-y-2.5 text-sm text-[#D1D7DB] leading-relaxed border-t border-[#222E35] pt-5">
          <p className="text-[#E9EDEF] font-medium">
            Respostas prontas para o celular e sincronizadas em qualquer dispositivo:
          </p>
          <ul className="space-y-1.5 text-[13.5px] text-[#AEBAC1]">
            <li className="flex items-start gap-2">
              <span className="text-[#00A884] font-semibold">•</span>
              <span>Resumos e ideias diretas com formatação nativa do WhatsApp.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#00A884] font-semibold">•</span>
              <span>Transcrição automática de notas de voz e leitura de anexos.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#00A884] font-semibold">•</span>
              <span>Lista de tarefas com prioridades salva na sua conta Google.</span>
            </li>
          </ul>
        </div>

        {errorMsg && (
          <div className="px-3.5 py-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleGoogleSignIn()}
          className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#00A884] hover:bg-[#06CF9C] text-[#0B141A] font-semibold text-sm flex items-center justify-center gap-2.5 disabled:opacity-60 transition-colors cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>{loading ? 'Conectando...' : 'Entrar com Google'}</span>
        </button>

        <div className="flex items-center justify-center gap-2 text-xs text-[#8696A0]">
          <Cloud className="w-3.5 h-3.5 text-[#00A884]" />
          <span>Seus chats e tarefas ficam privados na sua conta</span>
        </div>
      </div>
    </div>
  );
}
