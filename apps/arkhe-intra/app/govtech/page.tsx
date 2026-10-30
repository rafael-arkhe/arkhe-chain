import type { Metadata } from 'next';
import { GovtechApp } from '@/components/govtech-app';
import './govtech.css';
export const metadata: Metadata = { title: 'Arkhe GovTech | Operações públicas verificáveis' };
export default function GovtechPage() { return <GovtechApp />; }
