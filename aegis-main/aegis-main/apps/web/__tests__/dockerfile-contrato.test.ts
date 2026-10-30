/**
 * @jest-environment node
 */
/**
 * Contrato da imagem do security-app (F1.2).
 *
 * O build de verdade só roda no runner do CI (esta máquina não builda). O que
 * dá para travar aqui é o CONTRATO — as propriedades que, se quebradas, fazem
 * a imagem voltar a ser uma-por-cliente ou a caixa voltar a buildar no boot.
 * São exatamente os erros que passariam despercebidos numa revisão.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..');
const dockerfile = readFileSync(join(RAIZ, 'Dockerfile'), 'utf8');
const dockerignore = readFileSync(join(RAIZ, '.dockerignore'), 'utf8');
const nextConfig = readFileSync(join(RAIZ, 'next.config.mjs'), 'utf8');

const linhas = dockerfile
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

// ── O que torna UMA imagem servir N clientes ───────────────────────────────

test('nenhum NEXT_PUBLIC_* é injetado como ENV no build (seria inlinado no bundle)', () => {
  const envs = linhas.filter((l) => /^ENV\s+NEXT_PUBLIC_/i.test(l));
  expect(envs).toEqual([]);
});

test('os NEXT_PUBLIC_* de mapa são declarados como ARG só para serem RECUSADOS', () => {
  // Sem declarar, o Docker ignora o --build-arg em silêncio e a guarda nunca dispara.
  expect(dockerfile).toMatch(/ARG\s+NEXT_PUBLIC_MAPBOX_TOKEN=""/);
  expect(dockerfile).toMatch(/ARG\s+NEXT_PUBLIC_CESIUM_ION_TOKEN=""/);
  // E a guarda tem de abortar o build.
  expect(dockerfile).toMatch(/\$\{NEXT_PUBLIC_MAPBOX_TOKEN\}\$\{NEXT_PUBLIC_CESIUM_ION_TOKEN\}/);
  expect(dockerfile).toMatch(/exit 1/);
});

test('o contexto do build não carrega arquivo .env (o Next carregaria e inlinaria)', () => {
  expect(dockerignore).toMatch(/^\.env$/m);
  expect(dockerignore).toMatch(/^\.env\.\*$/m);
  // A guarda no Dockerfile é a segunda barreira.
  expect(dockerfile).toMatch(/\.env\.local/);
});

// ── O que faz a caixa NÃO buildar no boot ─────────────────────────────────

test('a imagem é standalone e roda o server.js pronto (não `next build` no boot)', () => {
  expect(nextConfig).toMatch(/output:\s*'standalone'/);
  expect(dockerfile).toMatch(/CMD \["node", "server\.js"\]/);
  // Asserções sobre DIRETIVAS, não sobre a prosa dos comentários (que cita
  // justamente o comportamento antigo que estamos proibindo).
  expect(linhas.filter((l) => /^CMD .*next (build|start)/.test(l))).toEqual([]);
  expect(linhas.filter((l) => /npm install/.test(l))).toEqual([]);
});

test('standalone exige copiar public/ e .next/static à mão — os dois estão lá', () => {
  expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/\.next\/standalone \.\//);
  expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/\.next\/static \.\/\.next\/static/);
  expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/public \.\/public/);
});

test('os assets do Cesium entram como ARQUIVO, não como o symlink de desenvolvimento', () => {
  expect(dockerfile).toMatch(/COPY --from=builder .*node_modules\/cesium\/Build\/Cesium \.\/public\/cesium/);
  // E o symlink do host fica fora do contexto, senão a cópia acima o sobrescreveria.
  expect(dockerignore).toMatch(/^public\/cesium$/m);
});

// ── Detalhes que já morderam esta casa ─────────────────────────────────────

test('o build usa --legacy-peer-deps (React 19 tem peers não resolvidos)', () => {
  expect(dockerfile).toMatch(/npm ci --legacy-peer-deps/);
});

test('o heap do Node é ampliado no build (o `next build` daqui estoura o default)', () => {
  expect(dockerfile).toMatch(/NODE_OPTIONS=--max-old-space-size=3072/);
});

test('NODE_ENV=production só no runtime — no build ele omitiria o typescript', () => {
  // Sem typescript o Next não lê os `paths` do tsconfig e os aliases @/* quebram.
  const iRunner = linhas.findIndex((l) => /^FROM .* AS runner$/.test(l));
  expect(iRunner).toBeGreaterThan(0);

  const noBuild = linhas.slice(0, iRunner).filter((l) => /NODE_ENV=production/.test(l));
  expect(noBuild).toEqual([]);

  const noRuntime = linhas.slice(iRunner).filter((l) => /^ENV NODE_ENV=production$/.test(l));
  expect(noRuntime).toHaveLength(1);
});

test('não roda como root', () => {
  expect(dockerfile).toMatch(/^USER node$/m);
});

// ── Rótulo OCI que o aegis-update.sh lê ───────────────────────────────────

test('carimba org.opencontainers.image.version (o executor de update lê este rótulo)', () => {
  expect(dockerfile).toMatch(/ARG AEGIS_VERSION=/);
  expect(dockerfile).toMatch(/org\.opencontainers\.image\.version="\$\{AEGIS_VERSION\}"/);
});

test('a porta declarada é a mesma que o compose publica (3002)', () => {
  expect(dockerfile).toMatch(/ENV PORT=3002/);
  expect(dockerfile).toMatch(/^EXPOSE 3002$/m);
});

test('escuta em 0.0.0.0 — o default do standalone é localhost e o compose não alcançaria', () => {
  expect(dockerfile).toMatch(/ENV HOSTNAME=0\.0\.0\.0/);
});

// ── Higiene do contexto ───────────────────────────────────────────────────

test('.dockerignore existe e barra o node_modules e o .next do host', () => {
  expect(existsSync(join(RAIZ, '.dockerignore'))).toBe(true);
  expect(dockerignore).toMatch(/^node_modules$/m);
  expect(dockerignore).toMatch(/^\.next$/m);
});
