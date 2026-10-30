# Avaliação de candidatura — AWS Cryptography, Fall 2026

> SUBSTITUÍDO: esta avaliação tomou o anexo errado como projeto principal. Consulte avaliacao-arkhe.md e proposal-arkhe-en.md nesta pasta para a revisão baseada no workspace Arkhe.

Data: 22 de outubro de 2026. Parecer documental, sem auditoria do repositório, validação das publicações ou confirmação institucional.

## Conclusão

O material apresentado não comprova elegibilidade de Rafael como PI ou co-PI. O Projeto Eclipse, conforme o PDF, apresenta aderência muito baixa ao edital de criptografia. Recomendo uma candidatura apenas com PI elegível e uma contribuição científica delimitada. A minuta em inglês propõe uma nova pesquisa inspirada em Arkhe e na verificação de artefatos de IA mencionadas no currículo; ela não descreve o Eclipse como se já fosse um projeto de criptografia.

## Elegibilidade pessoal e institucional

As regras exigem que o PI seja docente em tempo integral de instituição acadêmica acreditada, ou pesquisador permanente de organização não governamental com situação jurídica reconhecida equivalente a entidade 501(c)(3). Também exigem maioridade. O currículo apresenta graduação em Psicologia, atuação como fundador/arquiteto da Arkhe e pesquisa voluntária na Safe Core. Nenhuma dessas descrições comprova o vínculo exigido. Ser pesquisador independente, fundador, ter ORCID ou publicar em Zenodo/SSRN não substitui esse requisito. A ausência de doutorado não é, por si só, o impedimento identificado.

O vínculo voluntário não comprova vínculo permanente; a situação jurídica da Safe Core também não foi fornecida. Caso exista vínculo elegível não mencionado, apresentar comprovação e confirmar aceitação institucional. A FAQ aplica os requisitos também ao co-PI. Uma alternativa é Rafael integrar a equipe como colaborador técnico sob liderança científica efetiva de PI elegível. O recurso é destinado à instituição, e não diretamente ao fundador ou à startup.

Pendências individuais: confirmar maioridade; ausência das restrições de emprego/vínculo familiar com pessoal inelegível da Amazon; sanções; condição de servidor público fora da exceção acadêmica; participação em decisões de compras envolvendo Amazon; submissões concorrentes; e financiamento Amazon direto ou indireto nos últimos três anos. Não foi identificada restrição geral a brasileiros, mas a elegibilidade individual permanece dependente das regras completas e das declarações exigidas.

## O que os dois PDFs sustentam

O blueprint foi examinado visualmente em suas 12 páginas, pois não contém camada textual extraível. Trata de um jogo de combate espacial mobile: engines Unity/Godot, object pooling, colisores, draw calls, compressão de texturas, controles por toque, hierarquia visual, campo gravitacional, dash e progressão narrativa. Os dizeres sobre conexão criptografada e decodificação de logs estão no contexto visual/narrativo. Não constituem especificação de protocolo, definição de adversário, prova, implementação criptográfica ou experimento. Valores de desempenho no deck são apresentados sem metodologia suficiente para validá-los como resultados científicos.

O currículo relata arquitetura com TEE/Nitro Enclaves, verificação fail-closed, grafos de proveniência/MMR, auditoria de código com IA e uma publicação sobre verificação de artefatos GGUF. Também relata mais de 225 testes e participação em aceleração. Esses itens são declarações do currículo: não verifiquei código, execução dos testes, revisão por pares, admissão no programa ou parcerias comerciais. Não transformar roadmap com B3/Safra em parceria estabelecida.

## Aderência ao edital

| Recorte | Aderência documental | Fundamentação |
|---|---|---|
| Eclipse como jogo mobile | Muito baixa | Objetivos de produto, design e performance, sem pergunta de pesquisa criptográfica. |
| Arkhe como plataforma financeira completa | Parcial | Verificação e enclaves são relevantes, mas amplitude comercial e blockchain não bastam. |
| Proveniência verificável de artefatos de IA | Promissora, condicionada | Conecta-se à formalização de segurança de IA e mecanismos de proveniência; requer novidade demonstrável. |
| Protocolo de colaboração entre organizações | Promissora, condicionada | Conecta-se explicitamente ao edital, se confiança, composição e ataques forem definidos. |
| FHE, MPC, privacidade diferencial ou resistência quântica | Não sustentada | Os PDFs não demonstram métodos ou resultados nessas linhas. Não reivindicar essas propriedades. |

A minuta combina os dois recortes mais defensáveis em um verificador pequeno de manifesto e autorização. Proveniência de artefatos não comprova autoria de conteúdo gerado, veracidade de respostas ou segurança comportamental de um modelo. Nitro Enclaves também não equivale a FHE/MPC nem garante privacidade por si só. A novidade ainda precisa ser contrastada com literatura e ferramentas existentes; não há base para estimar probabilidade de aprovação.

## Caminho para submissão

1. Identificar PI elegível com responsabilidade científica e administrativa real e instituição que aceite o prêmio.
2. Confirmar com Rafael se deseja o novo recorte Arkhe/IA. Para financiar o Eclipse como apresentado, este edital não é uma boa correspondência.
3. Substituir todos os campos pendentes na minuta; validar currículo do PI, composição da equipe, autoria e disponibilidade dos direitos necessários.
4. Documentar repositório/commit, licença, autores ativos, commits nos últimos três meses, tutoriais existentes e evidência dos resultados citados. A proposta distingue entregas futuras de fatos existentes.
5. Fechar revisão de literatura e escopo de prova com especialista. Fixar baseline, premissas, orçamento institucional e acesso a infraestrutura.
6. Exportar proposta em PDF com até quatro páginas de corpo, fonte legível de 11 pontos e margens de uma polegada. Referências no Apêndice A, limitado a duas páginas. Incluir Apêndice B se qualquer integrante recebeu apoio Amazon nos últimos três anos.
7. Preparar uploads separados de proposta, CV e orçamento conforme template de 1/10/2026. O Markdown entregue é editável e não tem paginação validada para upload.

Prazo oficial: 4 de novembro de 2026, 23h59 Pacific Time; corresponde a 5 de novembro, 04h59 em São Paulo (PST, UTC−8). Recomendo concluir até 3 de novembro para acomodar revisão institucional. Cartas previstas para fevereiro de 2027. Teto do edital: USD 80.000 em recursos e USD 40.000 em créditos AWS. A minuta solicita USD 72.000 + USD 20.000, valores de planejamento sujeitos à validação institucional. Não inclui overhead administrativo.

As regras proíbem informação confidencial na proposta. Revisar direitos e conteúdo técnico antes de enviar. Não houve envio, contato com terceiros nem registro de candidatura.

## Fontes

- Projeto: C:\Users\Lemes\Downloads\Sci-Fi_Engineering_Blueprint.pdf, páginas 1–12.
- Currículo: C:\Users\Lemes\OneDrive\Documentos\Currículos\resume_rafael_oliveira_en.pdf, páginas 1–2.
- [Edital oficial](https://www.amazon.science/research-awards/call-for-proposals/aws-cryptography-call-for-proposals-fall-2026).
- [Regras oficiais](https://www.amazon.science/research-awards/program-rules), atualização indicada: 26/3/2025.
- [FAQ oficial](https://www.amazon.science/research-awards/frequently-asked-questions).
- [Template oficial de 1/10/2026](https://www.amazon.science/_attachment/ara-proposal-template?id=000001a0-f857-d623-a5b5-fc57a5260001).
