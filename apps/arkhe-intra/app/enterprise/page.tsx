import Link from 'next/link';
import { EnterpriseDashboard } from '@/components/enterprise-dashboard';
export const dynamic='force-dynamic';
export default function EnterprisePage() { return <>{process.env.ARKHE_PIX_RECEIPTS==='1'?<p><Link href="/enterprise/recibos">Recibos Pix · avaliação sintética opcional →</Link></p>:null}<EnterpriseDashboard /></>; }
