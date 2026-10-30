require('@testing-library/jest-dom');

// ── Isolamento entre arquivos de teste (anti-flaky) ──────────────────────
// Várias suítes fazem `global.fetch = jest.fn()` e nem todas restauram. Como
// o jest reusa o mesmo processo-worker entre arquivos, um fetch mockado
// vazava pro arquivo seguinte (ex.: pipelines-page passava isolado mas
// falhava no full-run — era VÍTIMA do vazamento de outra suíte).
//
// `setupFilesAfterEach` roda ANTES do módulo do arquivo de teste ser avaliado,
// então o PRIMEIRO arquivo do worker captura o fetch realmente pristino
// (jsdom não implementa fetch → normalmente undefined). Guardamos em globalThis
// (persiste no worker) e restauramos ao fim de CADA arquivo.
if (!('__PRISTINE_FETCH__' in globalThis)) {
  globalThis.__PRISTINE_FETCH__ = global.fetch;
}

afterAll(() => {
  global.fetch = globalThis.__PRISTINE_FETCH__;
});

afterEach(() => {
  // Belt-and-suspenders: se alguma suíte deixar fake timers ligados, desliga
  // antes do próximo teste (waitFor depende de timers reais).
  jest.useRealTimers();
});
