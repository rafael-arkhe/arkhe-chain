// Gera os fixtures de licença **com o emissor de verdade**.
//
// 🔴 Por que isto é um ficheiro e não uma linha de `cargo test`: um fixture
// escrito à mão prova só que o verificador concorda consigo mesmo. A regra da
// casa é explícita — *"os fixtures são emitidos pelo emissor de verdade
// (aegis-cli), nunca por uma reimplementação"* — e o único jeito de a cumprir
// é correr o emissor.
//
// 🔴 Por que uma raiz de TESTE dedicada, e não a raiz do vendor: um fixture
// assinado pela raiz de produção seria uma licença válida na máquina de um
// cliente — a raiz de produção é a que vai EMBUTIDA no binário, e o que ela
// assina vale em todo o lado. Uma raiz de teste que vive aqui, aberta e
// marcada como tal, é recusada pela raiz de produção — e essa recusa é uma
// das provas.
//
//   node ferramentas/gerar-fixtures.mjs
//
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const CHAVES = join(RAIZ, "crates", "aegis-license", "fixtures", "chaves");
const FIXTURES = join(RAIZ, "crates", "aegis-license", "fixtures");
const EMISSOR = join(RAIZ, "..", "aegis-cli", "src", "licenca.js");

// 🔴 O import dinâmico de um caminho Windows tem de ser uma URL `file://` —
// um caminho cru dá `ERR_UNSUPPORTED_ESM_URL_SCHEME`, e o erro aponta para o
// esquema e não para o caminho, que é a pior combinação possível.
const m = await import(pathToFileURL(EMISSOR).href);

mkdirSync(CHAVES, { recursive: true });
mkdirSync(FIXTURES, { recursive: true });

// ─── A raiz de TESTE ────────────────────────────────────────────────────────
//
// 🔴 O `.key` é **PEM**, e tem de ser: `publicaDePrivada` faz
// `createPublicKey(privada)`, que recusa uma seed de 32 bytes com
// `ERR_OSSL_UNSUPPORTED` e a mensagem `DECODER routines::unsupported`. A
// primeira versão deste ficheiro guardava base64 e falhava ali — com um erro
// que aponta para o OpenSSL e não para "a chave está no formato errado", que
// é a forma mais cara de errar.
const raizPub = join(CHAVES, "vendor-teste.pub");
const raizPriv = join(CHAVES, "vendor-teste.key");
let privadaRaiz;
if (existsSync(raizPriv) && existsSync(raizPub)) {
  privadaRaiz = createPrivateKey(readFileSync(raizPriv, "utf8"));
  process.stderr.write("raiz de teste: reutilizada\n");
} else {
  const par = generateKeyPairSync("ed25519");
  privadaRaiz = par.privateKey;
  writeFileSync(raizPub, m.chavePublicaB64(par.publicKey) + "\n");
  writeFileSync(raizPriv, par.privateKey.export({ format: "pem", type: "pkcs8" }));
  process.stderr.write("raiz de teste: gerada\n");
}

// ─── O par do parceiro ──────────────────────────────────────────────────────
//
// 🔴 **Reutilizado, como a raiz.** A primeira versão gerava um par novo a cada
// corrida — e com isso invalidava todos os fixtures já commitados de uma vez.
// Um gerador de fixtures que muda de chaves quando corre é um gerador que
// produz um diff gigante sem que nada tenha mudado no produto, e o primeiro
// sintoma é um `git status` com trinta ficheiros que ninguém sabe explicar.
//
// 🔴 A chave é de **TESTE** e está versionada de propósito — o mesmo raciocínio
// da raiz: um fixture assinado pela raiz de produção seria licença válida na
// máquina de um cliente.
const pubParceiroPath = join(CHAVES, "parceiro-teste.pub");
const privParceiroPath = join(CHAVES, "parceiro-teste.key");
let privadaParceiro;
if (existsSync(privParceiroPath) && existsSync(pubParceiroPath)) {
  privadaParceiro = createPrivateKey(readFileSync(privParceiroPath, "utf8"));
  process.stderr.write("par de teste: reutilizado\n");
} else {
  const par = generateKeyPairSync("ed25519");
  privadaParceiro = par.privateKey;
  writeFileSync(pubParceiroPath, m.chavePublicaB64(par.publicKey) + "\n");
  writeFileSync(privParceiroPath, par.privateKey.export({ format: "pem", type: "pkcs8" }));
  process.stderr.write("par de teste: gerado\n");
}

