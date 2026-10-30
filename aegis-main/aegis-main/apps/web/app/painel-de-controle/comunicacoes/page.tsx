'use client';

/**
 * Painel de Controle · Comunicações
 *
 * Sprint H3 (2026-05-22). 4 cards de categoria espelhando
 * `painel-de-controle-research/cp-contact-information.png`:
 * - Administração da plataforma (REQUIRED)
 * - Segurança
 * - Interrupção de serviço
 * - Legal e privacidade
 *
 * Cada card: header + corpo explicativo + EmailListInput (chips + add).
 * Footer sticky Cancelar/Salvar quando dirty.
 */
import * as React from 'react';
import { Info, X } from 'lucide-react';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { COMUNICACAO_TABS } from '@/components/control-panel/hub-tabs';
import { ControlPanel, type CPCommunication } from '@/lib/api';
import { cn } from '@/lib/cn';

const CATEGORIES: { key: string; title: string; body: string; required?: boolean }[] = [
  {
    key: 'platform_admin',
    title: 'Administração da plataforma',
    body:
      'Mensagens de alta importância sobre a administração da plataforma, incluindo transições do ciclo de vida do produto, expiração/renovação de avaliação, e ações obrigatórias para administradores. (Quando as outras categorias estão vazias, este endereço também as recebe.)',
    required: true,
  },
  {
    key: 'security',
    title: 'Segurança',
    body:
      'Comunicações relacionadas à segurança, incluindo divulgação de CVE ou detecção de atividades suspeitas.',
  },
  {
    key: 'service_disruption',
    title: 'Interrupção de serviço',
    body:
      'Notificações sobre janelas de manutenção planejadas, alertas e atualizações quando componentes da plataforma sofrem interrupção ou desempenho degradado.',
  },
  {
    key: 'legal_privacy',
    title: 'Legal e privacidade',
    body:
      'Notificações sobre termos de uso, programa de proteção de dados e outras comunicações contratuais ou regulatórias.',
  },
];

const _EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export default function ComunicacoesPage() {
  const [loaded, setLoaded] = React.useState<Record<string, string[]>>({});
  const [draft, setDraft] = React.useState<Record<string, string[]>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    ControlPanel.communications
      .list()
      .then((rows) => {
        const map: Record<string, string[]> = {};
        for (const r of rows) {
          map[r.category] = r.emails;
        }
        for (const c of CATEGORIES) {
          if (!map[c.key]) map[c.key] = [];
        }
        setLoaded(map);
        setDraft(map);
      })
      .catch(() => {});
  }, []);

  const dirty = JSON.stringify(loaded) !== JSON.stringify(draft);
  const platformOk = (draft.platform_admin ?? []).length > 0;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const changed = CATEGORIES.filter(
        (c) => JSON.stringify(loaded[c.key] ?? []) !== JSON.stringify(draft[c.key] ?? []),
      );
      for (const c of changed) {
        await ControlPanel.communications.update(c.key, draft[c.key] ?? []);
      }
      setLoaded(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <CpPageHeader
        title="Comunicações"
        subtitle="Endereços usados pela equipe AEGIS para comunicação institucional."
      />
      <CpHubSubnav group="Comunicação" tabs={COMUNICACAO_TABS} />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        <div data-testid="cp-comunicacoes-info" className="flex items-start gap-2.5 px-3 py-2.5 bg-primary/5 border border-primary/20 text-[12px] text-text-on-light">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" strokeWidth={1.5} />
          <p>
            Os endereços fornecidos serão usados pela equipe AEGIS para os
            propósitos descritos abaixo.
          </p>
        </div>

        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-on-light">
          Tipos de comunicação
        </p>

        {CATEGORIES.map((c) => (
          <CategoryCard
            key={c.key}
            title={c.title}
            body={c.body}
            required={c.required}
            invalid={c.required && !platformOk}
            emails={draft[c.key] ?? []}
            onChange={(emails) => setDraft((d) => ({ ...d, [c.key]: emails }))}
            testId={`cp-comunicacoes-card-${c.key}`}
          />
        ))}
        {error && (
          <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2">{error}</p>
        )}
      </div>

      <footer className="sticky bottom-0 h-12 bg-white border-t border-border-light px-6 flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="cp-comunicacoes-cancel"
          disabled={!dirty || saving}
          onClick={() => setDraft(loaded)}
          className="h-8 px-3 text-[12px] text-text-on-light border border-border-light hover:border-primary disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-testid="cp-comunicacoes-save"
          disabled={!dirty || saving || !platformOk}
          onClick={save}
          className="h-8 px-4 text-[12px] bg-primary text-white hover:bg-primary/90 disabled:opacity-40"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </footer>
    </div>
  );
}

function CategoryCard({
  title,
  body,
  required,
  invalid,
  emails,
  onChange,
  testId,
}: {
  title: string;
  body: string;
  required?: boolean;
  invalid?: boolean;
  emails: string[];
  onChange: (next: string[]) => void;
  testId: string;
}) {
  return (
    <section className="bg-white border border-border-light" data-testid={testId}>
      <header className="px-3.5 py-2.5 border-b border-border-light flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-text-on-light">{title}</h3>
        {required && (
          <span className="text-[10px] uppercase tracking-wider text-rose-700 bg-rose-50 px-1.5 py-0.5 border border-rose-200">
            Obrigatório
          </span>
        )}
      </header>
      <div className="px-3.5 py-3 space-y-2">
        <p className="text-[12px] text-muted-on-light leading-snug">{body}</p>
        <EmailListInput
          emails={emails}
          onChange={onChange}
          invalid={invalid}
          testId={testId + '-input'}
        />
        {invalid && (
          <p className="text-[11px] text-rose-700">
            Pelo menos um e-mail deve estar configurado.
          </p>
        )}
      </div>
    </section>
  );
}

function EmailListInput({
  emails,
  onChange,
  invalid,
  testId,
}: {
  emails: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
  testId: string;
}) {
  const [text, setText] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const tryAdd = () => {
    const v = text.trim().toLowerCase();
    if (!v) return;
    if (!_EMAIL_RE.test(v)) {
      setTouched(true);
      return;
    }
    if (!emails.includes(v)) onChange([...emails, v]);
    setText('');
    setTouched(false);
  };

  return (
    <div
      className={cn(
        'min-h-[34px] px-2 py-1.5 flex flex-wrap items-center gap-1.5 border bg-white',
        invalid || (touched && text && !_EMAIL_RE.test(text)) ? 'border-rose-400' : 'border-border-light',
      )}
    >
      {emails.map((e) => (
        <span
          key={e}
          data-testid={`${testId}-chip-${e}`}
          className="inline-flex items-center gap-1 h-6 px-2 text-[11px] bg-primary/5 border border-primary/30 font-mono"
        >
          {e}
          <button
            type="button"
            aria-label={`Remover ${e}`}
            onClick={() => onChange(emails.filter((x) => x !== e))}
            className="text-muted-on-light hover:text-rose-700"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </span>
      ))}
      <input
        type="email"
        data-testid={testId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={tryAdd}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            tryAdd();
          }
        }}
        placeholder={emails.length === 0 ? 'Adicionar endereço de e-mail…' : ''}
        className="flex-1 min-w-[150px] h-6 px-1 text-[12px] outline-none bg-transparent"
      />
    </div>
  );
}
