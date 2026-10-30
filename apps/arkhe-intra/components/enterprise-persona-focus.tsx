'use client';
import Link from 'next/link';
import { ArrowRight, Layers3 } from 'lucide-react';
import type { Dashboard, User } from '@/lib/types';
import { stateNames } from '@/lib/types';
import { useEnterprise } from './enterprise-context';

export function PersonaFocus({ dashboard, user }: { dashboard: Dashboard; user?: User }) {
  const { persona } = useEnterprise();
  const docs = dashboard.documents;
  let title = '', description = '', rows: { label: string; detail: string; href: string }[] = [];
  switch (persona.id) {
    case 'legal':
      title = 'Assinaturas e cadeia documental';
      description = 'Acompanhe a autoria e as revisões registradas nos documentos acessíveis.';
      rows = docs.filter(doc => doc.signatures.length).slice(0, 4).map(doc => ({ label: doc.title, detail: `${doc.signatures.length} assinatura(s) · ${stateNames[doc.state] || doc.state}`, href: `/documentos/${doc.id}` }));
      break;
    case 'finance':
      title = 'Documentos por etapa';
      description = 'Visão do fluxo documental. Reconciliação financeira e custos não estão integrados.';
      rows = Object.entries(stateNames).map(([state, label]) => ({ label, detail: `${docs.filter(doc => doc.state === state).length} documento(s)`, href: '/documentos' }));
      break;
    case 'compliance':
      title = 'Revisão e aprovação de evidências';
      description = 'Acompanhe pendências documentais. Cobertura regulatória não é calculada.';
      rows = docs.filter(doc => ['review', 'reviewed', 'approved', 'anchoring'].includes(doc.state)).slice(0, 4).map(doc => ({ label: doc.title, detail: `${doc.department} · ${stateNames[doc.state]}`, href: `/documentos/${doc.id}` }));
      break;
    case 'engineering':
      title = 'Ferramentas de engenharia';
      description = 'Acesse os fluxos de desenvolvimento e os verificadores já integrados ao projeto.';
      rows = [{ label: 'Verificação E02', detail: 'Prova MMR e compromisso de ancoragem', href: '/verificar/e02' }, { label: 'Verificador offline', detail: 'Conferência local do pacote exportado', href: '/verificar' }];
      if (user?.role === 'owner') rows.unshift({ label: 'Pipeline de desenvolvimento', detail: 'Execução e revisão governada de propostas', href: '/desenvolvimento' });
      break;
    case 'ops':
      title = 'Fila operacional da sua conta';
      description = 'Ações pendentes do fluxo real. Métricas de SLA e incidentes não estão integradas.';
      rows = dashboard.tasks.slice(0, 4).map(doc => ({ label: doc.title, detail: stateNames[doc.state] || doc.state, href: `/documentos/${doc.id}` }));
      break;
    case 'executive': {
      title = 'Visão documental por departamento';
      description = 'Resumo da base acessível à sua conta. Este painel não estima ROI ou risco financeiro.';
      const departments = [...new Set(docs.map(doc => doc.department))];
      rows = departments.slice(0, 6).map(department => ({ label: department, detail: `${docs.filter(doc => doc.department === department && doc.state === 'published').length} publicado(s) / ${docs.filter(doc => doc.department === department).length} documento(s)`, href: '/documentos' }));
      break;
    }
    case 'audit':
      title = 'Rastreabilidade dos artefatos';
      description = 'Confira os digests e abra o laudo de cada registro. A trilha global exige governança.';
      rows = docs.slice(0, 4).map(doc => ({ label: doc.title, detail: `BLAKE3 · ${doc.digest.slice(0, 24)}…`, href: `/certificados/${doc.id}` }));
      break;
    default:
      title = 'Autoria e contribuições documentais';
      description = 'Identifique a autoria e acompanhe as assinaturas. Não constitui registro de propriedade intelectual.';
      rows = docs.slice(0, 4).map(doc => ({ label: doc.title, detail: `Autoria: ${doc.authorId} · ${doc.signatures.length} assinatura(s)`, href: `/documentos/${doc.id}` }));
  }
  return <section className="ent-panel ent-persona-focus"><div className="ent-section-title"><h2><Layers3 size={20} />{title}</h2><span className="ent-label">{persona.name.toUpperCase()}</span></div><p className="ent-muted">{description}</p>{rows.length ? <div className="ent-focus-grid">{rows.map(row => <Link className="ent-focus-row" key={row.label + row.href} href={row.href}><div><strong>{row.label}</strong><small>{row.detail}</small></div><ArrowRight size={16} /></Link>)}</div> : <p className="ent-info">Ainda não há registros para esta visão. Os documentos aparecerão conforme avançarem no fluxo.</p>}</section>;
}
