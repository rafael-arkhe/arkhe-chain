/**
 * WVT — bancada de prontidão: o gate do deep training é fail-closed e o
 * operador vê o PORQUÊ (falhas por estágio, divergências de configuração).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: {
    aquecimento: {
      prontidao: jest.fn(),
      iniciar: jest.fn(),
      detalhe: jest.fn(),
      nota: jest.fn(),
      cancelar: jest.fn(),
      descartar: jest.fn(),
      artefatoUrl: (id: string, p: string) =>
        `/api/v1/contagem-aquecimento/${id}/artifacts/${p}`,
    },
  },
}));

import { Cctv } from '@/lib/api/cctv';
import { AquecimentoPanel } from '@/components/treino/aquecimento-panel';

const ac = Cctv.aquecimento as unknown as Record<string, jest.Mock>;

function pront(estado: string, extra: Record<string, unknown> = {}) {
  return {
    prontidao: {
      estado,
      config_id: 'a'.repeat(64),
      config_id_aquecimento: 'a'.repeat(64),
      aquecimento_id: estado === 'VALID' ? 'run-1' : null,
      validado_em: '2026-09-11T12:00:00Z',
      expira_em: '2026-09-14T12:00:00Z',
      divergencias: (extra.divergencias as unknown[]) ?? [],
      detalhe: '',
    },
    config_id: 'a'.repeat(64),
    plano: {},
    fonte: {
      online: true,
      modo: 'video-onnx',
      device: 'videos',
      captura: true,
      versao: '0.2.0',
      modelo_info: { arquitetura: 'yolo-ultralytics', sha256: 'b'.repeat(64) },
      fps_medido: 15,
      brilho: 80,
    },
    run: extra.run ?? null,
    artefatos: extra.artefatos ?? 0,
  };
}

function renderPanel(onProntidao = jest.fn()) {
  render(
    <AquecimentoPanel
      presetId="padrao"
      cameraId=""
      dsWorkspace=""
      dsProjeto=""
      dsVersao=""
      podeAquecer
      onProntidao={onProntidao}
    />,
  );
  return onProntidao;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('sem warm-up: deep bloqueado e botão roda o aquecimento', async () => {
  ac.prontidao.mockResolvedValue(pront('NONE'));
  ac.iniciar.mockResolvedValue({ aquecimento_id: 'run-1', config_id: 'a', pod_id: 'p1', gpu: 'L4', fonte: {}, aviso: '' });
  renderPanel();

  await waitFor(() => expect(ac.prontidao).toHaveBeenCalled());
  expect(screen.getByTestId('wvt-deep-gate').textContent).toMatch(/wvt\.deepBloqueado/);

  fireEvent.click(screen.getByTestId('wvt-rodar'));
  await waitFor(() => expect(ac.iniciar).toHaveBeenCalledTimes(1));
  expect(ac.iniciar.mock.calls[0][0].preset).toBe('padrao');
});

test('warm-up VÁLIDO: deep liberado e Configuration ID visível', async () => {
  ac.prontidao.mockResolvedValue(pront('VALID', { artefatos: 12 }));
  renderPanel();

  await waitFor(() => expect(ac.prontidao).toHaveBeenCalled());
  expect(screen.getByTestId('wvt-deep-gate').textContent).toMatch(/wvt\.deepLiberado/);
  expect(screen.getByText('wvt.estadoVALID')).toBeInTheDocument();
});

test('nota de confiança + benchmark de mercado + explicação para leigos', async () => {
  ac.prontidao.mockResolvedValue(
    pront('VALID', {
      artefatos: 58,
      run: {
        id: 'run-qual',
        kind: 'warmup',
        status: 'passed',
        config_id: 'a'.repeat(64),
        veredito: {
          passed: true,
          critical_issues: 0,
          falhas: [],
          warns: [],
          resumo: 'PROVEN READY',
          qualidade: {
            nota: 96,
            nivel: 'ALTA',
            componentes: [
              { nome: 'Fonte visual', pontos: 20, maximo: 20, detalhe: 'PASS' },
              { nome: 'Pipeline executado', pontos: 35, maximo: 35, detalhe: '15/15 PASS' },
            ],
            frase: 'Confiança ALTA: pipeline provado.',
          },
          benchmark: [
            {
              metrica: 'Contagem vs manual',
              medido: 'mede após deploy (/avaliar)',
              referencia: '≥ 99,4% (indústria 2025/26: 99,4–99,9%)',
              estado: 'PENDENTE',
              contexto: 'A prova dos 99,4% é contar e comparar com o gabarito.',
            },
            {
              metrica: 'mAP50 in-domain',
              medido: 'mede no treino profundo',
              referencia: 'mAP50 ≥ 0,95 in-domain',
              estado: 'PENDENTE',
              contexto: 'Aquecimento mede pipeline, não qualidade.',
            },
          ],
          para_leigos: {
            titulo: 'Em palavras simples',
            paragrafos: ['O aquecimento passou: o caminho inteiro rodou de verdade.'],
            glossario: [
              { termo: 'mAP50', explicacao: 'nota de 0 a 1 de quão bem o modelo acha os sacos.' },
              { termo: 'ONNX', explicacao: 'o formato do modelo que roda na linha.' },
            ],
          },
        },
      },
    }),
  );
  renderPanel();

  await waitFor(() => expect(screen.getByTestId('wvt-qualidade')).toBeInTheDocument());
  expect(screen.getByText('96')).toBeInTheDocument();
  expect(screen.getByText('ALTA')).toBeInTheDocument();
  expect(screen.getByTestId('wvt-benchmark')).toBeInTheDocument();
  expect(screen.getByText(/99,4%/)).toBeInTheDocument();
  expect(screen.getByTestId('wvt-leigo')).toBeInTheDocument();
  expect(screen.getByText('mAP50:')).toBeInTheDocument();
});

test('warm-up FALHOU: mostra as falhas por estágio (não só "training failed")', async () => {
  ac.prontidao.mockResolvedValue(
    pront('FAILED', {
      run: {
        id: 'run-9',
        kind: 'warmup',
        status: 'failed',
        config_id: 'a'.repeat(64),
        veredito: {
          passed: false,
          critical_issues: 2,
          falhas: [
            { estagio: 'Dataset', detalhe: '12% de imagens com bbox inválida' },
            { estagio: 'Storage', detalhe: 'espaço insuficiente para checkpoint' },
          ],
          warns: [{ estagio: 'Source', detalhe: 'FPS abaixo do esperado' }],
          resumo: '2 critical issue(s) detected.',
        },
      },
      artefatos: 3,
    }),
  );
  renderPanel();

  await waitFor(() => expect(screen.getByTestId('wvt-falhas')).toBeInTheDocument());
  expect(screen.getByText(/FAIL — Dataset: 12%/)).toBeInTheDocument();
  expect(screen.getByText(/WARN — Source: FPS/)).toBeInTheDocument();
  expect(screen.getByTestId('wvt-deep-gate').textContent).toMatch(/wvt\.deepBloqueado/);
});

test('divergência de configuração é mostrada campo a campo', async () => {
  ac.prontidao.mockResolvedValue(
    pront('INVALIDATED', {
      divergencias: [
        { campo: 'receita.imgsz', aquecimento: 640, atual: 512 },
      ],
    }),
  );
  renderPanel();

  await waitFor(() => expect(screen.getByTestId('wvt-divergencias')).toBeInTheDocument());
  expect(screen.getByText(/receita\.imgsz/)).toBeInTheDocument();
  expect(screen.getByTestId('wvt-deep-gate').textContent).toMatch(/wvt\.deepBloqueado/);
});

test('relatório abre com etapas e evidências visuais', async () => {
  ac.prontidao.mockResolvedValue(pront('NONE', { run: { id: 'run-1', kind: 'warmup', status: 'failed', config_id: 'a'.repeat(64), veredito: { passed: false, critical_issues: 1, falhas: [{ estagio: 'Loss', detalhe: 'NaN' }], warns: [], resumo: '1 critical issue(s) detected.' } } }));
  ac.detalhe.mockResolvedValue({
    id: 'run-1',
    kind: 'warmup',
    status: 'failed',
    config_id: 'a'.repeat(64),
    note: 'cena de bancada',
    veredito: { passed: false, critical_issues: 1, falhas: [{ estagio: 'Loss', detalhe: 'NaN' }], warns: [], resumo: '1 critical issue(s) detected.' },
    relatorio: {
      estagios: [
        { nome: 'Source', estado: 'PASS', detalhe: '30 frames' },
        { nome: 'Loss', estado: 'FAIL', detalhe: 'NaN' },
        { nome: 'Checkpoint', estado: 'NOT_EXECUTED', detalhe: '' },
      ],
      fonte: { frames_recebidos: 30, fps_observado: 5, resolucao_principal: '1280x720' },
      dataset: { total: 6200, splits: { train: 5000, val: 1200 }, sha_conteudo: 'c'.repeat(64) },
      metricas: { measured: true, loss_final: 1.2 },
      sistema: { gpu: 'NVIDIA L4', cuda_disponivel: true },
    },
    artefatos: [
      { path: 'samples/anotado/x.jpg', bytes: 1000 },
      { path: 'logs/treino.log', bytes: 5000 },
    ],
  });
  renderPanel();

  await waitFor(() => expect(screen.getByTestId('wvt-relatorio')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('wvt-relatorio'));
  await waitFor(() => expect(screen.getByTestId('wvt-relatorio-modal')).toBeInTheDocument());
  expect(screen.getAllByText('Source').length).toBeGreaterThan(0);
  expect(screen.getByText('samples/anotado/x.jpg'.replace('samples/', ''))).toBeInTheDocument();
  expect(screen.getByDisplayValue('cena de bancada')).toBeInTheDocument();
});
