# Modelo de ameaça

O atacante controla o JSON, pode alterar montante, partes, propósito, passaporte, horário, prova e chave declarada. O verificador fornece a chave por canal independente. Não confiar em verificationMethod para escolher a chave. Parser limita tamanho antes da desserialização e rejeita duplicados/campos desconhecidos; bounds e label precedem verificação Ed25519 estrita.

Assinatura não impede emissor comprometido ou malicioso de assinar uma liquidação falsa. Também não impede replay: repetição do mesmo recibo verifica de novo. Consumidor deverá tratar deduplicação, chave confiável/rotação/revogação, conciliação PSP autenticada, reembolsos e autorização. Nenhum desses controles é implementado aqui. Não há consulta central pública inferida do E2E.

Partes e metadata podem conter dados sensíveis; fixtures são sintéticas. Não publicar recibos reais neste repositório. Recibo não possui criptografia/confidencialidade e o browser não autentica a origem da chave inserida pelo operador.

O perfil é experimental e não congelado. Novas alegações de liquidação ou autorização exigem evidência e perfil próprios. Hash de passaporte/dataset é claim do signer; não é prova de uso legítimo.
