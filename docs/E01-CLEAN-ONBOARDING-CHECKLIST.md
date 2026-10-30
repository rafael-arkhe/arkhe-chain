# E01 — checklist de onboarding em ambiente limpo

Estado: PLANNED / NOT_RUN. Documento operacional, sem participantes recrutados
ou instalação limpa comprovada. Usar com `E01-ONBOARDING-STUDY.md`.

## 1. Fixar a jornada antes de recrutar

- [x] Selecionar **E01 verificador MCP/WASM** como jornada primária: instalar o
  kit e verificar uma prova válida e uma adulterada, interpretando os limites.
- [x] Identificar versão, formato, entrypoint e instruções reais desse kit.
  Enquanto esses itens não estiverem definidos, marcar KIT_NOT_READY.
- [x] Não usar o EXE/MSI do Intra como substituto da tarefa MMR: a CLI atual
  lista `start/open/stop/status/doctor/setup/data/backup`, sem comando `verify_mmr`.
- [ ] Se avaliar Intra, abrir uma coorte separada: instalar, executar `doctor`,
  iniciar, acessar o serviço local e parar. Não combinar esse tempo com o E01.
- [x] Fixar tutorial, kit, fixtures, respostas esperadas do avaliador, limites
  e critério 4/5 antes da primeira sessão. Mudança cria outra versão/coorte.
- [x] Designar operador do ambiente, observador e revisor do kit; registrar
  qualquer ausência de independência entre revisor e autor.

Registro desta seleção: `docs/E01-JOURNEY-C01.md` e
`config/e01-onboarding-cohort.json`. admin foi designado para as três funções;
revisão humana pendente e independência não estabelecida. Intra está fora do
escopo desta coorte. Os itens seguintes permanecem pendentes para a VM/sessões;
um ensaio técnico em pasta isolada não os marca como executados.

## 2. Preparar e verificar o ambiente

- [ ] Usar VM descartável ou máquina de teste dedicada, com sistema Windows x64
  e build registrados. Não usar a instalação de desenvolvimento como ambiente limpo.
- [ ] Criar snapshot anterior à instalação e conta de usuário exclusiva da sessão.
- [ ] Registrar imagem base, origem, digest disponível, data e identificador do
  snapshot. Verificar o estado efetivo; um nome de snapshot não basta.
- [ ] Confirmar ausência de Arkhe, dados anteriores, caches e credenciais de
  participantes. Inventariar Node/Rust/Python/pnpm presentes ou ausentes.
- [ ] Não exigir SDKs de build quando o perfil selecionado os declara dispensáveis.
  Se o kit MCP exigir Node, registrar sua instalação como pré-requisito.
- [ ] Desabilitar acesso a discos do host, pastas compartilhadas graváveis,
  sincronização de contas e clipboard compartilhado durante a tarefa.
- [ ] Disponibilizar o kit por mídia somente leitura ou download fixado. Não
  montar o repositório ou `node_modules` do host para mascarar dependências.
- [ ] Definir rede: permitir apenas o provisionamento necessário; depois testar
  a verificação offline. Conexão local stdio não exige RPC Solana.
- [ ] Não provisionar carteira, SOL, tokens de nuvem, Rekor ou chaves de produção.
- [ ] Verificar porta livre e processos existentes quando a jornada usar Intra.
  Não parar serviços do host para liberar portas da VM.

## 3. Validar o material e ensaiar tecnicamente

- [ ] Registrar SHA-256 do pacote/tutorial/fixtures e conferir o manifesto.
  Hash não substitui autenticação da origem; registrar como se obteve o valor esperado.
- [ ] No perfil Intra, verificar o aviso de ausência de assinatura de editor;
  não remover proteções do SO ou aprovar elevação silenciosamente.
- [ ] Fixar versões de runtime/WASM e provar que o entrypoint existe e funciona.
- [ ] Ensaiar o tutorial com um revisor, registrando comandos, erros, correções
  e intervenção. Classificar como **ensaio técnico**, sem contar entre P01–P05.
