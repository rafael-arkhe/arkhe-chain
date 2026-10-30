'use client';

import {
  Car,
  Crosshair,
  FileText,
  Gavel,
  Image,
  Link2,
  MapPin,
  Phone,
  ScrollText,
  StickyNote,
  Table,
  User,
  Users,
} from 'lucide-react';

type WidgetDef = {
  id: string;
  label: string;
  icon: typeof User;
  category: string;
};

const WIDGETS: WidgetDef[] = [
  { id: 'identificacao', label: 'Identificação', icon: User, category: 'Propriedades' },
  { id: 'antecedentes', label: 'Antecedentes criminais', icon: ScrollText, category: 'Vínculos' },
  { id: 'mandados', label: 'Mandados', icon: Gavel, category: 'Vínculos' },
  { id: 'veiculos', label: 'Veículos associados', icon: Car, category: 'Vínculos' },
  { id: 'enderecos', label: 'Endereços conhecidos', icon: MapPin, category: 'Mapa' },
  { id: 'telefones', label: 'Telefones e contatos', icon: Phone, category: 'Vínculos' },
  { id: 'vinculos-sociais', label: 'Vínculos familiares', icon: Link2, category: 'Vínculos' },
  { id: 'foto-face', label: 'Foto / face-match', icon: Image, category: 'Mídia' },
  { id: 'lpr', label: 'Detecções LPR', icon: Car, category: 'Câmeras' },
  { id: 'linha-tempo', label: 'Linha do tempo', icon: ScrollText, category: 'Cronologia' },
  { id: 'processos', label: 'Processos judiciais', icon: FileText, category: 'Documentos' },
  { id: 'armas', label: 'Armas associadas', icon: Crosshair, category: 'Vínculos' },
  { id: 'organizacoes', label: 'Organizações', icon: Users, category: 'Vínculos' },
  { id: 'notas', label: 'Notas operacionais', icon: StickyNote, category: 'Custom' },
  { id: 'tabela-custom', label: 'Tabela custom', icon: Table, category: 'Custom' },
];

export function PaletaWidgets() {
  const grouped = WIDGETS.reduce<Record<string, WidgetDef[]>>((acc, w) => {
    (acc[w.category] ||= []).push(w);
    return acc;
  }, {});

  return (
    <aside
      data-testid="paleta-widgets"
      className="w-[240px] bg-panel-light border-r border-border-light overflow-y-auto shrink-0"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light">
        <p className="text-[11px] uppercase tracking-wider font-semibold">Paleta de widgets</p>
      </header>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="border-b border-border-light">
          <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-on-light font-semibold bg-panel-light">
            {cat}
          </p>
          <ul>
            {items.map((w) => {
              const Icon = w.icon;
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    data-testid={`paleta-${w.id}`}
                    className="w-full text-left px-3 h-8 text-[12px] flex items-center gap-2 hover:bg-raised-light transition-colors cursor-grab"
                  >
                    <Icon className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
                    <span className="truncate">{w.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
