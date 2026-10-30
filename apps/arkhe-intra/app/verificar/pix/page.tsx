import { notFound } from 'next/navigation';
import { PixVerifier } from '@/components/pix-verifier';
import { PageTitle } from '@/components/ui';
export const dynamic='force-dynamic';
export default function Page(){
 if(process.env.ARKHE_PIX_RECEIPTS!=='1')notFound();
 return <><PageTitle eyebrow="RECIBOS / EXPERIMENTAL" title="Verifique a assinatura do recibo" /><PixVerifier /></>;
}
