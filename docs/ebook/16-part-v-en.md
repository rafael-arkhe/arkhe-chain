# Part V — edição de trabalho em inglês americano

Capítulos completos:

15. Code Agents: From Proposal to Release.
16. DePIN Without Leaps of Trust.
17. Content Provenance and Authenticity.

Arquivos: [Markdown](manuscrito/00-part-v.en.md),
[HTML](dist/arkhe-part-v-en.html), [EPUB](dist/arkhe-part-v-en.epub).

Os capítulos incluem três exercícios, fontes e limites. Identificadores de
classes, perfis e caminhos preservam o código real; os títulos e cenários usam
nomes descritivos. Não foi realizado merge, deployment ou sessão de provider real.

## Validação em 22/10/2026

| Comando | Resultado |
|---|---|
| `cargo test --locked -p arkhe-depin --test portable_proof_composite` | 4 passaram; fixture sintética, assinatura falsa não verificada |
| `cargo test --locked -p arkhe-verify-core --test c2pa_signature` | 9 passaram; perfil local, sem validação padrão completa |
| `cargo test --locked --manifest-path agi-coder/Cargo.toml -p agi-coder-tests --test jules_completion --test e2e_mock_jules` | 2 de conversão + 3 de fluxo mock passaram |

Total: **18 testes direcionados**, sem falhas ou ignorados nessas execuções.
O serviço HTTP do teste mock é local. O perfil preview foi descrito a partir
da documentação e não foi executado ou qualificado nesta entrega.

Não foram executados provedor externo, computação distribuída real, autenticação
de árbitro upstream, GPU/TEE, merge/release/deploy, mídia real sob a especificação
completa, nem nova distribuição de raízes de confiança de produção.

## Ressalva de nomes de campos criptográficos

O capítulo 17 registra a diferença entre nomes com `sha256` e o cálculo efetivo
com `blake3_256` no perfil local. O texto não altera o código, protocolo ou bytes
assinados. Essa constatação deve entrar na revisão de interoperabilidade antes
de qualquer promessa de compatibilidade externa.

## Evidências e build

- [Saídas das execuções](evidence/execution-part-v-en.json).
- [Manifest de insumos editoriais](evidence/source-manifest-part-v-en.json).
- [Relatório estrutural do EPUB](evidence/build-report-part-v-en.json).

EPUBCheck, Kindle Previewer e revisão editorial final permanecem pendentes.

```powershell
python docs/ebook/build.py --lang en-US --section part-v
```
