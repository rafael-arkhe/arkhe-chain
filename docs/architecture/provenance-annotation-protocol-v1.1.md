# Protocolo de anotação — revisão mecânica v1.1

Data: 2026-10-29. Status: candidato, sem anotações humanas ou revisão independente.
Complementa o [protocolo v1](provenance-annotation-protocol-v1.md), cujas unidades,
critérios e métricas permanecem válidos. Não altera baseline, tarefas semânticas,
fixtures ou oráculos. O schema e o pacote v1 anteriores são preservados.

## Restrições do schema

- Supported, Partial e Contradicted exigem pelo menos um evidence_span_ref.
  Justificativa textual não substitui essa referência.
- Indeterminate pode representar ausência de evidência e não exige uma referência
  inexistente. NotEvaluated continua exigindo motivo de abstenção.
- Rationale já era obrigatório com comprimento mínimo no v1; agora os campos note
  também rejeitam texto composto apenas por espaços.
- Unmarked e Underspecified são exclusivos de qualquer outro label de modalidade.
  Cada um pode aparecer sozinho; misturá-los entre si também é inválido.

## Responsabilidade do validador

JSON Schema valida forma e as condições acima. O validador verifica a correspondência
de claim_digest com a Claim da tarefa, fonte permitida, referências existentes,
bytes e fronteiras UTF-8. O vínculo da Claim já era verificado no v1; não se tenta
implementar cálculo criptográfico em JSON Schema.

Supported com uma referência mecanicamente válida não demonstra suporte semântico.
A validação não conclui anotação, calibração, adjudicação ou revisão independente.

## Derivação e limites de representação

No piloto, derivation_note descreve em texto livre as premissas e a regra. Ela não
é uma lista de premissas estruturadas nem um certificado de inferência executável.
Referências estruturadas de premissas e verificadores de regras são evolução futura.
As referências existentes de spans/eventos/relações continuam sendo verificadas.

## Versionamento e execução humana

O [pacote v1.1](../../tests/provenance-broker/annotation-pilot-v1.1/README.md)
reutiliza as mesmas 19 tarefas e oito fontes, sem copiar outcomes ou predições.
Seus hashes de schema e protocolo identificam esta revisão e o protocolo-base.
Nenhum revisor foi atribuído ou contatado. Calibração e concordância humana não
foram executadas; não serão simuladas como revisão independente.

Corpus reservado depende de curadoria e controle de acesso separados. Nem este
pacote público nem os stubs dos testes são um corpus reservado.
