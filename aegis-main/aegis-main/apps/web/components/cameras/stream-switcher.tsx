'use client';

import { useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';

const ROAD_PRESETS = [
  { id: 'sp055-110a', label: 'SP-055 · Rio-Santos · KM 110 (A · Bertioga · ao vivo)', url: 'https://34.104.32.249.nip.io/SP055-KM110A/stream.m3u8' },
  { id: 'sp055-110b', label: 'SP-055 · Rio-Santos · KM 110 (B · Bertioga · ao vivo)', url: 'https://34.104.32.249.nip.io/SP055-KM110B/stream.m3u8' },
  { id: 'sp123-026b', label: 'SP-123 · Tamoios · KM 26 (B · Litoral→Capital · ao vivo)', url: 'https://34.104.32.249.nip.io/SP123-KM026B/stream.m3u8' },
];

type Props = {
  current: string;
  onChange: (url: string) => void;
};

export function StreamSwitcher({ current, onChange }: Props) {
  const [code, setCode] = useState('SP123-KM026B');
  const [host, setHost] = useState('34.104.32.249.nip.io');

  function loadCustom() {
    const url = `https://${host}/${code}/stream.m3u8`;
    onChange(url);
  }

  return (
    <div className="border border-border-light p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1">
        Trocar stream HLS
      </p>

      <div className="space-y-1">
        {ROAD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.url)}
            data-testid={`stream-preset-${p.id}`}
            className={
              'w-full text-left px-2 h-8 text-[11px] flex items-center gap-2 border transition-colors ' +
              (current === p.url
                ? 'bg-primary text-white border-primary'
                : 'bg-raised-light border-border-light hover:border-primary')
            }
          >
            <ArrowRight className="w-3 h-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="border-t border-border-light pt-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light mb-1.5">
          Custom · SP-XXX · KM-XXX
        </p>
        <div className="flex gap-1">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SP123-KM026B"
            data-testid="stream-custom-code"
            className="flex-1 h-7 px-2 bg-canvas-light border border-border-light text-[11px] font-mono outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={loadCustom}
            data-testid="stream-custom-load"
            className="h-7 px-2.5 text-[10px] uppercase tracking-[0.14em] bg-primary text-white hover:bg-primary-hover flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} /> Conectar
          </button>
        </div>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="34.104.32.249.nip.io"
          className="mt-1 w-full h-6 px-2 bg-canvas-light border border-border-light text-[10px] font-mono outline-none focus:border-primary"
        />
        <p className="mt-1.5 text-[10px] text-muted-on-light leading-tight">
          Padrão de concessionária: <span className="font-mono">https://{`{host}`}/SP{`{XXX}`}-KM{`{XXX}`}{`{A|B}`}/stream.m3u8</span>
        </p>
      </div>
    </div>
  );
}
