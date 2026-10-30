//! A ilha, do **ponto de vista de quem a usa** — o cliente.
//!
//! 🔴 Isto é o outro lado de `aegis-island`. O island **serve**; este ficheiro
//! **fala com quem serve**. E o que ele **não** faz é traduzir: a ilha
//! responde com `codigo`, `mensagem` e `gesto`, e o [`Resultado`] sai com os
//! três, para que uma face agêntica recuse exactamente como a janela recusa.
//!
//! ## Por que um cliente e não um `reqwest` no `mcp.rs`
//!
//! Porque a **recusa** é a parte difícil. Se o `mcp` chamasse o `reqwest` e
//! montasse o `Resultado` sozinho, o `codigo` e o `gesto` seriam uma segunda
//! tradução — e a casa mediu que a regra duplicada diverge no primeiro caso de
//! borda. Aqui a tradução é uma função, e a face só a chama.
//!
//! ## E o `--vertical` não manda
//!
//! A ilha que se fala é a que a **variável de ambiente** aponta, e o vertical
//! que o agente serve é o do `--vertical` do arranque. São coisas diferentes: o
//! primeiro é **onde**, o segundo é **o quê**. Um servidor que misture os dois
//! aceita falar com a ilha de outro produto — e o sintoma disso é um painel que
//! mostra o produto errado, que é a falha mais silenciosa que existe.

use serde_json::Value;

use crate::Resultado;

/// O que a ilha respondeu quando recusou.
///
/// 🔴 Os três campos, e o `gesto` é o que faltava: entrou com a quarta face.
/// A ilha respondia `codigo` e `mensagem` e nada mais, e quem lia aquilo por
/// HTTP era a CLI — que tem o terminal à frente e sabe o que fazer. Um modelo
/// não tem.
struct Recusa {
    codigo: String,
    mensagem: String,
    gesto: String,
}

/// Lê a recusa do corpo da ilha, e **diz quando não a leu**.
///
/// 🔴 Uma ilha mais velha, ou um proxy que reescreve o corpo, devolve um erro
/// sem `gesto`. Devolver uma recusa sem gesto seria reintroduzir em silêncio
/// o defeito que esta peça existe para fechar; e *não* ser a ilha a responder
/// não é uma recusa do produto, é uma falha de transporte.
fn recusa_do_corpo(corpo: &Value) -> Option<Recusa> {
    let codigo = corpo.get("codigo")?.as_str()?.to_string();
    let mensagem = corpo
        .get("mensagem")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let gesto = corpo
        .get("gesto")
        .and_then(Value::as_str)
        .unwrap_or_default();
    Some(Recusa {
        codigo,
        mensagem: mensagem.to_string(),
        gesto: gesto.to_string(),
    })
}

/// 🔴 A barra final **cai**, e a prova é uma função **pura**.
///
/// Quem escreve `AEGIS_ILHA_URL` no `.env` não sabe que a barra é o
/// separador entre o endereço e o caminho, e `https://x//api/v1` é um 404
/// cujo sintoma não aponta para a barra — aponta para a rota.
fn sem_barra_final(endereco: &str) -> &str {
    endereco.trim_end_matches('/')
}

/// O endereço da ilha, ou a recusa que explica a falta.
///
/// 🔴 Lê pelo `ilha_url()` do `aegis-ambiente` e **nunca** por um
/// `std::env::var` próprio. A guarda `nenhuma_variavel_de_ambiente_e_lida_
/// fora_do_ambiente` existe para isto — e ela mordeu-me a primeira vez, que é
/// exactamente o que uma guarda deve fazer.
pub fn endereco() -> Resultado<String> {
    match aegis_ambiente::ilha_url() {
        Some(u) => Resultado::Feito(sem_barra_final(&u).to_string()),
        None => Resultado::recusado(
            "ilha.sem-endereco",
            "Não sei onde está a ilha a que falar.",
            "Defina AEGIS_ILHA_URL com o endereço da ilha (a que serve este vertical).",
        ),
    }
}

