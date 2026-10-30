'use client';

/**
 * Form config pickers — Onda K.2 (2026-05-23).
 *
 * Dropdowns para o Inspetor do Form Widget que NUNCA aceitam texto livre
 * para identificadores técnicos (memory `feedback_no_manual_technical_input`):
 *   - `PermKeyPicker`  → escolhe uma permissão do catálogo IAM
 *     (`/iam/permissions`). Usado quando a política é "Requer permissão".
 *   - `ActionTypePicker` → escolhe uma ActionType (`/action-types`) para o
 *     write-back via ação.
 *
 * Ambos têm fallback gracioso (mantém o valor salvo + opção manual) caso
 * o endpoint falhe, para o editor nunca travar.
 */
import * as React from 'react';
import { cn } from '@/lib/cn';
import { Iam, ActionTypes } from '@/lib/api';
import type { IamPermission, ActionTypeOut } from '@/lib/api';

const SELECT_CLS =
  'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary text-text-on-light';

export function PermKeyPicker({
  value,
  onChange,
  label,
  description,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  label: string;
  description?: string;
}) {
  const [perms, setPerms] = React.useState<IamPermission[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    Iam.permissions
      .list()
      .then((p) => {
        if (alive) {
          setPerms(p);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const cur = value ?? '';
  // Garante que um valor salvo apareça mesmo se o catálogo não listar.
  const known = new Set(perms.map((p) => p.key));
  const options = [...perms];
  if (cur && !known.has(cur)) {
    options.push({ key: cur, description: '(valor atual)', category: '' });
  }
  // Foco nas perms de domínio (esconde nav.* que são visibilidade de UI).
  const filtered = options.filter((p) => !p.key.startsWith('nav.'));

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
        {label}
      </label>
      <select
        value={cur}
        onChange={(e) => onChange(e.target.value || undefined)}
        data-testid="form-perm-key-picker"
        className={SELECT_CLS}
      >
        <option value="">— escolher permissão —</option>
        {filtered.map((p) => (
          <option key={p.key} value={p.key}>
            {p.key}
            {p.description ? ` — ${p.description}` : ''}
          </option>
        ))}
      </select>
      {description && (
        <p className="mt-1 text-[10px] text-muted-on-light leading-snug">
          {description}
        </p>
      )}
      {!loaded && (
        <p className="mt-1 text-[9px] text-muted-on-light font-mono">
          Carregando catálogo…
        </p>
      )}
    </div>
  );
}

export function ActionTypePicker({
  value,
  onChange,
  label,
  description,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  label: string;
  description?: string;
}) {
  const [actions, setActions] = React.useState<ActionTypeOut[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    ActionTypes.list()
      .then((a) => {
        if (alive) {
          setActions(a);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const cur = value ?? '';
  const known = new Set(actions.map((a) => a.id));

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
        {label}
      </label>
      <select
        value={cur}
        onChange={(e) => onChange(e.target.value || undefined)}
        data-testid="form-action-type-picker"
        className={cn(SELECT_CLS)}
      >
        <option value="">— criar objeto (sem ação) —</option>
        {actions.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        {cur && !known.has(cur) && (
          <option value={cur}>{cur} (atual)</option>
        )}
      </select>
      {description && (
        <p className="mt-1 text-[10px] text-muted-on-light leading-snug">
          {description}
        </p>
      )}
      {!loaded && (
        <p className="mt-1 text-[9px] text-muted-on-light font-mono">
          Carregando ações…
        </p>
      )}
    </div>
  );
}
