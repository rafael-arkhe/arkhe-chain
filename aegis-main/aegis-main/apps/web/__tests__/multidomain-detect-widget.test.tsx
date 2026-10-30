/**
 * Widget multidomain_detect — versão componível (Workshop) do gesto de análise
 * multidomínio hospedada (2026-06-17). ADD ao lado do modal da /cameras.
 *
 * Invariantes:
 *  - meta registrada (grupo 'data', label, mock*, config_schema com domínio +
 *    refs de quadro/câmera);
 *  - entrada no widget-catalog.json (paridade registry ↔ catálogo);
 *  - SOBERANIA: o botão fica travado até o opt-in EXPLÍCITO de egress;
 *  - run chama Cctv.multidomain.detect com allow_cloud_egress=true + frame_object
 *    (do ref) + camera_stream_id (do ref, geo-âncora) e emite success.
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api/cctv', () => ({
  __esModule: true,
  Cctv: { multidomain: { domains: jest.fn(), detect: jest.fn() } },
}));

import { Cctv } from '@/lib/api/cctv';
import { getWidgetComponent, getWidgetMeta } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets/multidomain-detect';

const domainsFn = Cctv.multidomain.domains as jest.Mock;
const detectFn = Cctv.multidomain.detect as jest.Mock;

const DOMAIN = {
  domain: 'fogo_fumaca', domain_label: 'Fogo / fumaça', workspace_project: 'x/y',
  endpoint: 'https://s/x/3', version: '3', type: 'object-detection',
  classes: ['fire', 'smoke'], has_hosted_model: true, license: 'CC BY 4.0',
  commercial_ok: true, data_egress: 'roboflow_cloud', recommended_use: 'demo-eval',
  metric: {}, is_replacement: true, coverage_note: 'fogo + fumaça', live_verified_at: '2026-06-16',
};

beforeEach(() => {
  domainsFn.mockReset();
  detectFn.mockReset();
  domainsFn.mockResolvedValue({ domains: [DOMAIN] });
});

function renderWidget(config: Record<string, unknown>, variables: Record<string, unknown>) {
  const Comp = getWidgetComponent('multidomain_detect')!;
  const emit = jest.fn();
  render(
    <Comp appId="t" config={config} variables={variables} bindings={{}}
          setBinding={() => {}} emit={emit} />,
  );
  return { emit };
}

it('registra meta (grupo data, config_schema com domínio + refs)', () => {
  const meta = getWidgetMeta('multidomain_detect')!;
  expect(meta).toBeTruthy();
  expect(meta.group).toBe('data');
  expect(meta.mockConfig).toBeTruthy();
  expect(meta.mockVariables).toBeTruthy();
  const names = (meta.config_schema ?? []).map((f) => f.name);
  expect(names).toEqual(expect.arrayContaining(['domain', 'frame_object_ref', 'camera_stream_ref']));
  const dom = meta.config_schema?.find((f) => f.name === 'domain');
  expect(dom?.field).toBe('select');
});

it('tem entrada no widget-catalog.json (paridade registry ↔ catálogo)', () => {
  const p = path.join(process.cwd(), 'lib', 'workshop', 'widget-catalog.json');
  const catalog = JSON.parse(fs.readFileSync(p, 'utf-8')) as { type: string; category: string; proposable: boolean }[];
  const e = catalog.find((x) => x.type === 'multidomain_detect');
  expect(e).toBeTruthy();
  expect(e!.category).toBe('event_nav');
  expect(e!.proposable).toBe(false); // egress → colocação deliberada, não auto-proposta
});

it('SOBERANIA: botão travado até o opt-in; run manda egress+frame+camera', async () => {
  detectFn.mockResolvedValue({
    ok: true, domain: 'fogo_fumaca', status: 200, predictions: 1, events: ['ev-1'],
    model: 'x/3', data_egress: 'roboflow_cloud', recommended_use: 'demo-eval',
    is_replacement: true, coverage_note: null, error: null,
  });
  const { emit } = renderWidget(
    { frame_object_ref: 'fo', camera_stream_ref: 'cs' },
    { fo: 'frame123.jpg', cs: 'cam-1' },
  );
  await waitFor(() => expect(domainsFn).toHaveBeenCalled());

  const run = screen.getByTestId('multidomain-detect-run') as HTMLButtonElement;
  expect(run.disabled).toBe(true); // sem opt-in

  fireEvent.click(screen.getByTestId('multidomain-detect-optin'));
  expect(run.disabled).toBe(false);

  fireEvent.click(run);
  await waitFor(() => expect(detectFn).toHaveBeenCalledTimes(1));
  expect(detectFn).toHaveBeenCalledWith({
    domain: 'fogo_fumaca', frame_object: 'frame123.jpg',
    camera_stream_id: 'cam-1', allow_cloud_egress: true,
  });
  await screen.findByTestId('multidomain-detect-result');
  await waitFor(() =>
    expect(emit).toHaveBeenCalledWith('multidomain.detect.success', expect.objectContaining({ domain: 'fogo_fumaca' })),
  );
});

it('sem quadro (ref não resolve): estado honesto + run bloqueado', async () => {
  renderWidget({ frame_object_ref: 'fo' }, {}); // fo ausente em variables
  await waitFor(() => expect(domainsFn).toHaveBeenCalled());
  expect(screen.getByTestId('multidomain-detect-noframe')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('multidomain-detect-optin'));
  expect((screen.getByTestId('multidomain-detect-run') as HTMLButtonElement).disabled).toBe(true);
  expect(detectFn).not.toHaveBeenCalled();
});
