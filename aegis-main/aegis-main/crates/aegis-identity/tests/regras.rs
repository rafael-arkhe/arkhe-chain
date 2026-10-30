//! As duas regras de identidade.
//!
//! 🔴 Ambas vivem hoje em **quatro lugares e três linguagens**, e o
//! `CLAUDE.md` chamava a uma delas de "fonte canónica" sem nada ligar as
//! outras. Cada teste aqui existe para tornar a implementação única
//! *verificável* — e não para documentar a regra.

use aegis_identity::escopo::ErroEscopo;
use aegis_identity::pseudonimo;
use aegis_identity::{Contexto, Escopo, Papel};

// ===========================================================================
// O PSEUDÓNIMO
// ===========================================================================

#[test]
fn gera_na_forma_certa() {
    let ctx = Contexto::novo("Condominio do Porto", "portaria-acesso");
    for semente in 0..400u64 {
        let p = pseudonimo::gerar(semente, &ctx)
            .unwrap_or_else(|e| panic!("semente {semente} falhou: {e:?}"));
        let partes: Vec<&str> = p.valor.split('-').collect();
        assert_eq!(partes.len(), 3, "{:?} não tem 3 partes", p.valor);
        assert_eq!(partes[2].len(), 4, "{:?} não tem hex4", p.valor);
        assert!(
            partes[2].chars().all(|c| c.is_ascii_hexdigit()),
            "{:?} não tem hex4",
            p.valor
        );
    }
}

#[test]
fn o_mesmo_valor_e_o_nome_e_o_dominio() {
    // 🔴 A invariante. Um pseudónimo com nome próprio e domínio próprio são
    // DOIS identificadores, e dois identificadores divergem — foi assim que a
    // ilha ficou com o nome `porto` e o domínio `sereno-falcao-a1b2`, e o
    // túnel não batia com o certificado.
    let ctx = Contexto::novo("Qualquer", "portaria-acesso");
    let p = pseudonimo::gerar(7, &ctx).unwrap();
    assert_eq!(p.dominio(), format!("{}.{}", p.nome(), pseudonimo::DOMINIO));
    // O nome é o **PREFIXO** do domínio. A barra de valor (`|`) partiu o
    // pseudónimo no meio e produziu `sereno|falcao-a1b2` com o domínio
    // `falcao-a1b2.safecore.space` — o nome e o domínio deixaram de ser a
    // mesma coisa, que é o que esta invariante existe para impedir.
    assert!(p.dominio().starts_with(&format!("{}.", p.nome())));
}

#[test]
fn a_generacao_e_deterministica() {
    // Sem isto, a regra não tem prova possível: uma geração que não se
    // repete é um teste que não se escreve.
    let ctx = Contexto::novo("Qualquer", "portaria-acesso");
    let a = pseudonimo::gerar(42, &ctx).unwrap();
    let b = pseudonimo::gerar(42, &ctx).unwrap();
    assert_eq!(a, b);
}

#[test]
fn a_generacao_e_difusa() {
    // Duas sementes muito parecidas não podem dar o mesmo nome: colisão
    // Colisão é o defeito que o pseudónimo existe para evitar.
    let ctx = Contexto::novo("Qualquer", "portaria-acesso");
    let mut vistos = std::collections::BTreeSet::new();
    for semente in 0..200u64 {
        vistos.insert(pseudonimo::gerar(semente, &ctx).unwrap().valor);
    }
    assert!(
        vistos.len() > 150,
        "200 sementes deram só {} valores distintos — a geração está a colidir",
        vistos.len()
    );
}

#[test]
fn nao_repete_um_valor_ja_usado() {
    let primeiro = pseudonimo::gerar(3, &Contexto::novo("Qualquer", "x")).unwrap();
    let ctx = Contexto::novo("Qualquer", "x").com_usados([primeiro.valor.clone()]);
    let segundo = pseudonimo::gerar(3, &ctx).unwrap();
    assert_ne!(
        segundo.valor, primeiro.valor,
        "devolveu um valor que já estava em uso"
    );
}

#[test]
fn a_generacao_nunca_sai_a_dizer_quem_e_o_cliente() {
    // 🔴 O gerador tem de **voltar a tentar** quando sai com eco. É a
    // diferença entre "às vezes dá um nome bom" e "nunca dá um nome mau".
    let ctx = Contexto::novo("condominio do porto", "portaria");
    for semente in 0..300u64 {
        let p = pseudonimo::gerar(semente, &ctx).unwrap();
        assert!(
            !p.valor.contains("condominio") && !p.valor.contains("porto"),
            "o gerador produziu {:?}, que diz o nome do cliente",
            p.valor
        );
    }
}

