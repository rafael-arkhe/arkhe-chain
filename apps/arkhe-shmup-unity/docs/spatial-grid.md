# Colisão por grade espacial

`SpatialCircleGrid` indexa centros de alvos circulares em listas encadeadas
por índices. Os arrays de cabeças, próximos, posições, raios e máscaras são
alocados uma vez no construtor. `Clear`, `Insert` e `FirstHit` não criam
coleções. Exaustão, IDs repetidos, centros fora dos limites ou raio acima do
máximo rejeitam a inserção e incrementam `RejectedInserts`.

Por tick: limpar/reconstruir a grade com um snapshot dos alvos, avançar cada
projétil e consultar seu segmento entre a posição anterior e a atual. A busca
expande o AABB do segmento pelo raio do projétil + maior raio permitido de alvo,
incluindo alvos em células vizinhas. A narrow-phase calcula o primeiro contato
segmento/círculo expandido. Contatos empatados escolhem menor ID de alvo.

```csharp
// Prewarm
var grid = new SpatialCircleGrid(16, 32, 64, 0.22f, -4, -8, 4, 8);

// Simulação: EnemyLayer=1. Os IDs são slots estáveis do pool de alvos.
grid.Clear();
grid.Insert(enemySlot, enemyX, enemyY, 0.22f, 1);
int hit = grid.FirstHit(oldX, oldY, newX, newY, 0.04f, 1, out float t);
if (hit >= 0)
    pool.Return(bullet, bullet.Lease);
```

O trecho ilustra o fluxo; posições e entidades vêm do jogo. A integração
completa está em `BenchmarkWorld.FixedUpdate`. Alvos removidos/movidos exigem
atualização do snapshot antes de novas consultas. Para movimento contínuo de
ambos os corpos, usar deslocamento relativo ou outra narrow-phase apropriada;
o algoritmo atual trata o alvo como estático no snapshot daquele tick.

## Pares permitidos

| Projétil | Alvo permitido | Caminho |
|---|---|---|
| Aliado | Inimigo | Grade de inimigos + máscara EnemyLayer |
| Hostil | Jogador | Futuro teste direto O(N) contra o único jogador |
| Qualquer tiro | Outro tiro | Sem consulta |
| Aliado | Jogador | Sem consulta |

Máscaras são do núcleo matemático; não dependem da matriz Physics2D. Se
adicionar colliders de engine futuramente, configurar também a matriz de
layers para não executar os mesmos pares duas vezes.

500 tiros contra um único jogador requerem somente 500 testes diretos, não
500² pares. A grade beneficia principalmente muitos projéteis contra muitos
alvos. Em aglomeração extrema, o pior caso ainda pode se aproximar de força
bruta; segmentos longos também cruzam mais células. Instrumentar candidatos,
contatos e inserções rejeitadas, e ajustar células conforme densidade real.

Mantido timestep de 60 Hz. Reduzir frequência sem analisar velocidade e
contato pode aumentar tunneling e latência. A varredura trata tiros que
atravessam alvos entre ticks, mas não transforma float em simulação autoritativa
determinística entre plataformas. O replay Rust/WASM segue sendo outra etapa.

## Verificação

18 verificações novas cobrem fronteiras de células, tangência, máscaras,
zero deslocamento, tiro rápido, primeiro contato, empate, resize, entradas
inválidas e comparação com referência independente de força bruta.

600 projéteis × 100 ticks, 64 alvos: presença de colisão coincidiu com a
referência; nessa distribuição local, foram examinados menos de 25% dos
candidatos da força bruta. Esse percentual não é uma promessa para toda cena.
Reconstrução + 600000 consultas: zero bytes gerenciados alocados no loop medido
em .NET 8. O núcleo também compilou em .NET Standard 2.1 sem avisos.
Execução Unity, IL2CPP e frame time em celular permanecem pendentes.
