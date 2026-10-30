'use client';

import { GripVertical, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Props = {
  title: string;
  description?: string;
  span?: 1 | 2 | 3;
  children: React.ReactNode;
};

export function Widget({ title, description, span = 1, children }: Props) {
  return (
    <div
      data-testid={`widget-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        'bg-white border border-border-light flex flex-col',
        span === 1 && 'col-span-1',
        span === 2 && 'col-span-2',
        span === 3 && 'col-span-3',
      )}
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-panel-light">
        <GripVertical
          className="w-3.5 h-3.5 text-muted-on-light cursor-grab"
          strokeWidth={1.5}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold truncate">{title}</p>
          {description && (
            <p className="text-[10px] text-muted-on-light truncate">{description}</p>
          )}
        </div>
        <button
          type="button"
          aria-label={`Remover widget ${title}`}
          className="w-5 h-5 flex items-center justify-center hover:bg-raised-light text-muted-on-light"
        >
          <X className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </header>
      <div className="p-3 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
