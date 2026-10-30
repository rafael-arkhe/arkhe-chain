import { DocumentDetail } from '@/components/document-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <DocumentDetail id={(await params).id} />; }
