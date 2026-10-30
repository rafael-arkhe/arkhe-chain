'use client';
import { useState } from 'react';
import { api, signLocally } from '@/lib/client';
import type { Preview } from '@/lib/enterprise-types';
import { useEnterprise } from './enterprise-context';

export function RepresentationDeclaration({ preview, onRecorded }: { preview: Preview; onRecorded: (id: string) => void }) {
  const { data } = useEnterprise();
  const [capacity, setCapacity] = useState('administrator');
  const [files, setFiles] = useState<Record<string, File>>({});
  const [key, setKey] = useState<File | null>(null), [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [recorded, setRecorded] = useState(false);
  const policy = data.representationPolicy;
  const supported = policy.phase === 'internal' && preview.configuration.sectorId === 'generic';
  const required = ['constitution', 'identity', ...(capacity === 'director' ? ['election'] : capacity === 'attorney' ? ['power-of-attorney'] : [])];
  const names: Record<string, string> = { constitution: 'Contrato social ou estatuto', identity: 'Documento de identidade do signatário', election: 'Ata de eleição', 'power-of-attorney': 'Procuração com poderes específicos' };
  async function record() {
    setBusy(true); setError('');
    try {
      if (!key || !accepted || required.some(kind => !files[kind])) throw new Error('Selecione todos os documentos, sua chave e confirme a declaração.');
      const documents = await Promise.all(required.map(async kind => {
        if (files[kind].size === 0 || files[kind].size > 20 * 1024 * 1024) throw new Error('Cada documento deve ter entre 1 byte e 20 MiB.');
        const digest = await crypto.subtle.digest('SHA-256', await files[kind].arrayBuffer());
        return { kind, sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
      }));
      const challenge = await api<{ id: string; statement: string }>('enterprise/representation/challenge', { previewHash: preview.previewHash, capacity, documents });
      if (key.size > 16384) throw new Error('Chave inválida.');
      const signature = await signLocally(await key.text(), challenge.statement);
      const result = await api<{ id: string }>('enterprise/representation/record', { challengeId: challenge.id, signature });
      onRecorded(result.id); setRecorded(true); setKey(null); setFiles({});
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="ent-panel"><h3>Base de representação do signatário</h3><p className="ent-muted">Cadastro CNPJ e poderes de representação são verificações distintas.</p>{!supported ? <p className="ent-info">{['finance', 'health', 'government'].includes(preview.configuration.sectorId) ? 'Este setor regulado exige procuração com escopo verificado ou e-CNPJ e análise dos poderes.' : 'Autodeclaração está disponível somente para perfil genérico em piloto interno explicitamente habilitado no servidor.'} Os verificadores e-CAC/e-CNPJ ainda não estão integrados. A confirmação permanece bloqueada.</p> : recorded ? <p className="ent-info" role="status">Declaração e hashes registrados no WormGraph local. Poderes legais não verificados; sem carimbo de tempo externo.</p> : <><p className="ent-muted">Somente os hashes dos anexos são enviados. Guarde os documentos originais para auditoria. A chave privada permanece no navegador.</p><label>Condição declarada<select value={capacity} onChange={event => setCapacity(event.target.value)} disabled={busy}><option value="administrator">Sócio-administrador</option><option value="director">Diretor eleito</option><option value="attorney">Procurador</option></select></label>{required.map(kind => <label key={kind}>{names[kind]}<input type="file" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) setFiles(values => ({ ...values, [kind]: file })); }} /></label>)}<label>Chave Ed25519 da sua conta (.pem)<input type="file" accept=".pem" disabled={busy} onChange={event => setKey(event.target.files?.[0] || null)} /></label><label className="ent-check"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={busy} /><span>Declaro representar a empresa na condição indicada, conforme os documentos listados. Entendo que este registro local não comprova meus poderes legais.</span></label><button type="button" className="ent-button secondary" disabled={busy} onClick={() => void record()}>{busy ? 'Assinando e registrando…' : 'Assinar declaração e registrar hashes'}</button></>}{error ? <p className="ent-alert" role="alert">{error}</p> : null}</section>;
}
