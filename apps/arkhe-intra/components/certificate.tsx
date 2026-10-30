'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Printer, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/client';
import { Badge, Notice, LoadingCards } from './ui';
type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
type Verification = { title: string; digest: string; checkedAt: string; verdict: Verdict; integrity: Verdict; state: Verdict; signatures: Verdict; anchor: Verdict; scope: string };
export function Certificate({ id }: { id: string }) {
  const query = useQuery({ queryKey: ['verification', id], queryFn: () => api<Verification>(`documents/${id}/verify`) });
  if (query.isPending) return <LoadingCards />;
  if (!query.data) return <Notice error>{query.error?.message || 'Não foi possível emitir o laudo.'}</Notice>;
  const result = query.data;
  return <><div className="print-toolbar"><Link className="button secondary" href={'/documentos/' + id}>Voltar ao documento</Link><button className="button" onClick={() => window.print()}><Printer size={17} />Imprimir / salvar PDF</button></div><article className="certificate"><header><ShieldCheck size={34} /><strong>ARKHE-INTRA</strong><span>RELATÓRIO DE CONFERÊNCIA LOCAL</span></header><p className="eyebrow">EVIDÊNCIA CORPORATIVA · ESCOPO TÉCNICO</p><h1>Laudo de integridade<br />e assinatura digital</h1><div className="certificate-verdict"><Badge verdict={result.verdict} /><time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleString('pt-BR')}</time></div><h2>01 / Identificação do artefato</h2><dl><div><dt>Documento</dt><dd>{result.title}</dd></div><div><dt>Identificador</dt><dd className="mono">{id}</dd></div><div><dt>Digest BLAKE3</dt><dd className="mono break-all">{result.digest}</dd></div></dl><h2>02 / Resultados da conferência</h2><table><thead><tr><th>Verificação</th><th>Resultado</th></tr></thead><tbody>{([['Integridade do conteúdo', result.integrity], ['Transições de estado', result.state], ['Assinaturas e chaves cadastradas', result.signatures], ['Entrada Rekor / SET e inclusão', result.anchor]] as const).map(([label, verdict]) => <tr key={label}><td>{label}</td><td><Badge verdict={verdict} /></td></tr>)}</tbody></table><h2>03 / Escopo e limitações</h2><p>{result.scope}</p><p>Este relatório técnico não é certificado pericial institucional, parecer jurídico, admissão WormGraph ou checkpoint testemunhado. A confiança nas chaves é a configurada neste servidor no momento da conferência.</p><div className="certificate-end"><ShieldCheck size={22} /><span>Gerado a partir de verificações do artefato, sem assinatura própria do laudo.<br />Use o pacote exportado para conferência independente.</span></div></article></>;
}
