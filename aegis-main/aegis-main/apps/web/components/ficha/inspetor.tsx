import {
  CLASSIFICATION_BG,
  CLASSIFICATION_LABEL,
  type ClassificationLevel,
} from '@/lib/classification';
import type { Entity } from '@/lib/api/types';
import { cn } from '@/lib/cn';

export function Inspetor({ obj }: { obj: Entity }) {
  const cls = obj.classification as ClassificationLevel;
  return (
    <aside
      data-testid="inspetor"
      className="w-[280px] bg-panel-light border-l border-border-light overflow-y-auto shrink-0"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light">
        <p className="text-[11px] uppercase tracking-wider font-semibold">Inspetor</p>
      </header>
      <section className="p-3 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
          Metadados do objeto
        </p>
        <dl className="space-y-2 text-[11px]">
          <div>
            <dt className="text-muted-on-light">Identificador</dt>
            <dd className="font-mono">{obj.id}</dd>
          </div>
          <div>
            <dt className="text-muted-on-light">Tipo</dt>
            <dd className="font-mono uppercase">{obj.entity_type}</dd>
          </div>
          <div>
            <dt className="text-muted-on-light">Classificação</dt>
            <dd>
              <span
                className={cn(
                  'inline-block px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase',
                  CLASSIFICATION_BG[cls],
                  cls === 'restrito' ? 'text-black' : 'text-white',
                )}
              >
                {CLASSIFICATION_LABEL[cls]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-on-light">Criado por</dt>
            <dd className="font-mono">{obj.created_by}</dd>
          </div>
          {obj.updated_at && (
            <div>
              <dt className="text-muted-on-light">Atualizado</dt>
              <dd className="font-mono text-[10px]">{obj.updated_at.slice(0, 16).replace('T', ' ')}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-on-light">Versão</dt>
            <dd className="font-mono">v{obj.version}</dd>
          </div>
          {obj.signed_hash && (
            <div>
              <dt className="text-muted-on-light">Hash assinado</dt>
              <dd className="font-mono text-[10px] break-all">{obj.signed_hash}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* SHELL HONESTO (2026-06-12): a seção "Leitores autorizados" morreu —
          listava nomes e contagem FABRICADOS ('Investigador Mendonça',
          '+ 3 outros (grupo "13ª DP")') como se fossem ACL real. Quando o
          backend expuser leitores reais do objeto, a seção volta por dado. */}

      <section className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
          Templates
        </p>
        <select
          aria-label="Template ativo"
          className="w-full h-8 px-2 bg-white border border-border-light text-[11px] outline-none focus:border-primary"
        >
          <option>Padrão · Pessoa investigada</option>
          <option>Pessoa — vítima</option>
          <option>Pessoa — testemunha</option>
        </select>
        <button
          type="button"
          className="mt-2 w-full h-8 text-[11px] bg-white border border-border-light hover:border-primary"
        >
          Salvar layout como template
        </button>
      </section>
    </aside>
  );
}
