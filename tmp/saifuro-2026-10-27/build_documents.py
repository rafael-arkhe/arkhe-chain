from pathlib import Path
import json, re, hashlib, shutil, csv
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(r'D:\arkhe\output\saifuro-2026-10-27')
MD=ROOT/'documentos'
docs={}
def add(name,text):
    docs[name]=text.strip()+'\n'

add('00_LEIA_PRIMEIRO_PT', '''# Documentação Arkhe e Saifuro

Revisão de fontes e pacote de trabalho preparado em 27 de outubro de 2026 para Rafael Oliveira. O objetivo é apoiar uma entrevista e, separadamente, uma possível avaliação comercial da Arkhe. Não há parceria celebrada ou integração Saifuro implementada comprovada por este trabalho.

## Conclusão

Há presença pública consistente entre site, vaga oficial, GitHub, W3C e Internet Draft. Isso justifica diligência adicional, mas não autentica a pessoa no Telegram, nem comprova solvência, contratação ou segurança operacional. A confirmação independente do registro estadual ficou pendente por barreira de acesso no portal de Wyoming.

A vaga pede experiência comprovada em Solidity em mainnet. Como você informou não ser programador, a apresentação honesta é pesquisa de produto Web3, engenharia de contexto e especificações assistidas por IA. Proponha uma avaliação limitada e colaboração com um engenheiro experiente. Não assuma responsabilidade individual por contratos que custodiam ativos.

## Correções prioritárias

Saifuro se declara LLC de Wyoming, e não Inc de Delaware. Os termos do site escolhem Delaware, sem vincular automaticamente uma futura negociação. As minutas deixam lei e foro em aberto. O workspace Arkhe declara Apache-2.0 OR MIT, herdado por arkhe-core, WormGraph e WASM. Confidencialidade não cancela licenças anteriores. Reconcilie versões, histórico de distribuição e titularidade antes de licenciar componentes como exclusivos.

As promessas de segurança absoluta, auditoria completa, redução de custos de 70 a 80 por cento, latência inferior a 50 ms e conformidade automática foram removidas. Um veredito é declaração assinada, não prova de pagamento. Uma prova de inclusão não comprova completude nem causalidade econômica. Carimbo de tempo não prova autoria exclusiva.

## Como usar os arquivos

01 contém a revisão e suas correções. 02 reúne fontes e limites. 03 traz diligência e autenticação. 04 é o resumo público em inglês. 05 é a proposta técnica restrita. 06 cobre o piloto e critérios de aceitação. 07 registra IP. 08 a 16 são minutas jurídicas em inglês. 17 contém mensagens prontas para adaptação. 18 prepara a entrevista. 19 documenta a direção visual. Os DOCX consolidam o dossiê e o caderno jurídico. As apresentações pública e técnica são materiais opcionais de parceria, sem substituir a introdução sem slides solicitada no convite.

## Ordem de ação

1. Confirme a identidade e a vaga por contact@saifuro.com, obtido no site.
2. Peça a razão social completa, endereço, comprovante atual de registro e autoridade do signatário. Confirme sua própria parte contratante e cadeia de titularidade.
3. Faça a introdução profissional sem informações reservadas. Diferencie candidatura de proposta comercial.
4. Corrija por escrito a minuta antiga caso tenha sido enviada. Peça confirmação de recebimento. Um novo rascunho não altera contrato já assinado.
5. Reconcilie as licenças e escolha os materiais realmente disponíveis para avaliação.
6. Negocie NDA e IPEA com anexos preenchidos, depois SOW e MSA se houver trabalho remunerado. DPA depende do fluxo real de dados pessoais.
7. Só libere materiais restritos após os documentos pertinentes estarem assinados por representantes autorizados.

## Estado das entregas

Todos os contratos são rascunhos de negociação, não versões para assinatura. Campos entre colchetes dependem das partes. Não foram enviados e-mails, mensagens ou arquivos a terceiros, nem foi reservado horário, aplicado carimbo de tempo confiável, publicado hash ou realizada transação. SHA-256 do pacote identifica os arquivos locais e não constitui timestamp.

O histórico menciona PDFs e áudio de outra ferramenta, mas esses binários não foram anexados nesta solicitação. A revisão cobre o texto transcrito, as fontes acessíveis e os arquivos locais citados. Não é possível atestar o conteúdo daqueles PDFs ou a existência do áudio original.
''')

add('01_REVISAO_CRITICA_PT', '''# Revisão crítica das afirmações

O histórico foi tratado como material a verificar, e não como prova das próprias alegações. Este documento substitui as conclusões excessivas da conversa anterior.

## Identidade empresarial e contato

S02 informa Saifuro LLC e registro Wyoming 2026-002073167. S01 repete a identificação, mas ambas são fontes controladas pela empresa. S12, o portal estadual, apresentou desafio de acesso. Portanto o status ativo não foi confirmado independentemente. Delaware aparece como escolha contratual nos termos do site, e não como estado de constituição. Não presumir endereço ou poderes de representação.

S04 e S06 associam Ed Wynand à Saifuro. O GitHub lista Rio de Janeiro e um link para @Ed_Wynand. Essa correspondência é um indício, sujeito a alterações e comprometimento de contas. Comunicação em inglês é compatível com uma equipe internacional e não informa nacionalidade, residência real ou legitimidade. Não conclua autenticidade apenas pelo username.

S07 lista Ithelia Dias com afiliação Saifuro. S08 registra um Internet Draft individual em seu nome. Participar de um Community Group e submeter um draft são atividades públicas abertas. Não representam endosso, certificação, aprovação técnica, diligência financeira ou prova de que a empresa é segura. O LinkedIn fornecido não ficou acessível nesta revisão.

## Vaga e capacidade profissional

A vaga oficial S05 confirma o papel EVM e inclui Brasil. O agregador S03 é secundário. A faixa anunciada é dos EUA e a oferta fora dos EUA é calibrada ao mercado local. Os números de consultoria, margem de 95 por cento, equity de 1 a 3,5 por cento e valorização futura do histórico não têm base contratual apresentada. Participação em empresa privada não é dinheiro líquido.

A frase de que você entrega contratos auditados, invulneráveis ou cobertura integral não é sustentada por seu relato. Use linguagem proporcional à experiência real. IA pode apoiar especificação, mas não substitui domínio de Solidity, revisão independente e auditoria. Não declare experiência em mainnet, testes formais ou ferramentas sem evidência pessoal.

## Produto e proposta técnica

S04 e S09 já descrevem decisões assinadas e log de auditoria. A oportunidade Arkhe precisa demonstrar benefício incremental sobre esse log, em vez de alegar que ele não existe. S10 especifica JWT ES256. Não substitua esse formato por EIP-712 ou por secp256k1 sem uma especificação acordada. ES256 usa P-256 e exige um caminho de verificação apropriado no ambiente de destino.

Há uma questão aberta entre S05, que pede verificação de audience onchain, e S11, que descreve tokens atuais sem aud. O piloto deve esclarecer se o escrow usa outro envelope. Não invente uma interface Solidity com base no token público. ACP no contexto comercial significa Agentic Commerce Protocol, não Agent Communication Protocol. Nenhuma integração desses protocolos com Arkhe foi comprovada.

S11 limita o significado de uma assinatura. Arquivar o token preserva uma declaração atribuída a uma chave. Não prova que a política era correta, que o operador tinha saldo ou que ocorreu liquidação. Correlação por identificadores não prova causalidade. S13 limita reconstrução histórica por policy_version, portanto solicite snapshot de mandato e política com proveniência própria.

Offline significa verificar um pacote contra raízes e chaves confiáveis retidas. Não permite conhecer revogações atuais, novo estado da rede ou eventos omitidos sem evidência adicional. TEE, Rekor e ancoragem pública são capacidades ou propostas que exigem qualificação por versão e ambiente. Não são propriedades automáticas do Arkhe.

## IP e documentos jurídicos

L01, L03, L04 e L09 demonstram declaração permissiva herdada por componentes centrais. Isso não prova a publicação de cada versão, mas impede tratá-los todos como segredos exclusivos sem inventário. Um contrato não pode retirar direitos já concedidos a terceiros. Software aberto pode sustentar serviços pagos, suporte, hospedagem e módulos privados identificados.

Foreground IP nasce durante o projeto e não se torna Background IP por mera rotulagem retroativa. Cada entregável deve ter titular, licença, momento de transferência e dependências definidos. O NDA não concede licença de teste nem remuneração ou equity. O IPEA concede somente o uso descrito em seu anexo para materiais sobre os quais o licenciante tem direitos.

S14 descreve existência de dados antes de um tempo. Hash local, MMR, Rekor e RFC 3161 têm modelos distintos. Nenhum prova sozinho autoria absoluta, novidade patenteável ou propriedade. Uma cláusula contratual não torna uma prova incontestável. Liminares e dispensa de caução dependem do tribunal e da lei.

Excluir indiscriminadamente logs e backups pode contrariar retenção legal ou preservação de evidências. As novas minutas preservam cópias legais isoladas e backups rotativos, com sigilo e proibição de reutilização. Proibição de engenharia reversa fica limitada ao que a lei e as licenças permitem.

## Compliance e finanças

O artigo 50 não é um certificado geral de auditoria financeira. S15 trata transparência em contextos específicos de IA. SOC 2 é um trabalho de asseguração sobre controles por CPA, não uma certificação produzida por um ledger. DPA trata dados pessoais, não comprova SOC 2 ou AI Act. S20 relata processos de auditoria e certificação ainda em andamento, sem relatório verificado aqui.

US$ 0,005 por um milhão de registros equivale a US$ 5.000 de receita bruta hipotética, antes de infraestrutura, suporte, impostos, descontos e inadimplência. Não há volume contratado. Uma participação de 1 por cento num valuation de US$ 20 milhões seria US$ 200 mil nominais, sem garantir venda, liquidez ou preferência econômica. Essas hipóteses foram excluídas dos materiais comerciais.

## Documentos e ações alegados no histórico

Não foram encontrados nesta entrada os PDFs anteriores, o deck do Studio ou o áudio mencionado. Não houve confirmação de e-mail enviado, Calendly reservado ou NDA assinado. O convite transcrito menciona 3 de novembro de 2026 e introdução de 5 a 10 minutos sem slides, mas não contém horário confirmado. Mantenha esse estado como relato do usuário.
''')