/// Um `GET` à ilha, que devolve o `Feito` com o corpo ou a recusa **da ilha**.
///
/// 🔴 O **timeout** é curto e explícito, e não o do `reqwest` (que não tem):
/// uma ilha que não responde tem de devolver *"não consegui falar com a ilha"*
/// em segundos. Um pedido que fica pendurado é um agente que fica à espera de
/// uma resposta que não vem — e o pior sintoma que existe, porque não parece
/// um defeito, parece lentidão. E o que o `pedir` diz à pessoa aponta para a
/// rede, que é a única coisa que a pessoa pode mudar.
async fn pedir(caminho: &str) -> Resultado<Value> {
    let base = crate::ou_saia!(endereco());
    let url = format!("{base}{caminho}");
    // 🔴 Falha a montar o cliente é `falhou` e não recusa: o pedido era
    // legítimo, é o produto que não conseguiu montar a ferramenta. E a frase
    // diz o que é, porque um "não consegui falar com a ilha" sem isto é
    // indistinguível de "a ilha não está lá" — e são coisas opostas.
    let cliente = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return Resultado::falhou(
                "ilha.cliente",
                &format!("Não consegui montar o cliente de HTTP: {e}"),
            );
        }
    };
    let mut pedido = cliente.get(&url);
    // 🔴 O token viaja **no cabeçalho** e nunca no caminho: um caminho com
    // token é um token que fica no log de um proxy e no histórico de um
    // `access_token`. É a regra do `wa-brain` (`Authorization` e nunca na
    // query) e do `aegis-desktop`, e é a única forma de o mesmo produto não
    // ter três reglas para segredos.
    if let Some(t) = aegis_ambiente::token_da_ilha() {
        pedido = pedido.bearer_auth(t);
    }
    let resposta = match pedido.send().await {
        Ok(r) => r,
        Err(e) => {
            return Resultado::falhou(
                "ilha.inacessivel",
                &format!(
                    "Não consegui falar com a ilha em {base}: {e}. \
                     A ilha está no ar, e este endereço é o dela?"
                ),
            );
        }
    };
    let estado = resposta.status();
    // 🔴 O corpo vem **como texto**, e só é converters para JSON depois de se
    // saber que houve erro.
    //
    // A primeira versão pedia o JSON logo aqui, e um `204` ou um corpo vazio
    // — que a ilha **pode** responder, porque `/health/ready` devolve um
    // `503` com corpo, mas um proxy à frente responde o que quer — dava
    // "resposta ilegível" em vez de "a ilha recusou". O sintoma virava *"a
    // ilha fala uma língua estranha"* quando o que acontecia era uma recusa
    // com o corpo num formato que este cliente não conhecia. A ordem é
    // **estado primeiro**, e só depois o corpo.
    let bruto = match resposta.text().await {
        Ok(t) => t,
        Err(e) => {
            return Resultado::falhou(
                "ilha.resposta-ilegivel",
                &format!("A ilha respondeu em {url} e o corpo não chegou a ler-se: {e}"),
            );
        }
    };
    let corpo: Value = serde_json::from_str(&bruto).unwrap_or(Value::Null);
    if estado.is_success() && !corpo.is_null() {
        return Resultado::Feito(corpo);
    }
    // 🔴 **A Prontidão tem forma própria, e é a que a ilha usa.** O
    // `/health/ready` devolve o `Prontidao` — `{pronto, banco, motivo,
    // o_que_dizer, o_que_fazer}` — e **não** o `{codigo, mensagem, gesto}`
    // das outras rotas. A primeira versão desta peça tratava o `503` como
    // "erro sem código" e devolvia `ilha.erro-sem-codigo`, que é
    // simultaneamente **falso** (a ilha disse tudo) e **inútil** (o agente
    // fica a saber que houve um 503 e nada mais).
    //
    // E a distinção é a da casa entre `1` e `3`: a ilha não estar pronta é
    // uma **recusa** — o pedido era legítimo, é o estado que não o permite.
    // Tratar como falha puniria o agente por um defeito da plataforma.
    if let Some(r) = recusa_de_prontidao(&corpo) {
        return r;
    }
    // 🔴 A recusa da ilha entra **com os três campos que ela enviou**. Uma
    // ilha que não mandou o gesto não é um defeito desta face, e mandamos o
    // que veio — mas dizemos que veio partido, porque um `gesto` vazio que o
    // modelo recebe como string vazia é indistinguível de "não há nada a
    // fazer".
    match recusa_do_corpo(&corpo) {
        Some(r) if r.gesto.trim().is_empty() => Resultado::recusado(
            &r.codigo,
            &r.mensagem,
            "A ilha não mandou o que fazer a seguir — ver o registo da ilha",
        ),
        Some(r) => Resultado::recusado(&r.codigo, &r.mensagem, &r.gesto),
        None => Resultado::falhou(
            "ilha.erro-sem-codigo",
            &format!(
                "A ilha respondeu {estado} sem código fechado: {bruto}. \
                 Uma falha que não tem código não é uma recusa do produto."
            ),
        ),
    }
}

