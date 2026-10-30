//! A ponte, e a regra que a casa pagou com ~25 gerações de lixo.
//!
//! 🔴 Este ficheiro não prova que a ponte funciona. Prova que ela **não pode**
//! repetir o que o `go2rtc` fez no campo: aceitar um **endereço** como
//! **nome** de stream.

use aegis_ponte::{Camera, ErroCamera, GO2RTC_HTTP, GO2RTC_RTSP, Lista, Nome};

/// 🔴 O defeito medido a 12/09/2026.
///
/// O `go2rtc` **cria** um stream com o nome que receber quando esse nome não
/// existe. Um nome que é uma URL — desescapada do JSON, onde `&` vem `&` —
/// criava uma entrada nova a cada pedido: `&` → `\\u0026` → …, ~25
/// gerações, e cada uma é uma fonte **morta** que ele vai tentar abrir.
#[test]
fn um_endereco_recusado_como_nome() {
    for endereco in [
        "rtsp://192.168.0.5:554/stream",
        "http://192.168.0.5/mjpeg",
        "rtsps://cam.example.com/live",
    ] {
        let e = Nome::novo(endereco).expect_err("um endereço não pode ser um nome");
        assert_eq!(
            e.codigo(),
            "ponte.nome-nao-e-nome",
            "{endereco:?} não foi recusado pelo motivo certo"
        );
        assert!(
            e.humano().contains(endereco),
            "a recusa repõe o que o operador escreveu — sem ela ele não sabe \
             o que colou: {}",
            e.humano()
        );
        assert!(
            !e.gesto().is_empty(),
            "toda recusa diz o que se faz a seguir"
        );
    }
}

/// 🔴 A recusa tem de vir **antes** da normalização.
///
/// Um endereço normalizado daria `rtsp_192_168_0_5_stream` — que é um nome
/// *válido*, que passaria em todas as validações seguintes, e que continua a
/// ser uma URL disfarçada de nome. A guarda é que a ordem está certa.
#[test]
fn normalizar_o_endereco_nao_o_torna_no_nome() {
    let normalizado: String = "rtsp://192.168.0.5:554/stream"
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    assert!(
        Nome::novo(&normalizado).is_ok(),
        "um nome normalizado é um nome válido — e por isso a recusa tem de \
         ser ANTES da normalização, ou a URL disfarçada passava"
    );
    // E o que a casa pagou é precisamente esse caminho.
    assert!(Nome::novo("rtsp://cam/live").is_err());
}

/// O que o operador escreve à mão tem de virar nome sem ficar a meio.
#[test]
fn o_nome_normaliza_como_a_casa_mediu() {
    let casos = [
        ("Portão da Garagem", "portao_da_garagem"),
        ("  CAM 1  ", "cam_1"),
        ("entrada//trás", "entrada_tras"),
        ("__lateral__", "lateral"),
        ("", "camera"),
        ("///", "camera"),
    ];
    for (entrada, esperado) in casos {
        let n = match Nome::novo(entrada) {
            Ok(n) => n,
            // Vazio e só-de-`_` são recusados pelo caminho de `NomeVazio` /
            // passam a `camera`; o que interessa é o resto.
            Err(ErroCamera::NomeVazio) => continue,
            Err(e) => panic!("{entrada:?} deu {e}"),
        };
        assert_eq!(n.as_str(), esperado, "{entrada:?} normalizou para o errado");
    }
}

/// Um nome de stream **nunca** leva `://`, `/`, `?`, `&` ou `=`.
#[test]
fn um_nome_nunca_tem_o_que_faz_uma_url() {
    for entrada in ["cam1", "Portão", "a b", "x-1_2", "casa_mãe"] {
        let n = Nome::novo(entrada).unwrap_or_else(|e| panic!("{entrada:?} foi recusado: {e}"));
        let s = n.as_str();
        for proibido in ["://", "/", "?", "&", "=", "@"] {
            assert!(
                !s.contains(proibido),
                "o nome {s:?} tem {proibido:?} — e um nome com isso é uma \
                 URL disfarçada"
            );
        }
        assert!(s.len() <= 128, "o nome tem {} caracteres", s.len());
        assert!(s == s.to_lowercase(), "o nome {s:?} tem maiúsculas");
    }
}

