//! **Toda** a SQL do sistema está aqui.
//!
//! É a camada que o núcleo anterior não tinha: 457 de 700 arquivos seguravam
//! `AsyncSession` e iam direto ao `select()`, sem costura nenhuma. Aqui o
//! caminho é sempre `island → repo → banco`, e o `PgPool` **não** sai deste
//! crate. Um router que precise de uma consulta nova acrescenta um método
//! aqui — e a leitura da política RLS, do hash e da cardinalidade fica num
//! lugar só.

use aegis_ontology::Contrato;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use sqlx::postgres::PgPool;

use crate::erro::{ErroStore, Resultado};
use crate::pool::abrir_tx;

#[derive(Debug, Clone, FromRow, Deserialize, serde::Serialize)]
pub struct Tenant {
    pub id: String,
    pub slug: String,
    pub nome: String,
    pub ativo: bool,
    pub seed_versao: i32,
    /// 🔴 Qual **vertical** possui este tenant. `NULL` = ilha sem produto.
    ///
    /// É o que permite a instalação aposar o produto anterior **sem o produto
    /// saber que ele existia** — a alternativa era o produto importar a seed
    /// alheia, que é a mesma classe do "cada um tem a sua cópia" que a casa
    /// já mediu.
    pub vertical: Option<String>,
}

#[derive(Debug, Clone, FromRow, serde::Serialize)]
pub struct Objeto {
    pub id: String,
    pub tipo: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chave_canonica: Option<String>,
    pub propriedades: Value,
    pub versao: i32,
    pub signed_hash: String,
    pub criado_em: chrono::DateTime<chrono::Utc>,
    pub atualizado_em: chrono::DateTime<chrono::Utc>,
}

/// O que a ilha mediu sobre o **seu** isolamento.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Isolamento {
    /// Linhas vistas **sem** o GUC de tenant. Tem de ser `0`.
    pub sem_contexto: i64,
    /// Linhas vistas **com** o GUC. Tem de ser `> 0` para haver o que isolar.
    pub com_contexto: i64,
    /// A tabela existe? Se não, os dois `-1` acima são "não medi", não "zero".
    pub tabela_presente: bool,
}

impl Isolamento {
    /// O isolamento está **a funcionar**?
    ///
    /// 🔴 As três condições juntas, e nenhuma chega sem as outras: sem
    /// contexto a ver `0` com a tabela presente, e com contexto a ver **algo**.
    /// Uma ilha sem uma única instância tem `com_contexto == 0` e é igualmente
    /// isolada — mas isso também é o estado de "instalada e vazia", e a
    /// segunda checagem (`@catalogo`) é a que apanha esse.
    pub fn efetivo(&self) -> bool {
        self.tabela_presente && self.sem_contexto == 0
    }
}

/// O repositório da ilha.
#[derive(Debug, Clone)]
pub struct Repo {
    pool: PgPool,
}

fn banco(que: &str, fonte: sqlx::Error) -> ErroStore {
    ErroStore::Banco(format!("{que}: {fonte}"))
}

