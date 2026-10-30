# Stage 8 — trilha causal de detecção (PoC)

Esta PoC Rust admite observações sintéticas assinadas em um `WormGraph` em memória,
correlaciona três falhas de login seguidas de sucesso para o mesmo sujeito em até
60 segundos e grava um alerta com referências aos quatro eventos. A sequência
assinada representa ordem de admissão; os timestamps são declarações do produtor.
Eventos de sujeitos distintos podem ser intercalados. Um sucesso anterior do
mesmo sujeito interrompe a sequência de falhas.

## Executar

Na raiz do repositório, em PowerShell:

```powershell
cargo test -p arkhe-wormgraph --lib --locked
cargo run -p arkhe-wormgraph --locked --example stage8 -- demo output/stage8-detection.json
```

O exemplo exporta cinco registros e imprime `public_key` e `checkpoint` em hex.
Retenha esses dois valores fora do arquivo exportado. Em outra execução:

```powershell
cargo run -p arkhe-wormgraph --locked --example stage8 -- verify output/stage8-detection.json <public_key> <checkpoint>
```

Substitua os placeholders pelos valores impressos. A verificação não utiliza rede
nem banco de dados. Falhas retornam código de saída diferente de zero.

## Fronteiras e garantias

`DetectionTrail::admit` valida a assinatura Ed25519, sequência, monotonicidade dos
timestamps, existência/unicidade dos pais e regra do alerta antes de chamar
`EvidenceCommitter::append_verified`. O export preserva os payloads assinados;
os envelopes do grafo preservam seus digests e os mesmos pais causais. A camada
de detecção não altera o contrato global do committer nem o ContainmentGate.

O verificador reexecuta essas validações e compara um digest BLAKE3 com domínio
específico sobre o export completo em CBOR determinístico. Esse checkpoint local
vincula conteúdo, ordem e quantidade: inclusive remover o último alerta é
detectável se o auditor conservar o digest original. Não é um checkpoint MMR,
uma prova de inclusão ou uma ancoragem Rekor. Os mecanismos MMR existentes não
são modificados por esta PoC.

Os testes incluem adulteração, truncamento, reordenação, chave incorreta, rejeição
de assinatura inválida na admissão, repetição de sequência, janela temporal,
separação de sujeitos e remoção de pai com assinatura recalculada.

## Limites

A chave privada `[8; 32]` é uma fixture pública de laboratório. Observações e
alertas usam a mesma identidade sintética. Em produção são necessários produtores
autenticados, autoridades separadas, política de autorização e rotação/revogação
de chaves. Aceitar a chave ou o checkpoint fornecidos por um atacante junto ao
export elimina a garantia de autenticidade ou de completude correspondente.

A PoC não coleta logs reais, não demonstra a veracidade de um login, nem a
completude da coleta antes da admissão. Um produtor autorizado pode mentir sobre
observações. O armazenamento em memória não oferece persistência após reinício;
o JSON permite auditoria independente desta execução. Não há SIEM operacional,
resposta automática, atestação de hardware ou demonstração de conformidade.
