'use client';

/**
 * SecretRefSelect (Fase 3b · overhaul DAG n8n) — escolhe o `secret_ref` de um
 * conector a partir do Vault, em vez de o operador DIGITAR `namespace/slug` às
 * cegas (régua: nunca input técnico manual). Lista os segredos existentes (o valor
 * NUNCA volta) + "cadastrar novo" inline (sem diálogo nativo). O ref canônico é
 * `namespace/slug`; o valor cifrado vive no Vault e só é resolvido no servidor.
 *
 * Degradação honesta: sem permissão p/ listar o Vault (iam.governance), cai p/ uma
 * entrada mínima rotulada — nunca quebra o formulário.
 */
import * as React from 'react';
import { Plus, Loader2 } from 'lucide-react';

import { Vault, type VaultSecret } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { slugify } from '@/lib/slug';

const INP = 'w-full px-2 py-1.5 text-[11px] bg-white border border-border-light focus:outline-none focus:border-primary';

export function SecretRefSelect({
  value,
  onChange,
  namespace = 'conector',
  testid = 'cf-secret-ref',
}: {
  value: string;
  onChange: (ref: string) => void;
  namespace?: string;
  testid?: string;
}) {
  const t = useT();
  const [secrets, setSecrets] = React.useState<VaultSecret[] | null>(null);
  const [denied, setDenied] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newVal, setNewVal] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState('');

  const load = React.useCallback(() => {
    Vault.listSecrets()
      .then(setSecrets)
      .catch(() => { setDenied(true); setSecrets([]); });
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const save = React.useCallback(async () => {
    const name = newName.trim();
    if (!name || !newVal) return;
    setSaving(true);
    setSaveErr('');
    try {
      const s = await Vault.upsertSkillSecret({
        namespace, slug: slugify(name), display_name: name, value: newVal,
      });
      onChange(Vault.ref(s));
      setAdding(false);
      setNewName('');
      setNewVal('');
      load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : t('secretRef.saveErr'));
    } finally {
      setSaving(false);
    }
  }, [newName, newVal, namespace, onChange, load, t]);

  // Sem permissão de listar (iam.governance): degrade honesto, sem input às cegas.
  if (denied) {
    return (
      <div className="space-y-1" data-testid={testid}>
        <input
          value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="namespace/slug" className={INP} data-testid={`${testid}-fallback`}
        />
        <p className="text-[10px] text-muted-on-light">{t('secretRef.listDenied')}</p>
      </div>
    );
  }

  const options = secrets ?? [];
  // value pode ser um ref que não está na lista (conector já configurado) → preserva.
  const valueInList = !value || options.some((s) => Vault.ref(s) === value);

  return (
    <div className="space-y-1.5" data-testid={testid}>
      {!adding && (
        <div className="flex items-center gap-1.5">
          <select
            value={value} onChange={(e) => onChange(e.target.value)}
            className={INP} data-testid={`${testid}-select`}
          >
            <option value="">{secrets === null ? t('secretRef.loading') : t('secretRef.pick')}</option>
            {!valueInList && value && <option value={value}>{value}</option>}
            {options.map((s) => (
              <option key={s.id} value={Vault.ref(s)}>
                {s.display_name} ({s.namespace}/{s.slug})
              </option>
            ))}
          </select>
          <button
            type="button" onClick={() => setAdding(true)} data-testid={`${testid}-add`}
            aria-label={t('secretRef.add')}
            className="h-7 px-2 border border-border-light hover:border-primary text-muted-on-light shrink-0"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}
      {adding && (
        <div className="space-y-1.5 border border-border-light p-2" data-testid={`${testid}-form`}>
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder={t('secretRef.namePlaceholder')} className={INP} data-testid={`${testid}-name`}
          />
          <input
            type="password" value={newVal} onChange={(e) => setNewVal(e.target.value)}
            placeholder={t('secretRef.valuePlaceholder')} className={INP} data-testid={`${testid}-value`}
          />
          {saveErr && <p className="text-[10px] text-danger" role="status">{saveErr}</p>}
          <div className="flex items-center gap-1.5">
            <button
              type="button" onClick={save} disabled={saving || !newName.trim() || !newVal}
              data-testid={`${testid}-save`}
              className="h-7 px-3 text-[11px] bg-primary text-white disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />}
              {t('secretRef.save')}
            </button>
            <button
              type="button" onClick={() => { setAdding(false); setSaveErr(''); }}
              className="h-7 px-3 text-[11px] border border-border-light hover:border-primary"
            >
              {t('secretRef.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