impl Repo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    // -- tenant ------------------------------------------------------------
    //
    // O tenant e o marcador do seed são lidos e escritos **sem** contexto de
    // tenant: são a lista de tenants, e a política de `aegis_objeto` é a que
    // os isola. A tabela de tenants em si não tem RLS — é onde a lista mora.

    /// Cria o tenant, ou devolve o que já existe.
    ///
    /// Idempotente pelo slug: instalar duas vezes a mesma ilha não cria dois
    /// tenants nem falha.
    pub async fn tenant(&self, slug: &str, nome: &str, vertical: &str) -> Resultado<Tenant> {
        sqlx::query_as::<_, Tenant>(
            "insert into aegis_tenant (slug, nome, vertical) values ($1, $2, $3)
             on conflict (slug) do update
                set nome = excluded.nome, vertical = excluded.vertical
             returning id::text, slug, nome, ativo, seed_versao, vertical",
        )
        .bind(slug)
        .bind(nome)
        .bind(vertical)
        .fetch_one(&self.pool)
        .await
        .map_err(|fonte| banco("não criei o tenant", fonte))
    }

    /// Existe tenant com este slug?
    ///
    /// Existe **sem criar**. A ilha pergunta antes de aplicar um vertical, e
    /// "perguntar criando" faria toda pergunta criar um tenant — que é
    /// exatamente o estado fantasma que a casa já viu ("ilha com o vertical
    /// declarado e o tenant vazio").
    pub async fn tenant_existe(&self, slug: &str) -> Resultado<bool> {
        let n: i64 = sqlx::query_scalar("select count(*) from aegis_tenant where slug = $1")
            .bind(slug)
            .fetch_one(&self.pool)
            .await
            .map_err(|fonte| banco("não procurei o tenant", fonte))?;
        Ok(n > 0)
    }

    pub async fn definir_seed(&self, tenant_id: &str, versao: i32) -> Resultado<()> {
        sqlx::query("update aegis_tenant set seed_versao = $2 where id::text = $1")
            .bind(tenant_id)
            .bind(versao)
            .execute(&self.pool)
            .await
            .map_err(|fonte| banco("não gravei o marcador do seed", fonte))?;
        Ok(())
    }

    pub async fn seed_de(&self, tenant_id: &str) -> Resultado<i32> {
        let linha = sqlx::query_as::<_, Tenant>(
            "select id::text, slug, nome, ativo, seed_versao, vertical
             from aegis_tenant where id::text = $1",
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|fonte| banco("não li o tenant", fonte))?;

        linha
            .map(|t| t.seed_versao)
            .ok_or_else(|| ErroStore::TenantInexistente {
                slug: tenant_id.to_string(),
            })
    }

    // -- objetos -----------------------------------------------------------

    /// 🔴 A **ÚNICA** escrita de instância do sistema.
    ///
    /// Passa pelo portão do contrato, mantém a identidade canônica, versiona
    /// e assina. A prova de que isto é verdade não é o teste desta função: é
    /// **não haver outra**.
    pub async fn gravar(
        &self,
        contrato: &Contrato,
        tenant_id: &str,
        tipo: &str,
        chave_canonica: Option<&str>,
        propriedades: &Value,
    ) -> Resultado<Objeto> {
        // 🔴 O portão vem ANTES de qualquer SQL. Uma propriedade fora do
        // contrato nunca chega ao banco — nem para "ser corrigida depois", que
        // é como a ontologia enche de lixo que ninguém consegue ler.
        let coercao = contrato.coagir(tipo, propriedades)?;
        let valor = coercao.valor;

        let mut tx = abrir_tx(&self.pool, tenant_id).await?;

        // `for update` na instância existente: duas gravações da mesma chave
        // ao mesmo tempo não podem ler a mesma versão e escreverem as duas.
        let existente: Option<(String, i32)> = sqlx::query_as(
            "select id::text, versao from aegis_objeto
             where tenant_id::text = $1 and tipo = $2 and chave_canonica = $3
               and removido_em is null
             for update",
        )
        .bind(tenant_id)
        .bind(tipo)
        .bind(chave_canonica)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|fonte| banco("não procurei a instância", fonte))?;

        let versao = existente.as_ref().map_or(1, |(_, v)| v + 1);
        let assinatura = assinar(tenant_id, tipo, chave_canonica, versao, &valor);

        let linha = match existente {
            Some((id, _)) => sqlx::query_as::<_, Objeto>(
                "update aegis_objeto
                 set propriedades = $2, versao = $3, signed_hash = $4, atualizado_em = now()
                 where id::text = $1
                 returning id::text, tipo, chave_canonica, propriedades,
                           versao, signed_hash, criado_em, atualizado_em",
            )
            .bind(&id)
            .bind(&valor)
            .bind(versao)
            .bind(&assinatura)
            .fetch_one(&mut *tx)
            .await
            .map_err(|fonte| banco("não atualizei a instância", fonte))?,

            None => sqlx::query_as::<_, Objeto>(
                // 🔴 `$1::uuid` não é enfeite. O `tenant_id` entra na
                // aplicação como `&str` (vem do GUC, e o GUC é texto), e sem
                // o cast o Postgres recusa com *"column tenant_id is of type
                // uuid but expression is of type text"*. Nos `WHERE` o
                // `::text` do outro lado resolvia; no `INSERT` não há outro
                // lado, e o cast tem de estar aqui.
                "insert into aegis_objeto
                     (tenant_id, tipo, chave_canonica, propriedades, versao, signed_hash)
                 values ($1::uuid, $2, $3, $4, $5, $6)
                 returning id::text, tipo, chave_canonica, propriedades,
                           versao, signed_hash, criado_em, atualizado_em",
            )
            .bind(tenant_id)
            .bind(tipo)
            .bind(chave_canonica)
            .bind(&valor)
            .bind(versao)
            .bind(&assinatura)
            .fetch_one(&mut *tx)
            .await
            .map_err(|fonte| match &fonte {
                sqlx::Error::Database(db) if db.code().as_deref() == Some("23505") => {
                    ErroStore::ChaveDuplicada {
                        tipo: tipo.to_string(),
                        chave: chave_canonica.unwrap_or("(sem chave)").to_string(),
                    }
                }
                _ => banco("não gravei a instância", fonte),
            })?,
        };

        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei", fonte))?;
        Ok(linha)
    }

    /// Lista as instâncias vivas de um tipo, mais recentes primeiro.
    pub async fn listar(&self, tenant_id: &str, tipo: &str, limite: i64) -> Resultado<Vec<Objeto>> {
        let mut tx = abrir_tx(&self.pool, tenant_id).await?;
        let linhas = sqlx::query_as::<_, Objeto>(
            "select id::text, tipo, chave_canonica, propriedades,
                    versao, signed_hash, criado_em, atualizado_em
             from aegis_objeto
             where tenant_id::text = $1 and tipo = $2 and removido_em is null
             order by criado_em desc
             limit $3",
        )
        .bind(tenant_id)
        .bind(tipo)
        .bind(limite)
        .fetch_all(&mut *tx)
        .await
        .map_err(|fonte| banco("não listei", fonte))?;
        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei", fonte))?;
        Ok(linhas)
    }

    /// Conta as instâncias vivas de um tipo.
    pub async fn contar(&self, tenant_id: &str, tipo: &str) -> Resultado<i64> {
        let mut tx = abrir_tx(&self.pool, tenant_id).await?;
        let n: i64 = sqlx::query_scalar(
            "select count(*) from aegis_objeto
             where tenant_id::text = $1 and tipo = $2 and removido_em is null",
        )
        .bind(tenant_id)
        .bind(tipo)
        .fetch_one(&mut *tx)
        .await
        .map_err(|fonte| banco("não contei", fonte))?;
        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei", fonte))?;
        Ok(n)
    }

    /// 🔴 A ilha mede o **seu próprio isolamento**.
    ///
    /// Abre uma transação **sem** o GUC de tenant e conta. A política tem de
    /// devolver **zero** — e `zero` não é `todas`. Se a transação sem contexto
    /// trouxer linhas, ou a RLS não está ligada, ou quem está a ler tem
    /// `BYPASSRLS`, e nos dois casos a ilha está a servir o tenancy inteiro
    /// para quem pedir.
    ///
    /// Isto é uma medição de produto, e não um teste: a casa já mediu um
    /// `doctor` que lia a lista de políticas, achava-a válida, e o runtime
    /// ligava-se como `BYPASSRLS` — a lista estava certa e o isolamento não.
    pub async fn isolamento(&self, tenant_id: &str) -> Isolamento {
        // 1. SEM contexto. Tem de dar zero.
        let sem_contexto: i64 = match sqlx::query_scalar("select count(*) from aegis_objeto")
            .fetch_one(&self.pool)
            .await
        {
            Ok(n) => n,
            // A tabela nem existe: o schema não está aplicado. Isso é um
            // isolamento "ok" por acidente, e dizê-lo seria mentira.
            Err(_) => {
                return Isolamento {
                    sem_contexto: -1,
                    com_contexto: -1,
                    tabela_presente: false,
                };
            }
        };

        // 2. COM contexto. Tem de ver o tenant, e só o tenant.
        let com_contexto: i64 = contar_com_contexto(&self.pool, tenant_id)
            .await
            .unwrap_or(-1);

        Isolamento {
            sem_contexto,
            com_contexto,
            tabela_presente: true,
        }
    }

    /// Procura uma instância pela sua identidade canônica.
    ///
    /// É o que permite ao catálogo do vertical declarar uma aresta
    /// `reserva -> quarto` por chave, e não por id — o id só existe depois da
    /// escrita, e o manifesto é escrito **antes**.
    pub async fn por_chave(
        &self,
        tenant_id: &str,
        tipo: &str,
        chave: &str,
    ) -> Resultado<Option<Objeto>> {
        let mut tx = abrir_tx(&self.pool, tenant_id).await?;
        let linha = sqlx::query_as::<_, Objeto>(
            "select id::text, tipo, chave_canonica, propriedades,
                    versao, signed_hash, criado_em, atualizado_em
             from aegis_objeto
             where tenant_id::text = $1 and tipo = $2 and chave_canonica = $3
               and removido_em is null",
        )
        .bind(tenant_id)
        .bind(tipo)
        .bind(chave)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|fonte| banco("não procurei por chave", fonte))?;
        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei", fonte))?;
        Ok(linha)
    }

    /// 🔴 Todos os tipos declarados, com o número de instâncias de cada um.
    ///
    /// É a resposta de `/v23/ontologia/tipos` do núcleo anterior, e ela
    /// importa por uma razão: **um tipo com zero instâncias precisa
    /// aparecer**, senão o operador conclui que o tipo não existe.
    pub async fn tipos_com_conta(&self, tenant_id: &str) -> Resultado<Vec<(String, i64)>> {
        let mut tx = abrir_tx(&self.pool, tenant_id).await?;
        let linhas: Vec<(String, i64)> = sqlx::query_as(
            "select tipo, count(*) from aegis_objeto
             where tenant_id::text = $1 and removido_em is null
             group by tipo",
        )
        .bind(tenant_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|fonte| banco("não contei por tipo", fonte))?;
        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei", fonte))?;
        Ok(linhas)
    }

    /// Soft delete. O registo some das telas e fica auditável.
    pub async fn remover(&self, tenant_id: &str, id: &str) -> Resultado<()> {
        let mut tx = abrir_tx(&self.pool, tenant_id).await?;
        let afetadas = sqlx::query(
            "update aegis_objeto set removido_em = now()
             where id::text = $1 and removido_em is null",
        )
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|fonte| banco("não removi", fonte))?
        .rows_affected();

        if afetadas == 0 {
            // 🔴 Objecto invisível e objecto inexistente dão a **mesma**
            // resposta. Distingui-los é um oráculo: quem sonda ids descobre o
            // que existe.
            let _ = tx.rollback().await;
            return Err(ErroStore::ObjetoInvisivel { id: id.to_string() });
        }
        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei", fonte))?;
        Ok(())
    }

    // -- arestas -----------------------------------------------------------

    /// 🔴 Cria uma aresta **forçando** a cardinalidade declarada.
    ///
    /// O `for update` na linha de origem fecha a corrida: sem ele, duas
    /// arestas do mesmo link a chegar ao mesmo tempo vêem o mesmo `count` e as
    /// duas passam. No núcleo anterior a cardinalidade era um rótulo em
    /// `metadata` que ninguém checava.
    pub async fn ligar(
        &self,
        contrato: &Contrato,
        tenant_id: &str,
        nome_link: &str,
        origem: &str,
        destino: &str,
    ) -> Resultado<()> {
        let link = contrato
            .link(nome_link)
            .ok_or_else(|| ErroStore::TipoDesconhecido {
                tipo: nome_link.to_string(),
            })?
            .clone();

        let mut tx = abrir_tx(&self.pool, tenant_id).await?;

        // Trava a origem. Sem isto, a contagem abaixo é uma fotografia que
        // fica velha antes de a inserção acontecer.
        sqlx::query("select id from aegis_objeto where id::text = $1 for update")
            .bind(origem)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|fonte| banco("não tranquei a origem", fonte))?;

        // 🔴 A contagem **exclui a aresta que está a ser criada**.
        //
        // Sem isto, instalar duas vezes o mesmo catálogo reprova na segunda:
        // a aresta já existe, a contagem dá 1, o limite é 1, e o gesto que o
        // plano exige ser idempotente passa a falhar. E `on conflict do
        // nothing` a tornaria um no-op de qualquer jeito — a recusa era
        // incoerente com o que o `INSERT` logo abaixo faz.
        //
        // Uma relação `1:1` quer dizer "no máximo um destino DISTINTO", não
        // "no máximo um registo que diga isto".
        let ja_existem: i64 = sqlx::query_scalar(
            "select count(*) from aegis_aresta
             where tenant_id::text = $1 and nome_link = $2 and origem_id::text = $3
               and not (destino_id::text = $4)",
        )
        .bind(tenant_id)
        .bind(nome_link)
        .bind(origem)
        .bind(destino)
        .fetch_one(&mut *tx)
        .await
        .map_err(|fonte| banco("não contei as arestas", fonte))?;

        if let Err(e) = contrato.cabe(nome_link, origem, ja_existem as usize) {
            let _ = tx.rollback().await;
            return Err(ErroStore::Cardinalidade(e));
        }

        sqlx::query(
            "insert into aegis_aresta (tenant_id, nome_link, origem_id, destino_id)
             values ($1::uuid, $2, $3::uuid, $4::uuid)
             on conflict (tenant_id, nome_link, origem_id, destino_id) do nothing",
        )
        .bind(tenant_id)
        .bind(&link.nome)
        .bind(origem)
        .bind(destino)
        .execute(&mut *tx)
        .await
        .map_err(|fonte| banco("não criei a aresta", fonte))?;

        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei", fonte))?;
        Ok(())
    }

    /// Os vizinhos de um objeto por um link, com até `profundidade` saltos.
    pub async fn vizinhos(
        &self,
        tenant_id: &str,
        origem: &str,
        nome_link: &str,
        profundidade: i32,
        teto: i64,
    ) -> Resultado<Vec<Objeto>> {
        let mut tx = abrir_tx(&self.pool, tenant_id).await?;

        let inicial = sqlx::query_scalar::<_, String>(
            "select destino_id::text from aegis_aresta
             where tenant_id::text = $1 and nome_link = $2 and origem_id::text = $3",
        )
        .bind(tenant_id)
        .bind(nome_link)
        .bind(origem)
        .fetch_all(&mut *tx)
        .await
        .map_err(|fonte| banco("não li o primeiro salto", fonte))?;

        let mut vistos: Vec<String> = Vec::new();
        let mut fronteira = inicial;
        let mut saida: Vec<Objeto> = Vec::new();

        for _ in 0..profundidade.clamp(1, 6) {
            let novos: Vec<String> = fronteira
                .into_iter()
                .filter(|i| !vistos.contains(i))
                .collect();
            if novos.is_empty() {
                break;
            }
            vistos.extend(novos);

            let linhas = sqlx::query_as::<_, Objeto>(
                "select id::text, tipo, chave_canonica, propriedades,
                        versao, signed_hash, criado_em, atualizado_em
                 from aegis_objeto
                 where id::text = any($1) and removido_em is null",
            )
            .bind(&vistos)
            .fetch_all(&mut *tx)
            .await
            .map_err(|fonte| banco("não li os vizinhos", fonte))?;
            saida.extend(linhas);

            if saida.len() as i64 >= teto {
                saida.truncate(teto as usize);
                break;
            }

            fronteira = sqlx::query_scalar::<_, String>(
                "select destino_id::text from aegis_aresta
                 where tenant_id::text = $1 and nome_link = $2 and origem_id::text = any($3)",
            )
            .bind(tenant_id)
            .bind(nome_link)
            .bind(&vistos)
            .fetch_all(&mut *tx)
            .await
            .map_err(|fonte| banco("não li o salto seguinte", fonte))?;
        }

        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei", fonte))?;
        Ok(saida)
    }
    /// 🔴 Aposa o **dado** de um produto que este tenant deixou de ter.
    ///
    /// O menu não precisa de reconciliação: no núcleo anterior cada seed
    /// empurrava as suas páginas para um `registered_pages` partilhado e a
    /// próxima tinha de as tirar — e tirava-as importando as seeds alheias.
    /// Aqui o vertical **é** o manifesto, há um só, e o menu é derivado
    /// dele. Não há o que reconciliar.
    ///
    /// O que fica é o **dado**: os objetos do produto anterior continuam na
    /// tabela, e um tipo que o produto novo não declara é dado de um produto
    /// que já não está instalado. A tabela não distingue um do outro — por
    /// isso o critério é o **contrato**: os tipos que o vertical novo declara
    /// são seus, e tudo o resto é de quem saiu.
    ///
    /// E é uma remoção suave, como todas: o registo some das telas e fica
    /// auditável, que é o que permite desfazer uma troca de produto.
    pub async fn aposar_tipos_de_aposado(
        &self,
        tenant_id: &str,
        tipos_do_vertical: &[String],
    ) -> Resultado<u64> {
        let mut tx = abrir_tx(&self.pool, tenant_id).await?;
        let afetados = sqlx::query(
            "update aegis_objeto set removido_em = now()
             where tenant_id::text = $1
               and removido_em is null
               and not (tipo = any($2))",
        )
        .bind(tenant_id)
        .bind(tipos_do_vertical)
        .execute(&mut *tx)
        .await
        .map_err(|fonte| banco("não apostei o produto anterior", fonte))?
        .rows_affected();

        // As arestas vão com os objetos: uma aresta para um objeto removido é
        // uma relação que aponta para o vazio, e a travessia devolvia
        // menos sem dizer porquê.
        let _ = sqlx::query(
            "delete from aegis_aresta a
             where a.tenant_id::text = $1
               and (a.origem_id in (select id from aegis_objeto where removido_em is not null)
                 or a.destino_id in (select id from aegis_objeto where removido_em is not null))",
        )
        .bind(tenant_id)
        .execute(&mut *tx)
        .await;

        tx.commit()
            .await
            .map_err(|fonte| banco("não confirmei o aposamento", fonte))?;
        Ok(afetados)
    }
}

