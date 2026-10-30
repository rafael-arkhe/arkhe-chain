import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { reportApi } from './report-api';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({ allowedHosts: ['127.0.0.1', 'localhost'] });

app.use((req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    res.status(403).json({ error: 'Host não permitido.' }); return;
  }
  next();
});

app.use(express.json({ limit: '2mb' }));

app.use('/api/reports', reportApi(process.env['ARKHE_MELODIC_REPORT_DIR'] || join(process.cwd(), '.data', 'reports')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '11', integrations: credentialStatus() });
});
function credentialStatus() {
  return {
    acoustid: { configured: Boolean(process.env['ACOUSTID_API_KEY']), status: process.env['ACOUSTID_API_KEY'] ? 'configured' : 'not_configured' },
    acrcloud: { configured: Boolean(process.env['ACRCLOUD_TOKEN']), status: process.env['ACRCLOUD_TOKEN'] ? 'configured' : 'not_configured' },
  };
}
app.get('/api/credentials/status', (_req, res) => res.json(credentialStatus()));

app.get('/api/script', (req, res) => {
  const scriptPath = join(process.cwd(), 'arkhe_melodic_pipeline.py');
  if (existsSync(scriptPath)) {
    const content = readFileSync(scriptPath, 'utf-8');
    res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
    res.send(content);
  } else {
    res.status(404).json({ error: 'arkhe_melodic_pipeline.py not found on filesystem' });
  }
});

app.use('/api', (_req, res) => { res.status(404).json({ error: 'Endpoint não encontrado.' }); });
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (error as { status?: number }).status;
  res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({ error: status === 413 ? 'Requisição excede o limite.' : status === 400 ? 'JSON inválido.' : 'Não foi possível concluir a operação.' });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 3001;
  app.listen(Number(port), '127.0.0.1', (error) => {
    if (error) {
      throw error;
    }
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
