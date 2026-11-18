import { CheckSquare, MessageCircle, MessagesSquare } from 'lucide-react';
import type { MobileTab } from '../types';

interface MobileNavProps {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  pendingTaskCount: number;
}

export function MobileNav({
  activeTab,
  onSelectTab,
  pendingTaskCount,
}: MobileNavProps) {
  const items: Array<{
    id: MobileTab;
    label: string;
    Icon: typeof MessageCircle;
    count?: number;
  }> = [
    { id: 'threads', label: 'Conversas', Icon: MessagesSquare },
    { id: 'chat', label: 'Chat', Icon: MessageCircle },
    { id: 'tasks', label: 'Tarefas', Icon: CheckSquare, count: pendingTaskCount },
  ];

  return (
    <nav
      aria-label="Navegação principal"
      className="h-14 bg-[#202C33] border-t border-[#222E35] grid grid-cols-3 md:hidden shrink-0 z-30"
    >
      {items.map(({ id, label, Icon, count }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelectTab(id)}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
              active ? 'text-[#00A884]' : 'text-[#8696A0] hover:text-[#E9EDEF]'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <Icon className="w-5 h-5" />
              {typeof count === 'number' && count > 0 && (
                <span className="ml-1 font-mono tabular-nums text-[10px] font-semibold">
                  {count}
                </span>
              )}
            </div>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
