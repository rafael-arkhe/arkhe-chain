# Mandato local e broker de capacidades

Estado: biblioteca opt-in, sem serviço financeiro ou credenciais de produção. O mandato local abaixo é independente da [ponte AP2/SPDX](FORMAL-PREDICATES.md). Não há Circle/x402 nem isolamento Windows qualificado.

`arkhe-action-mandate@1` é um novo perfil explícito em `arkhe-verify-core::action_proof`. O mandato Ed25519 vincula principal, tipo, OperationId, alvo, política, lista finita de compromissos de parâmetros e validade. Um checkpoint assinado por chave de log independente fixa root, contagem e perfil MMR. O verificador exige que o checkpoint retido pelo host coincida, que seja anterior ao instante de dispatch fornecido pelo host e que a prova corresponda ao índice exato. A cronologia depende da confiança no log e no relógio do host; não é inferida apenas do MMR.

O `CapabilityBroker` guarda gate, executor e journal no host. Ele verifica mandato, política e evidência admitida antes da reserva. A reserva compara caller/operação e binding de parâmetros/mandato/política, persiste antes do efeito e não pode ter takeover automático. Um sucesso retorna receipt em replay; falha ou cancelamento mantém estado incerto. Até falha ao persistir a resposta exige reconciliação. EmergencyStop e gate são reavaliados também em replay.

O broker não instala journal ou executor por default. `DispatchJournal` exige persistência atômica. A feature `sqlite-broker` fornece journal WAL/FULL standalone, com owner e consumo único de closed; PostgreSQL não é substituído. Os testes de contrato também usam memória. O executor deve usar os parâmetros aprovados no efeito real, fixar a capacidade e manter credenciais fora do agente. Mandatos não ignoram o gate ou revisão humana; esta primeira API recusa perfis que exigem routing, pois usa o caminho admitted simples.

Testes: `cargo test --locked -p arkhe-kernel --test action_broker`. Cobrem alteração de campos e assinaturas, replay de operação, índice/count, raiz não confiável, validade e checkpoint no futuro, ausência de admissão, replay de sucesso, efeito incerto e EmergencyStop.

Antes de ativar um canal externo: qualificar o journal da implantação, aprovação/revogação de raízes/mandatos, routing quando requerido, parâmetros reais, protocolo e isolamento das credenciais. Ausência de credenciais no modelo não estabelece isolamento de sistema operacional.
