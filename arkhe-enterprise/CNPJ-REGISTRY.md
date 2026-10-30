# Gate cadastral de CNPJ

Conferência das referências enviadas: [SERPRO-SERVICES.md](SERPRO-SERVICES.md). O quick start contém exemplos trial/snake_case e curl -k; isso não altera produção, campos camelCase da tabela V2 ou validação TLS no cliente. O código solicita token por operação; reutilização por validade/renovação recomendada no guia ainda não foi implementada. Datavalid e Serprobots não substituem o gate nem comprovam poderes.

O commit exige consulta ao **Serpro Consulta CNPJ v2 de produção**. Dígitos verificadores sozinhos não permitem confirmar um perfil.

## Configuração

Injete no processo servidor, fora do frontend e do repositório:

- `ARKHE_SERPRO_CONSUMER_KEY`
- `ARKHE_SERPRO_CONSUMER_SECRET`

O cliente usa OAuth2 client credentials no endpoint fixo `https://gateway.apiserpro.serpro.gov.br/token` e consulta o endpoint fixo `/consulta-cnpj-df/v2/basica/{cnpj}`. Não aceita URL de cliente, redirecionamento ou endpoint trial. Não há segredo persistido no perfil ou devolvido pela API. O fluxo inteiro tem timeout de dez segundos e limites para resposta JSON.

Exige CNPJ coincidente, situação ativa código 2, razão social coincidente após remover acentos/pontuação e CNAE principal coincidente. O setor pode ser escolhido manualmente. Respostas negativas, divergentes ou indisponíveis bloqueiam o commit. A chamada ocorre antes da transação; o preview é revalidado ao final para evitar commit de dados alterados durante a consulta.

## Limite de identidade

Consulta cadastral confirma dados da empresa; **não confirma que o usuário a representa**. O cadastro mantém `representation: not-verified`; a base do signatário fica separada em `representation_basis`. A [política faseada](REPRESENTATION-POLICY.md) implementa autodeclaração com documentos no WormGraph local para generic interno, sem e-CNPJ, poderes comprovados ou admissão WER do runtime. CNPJ não é usado como signatário de documentos. Perfis legados sem evidência permanecem identificados como não verificados e não são reescritos automaticamente.

Aceita CNPJ numérico e alfanumérico, com ou sem máscara padrão. As primeiras doze posições admitem A–Z/0–9 e os dois DVs são numéricos. Minúsculas ASCII são convertidas para maiúsculas sem remover letras. Unicode, separadores fora da máscara, comprimento incorreto e DVs alterados são recusados. Usa ASCII menos 48 e módulo 11 do [manual oficial RFB](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf). O exemplo oficial `12.ABC.345/01DE-35` passa nos testes; isso não afirma que ele corresponde a empresa ativa.

## Fontes e operação

A [documentação oficial de autenticação](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnpj/pt/quick_start/) exige credenciais vinculadas ao contrato e distingue demonstração de produção. Os [campos v2](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnpj/pt/descricao_campos_v2/) e [códigos de situação](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnpj/pt/tipos_situacao_cadastral/) definem o contrato validado. A API não foi presumida gratuita ou anonimamente acessível.

Os testes locais usam respostas sintéticas injetadas no `fetch` pelo test runner. O produto não expõe chave de bypass ou modo mock para este gate. A execução real contra o Serpro permanece **PENDING**, pois nenhuma credencial foi fornecida ou contratada nesta tarefa. Sem credenciais, o comportamento observado é 503 e perfil não confirmado.
