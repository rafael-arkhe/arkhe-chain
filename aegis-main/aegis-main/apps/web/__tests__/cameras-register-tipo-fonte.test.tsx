/**
 * Registrar cÃ¢mera â€” Tipo de anÃ¡lise (LPR/OCR/CON) + Fonte AEGIS Bridge.
 *
 * Invariantes:
 *  - "Tipo de anÃ¡lise" escreve a TAG canÃ´nica (o MESMO vocabulÃ¡rio que o
 *    badge do /cameras e o filtro da toolbar leem): con â†’ bc-ready +
 *    contagem-sacos; ocr â†’ ocr; lpr â†’ lpr-ready;
 *  - trocar o tipo REMOVE a tag do tipo anterior (troca limpa);
 *  - fonte = AEGIS Bridge (GUI/.exe) monta rtsp://<ip-tailnet>:8554/<nome>,
 *    define source_type/metadata/tag da ponte;
 *  - tipo con â†’ source_type contagem-sacos quando o campo estÃ¡ vazio;
 *  - o POST continua o MESMO contrato (POST /streams).
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
}));
jest.mock('@/lib/config/runtime', () => ({
  carregarConfig: jest.fn().mockResolvedValue({ mapboxToken: null }),
}));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => (
    <div data-testid="map-picker-stub" />
  ),
}));
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockProbe = jest.fn();
jest.mock('@/lib/api/cctv', () => ({
  ...jest.requireActual('@/lib/api/cctv'),
  Cctv: {
    ...jest.requireActual('@/lib/api/cctv').Cctv,
    presets: jest.fn().mockResolvedValue([]),
    streams: {
      ...jest.requireActual('@/lib/api/cctv').Cctv.streams,
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      test: jest.fn(),
    },
    bridge: {
      probe: (...a: unknown[]) => mockProbe(...a),
    },
  },
}));
jest.mock('@/lib/api', () => ({
  Edge: {
    discovered: jest.fn().mockResolvedValue([]),
  },
}));

import { RegisterCameraModal } from '@/components/cameras/register-camera-modal';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'novo' });
});

function renderModal() {
  return render(
    <RegisterCameraModal onClose={jest.fn()} onCreated={jest.fn()} />,
  );
}

async function preencherMinimo() {
  await waitFor(() => expect(screen.getByTestId('reg-name')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('reg-name'), {
    target: { value: 'Linha 2' },
  });
}

test('tipo CON â†’ tags bc-ready + contagem-sacos; troca para OCR limpa a tag', async () => {
  await act(async () => {
    renderModal();
  });
  await preencherMinimo();
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'http://contagem-sacos:8050/v1/ao-vivo' },
  });

  fireEvent.change(screen.getByTestId('reg-tipo'), { target: { value: 'con' } });
  const tags = screen.getByTestId('reg-tags') as HTMLInputElement;
  expect(tags.value).toContain('bc-ready');
  expect(tags.value).toContain('contagem-sacos');

  fireEvent.change(screen.getByTestId('reg-tipo'), { target: { value: 'ocr' } });
  expect((screen.getByTestId('reg-tags') as HTMLInputElement).value).toContain('ocr');
  expect((screen.getByTestId('reg-tags') as HTMLInputElement).value).not.toContain('bc-ready');
});

test('tipo CON define source_type contagem-sacos e envia o POST', async () => {
  await act(async () => {
    renderModal();
  });
  await preencherMinimo();
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'http://contagem-sacos:8050/v1/ao-vivo' },
  });
  fireEvent.change(screen.getByTestId('reg-tipo'), { target: { value: 'con' } });

  fireEvent.click(screen.getByTestId('reg-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  const body = mockCreate.mock.calls[0][0];
  expect(body.source_type).toBe('contagem-sacos');
  expect(body.tags).toContain('bc-ready');
  expect(body.tags).toContain('contagem-sacos');
});

test('tipo CON demo → mesmas tags com aviso de demonstração', async () => {
  await act(async () => {
    renderModal();
  });
  await preencherMinimo();
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'http://contagem-sacos:8050/v1/ao-vivo' },
  });
  fireEvent.change(screen.getByTestId('reg-tipo'), {
    target: { value: 'con-demo' },
  });
  const tags = screen.getByTestId('reg-tags') as HTMLInputElement;
  expect(tags.value).toContain('bc-ready');
  expect(tags.value).toContain('contagem-sacos');
  expect(screen.getByText('cameras.tipoConDemoHint')).toBeInTheDocument();

  fireEvent.click(screen.getByTestId('reg-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(mockCreate.mock.calls[0][0].source_type).toBe('contagem-sacos');
});

test('fonte AEGIS Bridge monta a URL rtsp e carimba source/metadata/tag', async () => {
  await act(async () => {
    renderModal();
  });
  await preencherMinimo();

  fireEvent.change(screen.getByTestId('reg-fonte'), { target: { value: 'bridge' } });
  fireEvent.change(screen.getByTestId('reg-bridge-host'), {
    target: { value: '100.67.168.26' },
  });
  fireEvent.change(screen.getByTestId('reg-bridge-name'), {
    target: { value: 'Linha 1' },
  });

  const url = screen.getByTestId('reg-url') as HTMLInputElement;
  expect(url.value).toBe('rtsp://100.67.168.26:8554/Linha_1');

  fireEvent.click(screen.getByTestId('reg-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  const body = mockCreate.mock.calls[0][0];
  expect(body.source_type).toBe('aegis-bridge');
  expect(body.tags).toContain('aegis-bridge');
  expect(body.stream_metadata).toMatchObject({ source: 'aegis-bridge' });
});

test('fonte bridge: "Testar na ponte" chama o probe e mostra o veredito', async () => {
  mockProbe.mockResolvedValue({
    ok: true,
    detalhe: 'RTSP + HLS servidos pela ponte (Linha 1)',
  });
  await act(async () => {
    renderModal();
  });
  await preencherMinimo();
  fireEvent.change(screen.getByTestId('reg-fonte'), { target: { value: 'bridge' } });
  fireEvent.change(screen.getByTestId('reg-bridge-host'), {
    target: { value: '100.67.168.26' },
  });
  fireEvent.change(screen.getByTestId('reg-bridge-name'), {
    target: { value: 'Linha 1' },
  });

  fireEvent.click(screen.getByTestId('testar-ponte'));
  await waitFor(() => expect(mockProbe).toHaveBeenCalledWith('100.67.168.26', 'Linha 1'));
  expect(await screen.findByTestId('ponte-test-ok')).toBeInTheDocument();

  mockProbe.mockResolvedValue({ ok: false, detalhe: "câmera 'x' não está na ponte" });
  fireEvent.click(screen.getByTestId('testar-ponte'));
  expect(await screen.findByTestId('ponte-test-erro')).toBeInTheDocument();
});

test('fonte ip NÃO renderiza a caixa de ponte; fonte bridge renderiza', async () => {
  await act(async () => {
    renderModal();
  });
  await preencherMinimo();
  expect(screen.queryByTestId('reg-bridge-box')).not.toBeInTheDocument();
  fireEvent.change(screen.getByTestId('reg-fonte'), { target: { value: 'bridge' } });
  expect(screen.getByTestId('reg-bridge-box')).toBeInTheDocument();
});

test('URL já registrada (reusado) + tipo escolhido: o tipo VALE — PATCH no registro existente', async () => {
  // 12/09/2026: o operador escolhia o tipo no modal e a câmera já registrada
  // seguia com a receita antiga (o registro era reusado sem PATCH) → worker
  // rodava o modelo errado para sempre, sem caminho de UI para corrigir.
  mockCreate.mockResolvedValue({ id: 's1', name: 'WebCam USB', reusado: true });
  mockUpdate.mockResolvedValue({
    id: 's1', name: 'WebCam USB', tags: ['bc-ready', 'contagem-sacos'],
  });
  await act(async () => {
    render(<RegisterCameraModal onClose={jest.fn()} onCreated={jest.fn()} />);
  });
  await waitFor(() => expect(screen.getByTestId('reg-name')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('reg-name'), { target: { value: 'WebCam USB' } });
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'rtsp://100.67.168.26:8554/ec2u200' },
  });
  fireEvent.change(screen.getByTestId('reg-tipo'), { target: { value: 'con-demo' } });

  fireEvent.click(screen.getByTestId('reg-submit'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  const [id, patch] = mockUpdate.mock.calls[0] as [string, Record<string, unknown>];
  expect(id).toBe('s1');
  expect(patch.tags).toEqual(expect.arrayContaining(['bc-ready', 'contagem-sacos']));
  expect((patch.stream_metadata as Record<string, unknown>).contagem).toMatchObject({
    modelo: 'coco',
  });
  expect(await screen.findByTestId('reg-tipo-aplicado')).toBeInTheDocument();
});

test('URL já registrada (reusado): modal NÃO fecha — avisa e deixa decidir', async () => {
  mockCreate.mockResolvedValue({ id: 's1', name: 'Intelbras Demo', reusado: true });
  const onCreated = jest.fn();
  await act(async () => {
    render(<RegisterCameraModal onClose={jest.fn()} onCreated={onCreated} />);
  });
  await waitFor(() => expect(screen.getByTestId('reg-name')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('reg-name'), { target: { value: 'Outra' } });
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'rtsp://100.126.183.36:8554/intelbras_demo' },
  });
  fireEvent.click(screen.getByTestId('reg-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(await screen.findByTestId('reg-reusado')).toBeInTheDocument();
  expect(onCreated).not.toHaveBeenCalled();
  // o botão vira "Fechar" (não re-registrar em loop)
  expect(screen.getByTestId('reg-fechar-reusado')).toBeInTheDocument();
});
