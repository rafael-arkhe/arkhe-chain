'use client';

/**
 * SortableList — Onda I.2 (2026-05-23).
 *
 * Wrapper fino sobre `@dnd-kit` pro reorder de listas no composer
 * `/app-shell` (grupos da sidenav, itens dentro de grupos, itens do menu
 * do usuário). Substitui o HTML5 drag nativo (`draggable`/`onDrop`) por
 * `@dnd-kit/sortable`, que dá feedback visual consistente (item levantado
 * com sombra/escala via transform) e acessibilidade por teclado.
 *
 * Uso:
 *   <SortableList ids={ids} onReorder={(from,to)=>…} testId="x">
 *     {ids.map((id) => (
 *       <SortableRow key={id} id={id}>
 *         {({ handleProps, isDragging }) => (
 *           <div className={isDragging ? 'opacity-70 …' : ''}>
 *             <button {...handleProps} aria-label="Reordenar">⠿</button>
 *             …conteúdo…
 *           </div>
 *         )}
 *       </SortableRow>
 *     ))}
 *   </SortableList>
 *
 * Memória honrada: feedback_no_rounded_no_sparkles · sem rounded; o
 * feedback visual usa sombra + escala leve, nunca raio de borda.
 */
import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface SortableListProps {
  /** IDs estáveis na ordem atual. */
  ids: string[];
  /** Reorder: índice de origem → destino (já calculados). */
  onReorder: (from: number, to: number) => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export function SortableList({
  ids,
  onReorder,
  children,
  className,
  testId,
}: SortableListProps) {
  const sensors = useSensors(
    // distância mínima evita iniciar drag em cliques nos botões internos
    // (setas de fallback, remover, inputs).
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div data-testid={testId} className={className}>
          {children}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export interface SortableRowRenderProps {
  /** Props a espalhar no elemento que serve de "punho" (drag handle). */
  handleProps: React.HTMLAttributes<HTMLElement>;
  /** True enquanto a linha está sendo arrastada — pra estilo de feedback. */
  isDragging: boolean;
}

export interface SortableRowProps {
  id: string;
  children: (props: SortableRowRenderProps) => React.ReactNode;
  /** Quando true, a linha não é arrastável (ex.: item "logout" fixo). */
  disabled?: boolean;
}

export function SortableRow({ id, children, disabled }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Feedback visual: linha arrastada sobe de camada com sombra discreta.
    zIndex: isDragging ? 30 : undefined,
    boxShadow: isDragging ? '0 4px 14px rgba(13,44,77,0.22)' : undefined,
    opacity: isDragging ? 0.95 : undefined,
    position: 'relative',
  };

  const handleProps: React.HTMLAttributes<HTMLElement> = disabled
    ? {}
    : { ...attributes, ...(listeners as React.HTMLAttributes<HTMLElement>) };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ handleProps, isDragging })}
    </div>
  );
}
