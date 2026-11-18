import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CheckSquare,
  Copy,
  Eraser,
  FileAudio,
  FileText,
  ListTodo,
  Mic,
  Paperclip,
  Plus,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ChatMessage,
  ChatThread,
  MessageAttachment,
  PriorityLevel,
  SuggestedTask,
} from '../types';
import { formatFileSize, formatShortTime } from '../utils/storage';
import { sanitizeWhatsAppText, WhatsAppFormattedText } from '../utils/whatsappFormat';
import { AssistantAvatar } from './AssistantAvatar';

export interface StagedAttachment {
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'audio' | 'document';
  base64: string;
  dataUrl: string;
}

interface ChatWindowProps {
  thread: ChatThread;
  messages: ChatMessage[];
  isBusy: boolean;
  busyStatus: string;
  pendingTaskCount: number;
  onBackToThreads: () => void;
  onOpenTabletTasks: () => void;
  onClearThread: () => void;
  onSendMessage: (text: string, attachment?: StagedAttachment) => Promise<void>;
  onAddSuggestedTask: (
    messageId: string,
    task: SuggestedTask
  ) => void;
  onExtractTasksFromMessage: (message: ChatMessage) => Promise<void>;
}

const QUICK_PROMPTS = [
  {
    label: 'Resumir texto',
    template: 'Resuma o texto abaixo em até 3 tópicos prontos para WhatsApp:\n',
  },
  {
    label: 'Extrair tarefas',
    template: 'Extraia as tarefas e prioridades do seguinte texto:\n',
  },
  {
    label: 'Gerar 3 ideias',
    template: 'Me dê 3 ideias diretas e práticas sobre: ',
  },
  {
    label: 'Responder cliente',
    template: 'Escreva uma resposta curta e educada para enviar no WhatsApp sobre: ',
  },
];

const PRIORITY_TEXT: Record<PriorityLevel, { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'text-rose-400' },
  media: { label: 'Média', className: 'text-amber-400' },
  baixa: { label: 'Baixa', className: 'text-emerald-400' },
};

function formatRecordingDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ChatWindow({
  thread,
  messages,
  isBusy,
  busyStatus,
  pendingTaskCount,
  onBackToThreads,
  onOpenTabletTasks,
  onClearThread,
  onSendMessage,
  onAddSuggestedTask,
  onExtractTasksFromMessage,
}: ChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const [stagedAttachment, setStagedAttachment] = useState<StagedAttachment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [wallpaperError, setWallpaperError] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const cancelRecordingFlagRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isBusy, thread.id]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
      }
      if (recordStreamRef.current) {
        recordStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  function adjustTextareaHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function handleCopyMessage(msg: ChatMessage) {
    const cleanText = sanitizeWhatsAppText(msg.text);
    try {
      await navigator.clipboard.writeText(cleanText);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((prev) => (prev === msg.id ? null : prev)), 2000);
    } catch {
      // Clipboard blocked fallback ignored
    }
  }

  function classifyFileKind(mime: string, name: string): MessageAttachment['kind'] {
    if (mime.startsWith('image/')) return 'image';
    if (
      mime.startsWith('audio/') ||
      /\.(mp3|wav|ogg|m4a|webm|aac)$/i.test(name)
    ) {
      return 'audio';
    }
    return 'document';
  }

  function processFile(file: File) {
    setMediaError(null);
    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      setMediaError('Arquivo maior que 15 MB. Envie um anexo menor.');
      return;
    }

    const mimeType =
      file.type ||
      (file.name.endsWith('.md') || file.name.endsWith('.txt')
        ? 'text/plain'
        : file.name.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/octet-stream');

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
      if (!base64) {
        setMediaError('Não foi possível ler o arquivo selecionado.');
        return;
      }

      setStagedAttachment({
        name: file.name,
        mimeType,
        size: file.size,
        kind: classifyFileKind(mimeType, file.name),
        base64,
        dataUrl,
      });
    };
    reader.onerror = () => {
      setMediaError('Erro ao carregar o arquivo selecionado.');
    };
    reader.readAsDataURL(file);
  }

  async function startVoiceRecording() {
    setMediaError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMediaError('Gravação de áudio não suportada neste navegador. Você pode anexar um arquivo de áudio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;

      const candidateTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const supportedMime = candidateTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      cancelRecordingFlagRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;

        if (cancelRecordingFlagRef.current) {
          audioChunksRef.current = [];
          setIsRecording(false);
          setRecordingSeconds(0);
          return;
        }

        const actualMime = recorder.mimeType || supportedMime || 'audio/webm';
        const cleanMime = actualMime.split(';')[0] || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: cleanMime });
        audioChunksRef.current = [];
        setIsRecording(false);
        setRecordingSeconds(0);

        if (blob.size < 400) {
          setMediaError('Áudio muito curto. Segure ou fale por pelo menos 1 segundo.');
          return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
          const commaIdx = dataUrl.indexOf(',');
          const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
          if (!base64) return;

          const ext = cleanMime.includes('mp4') ? 'm4a' : cleanMime.includes('ogg') ? 'ogg' : 'webm';
          const audioAttachment: StagedAttachment = {
            name: `nota-de-voz.${ext}`,
            mimeType: cleanMime,
            size: blob.size,
            kind: 'audio',
            base64,
            dataUrl,
          };

          await onSendMessage('', audioAttachment);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      setMediaError('Permissão de microfone negada ou indisponível. Use o clipe para enviar um arquivo de áudio.');
    }
  }

  function stopAndSendVoiceRecording() {
    cancelRecordingFlagRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  function cancelVoiceRecording() {
    cancelRecordingFlagRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  }

  async function handleSend() {
    if (isBusy) return;
    const text = inputText.trim();
    const attachment = stagedAttachment || undefined;
    if (!text && !attachment) return;

    setInputText('');
    setStagedAttachment(null);
    setMediaError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await onSendMessage(text, attachment);
  }

  function handleQuickPrompt(template: string) {
    setInputText(template);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        adjustTextareaHeight();
      }
    });
  }

  const hasSendableContent = inputText.trim().length > 0 || stagedAttachment !== null;

  return (
    <section className="flex-1 flex flex-col h-full min-w-0 bg-[#0B141A] relative overflow-hidden">
      {/* Subtle Dark Wallpaper Layer */}
      {!wallpaperError && (
        <img
          src="/src/assets/images/chat_dark_wallpaper_1795019676332.jpg"
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onError={() => setWallpaperError(true)}
          className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none select-none"
        />
      )}

      {/* Top Header */}
      <header className="h-14 px-3 sm:px-4 bg-[#202C33] border-b border-[#222E35] flex items-center justify-between gap-3 z-20 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackToThreads}
            aria-label="Voltar para conversas"
            className="md:hidden min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-lg text-[#AEBAC1] hover:text-[#E9EDEF] hover:bg-[#2A3942]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <AssistantAvatar size="md" />

          <div className="min-w-0">
            <h1 className="font-display font-semibold text-[15px] text-[#E9EDEF] leading-tight truncate">
              {thread.title}
            </h1>
            <p className="text-xs text-[#8696A0] truncate">
              {isBusy ? busyStatus : 'ZapAssist · PT-BR direto e pronto p/ uso'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenTabletTasks}
            className="hidden md:flex xl:hidden items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-[#2A3942] hover:bg-[#344650] text-xs font-medium text-[#E9EDEF] whitespace-nowrap transition-colors"
          >
            <CheckSquare className="w-4 h-4 text-[#00A884]" />
            <span>Tarefas</span>
            {pendingTaskCount > 0 && (
              <span className="font-mono tabular-nums text-[#00A884]">
                ({pendingTaskCount})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onClearThread}
            title="Limpar mensagens desta conversa"
            aria-label="Limpar mensagens"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#AEBAC1] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 lg:px-10 py-4 space-y-2.5 z-10">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const isCopied = copiedId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`relative rounded-2xl px-3.5 py-2.5 shadow-sm max-w-[88%] sm:max-w-[76%] lg:max-w-[68%] ${
                  isUser
                    ? 'bg-[#005C4B] text-[#E9EDEF] rounded-tr-sm'
                    : msg.error
                      ? 'bg-[#2A1F23] border border-rose-500/30 text-[#E9EDEF] rounded-tl-sm'
                      : 'bg-[#202C33] text-[#E9EDEF] rounded-tl-sm'
                }`}
              >
                {/* Attachment Preview inside Bubble */}
                {msg.attachment && (
                  <div className="mb-2">
                    {msg.attachment.kind === 'image' && msg.attachment.dataUrl ? (
                      <div className="space-y-1">
                        <img
                          src={msg.attachment.dataUrl}
                          alt={msg.attachment.name}
                          className="max-h-60 w-auto rounded-xl object-cover border border-white/10"
                        />
                        <p className="text-[11px] text-[#AEBAC1]">
                          {msg.attachment.name} · {formatFileSize(msg.attachment.size)}
                        </p>
                      </div>
                    ) : msg.attachment.kind === 'audio' ? (
                      <div className="p-2.5 rounded-xl bg-black/20 space-y-2 min-w-[220px]">
                        <div className="flex items-center gap-2 text-xs text-[#D1D7DB]">
                          <FileAudio className="w-4 h-4 text-[#00A884] shrink-0" />
                          <span className="truncate font-medium">
                            {msg.attachment.name}
                          </span>
                          <span className="text-[#8696A0] shrink-0">
                            · {formatFileSize(msg.attachment.size)}
                          </span>
                        </div>
                        {msg.attachment.dataUrl && (
                          <audio
                            controls
                            src={msg.attachment.dataUrl}
                            className="w-full h-8"
                          />
                        )}
                        {msg.transcription && (
                          <p className="text-xs text-[#D1D7DB] border-t border-white/10 pt-1.5 italic">
                            “{msg.transcription}”
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-black/20 flex items-center gap-2.5">
                        <FileText className="w-5 h-5 text-[#00A884] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[#E9EDEF] truncate">
                            {msg.attachment.name}
                          </p>
                          <p className="text-[11px] text-[#8696A0]">
                            {formatFileSize(msg.attachment.size)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Message Body */}
                {msg.text && <WhatsAppFormattedText text={msg.text} />}

                {/* Timestamp & Delivery Check */}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[11px] font-mono tabular-nums text-[#8696A0]">
                    {formatShortTime(msg.timestamp)}
                  </span>
                  {isUser && <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" />}
                </div>

                {/* Assistant Action Bar & Suggested Tasks */}
                {!isUser && !msg.error && (
                  <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#AEBAC1] hover:text-[#00A884] transition-colors py-1"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#00A884]" />
                            <span className="text-[#00A884]">Copiado p/ WhatsApp</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar p/ WhatsApp</span>
                          </>
                        )}
                      </button>

                      {(!msg.suggestedTasks || msg.suggestedTasks.length === 0) && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onExtractTasksFromMessage(msg)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#AEBAC1] hover:text-[#00A884] disabled:opacity-40 transition-colors py-1"
                        >
                          <ListTodo className="w-3.5 h-3.5" />
                          <span>Extrair tarefas</span>
                        </button>
                      )}
                    </div>

                    {msg.suggestedTasks && msg.suggestedTasks.length > 0 && (
                      <div className="pt-1.5 space-y-1.5">
                        <p className="text-[11px] font-medium text-[#8696A0]">
                          Tarefas identificadas ({msg.suggestedTasks.length}):
                        </p>
                        {msg.suggestedTasks.map((sTask, idx) => {
                          const alreadyAdded = msg.addedTaskTitles?.includes(sTask.title);
                          const pInfo = PRIORITY_TEXT[sTask.priority];

                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-[#111B21]/70 border border-white/5"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-[#E9EDEF] leading-snug">
                                  {sTask.title}
                                </p>
                                <p className="text-[11px] text-[#8696A0] mt-0.5">
                                  <span className={`font-medium ${pInfo.className}`}>
                                    {pInfo.label}
                                  </span>
                                  {sTask.notes ? ` · ${sTask.notes}` : ''}
                                </p>
                              </div>

                              <button
                                type="button"
                                disabled={alreadyAdded}
                                onClick={() => onAddSuggestedTask(msg.id, sTask)}
                                className={`px-2.5 py-1.5 min-h-[34px] text-xs font-medium rounded-md flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                                  alreadyAdded
                                    ? 'bg-[#202C33] text-[#00A884]'
                                    : 'bg-[#00A884] hover:bg-[#06CF9C] text-[#0B141A]'
                                }`}
                              >
                                {alreadyAdded ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Salva</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Adicionar</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing / Busy Status Bubble */}
        {isBusy && (
          <div className="flex items-start">
            <div className="bg-[#202C33] text-[#D1D7DB] rounded-2xl rounded-tl-sm px-4 py-2.5 text-xs flex items-center gap-2 shadow-sm">
              <span className="inline-flex gap-1" aria-hidden="true">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-bounce [animation-delay:-0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-bounce [animation-delay:-0.1s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-bounce" />
              </span>
              <span>{busyStatus || 'Processando...'}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Strip */}
      <div className="px-3 sm:px-4 py-2 bg-[#111B21]/95 border-t border-[#222E35] z-10 flex items-center gap-2 overflow-x-auto shrink-0">
        {QUICK_PROMPTS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => handleQuickPrompt(item.template)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#202C33] hover:bg-[#2A3942] text-[#D1D7DB] border border-[#2A3942] whitespace-nowrap shrink-0 transition-colors"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Composer Bar */}
      <footer className="px-2.5 sm:px-4 py-2.5 bg-[#202C33] border-t border-[#222E35] z-20 shrink-0 space-y-2">
        {/* Error Alert */}
        {mediaError && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-500/30 text-xs text-rose-200">
            <span>{mediaError}</span>
            <button
              type="button"
              onClick={() => setMediaError(null)}
              aria-label="Fechar aviso"
              className="p-1 text-rose-200 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Staged Attachment Preview */}
        {stagedAttachment && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#111B21] border border-[#2A3942]">
            <div className="flex items-center gap-2.5 min-w-0">
              {stagedAttachment.kind === 'image' ? (
                <img
                  src={stagedAttachment.dataUrl}
                  alt={stagedAttachment.name}
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
              ) : stagedAttachment.kind === 'audio' ? (
                <FileAudio className="w-6 h-6 text-[#00A884] shrink-0" />
              ) : (
                <FileText className="w-6 h-6 text-[#00A884] shrink-0" />
              )}

              <div className="min-w-0">
                <p className="text-xs font-medium text-[#E9EDEF] truncate">
                  {stagedAttachment.name}
                </p>
                <p className="text-[11px] text-[#8696A0]">
                  {formatFileSize(stagedAttachment.size)} · Pronto para enviar
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStagedAttachment(null)}
              aria-label="Remover anexo"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#8696A0] hover:text-rose-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Recording State vs Standard Composer */}
        {isRecording ? (
          <div className="flex items-center justify-between gap-3 px-2 py-1 bg-[#111B21] rounded-xl border border-[#00A884]/40">
            <button
              type="button"
              onClick={cancelVoiceRecording}
              aria-label="Cancelar gravação"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-rose-400 hover:bg-[#202C33] transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-sm text-[#E9EDEF]">
              <span className="font-medium text-rose-400">Gravando áudio</span>
              <span className="font-mono tabular-nums text-[#E9EDEF]">
                {formatRecordingDuration(recordingSeconds)}
              </span>
            </div>

            <button
              type="button"
              onClick={stopAndSendVoiceRecording}
              aria-label="Enviar áudio gravado"
              className="min-h-[44px] px-4 flex items-center justify-center gap-2 rounded-xl bg-[#00A884] hover:bg-[#06CF9C] text-[#0B141A] font-semibold text-sm transition-colors"
            >
              <SendHorizontal className="w-4 h-4" />
              <span>Enviar</span>
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              title="Anexar imagem, áudio ou documento"
              aria-label="Anexar arquivo"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[#AEBAC1] hover:text-[#E9EDEF] hover:bg-[#2A3942] disabled:opacity-40 transition-colors shrink-0"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,.pdf,.txt,.md,.csv,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  processFile(file);
                  e.target.value = '';
                }
              }}
            />

            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                adjustTextareaHeight();
              }}
              onPaste={(e) => {
                const files = e.clipboardData?.files;
                if (files && files.length > 0) {
                  const first = files[0];
                  if (first.type.startsWith('image/')) {
                    e.preventDefault();
                    processFile(first);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Mensagem, pedido ou cole um texto..."
              className="flex-1 min-w-0 resize-none bg-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696A0] rounded-xl px-3.5 py-2.5 text-[15px] leading-snug max-h-[120px] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
            />

            {hasSendableContent ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleSend()}
                aria-label="Enviar mensagem"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[#00A884] hover:bg-[#06CF9C] text-[#0B141A] disabled:opacity-40 transition-colors shrink-0"
              >
                <SendHorizontal className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void startVoiceRecording()}
                title="Gravar nota de voz"
                aria-label="Gravar áudio"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[#00A884] hover:bg-[#06CF9C] text-[#0B141A] disabled:opacity-40 transition-colors shrink-0"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}