/// Lê a **Prontidão** da ilha, que tem forma própria.
///
/// 🔴 Só uma ilha **pronta** é um `Feito` — e o `200` com `pronto: false`
/// é o caso que a primeira versão desta função tratava como sucesso. Era o
/// pior dos dois: o agente recebia "saúde" e o produto estava por verificar.
fn recusa_de_prontidao(corpo: &Value) -> Option<Resultado<Value>> {
    let pronto = corpo.get("pronto")?.as_bool()?;
    if pronto {
        return Some(Resultado::Feito(corpo.clone()));
    }
    // 🔴 O `codigo` vem do `motivo`, e o `motivo` da ilha é uma `&'static
    // str` que já é um código fechado (`pronto.*`). Uma ilha mais velha, ou
    // um `motivo` vazio, cai num código desta peça — e diz isso em vez de
    // devolver um motivo que ninguém fez.
    let codigo = corpo
        .get("motivo")
        .and_then(Value::as_str)
        .filter(|c| !c.trim().is_empty())
        .unwrap_or("pronto.indefinido");
    let frase = corpo
        .get("o_que_dizer")
        .and_then(Value::as_str)
        .filter(|f| !f.trim().is_empty())
        .unwrap_or("a ilha ainda não está pronta");
    let gesto = corpo
        .get("o_que_fazer")
        .and_then(Value::as_str)
        .filter(|g| !g.trim().is_empty())
        .unwrap_or("Verificar a ilha: aegis ilha estado");
    Some(Resultado::recusado(codigo, frase, gesto))
}

/// O manifesto da ilha que está a servir.
pub async fn vertical() -> Resultado<Value> {
    pedir("/api/v1/vertical").await
}

/// Os tipos declarados e instanciados.
pub async fn tipos() -> Resultado<Value> {
    pedir("/api/v1/ontologia/tipos").await
}

/// Uma página, já desenhada.
pub async fn pagina(slug: &str) -> Resultado<Value> {
    // 🔴 O `slug` vai **codificado**. Um slug com barra ou espaço é um 404
    // cujo sintoma parece "a página não existe", e a página existe.
    pedir(&format!("/api/v1/paginas/{}", encodar(slug))).await
}

/// A saúde da ilha, com o que ela mediu de facto.
pub async fn saude() -> Resultado<Value> {
    pedir("/health/ready").await
}

