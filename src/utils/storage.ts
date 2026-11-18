import type { ChatMessage, ChatThread, TaskItem, UserProfile } from '../types';

const STORAGE_KEY = 'zapassist_workspace_v1';

export interface WorkspaceState {
  profile: UserProfile;
  threads: ChatThread[];
  messagesByThread: Record<string, ChatMessage[]>;
  tasks: TaskItem[];
  activeThreadId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createInitialWorkspace(): WorkspaceState {
  const now = nowIso();
  const thread1Id = 'rotina-diaria';
  const thread2Id = 'resumos-e-ideias';

  return {
    profile: { name: 'Meu Espaço' },
    activeThreadId: thread1Id,
    threads: [
      {
        id: thread1Id,
        title: 'Rotina & Prioridades',
        subtitle: 'Tarefas, áudios e organização rápida',
        updatedAt: now,
        lastPreview: 'Pronto para organizar seu dia. Envie um áudio, anexo ou pedido.',
      },
      {
        id: thread2Id,
        title: 'Resumos & Ideias',
        subtitle: 'Textos prontos para encaminhar no WhatsApp',
        updatedAt: now,
        lastPreview: 'Cole um texto longo ou print para resumir em segundos.',
      },
    ],
    messagesByThread: {
      [thread1Id]: [
        {
          id: 'welcome-1',
          threadId: thread1Id,
          sender: 'assistant',
          timestamp: now,
          text:
            'Olá! Sou o *ZapAssist*, seu assistente pessoal estilo WhatsApp.\n\n' +
            '• *Áudios e anexos:* grave uma nota de voz ou envie imagens e documentos para eu transcrever e resumir.\n' +
            '• *Tarefas prontas:* peça para organizar seu dia e salve direto na lista de prioridades.\n\n' +
            '_Como posso agilizar sua rotina agora?_',
        },
      ],
      [thread2Id]: [
        {
          id: 'welcome-2',
          threadId: thread2Id,
          sender: 'assistant',
          timestamp: now,
          text:
            'Espaço focado em *resumos objetivos* e *ideias rápidas*.\n\n' +
            'Cole qualquer texto, PDF ou print de conversa que eu devolvo a versão pronta para você copiar e enviar no WhatsApp.',
        },
      ],
    },
    tasks: [
      {
        id: 'task-seed-1',
        title: 'Revisar pendências urgentes da manhã',
        notes: 'Priorizar entregas antes das 12h',
        priority: 'alta',
        completed: false,
        createdAt: now,
        sourceThreadTitle: 'Rotina & Prioridades',
      },
      {
        id: 'task-seed-2',
        title: 'Testar gravação de áudio para gerar tarefas',
        notes: 'Toque no microfone na barra de mensagem',
        priority: 'media',
        completed: false,
        createdAt: now,
        sourceThreadTitle: 'Rotina & Prioridades',
      },
    ],
  };
}

export function loadWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialWorkspace();
    }
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    if (!parsed || !Array.isArray(parsed.threads) || parsed.threads.length === 0) {
      return createInitialWorkspace();
    }
    return {
      profile: parsed.profile?.name ? parsed.profile : { name: 'Meu Espaço' },
      threads: parsed.threads,
      messagesByThread: parsed.messagesByThread || {},
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      activeThreadId:
        parsed.activeThreadId && parsed.threads.some((t) => t.id === parsed.activeThreadId)
          ? parsed.activeThreadId
          : parsed.threads[0].id,
    };
  } catch {
    return createInitialWorkspace();
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  try {
    const trimmedMessages: Record<string, ChatMessage[]> = {};
    for (const [threadId, msgs] of Object.entries(state.messagesByThread)) {
      trimmedMessages[threadId] = msgs.slice(-80).map((m) => ({
        ...m,
        attachment: m.attachment
          ? {
              ...m.attachment,
              // Avoid storing oversized dataUrls (> 400KB) in localStorage quota
              dataUrl:
                m.attachment.dataUrl && m.attachment.dataUrl.length < 400_000
                  ? m.attachment.dataUrl
                  : undefined,
            }
          : undefined,
      }));
    }

    const payload: WorkspaceState = {
      ...state,
      messagesByThread: trimmedMessages,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Graceful fallback if localStorage quota is full
  }
}

export function formatShortTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--:--';
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
