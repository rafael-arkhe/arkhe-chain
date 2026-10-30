# E01 C01 — roteiro de instalação limpa e onboarding

Estado: READY_FOR_OPERATOR_REVIEW; execução em VM e sessões humanas NOT_RUN.
Materiais: E01-WIN-X64-C01, revisão 1, kit Windows x64 0.1.0.
Operador/observador/revisor designado: admin. Revisão humana pendente;
independência não estabelecida. Este roteiro não altera os bytes do kit C01.

## Etapa 0 — autorizar a execução operacional

admin revisa `TUTORIAL.md` do ZIP, confirma o ambiente de destino e registra
data, versão/hash, observações e decisão. Designação de responsável não prova
que essa revisão ocorreu. Não recrutar participantes antes do ensaio técnico.

Separar três registros: preparação da VM, ensaio técnico do operador e sessões
P01–P05. O operador não ocupa uma vaga da amostra. Um ensaio automatizado não
produz resultado humano nem demonstra tempo de onboarding de uma pessoa.

Apenas a tarefa MMR do kit participa desta coorte. Intra, carteiras, trading,
TEE, EIP-712, AWS, RPC e pagamento de taxas não são necessários ao teste.

## Etapa 1 — preparar uma VM descartável

### Registro de seleção e observação da infraestrutura

Staging Linux, inclusive em Coolify/Dokploy, não é elegível para ONB03 desta
coorte Windows x64. A ausência de comandos no PATH não comprova ausência de
hipervisor instalado. Hyper-V e VirtualBox são alternativas a avaliar pelo
operador; nenhuma foi selecionada ou provisionada por este registro.

Preencher a seleção em `environment.json` a partir de
`config/e01-environment-template.json`, conforme `E01-OPERATOR-INTAKE.md`.
O resumo abaixo permanece pendente até haver dados e evidências reais:

```yaml
environment_spec:
  status: PENDING_ENVIRONMENT
  platform_target: Windows_NT_x64
  hypervisor_provider: null
  hypervisor_version: null
  vm_identifier: null
  source_image_origin: null
  source_image_sha256: null
  source_image_hash_reference: null
  windows_edition: null
  windows_version: null
  windows_build_exact: null
  observed_guest_architecture: null
  isolation_observed:
    network: UNASSESSED
    clipboard: UNASSESSED
    shared_drives_and_writable_folders: UNASSESSED
    synchronization: UNASSESSED
  snapshot_initial_id: null
  snapshot_created_at: null
  observation_method_and_evidence: null
```

Seleção de hipervisor e imagem disponível atende à preparação de ONB03;
isolamento observado e snapshot verificado pertencem a ONB04. Não chamar estes
metadados de infraestrutura verificada enquanto os campos não forem comprovados.
`S0_CLEAN_BASE` pode ser um nome planejado, mas não demonstra snapshot criado.
Registrar edição, versão e build exatos da imagem efetivamente escolhida, sem
tratar versões sugeridas em mensagens como seleção ou disponibilidade confirmada.

Rede Host-Only permite comunicação com o host e não satisfaz a exigência de
rede da VM desconectada. Confirmar a desconexão no hipervisor e no convidado,
com método e limitações registrados. Desabilitar também integrações de clipboard,
unidades e pastas compartilhadas, independentemente do modo de rede.

Transferir o ZIP por mídia de leitura ou download controlado antes da desconexão;
depois conferir e extrair dentro da VM, conforme as etapas abaixo. Não reconectar
a VM durante o ensaio para compensar dependências ausentes. ONB02 permanece
dependente do registro explícito de leitura e decisão de admin.

1. Selecionar VM Windows x64 dedicada e registrar hipervisor, versão/build do
   sistema, arquitetura, CPU/RAM/disco, imagem de origem e identificador da VM.
   Provisionamento/licenciamento da imagem é responsabilidade do operador;
   não presumir imagem ou licença disponível neste repositório.
