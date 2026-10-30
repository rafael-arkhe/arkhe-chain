# Arkhe × Ollama — integração local, 2026-10-17

Status: LOCAL PROVIDER INTEGRATED — NOT A PRODUCTION FREEZE.

Ollama instalado em C:/Users/Lemes/AppData/Local/Programs/Ollama/ollama.exe,
servidor http://127.0.0.1:11434, versão reportada 0.40.6. O modelo instalado
north-mini-code-1.0:latest foi reutilizado, sem downloads. Seu digest foi conferido
contra config/ollama.json antes de cada inferência.

## Implementação

- Novo crate arkhe-ollama com cliente HTTP local, status/chat, pin do modelo,
  limites de resposta, timeout e rejeição de ferramentas/respostas incompletas.
- Launcher scripts/ollama.py usa o executável instalado. Reutiliza o servidor
  existente e só inicia serve quando necessário, com janela oculta no Windows.
- OllamaAnalyzer implementa LlmAnalyzer com resposta JSON tipada e validada.
  Discordância, campos inesperados e confiança fora dos limites não produzem WER.
- O WER candidato vincula relatório/parâmetros e a análise/modelo; um hook opcional
  de attestation permite integrar o serviço confiável de assinatura existente.
  O provider não se assina nem se admite automaticamente e não muda a governança.
- CLI ollama_triage gera somente UNTRUSTED_PROPOSAL. Não chama HackenProof e não
  grava evidência normativa. O contexto de relatório continua não confiável.
- Workspace/registro de arquitetura/configuração e comandos de pacote atualizados.

## Execução real

- Chat nativo respondeu OLLAMA_ARKHE_OK. A primeira requisição teve cerca de dois
  minutos, incluindo carregamento; o timing não é um benchmark de produção.
- Gate real ollama_live verificou JSON restrito ao schema e retornou {"ok":true}.
- O comando real de triagem analisou um relatório sintético sem PoC/ativo/target e
  recusou apoiar a proposta Critical/Triaged (supports_proposal=false). O resultado
  completo permanece no log ollama-live-triage. A inferência reportou ~11,5 segundos;
  o tempo do comando inclui compilação e não deve ser confundido com inferência.
- Sete testes automatizados adicionais cobrem pin, erros/timeouts sem retry,
  respostas truncadas/com tool calls, validação estruturada e bindings do WER.

## Uso

python scripts/ollama.py status
python scripts/ollama.py chat "Sua pergunta"
python scripts/ollama.py triage report.json High Triaged

Configuração: config/ollama.json. Para outro executável, ARKHE_OLLAMA_EXE;
para outro arquivo no launcher, --config; no Rust, ARKHE_OLLAMA_CONFIG.
O servidor Ollama que já estava ativo foi mantido ativo. O modelo usa seu keep_alive
normal e pode descarregar pesos após inatividade; não foi criado um novo serviço.

## Limites

É uma integração nativa/local, não um endpoint novo no runtime HTTP ou uma
integração automática do Ollama do Windows dentro dos contêineres. O modelo não
recebe ferramentas e o output não autoriza efeitos. Assinante/custódia/política
precisam de configuração antes de admitir WER de produção. A identidade conferida
por tags não é atestação criptográfica do processo servidor; o endpoint local é
parte do ambiente de inferência confiado operacionalmente.

Os testes por padrão usam um servidor de fixture. O teste do modelo real é uma
feature explícita ollama-integration, com ARKHE_OLLAMA_CONFIG obrigatório, para não
simular sucesso em máquinas sem modelo. CI remoto não foi acionado. Credencial e
codec HackenProof continuam separados e pendentes, conforme os ciclos anteriores.