- [ ] Usar fixtures sintéticas: uma prova positiva e uma alteração de folha,
  raiz ou caminho. O controle negativo deve falhar; erro de instalação não é
  evidência de rejeição criptográfica da prova.
- [ ] Conferir previamente os controles com o verificador versionado. Não
  considerar o hash de um arquivo como substituto da verificação de inclusão.
- [ ] Após provisionamento, confirmar funcionamento offline e observar conexões
  do processo. Registrar o método; apenas substituir `fetch` em JS não prova
  ausência de rede no SO.
- [ ] Conferir que o kit não precisa de dados ou caminhos do host. Só liberar
  sessões com participantes após esse ensaio; caso contrário, registrar bloqueio.

## 4. Executar cada sessão autorizada

- [ ] Confirmar participação e autorização para a coleta definida. Não enviar
  convites ou mensagens automaticamente. Usar IDs P01–P05, sem nomes nos logs.
- [ ] Registrar experiência prévia e condições iniciais; não excluir quem tiver
  dificuldades depois de iniciar para melhorar a taxa.
- [ ] Restaurar a mesma base limpa antes de cada sessão e verificar os hashes.
- [ ] Medir **pré-requisitos** separadamente, incluindo downloads/instalações.
- [ ] Iniciar o cronômetro da jornada quando o pacote e os pré-requisitos
  estiverem disponíveis; encerrar após execução correta e interpretação do escopo.
- [ ] Medir também o tempo total, sem ocultar preparação. Preferir relógio
  monotônico para duração e UTC para correlação; registrar pausas e motivo.
- [ ] Entregar apenas o tutorial congelado. Registrar toda ajuda, pedido de
  ajuda, intervenção, erro, desistência e limite de tempo atingido.
- [ ] Verificar resultado positivo e rejeição do negativo. Solicitar explicação
  breve: inclusão relativa a raiz fornecida não autentica checkpoint, assinatura
  do documento, autorização da decisão ou contenção de runtime.
- [ ] Marcar sessão assistida quando houver intervenção técnica; ela não conta
  como sucesso sem auxílio. Manter a observação no conjunto e no denominador.

## 5. Encerrar sem coletar segredos

- [ ] Se usar Intra, executar `arkhe-cli.exe stop` dentro da VM e confirmar que
  o processo e a porta local encerraram. Fechar o navegador sozinho não basta.
- [ ] Exportar somente logs expurgados, hashes, tempos, resultados e feedback.
  Não copiar `credentials.json`, chaves privadas, backups ou dados pessoais.
- [ ] Registrar limitações/incidentes e verificar hashes do pacote de evidências.
- [ ] Restaurar ou descartar a VM conforme o plano, sem apagar pastas do host.
  Registrar identificador do snapshot restaurado e verificação do estado limpo.
- [ ] Preservar resultados anteriores quando houver nova versão do kit.

## 6. Avaliar o gate

- [ ] Preencher o registro `config/e01-onboarding-session-template.json` por
  sessão, preservando `null` para dados não coletados; não converter ausência em zero.
- [ ] Contar sucesso somente se ambiente/kit corretos, prova positiva aceita,
  negativa rejeitada, interpretação correta, sem intervenção e jornada ≤900 s.
- [ ] Publicar o número planejado (5), iniciado, concluído, assistido, desistente
  e não executado. Não chamar sessão não executada de falha de usabilidade nem
  retirá-la silenciosamente do planejamento.
- [ ] Relatar tempos individuais, mediana e máximo, indicando se incluem
  sucessos, sessões assistidas ou desistências. Não calcular só os mais rápidos.
- [ ] Aprovar o alvo exploratório apenas com ≥4/5 sucessos observados e cinco
  sessões avaliáveis. Caso falte execução, manter INCOMPLETE/NOT_RUN.
- [ ] Não extrapolar cinco sessões para adoção ampla, receita, conformidade
  regulatória, garantia de sandbox ou capacidade de AGI.

Evidências mínimas: manifesto do kit e ambiente, checklist preenchida, registro
por sessão, logs sanitizados, resumo do avaliador, limitações e SHA256SUMS.
Esta checklist não comprova que as verificações foram executadas.