// 🔴 A pública é o **texto do ficheiro**, e não `publicaDe(...)`: essa função
// devolve um `KeyObject` do Node, e `String(umKeyObject)` dá
// `[object KeyObject]` — que é uma string válida, que assina, que passa todas
// as conferências, e que não é chave nenhuma. Só apareceu quando o par passou a
// ser reutilizado, e nenhum teste apanharia: a assinatura é coerente com a
// chave que a gerou, e a conferência é feita com a `pub_parceiro` **do próprio
// documento**.
const pubParceiro = readFileSync(pubParceiroPath, "utf8").trim();

const RAIZ_PRIV = privadaRaiz;
const PARCEIRO_PRIV = privadaParceiro;

// Instantes fixos: um fixture com a data de hoje fica válido para sempre, e um
// que vence nunca é válido. Estes dois cobrem os dois.
const EMITIDA = "2026-09-28T12:00:00.000Z";
const VENCIDA = "2026-01-10T12:00:00.000Z";
const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

// ─── A Chave OEM ────────────────────────────────────────────────────────────
const oem = m.montarEnvelope({
  tipo: m.TIPO_OEM,
  payload: m.montarChaveOem({
    parceiro: "Parceiro de Teste",
    documento: "CNPJ 00.000.000/0001-99",
    seeds: ["hotelaria", "portaria-acesso"],
    maxInstancias: 7,
    prazo: "12m",
    emitidaEm: EMITIDA,
    pubParceiro: pubParceiro,
  }),
  privada: RAIZ_PRIV,
});

// ─── A licença ──────────────────────────────────────────────────────────────
const licenca = m.montarEnvelope({
  tipo: m.TIPO_LICENCA,
  payload: m.montarLicenca({
    parceiro: "Parceiro de Teste",
    seed: "hotelaria",
    host: "pc-do-teste",
    fingerprint: FP_A,
    prazo: "90d",
    emitidaEm: EMITIDA,
    licencaId: "11111111-2222-3333-4444-555555555555",
  }),
  privada: PARCEIRO_PRIV,
});

// Uma licença de OUTRA máquina, e uma de outro vertical, e uma vencida.
const licencaDeOutraMaquina = m.montarEnvelope({
  tipo: m.TIPO_LICENCA,
  payload: m.montarLicenca({
    parceiro: "Parceiro de Teste",
    seed: "hotelaria",
    fingerprint: FP_B,
    prazo: "90d",
    emitidaEm: EMITIDA,
    licencaId: "66666666-7777-8888-9999-000000000000",
  }),
  privada: PARCEIRO_PRIV,
});

const licencaDeOutroVertical = m.montarEnvelope({
  tipo: m.TIPO_LICENCA,
  payload: m.montarLicenca({
    parceiro: "Parceiro de Teste",
    seed: "safetag",
    fingerprint: FP_A,
    prazo: "90d",
    emitidaEm: EMITIDA,
    licencaId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  }),
  privada: PARCEIRO_PRIV,
});

const licencaVencida = m.montarEnvelope({
  tipo: m.TIPO_LICENCA,
  payload: m.montarLicenca({
    parceiro: "Parceiro de Teste",
    seed: "hotelaria",
    fingerprint: FP_A,
    prazo: "90d",
    emitidaEm: VENCIDA,
    licencaId: "ffffffff-0000-1111-2222-333333333333",
  }),
  privada: PARCEIRO_PRIV,
});