add('03_DILIGENCIA_E_SEGURANCA_PT', '''# Diligência da contraparte e do recrutamento

## Resultado atual

A presença pública consultada é coerente em vários pontos, mas parte dos sinais é autodeclarada. O contato específico continua não autenticado. Não há base suficiente para declarar a empresa fraudulenta nem para garantir que seja segura. O registro estadual, financiamento, clientes, contratos implantados, relatórios de auditoria e poderes do signatário ainda precisam de evidências independentes.

## Evidências e seus limites

Site e vaga oficial: confirmam que o domínio publica a oportunidade, não quem opera a conversa privada. GitHub: vincula publicamente um perfil ao cargo e ao Telegram, mas não substitui confirmação por canal corporativo independente. W3C e IETF: corroboram atividade técnica pública, sem endosso institucional. Registro de Wyoming: ID declarado no site, consulta independente pendente. Investidores privados: sem nomes ou comprovação de recursos disponíveis nesta revisão.

## Verificação antes da entrevista

Escreva manualmente para contact@saifuro.com a partir do endereço obtido em S01. Informe o username exato que escreveu para você, a vaga e o link recebido. Peça confirmação do interlocutor e uma mensagem corporativa ou convite oficial. Observe remetente real, Reply-To e autenticação da mensagem sem presumir que SPF ou DKIM isoladamente provem boa-fé. Não foi recebida aqui uma mensagem original com cabeçalhos.

Confirme a plataforma e a URL da reunião, a data de 3 de novembro de 2026, o horário e o fuso. O calendário não foi reservado nem validado nesta sessão. Não afirme agendamento nas mensagens até ter confirmação. A janela de equipe 14 a 17 UTC equivale a 11 a 14 horas em São Paulo nesta data, mas não é o horário de sua entrevista.

## Teste técnico e materiais

Solicite uma tarefa escrita e delimitada, remuneração quando pertinente e identificação do repositório. Faça primeiro revisão estática de arquivos e dependências. Caso seja necessário executar algo, use ambiente descartável sem credenciais, sem montagens do diretório pessoal e sem acesso às suas carteiras. Não execute instaladores ou comandos fornecidos apenas no chat. Não conecte carteiras, assine transações ou envie valores para validar candidatura. A política S01 também rejeita pedidos de dinheiro e de carteira.

## Identificação contratual

Solicite certificado ou extrato recente do registro estadual, endereço de notificações, nome e cargo do signatário e confirmação dos poderes. Confirme a entidade que contratará no Brasil e se haverá employer of record. Não envie documentos de identidade ou dados bancários por Telegram. Para eventual contratação, use o procedimento formal e a finalidade informada.

## Critérios de decisão

Prosseguir com conversa pública: identidade confirmada por canal independente e convite coerente. Abrir avaliação restrita: inventário de IP reconciliado, NDA e IPEA assinados, responsáveis identificados. Iniciar trabalho pago: SOW e contrato aplicável assinados, preço e aceite definidos. Suspender: pedido de valores, carteiras, credenciais ou execução suspeita, entidade divergente sem explicação ou pressão para ignorar validações.

## Registro operacional

Responsável Rafael Oliveira. Evidências a guardar: mensagem original, cabeçalhos de e-mail, confirmação corporativa, convite, extrato de registro, versões de documentos e decisões de acesso. Resultado de autenticação: PENDENTE. Resultado de registro: PENDENTE. Confirmação de agenda: PENDENTE. Nenhuma dessas validações foi realizada por envio de mensagem nesta sessão.
''')

add('04_PUBLIC_PARTNERSHIP_BRIEF_EN', '''# Arkhe and Saifuro partnership brief

Prepared for Saifuro by Rafael Oliveira. Discussion proposal dated 27 October 2026. No partnership, production integration or commercial commitment is implied.

## Proposed evaluation

I propose a bounded pilot to test whether Arkhe can package Saifuro authorization records and separately collected execution evidence into independently verifiable audit bundles. Saifuro already describes a decision log. The pilot would measure what an additional verification layer contributes to an existing workflow.

## Intended customer outcome

A reviewer could verify the integrity and provenance of disclosed records using a retained bundle and approved trust material. The bundle would distinguish a signed authorization from a later payment outcome. Missing or conflicting evidence would remain visible rather than being presented as a successful settlement.

## Responsibility boundary

Saifuro would remain responsible for its authorization service and signing model. Customer payment systems would retain authority to execute payments. Arkhe would receive only the agreed evidence fields and would not receive wallet keys, custody rights or authority to release escrow funds. This is a proposed architecture requiring implementation and review.

## Pilot outline

Use synthetic or approved sandbox records. Agree the evidence schema and trust model. Build a minimal ingestion adapter and export an offline bundle. Test modifications, duplicate events and missing outcomes. Compare the review process with the current log export. Jointly decide whether the measured benefit supports a commercial phase.

## Commercial and IP approach

A fixed pilot scope would separate engineering services from any license to specifically identified private materials. Existing open source rights would remain intact. Ownership of new connectors would be agreed per deliverable before development. No transaction volume, pricing, equity grant or audit saving is assumed.

## Proposed next step

Confirm a technical counterpart and exchange a short written problem statement. A separate NDA and evaluation agreement can cover restricted materials if both teams choose to proceed. My main contribution is Web3 product reasoning, context engineering and written specifications supported by AI. Production Solidity ownership would require an experienced smart contract engineer.
''')

add('05_TECHNICAL_RFC_EN', '''# Proposed Saifuro evidence integration

Restricted discussion draft. This RFC describes a prospective adapter, not a shipped or validated Saifuro integration. Existing Arkhe primitives are local implementation evidence, not qualification of this proposed flow.

## Problem and scope

The pilot asks whether a reviewer can verify a disclosed authorization statement, its ingestion record and a separately attributed execution outcome with a stable trust bundle. It does not attempt to replace authorization, escrow contracts or a payment rail. It does not infer settlement from allow.

## Evidence model

Preserve the original signed token bytes. Decoding and re-encoding a JWT does not preserve its signed representation. A parser must reject malformed encodings, unexpected algorithms and ambiguous structures under the agreed profile. The adapter records the issuer, key identity and the verification policy version used locally. Trust roots come from an approved out-of-band configuration, not an arbitrary key supplied inside the bundle.

The adapter must bind each record to tenant, environment, source identifier and correlation identifier. A namespaced digest of the original source bytes supports idempotency. The same identity with different content is a conflict, never an overwrite. Raw signed bytes remain access controlled and encrypted when retained.

## Proposed pipeline

1. An approved source exports a signed verdict and permitted decision metadata.
2. The adapter validates syntax, signature and agreed claims against a pinned verification profile.
3. A separate source provides outcome evidence such as a provider receipt or a chain transaction reference with chain identity and finality status.
4. Arkhe records the ingestion operation as a WorkerExecutionRecord and links evidence digests in WormGraph.
5. A checkpoint signer with an agreed trust policy signs the export boundary.
6. A reviewer verifies the disclosed objects and inclusion proof against that retained checkpoint.

No payment path depends on this pilot. Evidence failure prevents issuance of a successful evidence receipt, but does not introduce a payment hold or override Saifuro policy. A future mandatory evidence gate would require a separate failure and reconciliation design.

## Mapping to current Arkhe types

The local WorkerExecutionRecord contains module_id, module_version, input_digest, output_digest, evidence_refs, confidence_bps, uncertainty_note and execution_id, with optional typed bindings. Use module_id for the adapter and module_version for its release. input_digest identifies the agreed input envelope; output_digest identifies the validation report. evidence_refs lists content digests of retained source objects. execution_id uses the agreed tenant and event namespace. A WER records this adapter operation, not a claim that the underlying purchase executed.

Do not add payment fields to a core WER by implication. A versioned sidecar envelope carries tenant, source event identity, record kind, environment, source digest, related authorization digest, outcome reference, observation time and local validation report. Its complete wire schema and digest domain must be frozen before implementing the adapter. This document does not claim an existing Saifuro API accepts that envelope.

## Verification profile

Separate current authorization checks from historical evidence checks. Live acceptance requires freshness at the actual time, permitted mandate binding and replay controls. A historical report can evaluate whether a retained token met a stated policy at a documented past time, but must report that evaluation as historical. It cannot revive an expired approval or infer current revocation status. Retain trusted key history and the evidence supporting the chosen verification time.

The public Saifuro verification profile uses ES256 JWTs [S10]. EIP-712 and secp256k1 are not interchangeable with ES256. The escrow job description and public token documentation leave an audience question to resolve [S05, S11]. Ask for the exact escrow payload, curve, domain binding and chain assumptions before proposing an onchain verifier. A separate signed wrapper cannot silently strengthen the original issuer's statement.

## Trust and privacy boundaries

A trusted checkpoint proves inclusion within its stated scope. Detecting omission requires source reconciliation, counts, cursor boundaries and expected sequence checks. Detecting split views needs independently retained checkpoints or an agreed external consistency mechanism. A hash of personal data can remain identifying and a hash of low entropy fields can leak information. Do not publish raw tokens, mandates, amounts, customer identifiers or small-domain digests to public logs without a reviewed design.

Keep the event graph's relationships distinct from demonstrated causation. Preserve source attribution and uncertainty. A settlement reference without an authenticated receipt and finality policy is an observation. Reorganizations, reversals and refunds become new linked events. Never rewrite a previous record as if it had not existed.

## State handling

Use received, validated, recorded, exported and reconciled as adapter lifecycle states. Use rejected or quarantined for failed validation and conflicting inputs. Outcome status is independent: unknown, pending, observed, finalized under the agreed rail policy, failed, reversed or refunded. A missing outcome remains unknown. Duplicate ingestion returns the prior evidence identity without consuming another billing unit.

## Open questions for Saifuro

Which export or webhook is stable and authorized for the pilot? What is the signed boundary for decision metadata and enforcement mode? Can a signed or otherwise attributable mandate snapshot be supplied? What does policy_version mean for the chosen environment? Which source proves settlement? How are event gaps and backfills detected? What key history is available? Does the escrow use a distinct envelope with audience binding? What data may leave the service, and who is authorized to review it?

## Local evidence and limitations

L02 defines WER, L05 implements signed checkpoint verification, and L10 exposes WASM verification entry points for existing Arkhe profiles. None establishes a Saifuro ES256 adapter. L06 reports earlier local test runs; those runs were not repeated for this documentation task. No Saifuro credentials, sandbox calls, deployed contracts or production funds were used.
''')

