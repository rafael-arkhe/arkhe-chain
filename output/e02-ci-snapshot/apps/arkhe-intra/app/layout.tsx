import { Providers } from '@/components/providers';
import './globals.css';
import './refinements.css';
export const metadata = { title: 'Arkhe E02 conformance snapshot' };
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="pt-BR"><body><Providers>{children}</Providers></body></html>;
}
