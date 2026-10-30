'use client';

/**
 * JsonField — #2: o painel "Entrada (input.json)" era uma textarea PRETA crua
 * (JSON sem cor, horrível). Aqui usamos a técnica de OVERLAY: um <pre> colorido
 * (syntax-highlight de JSON) atrás de uma <textarea> transparente editável. O
 * operador edita normalmente E lê com cor. Sem dependência pesada (Monaco é
 * mockado como textarea nos testes; usar 2 Monacos colidiria). Sharp, sem emoji.
 *
 * A textarea mantém o data-testid (`ide-input-data`) — os testes continuam
 * interagindo com ela como antes.
 */
import * as React from 'react';

/** Tokeniza JSON em spans coloridos (chave, string, número, bool/null, pontuação). */
export function highlightJson(src: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re =
    /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const tok = m[0];
    let cls = '';
    if (m[1]) cls = 'text-primary'; // chave
    else if (m[2]) cls = 'text-success'; // string
    else if (m[3]) cls = 'text-[#9333ea]'; // bool/null (roxo)
    else if (m[4]) cls = 'text-[#a16207]'; // número (âmbar)
    else cls = 'text-muted-on-light'; // pontuação
    out.push(
      <span key={i} className={cls}>
        {tok}
      </span>,
    );
    i += 1;
    last = re.lastIndex;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export function JsonField({
  value,
  onChange,
  testid,
}: {
  value: string;
  onChange: (v: string) => void;
  testid?: string;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const preRef = React.useRef<HTMLPreElement>(null);
  const syncScroll = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };
  const SHARED =
    'absolute inset-0 px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words leading-snug';
  return (
    <div className="relative flex-1 min-h-0 bg-white">
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`${SHARED} m-0 overflow-auto pointer-events-none scrollbar-hide`}
      >
        {highlightJson(value)}
      </pre>
      <textarea
        ref={taRef}
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        className={`${SHARED} resize-none bg-transparent text-transparent caret-[#2D77BE] outline-none overflow-auto scrollbar-hide`}
      />
    </div>
  );
}
