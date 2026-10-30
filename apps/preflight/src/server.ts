import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { solanaApi } from './solana-api';
import {join} from 'node:path';

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

app.use(express.json({limit: '25mb'}));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Arkhe Preflight v23 Provenance Engine',
    version: '23',
    releaseDate: '2026-10-11'
  });
});

app.get('/api/script/download', (req, res) => {
  const scriptPath = join(process.cwd(), 'arkhe_preflight_v23.py');
  res.download(scriptPath, 'arkhe_preflight_v23.py');
});

app.use('/api', solanaApi(process.env['ARKHE_SOLANA_RPC_ALLOWLIST']));

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
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 3000;
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
