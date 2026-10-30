'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirect: /treino-contagem → /treinamentos (peça genérica). */
export default function TreinoContagemRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/treinamentos');
  }, [router]);
  return null;
}
