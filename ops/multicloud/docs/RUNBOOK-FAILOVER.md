# Ensaio e promoção AWS → Azure

Este procedimento tem oito gates. `evidence/failover.py` os executa em staging
com comandos fornecidos pelo operador. Cada comando é argv JSON, deve retornar
zero **somente quando comprovar** sua condição. Não use comandos vazios ou `true`.
Uma execução local com doubles valida ordem/cleanup, não prova failover real.

1. **assert_primary:** comprovar tráfego via AWS e writer AWS atual/epoch. Uma
   resposta `/healthz` sozinha não identifica cloud: verificar origin com telemetria
   do LB ou endpoint de diagnóstico autenticado da instalação.
2. **inject_fault:** isolar somente o componente de staging alvo. Preferir chaos
   controller ou regra reversível específica para healthcheck/ingress. Salvar a
   configuração anterior; não remover uma regra genérica 0.0.0.0/0 de produção.
3. **assert_secondary:** comprovar atendimento Azure pelo endpoint global, com
   timeout; o runner tenta até o orçamento definido (default 180 segundos).
4. **verify_replica:** baixar a versão exata da réplica e verificar **de novo**
   manifesto/prefixo, assinatura nativa, root/peaks, bundle Rekor e chaves pinadas.
   Comparar sequência/leaf_count com último checkpoint autorizado conhecido e RPO
   tolerável. Verificar recuperação dos envelopes/journal separadamente. Um recibo
   antigo ou sucesso da execução anterior não substitui esses gates.
5. **fence_primary:** revogar efetivamente a capacidade do escritor antigo de
   publicar novos commits (IAM/lease/epoch/lock com autoridade independente).
   Provar que a credencial antiga não consegue escrever, inclusive após reconexão.
   Bloquear healthcheck ou DNS não é fencing. Sem prova, parar aqui.
6. **promote_secondary:** adquirir autoridade de escrita com epoch superior usando
   o mecanismo da aplicação. Preservar tenant/stream e continuidade do MMR.
   `promote.py`/`promote-azure.sh` integram verificação nativa + Cosign e o CAS
   `promote_writer` na mesma autoridade PostgreSQL dos writers. O CAS é o fence
   efetivo: a operação troca owner/epoch atomicamente e espera transações antigas.
   Não executar contra uma cópia independente dessa autoridade. Se ela estiver
   indisponível, parar; não criar um fence local alternativo. Para este backend,
   fence/promote formam uma operação atômica; o gate anterior comprova a condição
   operacional e a autoridade, não deve incrementar epoch separadamente.
7. **assert_writer:** anexar um evento de teste, verificar incremento monotônico e
   prova/checkpoint, e rejeição de um append tentado pelo antigo writer.
8. **restore_fault:** restaurar conectividade/configuração salva mesmo em falha.
   Não restaurar privilégios de writer AWS. Fazer ressincronização inversa antes de
   reintegrá-la como réplica. Falha após promoção exige intervenção; nunca fazer
   failback automático. Cleanup que falhar precisa de intervenção imediata.

O arquivo local de configuração contém `environment: "staging"`,
`failover_timeout_seconds: 180` e um mapa `commands` com **todas** as chaves acima,
usando os nomes exatos com underscores. Execute:

```powershell
python ops/multicloud/evidence/failover.py D:/secure/staging-drill.json
```

Registre data, versão das imagens/políticas, epoch, último checkpoint AWS, último
checkpoint Azure, atraso medido, RTO de roteamento, RTO total de escrita, resultados
de cada gate e restauração. O runner relata somente RTO de roteamento a partir do
fim da injeção; os demais valores devem vir da telemetria real. Não declare RPO=0
para replicação assíncrona. Ensaios em produção exigem um plano operacional próprio.
