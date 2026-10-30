# Arkhe-Intra — fullstack local

A bancada `/desenvolvimento` gera propostas para os crates Rust, testa-as em
Podman rootless sem rede e registra revisão assinada para exportação.
[Preparação, fluxo e backlog](../../docs/INTRA-DEVELOPMENT.md).

`/avaliacoes` acrescenta [baseline congelado, tarefas reservadas, comparação e rollback](../../docs/CAPABILITY-EVALUATION.md).

Implementação das telas de `design/stitch`: portal, hub jurídico, biblioteca,
visor e assinatura de minuta, confirmação de assinatura, recibo de ancoragem,
verificação offline e laudo A4. Os números vêm do banco; a instalação começa vazia.

## Preparar e executar

Na raiz do workspace, com Node 24, pnpm, Rust e wasm-pack:

```powershell
pnpm intra:prepare
pnpm dev:intra
```

Abra **http://127.0.0.1:3003**. As credenciais de três contas locais ficam em
`ops/local/intra/credentials.json`. Não há senha padrão. A preparação preserva
contas existentes. Chaves privadas PKCS#8 PEM ficam no mesmo diretório, em
`author.private.pem`, `reviewer.private.pem` e `owner.private.pem`.

Para servir o build de produção local:

```powershell
pnpm build:intra
pnpm start:intra
```

O launcher do Next escuta somente em loopback. Use o endereço com `127.0.0.1`,
pois as mutações conferem a origem exata. A aplicação é nativa; não altera nem
inicia os contêineres PostgreSQL/Besu do ambiente.

## Fluxo completo

### Registro de novas credenciais

1. A governança abre **Identidade & credenciais** (`/credenciais`), informa o
   e-mail e escolhe autoria ou revisão. O convite vale 48 horas e é de uso único.
2. A pessoa abre **Registrar minha credencial** no login (`/registro`), valida o
   convite, informa o nome e define uma senha de 12 a 128 caracteres.
3. A chave Ed25519 é gerada ou importada no navegador. A chave privada não é
   enviada ao servidor nem guardada em localStorage. Uma chave nova precisa ser
   baixada e guardada antes de enviar o registro.
4. O servidor verifica uma prova de posse vinculada ao convite, e-mail, papel,
   nome e chave. A solicitação fica pendente e ainda não permite login.
5. A governança confere identidade e fingerprint por canal independente e usa
   sua chave Ed25519 para assinar a ativação em `/credenciais`.
6. A conta ativa passa a acessar e assinar conforme seu papel. **Exportar
   confiança** gera um arquivo atualizado com as chaves públicas das contas
   ativas, inclusive as cadastradas por este fluxo.

Convites não concedem o papel de governança. As contas de bootstrap existentes
continuam sendo as raízes deste perfil local. As novas identidades ficam em
SQLite e sua aprovação assinada é reverificada ao carregar as contas. Não há
reescrita automática de `accounts.json`, `credentials.json` ou `trust.json` do
bootstrap; para novos signatários, distribua a exportação de confiança atualizada.
Senha e prova de posse não substituem a aprovação. Os três eventos de convite,
solicitação e ativação/rejeição são registrados na trilha local; chaves privadas,
senhas e códigos brutos de convite não entram nela.

Este é um registro de acesso da intranet local. Não concede autoridade no kernel,
não admite WER no WormGraph e não implementa SSO corporativo, confirmação automática
de e-mail, recuperação de senha ou revogação de contas ativas. A perda de uma chave
não é resolvida por regeneração silenciosa. Backup/restauração devem incluir o
SQLite e os arquivos de bootstrap, mantendo as cópias privadas em local seguro.

### Documentos e assinaturas

1. Entre como `author@arkhe.local`, crie uma minuta e confira o conteúdo.
2. Selecione a chave `author.private.pem` e assine o envio à revisão.
3. Saia, entre como `reviewer@arkhe.local` e assine a revisão com a chave dessa conta.
4. Entre como `owner@arkhe.local` e assine a aprovação com a chave de governança.
5. Com Rekor configurado, selecione **Ancorar e publicar**. Sem configuração a
   aprovação é preservada e a publicação fica bloqueada.
