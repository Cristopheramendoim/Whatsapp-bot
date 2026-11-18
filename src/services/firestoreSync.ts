import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ChatMessage,
  ChatThread,
  PriorityLevel,
  SuggestedTask,
  TaskItem,
} from '../types';

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

export async function ensureUserProfileAndSeed(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);

  try {
    const snap = await getDoc(userRef);
    const baseProfile: Record<string, unknown> = {
      uid: user.uid,
      displayName: (user.displayName || user.email?.split('@')[0] || 'Usuário').slice(0, 120),
      email: (user.email || 'usuario@zapassist.local').slice(0, 200),
      updatedAt: serverTimestamp(),
    };
    if (user.photoURL) {
      baseProfile.photoURL = user.photoURL.slice(0, 500);
    }

    if (!snap.exists()) {
      await setDoc(userRef, {
        ...baseProfile,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName: baseProfile.displayName,
        email: baseProfile.email,
        ...(baseProfile.photoURL ? { photoURL: baseProfile.photoURL } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  // Seed starter conversations and tasks on first login if threads collection is empty
  const threadsPath = `users/${user.uid}/threads`;
  try {
    const q = query(
      collection(db, 'users', user.uid, 'threads'),
      where('ownerId', '==', user.uid)
    );
    const existingThreads = await getDocs(q);
    if (!existingThreads.empty) {
      return;
    }

    const thread1Id = 'rotina-diaria';
    const thread2Id = 'resumos-e-ideias';

    await setDoc(doc(db, 'users', user.uid, 'threads', thread1Id), {
      id: thread1Id,
      ownerId: user.uid,
      title: 'Rotina & Prioridades',
      subtitle: 'Tarefas, áudios e organização rápida',
      lastPreview: 'Pronto para organizar seu dia. Envie um áudio, anexo ou pedido.',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, 'users', user.uid, 'threads', thread1Id, 'messages', 'welcome-1'),
      {
        id: 'welcome-1',
        ownerId: user.uid,
        threadId: thread1Id,
        sender: 'assistant',
        text:
          'Olá! Sou o *ZapAssist*, seu assistente pessoal integrado à nuvem.\n\n' +
          '• *Áudios e anexos:* grave uma nota de voz ou envie imagens e documentos para eu transcrever e resumir.\n' +
          '• *Tarefas prontas:* peça para organizar seu dia e salve direto na lista de prioridades.\n\n' +
          '_Como posso agilizar sua rotina agora?_',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    await setDoc(doc(db, 'users', user.uid, 'threads', thread2Id), {
      id: thread2Id,
      ownerId: user.uid,
      title: 'Resumos & Ideias',
      subtitle: 'Textos prontos para encaminhar no WhatsApp',
      lastPreview: 'Cole um texto longo ou print para resumir em segundos.',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, 'users', user.uid, 'threads', thread2Id, 'messages', 'welcome-2'),
      {
        id: 'welcome-2',
        ownerId: user.uid,
        threadId: thread2Id,
        sender: 'assistant',
        text:
          'Espaço focado em *resumos objetivos* e *ideias rápidas*.\n\n' +
          'Cole qualquer texto, PDF ou print de conversa que eu devolvo a versão pronta para você copiar e enviar no WhatsApp.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    await setDoc(doc(db, 'users', user.uid, 'tasks', 'task-seed-1'), {
      id: 'task-seed-1',
      ownerId: user.uid,
      title: 'Revisar pendências urgentes da manhã',
      notes: 'Priorizar entregas antes das 12h',
      priority: 'alta',
      completed: false,
      sourceThreadTitle: 'Rotina & Prioridades',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, threadsPath);
  }
}

export function subscribeThreads(
  uid: string,
  onData: (threads: ChatThread[]) => void,
  onError?: (err: unknown) => void
) {
  const path = `users/${uid}/threads`;
  const q = query(collection(db, 'users', uid, 'threads'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ChatThread[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          title: String(data.title || 'Conversa'),
          subtitle: String(data.subtitle || ''),
          lastPreview: String(data.lastPreview || ''),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeMessages(
  uid: string,
  threadId: string,
  onData: (messages: ChatMessage[]) => void,
  onError?: (err: unknown) => void
) {
  const path = `users/${uid}/threads/${threadId}/messages`;
  const q = query(
    collection(db, 'users', uid, 'threads', threadId, 'messages'),
    where('ownerId', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ChatMessage[] = snapshot.docs.map((d) => {
        const data = d.data();
        const msg: ChatMessage = {
          id: String(data.id || d.id),
          threadId: String(data.threadId || threadId),
          sender: data.sender === 'user' ? 'user' : 'assistant',
          text: String(data.text || ''),
          timestamp: timestampToIso(data.createdAt),
          transcription:
            typeof data.transcription === 'string' ? data.transcription : undefined,
          suggestedTasks: Array.isArray(data.suggestedTasks)
            ? (data.suggestedTasks as SuggestedTask[])
            : undefined,
          addedTaskTitles: Array.isArray(data.addedTaskTitles)
            ? (data.addedTaskTitles as string[])
            : undefined,
          error: typeof data.error === 'boolean' ? data.error : undefined,
        };

        if (typeof data.attachmentName === 'string' && data.attachmentKind) {
          msg.attachment = {
            name: data.attachmentName,
            mimeType: String(data.attachmentMime || 'application/octet-stream'),
            size: Number(data.attachmentSize || 0),
            kind: data.attachmentKind as 'image' | 'audio' | 'document',
            dataUrl:
              typeof data.attachmentDataUrl === 'string'
                ? data.attachmentDataUrl
                : undefined,
          };
        }

        return msg;
      });

      items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeTasks(
  uid: string,
  onData: (tasks: TaskItem[]) => void,
  onError?: (err: unknown) => void
) {
  const path = `users/${uid}/tasks`;
  const q = query(collection(db, 'users', uid, 'tasks'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: TaskItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          title: String(data.title || ''),
          notes: typeof data.notes === 'string' ? data.notes : undefined,
          priority: (data.priority as PriorityLevel) || 'media',
          completed: Boolean(data.completed),
          createdAt: timestampToIso(data.createdAt),
          sourceThreadTitle:
            typeof data.sourceThreadTitle === 'string'
              ? data.sourceThreadTitle
              : undefined,
        };
      });
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createCloudThread(
  uid: string,
  thread: { id: string; title: string; subtitle: string; lastPreview: string },
  starterMessage: { id: string; text: string }
): Promise<void> {
  const threadPath = `users/${uid}/threads/${thread.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'threads', thread.id), {
      id: thread.id,
      ownerId: uid,
      title: thread.title.slice(0, 80),
      subtitle: thread.subtitle.slice(0, 160),
      lastPreview: thread.lastPreview.slice(0, 240),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, 'users', uid, 'threads', thread.id, 'messages', starterMessage.id),
      {
        id: starterMessage.id,
        ownerId: uid,
        threadId: thread.id,
        sender: 'assistant',
        text: starterMessage.text.slice(0, 8000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, threadPath);
  }
}

export async function deleteCloudThread(uid: string, threadId: string): Promise<void> {
  const threadPath = `users/${uid}/threads/${threadId}`;
  try {
    const msgsQuery = query(
      collection(db, 'users', uid, 'threads', threadId, 'messages'),
      where('ownerId', '==', uid)
    );
    const msgsSnap = await getDocs(msgsQuery);
    const batch = writeBatch(db);
    msgsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', uid, 'threads', threadId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, threadPath);
  }
}

export async function clearCloudThreadMessages(
  uid: string,
  threadId: string,
  resetMessage: { id: string; text: string }
): Promise<void> {
  const msgsPath = `users/${uid}/threads/${threadId}/messages`;
  try {
    const msgsQuery = query(
      collection(db, 'users', uid, 'threads', threadId, 'messages'),
      where('ownerId', '==', uid)
    );
    const msgsSnap = await getDocs(msgsQuery);
    const batch = writeBatch(db);
    msgsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    await setDoc(doc(db, 'users', uid, 'threads', threadId, 'messages', resetMessage.id), {
      id: resetMessage.id,
      ownerId: uid,
      threadId,
      sender: 'assistant',
      text: resetMessage.text.slice(0, 8000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'users', uid, 'threads', threadId), {
      lastPreview: 'Conversa reiniciada.',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, msgsPath);
  }
}

export async function createCloudMessage(
  uid: string,
  threadId: string,
  message: ChatMessage,
  threadUpdates?: { lastPreview: string }
): Promise<void> {
  const msgPath = `users/${uid}/threads/${threadId}/messages/${message.id}`;
  try {
    const payload: Record<string, unknown> = {
      id: message.id,
      ownerId: uid,
      threadId,
      sender: message.sender,
      text: message.text.slice(0, 8000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (message.transcription) {
      payload.transcription = message.transcription.slice(0, 8000);
    }
    if (message.attachment) {
      payload.attachmentName = message.attachment.name.slice(0, 200);
      payload.attachmentMime = message.attachment.mimeType.slice(0, 100);
      payload.attachmentSize = message.attachment.size;
      payload.attachmentKind = message.attachment.kind;
      if (
        message.attachment.dataUrl &&
        message.attachment.dataUrl.length <= 320_000
      ) {
        payload.attachmentDataUrl = message.attachment.dataUrl;
      }
    }
    if (message.suggestedTasks && message.suggestedTasks.length > 0) {
      payload.suggestedTasks = message.suggestedTasks.slice(0, 8);
    }
    if (message.addedTaskTitles && message.addedTaskTitles.length > 0) {
      payload.addedTaskTitles = message.addedTaskTitles.slice(0, 8);
    }
    if (typeof message.error === 'boolean') {
      payload.error = message.error;
    }

    await setDoc(doc(db, 'users', uid, 'threads', threadId, 'messages', message.id), payload);

    if (threadUpdates) {
      await updateDoc(doc(db, 'users', uid, 'threads', threadId), {
        lastPreview: threadUpdates.lastPreview.slice(0, 240),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }
}

export async function updateCloudMessageTranscription(
  uid: string,
  threadId: string,
  messageId: string,
  transcription: string
): Promise<void> {
  const msgPath = `users/${uid}/threads/${threadId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'threads', threadId, 'messages', messageId), {
      transcription: transcription.slice(0, 8000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, msgPath);
  }
}

export async function updateCloudMessageSuggestedTasks(
  uid: string,
  threadId: string,
  messageId: string,
  suggestedTasks: SuggestedTask[]
): Promise<void> {
  const msgPath = `users/${uid}/threads/${threadId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'threads', threadId, 'messages', messageId), {
      suggestedTasks: suggestedTasks.slice(0, 8),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, msgPath);
  }
}

export async function updateCloudMessageAddedTasks(
  uid: string,
  threadId: string,
  messageId: string,
  addedTaskTitles: string[]
): Promise<void> {
  const msgPath = `users/${uid}/threads/${threadId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'threads', threadId, 'messages', messageId), {
      addedTaskTitles: addedTaskTitles.slice(0, 8),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, msgPath);
  }
}

export async function createCloudTask(uid: string, task: TaskItem): Promise<void> {
  const taskPath = `users/${uid}/tasks/${task.id}`;
  try {
    const payload: Record<string, unknown> = {
      id: task.id,
      ownerId: uid,
      title: task.title.slice(0, 140),
      priority: task.priority,
      completed: task.completed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (task.notes) {
      payload.notes = task.notes.slice(0, 240);
    }
    if (task.sourceThreadTitle) {
      payload.sourceThreadTitle = task.sourceThreadTitle.slice(0, 80);
    }
    await setDoc(doc(db, 'users', uid, 'tasks', task.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, taskPath);
  }
}

export async function toggleCloudTask(
  uid: string,
  taskId: string,
  completed: boolean
): Promise<void> {
  const taskPath = `users/${uid}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), {
      completed,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, taskPath);
  }
}

export async function updateCloudTaskPriority(
  uid: string,
  taskId: string,
  priority: PriorityLevel
): Promise<void> {
  const taskPath = `users/${uid}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), {
      priority,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, taskPath);
  }
}

export async function deleteCloudTask(uid: string, taskId: string): Promise<void> {
  const taskPath = `users/${uid}/tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'tasks', taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, taskPath);
  }
}
