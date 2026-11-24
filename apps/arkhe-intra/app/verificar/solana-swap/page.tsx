import { SolanaSwapVerifier } from '@/components/solana-swap-verifier';
import { PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <>
      <PageTitle
        eyebrow="SOLANA / 0x SWAP · AUTORIDADE RUST/WASM"
        title="Verificador de Swaps Solana (Evidências 1–3)"
      />
      <SolanaSwapVerifier />
    </>
  );
}
