# Arkhe • Gravity Run

Estrutura inicial de Shmup mobile 2D em Godot 4, independente das demais apps.
Abra `project.godot` e execute F6/F5. Sem plugins ou assets externos.

O briefing seguinte em Unity foi implementado separadamente em
[`../arkhe-shmup-unity`](../arkhe-shmup-unity/README.md), com pool, controle
relativo e gerador de benchmark de 500 projéteis. Este protótipo foi preservado.

## Entregas

- `scripts/fixed_pool.gd`: slots e free-list prealocados para tiros aliados,
  inimigos, partículas, naves e scrap. Pool cheio descarta spawn e conta falhas.
- `scripts/relative_drag.gd`: arraste relativo, offset vertical configurável,
  identificação de toque e gesto rápido para trás (baixo na tela).
- `scripts/game.gd`: loop a 60 Hz, auto-fire, absorção recarregável, dash
  invulnerável de 1,5 s com mundo a 25%, coleta e derrota/reinício.
- `scripts/spatial_grid.gd`: grade fixa para colisões tiro/inimigo;
  consultas de projétil/jogador são O(N) com único alvo, sem pares N².
- `scripts/monetization.gd` e `docs/monetization.md`: modelos de apresentação,
  política de multiplicadores e diagrama de classes.
- `backend`: portas Rust de validação e ledger, testes negativos, SQL RLS.
- `docs/validation-contract.md` e `docs/completion.schema.json`: protocolo
  proposto de ticket, replay, concessão idempotente e integrações Arkhe.

## Controles

Arraste a nave com um dedo ou mouse. Deslize 90 px para baixo em até 220 ms
para dash (Shift no desktop). Botão ABSORVER ou Espaço ativa campo por 2,5 s,
cooldown 9 s. Arma dispara continuamente. Scrap verde soma coleta local.
Perda de foco pausa a simulação e cancela o contato; retorno retoma.

## Limites explícitos

É um protótipo inicial, não um jogo pronto para lojas. Não há compras reais,
ad SDK, ressurreição, bosses, ondas autoritativas, Hangar, escudo regenerativo,
árvore de upgrades nem temporadas persistidas. Pontos exibidos são prévia local;
o contador de cinco abates usado nessa prévia é apenas uma aproximação de onda.
Nenhum crédito é transmitido ao backend. Adapters Rust são obrigatórios e não
têm implementação permissiva de fallback. Integrações WASM, Arkhe, Passport,
AKG-CBOR/MMR e replay determinístico ainda precisam ser implementadas.

## Performance e exportação

Capacidades: 192 tiros aliados, 1024 hostis, 48 inimigos, 256 partículas,
128 scrap. Não há criação/destruição de nós ou crescimento de pools no loop.
UI e desenhos ainda usam trabalho da engine; não se promete zero alocações
internas ou 60 FPS sem medir em aparelho. Colisões são círculos a 60 Hz;
velocidades atuais limitam deslocamentos por tick. Novas armas rápidas exigem
colisão varrida. Renderização em ordem fundo → partículas → inimigos → jogador
e tiros aliados → tiros hostis; UI em CanvasLayer.

Compatibility é o perfil padrão conservador. Perfil moderno deve ser exportado
e validado com Mobile/Vulkan ou Metal compatível com a versão escolhida;
fallback não está validado neste scaffold. Glow é simulado por círculos de
baixo alpha no protótipo, sem HDR. Referência oficial:
[renderers Godot](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html).

Assets finais: atlas pequenos, ASTC moderno e ETC2 legado em builds adequados;
não há texturas neste scaffold. Configurar presets Android/iOS, templates,
SDKs e assinatura fora do repositório. Android AAB e iOS exigem validação
própria ([export Android](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html)).
Meta de 30–60 MB depende de templates customizados, stripping, assets e áudio.
Não foi gerado APK/IPA e nenhum tamanho/FPS de dispositivo foi certificado.

Aceitação de produção: sessão de 30 min em Android de entrada/intermediário
e iPhone suportado, p99 de frame <=16,67 ms, sem aumento de pools, 300/600/1000
projéteis, 100 reinícios, alternância de foco, safe-area, multitouch, térmica
e consumo. Medir alocações e custo de desenho antes de migrar a MultiMesh.
Rádio e áudio devem fazer streaming/preload no Hangar, sem cutscenes em ação.

## Verificação

`cargo test --manifest-path backend/Cargo.toml` verifica rejeição de resumo
forjado, seed incorreta, prova ausente e duração excessiva, além de cálculo
de recompensa. Não verifica adaptadores externos nem SQL em PostgreSQL.
`godot --headless --path . --editor --quit` importa/verifica os scripts.
`godot --headless --path . --script tests/pool_test.gd` verifica os pools,
grade, arraste e modelos. `godot --headless --path . --script tests/game_test.gd`
exercita absorção, dash, densidade, derrota e reinício.
Consulte `docs/verification.md` para resultados.