add('06_PILOT_PLAN_EN', '''# Proposed pilot plan and acceptance criteria

This plan is a negotiation input for the SOW. Duration, staffing and targets are proposals until signed. Use synthetic data first and no customer funds.

## Phases

Week 1 after kickoff: validate rights and access, agree one evidence profile, record a baseline review workflow, freeze synthetic fixtures and trust roots. Exit requires written approval of schema and threat model.

Week 2: implement the isolated ingestion adapter and a deterministic export. Exit requires reproducible builds and traceable WER mapping. An experienced engineer owns implementation review. Rafael leads requirements and evaluation design within his demonstrated skills.

Week 3: run negative, concurrency and recovery scenarios. Exit requires evidence of rejection, idempotency and reconciliation. Record defects and their severity.

Week 4: an independent reviewer verifies a bundle offline, compares the workflow with the baseline and issues a signed acceptance or reasoned rejection. The team decides whether to license, extend, stop or redesign. Four weeks is an estimate, not an unconditional delivery guarantee.

## Test matrix

T01 valid synthetic statement and matching outcome: bundle validates against approved fixture roots. T02 altered token byte: signature or digest check rejects. T03 untrusted key or wrong issuer: rejects. T04 unknown key version: quarantines until an approved trust update. T05 expired token presented for live use: rejects; historical analysis has a separate labelled result. T06 wrong recipient, amount, currency or operator mandate: rejects under the agreed profile. T07 repeated source event: same evidence identity, no duplicate charge. T08 same event ID with conflicting bytes: quarantines and reports conflict.

T09 missing outcome: reports authorization only. T10 outcome followed by reversal or reorganization: appends a new event and updates derived status without rewriting evidence. T11 reordered and missing events: reconciles to source cursor and identifies gaps. T12 storage failure after validation: issues no successful recording receipt. T13 tenant mismatch: rejects cross-tenant read or link. T14 changed checkpoint or proof: rejects. T15 unknown or revoked trust root: follows the agreed retained-key policy and reports uncertainty. T16 sandbox data submitted as production: rejects. T17 malicious JSON, size overflow and invalid encoding: rejects within resource limits. T18 competing ingestion workers: one durable event identity and consistent replay results.

## Measurement

Measure ingestion latency, export latency and offline verification separately, including record count, bytes, CPU, runtime, operating system, cache state and cryptographic profile. Report p50 and p95 from a declared sample. No sub-50 ms target is asserted as achieved. Compare minutes of reviewer effort on the same frozen task set with and without the bundle. Any cost saving is measured, not projected as a fixed percentage.

Coverage means the fraction of expected source records represented in a reconciled export window, not the percentage of all customer payments in existence. Invalid fixture acceptance must be zero in the agreed mandatory suite. This is a pilot criterion, not a guarantee that all vulnerabilities are absent.

## Exit package

Versioned schema, synthetic fixtures, test results, source revision identifiers, build instructions, operator runbook, trust material, sample bundle, independent review notes and a defect register. Mainnet escrow code and deployment are excluded. Expansion requires a signed change order and an external smart contract audit where applicable.
''')

add('07_IP_REGISTER_EN', '''# Background IP and license reconciliation register

Internal working register. Local files demonstrate declarations and implementation content, not a completed legal chain of title or public release history. Resolve this register before offering proprietary evaluation rights.

## Existing components

IP01 arkhe-core at kernel/arkhe-core: package inherits workspace license Apache-2.0 OR MIT [L01, L09]. Owner and contributor assignments pending. Record the exact commit or file manifest, distribution history and applicable notices. Do not describe the entire module as a private trade secret.

IP02 arkhe-wormgraph at evidence/arkhe-wormgraph: inherits the same declaration [L03]. Existing checkpoint and storage code is Background IP to the extent lawfully owned, subject to existing licenses. Publicly disclosed portions cannot become confidential by a later label.

IP03 arkhe-verify-wasm at verification/crates/arkhe-verify-wasm: inherits the same declaration [L04]. Identify the binary build, dependencies and source correspondence. No Saifuro-specific verifier is established by this register.

IP04 specifications and design documents: record each file separately, author, dates, previous disclosure and license. Standards and generic techniques such as CBOR, BLAKE3, Merkle proofs and JWT are not exclusively owned merely because used in Arkhe.

IP05 undisclosed know-how or private extensions: NONE identified for delivery yet. Add only specifically enumerated materials that Rafael or his contracting entity can lawfully license. Mark disclosure restrictions and supporting title evidence.

IP06 proposed Saifuro adapter: not yet delivered. It is future project work. Assign ownership and license per signed SOW. Payment alone or collaboration alone must not be treated as proof of assignment.

## Chain of title tasks

Confirm whether Rafael contracts personally or through an incorporated entity. Verify legal name, address and tax handling privately. Collect contributor assignments, employment constraints and third party licenses. Identify AI tool terms and human authorship evidence where relevant. Preserve original history, release packages and notices. Do not rewrite existing licenses as part of this task.

## Release schedule fields

For every proposed disclosure record: material ID, file path, version, SHA-256, owner, provenance evidence, applicable license, confidentiality basis, recipient, allowed activity, start and expiry, storage location and deletion exceptions. A row marked pending is not approved for release.

## Economic boundary

Services, managed operation, support, verified delivery and genuinely private extensions can be priced separately from rights already available under open source terms. Do not charge royalties on the premise that a recipient lacks permissions it already holds. Any exclusive field license needs a defined field, duration, rights chain and carveout for existing grants.
''')

LEGAL_HEADER='Draft for negotiation and legal review. Not for signature until all bracketed fields and schedules are completed. No statement of verified title, corporate status or enforceability is implied.'
PARTIES='The parties are [Rafael Henrique do Nascimento Oliveira acting personally OR exact incorporated Arkhe entity], of [address], notice email [email] (Arkhe), and [confirmed Saifuro legal entity], of [address], notice email [email] (Saifuro). Saifuro describes itself publicly as Saifuro LLC, Wyoming filing ID 2026-002073167. The receiving party must confirm that identity and signatory authority. Effective Date means the date of the last authorized signature below.'
SIGN='Arkhe legal name: [complete]. Authorized signature: [sign]. Printed name and capacity: [complete]. Date: [complete].\n\nSaifuro legal name: [complete]. Authorized signature: [sign]. Printed name and capacity: [complete]. Date: [complete].'
LAW='Governing law is [agreed jurisdiction], excluding its conflict rules, subject to mandatory applicable law. Courts with exclusive jurisdiction are [agreed location and competent courts]. No default is created by the state of incorporation or the website terms. The parties must complete this clause consistently across the transaction documents before signature.'

