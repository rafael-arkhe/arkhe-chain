'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function BenchModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="bench-dialog" aria-labelledby="bench-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header>
      <h2 id="bench-dialog-title">{title}</h2>
      <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X size={18} /></button>
    </header>
    {children}
  </dialog>;
}