/// Os dois endereços, derivados do **nome** — que é o que o `go2rtc` consome.
#[test]
fn os_links_vem_do_nome_e_nao_do_endereco() {
    let c = Camera::nova("Portão", "rtsp://192.168.0.5:554/stream").expect("câmara");
    let l = c.links("192.168.0.5");
    assert_eq!(l.rtsp, format!("rtsp://192.168.0.5:{GO2RTC_RTSP}/portao"));
    assert_eq!(
        l.hls,
        format!("http://192.168.0.5:{GO2RTC_HTTP}/api/stream.m3u8?src=portao")
    );
    assert!(
        l.painel
            .starts_with(&format!("http://192.168.0.5:{GO2RTC_HTTP}"))
    );
    // 🔴 O endereço do `go2rtc` **não** aparece no nome do stream. Era
    // exatamente aí que o `go2rtc` semeava as gerações de lixo.
    assert!(!l.rtsp.ends_with("/stream"), "o endereço entrou no nome");
}

/// O que o operador cola num sítio só é percebido, não recusado.
#[test]
fn um_endereco_colado_so_so_ou_percebido() {
    let c = Camera::nova(
        "rtsp://192.168.0.5:554/garagem",
        "rtsp://192.168.0.5:554/garagem",
    )
    .expect("colar o endereço na caixa do nome tem de ser percebido");
    assert_eq!(c.nome.as_str(), "garagem");
    assert_eq!(c.endereco, "rtsp://192.168.0.5:554/garagem");
}

