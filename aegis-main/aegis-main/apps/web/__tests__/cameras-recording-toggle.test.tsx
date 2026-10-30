/**
 * RecordingControl — gravação por câmera NA PÁGINA da câmera (Sprint 4 · Onda 2 UI).
 *
 * Invariantes:
 *  - estado vem do GET /streams/{id}/recording REAL (mockado): ativo →
 *    chip discreto "Gravando · <cadência>" em fonte mono;
 *  - iniciar → confirmModal (NUNCA diálogo nativo) com SELETOR de cadência
 *    (dropdown 1min/2min/5min, default 2min — nunca input técnico livre)
 *    → POST {action:'start', cadence};
 *  - parar → confirmModal → POST {action:'stop'}; cancelar não chama POST;
 *  - gate pela perm do POST (connectors.manage OU iam.governance):
 *    sem perm → botão desabilitado com title honesto;
 *  - erro de GET/POST vira estado honesto na UI (nunca silencioso).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));

const canMap: Record<string, boolean> = {};
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: (key: string) => canMap[key] ?? false,
}));

jest.mock('@/lib/api/cctv', () => {
  const actual = jest.requireActual('@/lib/api/cctv');
  return {
    ...actual,
    Cctv: {
      ...actual.Cctv,
      recording: {
        status: jest.fn(),
        control: jest.fn(),
      },
    },
  };
});

import { Cctv } from '@/lib/api/cctv';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { RecordingControl } from '@/components/cameras/recording-control';

const mStatus = (Cctv as unknown as { recording: { status: jest.Mock } }).recording
  .status;
const mControl = (Cctv as unknown as { recording: { control: jest.Mock } }).recording
  .control;
const mConfirm = confirmModal as jest.Mock;

const INACTIVE = {
  active: false,
  cadence: null,
  agent_id: null,
  last_run_at: null,
  segments_24h: 0,
  bytes_24h: 0,
};
const ACTIVE = {
  active: true,
  cadence: '2min',
  agent_id: 'ag-1',
  last_run_at: '2026-06-12T10:00:00Z',
  segments_24h: 132,
  bytes_24h: 540_000_000,
};

beforeEach(() => {
  jest.clearAllMocks();
  canMap['connectors.manage'] = true;
  canMap['iam.governance'] = false;
  mStatus.mockResolvedValue(INACTIVE);
  mControl.mockResolvedValue(ACTIVE);
});

test('inativo: sem chip; iniciar → confirmModal com seletor de cadência → POST start', async () => {
  // o operador troca a cadência no dropdown DENTRO do modal
  mConfirm.mockImplementation(async (opts: { description: React.ReactNode }) => {
    render(<div data-testid="dialog-host">{opts.description}</div>);
    const select = (await screen.findByTestId(
      'recording-cadence',
    )) as HTMLSelectElement;
    expect(select.value).toBe('2min'); // default honesto
    // opções com rótulo humano, nunca o valor técnico cru
    expect(screen.getByText(/a cada 5 minutos/i)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '5min' } });
    return true;
  });
  render(<RecordingControl streamId="st-1" />);
  await waitFor(() => expect(mStatus).toHaveBeenCalledWith('st-1'));
  expect(screen.queryByTestId('recording-chip')).toBeNull();

  fireEvent.click(await screen.findByTestId('recording-toggle'));
  await waitFor(() =>
    expect(mControl).toHaveBeenCalledWith('st-1', {
      action: 'start',
      cadence: '5min',
    }),
  );
  expect(mConfirm).toHaveBeenCalled();
  // estado pós-POST vem da RESPOSTA do POST (não de um boolean decorativo)
  expect(await screen.findByTestId('recording-chip')).toBeInTheDocument();
});

test('ativo: chip discreto "Gravando · 2min" em fonte mono; parar → confirmModal → POST stop', async () => {
  mStatus.mockResolvedValue(ACTIVE);
  mControl.mockResolvedValue(INACTIVE);
  mConfirm.mockResolvedValue(true);
  render(<RecordingControl streamId="st-1" />);
  const chip = await screen.findByTestId('recording-chip');
  expect(chip).toHaveTextContent('Gravando · 2min');
  expect(chip.className).toContain('font-mono');

  fireEvent.click(screen.getByTestId('recording-toggle'));
  await waitFor(() =>
    expect(mControl).toHaveBeenCalledWith('st-1', { action: 'stop' }),
  );
  await waitFor(() => expect(screen.queryByTestId('recording-chip')).toBeNull());
});

test('cancelar o confirmModal NÃO chama o POST', async () => {
  mConfirm.mockResolvedValue(false);
  render(<RecordingControl streamId="st-1" />);
  const btn = await screen.findByTestId('recording-toggle');
  await waitFor(() => expect(btn).toBeEnabled()); // GET resolvido
  fireEvent.click(btn);
  await waitFor(() => expect(mConfirm).toHaveBeenCalled());
  expect(mControl).not.toHaveBeenCalled();
});

test('sem perm do POST → botão desabilitado com title honesto (nunca manda pra central)', async () => {
  canMap['connectors.manage'] = false;
  canMap['iam.governance'] = false;
  render(<RecordingControl streamId="st-1" />);
  const btn = await screen.findByTestId('recording-toggle');
  await waitFor(() => expect(btn).toBeDisabled());
  expect(btn.title).toMatch(/permissão/i);
  fireEvent.click(btn);
  expect(mConfirm).not.toHaveBeenCalled();
  expect(mControl).not.toHaveBeenCalled();
});

test('iam.governance também passa no gate (mesmo gate ampliado do backend)', async () => {
  canMap['connectors.manage'] = false;
  canMap['iam.governance'] = true;
  mConfirm.mockResolvedValue(true);
  render(<RecordingControl streamId="st-1" />);
  const btn = await screen.findByTestId('recording-toggle');
  await waitFor(() => expect(btn).toBeEnabled());
  fireEvent.click(btn);
  await waitFor(() => expect(mControl).toHaveBeenCalled());
});

test('falha no GET → estado honesto de erro; falha no POST → mensagem de erro', async () => {
  mStatus.mockRejectedValue(new Error('down'));
  render(<RecordingControl streamId="st-1" />);
  expect(await screen.findByTestId('recording-state-error')).toBeInTheDocument();

  // recupera o GET, falha o POST
  mStatus.mockResolvedValue(INACTIVE);
  mConfirm.mockResolvedValue(true);
  mControl.mockRejectedValue(new Error('409'));
  render(<RecordingControl streamId="st-2" />);
  const btns = await screen.findAllByTestId('recording-toggle');
  const btn = btns[btns.length - 1];
  await waitFor(() => expect(btn).toBeEnabled()); // GET do st-2 resolvido
  fireEvent.click(btn);
  await waitFor(() => expect(mControl).toHaveBeenCalled());
  expect(await screen.findByTestId('recording-action-error')).toBeInTheDocument();
});
