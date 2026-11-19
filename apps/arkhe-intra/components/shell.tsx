'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Search,
  LayoutDashboard,
  Scale,
  FileText,
  ScanLine,
  Fingerprint,
  Sparkles,
  LogOut,
  ChevronRight,
  Menu,
  X,
  KeyRound,
  PanelsTopLeft,
  Layers,
} from 'lucide-react';
import { api } from '@/lib/client';
import { useUi } from '@/lib/ui-store';
import type { User, Dashboard } from '@/lib/types';
import { Badge, Notice } from './ui';

const sections = [
  {
    label: 'Superfícies',
    links: [
      ['/govtech', 'Arkhe GovTech', Scale],
      ['/enterprise', 'Arkhe Enterprise', ShieldCheck],
    ],
  },
  {
    label: 'Trabalho',
    links: [
      ['/', 'Governança', LayoutDashboard],
      ['/juridico', 'Jurídico & Compliance', Scale],
      ['/documentos', 'Documentos', FileText],
      ['/verificar', 'Verificação offline', ScanLine],
      ['/auditoria', 'Trilha de auditoria', Fingerprint],
      ['/assistente', 'Inteligência local', Sparkles],
      ['/credenciais', 'Identidade & credenciais', KeyRound],
    ],
  },
  {
    label: 'Evolução',
    links: [
      ['/desenvolvimento', 'Desenvolvimento Arkhe', Sparkles],
      ['/bancada', 'Bancada Arkhe', PanelsTopLeft],
      ['/avaliacoes', 'Avaliações de capacidade', Fingerprint],
      ['/cockpit', 'Componentes · Cockpit', Layers],
    ],
  },
] as const;

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(),
    router = useRouter(),
    queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false),
    [logoutError, setLogoutError] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const search = useUi(s => s.search),
    setSearch = useUi(s => s.setSearch);
  const publicAccess =
    pathname === '/login' ||
    pathname === '/registro' ||
    pathname === '/recuperar' ||
    pathname === '/verificar/e02' ||
    pathname === '/verificar/pix';

  const user = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('me'),
    enabled: !publicAccess,
  });
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('dashboard'),
    enabled: Boolean(user.data) && !publicAccess,
  });

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (searchInput.current) {
          event.preventDefault();
          searchInput.current.focus();
          searchInput.current.select();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  if (publicAccess) return <>{children}</>;
  if (user.isPending)
    return (
      <main className="loading" role="status">
        <span className="spinner" aria-hidden="true" />
        <strong>Abrindo seu ambiente</strong>
        <p>Consultando sua sessão e preparando os documentos.</p>
      </main>
    );
  if (!user.data)
    return (
      <main className="loading">
        <ShieldCheck size={40} />
        <h1>Seu ambiente verificável</h1>
        <p>Entre para acessar documentos e evidências.</p>
        <Link
          className="button"
          href={pathname.startsWith('/govtech') ? '/login?next=/govtech' : '/login'}
        >
          {pathname.startsWith('/govtech') ? 'Entrar no Arkhe GovTech' : 'Entrar no Arkhe-Intra'}
        </Link>
      </main>
    );
  if (pathname.startsWith('/govtech'))
    return (
      <>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        <div className="gov-account-bar">
          <Link href="/">← Ambiente Arkhe</Link>
          <span>
            {user.data.name} ·{' '}
            {user.data.role === 'owner'
              ? 'Governança'
              : user.data.role === 'reviewer'
                ? 'Revisão'
                : 'Autoria'}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await api('logout', {});
                queryClient.clear();
                router.push('/login');
              } catch {
                setLogoutError('Falha ao encerrar sessão.');
              }
            }}
          >
            Sair
          </button>
        </div>
        {logoutError && <p role="alert">{logoutError}</p>}
        <main id="conteudo">{children}</main>
      </>
    );

  return (
    <>
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <button
          type="button"
          className="icon-button mobile-menu"
          aria-label={menuOpen ? 'Fechar navegação' : 'Abrir navegação'}
          aria-expanded={menuOpen}
          aria-controls="primary-sidebar"
          onClick={() => setMenuOpen(open => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Link className="brand" href="/">
          <span>
            <ShieldCheck size={26} />
          </span>
          Arkhe<span className="brand-light">-Intra</span>
        </Link>
        <span className="environment">AMBIENTE LOCAL</span>
        <form
          className="global-search"
          onSubmit={event => {
            event.preventDefault();
            router.push('/documentos');
          }}
        >
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchInput}
            aria-label="Pesquisar documentos"
            placeholder="Pesquisar documentos…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          {search ? (
            <button
              type="button"
              className="clear-filter"
              aria-label="Limpar pesquisa"
              onClick={() => {
                setSearch('');
                searchInput.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd title="Atalho Ctrl+K">Ctrl K</kbd>
          )}
        </form>
        <Link className="quick-verify" href="/verificar">
          <ScanLine size={18} />
          Verificar
        </Link>
        <div className="user-avatar" aria-hidden="true">
          {initials(user.data.name)}
        </div>
        <div className="user-info">
          <strong>{user.data.name}</strong>
          <small>
            {user.data.role === 'owner'
              ? 'Governança'
              : user.data.role === 'reviewer'
                ? 'Revisão de conteúdo'
                : 'Autoria'}
          </small>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Sair da conta"
          onClick={async () => {
            try {
              await api('logout', {});
              queryClient.clear();
              setMenuOpen(false);
              router.push('/login');
            } catch {
              setLogoutError('Não foi possível encerrar a sessão. Tente novamente.');
            }
          }}
        >
          <LogOut size={18} />
        </button>
      </header>
      <div className="status-banner">
        <Badge
          verdict={
            dashboard.data ? (dashboard.data.auditIntegrity ? 'PASS' : 'FAIL') : 'INCONCLUSIVE'
          }
        />{' '}
        <span>
          <strong>Integridade da trilha local</strong> ·{' '}
          {dashboard.data ? `${dashboard.data.counts.events} eventos registrados` : 'Consultando…'}
        </span>
        <span className="banner-secondary">
          Rekor {dashboard.data?.rekorConfigured ? 'configurado' : 'não configurado'} · Sem
          atestação de tenant
        </span>
      </div>
      <div className="workspace">
        <aside id="primary-sidebar" className="sidebar" data-open={menuOpen}>
          <p className="eyebrow">WORKPLACE FIDUCIÁRIO</p>
          <nav aria-label="Navegação principal">
            {sections.map(section => (
              <div className="nav-group" key={section.label}>
                <p className="nav-section">{section.label}</p>
                <div className="nav-links">
                  {section.links.map(([href, label, Icon]) => {
                    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={active ? 'active' : ''}
                      >
                        <Icon size={19} />
                        <span>{label}</span>
                        <ChevronRight size={13} className="nav-chevron" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="sidebar-note">
            <ShieldCheck size={25} />
            <strong>Confiança verificável</strong>
            <p>Cada estado informa o que foi efetivamente verificado.</p>
            <Link href="/auditoria">Explorar evidências →</Link>
          </div>
        </aside>
        {menuOpen ? (
          <div
            className="sidebar-backdrop"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <main id="conteudo" className="main-content">
          {logoutError ? <Notice error>{logoutError}</Notice> : null}
          {children}
        </main>
      </div>
      <footer>
        <strong>Arkhe-Intra</strong>
        <span>Digital workplace · Evidência antes da autoridade</span>
        <Link href="/verificar">Verificador offline</Link>
        <span>v0.1.0 · Local</span>
      </footer>
    </>
  );
}
