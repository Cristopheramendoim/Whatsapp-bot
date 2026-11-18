export type PriorityLevel = 'alta' | 'media' | 'baixa';

export type MobileTab = 'threads' | 'chat' | 'tasks';

export interface SuggestedTask {
  title: string;
  priority: PriorityLevel;
  notes?: string;
}

export interface MessageAttachment {
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'audio' | 'document';
  dataUrl?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  attachment?: MessageAttachment;
  transcription?: string;
  suggestedTasks?: SuggestedTask[];
  addedTaskTitles?: string[];
  error?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  lastPreview: string;
}

export interface TaskItem {
  id: string;
  title: string;
  notes?: string;
  priority: PriorityLevel;
  completed: boolean;
  createdAt: string;
  sourceThreadTitle?: string;
}

export interface UserProfile {
  name: string;
}
