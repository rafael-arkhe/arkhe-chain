'use client';

/**
 * Controle de parâmetro das camadas de referência do /geo — SELETORES amigáveis
 * (nunca código técnico cru). Regra AEGIS: o operador escolhe por NOME, o código
 * IBGE fica escondido.
 *
 *  - param "uf"        → dropdown das 27 UFs (valor = código IBGE da UF).
 *  - param "municipio" → cascata UF → município (valor = código IBGE 7 díg do
 *    município; a lista vem da API pública do IBGE por UF).
 */
import * as React from 'react';

/** 27 UFs com código IBGE (2 díg) — o que o CNES/DEMAS e as malhas esperam. */
export const IBGE_UFS: { code: string; sigla: string; nome: string }[] = [
  { code: '11', sigla: 'RO', nome: 'Rondônia' },
  { code: '12', sigla: 'AC', nome: 'Acre' },
  { code: '13', sigla: 'AM', nome: 'Amazonas' },
  { code: '14', sigla: 'RR', nome: 'Roraima' },
  { code: '15', sigla: 'PA', nome: 'Pará' },
  { code: '16', sigla: 'AP', nome: 'Amapá' },
  { code: '17', sigla: 'TO', nome: 'Tocantins' },
  { code: '21', sigla: 'MA', nome: 'Maranhão' },
  { code: '22', sigla: 'PI', nome: 'Piauí' },
  { code: '23', sigla: 'CE', nome: 'Ceará' },
  { code: '24', sigla: 'RN', nome: 'Rio Grande do Norte' },
  { code: '25', sigla: 'PB', nome: 'Paraíba' },
  { code: '26', sigla: 'PE', nome: 'Pernambuco' },
  { code: '27', sigla: 'AL', nome: 'Alagoas' },
  { code: '28', sigla: 'SE', nome: 'Sergipe' },
  { code: '29', sigla: 'BA', nome: 'Bahia' },
  { code: '31', sigla: 'MG', nome: 'Minas Gerais' },
  { code: '32', sigla: 'ES', nome: 'Espírito Santo' },
  { code: '33', sigla: 'RJ', nome: 'Rio de Janeiro' },
  { code: '35', sigla: 'SP', nome: 'São Paulo' },
  { code: '41', sigla: 'PR', nome: 'Paraná' },
  { code: '42', sigla: 'SC', nome: 'Santa Catarina' },
  { code: '43', sigla: 'RS', nome: 'Rio Grande do Sul' },
  { code: '50', sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { code: '51', sigla: 'MT', nome: 'Mato Grosso' },
  { code: '52', sigla: 'GO', nome: 'Goiás' },
  { code: '53', sigla: 'DF', nome: 'Distrito Federal' },
];

const SELECT_CLS =
  'h-6 px-1 text-[10px] bg-canvas-light border border-border-light outline-none focus:border-primary max-w-full';

export function RefParamControl({
  param,
  value,
  onChange,
  testId,
}: {
  param: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  if (param === 'uf') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className={SELECT_CLS}
      >
        <option value="">Escolha a UF…</option>
        {IBGE_UFS.map((u) => (
          <option key={u.code} value={u.code}>
            {u.nome}
          </option>
        ))}
      </select>
    );
  }
  if (param === 'municipio') {
    return <MunicipioPicker value={value} onChange={onChange} testId={testId} />;
  }
  // Fallback (param desconhecido): ainda evita código cru sem rótulo.
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={param}
      data-testid={testId}
      className={SELECT_CLS}
    />
  );
}

function MunicipioPicker({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const [uf, setUf] = React.useState('');
  const [muns, setMuns] = React.useState<{ id: number; nome: string }[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!uf) {
      setMuns([]);
      return;
    }
    let cancel = false;
    setLoading(true);
    // API pública do IBGE (CORS liberado) — municípios da UF, ordenados por nome.
    fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancel) setMuns(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancel) setMuns([]);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [uf]);

  return (
    <span className="flex items-center gap-1 min-w-0">
      <select
        value={uf}
        onChange={(e) => {
          setUf(e.target.value);
          onChange('');
        }}
        className={SELECT_CLS}
        style={{ flex: '0 0 auto', width: 64 }}
        aria-label="UF"
      >
        <option value="">UF…</option>
        {IBGE_UFS.map((u) => (
          <option key={u.code} value={u.code}>
            {u.sigla}
          </option>
        ))}
      </select>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!uf || loading}
        data-testid={testId}
        className={`${SELECT_CLS} flex-1 min-w-0`}
        aria-label="Município"
      >
        <option value="">{loading ? 'carregando…' : 'Município…'}</option>
        {muns.map((m) => (
          <option key={m.id} value={String(m.id)}>
            {m.nome}
          </option>
        ))}
      </select>
    </span>
  );
}
