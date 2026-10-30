/**
 * lib/aip/modelLabels — soberania do Moonshot/Kimi (default da finalidade Coleta).
 *
 * Antes do fix, "moonshotai/kimi-k2.6" não estava em AIP_CLOUD_FAMILIES nem em
 * MODEL_CODENAMES → renderizava como "Nuvem externa" com nome de vendor cru.
 * Agora deve ser AIP Cloud (barra azul) + codinome AIP + nota PT-BR.
 */
import { aipModelLabel, aipModelNote, isAipCloudModel } from '@/lib/aip/modelLabels';

const KIMI = 'moonshotai/kimi-k2.6';

test('aipModelLabel(Kimi) devolve o codinome AIP, nunca o slug cru', () => {
  const label = aipModelLabel(KIMI);
  expect(label).toBe('AIP-Luar-Pro');
  expect(label).not.toContain('moonshot');
  expect(label).not.toContain('kimi');
  expect(label).not.toContain('/');
});

test('isAipCloudModel(Kimi) === true — soberano AIP Cloud, não "Nuvem externa"', () => {
  expect(isAipCloudModel(KIMI)).toBe(true);
});

test('aipModelNote(Kimi) traz nota PT-BR curada sem vendor cru', () => {
  const note = aipModelNote(KIMI);
  expect(note.length).toBeGreaterThan(0);
  expect(note.toLowerCase()).not.toContain('moonshot');
  expect(note.toLowerCase()).not.toContain('kimi');
});
