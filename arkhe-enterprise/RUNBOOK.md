# Arkhe Enterprise — runbook de operação

Data: 2026-10-23. Escopo: uma instalação Linux, uma organização e Podman rootless. Exemplos de host Linux: substituir nomes e caminhos conscientemente. No ambiente Windows de validação, os comandos Podman usam `--connection arkhe-runtime`. Este documento não indica on-call contratado, agendamento ativado, backup externo existente ou liberação de piloto externo.

## Antes da operação externa

Confirmar responsáveis técnico e de negócio, contatos de escalonamento e janela de manutenção. Registrar imagem/digest testado, domínio, origem HTTPS, limites de recursos, local de backup separado e segredos no servidor. Serpro e poderes externos continuam bloqueadores próprios; TLS não os resolve. Não publicar a porta 3003 do Next: apenas Caddy deve alcançá-la pela rede de containers. A proposta inicial de 2 CPUs, 768 MiB e 128 PIDs não pôde ser validada neste host rootless: o runtime falhou ao acessar memory.max. Nenhuma configuração da VM foi alterada; limites de recursos e dimensionamento permanecem pendentes de ambiente com controllers delegados. Volume de dados e logs precisam de monitoramento de espaço e política de retenção.

## Triagem e reinício

1. Verificar `podman ps`, `podman inspect arkhe` e `podman logs --tail 200 arkhe`. Não enviar logs integrais, segredos, bancos ou arquivos de contas ao chat/ticket.
2. Liveness: GET interno `/api/health`; readiness: GET interno `/api/ready`. Falha de readiness pede conferir volume, permissões, SQLite e drenagem; não desabilitar o gate. Inicialização faz integrity_check uma vez por processo; erro exige investigação/restauração, não apagar o banco ou WAL.
3. Para reinício planejado, `podman stop --time 25 arkhe` e `podman start arkhe`. O supervisor concede até 20 segundos ao drain nativo; não garante concluir operações além disso.
4. Se SIGKILL/OOM, disco cheio ou corrupção ocorrer, preservar dados e logs, interromper mutações e escalar. Não repetir indefinidamente operações externas ambíguas.

## Métricas e logs

`GET /api/metrics` exige sessão owner ou bearer token dedicado `ARKHE_METRICS_TOKEN` de pelo menos 32 caracteres. O Caddy de referência bloqueia essa rota publicamente, inclusive para owner; scrape ocorre pela rede interna. Token deve ficar em arquivo/gerenciador protegido do scraper, não na URL ou frontend. `/metrics` sem `/api` não foi adicionado.

Prometheus text contém contagem, histograma de duração do handler, uptime e memória RSS por processo. Labels têm rotas normalizadas, método e classe HTTP; não incluem IDs de usuário/documento, CNPJ, query ou token. A duração termina quando o handler devolve a Response, não quando streaming/transporte termina. Contadores reiniciam com o processo; não são trilha durável nem SLO. Logs HTTP são JSON em stdout, com timestamp UTC, level, operation_id gerado, installation_scope=single-org, rota, status e duração. Startup do Next e avisos do runtime ainda podem ser texto. Não existe tenant_id real ou tracing distribuído.

## TLS e proxy

[Configuração pública](../ops/enterprise/Caddyfile) exige ARKHE_PUBLIC_HOST, ARKHE_TLS_EMAIL e upstream interno. Configurar o app com ARKHE_INTRA_ORIGIN exatamente igual à origem HTTPS externa; cookies Secure e checagem Origin dependem disso. Persistir /data e /config do Caddy e proteger a rede do upstream. No teste, o proxy usa a imagem oficial Caddy em Podman rootless e apenas NET_BIND_SERVICE no bounding set, exigida pelo executável com file capability; o app mantém cap-drop=ALL e usuário node. Isso não demonstra que todos os processos do proxy rodem como usuário node. Validar configuração antes de iniciar, e DNS/portas/certificado/renovação antes de liberar tráfego público. Não copiar a configuração `tls internal` para alegar certificado público.

A [configuração local](../ops/enterprise/Caddyfile.local) usa localhost:8443 e CA descartável dentro do container. O teste Node confia explicitamente nessa CA e verifica o certificado; não altera confiança do Windows/host. Chromium no teste ignora somente esse certificado local; a verificação TLS independente é feita pelo Node. Domínio real, emissão pública, DNS e renovação não foram validados.

## Backup diário

Não copiar apenas intra.sqlite enquanto há escritas/WAL. O utilitário [backup.mjs](../apps/arkhe-intra/scripts/backup.mjs) usa snapshot SQLite online e copia accounts.json, verifica integrity_check, foreign_key_check e cadeia BLAKE3, e só então escreve manifest.json com hashes SHA-256. Diretório incompleto sem manifest válido não é backup aceito. Diretórios existentes nunca são sobrescritos.

