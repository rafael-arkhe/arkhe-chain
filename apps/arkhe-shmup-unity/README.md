# Arkhe Shmup — Unity URP

Versão Unity do passo concreto solicitado no novo briefing: Object Pooler,
Relative Drag Controller e gerador de cena com **500 projéteis hostis fixos**,
auto-fire e coleta de frame time. O protótipo Godot em `../arkhe-shmup` foi
preservado. Este benchmark não substitui a implementação completa de um jogo.

## Abrir e executar

1. No Unity Hub, adicione esta pasta. Baseline fixada: **Unity 2022.3.62f1**,
   **URP 14.0.11**, não uma afirmação de versão mais recente. SDKs e módulos
   Android/iOS devem estar disponíveis no editor. Deixe o Package Manager
   resolver o manifest antes de gerar a cena.
2. Use **Arkhe → Create Benchmark 500**. O comando cria assets, prefabs,
   pipeline URP e `Assets/Arkhe/Generated/Benchmark500Collisions.unity`, salva a cena e
   a inclui nas cenas do build. A geração preserva uma cena já existente.
   Não executar com uma cena de trabalho não salva sem atender ao diálogo.
3. Pressione **Play**. Arraste com dedo ou mouse; gesto para baixo executa
   dilatação por 1,5 s (Shift no desktop). Nave e tiros aliados usam camada
   visual intermediária; tiros hostis ficam acima. Os 500 hostis circulam sem
   parar para carga estável. Tiros aliados colidem por varredura com 64 alvos
   circulares indexados na grade; os alvos permanecem ativos para carga estável.
   Não há dano ao jogador ou absorção nesta cena.
4. Após **5 s de aquecimento + 60 s de coleta**, consulte o caminho no Console.
   JSON e CSV ficam em `Application.persistentDataPath/benchmarks`.
5. Para medir aparelhos, gere Development Build Android/iOS com a mesma cena;
   abra no dispositivo e repita. Capture também Release para comparação.
   O gerador configura Vulkan → OpenGLES3 no Android e Metal no iOS; validar
   a seleção/fallback em hardware real. iOS requer toolchain macOS/Xcode.

O Unity Editor não foi encontrado neste ambiente. O gerador, o runtime Unity,
o shader e os testes Unity estão escritos, mas **a cena ainda não foi gerada
ou executada no Unity**, e não existe resultado de frame time de dispositivo.

## Código

| Arquivo | Responsabilidade |
|---|---|
| `Assets/Arkhe/Core/FixedSlots.cs` | Free-list fixa, contagem exata, geração por lease e rejeição de retorno duplicado/antigo |
| `Assets/Arkhe/Runtime/ObjectPooler.cs` | Prewarm explícito, nenhuma criação/destruição em Spawn/Return, identidade de pool e ativação controlada |
| `Assets/Arkhe/Core/RelativeDragState.cs` | Deltas relativos, offset como limite do alvo, suavização e limite de velocidade |
| `Assets/Arkhe/Runtime/RelativeDragController.cs` | fingerId, projeção ortográfica, safe-area, mouse, gesto e cancelamento de foco |
| `Assets/Arkhe/Runtime/BenchmarkWorld.cs` | 500 hostis em movimento e tiros aliados reciclados; mundo lento sem alterar Time.timeScale global |
| `Assets/Arkhe/Core/SpatialCircleGrid.cs` | Grade de capacidade fixa, máscaras e primeiro contato por varredura círculo/segmento |
| `Assets/Arkhe/Runtime/FrameTimeRecorder.cs` | Buffers fixos de amostras, percentis e exportação após a janela medida |
| `Assets/Arkhe/Core/EntitlementSnapshot.cs` | Modelos imutáveis de assinatura, passe e VIP; cálculo apenas de prévia |
| `Assets/Arkhe/Core/MatchSubmissionGate.cs` | Portas explícitas de codec, assinatura e verificação local; ausência rejeita |

`Initialize` cria todos os objetos antes da medição: 1024 hostis, 192 tiros
aliados e 64 alvos. Exaustão devolve null; nenhum crescimento, log interpolado ou queue
redimensionável no caminho de Spawn. O estado específico da entidade atual
inclui posição, rotação, velocidade, TTL e lease. Ao adicionar partículas,
trails ou scripts a prefabs, implementar o reset/prewarm específico e medir
seus callbacks. Não usar Return em OnDisable; callbacks assíncronos devem
guardar a lease original, pois o objeto pode já ter sido reciclado.

