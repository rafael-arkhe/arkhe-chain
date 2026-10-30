import { renderHook, act, waitFor } from '@testing-library/react';

import { useSkillSample } from '@/components/solution-designer/use-skill-sample';

jest.mock('@/lib/api', () => ({
  Solutions: { skillSample: jest.fn(), skillSampleStatus: jest.fn() },
}));
const { Solutions } = jest.requireMock('@/lib/api') as { Solutions: Record<string, jest.Mock> };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

it('poll: running → done devolve os registros reais', async () => {
  Solutions.skillSample.mockResolvedValue({ sample_id: 's1', status: 'running' });
  Solutions.skillSampleStatus
    .mockResolvedValueOnce({ sample_id: 's1', status: 'running' })
    .mockResolvedValueOnce({
      sample_id: 's1', status: 'done',
      output: { node_type: 'PerfilInstagram', records: [{ username: 'ana', bio: 'x' }] },
    });

  const { result } = renderHook(() => useSkillSample());
  await act(async () => {
    void result.current.run('social.instagram', { query: '#x' });
  });
  expect(result.current.state).toBe('running');

  // 1º poll (running) → 2º poll (done). Avança os timers de 4s entre polls.
  await act(async () => { await jest.advanceTimersByTimeAsync(4000); });
  await act(async () => { await jest.advanceTimersByTimeAsync(4000); });

  await waitFor(() => expect(result.current.state).toBe('done'));
  expect(result.current.records).toEqual([{ username: 'ana', bio: 'x' }]);
  expect(result.current.nodeType).toBe('PerfilInstagram');
});

it('poll: status error propaga a mensagem', async () => {
  Solutions.skillSample.mockResolvedValue({ sample_id: 's2', status: 'running' });
  Solutions.skillSampleStatus.mockResolvedValueOnce({
    sample_id: 's2', status: 'error', error: 'param query obrigatório',
  });
  const { result } = renderHook(() => useSkillSample());
  await act(async () => { void result.current.run('social.instagram', {}); });
  await act(async () => { await jest.advanceTimersByTimeAsync(4000); });
  await waitFor(() => expect(result.current.state).toBe('error'));
  expect(result.current.error).toBe('param query obrigatório');
});
