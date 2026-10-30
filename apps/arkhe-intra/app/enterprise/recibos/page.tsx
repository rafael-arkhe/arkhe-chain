import { notFound } from 'next/navigation';
import { PixVerifier } from '@/components/pix-verifier';
import { PageTitle } from '@/components/ui';
export const dynamic='force-dynamic';
export default function Page(){
 if(process.env.ARKHE_PIX_RECEIPTS!=='1')notFound();
 return <><PageTitle eyebrow="RECIBOS / EXPERIMENTAL" title="Verifique a assinatura do recibo" /><p>Uma organização por instalação. Sem arquivo de recibos ou isolamento multi-tenant. Avaliação não ativa onboarding; se a política exigir liquidação, o recibo sintético será rejeitado.</p><PixVerifier enterprise /></>;
}