A cena usa matemática de círculos e uma grade 16×32, sem Rigidbody/Collider.
`collisionQueries` permite comparar a carga de consultas ligadas/desligadas.
Os 500 hostis são carga de renderização/movimento; consultas da grade são dos
tiros aliados contra 64 alvos. Os testes de núcleo exercitam 600 consultas de
projétil por tick. Essa distinção evita atribuir ao Unity uma medição não feita.
Veja [detalhes de colisão](docs/spatial-grid.md).

O offset não injeta velocidade vertical. Ele restringe o alvo ao espaço acima
do dedo, respeitando as bordas. A nave acompanha com velocidade limitada;
o limite de tela ou a suavização podem impedir separação imediata em certos
toques. Câmera da cena é ortográfica, alinhada aos eixos, com plano Z=0.

## Métricas e limite das conclusões

O JSON registra hardware/API/resolução, janela, quantidade de hostis e p50,
p95, p99 e pior **intervalo entre frames**. O CSV também registra o marker
CPU `Main Thread` e `GC Allocated In Frame` do frame anterior quando disponíveis.
`-1` significa métrica indisponível, nunca zero GC. Não há medição de tempo GPU.

`frameBudgetMet` só compara p99 com 16,667 ms. Para aceitar uma execução,
exigir também janela completa, carga estável, zero interrupções e checar CPU,
GC e condições térmicas. O valor de GC inclui o processo observado, não só o
pool. Exportar CSV/JSON aloca depois da medição e fica fora da janela. Não
há UI de métricas por frame para evitar contaminar a coleta. Contadores de
contatos, candidatos e inserções rejeitadas são acumulados desde o Awake,
incluindo aquecimento; frame time e GC usam apenas a janela de coleta.

Rodar 500, 600 e 1000 hostis (Inspector, antes de Play), 3 repetições por
aparelho, sem interação para baseline; depois repetir com touch e mudanças
de foco. Rodar sessão longa de 30 min para térmica/bateria. O limite de 18000
amostras marca `sampleLimitReached`; não aceitar janela incompleta. Builds
vazios, editor e testes .NET não demonstram 60 FPS em celulares.

ASTC 6×6 é configurado para o único sprite gerado. Para legado Android,
criar perfil ETC2_RGBA8 separado e medir tamanho/memória; fallback de textura
não está automatizado. Sprite é geometria simples sem pós-processamento/HDR.
30–60 MB é meta ainda não medida; não há APK/IPA exportado.

## Arquitetura e contrato

- [Revisão do texto e correções de segurança](docs/architecture-review.md).
- [Diagrama de classes da monetização](docs/monetization.md).
- [Design do Passe de Batalha](docs/battle-pass-design.md).
- [Contrato Arkhe já criado](../arkhe-shmup/docs/validation-contract.md).
- [Orquestração Rust e ledger SQL existentes](../arkhe-shmup/backend).

Hash ou assinatura de um resumo não provam score legítimo. O servidor deve
reproduzir entradas no núcleo determinístico, consumir sessão e concessões
e registrar saldo/evidência numa transação idempotente. Float/Time/UnityEngine
do benchmark não são esse núcleo determinístico. Nenhum saldo real é concedido.
WASM nativo mobile exige runtime/bridge aprovado; codec AKG-CBOR, signers de
plataforma, replay, lojas, WormGraph/MMR e Human Passport não estão conectados.

## Testes

```powershell
dotnet run --project Tests/Core/CoreChecks.csproj --configuration Release
dotnet build Tests/Compatibility/CoreCompatibility.csproj --configuration Release
```

O primeiro executa invariantes do mesmo núcleo C# usado no Unity; o segundo
compila esse núcleo para .NET Standard 2.1. Não usam substitutos de UnityEngine.
No Unity, Test Runner → EditMode executa `ObjectPoolerTests` contra GameObjects
reais. Esses testes ainda precisam do editor para serem executados.

Automação com editor instalado (ajuste o caminho do executável):

```powershell
& $Unity -batchmode -quit -projectPath $Projeto -executeMethod Arkhe.Shmup.Editor.BenchmarkSceneBuilder.Create -logFile scene-build.log
& $Unity -batchmode -projectPath $Projeto -runTests -testPlatform EditMode -testResults editmode.xml -logFile editmode.log
```

APIs consultadas: [URP pipeline asset](https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@14.0/api/UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset.html),
[fingerId](https://docs.unity3d.com/ja/current/ScriptReference/Touch-fingerId.html),
[ProfilerRecorder](https://docs.unity3d.com/ja/current/ScriptReference/Unity.Profiling.ProfilerRecorder.html).
