//! A prova do watchdog: **a tabela**.
//!
//! 🔴 A decisão do watchdog é pura, e a prova é uma tabela. A tabela existe
//! porque o C# a provou **no cliente** — que é a forma mais cara de provar
//! uma decisão, e a que custou a ponte mais vezes.
//!
//! ## O que a tabela tem de cobrir
//!
//! **Todas** as combinações dos factos que a decisão consulta. A decisão tem
//! cinco saídas e consulta quatro campos; um teste por saída provaria que as
//! saídas existem, e **não** que as outras combinações não caem onde não
//! devem — que é exactamente o defeito que o C# tinha (uma fonte morta
//! contada como um servidor zumbi).
//!
//! ## E porque a ordem é provada, e não só o resultado
//!
//! A regra *"a fonte fora do ar vem **antes** de contar falha"* não se prova
//! por um resultado — prova-se por uma **par**: a mesma ronda com
//! `fonte_fora: 1` e com `fonte_fora: 0` tem de dar decisões **diferentes**.
//! Se as duas derem a mesma, a ordem trocou-se e ninguém viu.

use aegis_ponte::{
    DecisaoDoWatchdog as Decisao, RondaDoWatchdog as Ronda, decide_watchdog as decidir,
    frase_do_watchdog as frase, ordenar_o_reparo,
};

/// Todas as combinações dos dois campos binários, com os dois campos
/// contadores nos seus valores extremos e um valor **a meio** — porque um
/// limiar que só é testado no limite é um limiar que pode estar do lado
/// errado e a tabela não diz.
fn todas_as_combinacoes() -> Vec<(&'static str, Ronda)> {
    let mut saida = Vec::new();
    for a_servir in [0usize, 1, 2] {
        for fonte_fora in [0usize, 1] {
            for ja_curou in [false, true] {
                for falhas in [0u32, 1, 2, 3, 9] {
                    saida.push((
                        "combinacao",
                        Ronda {
                            a_servir,
                            total: 4,
                            fonte_fora,
                            ja_curou,
                            falhas,
                        },
                    ));
                }
            }
        }
    }
    saida
}

#[test]
fn a_decisao_e_determinada() {
    // A mesma ronda, duas vezes, dá a mesma decisão. Uma decisão que depende
    // do que aconteceu antes — e a ronda é o que happened-before do watchdog —
    // é uma decisão que não se pode provar.
    for (_, r) in todas_as_combinacoes() {
        assert_eq!(decidir(r), decidir(r), "a mesma ronda deu duas decisões");
    }
}

#[test]
fn servir_acaba_o_episodio_e_nao_parte_nada() {
    // Serve e ainda não curou: nada a fazer.
    assert_eq!(
        decidir(Ronda {
            a_servir: 1,
            total: 4,
            fonte_fora: 0,
            ja_curou: false,
            falhas: 9,
        }),
        Decisao::NaoFazNada,
        "a servir, e mesmo assim tentou"
    );

    // Serve **depois** de ter curado: o episódio acabou, e a cura volta a
    // valer. 🔴 Sem isto, uma ponte que se recupera fica com o contador de
    // curas alto e nunca mais cura — que é a ponte morta do lado oposto.
    assert_eq!(
        decidir(Ronda {
            a_servir: 1,
            total: 4,
            fonte_fora: 0,
            ja_curou: true,
            falhas: 9,
        }),
        Decisao::EncerrarEpisodio
    );
}

#[test]
fn a_fonte_fora_do_ar_nunca_mata_o_servidor() {
    // 🔴 A confusão que custou a ponte: um `404` de câmara desligada é
    // idêntico ao de um servidor zumbi, e sem esta distinção o watchdog matava
    // o `go2rtc` a cada 6 minutos, para sempre.
    let com_fonte = decidir(Ronda {
        a_servir: 0,
        total: 4,
        fonte_fora: 1,
        ja_curou: false,
        // Já passou do limiar: se a fonte fosse contada, isto seria um
        // reparo. É o par que prova a ordem.
        falhas: Ronda::LIMIAR_DE_ZUMBI,
    });
    assert_eq!(
        com_fonte,
        Decisao::FonteFora { fora: 1, total: 4 },
        "uma fonte fora do ar levou a matar o servidor"
    );
    assert!(
        !matches!(com_fonte, Decisao::Reparar { .. }),
        "a câmara desligada virou servidor zumbi — o defeito que o C# tinha"
    );
}

#[test]
fn a_ordem_da_decisao_e_provada_por_um_par() {
    // A **mesma** ronda, com e sem fonte fora. Se as duas derem a mesma
    // decisão, a fonte fora não entrou antes de contar — e a ordem trocou-se
    // sem que nenhum teste visse.
    let base = Ronda {
        a_servir: 0,
        total: 4,
        fonte_fora: 0,
        ja_curou: false,
        falhas: Ronda::LIMIAR_DE_ZUMBI,
    };
    let com_fonte = decidir(Ronda {
        fonte_fora: 1,
        ..base
    });
    let sem_fonte = decidir(Ronda {
        fonte_fora: 0,
        ..base
    });
    assert_ne!(
        com_fonte, sem_fonte,
        "a fonte fora do ar mudou o resultado: a ordem está depois de contar"
    );
    assert!(matches!(sem_fonte, Decisao::Reparar { .. }));
}

