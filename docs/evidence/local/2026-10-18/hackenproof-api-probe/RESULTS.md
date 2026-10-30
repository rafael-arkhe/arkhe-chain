# HackenProof MCP configurado: teste real de leitura

Configuração utilizada: mcp_servers.hackenproof em ~/.codex/config.toml. Credencial lida somente em memória do header X-Api-Key; não copiada para arquivos de evidência. Sem alterações de configuração.

- initialize: HTTP 200; protocolo 2025-11-25; servidor hackenproof-bugbounty 1.26.0.
- notifications/initialized: HTTP 202.
- tools/list: HTTP 200; 28 ferramentas anunciadas. Definições salvas como catálogo candidato não aprovado, com fingerprints locais.
- tools/call list_companies: PASS; formato observado {result: []}, zero empresas retornadas.
- resources/list: PASS; quatro recursos anunciados.

Após o usuário indicar https://dashboard.hackenproof.com/user/programs/gate, tools/call get_program_info(program="gate") passou e retornou o programa Gate, oito entradas de escopo, poc_required=true e dual_defence=false. As oito entradas não devem ser interpretadas como oito alvos autorizados: cada entrada tem seu próprio indicador out_of_scope e as regras precisam ser revisadas antes de qualquer teste de segurança.

A resposta foi preservada em program-gate-01.json como captura candidata, não como política aprovada. SHA-256 do arquivo: 8c96bd53dc7aeae468f8128c19fae73b3a272f92c1413e9a90049e23af0917f7. A sondagem readonly-05.json registra o resultado e corrige a descrição genérica de escopo que permaneceu em readonly-04.json; ambos foram preservados.

Foi demonstrado acesso à leitura do programa Gate. O acesso aos relatórios permanece sem teste: list_reports exige company e program, e nenhuma empresa foi retornada. Não foi presumido um slug de empresa a partir da URL de pesquisador. Não foram executadas triagem, comentários, mudança de estado/severidade, anexos ou qualquer escrita de negócio.

As ferramentas HackenProof não estavam expostas como ferramentas nativas desta sessão; o teste usou diretamente o protocolo MCP com endpoint e header da configuração existente. A variável de bearer token configurada estava ausente, mas o header X-Api-Key autenticou as chamadas executadas. Nenhum segredo foi exibido.

As duas primeiras sondagens de list_companies pararam no parser local, que esperava lista direta; a terceira reconheceu o envelope result. Isso não foi falha de autenticação nem uma correção no servidor. Histórico preservado em readonly-01.json, readonly-02.json e readonly-03.json.

Este teste valida conectividade, autenticação, descoberta e a leitura limitada descrita. Não qualifica o codec de relatórios do Arkhe, seus pins BLAKE3, gate, journal ou execução de workflow contra HackenProof. Nenhum pin foi promovido automaticamente.
