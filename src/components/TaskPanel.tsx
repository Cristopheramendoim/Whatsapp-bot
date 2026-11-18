import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { PriorityLevel, TaskItem } from '../types';

interface TaskPanelProps {
  tasks: TaskItem[];
  onAddTask: (title: string, priority: PriorityLevel, notes?: string) => void;
  onToggleTask: (taskId: string) => void;
  onCyclePriority: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onClose?: () => void;
}

const PRIORITY_META: Record<
  PriorityLevel,
  { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  alta: { label: 'Alta', colorClass: 'text-rose-400', Icon: AlertCircle },
  media: { label: 'Média', colorClass: 'text-amber-400', Icon: Minus },
  baixa: { label: 'Baixa', colorClass: 'text-emerald-400', Icon: ArrowDown },
};

const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  alta: 0,
  media: 1,
  baixa: 2,
};

export function TaskPanel({
  tasks,
  onAddTask,
  onToggleTask,
  onCyclePriority,
  onDeleteTask,
  onClose,
}: TaskPanelProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('media');
  const [statusFilter, setStatusFilter] = useState<'pendentes' | 'concluidas' | 'todas'>('pendentes');
  const [priorityFilter, setPriorityFilter] = useState<'todas' | PriorityLevel>('todas');
  const [copiedList, setCopiedList] = useState(false);

  const pendingCount = tasks.filter((t) => !t.completed).length;

  const visibleTasks = tasks
    .filter((t) => {
      if (statusFilter === 'pendentes' && t.completed) return false;
      if (statusFilter === 'concluidas' && !t.completed) return false;
      if (priorityFilter !== 'todas' && t.priority !== priorityFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = title.trim();
    if (!cleaned) return;
    onAddTask(cleaned, priority);
    setTitle('');
  }

  async function handleCopyTasksForWhatsApp() {
    const pending = tasks
      .filter((t) => !t.completed)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    if (pending.length === 0) return;

    const lines = pending.map((t) => {
      const pLabel = PRIORITY_META[t.priority].label;
      return `• *${pLabel}:* ${t.title}${t.notes ? ` _(${t.notes})_` : ''}`;
    });

    const formatted = `*Minhas Prioridades:*\n\n${lines.join('\n')}`;

    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedList(true);
      setTimeout(() => setCopiedList(false), 2000);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  }

  return (
    <aside className="flex flex-col h-full bg-[#111B21] border-l border-[#222E35]">
      {/* Header */}
      <div className="h-14 px-4 bg-[#202C33] border-b border-[#222E35] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="font-display font-semibold text-[15px] text-[#E9EDEF] whitespace-nowrap truncate">
            Tarefas & Prioridades
          </h2>
          <span className="text-xs font-mono tabular-nums text-[#8696A0] whitespace-nowrap shrink-0">
            · {pendingCount} abertas
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyTasksForWhatsApp}
            disabled={pendingCount === 0}
            className="px-2.5 py-1.5 min-h-[36px] text-xs font-medium rounded-lg bg-[#2A3942] hover:bg-[#344650] text-[#E9EDEF] disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            {copiedList ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#00A884]" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#AEBAC1]" />
                <span>Copiar lista</span>
              </>
            )}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar painel de tarefas"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[#2A3942] text-[#E9EDEF] hover:bg-[#344650] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Add Task Form */}
      <form
        onSubmit={handleSubmit}
        className="p-3.5 border-b border-[#222E35] space-y-2.5 shrink-0"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Adicionar nova tarefa..."
            maxLength={120}
            className="flex-1 min-w-0 px-3 py-2.5 text-sm rounded-lg bg-[#202C33] border border-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696A0] focus:outline-none focus:border-[#00A884]"
          />
          <button
            type="submit"
            disabled={!title.trim()}
            aria-label="Adicionar tarefa"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#00A884] hover:bg-[#06CF9C] text-[#0B141A] disabled:opacity-40 transition-colors shrink-0"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[#8696A0]">Prioridade:</span>
          <div className="flex items-center gap-1 p-0.5 bg-[#202C33] rounded-lg">
            {(['alta', 'media', 'baixa'] as PriorityLevel[]).map((level) => {
              const active = priority === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPriority(level)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#2A3942] text-[#E9EDEF]'
                      : 'text-[#8696A0] hover:text-[#E9EDEF]'
                  }`}
                >
                  {PRIORITY_META[level].label}
                </button>
              );
            })}
          </div>
        </div>
      </form>

      {/* Filters */}
      <div className="px-3.5 py-2 border-b border-[#222E35] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-[#202C33] rounded-lg">
          {(
            [
              { id: 'pendentes', label: 'Abertas' },
              { id: 'concluidas', label: 'Feitas' },
              { id: 'todas', label: 'Todas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-[#2A3942] text-[#E9EDEF]'
                  : 'text-[#8696A0] hover:text-[#E9EDEF]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as 'todas' | PriorityLevel)}
          aria-label="Filtrar por prioridade"
          className="px-2 py-1 text-xs rounded-md bg-[#202C33] border border-[#2A3942] text-[#D1D7DB] focus:outline-none focus:border-[#00A884]"
        >
          <option value="todas">Todas prioridades</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#222E35]">
        {visibleTasks.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm text-[#D1D7DB]">Nenhuma tarefa nesta lista.</p>
            <p className="text-xs text-[#8696A0]">
              Adicione acima ou peça ao assistente no chat para extrair tarefas de textos e áudios.
            </p>
          </div>
        ) : (
          visibleTasks.map((task) => {
            const pMeta = PRIORITY_META[task.priority];
            const PriorityIcon = pMeta.Icon;

            return (
              <div
                key={task.id}
                className="px-4 py-3 flex items-start gap-2.5 hover:bg-[#182229] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onToggleTask(task.id)}
                  aria-label={
                    task.completed ? 'Marcar como pendente' : 'Marcar como concluída'
                  }
                  className="min-h-[44px] min-w-[44px] -ml-2 -mt-1.5 flex items-center justify-center text-[#00A884] shrink-0"
                >
                  {task.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-[#00A884]" />
                  ) : (
                    <Circle className="w-5 h-5 text-[#8696A0] hover:text-[#00A884]" />
                  )}
                </button>

                <div className="flex-1 min-w-0 pt-0.5">
                  <p
                    className={`text-sm leading-snug break-words ${
                      task.completed ? 'line-through text-[#8696A0]' : 'text-[#E9EDEF]'
                    }`}
                  >
                    {task.title}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[#8696A0]">
                    <button
                      type="button"
                      onClick={() => onCyclePriority(task.id)}
                      title="Clique para alternar prioridade"
                      className={`inline-flex items-center gap-1 font-medium ${pMeta.colorClass} hover:underline`}
                    >
                      <PriorityIcon className="w-3.5 h-3.5" />
                      <span>{pMeta.label}</span>
                    </button>

                    {task.notes && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-[180px]">{task.notes}</span>
                      </>
                    )}

                    {task.sourceThreadTitle && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-[130px]">
                          {task.sourceThreadTitle}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  aria-label={`Excluir tarefa ${task.title}`}
                  className="min-h-[40px] min-w-[40px] -mr-2 flex items-center justify-center text-[#8696A0] hover:text-rose-400 shrink-0 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
