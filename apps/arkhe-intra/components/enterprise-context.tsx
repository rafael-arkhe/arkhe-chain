'use client';
import Link from 'next/link';
import { createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Fingerprint, Settings2, ScanLine, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/client';
import type { EnterpriseState, Persona, Preferences } from '@/lib/enterprise-types';

type Context = { data: EnterpriseState; persona: Persona; save: (value: Preferences) => void; saving: boolean };
const EnterpriseContext = createContext<Context | null>(null);
export function useEnterprise() { const value = useContext(EnterpriseContext); if (!value) throw new Error('EnterpriseProvider ausente.'); return value; }
export function useVocabulary() { const { persona } = useEnterprise(); return (key: string) => persona.vocabulary[key] || key; }
export function EnterpriseProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient(), path = usePathname();
  const query = useQuery({ queryKey: ['enterprise'], queryFn: () => api<EnterpriseState>('enterprise') });
  const mutation = useMutation({ mutationFn: (value: Preferences) => api<Preferences>('enterprise/personas', value), onSuccess: preferences => queryClient.setQueryData<EnterpriseState>(['enterprise'], previous => previous ? { ...previous, preferences } : previous) });
  if (query.isPending) return <div className="enterprise-loading" role="status"><span className="spinner" />Carregando o portal Enterprise…</div>;
  if (query.isError) return <div className="enterprise-error" role="alert"><h1>Não foi possível abrir o portal</h1><p>{query.error.message}</p><button onClick={() => query.refetch()}>Tentar novamente</button></div>;
  const data = query.data, persona = data.personas.find(value => value.id === data.preferences.active) || data.personas[0];
  return <EnterpriseContext.Provider value={{ data, persona, save: value => mutation.mutate(value), saving: mutation.isPending }}><div className="enterprise"><header className="ent-header"><div className="ent-brand"><ShieldCheck size={30} /><div><strong>Arkhe <span>Enterprise</span></strong><small>WORKSPACE DE EVIDÊNCIAS</small></div></div><span className="ent-label"><span className="ent-dot" />INSTALAÇÃO LOCAL</span><label className="ent-persona-label">Sua persona<select aria-label="Persona ativa" disabled={mutation.isPending} value={persona.id} onChange={event => mutation.mutate({ ...data.preferences, active: event.target.value })}>{data.personas.filter(item => data.preferences.available.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></header><nav className="ent-nav" aria-label="Portal Enterprise"><Link href="/enterprise" aria-current={path === '/enterprise' ? 'page' : undefined}><Fingerprint size={16} />Evidências</Link><Link href="/enterprise/perfis" aria-current={path === '/enterprise/perfis' ? 'page' : undefined}><Building2 size={16} />Setor & personas</Link><Link href="/verificar/e02"><ScanLine size={16} />Verificador E02</Link><Link href="/enterprise/onboarding" aria-current={path === '/enterprise/onboarding' ? 'page' : undefined}><Settings2 size={16} />Configuração</Link></nav>{mutation.isError ? <p className="ent-alert" role="alert">{mutation.error.message}</p> : null}<div className="ent-body">{children}</div><div className="ent-footnote">ADR-008 · A persona adapta a apresentação. Suas permissões continuam vinculadas à sua conta.</div></div></EnterpriseContext.Provider>;
}