add('08_UNILATERAL_NDA_EN', f'''# Unilateral confidentiality agreement

{LEGAL_HEADER}

## Parties and purpose

{PARTIES} Arkhe may disclose nonpublic information solely to evaluate a possible evidence integration with Saifuro (Purpose). This agreement imposes confidentiality duties on Saifuro as recipient. It is not a mutual NDA.

## Confidential information

Confidential Information means nonpublic information disclosed by Arkhe in connection with the Purpose, marked confidential or reasonably understood as confidential from its nature and context. Oral disclosures should be summarized in writing within 15 days, without defeating protection for information that is plainly confidential. The disclosure register identifies versions and permitted recipients. Public code, public standards and materials already available under an applicable open source license are not made proprietary by this agreement.

## Exclusions

Information is excluded to the extent Saifuro can demonstrate it was lawfully known without duty before disclosure, becomes public without breach, is independently developed without use of Confidential Information, or is lawfully received without restriction from another source. A combination is not excluded solely because separate elements are public if the nonpublic combination qualifies for protection.

## Protection and permitted access

Saifuro will use Confidential Information only for the Purpose and protect it using at least reasonable care and the care applied to comparable information of its own. Access is limited to employees and professional advisers with a need to know and enforceable duties at least as protective. Saifuro is responsible for their compliance to the extent permitted by law. Contractors or affiliates require identification in the register or Arkhe's written approval. Affiliates are not automatically parties.

Saifuro will not disclose restricted materials to public repositories or third party AI services that retain inputs or use them for training without prior written consent and agreed safeguards. It will promptly notify Arkhe after discovering unauthorized access or disclosure and cooperate in containment and preservation of relevant evidence.

## Required disclosure

Saifuro may disclose information legally required by a competent authority. To the extent lawful, it will give prior notice, disclose only what is required and reasonably assist Arkhe in seeking protection at Arkhe's expense. Nothing prohibits lawful reports to authorities or protected disclosures under applicable whistleblower law.

## No development license or transfer

Each owner retains existing rights. No patent, copyright, trademark or production license is granted. Evaluation requiring execution or copying of software needs the separate evaluation agreement. Existing third party and open source rights remain unaffected. Timestamp and hash records may support evidence of integrity or existence, but do not conclusively establish authorship, ownership or patentability. No new connector ownership is assigned by this NDA.

## Return and retention

On written request or end of discussions, Saifuro will cease use and within 15 business days return or delete Confidential Information, with reasonable written certification on request. It may retain copies required by law, professional duties or a documented legal hold, and inaccessible rotating backups until ordinary deletion. Retained information remains protected and cannot be used for evaluation or commercial purposes.

## Term and remedies

The disclosure period is 12 months after the Effective Date. Confidentiality and use restrictions survive for five years after each disclosure, and for qualifying trade secrets for as long as they remain trade secrets under applicable law. Either party may end future disclosures by notice without extinguishing duties on prior disclosures. An aggrieved party may seek equitable relief subject to the court's discretion and applicable requirements, including security if ordered. No remedy or finding of irreparable harm is automatic.

## General provisions

Information is provided as is for evaluation, without a promise that a transaction will occur. Neither party must disclose information, hire, pay, grant equity or form a partnership. No publicity or use of the other party's marks is authorized. Amendments require signed writing. Neither party may assign this agreement without consent, except an agreed successor assuming all duties [confirm permitted succession]. Notices use the addresses above. Counterparts and lawful electronic signatures are permitted. This agreement supersedes prior unsigned drafts on this subject only; any existing signed agreement must be identified and expressly reconciled.

## Law and signatures

{LAW}

{SIGN}

Schedule A: disclosure IDs [complete], authorized recipients [complete], handling restrictions [complete]. Existing signed confidentiality agreements [none confirmed or list].
''')

add('09_MUTUAL_NDA_EN', f'''# Mutual confidentiality agreement

{LEGAL_HEADER}

## Parties and purpose

{PARTIES} Each party may disclose information to assess a possible evidence integration (Purpose). For each disclosure, the source party is Discloser and the other is Recipient.

## Protected information and exclusions

Confidential Information is nonpublic information disclosed for the Purpose, marked confidential or reasonably recognized as confidential. Oral disclosures should be summarized within 15 days. Exclusions apply where Recipient demonstrates prior lawful unrestricted knowledge, independent development without use, lawful unrestricted receipt or public availability without breach. Public standards, publicly licensed code and existing license permissions remain unaffected.

## Recipient duties

Recipient will use the information only for the Purpose, apply at least reasonable care and restrict access to representatives who need it and have equivalent enforceable duties. Recipient remains responsible for authorized representatives as permitted by law. Affiliates and contractors require written identification. No disclosure to public AI training or retention services or public repositories without consent. Recipient will promptly report unauthorized access and cooperate in mitigation and evidence preservation.

## Compelled disclosure and protected reporting

Legally compelled disclosure is permitted with prior notice where lawful, minimization and reasonable protective assistance at Discloser's cost. Nothing limits lawful reports to authorities, protected whistleblowing or nonwaivable rights.

## IP and evaluation boundary

Each party retains its existing IP. No production or development license, ownership transfer, feedback assignment or partnership arises. Software testing requires a separate evaluation license unless already permitted by an existing license. No residual memory exception authorizes use of trade secrets. Hashes and timestamps support evidence subject to their technical and legal limits and do not create ownership.

## Duration and disposal

The disclosure period is 12 months. Duties continue for five years from each disclosure and for qualifying trade secrets while legally protected. Either party may end future disclosures by notice. On request, Recipient will return or delete information within 15 business days, subject to legal holds, mandatory archives and inaccessible rotating backups. Retained copies remain restricted and may not be used operationally. Reasonable deletion certification is available on request.

## General terms

Disclosures are as is for evaluation. No party is required to transact, employ or disclose further information. No publicity or mark use without written consent. Equitable relief is available only subject to applicable law and judicial discretion. Notices go to the stated addresses. Amendments and assignments require consent, subject to [agreed successor exception]. Electronic counterparts are permitted. This text supersedes unsigned drafts only. List any signed agreement it is intended to amend or replace in Schedule A.

## Law and signatures

{LAW}

{SIGN}

Schedule A: prior agreements [complete], disclosure register [complete], representatives [complete]. Choose either this mutual form or the unilateral form for the same disclosures, and reconcile precedence explicitly.
''')

add('10_IP_EVALUATION_AGREEMENT_EN', f'''# Intellectual property evaluation agreement

{LEGAL_HEADER}

## Parties and authorized purpose

{PARTIES} Authorized Purpose means internal nonproduction evaluation of whether the specifically listed Materials can support an evidence integration. This agreement does not authorize paid customer service, mainnet deployment or movement of real customer funds.

## Materials and license

Materials are only items listed by version and digest in Schedule A and lawfully controlled by Arkhe. Subject to this agreement, Arkhe grants Saifuro a nonexclusive, nontransferable and nonsublicensable license during the Evaluation Period to install, execute and make the minimum internal copies necessary for the Authorized Purpose. No source code is included unless Schedule A expressly says so. No license to unspecified repositories is granted. Existing open source and third party permissions continue on their own terms and are not restricted or revoked by this agreement.

## Period and environment

The Evaluation Period is [60] days from [confirmed delivery date], subject to the signed schedule. Approved users, machines, storage and network access are listed in Schedule A. Only synthetic or expressly approved sandbox data may be used. No production credentials, private wallet keys or personal data are permitted unless a separate written data arrangement is completed first.

## Permitted development and restrictions

Saifuro may write the test harness and adapter specified in Schedule B. Changes to supplied source are permitted only for enumerated files and activities in Schedule A. All other modifications, distribution, sublicensing and customer-facing use are prohibited to the extent Arkhe controls those rights. Reverse engineering is prohibited only to the extent permitted by law and consistent with applicable license rights. No publication of nonpublic benchmark results without mutual approval, except required legal or regulatory disclosure. Internal testing and reporting security findings to the other party are permitted.

## Confidentiality and security

The signed NDA dated [complete] governs confidential disclosures. If no NDA is executed, the confidentiality section of this agreement requires reasonable care, Purpose-limited use, access only for identified representatives under equivalent duties, prompt incident notification and exclusions for lawful prior knowledge, independent development, lawful third party receipt and public information. Compelled disclosures and protected reporting remain permitted. Qualifying confidential information is protected for five years after disclosure and trade secrets while protected by law. No upload to external AI services without written agreement covering retention and training.

## Ownership and project work

Each party retains Background IP identified in Schedule A. New project work is Foreground IP and has the owner and license stated per deliverable in Schedule B. Collaboration does not assign it automatically to Arkhe or Saifuro. Development of a deliverable may not begin with ownership marked unresolved. No joint ownership, patent assignment or broad rights to derivative technology arise by default. Any necessary assignment requires a signed instrument and contributor authority. Third party rights and existing grants survive.

## Feedback and results

Each party may voluntarily provide nonconfidential general feedback and grants the other a nonexclusive, royalty-free right to use that feedback for product improvement. This does not license confidential architecture, source code or patent rights. Evaluation results are shared internally between the authorized teams. Each retains its own test code and legally required evidence subject to confidentiality and the agreed ownership schedule.

## Fees and support

Evaluation license fee is [amount and currency or expressly zero]. Services, milestones and expenses require a signed SOW. Neither unpaid engineering labor nor a production service commitment is implied. Support contact, hours and response target are [complete]. No salary, royalty, exclusivity or equity is created. Any commercial phase needs a separate executed agreement.

## Warranties and liability

Arkhe states only that it has authority to grant the rights expressly granted for scheduled Materials, subject to disclosed restrictions. Evaluation Materials are otherwise provided as is without fitness, availability or security warranty to the extent permitted by law. Neither party excludes liability that cannot lawfully be excluded. Aggregate liability cap is [negotiated amount and currency], with expressly agreed exceptions [fraud, willful misconduct, confidentiality or IP misuse as negotiated]. Neither this placeholder nor a zero fee silently creates unlimited or zero liability. Exclusion of indirect damages and its exceptions are [complete with counsel].

## Termination and retention

Either party may end the evaluation on ten business days' notice. A material breach permits termination after five business days to cure, except urgent security containment may suspend access immediately. On expiry, Saifuro stops activities authorized only by this license and within 15 business days returns or deletes restricted Materials. Existing open source rights survive. Legal hold copies, mandatory records and inaccessible backups may remain isolated, confidential and unavailable for operational use. Provide reasonable certification on request. Ownership, accrued payments, confidentiality, agreed liability and dispute terms survive as applicable.

## Provenance and general terms

A digest identifies exact bytes. An authenticated timestamp can support prior existence under its trust model, without conclusively establishing authorship or title. No clause turns an unverified record into absolute proof. The parties are independent. No exclusivity, employment or public announcement is authorized. Amendments, schedules and changes require signatures. Notices use the stated addresses. Electronic counterparts are permitted. Entire agreement for this evaluation comprises this text, completed schedules, the identified NDA and any expressly incorporated SOW. Existing signed agreements must be reconciled explicitly.

## Law and signatures

{LAW}

{SIGN}

## Schedule A materials and rights

Material ID [complete]. File or package [complete]. Version and SHA-256 [complete]. Owner and title evidence [complete]. Existing license [complete]. Confidential portions [complete]. Permitted source modifications [complete or none]. Approved users and environment [complete]. Delivery date [complete]. Expiry [complete]. No item is approved while these fields remain unresolved.

## Schedule B project work

Deliverable [complete]. Creator [complete]. Owner [complete]. License to the other party [complete]. Transfer trigger and payment dependency [complete]. Background and third party dependencies [complete]. Permitted reuse [complete]. Acceptance criteria [complete].
''')

