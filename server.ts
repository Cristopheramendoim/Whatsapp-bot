import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SITE_PASSCODE = process.env.SITE_PASSCODE || '171020';
const activeSessions = new Set<string>();

function isPasscodeValid(attempt: string): boolean {
  const a = Buffer.from(attempt, 'utf-8');
  const b = Buffer.from(SITE_PASSCODE, 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAccessToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('x-access-token') || '';
  if (!token || !activeSessions.has(token)) {
    res.status(401).json({ error: 'Sessão bloqueada. Informe a senha para continuar.' });
    return;
  }
  next();
}
const DATA_DIR = path.resolve(__dirname, 'data');
const WORKSPACE_FILE = path.join(DATA_DIR, 'workspace.json');

interface ServerWorkspace {
  profile: { name: string };
  activeThreadId: string;
  threads: Array<{
    id: string;
    title: string;
    subtitle: string;
    updatedAt: string;
    lastPreview: string;
  }>;
  messagesByThread: Record<string, Array<Record<string, unknown>>>;
  tasks: Array<Record<string, unknown>>;
}

function createDefaultWorkspace(): ServerWorkspace {
  const now = new Date().toISOString();
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

function writeWorkspaceToDisk(workspace: ServerWorkspace): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${WORKSPACE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(workspace, null, 2), 'utf-8');
  fs.renameSync(tmpFile, WORKSPACE_FILE);
}

function readWorkspaceFromDisk(): ServerWorkspace {
  try {
    if (!fs.existsSync(WORKSPACE_FILE)) {
      const initial = createDefaultWorkspace();
      writeWorkspaceToDisk(initial);
      return initial;
    }
    const raw = fs.readFileSync(WORKSPACE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ServerWorkspace>;
    if (!parsed || !Array.isArray(parsed.threads) || parsed.threads.length === 0) {
      const fallback = createDefaultWorkspace();
      writeWorkspaceToDisk(fallback);
      return fallback;
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
    const fallback = createDefaultWorkspace();
    writeWorkspaceToDisk(fallback);
    return fallback;
  }
}

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chave GEMINI_API_KEY não configurada no servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const WHATSAPP_SYSTEM_INSTRUCTION = `Você é meu assistente pessoal integrado ao WhatsApp (ZapAssist).
Suas regras obrigatórias de resposta:
- Responda sempre em português, de forma direta, clara e objetiva.
- Use a formatação nativa do WhatsApp: *negrito* para destaques (use apenas um asterisco de cada lado, nunca dois), _itálico_ para observações e listas curtas com tópicos (- ou •).
- NUNCA use **dois asteriscos**, # títulos Markdown ou blocos extensos.
- Nunca escreva textos longos ou enrolados; vá direto ao ponto em no máximo 3 parágrafos curtos, pois a leitura será feita na tela do celular.
- Quando eu pedir um resumo, tarefa ou ideia, entregue a resposta pronta para uso imediato.
- Sempre que a mensagem, áudio transcrito ou anexo contiver ações práticas, compromissos, prazos ou um pedido explícito de tarefas/prioridades, preencha também o campo suggestedTasks com tarefas curtas e objetivas.`;

function sanitizeWhatsAppFormatting(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .trim();
}

function normalizePriority(value: string | undefined): 'alta' | 'media' | 'baixa' {
  const normalized = (value || '').toLowerCase().trim();
  if (normalized === 'alta' || normalized === 'high') return 'alta';
  if (normalized === 'baixa' || normalized === 'low') return 'baixa';
  return 'media';
}

function extractErrorDetails(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message: 'Chave da API Gemini inválida ou sem permissão. Verifique Settings > Secrets.',
    };
  }
  if (rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('429')) {
    return {
      status: 429,
      message: 'Limite de requisições atingido no momento. Tente novamente em instantes.',
    };
  }
  return {
    status: 500,
    message: rawMessage || 'Falha ao processar solicitação com o assistente.',
  };
}

interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

interface IncomingAttachment {
  base64: string;
  mimeType: string;
  name: string;
}

interface TaskContextItem {
  title: string;
  priority: string;
  completed: boolean;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/auth/unlock', (req: Request, res: Response) => {
    const { passcode } = (req.body || {}) as { passcode?: string };
    if (typeof passcode !== 'string' || !isPasscodeValid(passcode.trim())) {
      res.status(401).json({ error: 'Senha incorreta.' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    activeSessions.add(token);
    res.json({ token });
  });

  app.get('/api/auth/verify', (req: Request, res: Response) => {
    const token = req.header('x-access-token') || '';
    res.json({ unlocked: Boolean(token && activeSessions.has(token)) });
  });

  app.post('/api/auth/lock', (req: Request, res: Response) => {
    const token = req.header('x-access-token') || '';
    if (token) activeSessions.delete(token);
    res.json({ ok: true });
  });

  app.get('/api/workspace', requireAccessToken, (_req: Request, res: Response) => {
    try {
      const workspace = readWorkspaceFromDisk();
      res.json(workspace);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao carregar dados do servidor.',
      });
    }
  });

  app.put('/api/workspace', requireAccessToken, (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<ServerWorkspace>;
      if (!body || !Array.isArray(body.threads) || body.threads.length === 0) {
        res.status(400).json({ error: 'Estrutura de workspace inválida.' });
        return;
      }

      const normalized: ServerWorkspace = {
        profile: body.profile?.name ? body.profile : { name: 'Meu Espaço' },
        threads: body.threads,
        messagesByThread: body.messagesByThread || {},
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
        activeThreadId:
          body.activeThreadId && body.threads.some((t) => t.id === body.activeThreadId)
            ? body.activeThreadId
            : body.threads[0].id,
      };

      writeWorkspaceToDisk(normalized);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao salvar dados no servidor.',
      });
    }
  });

  app.post('/api/assistant/transcribe', requireAccessToken, async (req: Request, res: Response) => {
    try {
      const { audioBase64, mimeType } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };

      if (!audioBase64 || !mimeType) {
        res.status(400).json({ error: 'Áudio e tipo MIME são obrigatórios.' });
        return;
      }

      const ai = createGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            {
              text: 'Transcreva este áudio em português de forma fiel, clara e direta. Retorne apenas a transcrição exata.',
            },
          ],
        },
      });

      const transcription = (response.text || '').trim();
      if (!transcription) {
        res.status(422).json({ error: 'Não foi possível identificar fala no áudio enviado.' });
        return;
      }

      res.json({ transcription });
    } catch (error) {
      const details = extractErrorDetails(error);
      res.status(details.status).json({ error: details.message });
    }
  });

  app.post('/api/assistant/chat', requireAccessToken, async (req: Request, res: Response) => {
    try {
      const {
        message,
        history = [],
        attachment,
        tasksContext = [],
        extractTasksOnly = false,
      } = req.body as {
        message?: string;
        history?: ChatHistoryItem[];
        attachment?: IncomingAttachment;
        tasksContext?: TaskContextItem[];
        extractTasksOnly?: boolean;
      };

      if (!message && !attachment) {
        res.status(400).json({ error: 'Envie uma mensagem ou um anexo.' });
        return;
      }

      const ai = createGeminiClient();
      const nowFormatted = new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      });

      const openTasksSummary = tasksContext
        .filter((t) => !t.completed)
        .slice(0, 12)
        .map((t) => `- [${t.priority}] ${t.title}`)
        .join('\n');

      const contextInstruction = [
        WHATSAPP_SYSTEM_INSTRUCTION,
        `Data e hora atual: ${nowFormatted}.`,
        openTasksSummary
          ? `Tarefas pendentes atuais do usuário:\n${openTasksSummary}`
          : 'O usuário ainda não possui tarefas pendentes registradas.',
        extractTasksOnly
          ? 'Foco especial agora: extraia e organize todas as tarefas acionáveis do conteúdo fornecido em suggestedTasks e confirme de forma ultra-curta no reply.'
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const recentHistory = history
        .slice(-10)
        .map((item) => ({
          role: item.role,
          parts: [{ text: item.text }],
        }));

      const currentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (attachment && attachment.base64 && attachment.mimeType) {
        const isPlainText =
          attachment.mimeType.startsWith('text/') ||
          attachment.mimeType === 'application/json';

        if (isPlainText) {
          const decodedText = Buffer.from(attachment.base64, 'base64').toString('utf-8').slice(0, 30000);
          currentParts.push({
            text: `Conteúdo do arquivo anexado (${attachment.name}):\n\n${decodedText}`,
          });
        } else {
          currentParts.push({
            inlineData: {
              mimeType: attachment.mimeType,
              data: attachment.base64,
            },
          });
        }
      }

      currentParts.push({
        text: (message || `Analise o anexo "${attachment?.name || 'arquivo'}" e entregue o resultado pronto para uso.`).trim(),
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          ...recentHistory,
          {
            role: 'user',
            parts: currentParts,
          },
        ],
        config: {
          systemInstruction: contextInstruction,
          thinkingConfig: {
            thinkingLevel: attachment ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description:
                  'Resposta direta ao usuário em português, no máximo 3 parágrafos curtos, formatada exclusivamente com sintaxe nativa do WhatsApp (*negrito*, _itálico_, listas curtas).',
              },
              suggestedTasks: {
                type: Type.ARRAY,
                description:
                  'Tarefas acionáveis identificadas na mensagem, áudio ou anexo. Retorne array vazio se não houver tarefas claras.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: {
                      type: Type.STRING,
                      description: 'Título curto e direto da tarefa.',
                    },
                    priority: {
                      type: Type.STRING,
                      description: 'Prioridade da tarefa: alta, media ou baixa.',
                    },
                    notes: {
                      type: Type.STRING,
                      description: 'Prazo ou detalhe breve opcional.',
                    },
                  },
                  required: ['title', 'priority'],
                },
              },
            },
            required: ['reply', 'suggestedTasks'],
          },
        },
      });

      const rawJson = (response.text || '').trim();
      let parsed: {
        reply?: string;
        suggestedTasks?: Array<{ title?: string; priority?: string; notes?: string }>;
      };

      try {
        parsed = JSON.parse(rawJson);
      } catch {
        parsed = {
          reply: rawJson || 'Não consegui gerar uma resposta agora. Tente reformular seu pedido.',
          suggestedTasks: [],
        };
      }

      const reply = sanitizeWhatsAppFormatting(
        parsed.reply || 'Pronto. Como posso ajudar a seguir?'
      );

      const suggestedTasks = Array.isArray(parsed.suggestedTasks)
        ? parsed.suggestedTasks
            .filter((t) => typeof t?.title === 'string' && t.title.trim().length > 0)
            .slice(0, 8)
            .map((t) => ({
              title: t.title!.trim().slice(0, 120),
              priority: normalizePriority(t.priority),
              notes: typeof t.notes === 'string' ? t.notes.trim().slice(0, 160) : undefined,
            }))
        : [];

      res.json({ reply, suggestedTasks });
    } catch (error) {
      const details = extractErrorDetails(error);
      res.status(details.status).json({ error: details.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZapAssist server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ZapAssist server:', err);
  process.exit(1);
});