6. Exporte o pacote JSON para verificação independente ou imprima o laudo A4.

O arquivo privado é importado como chave não exportável no navegador para a
operação e não é enviado à API. O backend aceita apenas a chave pública cadastrada,
a revisão atual e a sequência autorizada. O navegador não guarda a chave em
localStorage. A configuração inicial é um bootstrap local; em operação real,
distribua cada chave apenas ao respectivo responsável por um canal confiável.

## Arquitetura e limites

| Camada | Implementação |
|---|---|
| Interface | Next.js 15.5.28, React 18, TypeScript, Tailwind 3.4, Lucide |
| Estado | TanStack Query para dados, Zustand para filtro global |
| API | Route Handler Node, autenticação em cada chamada protegida |
| Sessões | Tokens aleatórios, hash no banco, TTL 8h, cookie HttpOnly/SameSite=Strict |
| Persistência | SQLite nativo Node 24, WAL, transações e controle de revisão |
| Autorização | Autoria, revisão e governança, com signatários distintos |
| Identidade | BLAKE3 do envelope de documento versionado |
| Assinaturas | Ed25519 de envelope de transição vinculado a versão, estado e usuário |
| Auditoria | Eventos append-only com encadeamento BLAKE3 |
| Ancoragem | API Rekor v1 hashedrekord 0.0.1, chave fixada, SET e inclusão RFC6962 |
| Verificação offline | WASM compilado do `arkhe-verify-core` + Web Crypto Ed25519 |
| IA | Executável Rust `arkhe-ollama`, modelo fixado em `config/ollama.json` |

SQLite guarda exclusivamente o estado da aplicação em `ops/local/intra/intra.sqlite`.
Não cria uma migração concorrente à autoridade SQL do kernel, não admite WER no
WormGraph e não transforma o digest do envelope em identidade normativa AKG.
Os gatilhos append-only protegem contra mutações pela aplicação; não protegem
contra um administrador que substitua o arquivo. Sem raiz externa confiável, a
cadeia não detecta truncamento final. Node 24 ainda sinaliza SQLite como experimental.

Não há indicadores fictícios de tenant PASS, quorum, checkpoint testemunhado ou
ancoragem. O banner PASS refere-se somente à integridade da cadeia local. O laudo
é um relatório técnico de conferência, sem assinatura institucional própria.

As fontes declaradas no design usam fallbacks locais: o build e o uso offline
não dependem de Google Fonts ou CDNs. Não se adicionam dependências de componentes
que não sejam usadas na interface.

## Rekor e reconciliação

Copie `.env.example` para `.env.local` **dentro desta aplicação** e informe:

```dotenv
ARKHE_REKOR_URL=https://seu-log-rekor.example
ARKHE_REKOR_PUBLIC_KEY_FILE=C:/caminho/confiavel/rekor.pub.pem
```

Obtenha a chave pública por um canal independente e confiável. O servidor não
baixa automaticamente uma chave do mesmo endpoint que deve verificar. Apenas
origens HTTPS são aceitas, sem redirecionamento. O conteúdo enviado é o envelope
de aprovação assinado (inclui identidade do ator e digest); a publicação é uma
ação explícita da governança. Nenhum log público foi usado nos testes.

O estado `anchoring` é persistido antes da escrita remota. Resposta perdida,
conflito, SET inválido ou prova ainda indisponível deixam o estado pendente.
Não há retry de escrita. Obtenha o recibo completo do log e importe-o na tela
**Reconciliar ancoragem**. O recibo deve corresponder exatamente ao registro
hashedrekord esperado, ao logID da chave fixada, ao SET e à prova de inclusão.

O SET autentica a entrada e seu índice. A prova de inclusão é conferida contra
a raiz apresentada. Esta implementação não verifica um checkpoint testemunhado
nem consenso entre witnesses; o relatório explicita esse escopo.