const gravar = (nome, valor) =>
  writeFileSync(join(FIXTURES, nome), JSON.stringify(valor, null, 2) + "\n");

// A segunda seed, porque a Chave OEM cobre hotelaria E portaria-acesso — e
// uma licença de um produto não instala o outro, que é a regra.
const oemDois = m.montarEnvelope({
  tipo: m.TIPO_OEM,
  payload: m.montarChaveOem({
    parceiro: "Parceiro de Teste",
    documento: "CNPJ 00.000.000/0001-99",
    seeds: ["hotelaria", "portaria-acesso"],
    maxInstancias: 7,
    prazo: "12m",
    emitidaEm: EMITIDA,
    pubParceiro: pubParceiro,
  }),
  privada: RAIZ_PRIV,
});

gravar("chave-oem.json", oem);
gravar("chave-oem-portaria.json", oemDois);
gravar("licenca-ok.json", licenca);
gravar("licenca-outra-maquina.json", licencaDeOutraMaquina);
gravar("licenca-outro-vertical.json", licencaDeOutroVertical);
gravar("licenca-vencida.json", licencaVencida);

// ─── A renovação ────────────────────────────────────────────────────────────
//
// 🔴 Estes fixtures existem porque o `Motivo::Expirada` diz ao operador
// "Renovar a licença", e antes do `renovacao.rs` **não havia gesto nenhum**
// para onde essa frase apontasse.
//
// O instante é **congelado** e escrito no contrato: `AGORA` é o "hoje" dos
// testes, e é o que separa uma resposta ainda no prazo de uma já vencida. Um
// fixture com a data de hoje ficaria válido para sempre, e um que vence nunca
// é válido — os dois estados que a prova precisa vivem lado a lado.
const AGORA = "2026-09-29T10:00:00.000Z";
const PEDIDO_EMITIDO = "2026-09-28T12:00:00.000Z";
const RESPONDA_ANTIGA = "2026-09-20T10:00:00.000Z";

const LICENCA_ID = licenca.payload.licenca_id;
const FP_ESTA = FP_A;

// O pedido que esta máquina tem de fazer — tirado da licença **instalada**, que
// é de onde saem o `licenca_id`, o `expira_em_atual`, o `seed` e o `parceiro`.
const pedido = m.montarPedidoRenovacao({
  host: "pc-do-teste",
  fingerprint: FP_ESTA,
  licencaId: LICENCA_ID,
  expiraEmAtual: licenca.payload.expira_em,
  seed: licenca.payload.seed,
  parceiro: licenca.payload.parceiro,
  em: PEDIDO_EMITIDO,
  pedidoId: "b7c1e0d4-2f39-4e57-9c88-1a4d6f2b3e90",
});

// A licença renovada: **o mesmo** `licenca_id`, prazo maior. O emissor recusa
// um id diferente — e essa recusa é a prova de que a amarra nº 5 também está
// no emissor, e não só no verificador.
const licencaRenovada = m.montarEnvelope({
  tipo: m.TIPO_LICENCA,
  payload: m.montarLicenca({
    parceiro: "Parceiro de Teste",
    seed: "hotelaria",
    host: "pc-do-teste",
    fingerprint: FP_ESTA,
    prazo: "365d",
    emitidaEm: PEDIDO_EMITIDO,
    licencaId: LICENCA_ID,
  }),
  privada: PARCEIRO_PRIV,
});

const resposta = m.montarResposta({
  pedido,
  decisao: "renovar",
  licenca: licencaRenovada,
  emitidaEm: PEDIDO_EMITIDO,
  privada: PARCEIRO_PRIV,
});

const recusa = m.montarResposta({
  pedido,
  decisao: "negar",
  motivo: "contrato não renovado para este período",
  emitidaEm: PEDIDO_EMITIDO,
  privada: PARCEIRO_PRIV,
});