add('11_NONBINDING_LOI_EN', f'''# Nonbinding letter of intent

{LEGAL_HEADER}

{PARTIES}

## Proposed cooperation

The parties intend to explore a limited evidence pilot connecting authorized Saifuro exports with an Arkhe verification bundle. The proposed pilot uses synthetic or approved sandbox records, an isolated adapter and written evaluation. Scope and duration remain subject to a signed SOW and evaluation agreement. Neither party commits to production deployment.

## Commercial discussion

Pricing model [fixed milestone fees or alternative], budget ceiling [complete], staffing [complete] and ownership allocation [complete] are discussion points only. No minimum volume, investment, salary, royalty, employment or equity is promised. Any equity instrument would require a separate approved grant and its own terms.

## IP and confidentiality

Existing IP and existing open source licenses remain with their lawful holders. The parties will inventory Background IP and expressly allocate new deliverables. This letter grants no testing or production license. Confidential disclosures, if any, are governed only by the separately executed NDA dated [complete]. If no NDA is signed, the parties will exchange public information only.

## Process and expiry

Target date for a written pilot decision is [complete]. Each party bears its own negotiation costs. Either may stop discussions at any time. No exclusivity, noncompete or nonsolicitation obligation applies. No agency, partnership or fiduciary relationship is formed. Public announcements require separate consent.

## Nonbinding effect

All provisions of this letter are nonbinding statements of present intention. Any intended binding obligation must appear in a separately executed NDA, evaluation agreement or definitive contract. Signature only acknowledges the discussion framework and creates no obligation to negotiate or conclude a deal. Expiry is [date].

Acknowledged for discussion only. {SIGN}
''')

add('12_MASTER_SERVICES_AGREEMENT_EN', f'''# Master services agreement

{LEGAL_HEADER}

## Parties and orders

{PARTIES} Arkhe provides only services described in signed Statements of Work. Each SOW identifies deliverables, staff, dependencies, fees, acceptance and dates. Neither party must order work. No mainnet custody or deployment service is included by implication.

## Performance and cooperation

Arkhe will perform the agreed services with reasonable skill and care using qualified personnel. Saifuro supplies lawful access, decisions and test information identified in the SOW. A delay caused by an unmet dependency is documented and rescheduled by agreement. Neither party makes commitments on behalf of the other. Subcontractors accessing confidential information need agreed safeguards and disclosure in the SOW.

## Change control and acceptance

Changes to scope, timeline or price require a written change order signed by both parties. On delivery, Saifuro has ten business days to accept or give a specific written rejection against objective SOW criteria. Arkhe remedies reproducible nonconformities in the agreed period and resubmits for the same review. Silence is not acceptance unless an SOW expressly establishes a mutually agreed deemed-acceptance mechanism. The parties escalate unresolved defects to their project leads, then business representatives. Security defects remain tracked through closure.

## Fees and taxes

Fees and currency are stated in each SOW. Invoices are due within [30] days after receipt and any agreed milestone acceptance. Saifuro notifies disputed amounts promptly with reasons and pays undisputed amounts on time. Expenses require prior approval. Taxes, legally required withholding, supporting certificates and any gross-up are [complete]. Stablecoin payment, if chosen, requires a separate payment instruction identifying token, network, recipient verification, costs, FX basis and failure treatment. No wallet signing is required for recruitment or evaluation verification.

## IP and delivery rights

Each retains Background IP, subject to existing licenses. SOW schedules expressly identify ownership and license for each new deliverable. If a deliverable is assigned, transfer occurs only at the agreed trigger and excludes scheduled Background IP and third party components. The owner grants the other only the rights stated in the schedule. No implied joint ownership arises. Arkhe will disclose relevant third party terms and preserve required notices. Unresolved ownership blocks development of the affected deliverable. Publicly licensed components retain their existing rights regardless of payment or termination.

## Confidentiality and data

The executed NDA dated [complete] is incorporated. Personal data processing requires the applicable DPA before it starts. The SOW identifies approved AI tooling, source code disclosure limits, retention and subcontractors. Neither party may use the other's confidential materials to train or improve externally available models without express permission. No customer funds or private keys are delivered to Arkhe under this MSA.

## Warranty and remedy

For [30] days after acceptance, Arkhe will correct service deliverables that materially fail the agreed criteria, excluding unauthorized changes, misuse or third party failures. Parties agree an alternative refund or termination remedy if cure is unsuccessful [complete]. No error-free operation, regulatory compliance, certification or business outcome is warranted. Each party warrants authority to enter the agreement and to provide the materials it supplies.

## IP claims and liability

An IP indemnity, if agreed, covers [defined third party claims attributable to supplied deliverables], subject to prompt notice, defense control, cooperation, permitted settlement and exclusions for customer materials or unauthorized combinations. The indemnifying party may procure rights, modify, replace or refund affected fees as agreed. Scope and financial cap must be completed; no indemnity is presumed from this placeholder.

Aggregate liability is capped at [amount or defined fees over period], with negotiated exceptions [complete]. Consequential damages exclusions and treatment of data restoration, confidentiality, IP claims, fraud and willful misconduct are [complete]. Mandatory liabilities remain unaffected. The parties will not sign with these economic allocations unresolved. Equitable relief remains subject to applicable law and court discretion.

## Termination and transition

Either may terminate an SOW for material breach after 15 business days' written cure opportunity. Convenience termination is [permitted on 30 days' notice or other agreement], with payment only for accepted work, agreed work in progress and preapproved noncancelable costs. Arkhe supplies paid-for deliverables and a reasonable handover within scope. Return or deletion follows the NDA and lawful retention rules. Existing licenses and accrued rights survive. Production access changes follow an agreed continuity plan and do not authorize withholding customer funds.

## Operational and general terms

Service levels apply only under a signed SLA to identified hosted services. Personnel are independent contractors unless separately employed. Employment, invention assignment, conflicts and Arkhe's preexisting work must be addressed separately if Rafael is hired. No publicity, mark use, exclusivity or noncompete is granted. Assignment, force majeure, notices, insurance, compliance with applicable laws and electronic execution are governed by [completed general terms]. Force majeure does not excuse accrued payment or reasonable security duties. Amendments require both signatures.

## Precedence and disputes

A signed change order overrides only the provisions it identifies. A DPA controls personal data processing conflicts. The IP schedule controls expressly identified ownership and license conflicts. The NDA controls confidentiality conflicts. An SOW overrides the MSA only where it specifically names the clause and amendment. Remaining MSA terms prevail. The parties must reconcile these rules with any existing signed agreement before signing.

{LAW}

{SIGN}
''')

add('13_STATEMENT_OF_WORK_EN', f'''# Statement of work for evidence pilot

{LEGAL_HEADER}

This SOW is between the parties identified in the MSA dated [complete] and the evaluation agreement dated [complete]. If either is absent, do not begin work until a complete governing contract is agreed.

## Objective and exclusions

Evaluate independently verifiable evidence bundles for one agreed Saifuro export profile. Use synthetic records initially. Deliver no mainnet escrow contract, wallet service, payment execution permission, regulatory certification or blanket security audit. Production use requires a new scope.

## Deliverables and dependencies

D1 evidence profile and threat model: schema, trust roots, data classification and source mapping, due [date]. D2 adapter prototype: source code for agreed files, deterministic replay and test fixtures, due [date]. D3 offline bundle and verification instructions: approved checkpoint format and independent reviewer exercise, due [date]. D4 evaluation report and handover: measured results, known defects, runbook and commercial recommendation, due [date].

Saifuro supplies a designated engineer, lawful source access, sandbox documentation and expected event set. Arkhe supplies specification leadership and [named qualified implementing engineer]. Rafael's role is requirements, context engineering and evaluation coordination, not unreviewed Solidity ownership. Start date depends on completed access, rights and staffing.

## Milestones and acceptance

M1 accepts D1 only after both leads approve the profile. M2 accepts D2 when the agreed synthetic corpus imports deterministically, duplicates are idempotent and conflicting identities quarantine. M3 accepts D3 when the independent reviewer verifies it offline with pinned trust material and all mandatory negative tests reject. M4 accepts D4 after documented reconciliation of expected records, latency measurement conditions and defect disposition.

Use tests T01 to T18 in the pilot plan, with exact versions and fixtures attached before signing. Mandatory failures block acceptance. Fix and resubmit under the MSA's ten-business-day review. No performance threshold is achieved merely because this SOW mentions it. Proposed acceptance target for each metric [complete], including sample size, environment and allowed exceptions.

## Price and changes

Currency [complete]. M1 fee [complete], M2 fee [complete], M3 fee [complete], M4 fee [complete]. Total authorized budget [complete]. Payment depends on the stated milestone acceptance and invoice terms. License fee, taxes and expenses [complete]. No open-ended time commitment. Additional sources, production data, public anchoring, TEEs, onchain code or new protocols require a signed change order.

## IP and data schedule

List each D1 to D4 output with creator, owner, license to the other party, transfer trigger, reuse rights and Background IP dependencies. Do not start any deliverable with unresolved ownership. Existing permissive licenses remain intact. Store data in [approved location] for [period]. No real personal data until the required DPA is completed. No public repository or public log publication of restricted content.

## Owners and completion

Arkhe lead [complete]. Saifuro lead [complete]. Independent reviewer [complete]. Weekly written status includes blockers, decisions, defects and changes. Completion creates no commitment to employment or commercial launch. Final decision options are accept, extend under signed scope, redesign or stop.

{SIGN}
''')

