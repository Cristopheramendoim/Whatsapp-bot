import React, { useRef, useState } from 'react';
import {
  Download,
  HardDrive,
  MessageSquarePlus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ChatThread } from '../types';
import { formatShortTime } from '../utils/storage';
import { AssistantAvatar } from './AssistantAvatar';

interface ChatSidebarProps {
  threads: ChatThread[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onCreateThread: (title: string) => void;
  onDeleteThread: (threadId: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
}

export function ChatSidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onExportBackup,
  onImportBackup,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filteredThreads = threads.filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.lastPreview.toLowerCase().includes(q)
    );
  });

  function handleSubmitNew(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = newTitle.trim();
    if (!cleaned) return;
    onCreateThread(cleaned);
    setNewTitle('');
    setIsCreating(false);
  }

  return (
    <aside className="flex flex-col h-full bg-[#111B21] border-r border-[#222E35] select-none">
      {/* Header */}
      <div className="h-14 px-4 bg-[#202C33] border-b border-[#222E35] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <AssistantAvatar size="sm" />
          <span className="font-display font-bold text-base tracking-tight text-[#E9EDEF] whitespace-nowrap truncate">
            ZapAssist
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsCreating((prev) => !prev)}
            title="Nova conversa"
            aria-label="Nova conversa"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#AEBAC1] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onExportBackup}
            title="Exportar histórico e tarefas (JSON)"
            aria-label="Exportar histórico"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#AEBAC1] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            title="Importar backup (JSON)"
            aria-label="Importar backup"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#AEBAC1] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors"
          >
            <Upload className="w-4 h-4" />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportBackup(file);
                e.target.value = '';
              }
            }}
          />
        </div>
      </div>

      {/* Inline New Thread Form */}
      {isCreating && (
        <form
          onSubmit={handleSubmitNew}
          className="p-3 bg-[#182229] border-b border-[#222E35] space-y-2 shrink-0"
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nome da conversa (ex.: Trabalho)"
            maxLength={48}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg bg-[#202C33] border border-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696A0] focus:outline-none focus:border-[#00A884]"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setNewTitle('');
              }}
              className="px-3 py-1.5 text-xs font-medium text-[#8696A0] hover:text-[#E9EDEF] rounded-md whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#00A884] text-[#0B141A] hover:bg-[#06CF9C] disabled:opacity-40 whitespace-nowrap"
            >
              Criar chat
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-[#222E35] shrink-0">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#8696A0] absolute left-3 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar conversa..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[#202C33] text-[#E9EDEF] placeholder:text-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
          />
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#222E35]/70">
        {filteredThreads.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#8696A0]">
            Nenhuma conversa encontrada.
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const isActive = thread.id === activeThreadId;
            return (
              <div
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectThread(thread.id);
                  }
                }}
                className={`group px-3.5 py-3 min-h-[68px] flex items-center gap-3 cursor-pointer transition-colors ${
                  isActive ? 'bg-[#2A3942]' : 'hover:bg-[#182229]'
                }`}
              >
                <AssistantAvatar size="md" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-medium text-[#E9EDEF] truncate">
                      {thread.title}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-[#8696A0] shrink-0">
                      {formatShortTime(thread.updatedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[13px] text-[#8696A0] truncate">
                      {thread.lastPreview}
                    </p>

                    {threads.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteThread(thread.id);
                        }}
                        title="Excluir conversa"
                        aria-label={`Excluir conversa ${thread.title}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded text-[#8696A0] hover:text-rose-400 transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer server storage status */}
      <div className="px-4 py-2.5 border-t border-[#222E35] text-[12px] text-[#8696A0] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <HardDrive className="w-3.5 h-3.5 text-[#00A884] shrink-0" />
          <span className="truncate">Salvo no servidor</span>
        </div>
        <span className="font-mono tabular-nums shrink-0">{threads.length} chats</span>
      </div>
    </aside>
  );
}
