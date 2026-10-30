# Próximo ciclo: contratos de credenciais, validade e hardware

Escopo acordado: preparar ICP-Brasil CMS/CAdES e CIN/VIO, mantendo validação governamental real pendente; plataforma TEE a definir, promoção bloqueada. A ancoragem pública é opcional e permanece apenas preparada.

## Dois adaptadores, duas cadeias de confiança

| Perfil | Entrada futura | Verificações obrigatórias antes de emitir recibo | Estado atual |
|---|---|---|---|
| icp-brasil-cms | CMS/CAdES, conteúdo detached quando aplicável e política de validação | Integridade da assinatura sobre o conteúdo exato, cadeia até raízes ICP-Brasil confiáveis, certificados do signatário e emissores, usos de chave, política/OIDs, validade temporal e status de revogação autenticado | Contrato e gate preparados; parser/verificador nativo, raízes e fixtures oficiais pendentes |
| cin-vio | Payload QR no formato e versão oficiais suportados | Decodificação conforme perfil, assinatura do emissor autorizado, associação da chave ao emissor, validade e mecanismo oficial de status/revogação | Contrato e gate preparados; perfil/SDK, chaves e fixtures autorizadas pendentes |

Um certificado ICP-Brasil assinar um CMS não prova que ele seja o emissor autorizado de uma CIN. A aplicação deve permitir emissores e finalidade por política, não apenas aceitar qualquer certificado que encadeie a uma raiz conhecida. O formato QR real também não deve ser inferido da fixture de texto sintética.