add('14_IP_AND_SOFTWARE_LICENSE_EN', f'''# Development IP and software license schedule

{LEGAL_HEADER}

This schedule attaches to the MSA and SOW identified as [complete]. It combines allocation of development IP with a defined software license. It does not create an unspecified joint venture or override existing open source grants.

## Background and third party rights

Background IP means materials owned or controlled before this project, or independently developed without the other party's confidential information, specifically listed in Register A. Record material, owner, version, digest, license, existing distribution and title evidence. Public standards and third party software are not assigned to either party. Each warrants authority only for rights it grants, subject to disclosed restrictions.

## New project work

Register B identifies each new deliverable, creator, owner, transfer trigger and license to the other party. New work is Foreground IP even if it builds on a preexisting component. No ownership follows automatically from who suggested an idea or paid for time. Assignment must be explicit, signed and supported by contributor rights. Before creation the parties choose, for each item, one owner with the other licensed, separate ownership of separable contributions, or a specifically drafted joint ownership regime. Joint ownership is not the default.

## Licensed product and scope

For private software explicitly listed in Register C, the owner grants a [nonexclusive] license for [internal production purpose, field, entities, users and environments] for [term and territory]. State whether hosting, customer access, modification, distribution or sublicensing is permitted. Rights not expressly granted remain reserved. Existing open source permissions continue independently. A license cannot require payment for rights already lawfully granted under a permissive license, although services and additional private rights may be paid.

## Embedded dependencies and delivery

Where a connector requires Background IP, identify the minimum license required to use the connector, source or binary delivery, build materials, compatibility and support. A purported assignment does not include excluded components. Saifuro must be able to identify what it can continue using after project termination. No secret dependency may be introduced without disclosure and approval.

## Fees and metering

Price is [fixed, subscription or usage formula]. A billable unit is [precise event], counted once after [defined acceptance point]. Duplicates, rejected events, internal tests and retries are [excluded or specified]. Currency, invoice period, caps, discounts, tax and dispute process are [complete]. Metering must be reproducible from agreed evidence, with tenant-safe inspection of billing records on reasonable notice. No implied million-transaction volume or revenue guarantee applies.

## Improvements and feedback

Each owns improvements as allocated in Register B. No broad feedback license transfers source, trade secrets or patents by accident. Any grant-back specifies scope, duration, field and sublicensing. General nonconfidential feedback may be used royalty free by agreement. Neither may use the other's mark or announce a partnership without written consent.

## Termination and continuity

License suspension and termination require the notice and cure in the governing agreement, except urgent security containment. Define transition period [complete], export assistance [complete], and whether paid perpetual connector rights survive [complete]. Open source permissions and legally accrued rights survive independently. An optional source escrow requires its own agent, deposit, verification and release events, and is not established here.

## Registers and signatures

Register A existing material [complete for each item]. Register B new deliverable and allocation [complete for D1 to D4]. Register C private licensed product and use limits [complete or none]. Register D third party notices and dependencies [complete]. All unresolved entries block affected delivery and commercial licensing.

{SIGN}
''')

add('15_SERVICE_LEVEL_SCHEDULE_EN', f'''# Service level schedule

{LEGAL_HEADER}

This schedule applies only if the parties order a specifically identified hosted Arkhe service under [MSA and order]. An offline verifier and an evaluation prototype have no implied uptime commitment.

## Service and measurement

Service endpoint, version, region, environments, dependencies and responsible operator are [complete]. Proposed monthly availability target is [99.9 percent or negotiated value], not a reported capability. Availability equals eligible minutes less unavailable minutes, divided by eligible minutes, multiplied by 100. Define the independent monitoring probe, interval, error threshold and start and end criteria in the order.

Scheduled maintenance is excluded only within [agreed notice and monthly allowance]. Customer-caused failures, approved changes and external rail outages are excluded only to the extent directly causal and documented. Operator failures and ordinary service dependencies are not automatically excluded. The monthly report includes raw probe evidence and disputed intervals.

## Incidents and recovery

Severity 1 means widespread service loss or suspected material data compromise. Notification route [complete], coverage hours [complete], initial response target [complete]. Severity 2 and 3 definitions and targets [complete]. Response is acknowledgment and triage, not guaranteed resolution. Restoration updates follow [cadence]. Root cause report is due [business days] after stabilization.

RPO [complete] and RTO [complete] apply only after an agreed recovery test. Backup frequency, retention, isolation and restoration tests are [complete]. No recovery target is warranted from design documents alone. A failed evidence write issues no success receipt. Source reconciliation repairs gaps after recovery.

## Credits and exit

Credit bands, claim period and maximum monthly credit are [complete]. Credits apply only to service fees for the affected service, with [agreed] treatment of chronic failure. Credits are not the exclusive remedy for confidentiality breach, IP misuse or liabilities that cannot lawfully be limited. Repeated material failure gives the termination right defined in the order. No zero-fee evaluation generates a fictitious service credit.

## Change and signatures

Changes to probes, exclusions or targets require written agreement. This schedule does not certify security or compliance. No customer money or payment execution authority is provided to the operator by this schedule.

{SIGN}
''')

add('16_DATA_PROCESSING_ADDENDUM_EN', f'''# Data processing addendum

{LEGAL_HEADER}

This addendum applies only to processing described in completed Annex 1 under [main agreement]. Determine controller and processor roles from actual activities. Neither Saifuro nor Arkhe is automatically controller or processor solely because of this template.

## Scope and instructions

Controller [complete] appoints Processor [complete] for the subject matter, duration, purpose, data categories and data subjects in Annex 1. Processor processes only documented lawful instructions, including approved international transfers, unless law requires otherwise. It informs Controller of a legal requirement where permitted and of instructions it reasonably considers unlawful. Each party handles its independent controller activities under its own obligations.

## Minimization and personnel

Use synthetic records where feasible. Do not provide wallet private keys, authentication secrets, payment card data or unnecessary identity documents. Hashes and pseudonyms are not presumed anonymous. Access is limited to trained authorized persons under confidentiality obligations. Processing for advertising, sale, unrelated analytics or model training is prohibited without a separate lawful instruction and basis.

## Security measures

Annex 2 specifies encryption in transit and at rest, access control, tenant isolation, key custody, logging, vulnerability handling, backups, restoration tests, retention and deletion. Measures must match the actual system and risk. Processor will document material changes and not materially reduce agreed protection during the term without agreement. No unverified SOC or ISO certification is represented.

## Subprocessors and transfers

Annex 3 lists legal names, purposes and locations of approved subprocessors. Prior [specific or general] written authorization is required. For general authorization, give [30] days' advance notice and a reasonable opportunity to object on data protection grounds, with a defined resolution or termination path. Processor imposes equivalent applicable duties and remains responsible as required by law.

Annex 4 lists transfers, destination countries and mechanisms. Where required, execute the applicable approved contractual clauses and assessments, including the relevant EU or Brazilian transfer mechanism. This template does not itself establish transfer adequacy or substitute for mandatory clauses. Remote access can constitute a transfer requiring analysis.

## Rights and cooperation

Processor reasonably assists Controller with data subject rights, impact assessments, regulator inquiries and security obligations based on the nature of processing and information available. It forwards requests without responding substantively unless instructed or required. Controller remains responsible for lawful basis, notices, instruction legitimacy and its own deadlines. Costs for extraordinary assistance are agreed without defeating mandatory duties.

## Incidents

Processor notifies Controller without undue delay after awareness of a personal data breach and within [24 hours as a negotiated contractual target] where feasible. Initial notice includes known nature, affected data and subjects, likely consequences and mitigation, with updates as facts develop. Notification is not admission of liability. Preserve relevant evidence. Controller determines external notifications under applicable law; a contractual target is not a substitute for statutory deadlines.

## Audit and end of processing

Processor provides information needed to demonstrate compliance and allows reasonable, proportionate review subject to confidentiality, tenant protection and security constraints, without preventing mandatory regulator access. At end of service, return or delete personal data at Controller's choice within [period], except lawful retention and inaccessible backups under a defined rotation. Retained data stays isolated and restricted. Maintain evidence needed for legal obligations and disputes under an identified basis.

## Applicable rules and precedence

Identify applicability of LGPD, GDPR and other law in Annex 1. This addendum does not create AI Act compliance or a SOC report. Mandatory approved transfer clauses prevail over conflicting terms. This addendum controls processing conflicts with the main agreement. Governing law and liability follow the completed main agreement only to the extent consistent with mandatory data protection rules.

## Annexes and signatures

Annex 1 processing details and roles [complete]. Annex 2 implemented technical and organizational measures [complete]. Annex 3 subprocessors [complete or expressly none]. Annex 4 locations, transfers and legal mechanism [complete or expressly none]. Controller contact [complete]. Processor security and privacy contact [complete]. Do not process live personal data with these annexes incomplete.

{SIGN}
''')

