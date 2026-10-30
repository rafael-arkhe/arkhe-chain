'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  Cable,
  Cog,
  FileText,
  KeyRound,
  Shield,
  Users,
  Workflow,
} from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { Iam, Sources } from '@/lib/api';
import type { DataSource, IamAuditEvent, IamRole } from '@/lib/api/types';
import { useContextClassification } from '@/lib/use-context-classification';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';
import { formatHoraBR } from '@/lib/datetime';

const TABS = [
  { id: 'acessos', label: 'Acessos', icon: Users, perm: 'admin.acessos' },
  { id: 'classificacao', label: 'Classificação', icon: Shield, perm: 'admin.classificacao' },
  { id: 'auditoria', label: 'Auditoria', icon: Activity, perm: 'admin.auditoria' },
  { id: 'federacao', label: 'Federação', icon: Cable, perm: 'admin.federacao' },
  { id: 'unidades', label: 'Unidades', icon: Workflow, perm: 'admin.unidades' },
  { id: 'templates', label: 'Templates', icon: FileText, perm: 'admin.templates' },
  { id: 'automacoes', label: 'Automações', icon: Cog, perm: 'admin.automacoes' },
  { id: 'tokens', label: 'Tokens / OSDK', icon: KeyRound, perm: 'admin.tokens' },
] as const;