// -- A FORMA ---------------------------------------------------------------

#[test]
fn recusa_forma_errada() {
    // Todos estes seriam recusados por qualquer uma das três camadas
    // (separadores, número de partes, hex4), e cada um tem de ser recusado
    // pelo mesmo caminho.
    for mau in [
        "",
        "sereno",
        "sereno-falcao",
        "sereno-falcao-a1b2-extra",
        "sereno-falcao-a1",    // hex curto
        "sereno-falcao-a1b2c", // hex longo
        "sereno-falcao-zzzz",  // hex não é hex
        "Sereno-falcao-a1b2",  // maiúscula
        "sereno_falcao-a1b2",  // sublinhado
        "sereno--falcao-a1b2", // separador dobrado
        "-sereno-falcao-a1b2",
        "sereno-falcao-a1b2-",
        "sereno-falcao-",
        "1a-2b-c3d4", // números não são palavras
    ] {
        let e = pseudonimo::forma(mau)
            .err()
            .unwrap_or_else(|| panic!("{mau:?} tem de ser recusado"));
        assert_eq!(e.codigo(), "pseudonimo.forma", "{mau:?}");
    }
}

#[test]
fn aceita_a_forma_certa() {
    for bom in ["sereno-falcao-a1b2", "alerta-zenite-0000", "novo-rio-ffff"] {
        pseudonimo::forma(bom).unwrap_or_else(|e| panic!("{bom:?} tem de passar: {e:?}"));
    }
}

// -- O ECO -----------------------------------------------------------------

#[test]
fn recusa_valor_que_diz_o_cliente() {
    let ctx = Contexto::novo("Condominio do Porto", "portaria-acesso");
    // O nome do cliente aparece com e sem acento, com e sem separador — e
    // a regra tem de apanhar os quatro, que é o que a normalização existe
    // para fazer. Um `contains` simples passa por todos menos o primeiro.
    for ecoa in [
        "condominio-porto-abcd",
        "porto-quintana-abcd",
        "porto-ardosia-abcd",
    ] {
        let e = pseudonimo::validar(ecoa, &ctx)
            .err()
            .unwrap_or_else(|| panic!("{ecoa:?} tem de ser recusado por ecoar o cliente"));
        assert_eq!(e.codigo(), "pseudonimo.ecoa-cliente", "{ecoa:?}");
    }
}

#[test]
fn recusa_valor_que_diz_o_vertical() {
    let ctx = Contexto::novo("Qualquer", "Contagem de Sacos");
    for ecoa in ["sereno-sacos-abcd", "contagem-falcao-abcd"] {
        let e = pseudonimo::validar(ecoa, &ctx)
            .err()
            .unwrap_or_else(|| panic!("{ecoa:?} tem de ser recusado por ecoar o vertical"));
        assert_eq!(e.codigo(), "pseudonimo.ecoa-vertical", "{ecoa:?}");
    }
}

#[test]
fn acento_e_caixa_nao_sao_um_buraco() {
    // 🔴 A medição que deu a regra: `Condomínio do Porto` e
    // `condominio-do-porto` têm de ser o mesmo proibido. Sem normalização,
    // o acento é o buraco por onde o nome do cliente entra.
    let ctx = Contexto::novo("Condomínio Ítalo do Porto", "Hotelaria Áurea");
    for ecoa in ["condominio-italo-abcd", "porto-italo-abcd"] {
        let e = pseudonimo::validar(ecoa, &ctx)
            .err()
            .unwrap_or_else(|| panic!("{ecoa:?} tem de ser recusado"));
        assert_eq!(e.codigo(), "pseudonimo.ecoa-cliente", "{ecoa:?}");
    }

    // E o acento no PRÓPRIO pseudónimo é recusado pela forma, antes de a
    // checagem de eco ser sequer consultada. São duas recusas com dois
    // códigos, e o operador precisa de saber qual é qual: um diz "não pode
    // escrever assim", o outro diz "este nome diz o cliente".
    let e = pseudonimo::validar("condominio-ítalo-abcd", &ctx)
        .expect_err("acento no valor tem de ser recusado");
    assert_eq!(e.codigo(), "pseudonimo.forma");
}