add('17_COMMUNICATIONS_EN', '''# Draft correspondence

These are unsent drafts. Use only statements that match what actually occurred. Do not say a meeting is booked, an agreement is signed or an email was sent without checking.

## Identity confirmation email

To: contact@saifuro.com
Subject: Confirmation of recruiting contact for the EVM engineering role

Hello Saifuro team,

I applied for your Smart Contract Engineer EVM role and received a Telegram message from [exact username] identifying themselves as Ed Wynand. The message proposed an introductory call on 3 November through [received meeting URL]. Could you confirm that this person and invitation are part of your hiring process and send the invitation through your corporate email?

I obtained this contact address from your hiring safety page. Thank you for helping me verify the details.

Best regards,
Rafael Oliveira

## Partnership introduction email

To: contact@saifuro.com
Subject: Arkhe evidence pilot proposal alongside my application

Hello Ed and Saifuro team,

Thank you for considering my application. I want to clarify my background before our conversation. My strengths are Web3 product reasoning, context engineering and specifications supported by AI. I am not an experienced production Solidity engineer.

Separately from the hiring process, I would like to explore whether Arkhe could complement your existing decision log with independently verifiable evidence bundles. The proposed pilot would link an authorization statement to separately sourced execution evidence, using synthetic or approved sandbox data. It would not receive customer funds or wallet keys.

I have prepared a short public brief. If this is relevant to your roadmap, could we identify a technical counterpart and agree a written problem statement? Restricted materials can follow under an appropriate NDA and a limited evaluation agreement after we reconcile ownership and existing licenses.

I am happy to keep the introductory call focused on the role and discuss the pilot separately.

Best regards,
Rafael Oliveira

## Telegram introduction

Hi Ed, thank you for the invitation. My strengths are Web3 product research, context engineering and written specifications supported by AI. I would like to be transparent that I do not have production Solidity experience. Would it be useful to discuss a specification or evidence-pilot collaboration separately from the EVM engineering role? Written follow-up would help me explain the details accurately.

## If the earlier NDA was actually emailed

Hi Ed, I sent a preliminary NDA draft to contact@saifuro.com on [actual date]. I am revising it because the earlier draft used an unverified entity name and overstated some IP and timestamp claims. Please treat it as a discussion draft. I can send a corrected version after we confirm the contracting entities and evaluation scope. Our introductory call can remain focused on public information.

## If a prior agreement was already signed

Hello [name], I would like to propose a written amendment to the agreement dated [actual date], to clarify the parties, existing licenses and the scope of any evaluation. I understand that a new draft does not itself amend the signed agreement. Could we identify the appropriate legal contact to review a proposed amendment together?

## Follow up after the call

Thank you for the conversation. My understanding is [specific agreed points]. The open questions are [list]. I propose a short written RFC and a synthetic-data pilot with a qualified implementation engineer. Please correct anything I misunderstood. No production work or IP transfer would begin before we agree scope, ownership and terms in writing.
''')

add('18_INTERVIEW_PREPARATION_EN', '''# Interview preparation for Rafael Oliveira

The pasted invitation asks for a five to ten minute introduction without slides and mentions 3 November 2026. The actual booking and time remain unconfirmed. This script is practice material and does not impersonate the actual CTO.

## Opening statement

Thank you for meeting with me. My spoken English is still developing, so I may pause or ask you to repeat a question. I can follow up in writing when a technical point needs more precision. Before we begin, I want to be clear that I have not shipped Solidity contracts to mainnet. My strengths are Web3 product reasoning, context engineering and written specifications supported by AI.

## Five minute introduction plan

Minute 1: introduce yourself and the strengths above. Explain that you are exploring whether those strengths fit the team's needs, without presenting yourself as a production Solidity specialist.

Minutes 2 and 3: describe Arkhe in plain language. My project explores how to preserve records of computational work so another reviewer can verify their integrity. The local repository includes canonical record types, an evidence graph and verification components. Some implementation status reports document local tests, while a Saifuro adapter is still a proposal. I want to distinguish what exists from what needs engineering and independent review.

Minute 4: explain the proposed evaluation. Your service already records authorization decisions. I would like to test whether an additional bundle helps a reviewer distinguish authorization from payment execution. The pilot would use synthetic data and would not touch customer funds. I can help structure requirements, threat questions and acceptance criteria, working with an experienced engineer.

Minute 5: explain what you seek. I applied because the problem interests me. I understand that the EVM role requires experience I do not currently have. If that is a strict requirement, I would still value feedback on whether a research, specification or pilot partnership could be useful. I would prefer a written technical follow-up so that I can express the details accurately.

For a longer introduction, add only a real personal example: [actual project], [your contribution], [artifact that demonstrates it], [what remains unverified]. Do not fill this with invented experience. Rehearse aloud with a timer; expand actual examples to reach the requested duration.

## Simulated conversation

Interviewer: Have you shipped Solidity contracts to mainnet?
Rafael: No. I have not. I would not take sole responsibility for production escrow security. My contribution would be requirements, context engineering and structured evaluation alongside an experienced engineer.

Interviewer: Why did you apply for this role?
Rafael: The agent payment problem is close to my Web3 research. After reviewing the responsibilities, I understand the gap in hands-on Solidity experience. I wanted to explore whether another collaboration could fit.

Interviewer: What would Arkhe add to our existing log?
Rafael: That is what the pilot needs to establish. My hypothesis is that a retained bundle could make some evidence checks easier for an independent reviewer. We should measure the difference against your current export process.

Interviewer: Does an allow verdict prove a payment happened?
Rafael: No. It records an authorization statement. A payment outcome needs separate evidence from the payment system or chain.

Interviewer: How would you verify our signatures onchain?
Rafael: I would first ask for the exact escrow envelope and verification profile. I understand the public documentation uses ES256 JWTs. I would need an experienced engineer to assess the correct verification path and its risks.

Interviewer: Is all Arkhe code proprietary?
Rafael: No. The local manifests declare permissive licenses for core components. I am reconciling the exact material and distribution history. Any commercial proposal would respect those rights and identify any private components separately.

Interviewer: How do you use AI?
Rafael: I use AI to help structure context, explore designs and draft specifications. I remain responsible for checking claims and I would require qualified review for security-critical implementation. I would not share your confidential material with external tools without permission.

Interviewer: What would success look like?
Rafael: A reviewer can verify an agreed synthetic bundle offline, tampering is rejected, duplicates are handled consistently, and missing settlement evidence stays visible. We measure review time rather than promise a savings percentage.

## Questions to ask

What is the main problem the EVM hire must solve in the first months? Does the escrow use a different signed envelope from the public JWT? How do you currently reconcile authorization and settlement? Who would review an evidence pilot? Can the next technical discussion be a written RFC? Would this be employment, consulting or an independent evaluation?

## Phrases for spoken English

Could you say that more slowly? Could you rephrase the question? Let me check that I understood. I do not know that detail yet. I can send a written answer after the call. I would need to validate that with a qualified engineer. Is it all right if I use notes? Would Portuguese be possible for part of the discussion?

## Practice instructions

Read one interviewer question, pause for 20 to 40 seconds, answer aloud, then compare with the sample. Record locally only with appropriate consent if other people participate. This package supplies a written role-play. It does not claim an audio simulation was generated or that it reproduces Ed's voice.
''')

add('19_VISUAL_DIRECTION_PT', '''# Direção visual das apresentações

## Evidência disponível

A extração textual do site identifica uma estrutura editorial de produto, desenvolvedores, segurança e documentação, com linguagem centrada em autorização. Esta sessão não obteve inspeção visual confiável do CSS ou captura do site. A tentativa de acesso direto ao HTML retornou 403. Portanto a paleta hexadecimal atribuída anteriormente à Saifuro não está confirmada como identidade oficial.

## Direção solicitada no histórico

O usuário especificou fundo #0B0F19, ciano #00F0FF, verde #00FF88, tipografia sans-serif de alto contraste e diagramas arquiteturais. As apresentações adotam essa direção como proposta de coapresentação Arkhe e Saifuro, não como reprodução certificada de brandbook. Não usam logos oficiais nem alegam parceria aprovada. A tipografia será escolhida entre fontes disponíveis no ambiente de renderização.

## Estrutura pública e técnica

O teaser público expõe problema, hipótese, fronteira de responsabilidade, piloto e próximo passo. O deck técnico acrescenta fluxos de evidência, modelo de confiança, mapeamento WER, falhas, aceitação, IP e perguntas abertas. Diagramas representam proposta e permanecem editáveis. Evitar preimagens, credenciais, dados pessoais ou esquemas privados não autorizados. Uma marcação restrita sinaliza audiência pretendida, sem presumir NDA vigente.

## Uso na reunião

O convite transcrito pede introdução sem slides. Use o roteiro falado para a entrevista. Envie ou apresente o deck de parceria apenas se houver interesse e espaço acordado para esse assunto.
''')

