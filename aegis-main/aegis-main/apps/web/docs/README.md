# security-app — Painel de Segurança Pública

> Painel-irmão do `politicians-app/`, voltado a operações de segurança pública (polícia civil/militar/federal, MP, GCM, COPOM/CIOPS).
>
> **Status:** especificação em 2026-05-16. Implementação iniciando pela PR-1 (shell + 4 rotas plenas).

## Princípio

O `security-app/` é **somente frontend**. Toda a inteligência continua no `ontology-module` da AEGIS (regra [[politicians-backend-reuse]]). O painel é um chrome próprio que:

- Apresenta-se como produto autônomo (sem branding AEGIS no operador)
- Fala apenas pt-BR (override explícito, somente para este painel)
- Reaproveita a infra de agentes via `openclaw-gateway` (mesmo container do politicians-app, multi-tenant por `.env`)
- Não fala nomes de produtos de terceiros em strings visíveis (proibido citar marcas/produtos da Palantir; nomenclatura é original em português)

## Para quem é

| Papel | Uso típico |
|---|---|
| Investigador | `/buscar`, `/ficha`, `/relatorios`, `/rede` |
| Analista | `/explorador`, `/rede`, `/geo`, `/briefings` |
| Comandante | `/` painel operacional, `/briefings`, `/alertas` |
| Operador de câmara / COPOM | `/geo`, `/cameras`, `/alertas` |
| Auditor / corregedoria | `/admin/auditoria` |

## Índice

- [`visao-geral.md`](./visao-geral.md) — posicionamento, escopo, fora-de-escopo
- [`design-system.md`](./design-system.md) — cores, tipografia, surfaces, regras
- [`shell.md`](./shell.md) — header, sidenav, paleta de comandos, classificação
- [`paginas.md`](./paginas.md) — 11 rotas em detalhe (layout, painéis, ações)
- [`arquitetura.md`](./arquitetura.md) — reuso de ontology-module e openclaw-gateway
- [`roadmap.md`](./roadmap.md) — sequência de PRs
- [`cameras-hls-intel.md`](./cameras-hls-intel.md) — HLS via intel-module · 2 câmeras SP reais · LPR/face/object
- [`cctv-ontology-bridge.md`](./cctv-ontology-bridge.md) — ponte streams + detecções → ontology (Entity Resolution)
- [`intel-module-gpu.md`](./intel-module-gpu.md) — rodar intel-module em PC com placa NVIDIA
- [`run-gpu-checklist.md`](./run-gpu-checklist.md) — passo-a-passo Windows: ipconfig, firewall, curl
- [`webcam-mini-api.md`](./webcam-mini-api.md) — encapsular `/dev/video0` USB em HLS

## Sidenav final (11 itens, sem `Canais`)

```
/                Início
/buscar          Buscar
/ficha/[id]      Ficha (acessada via /buscar)
/explorador      Explorador
/rede            Rede
/geo             Geo
/cameras         Câmeras
/alertas         Alertas
/briefings       Briefings
/relatorios      Relatórios
/admin           Administração
```

`/canais` (mensageria operador↔operador) foi descartado por decisão do operador em 2026-05-16 — comunicação operacional já é feita por canais oficiais da corporação (rádio/Tetra/SMR), redundá-la no painel não agrega.