## Offline e confiança

Acesse `/offline/index.html` e selecione **Preparar uso offline**. O service worker
armazena apenas HTML, CSS, JS e WASM. Ele não armazena documentos, respostas de API,
sessões nem chaves. Depois de preparado, reabra **esse mesmo endereço** sem conexão.

O arquivo `ops/local/intra/trust.json` contém somente IDs, papéis e chaves públicas.
Distribua-o por canal confiável e selecione-o junto ao pacote. Sem uma raiz de
confiança externa, uma assinatura pode ser matematicamente válida sem comprovar
a identidade do responsável. O verificador offline mostra resultados separados
para conteúdo, estados, assinaturas e ancoragem. Rekor permanece INCONCLUSIVE
no modo offline; o veredito completo também permanece INCONCLUSIVE.

## Ollama

O servidor local Ollama deve estar disponível; use `python scripts/ollama.py status`
se necessário. O preparo compila o provider Rust. O backend chama o executável
diretamente com argumentos separados, sem shell, reaproveitando as validações
de loopback, digest, limites e rejeição de tool calls. Não baixa modelos nem cria
autorizações. Cada pergunta é independente e as respostas são propostas.

## API

Todas as rotas ficam em `/api`. Apenas `GET health` e `POST login` são públicas.
Mutações exigem `Origin` exatamente igual a `ARKHE_INTRA_ORIGIN` e JSON até 256 KiB.

| Método | Rota | Uso |
|---|---|---|
| POST | login / logout | Abrir ou revogar sessão |
| GET | me / dashboard / audit | Identidade, conteúdo e eventos |
| POST | documents | Criar rascunho (author) |
| GET / PUT | documents/:id | Consultar / editar rascunho do autor |
| POST | documents/:id/challenge | Obter envelope exato para a assinatura |
| POST | documents/:id/transition | Validar assinatura e efetuar transição |
| POST | documents/:id/publish | Registrar intenção e enviar ao Rekor (owner) |
| POST | documents/:id/reconcile | Importar recibo verificado (owner) |
| GET | documents/:id/export | Exportar pacote de evidência |
| GET | documents/:id/verify | Reverificar conteúdo, assinaturas e recibo |
| POST | assistant | Inferência local, sem ferramentas |

Este perfil local tem um único repositório de documentos compartilhado entre as
contas cadastradas; não implementa multitenancy/RLS, SSO empresarial ou ACL por
documento. Não exponha esse perfil diretamente como intranet pública. Para outro
host, configure sessão TLS, origem e identidade corporativa conforme o ambiente.

## Verificação e operação

```powershell
pnpm test:intra
pnpm --filter @arkhe/intra typecheck
pnpm build:intra
pnpm --filter @arkhe/intra run test:http
python scripts/check_architecture.py
```

`test:http` inicia um servidor de produção temporário em loopback:3004 com contas
e banco isolados; valida as rotas reais e o fluxo de três assinaturas e encerra o
processo. Os testes criptográficos usam uma chave Rekor sintética local, sem escrita
externa. O build WASM é necessário antes dos testes.

Para backup, pare o processo Next e copie todo o diretório privado, incluindo
arquivos WAL/SHM se presentes. Preserve as chaves e o arquivo de confiança por
separado, com acesso restrito. Não apague ou regenere contas para recuperar uma
senha: isso alteraria a raiz de confiança. O provisionamento é de uso local;
gestão de identidades corporativas continua sendo uma integração de implantação.

## Recibos Pix opcionais

`/verificar/pix` verifica localmente assinaturas do perfil synthetic-poc; `/enterprise/recibos` permite comparação com política autenticada do operador. Ambos exigem ARKHE_PIX_RECEIPTS=1. Chave, sync de assets, decisões e limites: [integração Pix](../../arkhe-enterprise/PIX-RECEIPTS.md). Não confirma pagamento nem autorização KYA; sem arquivo de recibos e sem multi-tenancy.