A descrição oficial do [VALIDAR/ITI](https://www.gov.br/pt-br/servicos/validar-servico-de-validacao-de-assinaturas-eletronicas?id=12780&origem=servico) caracteriza validação de assinaturas e seus formatos. O contrato acima não pressupõe que o portal ofereça uma API de backend disponível nem envia documentos a ele. Referências LCR/OCSP e cadeias fazem parte do perfil de assinatura [AD-RV do ITI](https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencias-para-validacao-ad-rv). A existência do VIO não fornece por si uma especificação aberta para clonar o verificador.

## Fronteira do adaptador nativo

O host deverá fornecer bytes exatos da credencial, conteúdo externo quando houver assinatura detached, identificador do perfil, política e raízes provisionadas por canal confiável, desafio aleatório e audiência. Esses elementos não devem ser escolhidos pelo documento ou pelo LLM.

O processo nativo precisa ter binário e configuração fixados por digest, ambiente mínimo, stdin/IPC privado, timeout e saída limitada. AIA, CRL Distribution Points, OCSP e URLs obtidas de documentos são entradas não confiáveis: não fazer fetch arbitrário. Aplicar allowlist, limites, rejeição de redirects indevidos e prevenção de SSRF no componente online. Nenhum desses downloads ocorre no verificador WASM puro.

A saída futura será um recibo assinado com commitments da credencial, material de validação e política, identidade de emissor, validade normalizada, status e intervalo de validade desse status, audiência e desafio. Um retorno JSON do subprocesso não é evidência autenticada sem validação do binário/cadeia e assinatura do recibo.

O tipo LifecycleReceipt atual aceita somente qualification=SyntheticReceipt. Não há variante GovernmentValidated: a tentativa de usá-la falha na desserialização. Os nomes de perfil CinVio/IcpBrasilCms descrevem a interface planejada; não qualificam a origem dos recibos de teste.

## Validade, expiração e revogação implementadas

verify_gov_lifecycle (Rust e WASM) autentica o recibo com chave fornecida separadamente e verifica:

- credential_digest, issuer_key_digest e policy_digest contra contexto e confiança do host;
- audiência e desafio contra o pedido esperado;
- valid_from <= now < expires_at;
- valid_from <= verified_at <= now, com idade máxima configurada;
- revocation=Good; Revoked e Unknown falham;
- status_this_update <= verified_at, now < status_next_update e idade máxima do status;
- commitments não vazios para material de validação, política e identidade do emissor; assinatura Ed25519 estrita e chave não fraca.

Todos os tempos de LifecycleReceipt são Unix segundos. WorkloadAttestation existente usa milissegundos: não misturar unidades. O host deve normalizar expiryDate ou campo equivalente somente após validação do perfil e da assinatura, preservando precisão e fuso especificados pela fonte. Um campo de expiração autocontido e não autenticado não deve alimentar a decisão.

Essas verificações implementam a política sobre um snapshot autenticado de status. Não são um parser OCSP/LCR nem uma consulta ao serviço de revogação CIN. O snapshot Good sintético demonstra apenas a mecânica de checagem. Falta de status autenticado, status velho ou indisponibilidade não pode ser convertida em Good. Ausência de expiração exige uma política nativa explicitamente revisada; não usar infinito por omissão.

A verificação offline cobre o intervalo do snapshot, não garante revogação em tempo real. O relógio vem do host confiável. Proteção contra reutilização da mesma apresentação requer armazenamento e consumo único do desafio no host; o verificador puro não mantém esse estado.

## Hardware e nível de confiança

Já existe AttestedWorkerVerifier que liga WER, tenant, chave do worker e digest do artefato a report_data, e confere medições, validade e assinatura do recibo. WorkloadAttestation continua uma porta de integração: não há verificador nativo universal nem raízes de fabricante embutidas.

O registro existente usa AttestationLevel::{None=0, Workload=1, Hardware=2}. O termo nível 3 do roadmap não é um valor implementado nesse enum. Não renumerar níveis nem promover uma entrada por metadados: o caminho exige evidência nativa qualificada e política revisada.

config/gov-security.json mantém level3.enabled=false e platform=null. check_gov_release.py rejeita qualquer tentativa de habilitar a promoção neste ciclo. O novo teste workload_real_receipts combina assinatura Ed25519 real e o SignedWorkerVerifier real com claims de attestation explicitamente sintéticos: chave divergente e ausência de raízes nativas falham. O teste não promove o worker a hardware.

Aceite futuro por plataforma: validar cadeia e raízes do fabricante, assinatura, TCB/revogação do collateral, modo debug, medições permitidas, frescor/challenge e report_data ligado ao WER e à chave efêmera. Comprovar geração/proteção da chave dentro do ambiente atestado e política de ciclo de vida; uma chave descrita como efêmera em JSON não basta. O harness opt-in workload_live existente requer manifesto e evidência nativos, sem fallback de mock. Não foi executado neste ciclo por decisão de manter a plataforma indefinida.

## Transparência pública opcional

```powershell
node integration/arkhe-gov/prepare-rekor.mjs
```

Gera localmente rekor-proposal.json com um hashedrekord que compromete somente o digest do checkpoint sintético. Uma chave Ed25519 efêmera de teste assina o statement; a chave privada não é persistida. Não autentica órgão público. Não há chamada de rede ou publicação nesse comando.

A estrutura reutiliza o adapter Rekor existente. Publicar exige escolha explícita do log, chave do log confiável, revisão do payload e tratamento de resultado remoto ambíguo. Depois, exigir validação de SET, inclusão e checkpoint segundo o nível de auditoria pretendido; SET isolado não demonstra consistência global ou checkpoint testemunhado. O [Rekor](https://docs.sigstore.dev/logging/overview/) é uma estrutura de transparência imutável: não incluir dados pessoais, QR bruto, documentos ou identificadores de titular no material público. Até um digest pode permitir correlação em outro contexto; aqui o escopo é exclusivamente sintético.

## Campanha adversarial executável

```powershell
python scripts/gov_worker_differential.py --cases 4096
```

Executa o SignedWorkerVerifier usado pelo produto, não uma reimplementação dele. Dezesseis classes incluem credencial de worker válida, Unicode, alteração do WER, tenant, versão, resultado, tempo inválido, corrupção/encoding de assinatura, módulo não autorizado, revogação da chave, key_id desconhecido, operação ausente, chave incorreta e pais não admitidos.

Um oráculo independente reconstrói CBOR em Python, verifica Ed25519 via cryptography/OpenSSL e aplica a política para o corpus sem evidência admitida. A campanha compara aceitação/rejeição do verificador real com esse oráculo e registra versões e hashes de fontes. O digest WER informado pelo Rust é entrada do oráculo: isto não é uma segunda implementação independente da identidade WER inteira. O corpus é determinístico e limitado, não fuzzing guiado por cobertura nem prova de ausência de vulnerabilidades.

O corpus JSONL, somente sintético, fica em ops/local/gov-adversarial; o relatório fica em docs/evidence/gov/2026-10-21/worker-differential.json. A campanha é gate próprio no workflow security; a execução remota e as regras de branch precisam ser verificadas no GitHub. Também foi limitado o tamanho da assinatura antes do decode no verificador real, preservando o formato Ed25519 de 64 bytes.

## Estado de liberação

| Controle | Estado deste ciclo | Pendência |
|---|---|---|
| Expiração e status autenticado | Implementados e testados para recibos sintéticos | Material de status nativo autenticado |
| ICP-Brasil CMS/CAdES | Perfil e fronteira preparados; desabilitado | Engine qualificado, raízes, política, amostras autorizadas |
| CIN/VIO | Perfil e fronteira preparados; desabilitado | Especificação/SDK, emissor e chaves autorizados |
| TEE | Promoção bloqueada | Escolha da plataforma e evidência nativa |
| Rekor público | Proposta preparada; não publicada | Escolha e autorização de publicação, verificação do recibo |
| Adversarial em escala | 4.096 casos diferenciais locais | Campanhas guiadas por cobertura e avaliação nativa futura |

Responsáveis propostos: Segurança/PKI para confiança de emissor e política; Engenharia de Integração para adaptadores; Plataforma para TEE/custódia; Privacidade para material público; DevSecOps para execução e branch gates. Não foram designadas pessoas nem declarada certificação de conformidade.
