'use client';

import { useAuth, useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';

type Props = {
  perm: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Espelha o RequirePerm do politicians-app: gate de UI por permissão.
 * Segurança de verdade vive no backend; isto é apenas higiene visual.
 */
export function RequirePerm({ perm, fallback, children }: Props) {
  const { principal, loading } = useAuth();
  const allowed = useCan(perm);
  const t = useT();

  if (loading) {
    return null;
  }
  if (!principal) {
    return null;
  }
  if (!allowed) {
    const [bodyBefore, bodyAfter] = t('requirePerm.deniedBody').split('{perm}');
    return (
      fallback ?? (
        <div className="p-6">
          <div className="border border-border-light p-4 text-[11px] font-mono text-muted-on-light bg-white">
            <div className="text-text-on-light uppercase tracking-[0.22em] text-[10px] mb-1">
              {t('requirePerm.deniedTitle')}
            </div>
            {bodyBefore}
            <code className="text-primary">{perm}</code>
            {bodyAfter}
          </div>
        </div>
      )
    );
  }
  return <>{children}</>;
}