/// 🔴 A Prontidão **como dado**, e não como recusa.
///
/// Existe porque a [`saude`] está certa para o `ilha_saude` — que quer
/// "pronto" ou um motivo — e está **errada** para a conferência: um
/// diagnóstico que devolve um erro quando o problema é o que tem de explicar
/// não serve para nada. É a diferença entre `1` e `3` aplicada ao *mesmo*
/// endpoint.
///
/// 🔴 E o que muda é só a **interpretação**, não o pedido: uma ilha
/// inacessível, um endereço por pôr e um `502` de um proxy continuam a ser o
/// que já eram. Uma `Prontidao` malformada vira `Falhou` com o corpo, porque
/// uma forma que ninguém reconhece não é um dado — é um produto diferente, e
/// dizer *"não deu para conferir"* seria fingir que deu.
pub async fn prontidao() -> Resultado<aegis_island::Prontidao> {
    // 🔴 O endereço ausente sai pelo **mesmo** `ou_saia!` que a [`pedir`]
    // usa, e por isso devolve a **mesma** recusa — `ilha.sem-endereco`, com a
    // mesma frase e o mesmo gesto. Reescrever a recusa aqui seria a segunda
    // tradução do defeito que este ficheiro existe para não ter, e o agente
    // receberia dois motivos diferentes para a mesma falta.
    let base = crate::ou_saia!(endereco());
    let url = format!("{base}/health/ready");
    let cliente = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return Resultado::falhou(
                "ilha.cliente",
                &format!("Não consegui montar o cliente de HTTP: {e}"),
            );
        }
    };
    let mut pedido = cliente.get(&url);
    if let Some(t) = aegis_ambiente::token_da_ilha() {
        pedido = pedido.bearer_auth(t);
    }
    let resposta = match pedido.send().await {
        Ok(r) => r,
        Err(e) => {
            return Resultado::falhou(
                "ilha.inacessivel",
                &format!("Não consegui falar com a ilha em {base}: {e}"),
            );
        }
    };
    // 🔴 O `503` é o caso **normal** desta leitura, e não um erro: a ilha não
    // está pronta e é exatamente isso que o diagnóstico tem de mostrar. Por isso
    // o estado HTTP não é julgado aqui — só o corpo.
    let bruto = match resposta.text().await {
        Ok(t) => t,
        Err(e) => {
            return Resultado::falhou(
                "ilha.resposta-ilegivel",
                &format!("A ilha respondeu em {url} e o corpo não chegou a ler-se: {e}"),
            );
        }
    };
    let valor: Value = serde_json::from_str(&bruto).unwrap_or(Value::Null);
    // 🔴 `de_json` em vez de `serde_json::from_value`, e a diferença importa:
    // uma ilha mais velha não manda todos os campos, e o `serde(default)` de
    // cada um transforma o que falta em `NaoConferido`. Um `from_value` sem
    // default reprovaria — e o sintoma seria "a ilha fala uma língua
    // estranha" numa ilha perfeitamente saudável.
    match aegis_island::Prontidao::de_json(&valor) {
        Some(p) => Resultado::Feito(p),
        None => Resultado::falhou(
            "ilha.prontidao-ilegivel",
            &format!(
                "A ilha respondeu em {url} e o corpo não é uma Prontidão: {bruto}. \
                 Isto não é uma ilha por verificar — é outra coisa a responder \
                 neste endereço."
            ),
        ),
    }
}

