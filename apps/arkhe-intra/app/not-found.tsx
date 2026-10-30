import Link from 'next/link';
import { FileSearch } from 'lucide-react';
export default function NotFound() { return <section className="panel status-page"><FileSearch size={46} aria-hidden="true" /><p className="eyebrow">PÁGINA NÃO ENCONTRADA</p><h1>Este endereço não está disponível</h1><p>Acesse a biblioteca para localizar o documento ou serviço desejado.</p><Link className="button" href="/documentos">Abrir biblioteca</Link></section>; }
