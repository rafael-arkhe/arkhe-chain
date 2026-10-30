'use client';
import { WifiOff } from 'lucide-react';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="panel status-page"><WifiOff size={44} aria-hidden="true" /><p className="eyebrow">CONEXÃO INTERROMPIDA</p><h1>Não foi possível abrir esta página</h1><p>Confira a conexão com o servidor local e tente novamente. Os registros já salvos permanecem no banco.</p><button className="button" onClick={reset}>Tentar novamente</button></section>;
}