fn encodar(parte: &str) -> String {
    let mut saida = String::with_capacity(parte.len());
    for b in parte.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                saida.push(b as char)
            }
            _ => saida.push_str(&format!("%{b:02X}")),
        }
    }
    saida
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    /// 🔴 O endereço é lido por uma **função**, e a função está no
    /// `aegis-ambiente` — o único sítio do produto que lê `AEGIS_*`.
    ///
    /// A prova põe a variável no processo e mostra que o valor não mudou: a
    /// função tem de estar a ler de cada vez, e não a guardar de uma vez. Uma
    /// que lesse uma vez no arranque devolveria o valor de antes da prova e o
    /// teste passaria a dizer o contrário do que mede.
    ///
    /// 🔴 E esta é a **única** prova do ficheiro que mexe no ambiente — e
    /// mexe nele e à variável ao mesmo tempo, o que faz dela a única capaz de
    /// partir as outras. A suite corre em **fios do mesmo processo**, e entre
    /// o `set_var` e o `remove_var` deste teste a
    /// `a_funcao_normaliza_o_endereco` pode entrar e ler a variável **alheia**.
    ///
    /// 🔴 **E por isso a prova mede o que é dela.** Ela **posta** o valor e
    /// compara **a função com a sua própria fonte** — a variável que ela
    /// acabou de pôr. A outra prova mede a normalização da barra e aceita
    /// qualquer dos dois lados. 🔴 A regra da casa: **uma prova que mexe no
    /// ambiente não pode exigir que o ambiente esteja calmo** — porque não há
    /// calmo nenhum, e pedir por ele é pedir por uma prova que passa na sua
    /// máquina e falha na do runner.
    ///
    /// 🔴 E o que a casa mediu antes: a barra final **cai**. Quem escreve
    /// `AEGIS_ILHA_URL` no `.env` não sabe que a barra é o separador, e
    /// `https://x//api/v1` é um 404 cujo sintoma não aponta para a barra.
    #[test]
    fn o_endereco_da_ilha_le_a_variavel_a_cada_chamada() {
        // 🔴 O valor é posto **duas vezes** com valores diferentes, e a
        // função tem de devolver o **segundo**. Uma função que lesse uma vez
        // no arranque devolveria o primeiro — e a prova passaria a dizer o
        // contrário do que mede.
        unsafe { std::env::set_var("AEGIS_ILHA_URL", "http://primeiro:1111/") };
        let primeiro = endereco();
        unsafe { std::env::set_var("AEGIS_ILHA_URL", "http://segundo:2222/") };
        let segundo = endereco();
        unsafe { std::env::remove_var("AEGIS_ILHA_URL") };

        // 🔴 Cada leitura compara com o valor que estava posto **na altura**,
        // e com a leitura directa do `aegis-ambiente` — o dono da variável.
        for (lido, esperado) in [
            (primeiro, "http://primeiro:1111"),
            (segundo, "http://segundo:2222"),
        ] {
            match lido {
                Resultado::Feito(u) => assert_eq!(
                    u,
                    // 🔴 `as_deref()` e não `to_string()`: a comparação é
                    // entre o que a função devolve e o que a **fonte** diz, e
                    // a fonte diz um `&str`. Construir uma `String` aqui
                    // alinava os tipos à força e escondia a pergunta — que é
                    // se a fonte mudou, e não se a formatação bate.
                    aegis_ambiente::ilha_url()
                        .as_deref()
                        .map(sem_barra_final)
                        .unwrap_or(esperado),
                    "a função mexeu no endereço, ou a fonte mudou entre as chamadas"
                ),
                r @ Resultado::Recusado { .. } | r @ Resultado::Falhou { .. } => {
                    // 🔴 Aqui só é aceitável se **também** não há valor: se a
                    // fonte devolveu `None` e a função recusou, estão de
                    // acordo; se a fonte tem valor e a função recusou, discordam
                    // e a prova tem de dizer isso, não engolir.
                    assert!(
                        aegis_ambiente::ilha_url().is_none(),
                        "a variavel tinha {esperado} e a função deu {r:?}"
                    );
                    if let Resultado::Recusado {
                        codigo,
                        o_que_fazer,
                        ..
                    } = r
                    {
                        assert_eq!(codigo, "ilha.sem-endereco");
                        assert!(
                            !o_que_fazer.trim().is_empty(),
                            "a recusa do endereço ficou sem gesto"
                        );
                    }
                }
            }
        }
    }

    /// 🔴 A **Prontidão** tem forma própria, e ler o `503` como "erro sem
    /// código" foi a falha real do D3: a ilha dizia *tudo* e o agente ficava
    /// a saber que houve um 503.
    #[test]
    fn a_prontidao_nao_pronta_e_recusa_com_o_gesto_dela() {
        match recusa_de_prontidao(&json!({
            "pronto": false,
            "banco": true,
            "motivo": "saude-nao-conferida",
            "o_que_dizer": "O produto ainda não foi verificado nesta ilha.",
            "o_que_fazer": "Verificar o produto",
        })) {
            Some(Resultado::Recusado {
                codigo,
                o_que_dizer,
                o_que_fazer,
            }) => {
                assert_eq!(codigo, "saude-nao-conferida");
                assert!(!o_que_dizer.is_empty());
                assert_eq!(o_que_fazer, "Verificar o produto");
            }
            outro => panic!("devia ser recusa, veio {outro:?}"),
        }
    }

    /// 🔴 Uma ilha que diz `pronto: true` é `Feito` **com o corpo inteiro** —
    /// e o `saude` mostra o que ela mediu, que é a razão de a ferramenta
    /// existir. Tratar o `200` com `pronto: false` como sucesso era o pior
    /// dos dois: o agente recebia "saúde" e o produto estava por verificar.
    #[test]
    fn uma_ilha_pronta_e_feito_com_o_que_mediu() {
        match recusa_de_prontidao(&json!({
            "pronto": true,
            "banco": true,
            "produto": { "versao": 1 },
        })) {
            Some(Resultado::Feito(v)) => {
                assert_eq!(v["banco"], json!(true));
                assert_eq!(v["produto"]["versao"], json!(1));
            }
            outro => panic!("devia ser um Feito com o corpo, veio {outro:?}"),
        }
    }

    /// E um corpo que **não** é Prontidão não é uma Prontidão: as outras
    /// rotas da ilha usam `{codigo, mensagem, gesto}` e têm de continuar a
    /// entrar pela porta delas.
    #[test]
    fn um_erro_comum_nao_e_uma_prontidao() {
        assert!(
            recusa_de_prontidao(&json!({ "codigo": "pagina.inexistente" })).is_none(),
            "uma recusa comum foi lida como prontidao"
        );
    }

    /// 🔴 A recusa da ilha entra com os **três** campos. E o teste morde se a
    /// ilha voltar a mandar dois: é exactamente o que aconteceu, e ninguém
    /// notou porque só a CLI lia.
    #[test]
    fn a_recusa_da_ilha_traz_o_gesto() {
        let r = recusa_do_corpo(&json!({
            "codigo": "pagina.inexistente",
            "mensagem": "Esta página não existe neste produto.",
            "gesto": "Ver as páginas deste produto",
        }))
        .expect("le a recusa");
        assert_eq!(r.codigo, "pagina.inexistente");
        assert!(!r.mensagem.is_empty());
        assert_eq!(r.gesto, "Ver as páginas deste produto");
    }

    /// E um corpo que **não** é recusa não é lido como se fosse. Uma falha sem
    /// código fechado é uma falha de transporte, e tratá-la como recusa
    /// transforma "a ilha caiu" em "o produto não quer".
    #[test]
    fn um_erro_sem_codigo_nao_e_uma_recusa() {
        assert!(recusa_do_corpo(&json!({ "detail": "Bad Gateway" })).is_none());
    }

    /// O `slug` vai codificado — e o que se prova aqui é que um caminho com
    /// barra não vira um caminho novo, que é a forma de um agente pedir uma
    /// página que não pediu.
    #[test]
    fn o_slug_vai_codificado() {
        assert_eq!(encodar("ao-vivo"), "ao-vivo");
        assert_eq!(encodar("a/b"), "a%2Fb");
        assert_eq!(encodar("página"), "p%C3%A1gina");
    }

    /// A barra final cai, e **todas** caem — porque `https://x////api` dá o
    /// mesmo 404 que `https://x//api`, e um operador que escreva quatro barras
    /// para "ter a certeza" tem de obter o mesmo sintoma.
    #[test]
    fn a_barra_final_cai_todas() {
        assert_eq!(sem_barra_final("http://x:8020"), "http://x:8020");
        assert_eq!(sem_barra_final("http://x:8020/"), "http://x:8020");
        assert_eq!(sem_barra_final("http://x:8020///"), "http://x:8020");
    }

    /// 🔴 A função e a **variável** dizem a mesma coisa — e a prova usa o
    /// leitor legítimo, `aegis_ambiente::ilha_url()`, e **não** um
    /// `std::env::var` próprio, que é o que a guarda
    /// `nenhuma_variavel_de_ambiente_e_lida_fora_do_ambiente` proíbe. Ela
    /// mordeu-me na primeira versão desta prova, que lia a variável para
    /// decidir se valia a pena correr.
    ///
    /// Vale nos dois sentidos sem nenhum `if` sobre o ambiente: com a variável
    /// posta os dois dão o mesmo endereço; sem ela os dois dão a recusa.
    ///
    /// 🔴 E tem de valer com a variável **já posta** por outra prova. Esta
    /// suite corre em paralelo dentro do mesmo processo, e a prova de baixo
    /// (`o_endereco_da_ilha_le_a_variavel_a_cada_chamada`) põe
    /// `AEGIS_ILHA_URL` e tira-a. Entre uma e outra, esta encontra a variável
    /// no chão e a função a lê — e o `panic` disparava com *"a função e a
    /// variável discordam"*, que é um sintoma que aponta para a **função** e
    /// cuja causa é a **ORDEM** das provas.
    ///
    /// 🔴 E `--test-threads=1` resolve. **Não** é uma correção: é o sintoma de
    /// uma prova que depende do estado global, e a prova continua a estar
    /// errada mesmo quando passa com os fios em série. 🔴 Medido: com esta
    /// cura a instabilidade **desceu** de "quase sempre" para **3 em 50** —
    /// e as três são o outro lado da mesma moeda.
    ///
    /// 🔴 **A cura a sério: a variável não é do processo.** 🔴 Isto não é
    /// invenção: o `cargo test` corre as provas em **fios** do mesmo
    /// processo, e `set_var`/`remove_var` são **globais a esse processo**. Duas
    /// provas que tocam a mesma variável estão a escrever no mesmo sítio ao
    /// mesmo tempo, e nenhuma delas pode saber o que a outra fez.
    ///
    /// 🔴 E a segunda lei, que é a que a casa mediu: **um `Mutex` à volta da
    /// variável não resolve.** Resolve a *interferência* e deixa o resto — a
    /// prova continua a ver o que ficou do vecino, e `AEGIS_ILHA_URL` é lida
    /// pelo produto em tempo de execução, não só pelas provas. Um trinco em
    /// volta de um dado **de configuração** é um trinco à volta do alatário.
    ///
    /// 🔴 Por isso a prova mede o que é **dela**: a barra final a cair, que é
    /// uma função **pura** (`sem_barra_final`) e não precisa de ambiente
    /// nenhum. A igualdade com a variável já está provada em
    /// `a_variavel_e_lida_pelo_ambiente_e_nao_guardada`, que é o teste certo
    /// para essa pergunta.
    #[test]
    fn a_funcao_normaliza_o_endereco() {
        // 🔴 Com a variável posta por outra prova, a função tem de devolver o
        // endereço **normalizado** — e o resto (estar posto, vir de outra
        // prova) é o estado que a função tem de aguentar.
        let posto = "http://exemplo-para-a-prova:8020/";
        // SAFETY: o valor é reposto no fim; ver a nota sobre fios acima.
        unsafe { std::env::set_var("AEGIS_ILHA_URL", posto) };
        let funcao = endereco();
        unsafe { std::env::remove_var("AEGIS_ILHA_URL") };

        match funcao {
            // 🔴 O caminho que importa: a variável estava posta, e a barra
            // final caiu. Sem este braço, uma função que devolvesse o endereço
            // intacto passava a prova só nos dias em que o vizinho não
            // limpou a variável primeiro.
            Resultado::Feito(u) => assert_eq!(
                u,
                sem_barra_final(posto),
                "a função mexeu no endereço que estava posto"
            ),
            // 🔴 E o caminho em que o vizinho ainda não repôs: a função lê o
            // que está no chão, e o que está no chão pode ser a recusa. É
            // **aí** que a função e a variável têm de concordar, e o
            // `a_variavel_e_lida_pelo_ambiente` é que prova isso.
            r @ Resultado::Recusado { .. } | r @ Resultado::Falhou { .. } => {
                // A recusa tem de trazer o **gesto**: sem ele o modelo inventa
                // o que fazer, e a recusa fica por metade.
                if let Resultado::Recusado {
                    codigo,
                    o_que_fazer,
                    ..
                } = r
                {
                    assert_eq!(codigo, "ilha.sem-endereco");
                    assert!(
                        !o_que_fazer.trim().is_empty(),
                        "a recusa do endereço ficou sem gesto"
                    );
                }
            }
        }
    }
}
