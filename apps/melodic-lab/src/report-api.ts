import express from 'express';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reportPreimage } from './app/services/report-integrity.ts';

export function reportApi(directory: string) {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/', async (req, res, next) => {
    try {
      const origin = req.headers.origin;
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
        res.status(403).json({ error: 'Origem não permitida.' }); return;
      }
      const report = req.body;
      if (!report || typeof report !== 'object' || Array.isArray(report) ||
          typeof report.generated_at !== 'string' || !Number.isFinite(Date.parse(report.generated_at)) ||
          ![report.target_a, report.target_b].every(target => target && typeof target.title === 'string' && target.title.length <= 500) ||
          !report.similarity?.melodic || typeof report.similarity.melodic.similarity?.score !== 'number' || report.similarity.melodic.similarity.score < 0 || report.similarity.melodic.similarity.score > 1) {
        res.status(400).json({ error: 'Relatório inválido.' }); return;
      }
      // This is a stored client analysis, never an attestation by this server.
      const body = { ...report, storage_provenance: 'client_analysis_unverified' };
      const id = createHash('sha256').update(reportPreimage(body)).digest('hex');
      const saved = { ...body, report_hash: id };
      await mkdir(directory, { recursive: true });
      // Complete immutable contents are written before the entry is discoverable.
      const temporary = join(directory, `${id}.${crypto.randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(saved), { flag: 'wx', mode: 0o600 });
      const { rename } = await import('node:fs/promises');
      await rename(temporary, join(directory, id + '.json'));
      res.status(201).json({ id, report: saved });
    } catch (error) { next(error); }
  });
  router.get('/', async (_req, res, next) => {
    try {
      await mkdir(directory, { recursive: true });
      const files = (await readdir(directory)).filter(file => /^[a-f0-9]{64}\.json$/.test(file));
      const reports = await Promise.all(files.map(async file => {
        const report = JSON.parse(await readFile(join(directory, file), 'utf8'));
        return { id: file.slice(0, -5), generated_at: report.generated_at, title: report.target_a.title + ' × ' + report.target_b.title };
      }));
      res.json(reports.sort((a, b) => b.generated_at.localeCompare(a.generated_at)).slice(0, 100));
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.id)) { res.status(400).json({ error: 'Identificador inválido.' }); return; }
    try {
      const report = JSON.parse(await readFile(join(directory, req.params.id + '.json'), 'utf8'));
      if (createHash('sha256').update(reportPreimage(report)).digest('hex') !== req.params.id) {
        res.status(409).json({ error: 'Integridade do relatório inválida.' }); return;
      }
      res.json(report);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { res.status(404).json({ error: 'Relatório não encontrado.' }); return; }
      next(error);
    }
  });
  return router;
}
