# Avaliação independente e ciclos de evolução

O Intra oferece `/avaliacoes`: baseline congelado, tarefas reservadas, comparação
controlada, retenção e generalização, promoção assinada e rollback. A suíte v1 é
**sintética e limitada**. Mede o adaptador `arkhe-eval-worker` de `arkhe-agent`,
não a inteligência geral do sistema, eficácia de RSI ou os seis módulos cognitivos
em produção. Não há conclusão AGI derivada desses resultados.

## Baseline e reprodução

O baseline congela um snapshot de fontes por SHA256 em armazenamento endereçado
por conteúdo, fora da sandbox. Manifestos e blobs são verificados antes de cada
checkout. Blobs são gravados exclusivamente e somente leitura; SQLite impede
alteração/deleção dos manifestos. Triggers preservam baseline, imagem, política,
identidade do avaliador e relatório inicial depois de concluído.

A imagem Podman é vinculada pelo ID imutável, com dependências Cargo congeladas
no lockfile. O baseline é medido em duas sandboxes novas. O botão **Reproduzir
baseline congelado** repete exatamente o banco inicial e exige os mesmos resultados
por caso e métricas. A reprodução não reescreve o relatório inicial; divergência
ou falha bloqueia novas decisões no estudo. Uma atualização do avaliador invalida
a compatibilidade para novas comparações e exige outro baseline. Estudos anteriores
permanecem como evidência histórica; não se substitui silenciosamente seu avaliador.

## Tarefas reservadas

Há 192 casos por comparação: 16 para cada combinação de quatro capacidades e três
conjuntos. Os parâmetros são gerados por HMAC-SHA256 com sementes aleatórias privadas:

| Capacidade | Família sintética |
|---|---|
| Raciocínio | Expressões aritméticas compostas; maior profundidade na generalização |
| Planejamento | Ordenação de dependências em DAGs; grafos maiores na generalização |
| Aprendizagem por exemplos | Inferência de função a partir de exemplos; affine no conjunto básico, quadrática/cúbica na generalização |
| Uso de ferramentas | Consulta de valores e cálculo com ferramentas simuladas e allowlist; mais chaves e produto na generalização |

Retenção usa os mesmos casos reservados entre ciclos. Tarefas novas e de
generalização recebem outra semente em cada tentativa, **depois de congelar o
candidato**. As famílias são públicas; as instâncias, valores privados das
ferramentas e respostas esperadas não são exportados ao candidato ou ao gerador.
O candidato recebe apenas a tarefa, exemplos necessários e resultados das chamadas
de ferramentas permitidas. Não recebe o avaliador, gabarito, banco ou sementes.

O avaliador roda no host confiável, fora do contêiner do candidato. Respostas são
conferidas por ele, sem confiar em `PASS`, número de testes ou métricas declaradas
pelo candidato. Planejamento aceita qualquer ordenação válida, sem exigir uma
resposta textual única. Uso de ferramentas exige chamadas válidas de leitura e
cálculo com os dados pertinentes, além da resposta correta. As ferramentas são
simuladas: não há shell, rede, credenciais ou efeitos externos.

## Comparação controlada e critérios

Baseline original, versão ativa e candidato recebem o mesmo banco, mesma ordem,
imagem, protocolo e orçamento. Cada artefato é executado duas vezes em contêineres
novos; divergência nos acertos por caso reprova a comparação. A suíte mede acurácia,
não promete igualdade de tempo físico ou desempenho de hardware compartilhado.

Orçamento: Podman rootless, UID 10001, sem rede, sem capabilities, rootfs e entrada
somente leitura, 2 CPUs, 1536 MiB RAM, 128 processos, tmpfs de trabalho 1 GiB,
120 s para build, 1,5 s por tarefa, até oito ferramentas e 240 s por sessão.
Entradas e saídas JSONL são limitadas; timeout, falha de compilação, protocolo
inválido ou falha de limpeza não permitem promoção. Não existe fallback no host.

Um ciclo só fica elegível se:

- Ganhar pelo menos **5 pontos percentuais** no conjunto combinado de tarefas novas
  e generalização em relação à versão ativa.
- Não perder nenhum caso antes resolvido pelo baseline original ou pela versão
  ativa, inclusive nas tarefas reservadas de retenção.
- Alcançar pelo menos **50% de generalização em cada capacidade**.
- Apresentar evidência no teste pareado de sinais unilateral. Na tentativa `k`,
  o limiar é `0,05 / (k × (k + 1))`, incluindo tentativas sem sucesso. A soma dos
  limiares por estudo fica limitada a 0,05. Empates não contam como ganhos ou perdas.