#[test]
fn palavra_curta_nao_recusa_sem_motivo() {
    // 🔴 A recusa tem de ser específica. `LR4 Tecnologia` traz `lr4` e
    // `tecnologia`; as partes de duas letras (`do`, `da`, `de`) seriam
    // ruído — e `sereno-do-falcao` tem de passar, porque "do" não diz nada
    // sobre o cliente.
    let ctx = Contexto::novo("Hotel do Porto", "portaria");
    // `do` tem duas letras e não é motivo para recusar nada: se fosse, quase
    // todo pseudónimo ficava de fora e a regra vira ruído que se desliga.
    pseudonimo::validar("sereno-falcao-abcd", &ctx)
        .expect("uma partícula de 2 letras não pode ser motivo de recusa");
    // E o que é motivo continua a ser recusado.
    let e = pseudonimo::validar("porto-falcao-abcd", &ctx)
        .expect_err("a palavra inteira do cliente tem de continuar a ser recusada");
    assert_eq!(e.codigo(), "pseudonimo.ecoa-cliente");
}

#[test]
fn sem_contexto_so_e_conferida_a_forma() {
    // É o que a Bridge faz quando não tem o cliente à mão: conferem a forma
    // e param. É MENOS do que a regra inteira — e tem de ser dito, porque
    // uma validação parcial que se apresenta como completa é o defeito que
    // a casa já pagou com "recusado com a mensagem errada".
    let vazio = Contexto::default();
    pseudonimo::validar("condominio-porto-abcd", &vazio)
        .expect("sem contexto, o valor passa na forma");
}

// ===========================================================================
// PAPÉIS E ESCOPO — as três invariantes
// ===========================================================================

#[test]
fn invariante_1_papel_com_ambito_e_sem_vinculo_e_recusado() {
    // 🔴 A primeira invariante. Um papel com âmbito e sem vínculo é
    // RECUSA na construção — e não "vê tudo" nem "não vê nada". As duas são
    // silenciosas; a recusa tem codigo.
    for papel in [Papel::OemAdmin, Papel::Campo, Papel::Leitor] {
        let e = Escopo::novo(papel, "   ").expect_err("{papel:?} sem vínculo tem de ser recusado");
        assert!(matches!(e, ErroEscopo::VinculoVazio { .. }), "{e:?}");
    }
}

#[test]
fn o_fornecedor_nao_exige_vinculo() {
    // Exigir vínculo ao fornecedor seria transformá-lo num parceiro sem
    // querer — e a casa tem uma regra a dizer que linha sem dono é do
    // fornecedor.
    let e = Escopo::novo(Papel::VendorAdmin, "").expect("o fornecedor não tem parceiro");
    assert!(e.eh_fornecedor());
}

#[test]
fn invariante_2_linha_sem_dono_e_do_fornecedor_e_de_mais_ninguem() {
    // 🔴 A segunda invariante. `""` é do fornecedor. Um login de parceiro
    // **não** o alcança: sem esta linha, "sem dono" significava "de todos",
    // e um parceiro novo herdava tudo o que ninguém tinha adotado.
    let parceiro = Escopo::novo(Papel::OemAdmin, "lr4").unwrap();
    assert!(
        !parceiro.pode_ler(""),
        "parceiro não pode ler recurso sem dono"
    );

    let fornecedor = Escopo::novo(Papel::VendorAdmin, "").unwrap();
    assert!(fornecedor.pode_ler(""), "o fornecedor lê recurso sem dono");
}

#[test]
fn invariante_3_papel_desconhecido_cai_no_mais_fraco_e_diz() {
    // 🔴 A terceira invariante. Cai no mais fraco **e declara que caiu** —
    // silenciosamente degradar um login é a forma mais rápida de um
    // operador ficar sem perceber porquê.
    let e = Escopo::por_nome("admin", "lr4").unwrap();
    assert_eq!(e.papel(), Papel::Leitor);
    assert_eq!(
        e.caiu_de_desconhecido(),
        Some("admin"),
        "a queda tem de ser declarada — sem isto o operador vê 403 sem saber porquê"
    );

    let valido = Escopo::por_nome("oem-admin", "lr4").unwrap();
    assert_eq!(valido.papel(), Papel::OemAdmin);
    assert_eq!(valido.caiu_de_desconhecido(), None);
}

#[test]
fn o_vendedor_alcanca_a_frota_e_o_parceiro_nao() {
    let fornecedor = Escopo::novo(Papel::VendorAdmin, "").unwrap();
    let parceiro = Escopo::novo(Papel::OemAdmin, "lr4").unwrap();

    assert!(fornecedor.pode_ler("lr4"));
    assert!(fornecedor.pode_ler("outro-parceiro"));
    assert!(fornecedor.pode_ler(""));

    assert!(parceiro.pode_ler("lr4"));
    assert!(!parceiro.pode_ler("outro-parceiro"));
}

