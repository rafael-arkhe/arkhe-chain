# Desenvolvimento do Arkhe pelo Intra

A rota `/desenvolvimento` oferece uma bancada local para a governança. O modelo
Ollama gera uma melhoria limitada a arquivos Rust `src/` ou `tests/` de um dos
23 crates registrados. Uma execução gera uma proposta e executa testes; não há
loop ilimitado, merge automático ou autorização para modificar o kernel ativo.

## Fluxo implementado

1. Selecionar módulo e objetivo verificável com credencial de governança.
2. Verificar imagem imutável local, Podman rootless e limites reais de recursos.
3. Produzir snapshot de fontes públicas, sem dados locais, chaves ou caches do host.
4. Pedir ao provedor Rust/Ollama uma proposta JSON de até oito arquivos / 64 KiB.
5. Validar caminhos; aplicar somente à cópia; executar `cargo test --locked --offline -p <crate>`.
6. Registrar baseline, proposta, saída, resultado, imagem e respectivos SHA256.
7. Revisar arquivos e resultados; assinar a aprovação Ed25519 localmente ou rejeitar.
8. Exportar JSON com fontes propostas e evidências para incorporação revisada.

A aprovação assina o identificador da execução, baseline, proposta e evidência.
Os digests são recalculados antes da assinatura. Não concede autoridade no kernel
nem constitui um WER admitido no WormGraph. Uma execução sem testes é reprovada.
A aplicação não aplica o resultado ao workspace original; a incorporação exige
uma etapa posterior de aplicação revisada, regressão completa e distribuição.

## Preparação e uso

Pré-requisitos de desenvolvimento: Node 24, fontes deste workspace, provedor
`arkhe-ollama` compilado, modelo local configurado, Podman com a máquina
`arkhe-runtime` e imagem-base Rust 1.96-bookworm disponível localmente.
O aplicativo EXE/MSI não embute compiladores ou a VM de desenvolvimento.

```powershell
python scripts/prepare_development.py
pnpm start:intra
```

Para preparar o perfil do EXE em vez do perfil fonte:

```powershell
python scripts/prepare_development.py --data-dir "$env:LOCALAPPDATA/Arkhe/Intra"
```

Reinicie o Intra após preparar o perfil. O script cria `development.json` no
diretório de dados escolhido. Não contém credenciais. Uma alternativa é definir
`ARKHE_DEVELOPMENT_ROOT`, `ARKHE_SANDBOX_IMAGE` (ID completo `sha256:...`) e
`ARKHE_SANDBOX_CONNECTION` antes de iniciar o aplicativo.

No Windows/WSL, o script delega CPU, memória e PIDs para `/arkhe-sandbox` dentro
da VM dedicada. Essa configuração transitória exige nova preparação após reiniciar
a VM. Não altera ACLs do Windows ou a política do kernel Arkhe. Se a delegação,
imagem, modelo ou engine falharem, não há execução alternativa no host.

Durante a preparação da imagem, `cargo fetch --locked` usa rede para obter
dependências. Durante os testes de código gerado: rede desabilitada, rootfs e
snapshot somente leitura, UID 10001, capabilities removidas, no-new-privileges,
2 CPUs, 1536 MiB RAM, 128 processos, tmpfs de trabalho 1 GiB e timeout 120 s.
O snapshot usa allowlist de fontes com limite de 50 MiB / 5000 arquivos.
Snapshots temporários de fontes públicas ficam no diretório temporário do sistema.
Resultados e decisões persistem no SQLite; execuções interrompidas por reinício
são identificadas ao consultar a bancada e não são retomadas implicitamente.

## Backlog de capacidades

| Área | Próximo critério de conclusão |
|---|---|
| Percepção | Avaliação independente de precisão, robustez e distribuição desconhecida |
| RAG | Recuperação medida, citações, isolamento e resistência a prompt injection |
| Metacognição | Calibração de incerteza, abstenção e avaliação independente |
| Modelo de mundo | Validação causal e contrafactual em dados separados |
| Aprendizagem | Baseline/candidato, retenção, regressões, shadow run e rollback |
| Agente | Planejamento em tarefas longas, execução contida e recuperação |
| Memória/evidência | Recuperação durável, isolamento e ligação de artefatos a registros canônicos |
| Kernel/governança | Política operacional revisada, identidade externa e admissão do fluxo de desenvolvimento |
| Trabalho/runtime | Execução durável, cancelamento, retomada e testes de falhas entre serviços |
| SQL | Regressão completa com banco real, migrações imutáveis e isolamento de tenants |
| Integrações | Contratos ponta a ponta, autenticação e reconciliação de falhas |
| Interfaces Node | Integração das superfícies, acessibilidade e testes dos fluxos completos |
| Distribuição | Assinatura de código, atualização/rollback e validação de instalação por usuário |

Os 23 crates podem receber propostas na bancada. Aplicativos Node, provisionamento,
SSO, atualizações e benchmarks cognitivos ainda exigem perfis específicos; não
devem ser tratados como concluídos pelo simples resultado de `cargo test`.

## Evidência local

`packaging/sandbox/smoke.mjs` verifica isolamento real e solicita uma regressão ao
modelo local, executa-a em sandbox e assina uma decisão com identidade sintética.
O resultado em `docs/evidence/local/2026-10-18/development-sandbox/live-run.json`
registra uma proposta de teste para `PlanStep.clone()`, um teste aprovado e
aprovação de exportação. Nenhuma alteração foi aplicada à fonte original.
Isso demonstra o fluxo da bancada, não 
eficácia de autoaperfeiçoamento ou AGI.

O protocolo independente de capacidades foi acrescentado em `/avaliacoes`, com
baseline congelado, tarefas reservadas, retenção, generalização e ciclos de
promoção/rollback assinados. Consulte [CAPABILITY-EVALUATION](CAPABILITY-EVALUATION.md).
