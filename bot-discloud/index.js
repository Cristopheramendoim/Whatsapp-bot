import fs from 'node:fs';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import pino from 'pino';

// ================= CONFIGURAÇÕES =================
const MEU_NUMERO = '5512981555800';
const MEU_JID = `${MEU_NUMERO}@s.whatsapp.net`;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'COLE_SUA_CHAVE_GEMINI_AQUI';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
const ARQUIVO_LEMBRETES = './lembretes.json';
// =================================================

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Evita loop infinito ignorando mensagens enviadas pelo próprio bot
const idsEnviadosPeloBot = new Set();
// Histórico curto em memória (máx. 8 trocas para caber em 100MB de RAM)
const historicoCurto = [];
let sockGlobal = null;
let verificadorIniciado = false;
let pareamentoSolicitado = false;

function lerLembretes() {
  try {
    if (!fs.existsSync(ARQUIVO_LEMBRETES)) return [];
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_LEMBRETES, 'utf-8'));
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

function salvarLembretes(lista) {
  const tmp = `${ARQUIVO_LEMBRETES}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 2), 'utf-8');
  fs.renameSync(tmp, ARQUIVO_LEMBRETES);
}

function limparFormatacaoWhatsApp(texto) {
  return (texto || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .trim();
}

function extrairTextoMensagem(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();
}

async function enviarParaMeuChat(texto) {
  if (!sockGlobal) return;
  const enviado = await sockGlobal.sendMessage(MEU_JID, {
    text: limparFormatacaoWhatsApp(texto),
  });
  if (enviado?.key?.id) {
    idsEnviadosPeloBot.add(enviado.key.id);
    if (idsEnviadosPeloBot.size > 100) {
      const primeiro = idsEnviadosPeloBot.values().next().value;
      idsEnviadosPeloBot.delete(primeiro);
    }
  }
}

async function verificarLembretesVencidos() {
  if (!sockGlobal) return;
  const lembretes = lerLembretes();
  if (lembretes.length === 0) return;

  const agora = Date.now();
  const restantes = [];
  let houveAlteracao = false;

  for (const item of lembretes) {
    const horarioAlvo = new Date(item.dataHoraISO).getTime();
    if (!Number.isNaN(horarioAlvo) && agora >= horarioAlvo) {
      houveAlteracao = true;
      try {
        await enviarParaMeuChat(
          `⏰ *Lembrete:* ${item.titulo}\n_Agendado para ${item.dataLegivel}. Este aviso foi removido da lista._`
        );
      } catch (err) {
        console.error('Erro ao enviar lembrete:', err?.message || err);
        restantes.push(item);
      }
    } else {
      restantes.push(item);
    }
  }

  if (houveAlteracao) {
    salvarLembretes(restantes);
  }
}

async function consultarGemini(textoUsuario) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'COLE_SUA_CHAVE_GEMINI_AQUI') {
    return {
      reply:
        '⚠️ Configure sua *GEMINI_API_KEY* nas variáveis de ambiente da Discloud ou no _index.js_ para ativar a IA.',
    };
  }

  const agoraBR = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const lembretesAtuais = lerLembretes();
  const resumoLembretes =
    lembretesAtuais.length > 0
      ? lembretesAtuais
          .map((l) => `- ${l.titulo} (${l.dataLegivel}) [ISO: ${l.dataHoraISO}]`)
          .join('\n')
      : 'Nenhum lembrete agendado.';

  const systemInstruction = `Você é meu assistente pessoal integrado ao WhatsApp.
Regras obrigatórias de resposta:
- Responda sempre em português, de forma direta, clara e objetiva.
- Use a formatação nativa do WhatsApp: *negrito* para destaques (use apenas um asterisco de cada lado, nunca dois), _itálico_ para observações e listas curtas com tópicos.
- Nunca escreva textos longos ou enrolados; vá direto ao ponto em no máximo 3 parágrafos curtos, pois a leitura será feita na tela do celular.
- Quando eu pedir um resumo, tarefa ou ideia, entregue a resposta pronta para uso imediato.
- Data e hora atual em Brasília (America/Sao_Paulo, UTC-03:00): ${agoraBR}.
- Lembretes marcados:\n${resumoLembretes}
- Se eu pedir para lembrar de algo em um dia/horário específico, preencha "novoLembrete" com "dataHoraISO" no fuso -03:00 (ex: 2026-11-20T09:00:00-03:00). Se eu não informar a hora, use 09:00:00-03:00.`;

  const contents = [
    ...historicoCurto.slice(-8),
    { role: 'user', parts: [{ text: textoUsuario }] },
  ];

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: {
            type: Type.STRING,
            description:
              'Resposta direta ao usuário em português, no máximo 3 parágrafos curtos, com formatação nativa do WhatsApp (*negrito*, _itálico_).',
          },
          novoLembrete: {
            type: Type.OBJECT,
            description:
              'Preencha apenas se o usuário pediu para agendar um novo lembrete.',
            properties: {
              titulo: { type: Type.STRING },
              dataHoraISO: {
                type: Type.STRING,
                description: 'Data e hora no formato ISO 8601 com fuso -03:00.',
              },
              dataLegivel: {
                type: Type.STRING,
                description: 'Data/hora legível em português (ex: 20/11 às 09:00).',
              },
            },
            required: ['titulo', 'dataHoraISO', 'dataLegivel'],
          },
          removerTitulo: {
            type: Type.STRING,
            description:
              'Trecho do título se o usuário pedir para cancelar/apagar um lembrete existente.',
          },
        },
        required: ['reply'],
      },
    },
  });

  const dados = JSON.parse((response.text || '{}').trim());

  if (dados.novoLembrete?.titulo && dados.novoLembrete?.dataHoraISO) {
    const lista = lerLembretes();
    lista.push({
      id: Date.now().toString(),
      titulo: dados.novoLembrete.titulo,
      dataHoraISO: dados.novoLembrete.dataHoraISO,
      dataLegivel: dados.novoLembrete.dataLegivel || dados.novoLembrete.dataHoraISO,
    });
    salvarLembretes(lista);
  }

  if (dados.removerTitulo) {
    const termo = dados.removerTitulo.toLowerCase();
    const filtrados = lerLembretes().filter(
      (l) => !l.titulo.toLowerCase().includes(termo)
    );
    salvarLembretes(filtrados);
  }

  const respostaFinal = limparFormatacaoWhatsApp(dados.reply || 'Pronto!');

  historicoCurto.push({ role: 'user', parts: [{ text: textoUsuario }] });
  historicoCurto.push({ role: 'model', parts: [{ text: respostaFinal }] });
  if (historicoCurto.length > 16) {
    historicoCurto.splice(0, historicoCurto.length - 16);
  }

  return { reply: respostaFinal };
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  });

  sockGlobal = sock;
  sock.ev.on('creds.update', saveCreds);

  // Solicita código de pareamento de 8 dígitos se ainda não estiver registrado
  if (!sock.authState.creds.registered && !pareamentoSolicitado) {
    pareamentoSolicitado = true;
    setTimeout(async () => {
      try {
        const codigo = await sock.requestPairingCode(MEU_NUMERO);
        console.log('\n==================================================');
        console.log('   CÓDIGO DE PAREAMENTO WHATSAPP (8 DÍGITOS):');
        console.log(`   >>>   ${codigo}   <<<`);
        console.log('==================================================\n');
      } catch (err) {
        pareamentoSolicitado = false;
        console.error('Erro ao gerar código de pareamento:', err?.message || err);
      }
    }, 3500);
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('Bot conectado ao WhatsApp com sucesso!');
      if (!verificadorIniciado) {
        verificadorIniciado = true;
        setInterval(() => {
          void verificarLembretesVencidos();
        }, 60_000);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const deveReconectar = statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão encerrada. Reconectando:', deveReconectar);
      if (deveReconectar) {
        setTimeout(() => void iniciarBot(), 4000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || !msg.key?.remoteJid) continue;
      if (idsEnviadosPeloBot.has(msg.key.id)) continue;

      const remoteJid = msg.key.remoteJid;
      const meuJidNormalizado = sock.user?.id
        ? `${sock.user.id.split(':')[0]}@s.whatsapp.net`
        : MEU_JID;
      const meuLid = sock.user?.lid ? `${sock.user.lid.split(':')[0]}@lid` : null;

      // Responde somente mensagens enviadas por você no seu próprio chat ("Você")
      const ehMeuProprioChat =
        remoteJid === MEU_JID ||
        remoteJid === meuJidNormalizado ||
        (meuLid && remoteJid === meuLid);

      if (!ehMeuProprioChat || !msg.key.fromMe) continue;

      const texto = extrairTextoMensagem(msg);
      if (!texto) continue;

      try {
        const { reply } = await consultarGemini(texto);
        await enviarParaMeuChat(reply);
      } catch (err) {
        console.error('Erro ao responder mensagem:', err?.message || err);
        await enviarParaMeuChat('⚠️ Erro ao consultar o assistente. Tente novamente.');
      }
    }
  });
}

iniciarBot().catch((err) => {
  console.error('Erro fatal ao iniciar bot:', err);
  process.exit(1);
});