#[test]
fn o_limiar_de_zumbi_e_a_terceira_ronda() {
    // 🔴 Uma ronda é uma medição, e uma medição é uma hipótese — e o
    // `falhas` que entra é o que **já se viu**, não o que se está a ver. A
    // ronda que acabamos de medir conta uma a mais, e o que se decide é
    // sobre o número **depois** de contar.
    //
    // A tabela abaixo é a fronteira real: uma e duas falhas vistas **contam**,
    // três **reparam** — e o número que a decisão devolve é o *contado*, que
    // por isso cresce com as vistas e não fica colado ao limiar.
    //
    // 🔴 E o `>=` é o que garante que `falhas: 9` (uma noite inteira sem
    // serviço) **também** repara, em vez de ficar a contar para sempre. Um
    // `==` repara só no limiar exacto e passa ao lado dele em silêncio — que
    // é a mesma família de defeito do `ponte.dados` a devolver `1` em vez de
    // `3`: a decisão certa tomada no sítio errado.
    for (vistas, esperado) in [
        (0u32, Decisao::Contar { falhas: 1 }),
        (1, Decisao::Contar { falhas: 2 }),
        (
            2,
            Decisao::Reparar {
                falhas: Ronda::LIMIAR_DE_ZUMBI,
            },
        ),
        (3, Decisao::Reparar { falhas: 4 }),
        (9, Decisao::Reparar { falhas: 10 }),
    ] {
        assert_eq!(
            decidir(Ronda {
                a_servir: 0,
                total: 4,
                fonte_fora: 0,
                ja_curou: false,
                falhas: vistas,
            }),
            esperado,
            "com {vistas} falha(s) vistas a decisão muda"
        );
    }
}

#[test]
fn uma_cura_por_episodio() {
    // 🔴 A segunda confusão: depois de reiniciar e continuar sem servir,
    // reiniciar outra vez não conserta nada — a **fonte** é que está sem
    // sinal. Da segunda vez, avisa e **para**.
    for falhas in [0u32, 1, 2, 3, 9] {
        assert_eq!(
            decidir(Ronda {
                a_servir: 0,
                total: 4,
                fonte_fora: 0,
                ja_curou: true,
                falhas,
            }),
            Decisao::PararDeReparar { total: 4 },
            "com {falhas} falhas e já curado, voltou a decidir reparar"
        );
    }
}

#[test]
fn a_frase_diz_o_porque() {
    // 🔴 Um watchdog que avisa *"parei"* sem dizer *"a fonte é que está sem
    // sinal"* obriga o operador a adivinhar — e um operador a adivinhar
    // reinicia a máquina, que é o sintoma que o watchdog existe para evitar.
    let frases: Vec<(Decisao, &[&str])> = vec![
        (Decisao::NaoFazNada, &["a servir"]),
        (Decisao::EncerrarEpisodio, &["episódio acabou"]),
        (
            Decisao::FonteFora { fora: 1, total: 4 },
            &["FONTE", "não é o servidor", "Confira a câmara"],
        ),
        (
            Decisao::PararDeReparar { total: 4 },
            &["fonte é que está sem sinal"],
        ),
        (Decisao::Contar { falhas: 1 }, &["nenhuma câmara a servir"]),
        (Decisao::Reparar { falhas: 3 }, &["zumbi", "uma vez"]),
    ];
    for (d, esperado) in frases {
        let f = frase(&d);
        for e in esperado {
            assert!(f.contains(e), "a frase de {d:?} não diz `{e}`: {f}");
        }
        assert!(!f.trim().is_empty(), "{d:?} tem frase vazia");
    }
}

#[test]
fn o_marcador_vai_antes_de_tudo_o_que_pode_falhar() {
    // 🔴 A terceira confusão, e a mais cara: sem elevação, o `cameras.txt` em
    // `ProgramData` recusa escrita, a gravação levantava, e o processo morria
    // **depois** de matar o `go2rtc` e **antes** de o subir. A ponte ficava
    // morta e o *kill* repetia-se a cada 2 minutos, para sempre.
    let ordem = ordenar_o_reparo();
    let marcar = ordem
        .iter()
        .position(|p| p.contains("marcar que já curou"))
        .expect("a lista tem de marcar");
    let matar = ordem
        .iter()
        .position(|p| p.contains("matar o `go2rtc`"))
        .expect("a lista tem de matar");
    let gravar = ordem
        .iter()
        .position(|p| p.contains("gravar a configuração"))
        .expect("a lista tem de gravar a configuração");
    let subir = ordem
        .iter()
        .position(|p| p.contains("subir o `go2rtc`"))
        .expect("a lista tem de subir");

    assert!(
        marcar < matar,
        "o marcador tem de vir antes do kill: depois, uma falha na gravação deixa a máquina sem ponte"
    );
    // 🔴 E a configuração é **acessório**: falhar nela não pode impedir o
    // arranque. A lista diz que é, mas a ordem também tem de mostrar.
    assert!(
        matar < gravar,
        "a configuração é acessório e escreve-se depois do kill, não antes"
    );
    assert!(
        gravar < subir,
        "grava a configuração antes de o servidor existir"
    );
}