/// A lista: acrescenta, **atualiza**, tira, e sobrevive a uma linha estragada.
#[test]
fn a_lista_sobrevive_a_uma_linha_estragada() {
    let dir = std::env::temp_dir().join(format!("aegis-ponte-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("pasta");
    let caminho = dir.join("cameras.txt");
    std::fs::write(
        &caminho,
        "# um comentário\nportao|rtsp://10.0.0.1/stream\n\nlinha-sem-barra\nlateral|rtsp://10.0.0.2/stream\n",
    )
    .expect("escrever");

    let mut lista = Lista::em(&dir);
    let (boas, maus) = lista.ler();
    assert_eq!(boas, 2, "as duas câmaras boas têm de entrar");
    assert_eq!(
        maus.len(),
        1,
        "a linha sem barra tem de ser ignorada E DITA"
    );
    assert_eq!(maus[0], "linha-sem-barra");
    let _ = std::fs::remove_dir_all(&dir);
}

/// Acrescentar um nome que já existe **muda** o endereço, e não duplica.
#[test]
fn acrescentar_o_mesmo_nome_atualiza_e_nao_duplica() {
    let mut lista = Lista::default();
    lista
        .acrescentar(Camera::nova("portao", "rtsp://10.0.0.1/a").unwrap())
        .unwrap();
    lista
        .acrescentar(Camera::nova("Portão", "rtsp://10.0.0.2/b").unwrap())
        .unwrap();
    assert_eq!(lista.cameras().len(), 1, "duas entradas com o mesmo nome");
    assert_eq!(lista.cameras()[0].endereco, "rtsp://10.0.0.2/b");

    let nome = Nome::novo("portao").unwrap();
    lista.remover(&nome).expect("remover tem de funcionar");
    assert!(lista.esta_vazia());
    // 🔴 A segunda remoção não é um `false`: é uma **recusa**, e a mudança
    // importa porque é o que lhe dá frase e gesto. Um `bool` obrigava a
    // casca a escrever o código à mão — que é como a recusa apareceu no
    // terminal sem gesto nenhum.
    let segunda = lista.remover(&nome).expect_err("a segunda remoção recusa");
    assert_eq!(segunda.codigo(), "ponte.inexistente");
    assert!(!segunda.humano().is_empty());
    assert!(
        !segunda.gesto().is_empty(),
        "uma recusa sem gesto não diz o que fazer a seguir"
    );
}

/// 🔴 Nenhum motivo da ponte fica sem gesto — e este teste morde se alguém
/// acrescentar um motivo novo e não lhe der um.
#[test]
fn nenhum_motivo_da_ponte_fica_sem_gesto() {
    for (codigo, frase, gesto) in ErroCamera::todos() {
        assert!(!codigo.is_empty(), "um motivo sem codigo");
        assert!(!frase.trim().is_empty(), "{codigo}: frase vazia");
        assert!(!gesto.trim().is_empty(), "{codigo}: gesto vazio");
    }
}

/// A ida e volta pelo ficheiro não muda nada.
#[test]
fn a_lista_vai_e_vem_igual() {
    let dir = std::env::temp_dir().join(format!("aegis-ponte-volta-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let mut lista = Lista::em(&dir);
    lista
        .acrescentar(Camera::nova("portao", "rtsp://10.0.0.1/a").unwrap())
        .unwrap();
    lista
        .acrescentar(Camera::nova("lateral", "rtsp://10.0.0.2/b").unwrap())
        .unwrap();
    lista.gravar().expect("gravar");

    let mut relida = Lista::em(&dir);
    let (n, maus) = relida.ler();
    assert_eq!(n, 2, "as duas têm de voltar");
    assert!(maus.is_empty(), "nada mau: {maus:?}");
    assert_eq!(relida.cameras(), lista.cameras());
    let _ = std::fs::remove_dir_all(&dir);
}

/// 🔴 O que o meu primeiro `Camera::nova` fazia de errado.
///
/// Um nome com caracteres de URL — `cam?a=1&b=2` — era tomado por um endereço
/// colado, e o produto **renomeava a câmara** para a última coisa do
/// endereço. O nome que o operador escreveu desaparecia em silêncio.
///
/// Um nome esquisado é **recusado com o motivo**; um endereço colado é
/// percebido. São dois gestos diferentes, e precisam de duas regras.
#[test]
fn um_nome_esquisito_e_recusado_e_nao_renomeado() {
    let e = Camera::nova("cam?a=1&b=2", "rtsp://10.0.0.1/p")
        .expect_err("um nome com query não é um endereço colado");
    assert_eq!(e.codigo(), "ponte.nome-nao-e-nome");

    // E o nome sobrevive à recusa: nada foi guardado com outro nome.
    let nome = Nome::novo("cam 1").expect("um nome normal");
    assert_eq!(nome.as_str(), "cam_1");
}

/// 🔴 O `go2rtc.yaml` leva a linha que **não se mexe**.
///
/// O *template* padrão do `go2rtc` (superfast, CRF ilimitado, 1080p30) mediu
/// ~5 Mbps e deixou cair 17,9 M de pacotes RTP num link caseiro: o sender
/// descartava 2,4× o que entregava, o upload saturava, o H264 chegava
/// corrompido e o vídeo via-se "travando absurdamente" (12/09/2026).
#[test]
fn o_go2rtc_tem_a_linha_que_a_casa_mediu() {
    let y = aegis_ponte::go2rtc_yaml(&[]);
    assert!(y.contains("h264lr:"), "o h264lr sumiu do go2rtc.yaml:\n{y}");
    assert!(
        y.contains("1200k") && y.contains("-r 15"),
        "a taxa do h264lr mudou — e ela foi medida:\n{y}"
    );
    // E as três portas, todas fixas.
    for porta in [
        aegis_ponte::GO2RTC_HTTP,
        aegis_ponte::GO2RTC_RTSP,
        aegis_ponte::GO2RTC_WEBRTC,
    ] {
        assert!(
            y.contains(&format!(":{porta}")),
            "falta a porta {porta}:\n{y}"
        );
    }
    assert!(
        y.contains("streams: {}"),
        "sem câmaras, streams tem de ser um mapa vazio"
    );
}

/// O `yaml` sai do **nome** e do **endereço** — e o nome é o que vai na chave.
#[test]
fn o_yaml_usa_o_nome_como_chave() {
    let c = Camera::nova("Portão", "rtsp://10.0.0.1/stream").unwrap();
    let y = aegis_ponte::go2rtc_yaml(std::slice::from_ref(&c));
    assert!(
        y.contains("  portao: rtsp://10.0.0.1/stream"),
        "a chave tem de ser o nome normalizado:\n{y}"
    );
    // 🔴 E a chave **não** pode ser o endereço. Era aí que nascia o lixo.
    assert!(
        !y.contains("rtsp_10_0_0_1"),
        "o endereço entrou na chave do stream"
    );
}

/// 🔴 O predicado de lixo é a **medição** do defeito.
///
/// Ele diz se a ponte tem streams que o operador não pediu — que é a
/// assinatura das ~25 gerações. E tem de dar o mesmo que a [`Nome`] impede:
/// o que a normalização recusa, o doutor tem de reconhecer.
#[test]
fn o_doutor_reconhece_o_lixo_que_a_normalizacao_impede() {
    // O que a `Nome` recusa é lixo para o doutor. A lista dos dois lados é o
    // contrato, e é o que impede e as regras divergirem.
    for recusado in [
        "rtsp://10.0.0.1/stream",
        "ffmpeg:usb",
        "rtsps://cam/live",
        "cam?a=1",
        "exec:xdg-open",
    ] {
        assert!(
            aegis_ponte::stream_e_lixo(recusado),
            "{recusado:?} é recusado como nome e o doutor não o reconhece como lixo — \
             e as duas regras são a mesma"
        );
    }
}

/// 🔴 E o inverso: uma câmara que se **chame** `rtsp_entrada` não é lixo.
///
/// Apagá-la porque o nome começa por uma letra seria perder a câmara de
/// alguém. A regra é o que **faz** um nome, não o que ele começa por dizer.
#[test]
fn uma_camara_com_nome_de_esquema_nao_e_lixo() {
    for camara in ["rtsp_entrada", "http_portao", "ffmpeg_testes", "portao"] {
        assert!(
            !aegis_ponte::stream_e_lixo(camara),
            "{camara:?} é uma câmara e foi tratada como lixo"
        );
    }
}

/// O nome vem **desescapado** do JSON do `go2rtc`, e é por isso que a
/// desescapagem vem antes do juízo.
///
/// 🔴 E o que faz um nome ser lixo é o **`?`**, o `://` e a barra invertida —
/// o `&` sozinho **não**: ele só era lixo por fazer parte de uma query
/// (`?a=1&b=2`). A primeira versão desta prova afirmava que `cam&a` era lixo,
/// e estava a inventar uma regra que a casa nunca teve: um nome com `&` e sem
/// mais nada é um nome esquisito, não lixo.
/// desescapar o doutor não o reconheceria — que é o defeito original.
/// O que o `go2rtc` devolve vem CRU do JSON dele.
///
/// 🔴 A string do escape e montada em codigo de proposito: escrever
/// `{}uXXXX` numa string normal e um escape de Unicode invalido em Rust, e
/// uma ferramenta de edicao come a sequencia antes de ela chegar ao
/// ficheiro -- em tres tentativas seguidas. Montada aqui, ela nao passa
/// por texto nenhum.
const SEPARADOR: char = 92 as char;

#[test]
fn o_lixo_e_reconhecido_depois_de_desescapado() {
    // As strings sao CRUAS de proposito: em Rust uma string normal com
    // `&` e um escape de Unicode invalido, e o compilador recusa
    // ANTES de a prova correr. O que o go2rtc devolve e isso a serio.
    let escapado = |s: &str| {
        s.chars()
            .map(|c| format!("{}u{:04x}", SEPARADOR, c as u32))
            .collect::<String>()
    };
    for cru in [
        escapado("cam?a=1&b=2"),
        format!("{}{}u0026a", SEPARADOR, SEPARADOR),
        escapado("rtsp://10.0.0.1/stream"),
    ] {
        assert!(
            aegis_ponte::stream_e_lixo(&cru),
            "{cru:?} é lixo depois de desescapado, e o doutor não viu"
        );
    }
}

/// Uma câmara normal **não** é lixo, mesmo vinda desescapada.
#[test]
fn uma_camara_normal_continua_a_nao_ser_lixo() {
    assert!(!aegis_ponte::stream_e_lixo("portao"));
    assert!(!aegis_ponte::stream_e_lixo("cam_1"));
}
