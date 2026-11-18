import { useState } from 'react';
import { MessageCircle } from 'lucide-react';

interface AssistantAvatarProps {
  size?: 'sm' | 'md';
}

export function AssistantAvatar({ size = 'md' }: AssistantAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const dimClass = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';

  if (imgError) {
    return (
      <div
        className={`${dimClass} rounded-full bg-[#00A884]/15 border border-[#00A884]/40 flex items-center justify-center shrink-0 text-[#00A884]`}
        aria-hidden="true"
      >
        <MessageCircle className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src="/src/assets/images/zapassist_avatar_1795019874787.jpg"
      alt="ZapAssist"
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className={`${dimClass} rounded-full object-cover border border-[#2A3942] shrink-0`}
    />
  );
}