2. Criar uma conta exclusiva sem elevação por padrão. Não conectar contas
   pessoais ou diretórios de produção. Confirmar ausência de Arkhe, dados de
   sessões anteriores, SDKs de desenvolvimento e caches herdados. Inventariar
   ferramentas presentes em vez de presumir ausência.
3. Desabilitar pastas compartilhadas graváveis, discos do host, sincronização
   e clipboard compartilhado. Registrar estado observado dessas integrações.
4. Criar snapshot S0 antes do kit e registrar identificador/data. Confirmar
   que a VM corresponde à configuração registrada; o nome S0 não é evidência.
5. Transferir apenas o ZIP fixado, por mídia de leitura ou download controlado,
   para `C:\E01\Input`. Remover a mídia/compartilhamento depois da cópia.
6. Desconectar a rede **da VM** no hipervisor e registrar o estado. Não executar
   comandos de desativação na máquina de desenvolvimento. Sem observação no
   SO/hipervisor, registrar isolamento de rede UNASSESSED.

Não instalar Node/Rust/Python/pnpm para compensar uma falha do kit: o runtime
está incluído. Se forem necessários, registrar defeito de distribuição e parar
o ensaio, preservando os logs.

## Etapa 2 — ensaio técnico, dentro da VM

Executar os comandos abaixo **na VM**, sem administrador. Nunca executar a
extração no host para depois chamá-la de instalação limpa.

```powershell
$zip = 'C:\E01\Input\Arkhe-E01-Verifier-0.1.0-windows-x64.zip'
$expected = '1484bbad22f04b50caa508343fd7cabe765e3d4f654c80cd62f67aafed55d2ea'
$actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'ZIP incorreto: interromper antes da extração.' }
$destination = 'C:\E01\C01'
if (Test-Path -LiteralPath $destination) { throw 'Destino já existe: não misturar sessões.' }
Expand-Archive -LiteralPath $zip -DestinationPath $destination
Set-Location -LiteralPath 'C:\E01\C01\Arkhe-E01-Verifier-0.1.0-windows-x64'
.\arkhe-verify.cmd doctor
$doctorExit = $LASTEXITCODE
.\arkhe-verify.cmd verify .\fixtures\A.json
$positiveExit = $LASTEXITCODE
.\arkhe-verify.cmd verify .\fixtures\B.json
$negativeExit = $LASTEXITCODE
[pscustomobject]@{doctor=$doctorExit;A=$positiveExit;B=$negativeExit}
```

Gabarito do operador: doctor `PASS`/0; A `PROOF_VALID`/0; B `PROOF_INVALID`/1.
Código 1 na prova B é a rejeição esperada, não falha de instalação. Código 2
significa erro de entrada/ferramenta. Preservar stdout, stderr e código de cada
comando separadamente. Não usar `doctor` sozinho como prova de funcionamento
do MCP/WASM: A e B devem atravessar o servidor stdio e o WASM incluídos.

O ZIP não tem assinatura de editor. Registrar a origem do hash esperado;
conferir hash não autentica por si só quem distribuiu o arquivo. Não desativar
proteções do Windows para obter resultado favorável. Um bloqueio é resultado
do ensaio, com mensagem e contexto preservados para análise.

Durante e após a tarefa, observar processos e conexões com ferramentas do SO
escolhidas pelo operador. Registrar método, intervalo e limitações. A CLI deve
encerrar seu processo MCP após a chamada, sem serviço instalado ou porta HTTP.
Ausência de conectividade não transforma este ensaio em certificação de sandbox.

## Etapa 3 — decidir se a coorte pode começar

admin registra PASS técnico apenas com integridade correta, execução A/B
correta, ausência de dependência não declarada e encerramento observado.

- Falha de kit/VM: registrar BLOCKED, diagnóstico e logs; não iniciar sessões.
- Necessidade de mudar tutorial/kit/fixtures: gerar nova revisão/coorte e outro
  hash; preservar C01 e o resultado adverso. Não editar silenciosamente o ZIP.
