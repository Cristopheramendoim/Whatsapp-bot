import React from 'react';

export function sanitizeWhatsAppText(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .trim();
}

function renderInlineFormatting(line: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }

    const token = match[0];
    const inner = token.slice(1, -1);
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <strong key={key} className="font-semibold text-[#F5F7F8]">
          {inner}
        </strong>
      );
    } else if (token.startsWith('_') && token.endsWith('_')) {
      parts.push(
        <em key={key} className="italic text-[#D1D7DB]">
          {inner}
        </em>
      );
    } else if (token.startsWith('~') && token.endsWith('~')) {
      parts.push(
        <del key={key} className="line-through text-[#8696A0]">
          {inner}
        </del>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key}
          className="font-mono text-[0.85em] bg-black/30 px-1.5 py-0.5 rounded text-[#00D9A5]"
        >
          {inner}
        </code>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [line];
}

export function WhatsAppFormattedText({ text }: { text: string }) {
  const sanitized = sanitizeWhatsAppText(text);
  const blocks = sanitized.split(/\n{2,}/);

  return (
    <div className="space-y-2 text-[14.5px] leading-[1.45] text-[#E9EDEF] break-words">
      {blocks.map((block, bIdx) => {
        const lines = block.split('\n');
        const isListBlock = lines.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l) || l.trim() === '');

        if (isListBlock) {
          return (
            <ul key={bIdx} className="space-y-1 pl-1">
              {lines
                .filter((l) => l.trim().length > 0)
                .map((line, lIdx) => {
                  const cleaned = line.replace(/^\s*([-•*]|\d+[.)])\s+/, '');
                  return (
                    <li key={lIdx} className="flex items-start gap-2">
                      <span className="text-[#00A884] font-semibold select-none mt-[1px]">•</span>
                      <span className="flex-1">{renderInlineFormatting(cleaned, `${bIdx}-${lIdx}`)}</span>
                    </li>
                  );
                })}
            </ul>
          );
        }

        return (
          <div key={bIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (/^([-•]|\d+[.)])\s+/.test(trimmed)) {
                const cleaned = trimmed.replace(/^([-•]|\d+[.)])\s+/, '');
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="text-[#00A884] font-semibold select-none mt-[1px]">•</span>
                    <span className="flex-1">{renderInlineFormatting(cleaned, `${bIdx}-${lIdx}`)}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{renderInlineFormatting(line, `${bIdx}-${lIdx}`)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}