Exemplo dentro de ambiente com volume de backup já montado e permissões preparadas:

```sh
node /app/apps/arkhe-intra/scripts/backup.mjs backup /data /backups/NOVO_ID_UNICO
```

O snapshot contém documentos, hashes de senha, chaves públicas, auditoria e configuração de bootstrap: é sensível. Guardar em armazenamento separado, com controle de acesso, criptografia e cópia fora do host conforme política aprovada. Não inclui chaves privadas de usuário, credentials.json, variáveis de ambiente, configuração de proxy, certificados privados ou artefatos externos; esses itens exigem recuperação separada pelo responsável. Não distribuir o manifest junto de dados adulterados como se seus hashes fossem assinatura externa.

Os templates [service](../ops/enterprise/arkhe-backup.service), [timer](../ops/enterprise/arkhe-backup.timer) e [job](../ops/enterprise/backup-daily.sh) permitem execução diária com systemd de usuário no host Linux. O operador instala o workspace em /opt/arkhe (ou ajusta ExecStart), prepara backup.env protegido em ~/.config/arkhe com ARKHE_DATA_VOLUME, ARKHE_BACKUP_DIRECTORY e ARKHE_BACKUP_IMAGE por digest, garante acesso do UID do container ao diretório de destino e confirma que o destino é separado do volume de origem. Rodar o job manualmente, verificar manifest e restauração antes de habilitar o timer. `systemctl --user enable --now arkhe-backup.timer` só deve ser executado após essa preparação; o timer **não foi instalado ou ativado por esta tarefa**. Linger e política de execução sem login devem ser definidos pelo operador. Sem isso, nenhum backup diário está garantido.

RPO proposto: até 24 h com job diário saudável; RTO a medir em exercício. Não há baseline, retenção automática ou failover. Definir retenção com o responsável; esta entrega não apaga backups. Alertar sobre job falho, ausência de snapshot recente e disco cheio.

## Restauração isolada e recuperação

1. Escolher snapshot, verificar acesso e preservar a fonte. Não restaurar em volume de produção em uso.
2. Em imagem compatível com o mesmo WASM/schema, executar:

```sh
node /app/apps/arkhe-intra/scripts/backup.mjs restore /backups/SNAPSHOT /restore/NOVO_DIRETORIO
```

3. O restore verifica hashes, integridade, FKs e cadeia de auditoria; cria diretório novo e remove sessões recuperadas. Conferir documentos, contas, perfil e capacidade de login em ambiente isolado, sem credenciais de produção ou saída para provedores externos.
4. Para substituição real, parar a instalação com drain, preservar o volume danificado para diagnóstico e apontar uma instalação isolada ao volume restaurado com permissões corretas. Validar login, dashboard/auditoria, readiness e reconciliação de operações externas antes de reabrir tráfego. Nunca sobrescrever automaticamente o volume original.
5. Confirmar chaves/configurações externas e tratar revogações posteriores ao snapshot; o restore pode retornar estado anterior de contas, evidências e integrações. Sessões são apagadas, mas isso não revoga automaticamente todos os convites, grants ou ações pendentes do snapshot. Revisar esses itens com governança antes da liberação. Não reexecutar cobrança, assinatura ou publicação remota apenas porque o banco voltou no tempo.

O teste local recuperou um documento e trilha real, mantendo o banco ativo posterior intacto. Isso demonstra restauração de snapshot válido, não reparação de arquivo corrompido ou sobrevivência à perda simultânea de host e backups.

## Rotação Serpro e verificação de prova

Responsável autorizado configura Consumer Key/Secret no servidor/gerenciador, reinicia com drain e verifica readiness. Testar consulta paga somente com contrato/habilitação, CNPJ e orçamento autorizados. Não imprimir Authorization/token. O circuito é por processo/configuração de credenciais; 429/503 e Retry-After devem ser respeitados. Sem configuração, o commit retorna 503 e nenhum perfil é confirmado.

Separar assinatura local, recibo WormGraph, prova MMR e ancoragem externa. No dashboard/inspeção conferir assinatura, digest, raiz, inclusão e origem disponíveis; não interpretar powers_verified=false como poderes legais. Publicação Rekor existente requer configuração confiável e recibo verificável; resultado remoto ambíguo fica pendente para reconciliação explícita. RBB/HSM/TSA não estão operacionais neste portal. Ver [política de representação](REPRESENTATION-POLICY.md).

## Incidentes e manutenção

Sem equipe/on-call presumidos: preencher responsável, substituto e escalonamento antes do piloto. Registrar horário UTC, impacto, versão/digest, sinais observados, mitigação, recuperação e ações preventivas sem dados pessoais desnecessários. Comunicações externas dependem de autorização. Definir e testar atualização de imagem Node/Rust/Caddy/dependências, scanner e rollback em staging; não confundir pull de tag com política de patching. Alertas e SLOs numéricos exigem baseline e decisão operacional.