/// A assinatura de uma instância.
///
/// 🔴 Cobre **conteúdo e identidade**: mudar a chave canônica ou o tipo
/// invalida a assinatura, porque ela é a prova de que a instância é a que o
/// sistema diz ser — não só a de que o texto não mudou.
///
/// O `serde_json` serializa `Object` como `BTreeMap` (sem a feature
/// `preserve_order`), o que dá forma canónica estável: as mesmas
/// propriedades, com as chaves em ordens diferentes, produzem o mesmo hash.
pub(crate) fn assinar(
    tenant_id: &str,
    tipo: &str,
    chave: Option<&str>,
    versao: i32,
    propriedades: &Value,
) -> String {
    let mut h = Sha256::new();
    h.update(tenant_id.as_bytes());
    h.update([0]);
    h.update(tipo.as_bytes());
    h.update([0]);
    h.update(chave.unwrap_or("").as_bytes());
    h.update([0]);
    h.update(versao.to_le_bytes());
    h.update([0]);
    h.update(serde_json::to_vec(propriedades).unwrap_or_default());
    hex::encode(h.finalize())
}

/// Conta as instâncias **com** o GUC posto — o outro lado da medição de
/// isolamento.
async fn contar_com_contexto(pool: &PgPool, tenant_id: &str) -> Resultado<i64> {
    let mut tx = abrir_tx(pool, tenant_id).await?;
    let n: i64 = sqlx::query_scalar("select count(*) from aegis_objeto")
        .fetch_one(&mut *tx)
        .await
        .map_err(|fonte| banco("não contei com contexto", fonte))?;
    tx.commit()
        .await
        .map_err(|fonte| banco("não confirmei", fonte))?;
    Ok(n)
}
