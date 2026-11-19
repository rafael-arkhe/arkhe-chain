'use client';
import { CheckCircle2, CircleHelp, XCircle, Copy, FileSearch } from 'lucide-react';
import { useState } from 'react';

export function Badge({
  verdict,
  children,
}: {
  verdict: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  children?: React.ReactNode;
}) {
  const Icon = verdict === 'PASS' ? CheckCircle2 : verdict === 'FAIL' ? XCircle : CircleHelp;
  return (
    <span className={'badge ' + verdict.toLowerCase()}>
      <Icon size={13} aria-hidden="true" />
      {verdict}
      {children ? <> · {children}</> : null}
    </span>
  );
}

export function Digest({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      className="digest"
      type="button"
      title={value}
      aria-label={
        copied
          ? 'Digest copiado'
          : failed
            ? 'Falha ao copiar. Tente novamente.'
            : `Copiar digest ${value}`
      }
      onBlur={() => {
        setCopied(false);
        setFailed(false);
      }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setFailed(false);
        } catch {
          setCopied(false);
          setFailed(true);
        }
      }}
    >
      <span aria-live="polite">
        {copied ? 'Copiado' : failed ? 'Tentar copiar' : value.slice(0, 10) + '…'}
      </span>
      {copied ? <CheckCircle2 size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <FileSearch size={30} aria-hidden="true" />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <p className={'notice ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

const descriptions: Record<string, string> = {
  'Documentos & minutas':
    'Encontre a versão certa, acompanhe as revisões e consulte as evidências de cada documento.',
  'Jurídico & Compliance':
    'Um repositório para políticas, compromissos e decisões com responsabilidades claras.',
  'Uma nova minuta':
    'Comece pelo conteúdo. Revisão, assinaturas e publicação acontecem nas próximas etapas.',
  'Trilha de auditoria':
    'Acompanhe quem fez o quê e confira a integridade dos registros da aplicação.',
  'Um apoio para pensar melhor':
    'Um espaço para explorar ideias com o modelo instalado no seu computador.',
  'Propor, decidir, segurar':
    'A proposta fica no centro. As camadas à direita dizem o que ainda está fechado.',
  'Confie no que você pode conferir':
    'Verifique um pacote exportado com critérios explícitos e processamento local.',
  'Evidência de publicação':
    'Consulte o documento, as assinaturas registradas e o recibo de ancoragem disponível.',
  'Componentes do cockpit':
    'Catálogo de primitivas visuais fail-closed para inspeção de estados epistêmicos e provas.',
  'Verifique o compromisso, não a promessa':
    'Valide inclusão MMR e ancoragem Memo localmente no navegador com motivos explícitos.',
  'Verifique a assinatura do recibo':
    'Inspeção criptográfica local de recibos sintéticos, sem envio de dados ao servidor.',
};

export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {descriptions[title] ? <p className="page-description">{descriptions[title]}</p> : null}
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </div>
  );
}

export function LoadingCards() {
  return (
    <div className="skeleton-grid" role="status" aria-label="Carregando documentos" aria-busy="true">
      <div className="skeleton-card" />
      <div className="skeleton-card" />
    </div>
  );
}
