/**
 * Configuração de RUNTIME do security-app (F1.2 do plano de frota).
 *
 * ## Por que esta camada existe
 *
 * Os tokens de mapa vinham de `NEXT_PUBLIC_MAPBOX_TOKEN` /
 * `NEXT_PUBLIC_CESIUM_ION_TOKEN`. O Next **inlina** qualquer `NEXT_PUBLIC_*` no
 * bundle JavaScript durante o `next build` — o valor vira literal dentro do
 * `.js` servido. Consequência: cada cliente precisava do SEU build, e por isso
 * a borda buildava a aplicação no primeiro boot (~10 min) em vez de baixar uma
 * imagem pronta.
 *
 * Aqui o token passa a ser lido em tempo de EXECUÇÃO, de `/api/config`, que lê
 * a env do processo do servidor. Uma imagem, N clientes: quem muda é a env do
 * container.
 *
 * ## Precedência (deliberada)
 *
 * `NEXT_PUBLIC_*`, se presente, **vence e curto-circuita a rede**. Não é
 * inconsistência — é o escape hatch de desenvolvimento: `npm run dev` com
 * `.env.local` e as suítes de jest continuam funcionando sem servidor de
 * config, e sem disparar fetch que colidiria com os `global.fetch` mockados das
 * suítes. Na imagem de produção essas variáveis **não existem** (o Dockerfile
 * não as aceita como build-arg e o .dockerignore barra `.env*`), então o
 * caminho real é sempre a rota.
 *
 * ## Degradação
 *
 * Config nunca derruba tela: qualquer falha (rede fora, 500, JSON estranho)
 * resolve para {@link CONFIG_VAZIA} e o componente de mapa mostra o seu próprio
 * aviso de "token ausente". Falha não é cacheada — a chamada seguinte tenta de
 * novo, senão um blip de rede no primeiro paint condenaria a sessão inteira.
 */
import * as React from 'react';

export interface RuntimeConfig {
  /** Token público do Mapbox GL (mapas 2D: /geo, /buscar, construtor, visitante). */
  mapboxToken: string;
  /** Token do Cesium Ion (globo 3D). Sem ele o /geo cai pra ellipsoid plano. */
  cesiumIonToken: string;
}

export const CONFIG_VAZIA: RuntimeConfig = Object.freeze({
  mapboxToken: '',
  cesiumIonToken: '',
});

export const ROTA_CONFIG = '/api/config';

let emVoo: Promise<RuntimeConfig> | null = null;

/** Só para testes: esquece o que já foi resolvido. */
export function resetarConfigCache(): void {
  emVoo = null;
}

function texto(v: unknown): string | null {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v : null;
}

/** Valida a forma do que o servidor devolveu — JSON alheio não vira config. */
export function normalizarConfig(bruto: unknown): RuntimeConfig | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const obj = bruto as Record<string, unknown>;
  const mapboxToken = texto(obj.mapboxToken);
  const cesiumIonToken = texto(obj.cesiumIonToken);
  if (mapboxToken === null || cesiumIonToken === null) return null;
  return { mapboxToken, cesiumIonToken };
}

/** Escape hatch de build. `null` quando nenhuma NEXT_PUBLIC_* foi definida. */
function doAmbienteDeBuild(): RuntimeConfig | null {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  const cesiumIonToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || '';
  if (!mapboxToken && !cesiumIonToken) return null;
  return { mapboxToken, cesiumIonToken };
}

async function buscarNoServidor(): Promise<RuntimeConfig> {
  if (typeof fetch !== 'function') return CONFIG_VAZIA;
  try {
    const res = await fetch(ROTA_CONFIG, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return CONFIG_VAZIA;
    return normalizarConfig(await res.json()) ?? CONFIG_VAZIA;
  } catch {
    return CONFIG_VAZIA;
  }
}

/**
 * Config de runtime, memoizada. Concorrentes compartilham a MESMA promise —
 * dez componentes de mapa montando juntos fazem uma requisição, não dez.
 */
export function carregarConfig(): Promise<RuntimeConfig> {
  if (emVoo) return emVoo;

  const doBuild = doAmbienteDeBuild();
  if (doBuild) {
    emVoo = Promise.resolve(doBuild);
    return emVoo;
  }

  const promessa = buscarNoServidor().then((cfg) => {
    // Config vazia = ninguém configurou OU a busca falhou. Nos dois casos vale
    // tentar de novo no próximo montante: só o sucesso merece cache.
    if (cfg === CONFIG_VAZIA && emVoo === promessa) emVoo = null;
    return cfg;
  });
  emVoo = promessa;
  return promessa;
}

/**
 * Config no React. Devolve `null` enquanto carrega — quem consome DEVE
 * distinguir "ainda não sei" de "não tem token", senão a tela pisca um erro de
 * token ausente antes da resposta chegar.
 */
export function useRuntimeConfig(): RuntimeConfig | null {
  const [cfg, setCfg] = React.useState<RuntimeConfig | null>(null);

  React.useEffect(() => {
    let cancelado = false;
    void carregarConfig().then((c) => {
      if (!cancelado) setCfg(c);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  return cfg;
}

/** `null` = carregando · `''` = confirmadamente ausente · resto = o token. */
export function useMapboxToken(): string | null {
  const cfg = useRuntimeConfig();
  return cfg === null ? null : cfg.mapboxToken;
}

/** `null` = carregando · `''` = confirmadamente ausente · resto = o token. */
export function useCesiumIonToken(): string | null {
  const cfg = useRuntimeConfig();
  return cfg === null ? null : cfg.cesiumIonToken;
}