- Ensaio aprovado: guardar pacote de evidências e restaurar S0; verificar
  estado limpo antes da primeira pessoa. Preparar novamente o mesmo ZIP.

O ensaio em pasta isolada já registrado não substitui esta etapa de VM.
Se a infraestrutura não estiver disponível, o status permanece NOT_RUN.

## Etapa 4 — executar P01–P05

Para cada sessão autorizada, copiar o template de registro para arquivo novo.
Manter gabarito e este roteiro operacional com o observador; entregar ao
participante apenas o tutorial e materiais do kit, sem o registro do avaliador.

1. Restaurar S0, confirmar isolamento e hashes e registrar experiência prévia
   do participante. Usar ID pseudônimo, sem nomes ou credenciais nos logs.
2. Registrar tempo de preparação/provisionamento do operador separadamente.
   Se o participante precisar instalar pré-requisitos, cronometrar e relatar
   esse tempo; o kit atual declara não precisar deles.
3. Quando o ZIP e os pré-requisitos estiverem disponíveis, iniciar a jornada
   **antes da conferência/extração pelo participante**. Incluir verificação do
   arquivo, extração, comandos, tratamento de erros e interpretação do resultado.
4. Observar sem dar instruções além do tutorial fixado. Registrar pedidos de
   ajuda e intervenções com instante e conteúdo sanitizado. Ajuda técnica torna
   a sessão assistida, mesmo que a pessoa termine em menos de 15 minutos.
5. Encerrar a duração quando a pessoa conclui A/B e explica o escopo; ou registrar
   desistência/limite atingido. Não encerrar o relógio no primeiro comando bem-sucedido.
6. Usar relógio monotônico para duração e UTC para correlação; registrar pausas,
   motivo e método de medição. Não descontar espera/erro sem divulgar os tempos
   bruto e ajustado. Registrar o tempo total além do tempo da jornada.
7. Solicitar explicação sem fornecer a resposta: o que uma prova válida permite
   concluir? O observador compara com o gabarito externo. Não inferir compreensão
   apenas porque a pessoa leu `PROOF_VALID` na tela.
8. Coletar feedback e registrar erros; não substituir desistentes por pessoas
   mais rápidas. Encerrar processos, exportar somente dados sanitizados e
   restaurar S0, registrando a verificação de limpeza.

O limite de 900 s é critério de sucesso sem ajuda; não é motivo para apagar
resultados de sessões mais longas. Quem não iniciou permanece NOT_RUN. Quem
desistiu após iniciar permanece no conjunto com o resultado observado.

## Etapa 5 — evidências e decisão

Usar uma pasta nova por execução, por exemplo:

```text
E01-WIN-X64-C01/
  environment.json
  operator-review.json
  technical-rehearsal.json
  kit-sha256.txt
  sessions/P01.json ... P05.json
  logs/                    # apenas saídas sanitizadas
  cleanup.json
  summary.json
  REPORT.md
  SHA256SUMS
```

Não copiar chaves, `credentials.json`, backups do Intra ou imagem de VM contendo
dados pessoais para a evidência compartilhada. Hashes preservam integridade;
não substituem revisão independente, assinatura ou autenticação da origem.

Gate exploratório: cinco sessões avaliáveis, pelo menos quatro conclusões
corretas sem ajuda em ≤900 s, prova positiva aceita, negativa rejeitada e
interpretação correta. Reportar planejadas/iniciadas/concluídas/assistidas/
desistentes/não executadas, tempos individuais, mediana e máximo com sua população.
Se faltarem sessões, manter INCOMPLETE; não extrapolar amostra de cinco pessoas.

Conclusão da instalação e do estudo não concede autoridade de execução,
certificação de TEE, conformidade regulatória ou aprovação de contenção.
O E01 anterior é evidência empírica de devnet sob condições registradas;
não classificar seus resultados como LEMMA/THEOREM sem prova formal própria.