// A resposta de um pedido que NÃO é o pendente. O emissor monta as duas — e é
// por isso que a amarra do nonce tem de ser do lado de quem recebe.
const pedidoAlheio = { ...pedido, pedido_id: "00000000-0000-4000-8000-000000000000" };
const respostaDeOutroPedido = m.montarResposta({
  pedido: pedidoAlheio,
  decisao: "renovar",
  licenca: licencaRenovada,
  emitidaEm: PEDIDO_EMITIDO,
  privada: PARCEIRO_PRIV,
});

// A janela já fechou em `AGORA`. A licença de dentro é a mesma e é válida —
// o que prova que a recusa é pela **janela**, e não por outra coisa.
const respostaVencida = m.montarResposta({
  pedido,
  decisao: "renovar",
  licenca: licencaRenovada,
  emitidaEm: RESPONDA_ANTIGA,
  privada: PARCEIRO_PRIV,
});

// 🔴 O ENCURTA. O emissor recusa encurtar **relativamente ao pedido**, e é
// por isso que este fixture usa um pedido cujo `expira_em_atual` é antigo: a
// resposta é legítima à luz do pedido, e ainda assim é um **downgrade** contra
// o documento que está no disco. A amarra que a apanha é a sexta, e ela
// mede contra o disco — que é a única coisa contra a qual reaplicar uma
// resposta antiga tentaria derrubar.
//
// 🔴 O prazo é de **17 dias**, e não de horas: a licença que encurta tem de
// estar **ainda válida** em `AGORA`, senão a cadeia a apanha primeiro como
// `licenca.expirada` e a prova mede a regra errada. Foi o que aconteceu na
// primeira versão, com `1h` — que é a forma mais rápida de escrever uma
// prova que passa a medir outra coisa.
const pedidoAntigo = { ...pedido, expira_em_atual: "2026-09-28T12:30:00.000Z" };
const licencaQueEncurta = m.montarEnvelope({
  tipo: m.TIPO_LICENCA,
  payload: m.montarLicenca({
    parceiro: "Parceiro de Teste",
    seed: "hotelaria",
    host: "pc-do-teste",
    fingerprint: FP_ESTA,
    prazo: "17d",
    emitidaEm: PEDIDO_EMITIDO,
    licencaId: LICENCA_ID,
  }),
  privada: PARCEIRO_PRIV,
});
const respostaQueEncurta = m.montarResposta({
  pedido: pedidoAntigo,
  decisao: "renovar",
  licenca: licencaQueEncurta,
  emitidaEm: PEDIDO_EMITIDO,
  privada: PARCEIRO_PRIV,
});

// As duas que o emissor **recusa montar**, e que mesmo assim são assinadas
// com a chave do parceiro — por `montarEnvelope`, que é a função de assinatura
// do próprio emissor. A prova é que a segunda barreira existe **e é
// alcançável**: um envelope legitimamente assinado, sem motivo, continua a
// ser recusado.
const semMotivo = m.montarEnvelope({
  tipo: m.TIPO_RESPOSTA,
  payload: {
    pedido_id: pedido.pedido_id,
    fingerprint: FP_ESTA,
    decisao: "negar",
    motivo: "",
    emitida_em: PEDIDO_EMITIDO,
    valida_ate: "2026-10-01T12:00:00.000Z",
  },
  privada: PARCEIRO_PRIV,
});

const semLicenca = m.montarEnvelope({
  tipo: m.TIPO_RESPOSTA,
  payload: {
    pedido_id: pedido.pedido_id,
    fingerprint: FP_ESTA,
    decisao: "renovar",
    motivo: "",
    emitida_em: PEDIDO_EMITIDO,
    valida_ate: "2026-10-01T12:00:00.000Z",
  },
  privada: PARCEIRO_PRIV,
});

