# Evidência de verificação — 26/10/2026

Actualização 28/10/2026: a suite NUnit desktop em
`Tests/Conformance` executou os 37 golden vectors através de P/Invoke para
`arkhe-core` nativo: **40 testes passaram, zero falhas/ignorados**, incluindo
`LargePayload_NoMarshalingCorruption` e buffer insuficiente sem escrita.
O workflow `unity-conformance.yml` está preparado para Windows/Linux; a execução
remota não foi disparada deste diretório sem `.git`. Isto cobre o adaptador de
conformidade desktop, não o codec Unity de produção nem a ligação WASM.
Android, iOS, Unity Mono/IL2CPP e WebGL continuam pendentes. Detalhes e comandos:
`Tests/Conformance/README.md`. A tabela abaixo descreve a verificação anterior.

Ambiente Windows com SDK .NET 8.0.421. Unity Editor não encontrado nos caminhos
padrão examinados. Nenhum pacote Unity foi resolvido ou build mobile executado.

| Verificação | Resultado |
|---|---|
| `dotnet run --project Tests/Core/CoreChecks.csproj --configuration Release` | 44 verificações passaram (26 anteriores + 18 de grade) |
| Compilação do núcleo em `netstandard2.1`, linguagem C# 9 | Passou, zero avisos e erros |
| Um milhão de ciclos rent/return do `FixedSlots` | Capacidade preservada; 0 bytes gerenciados alocados na janela do loop em .NET 8 |
| Pool cheio, retorno duplicado/antigo, slot inválido | Rejeição confirmada |
| Captura por ID, segundo dedo, deltas relativos e toque estacionário | Confirmados sem deriva |
| Suavização após release, velocidade máxima, limites e cancelamento | Confirmados no núcleo matemático |
| Assinatura expirada, passe 30 dias e bônus VIP | Confirmados no modelo de leitura |
| Overflow e adaptadores de verificação ausentes/rejeição local | Rejeitam sem produzir submissão |
| C# de UnityEngine/UnityEditor, shader e geração de assets | Pendente de Unity Editor |
| Test Runner EditMode `ObjectPoolerTests` | Escrito; execução pendente |
| Grade: 600 projéteis × 100 ticks contra 64 alvos | Coincidiu com referência independente por força bruta |
| Reconstrução de grade + 600000 consultas | Zero bytes gerenciados alocados na janela medida em .NET 8 |
| Cena com 500 hostis, 64 alvos, tiros aliados e grade | Código integrado; execução pendente de Unity |
| Frame time, GC total, GPU e touch físico | Pendente de editor/aparelhos |
| WASM, codec canônico, assinatura de plataforma, Rust HTTP, lojas, RLS e ZK | Adaptadores não conectados; sem validação de produção |

O teste de alocação cobre o mesmo `FixedSlots.cs` compilado pelo projeto
Unity, mas executado no runtime .NET 8. Não inclui IL2CPP, Mono do Unity,
ativação de GameObjects, callbacks, renderer, UI ou SDKs. Não comprova zero
GC do jogo. Compatibilidade .NET Standard não equivale a compilação Unity.

O benchmark agora inclui colisão de tiros aliados contra 64 alvos estáticos.
Os 500 hostis mantêm carga constante de renderização/movimento; ainda não
colidem com o jogador. Não usar os testes de núcleo para afirmar custo de
bullet hell completo no Unity. Comparar queries ligadas/desligadas, depois
touch e, numa etapa posterior, dano, absorção e sistemas completos.
