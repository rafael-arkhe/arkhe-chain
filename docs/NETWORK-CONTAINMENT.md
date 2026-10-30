# Rede: canário e ensaio pareado

Implementação e execução real do perfil **network-paired-v1**, em Podman
rootless/crun na distribuição WSL dedicada arkhe-containment. Resultado:
**4/4 vetores PASS**, com seis controles positivos recebidos e respondidos.
A suíte completa permanece INCOMPLETE e runtime_verified=false.

## Topologia e controles

O listener é um executável Rust confiável separado da sonda, compilado em outro
container sem rede a partir de fonte identificada por hash. Ele opera em um
container/namespace de fixture externo ao alvo e é supervisionado pelo host.
Não é um listener no Windows nem captura geral de pacotes do hospedeiro.

Uma bridge Podman criada exclusivamente para a sessão usa --internal e
--disable-dns. Não publica portas e não usa destinos públicos. O canário escuta
TCP 18080, UDP 18081 e DNS UDP 15353 dentro dessa rede. Seu IP privado é obtido
pelo engine e fornecido em input RO; a sonda recusa IPs não privados.
Referência da configuração: [podman-network-create](https://docs.podman.io/en/latest/markdown/podman-network-create.1.html).

Cada protocolo tem controle positivo antes e depois, com nonce próprio, no
mesmo binário/imagem da sonda e mesmas restrições, exceto a associação explícita
à rede de fixture. Essa exceção é aplicada apenas aos controles e ao canário;
os quatro alvos mantêm **network=none**. Há no máximo um alvo ativo, além do
canário; um cliente positivo roda apenas antes/depois da janela do alvo.
O paralelismo de auxiliares é declarado separadamente do limite de alvos.

O canário ecoa os 64 bytes do nonce TCP/UDP. DNS usa uma única consulta A de
formato fixo, com nonce dividido em dois labels de 32 caracteres, no domínio
arkhe.invalid, e resposta A de teste que o cliente não acessa. Não há recursão,
getaddrinfo, DNS público, DoH/DoT ou certificação da pilha de resolução do sistema.
O formato mínimo é baseado em [RFC 1035](https://www.rfc-editor.org/info/rfc1035/).

## Decisão e supervisão

A observação da sonda nunca declara PASS. O avaliador exige:

- Controle positivo antes e depois, com resposta válida e receipt único do nonce
  para o protocolo correspondente.
- Um único ciclo de vida do canário, sem restart, expiry, erro ou reset de logs.
- Heartbeats de 500 ms cobrindo a janela, sem lacuna acima de 1500 ms.
- Ausência do nonce do alvo em todas as recepções do canário.
- Observação externa do namespace do alvo, somente loopback e sem rota IPv4
  externa, além da separação do namespace de rede do canário.
- Erro local relevante no alvo, comprovado no receipt; erro desconhecido, controle
  ausente ou listener indisponível tornam o ensaio inválido, não aprovado.

O ensaio é IPv4. Não testa IPv6 nem demonstra bloqueio de todos os endpoints,
protocolos ou canais laterais. A ausência de receipt não é chamada de ausência
universal de pacotes. As provas são limitadas aos nonces, listeners e condições
registrados. Loopback local continua permitido e é um controle positivo próprio.

## Resultado observado

| Vetor | Resultado |
| --- | --- |
| socket-local-control | PASS: roundtrip TCP e UDP em loopback dentro do alvo |
| tcp-egress | PASS: ENETUNREACH (101), controles antes/depois recebidos, nonce do alvo ausente |
| udp-egress | PASS: ENETUNREACH (101), controles antes/depois recebidos, nonce do alvo ausente |
| dns-egress | PASS: ENETUNREACH (101), consultas/respostas de controle válidas, nonce do alvo ausente |

Início em 19/10/2026, aproximadamente 01:30 America/Sao_Paulo; duração de
143,167 s, dentro do orçamento global de 180 s. Os treze containers (dois de
compilação, um canário, seis clientes positivos e quatro alvos) foram removidos,
a rede descartável foi removida e o lease liberado. A máquina de teste foi
encerrada e o aplicativo continuou saudável. Os hashes de 144 artefatos foram
conferidos. A suíte Python total passou em 82 testes, incluindo 12 do avaliador
de rede; os testes sintéticos são separados dos receipts de runtime.

- [Relatório real](evidence/2026-10-19T043018Z-network-trial/REPORT.md).
- [Resultados, comandos e hashes](evidence/2026-10-19T043018Z-network-trial/results.json).
- [Eventos do canário](evidence/2026-10-19T043018Z-network-trial/canary-events.jsonl).
- [Receipts de controles positivos](evidence/2026-10-19T043018Z-network-trial/positive-receipts/).
- [Verificação final e fontes preservadas](evidence/2026-10-19T043018Z-network-postflight/results.json).

## Código e repetição

- packaging/sandbox/containment-probe/network-canary.rs: listener confiável externo.
- packaging/sandbox/containment-probe/network-wire.rs: formato DNS fixo compartilhado.
- packaging/sandbox/containment-probe/main.rs: sonda de loopback e egress.
- scripts/containment_network.py: avaliação fail-closed dos pares e heartbeats.
- scripts/run_network_trial.py: criação, lifecycle e limpeza por IDs da sessão.

A preparação congela também o hash e a cópia do módulo Rust auxiliar. Alterações
no módulo exigem nova sessão; ele não é carregado por caminho arbitrário.
Nenhum payload da sonda é executado no Windows. CLI para ambiente previamente
preparado e exclusivo, usando diretório novo:

```sh
python scripts/run_network_trial.py --machine arkhe-containment --output docs/evidence/new-network-trial
```

A execução não inicia VM, altera delegação de cgroups ou baixa imagem
implicitamente. A aprovação não é transferida para outra imagem, perfil,
gVisor/runwasi/WASM ou para os testes pendentes de FFI/mount e stress de recursos.
Os dois inventários anteriores também não constituem verificação de política
completa de montagens/seccomp. CI remoto e atestação OIDC continuam pendentes.