// Uma decisão fora do vocabulário fechado, também ela legitimamente assinada.
const decisaoFora = m.montarEnvelope({
  tipo: m.TIPO_RESPOSTA,
  payload: {
    pedido_id: pedido.pedido_id,
    fingerprint: FP_ESTA,
    decisao: "talvez",
    motivo: "",
    emitida_em: PEDIDO_EMITIDO,
    valida_ate: "2026-10-01T12:00:00.000Z",
  },
  privada: PARCEIRO_PRIV,
});

// O contrato do instante, gravado ao lado: um teste que depende de uma data
// escrita à mão no `.rs` e de outra escrita aqui diverge no primeiro dia em
// que alguém mexe numa das duas.
writeFileSync(
  join(FIXTURES, "renovacao-contrato.json"),
  JSON.stringify(
    {
      aegis_licenca: m.FORMATO,
      tipo_resposta: m.TIPO_RESPOSTA,
      formato_pedido: m.FORMATO_PEDIDO_RENOVACAO,
      decisoes: m.DECISOES,
      agora: AGORA,
      pedido_emitido_em: PEDIDO_EMITIDO,
      licenca_id: LICENCA_ID,
      fingerprint: FP_ESTA,
      licenca_instalada: "licenca-ok.json",
      chave_oem: "chave-oem.json",
    },
    null,
    2,
  ) + "\n",
);

gravar("renovacao-pedido.json", pedido);
gravar("renovacao-resposta.json", resposta);
gravar("renovacao-negar.json", recusa);
gravar("renovacao-outro-pedido.json", respostaDeOutroPedido);
gravar("renovacao-vencida.json", respostaVencida);
gravar("renovacao-encurta.json", respostaQueEncurta);
gravar("renovacao-sem-motivo.json", semMotivo);
gravar("renovacao-sem-licenca.json", semLicenca);
gravar("renovacao-decisao-fora.json", decisaoFora);

// O verificador tem de ser honesto sobre o que estes fixtures provam, e sobre
// o que NÃO provam.
writeFileSync(
  join(FIXTURES, "LEIA-ME.md"),
  `# Fixtures de licença

Gerados por \`ferramentas/gerar-fixtures.mjs\`, que chama o **emissor de
verdade** (\`aegis-cli/src/licenca.js\`). Não reescreva estes ficheiros à mão:
um fixture escrito à mão prova só que o verificador concorda consigo mesmo.

## As chaves são de TESTE

\`chaves/vendor-teste.key\` é uma raiz **que não é a de produção**, e é
publicada aqui de propósito. A raiz de produção é a que vai embutida no
binário, e o que ela assina vale na máquina de um cliente. Um fixture
assinado por uma raiz que não é a de produção é recusado — e essa recusa é
uma das provas do verificador.

## O que estes fixtures provam

- que a forma **canónica** em Rust reproduz a do emissor (a assinatura
  confere, byte a byte);
- que a cadeia **raiz do vendor → Chave OEM → licença** é conferida pela
  ordem que a casa mediu;
- que a recusa por **fingerprint**, **vertical** e **expiração** funciona.

## O que eles NÃO provam

- que a chave privada de produção produz fixtures — isso é o mesmo código
  com outra chave;
- que a renovação por envelope (\`resposta\`) está coberta — ainda não é;
- que o ledger do \`frota-api\` é o dono da revogação. A casa já mediu que
  **o servidor nunca assina**: a raiz do vendor não entra em contentor nem
  em banco.
`,
);

process.stderr.write(
  `fixtures escritos em ${FIXTURES}\n` +
    `  fingerprint de teste: ${FP_A.slice(0, 8)}…\n` +
    `  seeds na Chave OEM: hotelaria, portaria-acesso\n`,
);

