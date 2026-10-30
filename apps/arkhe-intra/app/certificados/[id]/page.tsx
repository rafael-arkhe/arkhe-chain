import { Certificate } from '@/components/certificate';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <Certificate id={(await params).id} />; }
