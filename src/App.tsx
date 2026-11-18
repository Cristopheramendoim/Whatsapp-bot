import { useEffect, useRef, useState } from 'react';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatWindow, type StagedAttachment } from './components/ChatWindow';
import { MobileNav } from './components/MobileNav';
import { PasscodeGate } from './components/PasscodeGate';
import { TaskPanel } from './components/TaskPanel';
import type {
  ChatMessage,
  ChatThread,
  MobileTab,
  PriorityLevel,
  SuggestedTask,
  TaskItem,
} from './types';
import {
  createInitialWorkspace,
  saveWorkspace,
  type WorkspaceState,
} from './utils/storage';

const TOKEN_STORAGE_KEY = 'zapassist_access_token';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [authChecking, setAuthChecking] = useState<boolean>(() => {
    try {
      return Boolean(sessionStorage.getItem(TOKEN_STORAGE_KEY));
    } catch {
      return false;
    }
  });

  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [tabletTasksOpen, setTabletTasksOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [busyStatus, setBusyStatus] = useState('');
  const [toastText, setToastText] = useState<string | null>(null);

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const hasHydratedRef = useRef(false);

  function showToast(msg: string) {
    setToastText(msg);
    setTimeout(() => setToastText((prev) => (prev === msg ? null : prev)), 2800);
  }

  function handleClearLock() {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    hasHydratedRef.current = false;
    setAccessToken(null);
    setWorkspace(null);
  }

  // Verify stored token on startup
  useEffect(() => {
    if (!accessToken) {
      setAuthChecking(false);
      return;
    }

    let cancelled = false;
    fetch('/api/auth/verify', {
      headers: { 'x-access-token': accessToken },
    })
      .then((res) => res.json() as Promise<{ unlocked?: boolean }>)
      .then((data) => {
        if (cancelled) return;
        if (!data.unlocked) {
          handleClearLock();
        }
        setAuthChecking(false);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load workspace from local server once unlocked
  useEffect(() => {
    if (!accessToken || authChecking) return;
    let cancelled = false;

    async function fetchServerWorkspace() {
      try {
        const res = await fetch('/api/workspace', {
          headers: { 'x-access-token': accessToken || '' },
        });
        if (res.status === 401) {
          if (!cancelled) handleClearLock();
          return;
        }
        if (!res.ok) {
          throw new Error('Não foi possível carregar os dados do servidor.');
        }
        const data = (await res.json()) as WorkspaceState;
        if (!cancelled) {
          setWorkspace(data);
          hasHydratedRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Erro ao conectar com o servidor.'
          );
          setWorkspace(createInitialWorkspace());
          hasHydratedRef.current = true;
        }
      }
    }

    void fetchServerWorkspace();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authChecking]);

  // Persist workspace updates to server sequentially & keep local mirror
  useEffect(() => {
    if (!accessToken || !workspace || !hasHydratedRef.current) return;
    saveWorkspace(workspace);

    const snapshot = workspace;
    const token = accessToken;
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        const res = await fetch('/api/workspace', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': token,
          },
          body: JSON.stringify(snapshot),
        });
        if (res.status === 401) {
          handleClearLock();
          return;
        }
        if (!res.ok) {
          throw new Error('Falha ao salvar no servidor.');
        }
      })
      .catch(() => {
        showToast('Aviso: não foi possível sincronizar a última alteração no servidor.');
      });
  }, [workspace, accessToken]);

  function handleUnlocked(token: string) {
    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // ignore
    }
    setLoadError(null);
    setAccessToken(token);
    setAuthChecking(false);
  }

  async function handleLockSite() {
    const token = accessToken;
    handleClearLock();
    if (token) {
      try {
        await fetch('/api/auth/lock', {
          method: 'POST',
          headers: { 'x-access-token': token },
        });
      } catch {
        // ignore
      }
    }
  }

  if (authChecking) {
    return (
      <div className="min-h-dvh bg-[#0B141A] text-[#E9EDEF] flex items-center justify-center p-6">
        <p className="text-sm text-[#8696A0]">Verificando acesso...</p>
      </div>
    );
  }

  if (!accessToken) {
    return <PasscodeGate onUnlocked={handleUnlocked} />;
  }

  if (!workspace) {
    return (
      <div className="min-h-dvh bg-[#0B141A] text-[#E9EDEF] flex items-center justify-center p-6">
        <p className="text-sm text-[#8696A0]">Carregando conversas e tarefas...</p>
      </div>
    );
  }

  const activeThread =
    workspace.threads.find((t) => t.id === workspace.activeThreadId) ||
    workspace.threads[0];

  const activeMessages = workspace.messagesByThread[activeThread.id] || [];
  const pendingTaskCount = workspace.tasks.filter((t) => !t.completed).length;

  function handleSelectThread(threadId: string) {
    setWorkspace((prev) => (prev ? { ...prev, activeThreadId: threadId } : prev));
    setMobileTab('chat');
  }

  function handleCreateThread(title: string) {
    const now = new Date().toISOString();
    const id = makeId('chat');
    const newThread: ChatThread = {
      id,
      title,
      subtitle: 'Nova conversa com o ZapAssist',
      updatedAt: now,
      lastPreview: 'Envie sua primeira mensagem, áudio ou anexo.',
    };
    const starterMessage: ChatMessage = {
      id: makeId('msg'),
      threadId: id,
      sender: 'assistant',
      timestamp: now,
      text: `Conversa *${title}* iniciada.\n\nPode mandar sua dúvida, áudio ou arquivo que eu respondo direto no formato do WhatsApp.`,
    };

    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            threads: [newThread, ...prev.threads],
            messagesByThread: {
              ...prev.messagesByThread,
              [id]: [starterMessage],
            },
            activeThreadId: id,
          }
        : prev
    );
    setMobileTab('chat');
  }

  function handleDeleteThread(threadId: string) {
    setWorkspace((prev) => {
      if (!prev || prev.threads.length <= 1) return prev;
      const remaining = prev.threads.filter((t) => t.id !== threadId);
      const nextMessages = { ...prev.messagesByThread };
      delete nextMessages[threadId];
      const nextActive =
        prev.activeThreadId === threadId ? remaining[0].id : prev.activeThreadId;

      return {
        ...prev,
        threads: remaining,
        messagesByThread: nextMessages,
        activeThreadId: nextActive,
      };
    });
  }

  function handleClearThread() {
    const now = new Date().toISOString();
    const resetMessage: ChatMessage = {
      id: makeId('msg'),
      threadId: activeThread.id,
      sender: 'assistant',
      timestamp: now,
      text: 'Histórico desta conversa limpo. _O que vamos resolver agora?_',
    };

    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            messagesByThread: {
              ...prev.messagesByThread,
              [activeThread.id]: [resetMessage],
            },
            threads: prev.threads.map((t) =>
              t.id === activeThread.id
                ? { ...t, updatedAt: now, lastPreview: 'Conversa reiniciada.' }
                : t
            ),
          }
        : prev
    );
    showToast('Conversa limpa.');
  }

  function handleAddTask(
    title: string,
    priority: PriorityLevel,
    notes?: string,
    sourceThreadTitle?: string
  ) {
    const newTask: TaskItem = {
      id: makeId('task'),
      title,
      notes,
      priority,
      completed: false,
      createdAt: new Date().toISOString(),
      sourceThreadTitle,
    };

    setWorkspace((prev) =>
      prev ? { ...prev, tasks: [newTask, ...prev.tasks] } : prev
    );
  }

  function handleToggleTask(taskId: string) {
    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === taskId ? { ...t, completed: !t.completed } : t
            ),
          }
        : prev
    );
  }

  function handleCyclePriority(taskId: string) {
    const nextMap: Record<PriorityLevel, PriorityLevel> = {
      alta: 'media',
      media: 'baixa',
      baixa: 'alta',
    };
    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === taskId ? { ...t, priority: nextMap[t.priority] } : t
            ),
          }
        : prev
    );
  }

  function handleDeleteTask(taskId: string) {
    setWorkspace((prev) =>
      prev
        ? { ...prev, tasks: prev.tasks.filter((t) => t.id !== taskId) }
        : prev
    );
  }

  function handleAddSuggestedTask(messageId: string, suggested: SuggestedTask) {
    handleAddTask(
      suggested.title,
      suggested.priority,
      suggested.notes,
      activeThread.title
    );

    setWorkspace((prev) => {
      if (!prev) return prev;
      const msgs = prev.messagesByThread[activeThread.id] || [];
      return {
        ...prev,
        messagesByThread: {
          ...prev.messagesByThread,
          [activeThread.id]: msgs.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  addedTaskTitles: Array.from(
                    new Set([...(m.addedTaskTitles || []), suggested.title])
                  ),
                }
              : m
          ),
        },
      };
    });

    showToast('Tarefa adicionada à lista.');
  }

  async function handleSendMessage(text: string, attachment?: StagedAttachment) {
    if (!accessToken) return;
    const threadId = activeThread.id;
    const now = new Date().toISOString();
    const userMsgId = makeId('msg');

    const userMessage: ChatMessage = {
      id: userMsgId,
      threadId,
      sender: 'user',
      text,
      timestamp: now,
      attachment: attachment
        ? {
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            kind: attachment.kind,
            dataUrl: attachment.dataUrl,
          }
        : undefined,
    };

    const previewLabel = text
      ? text
      : attachment?.kind === 'audio'
        ? 'Nota de voz enviada'
        : `Anexo: ${attachment?.name || 'arquivo'}`;

    const historySnapshot = activeMessages.slice(-10).map((m) => ({
      role: m.sender === 'user' ? ('user' as const) : ('model' as const),
      text: m.transcription
        ? `${m.text}\n[Transcrição de áudio]: ${m.transcription}`
        : m.text,
    }));

    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            messagesByThread: {
              ...prev.messagesByThread,
              [threadId]: [...(prev.messagesByThread[threadId] || []), userMessage],
            },
            threads: prev.threads.map((t) =>
              t.id === threadId ? { ...t, updatedAt: now, lastPreview: previewLabel } : t
            ),
          }
        : prev
    );

    setIsBusy(true);

    try {
      let messageToSend = text;
      let audioTranscription = '';

      if (attachment && attachment.kind === 'audio') {
        setBusyStatus('Transcrevendo áudio...');
        const transcribeRes = await fetch('/api/assistant/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': accessToken,
          },
          body: JSON.stringify({
            audioBase64: attachment.base64,
            mimeType: attachment.mimeType,
          }),
        });

        if (transcribeRes.status === 401) {
          handleClearLock();
          return;
        }

        const transcribeData = (await transcribeRes.json()) as {
          transcription?: string;
          error?: string;
        };

        if (!transcribeRes.ok) {
          throw new Error(transcribeData.error || 'Falha ao transcrever o áudio.');
        }

        audioTranscription = (transcribeData.transcription || '').trim();

        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                messagesByThread: {
                  ...prev.messagesByThread,
                  [threadId]: (prev.messagesByThread[threadId] || []).map((m) =>
                    m.id === userMsgId ? { ...m, transcription: audioTranscription } : m
                  ),
                },
              }
            : prev
        );

        messageToSend = [
          text ? `Instrução do usuário: ${text}` : '',
          `Transcrição do áudio enviado pelo usuário:\n"${audioTranscription}"`,
          'Responda diretamente ao que foi pedido no áudio e extraia tarefas se houver ações.',
        ]
          .filter(Boolean)
          .join('\n\n');
      }

      setBusyStatus(
        attachment && attachment.kind !== 'audio'
          ? 'Lendo anexo e respondendo...'
          : 'Escrevendo resposta...'
      );

      const chatRes = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': accessToken,
        },
        body: JSON.stringify({
          message: messageToSend,
          history: historySnapshot,
          attachment:
            attachment && attachment.kind !== 'audio'
              ? {
                  base64: attachment.base64,
                  mimeType: attachment.mimeType,
                  name: attachment.name,
                }
              : undefined,
          tasksContext: (workspace?.tasks || []).map((t) => ({
            title: t.title,
            priority: t.priority,
            completed: t.completed,
          })),
        }),
      });

      if (chatRes.status === 401) {
        handleClearLock();
        return;
      }

      const chatData = (await chatRes.json()) as {
        reply?: string;
        suggestedTasks?: SuggestedTask[];
        error?: string;
      };

      if (!chatRes.ok) {
        throw new Error(chatData.error || 'Erro ao gerar resposta.');
      }

      const replyTime = new Date().toISOString();
      const assistantMessage: ChatMessage = {
        id: makeId('msg'),
        threadId,
        sender: 'assistant',
        text: chatData.reply || 'Pronto.',
        timestamp: replyTime,
        suggestedTasks: chatData.suggestedTasks || [],
        addedTaskTitles: [],
      };

      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              messagesByThread: {
                ...prev.messagesByThread,
                [threadId]: [
                  ...(prev.messagesByThread[threadId] || []),
                  assistantMessage,
                ],
              },
              threads: prev.threads.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      updatedAt: replyTime,
                      lastPreview: assistantMessage.text
                        .replace(/[*_~]/g, '')
                        .slice(0, 70),
                    }
                  : t
              ),
            }
          : prev
      );
    } catch (error) {
      const errText =
        error instanceof Error
          ? error.message
          : 'Erro inesperado ao falar com o assistente.';
      const errorMsg: ChatMessage = {
        id: makeId('msg'),
        threadId,
        sender: 'assistant',
        timestamp: new Date().toISOString(),
        text: `*Não foi possível concluir:* ${errText}`,
        error: true,
      };
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              messagesByThread: {
                ...prev.messagesByThread,
                [threadId]: [...(prev.messagesByThread[threadId] || []), errorMsg],
              },
            }
          : prev
      );
    } finally {
      setIsBusy(false);
      setBusyStatus('');
    }
  }

  async function handleExtractTasksFromMessage(message: ChatMessage) {
    if (isBusy || !accessToken) return;
    setIsBusy(true);
    setBusyStatus('Extraindo tarefas...');

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': accessToken,
        },
        body: JSON.stringify({
          message: `Extraia tarefas práticas deste conteúdo:\n\n${message.text}`,
          extractTasksOnly: true,
          tasksContext: (workspace?.tasks || []).map((t) => ({
            title: t.title,
            priority: t.priority,
            completed: t.completed,
          })),
        }),
      });

      if (res.status === 401) {
        handleClearLock();
        return;
      }

      const data = (await res.json()) as {
        suggestedTasks?: SuggestedTask[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao extrair tarefas.');
      }

      const extracted = data.suggestedTasks || [];
      if (extracted.length === 0) {
        showToast('Nenhuma tarefa acionável identificada nesta mensagem.');
        return;
      }

      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              messagesByThread: {
                ...prev.messagesByThread,
                [activeThread.id]: (prev.messagesByThread[activeThread.id] || []).map(
                  (m) =>
                    m.id === message.id ? { ...m, suggestedTasks: extracted } : m
                ),
              },
            }
          : prev
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao extrair tarefas.');
    } finally {
      setIsBusy(false);
      setBusyStatus('');
    }
  }

  function handleExportBackup() {
    if (!workspace) return;
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zapassist-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exportado em JSON.');
  }

  function handleImportBackup(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as WorkspaceState;
        if (!parsed || !Array.isArray(parsed.threads) || parsed.threads.length === 0) {
          showToast('Arquivo de backup inválido.');
          return;
        }
        setWorkspace({
          profile: parsed.profile || { name: 'Meu Espaço' },
          threads: parsed.threads,
          messagesByThread: parsed.messagesByThread || {},
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
          activeThreadId: parsed.activeThreadId || parsed.threads[0].id,
        });
        showToast('Backup restaurado e salvo no servidor.');
      } catch {
        showToast('Não foi possível ler o arquivo de backup.');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="h-dvh w-full bg-[#0B141A] text-[#E9EDEF] flex flex-col overflow-hidden">
      {loadError && (
        <div className="px-4 py-1.5 bg-amber-950/80 border-b border-amber-500/30 text-xs text-amber-200 text-center shrink-0">
          {loadError}
        </div>
      )}

      {/* Main 3-Pane Responsive Workspace */}
      <main className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Left Sidebar: Threads */}
        <div
          className={`${
            mobileTab === 'threads' ? 'flex w-full' : 'hidden'
          } md:flex md:w-[290px] lg:w-[320px] shrink-0 h-full flex-col`}
        >
          <ChatSidebar
            threads={workspace.threads}
            activeThreadId={activeThread.id}
            onSelectThread={handleSelectThread}
            onCreateThread={handleCreateThread}
            onDeleteThread={handleDeleteThread}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onLockSite={() => void handleLockSite()}
          />
        </div>

        {/* Center Pane: Chat Window */}
        <div
          className={`${
            mobileTab === 'chat' ? 'flex' : 'hidden'
          } md:flex flex-1 min-w-0 h-full flex-col`}
        >
          <ChatWindow
            thread={activeThread}
            messages={activeMessages}
            isBusy={isBusy}
            busyStatus={busyStatus}
            pendingTaskCount={pendingTaskCount}
            onBackToThreads={() => setMobileTab('threads')}
            onOpenTabletTasks={() => setTabletTasksOpen(true)}
            onClearThread={handleClearThread}
            onSendMessage={handleSendMessage}
            onAddSuggestedTask={handleAddSuggestedTask}
            onExtractTasksFromMessage={handleExtractTasksFromMessage}
          />
        </div>

        {/* Right Pane: Tasks & Priorities */}
        <div
          className={`${
            mobileTab === 'tasks' ? 'flex w-full' : 'hidden'
          } xl:flex xl:w-[360px] shrink-0 h-full flex-col`}
        >
          <TaskPanel
            tasks={workspace.tasks}
            onAddTask={(title, priority, notes) =>
              handleAddTask(title, priority, notes)
            }
            onToggleTask={handleToggleTask}
            onCyclePriority={handleCyclePriority}
            onDeleteTask={handleDeleteTask}
          />
        </div>

        {/* Tablet Slide-Over Drawer for Tasks (md to xl) */}
        {tabletTasksOpen && (
          <div
            onClick={() => setTabletTasksOpen(false)}
            className="fixed inset-0 z-40 hidden md:flex xl:hidden justify-end bg-black/55 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-[380px] h-full bg-[#111B21] flex flex-col shadow-2xl"
            >
              <TaskPanel
                tasks={workspace.tasks}
                onAddTask={(title, priority, notes) =>
                  handleAddTask(title, priority, notes)
                }
                onToggleTask={handleToggleTask}
                onCyclePriority={handleCyclePriority}
                onDeleteTask={handleDeleteTask}
                onClose={() => setTabletTasksOpen(false)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        activeTab={mobileTab}
        onSelectTab={setMobileTab}
        pendingTaskCount={pendingTaskCount}
      />

      {/* Ephemeral Toast Notification */}
      {toastText && (
        <div
          role="status"
          className="fixed bottom-18 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#202C33] border border-[#00A884]/40 text-xs font-medium text-[#E9EDEF] shadow-lg whitespace-nowrap"
        >
          {toastText}
        </div>
      )}
    </div>
  );
}