// ─── Uma licença para ESTA máquina ───────────────────────────────────────────
//
// 🔴 O fingerprint é `fingerprintDe({machine_id, plataforma, arquitetura})` — o
// mesmo do emissor, e o mesmo que o `aegis` recalcula. Sem esta licença o gate
// recusa, e a prova do gate passaria a provar "recusou" em vez de "aceitou".
const MAQUINA = process.env.COMPUTERNAME || process.env.HOSTNAME || "bancada";
const PLATAFORMA = process.platform === "win32" ? "windows" : process.platform;
const ARQUITETURA = process.arch === "x64" ? "x86_64" : process.arch;
const FP_DA_BANCADA = m.fingerprintDe({
  machine_id: MAQUINA,
  plataforma: PLATAFORMA,
  arquitetura: ARQUITETURA,
});

const licencaDestaMaquina = m.montarEnvelope({
  tipo: m.TIPO_LICENCA,
  payload: m.montarLicenca({
    parceiro: "Parceiro de Teste",
    seed: "hotelaria",
    fingerprint: FP_DA_BANCADA,
    prazo: "90d",
    emitidaEm: EMITIDA,
    licencaId: "12121212-3434-5656-7878-909090909090",
  }),
  privada: PARCEIRO_PRIV,
});

writeFileSync(
  join(FIXTURES, "licenca-desta-maquina.json"),
  JSON.stringify(licencaDestaMaquina, null, 2) + "\n",
);
process.stderr.write(`  licença desta máquina: ${MAQUINA} (${PLATAFORMA} ${ARQUITETURA})\n`);

// ─── As licenses de TESTE, por plataforma ────────────────────────────────────
//
// 🔴 A licença está presa ao `machine_id`, ao **sistema** e à arquitectura —
// o fingerprint é `sha256(arquitectura=…|machine_id=…|plataforma=…)`. Um
// fixture emitido no Windows é recusado num runner Linux, e **bem recusado**:
// `licenca.fingerprint`. Foi o que o CI descobriu, e a prova da troca de
// produtos era a única que sofria disso.
//
// A cura não é uma licença por máquina — são infinitas. É uma licença por
// **(plataforma, seed)**, com um `machine_id` **fixo** de teste, e a prova
// escolhe a do sistema em que está. O `machine_id` é uma entrada que a prova
// **nomeia**, e não uma coisa que a máquina decide: a mesma prova mede o
// mesmo produto em qualquer lado, e o que muda entre execuções é o dado que
// ela diz que é.
//
// As duas plataformas são as que o produto **alvo**: a máquina-campo em
// Windows e a ilha em Linux. Uma terceira plataforma não tem fixture, e a
// prova **falha** a dizer isso — nunca SKIP, porque um SKIP aqui seria um
// teste verde que não mediu a troca de produtos.
const MAQUINA_DE_TESTE = "aegis-maquina-de-teste";
const PLATAFORMAS = [
  ["windows", "x86_64"],
  ["linux", "x86_64"],
];
const SEEDS_DE_TESTE = [
  ["hotelaria", "12121212-3434-5656-7878-909090909090"],
  ["portaria-acesso", "34343434-5656-7878-9090-010101010101"],
];

for (const [plataforma, arquitetura] of PLATAFORMAS) {
  for (const [seed, id] of SEEDS_DE_TESTE) {
    const fp = m.fingerprintDe({
      machine_id: MAQUINA_DE_TESTE,
      plataforma,
      arquitetura,
    });
    const licenca = m.montarEnvelope({
      tipo: m.TIPO_LICENCA,
      payload: m.montarLicenca({
        parceiro: "Parceiro de Teste",
        seed,
        fingerprint: fp,
        prazo: "365d",
        emitidaEm: EMITIDA,
        licencaId: id,
      }),
      privada: PARCEIRO_PRIV,
    });
    writeFileSync(
      join(FIXTURES, `licenca-${seed}-${plataforma}.json`),
      JSON.stringify(licenca, null, 2) + "\n",
    );
  }
}
process.stderr.write(
  `  licenças de teste: ${PLATAFORMAS.length} plataformas x ${SEEDS_DE_TESTE.length} seeds
`,
);