#[test]
fn o_leitor_ele_nao_escreve_com_erro_proprio() {
    // 🔴 "Leitor não escreve" e "é de outro parceiro" são respostas
    // diferentes e pedem gestos diferentes. A primeira versão devolvia a
    // segunda, e o operador ia pedir permissão em vez de pedir um papel.
    let leitor = Escopo::novo(Papel::Leitor, "lr4").unwrap();
    let e = leitor.pode_escrever("lr4").unwrap_err();
    assert!(matches!(e, ErroEscopo::SemEscrita { .. }), "{e:?}");

    let oem = Escopo::novo(Papel::OemAdmin, "lr4").unwrap();
    let e = oem.pode_escrever("outro").unwrap_err();
    assert!(matches!(e, ErroEscopo::Alheio { .. }), "{e:?}");
}

#[test]
fn filtrar_antes_e_nao_depois() {
    // Numa consulta de lista, filtrar depois de paginar devolve uma página
    // com buracos — e o operador lê isso como "o sistema perdeu registos".
    let oem = Escopo::novo(Papel::OemAdmin, "lr4").unwrap();
    let recursos: Vec<(&str, String)> = vec![
        ("ilha-1", "lr4".into()),
        ("ilha-2", "outro".into()),
        ("ilha-3", "".into()),
        ("ilha-4", "lr4".into()),
    ];
    let visiveis = oem.filtrar(&recursos);
    assert_eq!(
        visiveis,
        ["ilha-1".to_string(), "ilha-4".to_string()]
            .into_iter()
            .collect::<std::collections::BTreeSet<_>>()
    );
}

#[test]
fn os_quatro_papeis_tem_nomes_estaveis() {
    // O nome no ficheiro e no cookie é contrato. Mudá-lo desliga logins sem
    // o sintoma aparecer em lado nenhum.
    assert_eq!(Papel::VendorAdmin.nome(), "vendor-admin");
    assert_eq!(Papel::OemAdmin.nome(), "oem-admin");
    assert_eq!(Papel::Campo.nome(), "campo");
    assert_eq!(Papel::Leitor.nome(), "leitor");
    // `admin` é o nome legado, e tem de cair no mais fraco — a migração que o
    // `frota-app` já fez no banco tem de ser a mesma em todo o lado.
    assert_eq!(Papel::desconhecido("admin").0, Papel::Leitor);
    assert!(
        Papel::desconhecido("admin").1,
        "o nome legado tem de contar como desconhecido"
    );
}

// -- A regra deste crate ----------------------------------------------------

#[test]
fn este_crate_nao_conhece_o_slug_de_vertical_nenhum() {
    // 🔴 A lista de palavras é DADO, e o dado não pode ser o nome de um
    // vertical real: se o catálogo trouxesse "portaria", qualquer ilha de
    // portaria seria recusada por dizer o nome do próprio produto.
    let fonte = include_str!("../src/pseudonimo.rs").to_string() + include_str!("../src/escopo.rs");

    for slug in ["hotelaria", "contagem-sacos", "portaria-acesso", "safetag"] {
        assert!(
            !fonte.contains(slug),
            "aegis-identity não pode conhecer o slug {slug:?}"
        );
    }
}

#[test]
fn a_semente_zero_gera() {
    // 🔴 Achado por esta prova. O xorshift tem ponto fixo em zero: com a
    // semente `0` o estado nunca saía de `0`, o gerador devolvia sempre o
    // mesmo par, e — se esse par fosse recusado por eco — repetia 1480 vezes
    // e acabava em `Repetido`. Semente `0` é a entrada de quem não sorteia
    // nada, e é uma entrada legítima.
    let ctx = Contexto::novo("Condominio do Porto", "portaria-acesso");
    let p =
        pseudonimo::gerar(0, &ctx).unwrap_or_else(|e| panic!("a semente 0 tem de gerar: {e:?}"));
    assert_eq!(p.valor.split('-').count(), 3);

    // E tem de ser diferente das sementes vizinhas, que é a razão de
    // espalhar.
    let outro = pseudonimo::gerar(1, &ctx).unwrap();
    assert_ne!(p.valor, outro.valor, "as sementes 0 e 1 deram o mesmo nome");
}
