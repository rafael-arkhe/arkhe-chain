import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
import './globals.css';
import './refinements.css';
import './credentials.css';
import './development.css';
import './cockpit.css';
export const metadata: Metadata = { title: { default: 'Arkhe-Intra | Governança verificável', template: '%s | Arkhe-Intra' }, description: 'Documentos, assinaturas e evidências em um workplace verificável.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body><Providers><Shell>{children}</Shell></Providers></body></html>; }
