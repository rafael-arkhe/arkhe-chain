import { PageShell } from './page-shell';
import type { ClassificationLevel } from '@/lib/classification';

type Props = {
  title: string;
  subtitle?: string;
  classification?: ClassificationLevel;
  theme?: 'dark' | 'light';
};

export function EmptyShell({ title, subtitle, classification = 'restrito', theme = 'dark' }: Props) {
  return (
    <PageShell title={title} subtitle={subtitle} classification={classification} theme={theme}>
      <div className="h-full flex items-center justify-center">
        <div className="w-[420px] flex flex-col items-center gap-3 opacity-60">
          <div className="w-16 h-16 border border-border-dark" />
          <p className="text-[12px] text-center font-mono uppercase tracking-[0.18em]">
            {title}
          </p>
        </div>
      </div>
    </PageShell>
  );
}
