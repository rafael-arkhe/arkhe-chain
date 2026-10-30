import { EnterpriseProvider } from '@/components/enterprise-context';
import '../enterprise.css';
export default function EnterpriseLayout({ children }: { children: React.ReactNode }) { return <EnterpriseProvider>{children}</EnterpriseProvider>; }