sources=[
('S01','Hiring safety','https://saifuro.com/trust','Consultada','Autodeclaração das regras de contratação e canal de confirmação. Não autentica o contato privado.'),
('S02','Terms of use','https://saifuro.com/legal','Consultada','Declara LLC de Wyoming e lei de Delaware para o site. Não comprova registro estadual independente.'),
('S03','Vaga no Hirify','https://hirify.me/jobs/1288385-smart-contract-engineer-solidity-evm','Consultada','Agregador secundário. Priorizar vaga oficial.'),
('S04','About Saifuro','https://saifuro.com/about','Consultada','Equipe e descrição do produto autodeclaradas.'),
('S05','Vaga oficial EVM','https://saifuro.com/careers/smart-contract-engineer-evm','Consultada','Exige Solidity mainnet. Faixa EUA, equity anunciado de 0,30%, Brasil listado. Não é oferta individual.'),
('S06','Ed Wynand GitHub','https://github.com/Ed-Wynand','Consultada','Perfil declara CTO, Rio e link de Telegram. Identidade real e controle atual da conta não comprovados.'),
('S07','Participantes W3C','https://www.w3.org/groups/cg/agentprotocol/participants/','Consultada','Lista Ithelia Dias e Saifuro. Participação não é certificação.'),
('S08','Individual Internet Draft','https://datatracker.ietf.org/doc/draft-dias-agent-payment-verdicts/','Consultada','Draft individual, sem endosso IETF e sem status de RFC aprovado.'),
('S09','Introdução da documentação','https://docs.saifuro.com/','Consultada','Descreve autorização e log. Pagamento é responsabilidade da integração.'),
('S10','Verificação de veredito','https://docs.saifuro.com/reference/verify-a-verdict','Consultada','Perfil JWT ES256 e validações. Especificação pública, não teste de serviço.'),
('S11','Limites do veredito','https://docs.saifuro.com/reference/verdict-limits','Consultada','Ausência de aud e limites semânticos exigem esclarecer o envelope do escrow.'),
('S12','Wyoming registry','https://wyobiz.wyo.gov/Business/FilingSearch.aspx','Bloqueada','Portal apresentou desafio de acesso. Registro e situação ativa independentes pendentes.'),
('S13','Known gaps','https://docs.saifuro.com/reference/not-built-yet','Consultada','policy_version não é histórico de revisões. Não presumir reconstrução da política antiga.'),
('S14','RFC 3161','https://www.rfc-editor.org/info/rfc3161/','Consultada','Protocolo TSA de prova de existência temporal, não autoria exclusiva.'),
('S15','AI Act Article 50','https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50','Consultada','Fonte da Comissão sobre transparência. Não sustenta compliance financeiro automático.'),
('S16','SOC suite AICPA','https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services','Consultada','Asseguração por CPA e controles. Produto não gera relatório SOC automaticamente.'),
('S17','LGPD','https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm','Consultada','Aplicabilidade, processamento e segurança exigem análise do fluxo real.'),
('S18','Wyoming Title 40','https://www.wyoleg.gov/statutes/compress/title40.pdf','Consultada','Capítulo 24 sobre trade secrets. Conferir versão e aplicação com assessoria antes de assinatura.'),
('S19','Trade secret definition','https://www.law.cornell.edu/uscode/text/18/1839','Consultada','Texto federal reproduzido por Cornell. Medidas de sigilo e exclusões importam.'),
('S20','Saifuro security','https://saifuro.com/security','Consultada','Informa SOC Type I e ISO em andamento. Seguro declarado sem certificado verificado.'),
('S21','Calendly fornecido','https://calendly.com/saifuro/meeting','Inacessível','Sem validação de agenda nem reserva.'),
('S22','LinkedIn fornecido','https://www.linkedin.com/in/ithelia-dias-521000122/','Inacessível','Retorno 999. Sem conclusão sobre histórico da pessoa.'),
('S23','Arkhe site','https://arkhe.computer','Inacessível','Site não acessível pela ferramenta. Não usado como prova de capacidades.'),
('S24','GitHub literal do texto','https://github.com/Ed-WynandAli','Não encontrado','404. O texto parece concatenar Ali diz com Ed-Wynand. A correção S06 é explícita, não silenciosa.'),
('S25','Página inicial Saifuro','https://saifuro.com/','Consultada','Descrição comercial. Paleta e CSS não inspecionados visualmente.'),
('S26','Carreiras','https://saifuro.com/careers','Consultada','Fluxo de seleção publicado. A participação real do candidato não foi autenticada.'),
('S27','EU AI Act original','https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng','Bloqueada','Desafio de acesso. Não substitui consulta ao texto consolidado aplicável.'),
('S28','Stripe Directory','https://stripe.directory','Inacessível','Ferramenta não leu conteúdo markdown e CLI não disponível. Pesquisa prosseguiu em fontes diretas, sem verificação Directory.'),
('S29','Telegram truncado','https://t.me.','Inválida','Não é URL de perfil verificável. Perfil específico foi observado em S06.'),
]
local=[('L01','Cargo.toml'),('L02','kernel/arkhe-core/src/worker.rs'),('L03','evidence/arkhe-wormgraph/Cargo.toml'),('L04','verification/crates/arkhe-verify-wasm/Cargo.toml'),('L05','evidence/arkhe-wormgraph/src/anchor.rs'),('L06','docs/STATUS.md'),('L07','README.md'),('L08','docs/ARCHITECTURE.md'),('L09','kernel/arkhe-core/Cargo.toml'),('L10','verification/crates/arkhe-verify-wasm/src/lib.rs'),('L11','design.md')]
source_text='# Registro de fontes e alcance da revisão\n\nConsulta em 27 de outubro de 2026. Fontes corporativas são autodeclarações. Cruzamento de páginas não equivale a auditoria independente. A revisão não executou código recebido da contraparte.\n\n'
for sid,title,url,status,note in sources:
    source_text+=f'## {sid} {title}\n\n[{title}]({url})\n\nEstado: {status}. {note}\n\n'
source_text+='## Fontes locais inspecionadas\n\n'
for sid,p in local:
    source_text+=f'{sid}: `{p}`. SHA-256 registrado no inventário de fontes locais.\n\n'
source_text+='## Histórico fornecido\n\nP01 Texto colado.txt, 781 linhas observadas na leitura inicial, fornecido pelo usuário. É uma transcrição com afirmações de ferramentas anteriores, sem os binários PDF, deck ou áudio que menciona. Sua cópia permanece no diretório de fontes do pacote interno. Não distribuir essa transcrição a terceiros.\n\n## Fontes sem referência identificável\n\nO histórico menciona Bain, DocSend, Papermark, Rekor, OpenTimestamps e supostas pesquisas de cinco fontes sem oferecer URLs e documentos específicos que sustentem números ou conclusões. Não foram tratados como evidência de preço, demanda, proteção garantida, autoria ou compliance. Provedores citados ilustrativamente não foram selecionados ou contratados.\n\n## Limites da revisão\n\nA auditoria cobre as alegações materiais do texto e os links identificáveis. Não é revisão exaustiva de todo o monorepo, teste de produção Saifuro, pesquisa de antecedentes pessoais, parecer jurídico ou validação das versões anteriores ausentes. Dados podem mudar após a data da consulta.\n'
add('02_FONTES_E_METODO_PT',source_text)

for name,body in docs.items():
    (MD/(name+'.md')).write_text(body,encoding='utf-8')

with (ROOT/'fontes'/'fontes_externas.csv').open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['id','titulo','url','estado','limite']); w.writerows(sources)
inventory=[]
for sid,p in local:
    fp=Path(r'D:\arkhe')/p
    inventory.append({'id':sid,'path':str(fp),'sha256':hashlib.sha256(fp.read_bytes()).hexdigest()})
(ROOT/'fontes'/'fontes_locais.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copyfile(r'C:\Users\Lemes\.codex\attachments\c2fc07d2-8c41-4c7a-a70b-7e3b1769e857\Texto colado.txt',ROOT/'fontes'/'historico_usuario_PRIVADO.txt')

def docx_from_md(names,out,title):
    d=Document(); sec=d.sections[0]
    sec.top_margin=Inches(.75);sec.bottom_margin=Inches(.7)
    sec.left_margin=Inches(.85);sec.right_margin=Inches(.85)
    sec.page_width=Inches(8.27);sec.page_height=Inches(11.69)
    for sn in ['Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3']:
        s=d.styles[sn];s.font.name='Arial';s.font.color.rgb=RGBColor(0,0,0)
    d.styles['Normal'].font.size=Pt(10.5)
    d.styles['Normal'].paragraph_format.space_after=Pt(5)
    d.styles['Normal'].paragraph_format.line_spacing=1.08
    d.styles['Title'].font.size=Pt(23)
    d.styles['Title'].paragraph_format.keep_with_next=True
    d.styles['Heading 1'].font.size=Pt(16)
    d.styles['Heading 2'].font.size=Pt(12)
    d.styles['Heading 2'].paragraph_format.space_before=Pt(10)
    footer=sec.footer.paragraphs[0];footer.alignment=2
    footer.add_run('Arkhe e Saifuro  |  27 outubro 2026  |  ')
    fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');footer._p.append(fld)
    for i,name in enumerate(names):
        if i and 'Minutas' in out:d.add_page_break()
        for line in docs[name].splitlines():
            if not line.strip():continue
            if line.startswith('# '):d.add_paragraph(line[2:],'Title')
            elif line.startswith('## '):d.add_heading(line[3:],level=2)
            else:
                line=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'\1 — \2',line)
                para=d.add_paragraph(line.replace('`',''))
                if line.startswith('Interviewer:'):
                    para.paragraph_format.keep_with_next=True
    for el in list(d.styles.element.iter(qn('w:pBdr'))):
        el.getparent().remove(el)
    for el in list(d.element.iter(qn('w:pBdr'))):
        el.getparent().remove(el)
    d.core_properties.title=title
    d.core_properties.subject='Revisão de fontes e proposta de avaliação'
    d.core_properties.author='Preparado para Rafael Oliveira'
    d.save(ROOT/out)

docx_from_md(['00_LEIA_PRIMEIRO_PT','01_REVISAO_CRITICA_PT','03_DILIGENCIA_E_SEGURANCA_PT','04_PUBLIC_PARTNERSHIP_BRIEF_EN','05_TECHNICAL_RFC_EN','06_PILOT_PLAN_EN','07_IP_REGISTER_EN','17_COMMUNICATIONS_EN','18_INTERVIEW_PREPARATION_EN','19_VISUAL_DIRECTION_PT','02_FONTES_E_METODO_PT'],'Dossie_Arkhe_Saifuro.docx','Dossiê Arkhe e Saifuro')
docx_from_md([k for k in sorted(docs) if k[:2] in ['08','09','10','11','12','13','14','15','16']],'Minutas_Juridicas_EN.docx','Arkhe and Saifuro draft transaction documents')
print(json.dumps({'markdown_documents':len(docs),'docx':2,'external_sources':len(sources),'local_sources':len(local)}))
