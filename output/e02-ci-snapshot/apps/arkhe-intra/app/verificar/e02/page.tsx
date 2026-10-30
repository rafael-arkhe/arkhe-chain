import { PageTitle } from '@/components/ui';
import { E02Verifier } from '@/components/e02-verifier';

export default function Page() {
  return (
    <main className="e02-page">
      <PageTitle eyebrow="EVIDÊNCIA / COMPROMISSO E02" title="Verifique o compromisso, não a promessa" />
      <E02Verifier />
    </main>
  );
}
