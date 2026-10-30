/**
 * nodeCaption — caption do nó no canvas SEM repetir o nome da fase quando o
 * título do nó já é o nome da fase (bug "COLETA DE DADOS · CONCEITO" + título
 * "Coleta de dados").
 */
import { nodeCaption } from '@/components/solution-designer/nodeMeta';

const L = { phaseLabel: 'Coleta de dados', conceptLabel: 'Conceito', objectTypeLabel: 'Tipo de objeto' };

it('conceito cujo título É o nome da fase → mostra só "Conceito" (sem repetir a fase)', () => {
  expect(nodeCaption({ isConcept: true, title: 'Coleta de dados', ...L })).toBe('Conceito');
  // robusto a caixa/espaços
  expect(nodeCaption({ isConcept: true, title: '  coleta de dados ', ...L })).toBe('Conceito');
});

it('conceito com título DIFERENTE da fase → "{fase} · Conceito" (contexto útil)', () => {
  expect(nodeCaption({ isConcept: true, title: 'Ingestão de câmeras', ...L })).toBe('Coleta de dados · Conceito');
});

it('nó de tipo de objeto → "Tipo de objeto"', () => {
  expect(nodeCaption({ objectType: true, isConcept: true, title: 'Pessoa', ...L })).toBe('Tipo de objeto');
});

it('nó não-conceito → só o nome da fase', () => {
  expect(nodeCaption({ isConcept: false, title: 'Worker X', ...L })).toBe('Coleta de dados');
});