export default function AdminPage() {
  const [tab, setTab] = useState<typeof TABS[number]['id']>('federacao');
  // SHELL HONESTO (2026-06-12): estado inicial VAZIO — os fallbacks
  // fabricados (FALLBACK_AUDIT/ROLES/SOURCES com latências, contagens de
  // usuários e conectores inventados) morreram. Offline = lista vazia.
  const [audit, setAudit] = useState<IamAuditEvent[]>([]);
  const [roles, setRoles] = useState<IamRole[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  // Unidade REAL no banner — mesma fonte do rodapé/banner (/me/context).
  const { label: ctxLabel } = useContextClassification();
  const t = useT();

  useEffect(() => {
    Iam.audit.list().then((d) => d.length && setAudit(d)).catch(() => {});
    Iam.roles.list().then((d) => d.length && setRoles(d)).catch(() => {});
    Sources.list().then((d) => d.length && setSources(d)).catch(() => {});
  }, []);

  return (
    <RequirePerm perm="admin.auditoria">
      <PageShell
        title="Administração"
        subtitle="Governança · /iam/* · /sources · auditoria imutável"
        classification="sigiloso"
        classificationLabel={ctxLabel ? `GOVERNANÇA · ${ctxLabel}` : 'GOVERNANÇA'}
        theme="light"
      >
        <div className="h-full flex overflow-hidden">
          <aside className="w-[240px] bg-panel-light border-r border-border-light flex flex-col shrink-0">
            <ul className="py-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      data-testid={`admin-tab-${t.id}`}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 h-9 text-[12px] transition-colors',
                        tab === t.id
                          ? 'bg-raised-light text-text-on-light font-medium border-l-2 border-l-primary'
                          : 'text-muted-on-light hover:bg-raised-light/60',
                      )}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                      <span>{t.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="flex-1 bg-canvas-light overflow-y-auto p-6">
            {tab === 'federacao' && (
              <div>
                <h2 className="text-[16px] font-semibold mb-1">Conectores federados</h2>
                <p className="text-[12px] text-muted-on-light mb-4">
                  {sources.length} sistemas legados · GET /sources/connectors/available
                </p>
                <div className="border border-border-light">
                  <div className="grid grid-cols-12 px-3 h-8 items-center bg-panel-light border-b border-border-light text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                    <span className="col-span-6">Sistema</span>
                    <span className="col-span-4">Status</span>
                    <span className="col-span-2 text-right">Ação</span>
                  </div>
                  {sources.length === 0 && (
                    <p
                      data-testid="admin-sources-empty"
                      className="px-3 py-6 text-center text-[11px] text-muted-on-light"
                    >
                      {t('common.empty')}
                    </p>
                  )}
                  {sources.map((f, i) => (
                    <div
                      key={f.id}
                      className={cn(
                        'grid grid-cols-12 px-3 h-9 items-center text-[12px]',
                        i % 2 === 0 ? 'bg-white' : 'bg-raised-light/40',
                      )}
                    >
                      <span className="col-span-6">{f.name}</span>
                      <span className="col-span-4 flex items-center gap-1.5 text-[11px] font-mono">
                        <span
                          className={cn(
                            'w-1.5 h-1.5 shrink-0',
                            f.status === 'connected' ? 'bg-success' : f.status === 'degraded' ? 'bg-warning' : 'bg-danger',
                          )}
                        />
                        {f.status}
                        {f.latency_ms !== null && ` · ${f.latency_ms}ms`}
                      </span>
                      <span className="col-span-2 text-right">
                        <button
                          type="button"
                          onClick={() => Sources.test(f.id).catch(() => {})}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Testar
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'auditoria' && (
              <div>
                <h2 className="text-[16px] font-semibold mb-1">Log imutável</h2>
                <p className="text-[12px] text-muted-on-light mb-4">
                  GET /iam/audit · cada leitura/escrita registrada com hash · exportável
                </p>
                <table className="w-full border border-border-light text-[12px]">
                  <thead>
                    <tr className="bg-panel-light text-[10px] uppercase tracking-[0.18em] text-muted-on-light">
                      <th className="text-left px-3 h-8 font-semibold">Hora</th>
                      <th className="text-left px-3 h-8 font-semibold">Autor</th>
                      <th className="text-left px-3 h-8 font-semibold">Ação</th>
                      <th className="text-left px-3 h-8 font-semibold">Alvo</th>
                      <th className="text-left px-3 h-8 font-semibold">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          data-testid="admin-audit-empty"
                          className="px-3 py-6 text-center text-[11px] text-muted-on-light"
                        >
                          {t('common.empty')}
                        </td>
                      </tr>
                    )}
                    {audit.map((a, i) => (
                      <tr
                        key={a.id}
                        className={cn(
                          'border-t border-border-light/60',
                          i % 2 === 0 ? 'bg-white' : 'bg-raised-light/40',
                        )}
                      >
                        <td className="px-3 h-8 font-mono text-[11px] text-muted-on-light">
                          {formatHoraBR(a.at)}
                        </td>
                        <td className="px-3 h-8 font-mono text-[11px]">{a.actor}</td>
                        <td className="px-3 h-8">{a.action}</td>
                        <td className="px-3 h-8 font-mono text-[11px]">{a.target}</td>
                        <td className="px-3 h-8 font-mono text-[10px] text-muted-on-light">
                          {a.ip || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'acessos' && (
              <div>
                <h2 className="text-[16px] font-semibold mb-1">Papéis e permissões</h2>
                <p className="text-[12px] text-muted-on-light mb-4">
                  GET /iam/roles · ACL granular por atributo
                </p>
                <div className="space-y-2.5">
                  {roles.length === 0 && (
                    <p
                      data-testid="admin-roles-empty"
                      className="px-3 py-6 text-center text-[11px] text-muted-on-light border border-border-light bg-white"
                    >
                      {t('common.empty')}
                    </p>
                  )}
                  {roles.map((p) => (
                    <div key={p.id} className="border border-border-light bg-white p-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-[14px] font-semibold">{p.name}</h3>
                        <span className="text-[10px] font-mono text-muted-on-light bg-raised-light px-1.5 py-0.5">
                          {p.user_count} usuários
                        </span>
                        <button
                          type="button"
                          className="ml-auto text-[11px] text-primary hover:underline"
                        >
                          Editar permissões
                        </button>
                      </div>
                      <p className="text-[12px] text-muted-on-light mt-1">{p.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.perms.slice(0, 8).map((perm) => (
                          <span
                            key={perm}
                            className="text-[10px] font-mono bg-raised-light px-1.5 py-0.5"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab !== 'federacao' && tab !== 'auditoria' && tab !== 'acessos' && (
              <div className="h-full flex flex-col items-center justify-center opacity-50">
                <div className="w-16 h-16 border border-border-light mb-3" />
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-on-light">
                  {TABS.find((t) => t.id === tab)?.label}
                </p>
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </RequirePerm>
  );
}