O teste de sinais pressupõe condições de independência/amostragem apropriadas.
Casos sintéticos relacionados e adaptação iterativa limitam a interpretação
científica. Esses limiares são uma política experimental de promoção, não prova
de generalidade, significância externa, ausência de contaminação ou segurança AGI.

## Ciclos e governança

1. Preparar a sandbox conforme [INTRA-DEVELOPMENT](INTRA-DEVELOPMENT.md).
2. Criar um estudo na tela de avaliações e aguardar a medição inicial.
3. Informar um objetivo. A geração parte do **artefato ativo congelado**, incluindo
   melhorias anteriormente aceitas; não de uma cópia mutável arbitrária do workspace.
4. Revisar o candidato e seus testes na bancada de desenvolvimento.
5. Selecionar esse candidato no estudo e executar a comparação independente.
6. Revisar métricas, motivos de bloqueio e digests. Somente um ciclo elegível pode
   receber uma promoção assinada com a chave Ed25519 da governança.
7. Para outro ciclo, gerar a partir da nova versão ativa e repetir com casos novos.

A assinatura vincula estudo, revisão, versão anterior, candidato e evidência.
Assinaturas desatualizadas, candidatos de outro baseline, bancos de outra versão
ou imagens diferentes são rejeitados. Relatórios concluídos são imutáveis no banco.
O histórico encadeado registra congelamento, comparação, promoção, reprodução e
rollback; sem raiz externa confiável, não detecta remoção do final do histórico.

**Promoção altera somente a referência ativa do estudo.** Rollback assinado restaura
o baseline original ou um artefato previamente promovido. Ambos preservam as fontes
congeladas e o histórico. Nenhuma decisão modifica o workspace vivo, instala uma
versão ou autoriza uma ação protegida do kernel. A incorporação ao aplicativo
continua uma etapa distinta de revisão, regressão e distribuição.

## Validação executável

```powershell
pnpm test:intra
cargo test -p arkhe-agent --locked
cargo test -p arkhe-runtime --test cognition_conformance --locked
# Após preparar a sandbox e definir ARKHE_SANDBOX_IMAGE:
node packaging/sandbox/evaluation-smoke.mjs
node packaging/sandbox/replay-smoke.mjs
```

O smoke usa dois candidatos **escritos para teste**, com interpolação de grau 2 e 3,
e não candidatos gerados autonomamente pelo modelo. Cada candidato passa por testes
Rust e avaliação real em sandbox. O teste exige dois ganhos sucessivos sem perdas,
duas promoções assinadas, rejeição de assinatura reutilizada, rollback assinado e
reprodução do baseline inicial. Evidências públicas, sem sementes/gabaritos/chaves:
`docs/evidence/local/2026-10-18/capability-evaluation/`.

Esse teste valida a infraestrutura e detecta ganhos restritos de inferência
polinomial. Avaliação da cognição completa, tarefas abertas de longa duração,
benchmarks externos, aprendizagem persistente e candidatos autogerados com ganhos
consistentes continuam sendo trabalho posterior.

## Resultado local de 2026-10-18

- 24 testes do Intra aprovados; conformidade Rust dos módulos e contenção aprovada.
- Baseline e candidatos executados em sandboxes reais, duas repetições por artefato.
- Dois candidatos de teste ganharam, cada um, 8 casos sem perdas: +6,25 p.p. no
  conjunto de tarefas novas/generalização. Aprendizagem fora da distribuição:
  baseline 0/16, candidato quadrático 8/16 e candidato cúbico 16/16.
- Duas promoções assinadas, rejeição de assinatura reutilizada e rollback aprovados.
- Baseline original reproduzido em outro processo, com os mesmos resultados;
  relatório congelado e fontes do workspace preservados.
- A tela criou e mediu um baseline compatível. Uma tentativa adicional de geração
  pelo modelo local terminou em `failed` / `generation-or-snapshot-failed`, sem
  proposta utilizável. Ficou fora da comparação e não foi promovida. Os ganhos
  acima pertencem somente aos candidatos escritos para teste.

[Relatório dos ciclos](evidence/local/2026-10-18/capability-evaluation/live-smoke.json) ·
[Reprodução](evidence/local/2026-10-18/capability-evaluation/replay.json) ·
[Interface e geração bloqueada](evidence/local/2026-10-18/capability-evaluation/ui-report.json).
