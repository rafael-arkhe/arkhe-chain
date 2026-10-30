/** i18n — campos da Busca avançada (máscara/validação data-driven, 2026-06-26). */
export const BUSCAR_CAMPO_DICT: Record<string,{'pt-BR':string;'en-US':string}> = {
  "buscar.campo.erro.cpf": {
    "pt-BR": "CPF inválido. Confira os 11 dígitos.",
    "en-US": "Invalid CPF. Check the 11 digits."
  },
  "buscar.campo.erro.cnpj": {
    "pt-BR": "CNPJ inválido. Confira os 14 dígitos.",
    "en-US": "Invalid CNPJ. Check the 14 digits."
  },
  "buscar.campo.erro.cpfCnpj": {
    "pt-BR": "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).",
    "en-US": "Enter a CPF (11 digits) or CNPJ (14 digits)."
  },
  "buscar.campo.erro.telefone": {
    "pt-BR": "Telefone inválido. Use DDD + 8 ou 9 dígitos.",
    "en-US": "Invalid phone. Use area code + 8 or 9 digits."
  },
  "buscar.campo.erro.cep": {
    "pt-BR": "CEP inválido. Use 8 dígitos.",
    "en-US": "Invalid postal code. Use 8 digits."
  },
  "buscar.campo.erro.placa": {
    "pt-BR": "Placa inválida. Use o formato Mercosul (ABC1D23) ou antigo (ABC1234).",
    "en-US": "Invalid plate. Use the Mercosur format (ABC1D23) or the old one (ABC1234)."
  },
  "buscar.campo.erro.email": {
    "pt-BR": "E-mail inválido.",
    "en-US": "Invalid email."
  },
  "buscar.campo.erro.username": {
    "pt-BR": "Usuário inválido. Use letras, números, ponto, hífen ou sublinhado.",
    "en-US": "Invalid username. Use letters, numbers, dot, hyphen or underscore."
  },
  "buscar.campo.ph.doc": {
    "pt-BR": "CPF ou CNPJ",
    "en-US": "CPF or CNPJ"
  },
  "buscar.campo.ph.cpf": {
    "pt-BR": "000.000.000-00",
    "en-US": "000.000.000-00"
  },
  "buscar.campo.ph.cnpj": {
    "pt-BR": "00.000.000/0000-00",
    "en-US": "00.000.000/0000-00"
  },
  "buscar.campo.ph.phone": {
    "pt-BR": "(00) 00000-0000",
    "en-US": "(00) 00000-0000"
  },
  "buscar.campo.ph.cep": {
    "pt-BR": "00000-000",
    "en-US": "00000-000"
  },
  "buscar.campo.ph.placa": {
    "pt-BR": "ABC1D23",
    "en-US": "ABC1D23"
  },
  "buscar.campo.ph.email": {
    "pt-BR": "nome@dominio.com",
    "en-US": "name@domain.com"
  },
  "buscar.campo.ph.username": {
    "pt-BR": "usuario",
    "en-US": "username"
  },
  "buscar.campo.ph.uf": {
    "pt-BR": "UF",
    "en-US": "State"
  },
  "buscar.campo.ph.date": {
    "pt-BR": "Data",
    "en-US": "Date"
  },
  "buscar.campo.ph.text": {
    "pt-BR": "Informe um valor",
    "en-US": "Enter a value"
  },
  "buscar.campo.ph.duration": {
    "pt-BR": "0",
    "en-US": "0"
  },
  "buscar.campo.erro.duracao": {
    "pt-BR": "Valor fora da faixa permitida.",
    "en-US": "Value out of the allowed range."
  },
  /* number (inteiro sem unidade — kind 'number') */
  "buscar.campo.ph.numero": {
    "pt-BR": "0",
    "en-US": "0"
  },
  "buscar.campo.erro.numero": {
    "pt-BR": "Informe um número inteiro válido.",
    "en-US": "Enter a valid whole number."
  },
  "buscar.campo.erro.faixa": {
    "pt-BR": "Valor fora da faixa permitida.",
    "en-US": "Value out of the allowed range."
  },
  /* select (escolha única — kind 'select') */
  "buscar.campo.ph.select": {
    "pt-BR": "Selecionar…",
    "en-US": "Select…"
  },
  "buscar.campo.select.vazio": {
    "pt-BR": "Selecionar…",
    "en-US": "Select…"
  },
  "buscar.campo.derivados": {
    "pt-BR": "Incluir perfis derivados",
    "en-US": "Include derived profiles"
  },
  "unit.seconds": {
    "pt-BR": "s",
    "en-US": "s"
  },
  /* toggle */
  "buscar.toggle.ligado": {
    "pt-BR": "Ligado",
    "en-US": "On"
  },
  "buscar.toggle.desligado": {
    "pt-BR": "Desligado",
    "en-US": "Off"
  },
  /* multiselect (combobox de fontes) */
  "buscar.multiselect.buscar": {
    "pt-BR": "Buscar opções…",
    "en-US": "Search options…"
  },
  "buscar.multiselect.todos": {
    "pt-BR": "Todos",
    "en-US": "All"
  },
  "buscar.multiselect.limpar": {
    "pt-BR": "Limpar",
    "en-US": "Clear"
  },
  "buscar.multiselect.selecionados": {
    "pt-BR": "{n} selecionados",
    "en-US": "{n} selected"
  },
  "buscar.multiselect.vazio": {
    "pt-BR": "Nenhuma opção encontrada.",
    "en-US": "No options found."
  },
  "buscar.multiselect.carregando": {
    "pt-BR": "Carregando catálogo…",
    "en-US": "Loading catalog…"
  },
  "buscar.multiselect.erro": {
    "pt-BR": "Não foi possível carregar o catálogo.",
    "en-US": "Could not load the catalog."
  },
  "buscar.multiselect.remover": {
    "pt-BR": "Remover",
    "en-US": "Remove"
  },
  "buscar.multiselect.placeholder": {
    "pt-BR": "Selecionar…",
    "en-US": "Select…"
  },
  "buscar.multiselect.todosSel": {
    "pt-BR": "Todos selecionados",
    "en-US": "All selected"
  },
  "buscar.multiselect.maisN": {
    "pt-BR": "+{n}",
    "en-US": "+{n}"
  },
  /* NSFW (gate) */
  "buscar.nsfw": {
    "pt-BR": "Incluir conteúdo adulto (NSFW)",
    "en-US": "Include adult content (NSFW)"
  },
  /* maigret */
  "buscar.maigret.sites": {
    "pt-BR": "Sites (Maigret)",
    "en-US": "Sites (Maigret)"
  },
  "buscar.maigret.categorias": {
    "pt-BR": "Categorias (Maigret)",
    "en-US": "Categories (Maigret)"
  },
  "buscar.maigret.paises": {
    "pt-BR": "Países (Maigret)",
    "en-US": "Countries (Maigret)"
  },
  /* wmn */
  "buscar.wmn.sites": {
    "pt-BR": "Sites (WMN)",
    "en-US": "Sites (WMN)"
  },
  "buscar.wmn.categorias": {
    "pt-BR": "Categorias (WMN)",
    "en-US": "Categories (WMN)"
  },
  /* sherlock */
  "buscar.sherlock.sites": {
    "pt-BR": "Sites (Sherlock)",
    "en-US": "Sites (Sherlock)"
  },
  /* Labels GENÉRICOS de parâmetro (categorias A-E) — rótulo de fallback p/ um
     ui_field cujo nome casa um destes conceitos comuns (limite/ano/mês/período/
     ordenar/tipo/categoria/região/idioma/página/quantidade). Quando o schema
     declara `labelKey` próprio, ele tem precedência; estes cobrem o resto. */
  "buscar.param.limite": { "pt-BR": "Limite", "en-US": "Limit" },
  "buscar.param.ano": { "pt-BR": "Ano", "en-US": "Year" },
  "buscar.param.mes": { "pt-BR": "Mês", "en-US": "Month" },
  "buscar.param.periodo": { "pt-BR": "Período (dias)", "en-US": "Window (days)" },
  "buscar.param.ordenar": { "pt-BR": "Ordenar", "en-US": "Sort" },
  "buscar.param.tipo": { "pt-BR": "Tipo", "en-US": "Type" },
  "buscar.param.categoria": { "pt-BR": "Categoria", "en-US": "Category" },
  "buscar.param.regiao": { "pt-BR": "Região", "en-US": "Region" },
  "buscar.param.idioma": { "pt-BR": "Idioma", "en-US": "Language" },
  "buscar.param.pagina": { "pt-BR": "Página", "en-US": "Page" },
  "buscar.param.quantidade": { "pt-BR": "Quantidade", "en-US": "Count" },

  /* ──────────────────────────────────────────────────────────────────────
   * Rótulos de CAMPO genéricos (normalizer rico por SHAPE — P2 ELO 1).
   *
   * Namespace `buscar.campo.k.<chave>`: o normalizer humaniza um escalar do raw
   * pelo NOME da chave (followers/likes/situacao…), resolvido aqui em pt-BR +
   * en-US. Quando a chave não casa nenhum destes, o normalizer cai no
   * Title Case da própria chave (que passa pelo t() intacto). MULTIDOMÍNIO:
   * são conceitos NEUTROS (métricas/atributos), nunca verticais.
   * As chaves são gravadas em minúsculas; o lookup tenta a chave e sua versão
   * lowercase, cobrindo camelCase (publishedDate → publisheddate).
   * ──────────────────────────────────────────────────────────────────────── */
  "buscar.campo.k.followers": { "pt-BR": "Seguidores", "en-US": "Followers" },
  "buscar.campo.k.seguidores": { "pt-BR": "Seguidores", "en-US": "Followers" },
  "buscar.campo.k.followees": { "pt-BR": "Seguindo", "en-US": "Following" },
  "buscar.campo.k.following": { "pt-BR": "Seguindo", "en-US": "Following" },
  "buscar.campo.k.subscriber_count": { "pt-BR": "Inscritos", "en-US": "Subscribers" },
  "buscar.campo.k.fullname": { "pt-BR": "Nome", "en-US": "Name" },
  "buscar.campo.k.location": { "pt-BR": "Local", "en-US": "Location" },
  "buscar.campo.k.tags": { "pt-BR": "Marcadores", "en-US": "Tags" },
  "buscar.campo.k.posts": { "pt-BR": "Publicações", "en-US": "Posts" },
  "buscar.campo.k.publicacoes": { "pt-BR": "Publicações", "en-US": "Posts" },
  "buscar.campo.k.mediacount": { "pt-BR": "Publicações", "en-US": "Posts" },
  "buscar.campo.k.post_count": { "pt-BR": "Publicações", "en-US": "Posts" },
  "buscar.campo.k.likes": { "pt-BR": "Curtidas", "en-US": "Likes" },
  "buscar.campo.k.curtidas": { "pt-BR": "Curtidas", "en-US": "Likes" },
  "buscar.campo.k.like_count": { "pt-BR": "Curtidas", "en-US": "Likes" },
  "buscar.campo.k.favourites_count": { "pt-BR": "Curtidas", "en-US": "Likes" },
  "buscar.campo.k.comments": { "pt-BR": "Comentários", "en-US": "Comments" },
  "buscar.campo.k.comentarios": { "pt-BR": "Comentários", "en-US": "Comments" },
  "buscar.campo.k.num_comments": { "pt-BR": "Comentários", "en-US": "Comments" },
  "buscar.campo.k.comment_count": { "pt-BR": "Comentários", "en-US": "Comments" },
  "buscar.campo.k.views": { "pt-BR": "Visualizações", "en-US": "Views" },
  "buscar.campo.k.visualizacoes": { "pt-BR": "Visualizações", "en-US": "Views" },
  "buscar.campo.k.view_count": { "pt-BR": "Visualizações", "en-US": "Views" },
  "buscar.campo.k.video_view_count": { "pt-BR": "Visualizações", "en-US": "Views" },
  "buscar.campo.k.playcount": { "pt-BR": "Reproduções", "en-US": "Plays" },
  "buscar.campo.k.shares": { "pt-BR": "Compartilhamentos", "en-US": "Shares" },
  "buscar.campo.k.reblogs_count": { "pt-BR": "Compartilhamentos", "en-US": "Shares" },
  "buscar.campo.k.score": { "pt-BR": "Pontuação", "en-US": "Score" },
  "buscar.campo.k.situacao": { "pt-BR": "Situação", "en-US": "Status" },
  "buscar.campo.k.situacao_cadastral": { "pt-BR": "Situação", "en-US": "Status" },
  "buscar.campo.k.status": { "pt-BR": "Situação", "en-US": "Status" },
  "buscar.campo.k.capital": { "pt-BR": "Capital social", "en-US": "Share capital" },
  "buscar.campo.k.capital_social": { "pt-BR": "Capital social", "en-US": "Share capital" },
  "buscar.campo.k.cnae": { "pt-BR": "Atividade", "en-US": "Activity" },
  "buscar.campo.k.atividade": { "pt-BR": "Atividade", "en-US": "Activity" },
  "buscar.campo.k.cnae_fiscal_descricao": { "pt-BR": "Atividade", "en-US": "Activity" },
  "buscar.campo.k.qualificacao": { "pt-BR": "Qualificação", "en-US": "Role" },
  "buscar.campo.k.qualificacao_socio": { "pt-BR": "Qualificação", "en-US": "Role" },
  "buscar.campo.k.partido": { "pt-BR": "Partido", "en-US": "Party" },
  "buscar.campo.k.siglapartido": { "pt-BR": "Partido", "en-US": "Party" },
  "buscar.campo.k.cargo": { "pt-BR": "Cargo", "en-US": "Position" },
  "buscar.campo.k.dominio": { "pt-BR": "Domínio", "en-US": "Domain" },
  "buscar.campo.k.domain": { "pt-BR": "Domínio", "en-US": "Domain" },
  "buscar.campo.k.autor": { "pt-BR": "Autor", "en-US": "Author" },
  "buscar.campo.k.author": { "pt-BR": "Autor", "en-US": "Author" },
  "buscar.campo.k.uploader": { "pt-BR": "Autor", "en-US": "Author" },
  "buscar.campo.k.subreddit": { "pt-BR": "Comunidade", "en-US": "Community" },
  "buscar.campo.k.data": { "pt-BR": "Data", "en-US": "Date" },
  "buscar.campo.k.date": { "pt-BR": "Data", "en-US": "Date" },
  "buscar.campo.k.date_utc": { "pt-BR": "Data", "en-US": "Date" },
  "buscar.campo.k.created_utc": { "pt-BR": "Data", "en-US": "Date" },
  "buscar.campo.k.upload_date": { "pt-BR": "Data", "en-US": "Date" },
  "buscar.campo.k.publisheddate": { "pt-BR": "Data", "en-US": "Date" },
  "buscar.campo.k.seendate": { "pt-BR": "Data", "en-US": "Date" },
  "buscar.campo.k.data_entrada_sociedade": { "pt-BR": "Entrada", "en-US": "Joined" },
  "buscar.campo.k.duration": { "pt-BR": "Duração", "en-US": "Duration" },
  "buscar.campo.k.language": { "pt-BR": "Idioma", "en-US": "Language" },
  "buscar.campo.k.engine": { "pt-BR": "Motor", "en-US": "Engine" },
  "buscar.campo.k.lat": { "pt-BR": "Latitude", "en-US": "Latitude" },
  "buscar.campo.k.latitude": { "pt-BR": "Latitude", "en-US": "Latitude" },
  "buscar.campo.k.lon": { "pt-BR": "Longitude", "en-US": "Longitude" },
  "buscar.campo.k.lng": { "pt-BR": "Longitude", "en-US": "Longitude" },
  "buscar.campo.k.longitude": { "pt-BR": "Longitude", "en-US": "Longitude" },
  "buscar.campo.k.verificado": { "pt-BR": "Verificado", "en-US": "Verified" },
  "buscar.campo.k.verified": { "pt-BR": "Verificado", "en-US": "Verified" },
  "buscar.campo.k.is_verified": { "pt-BR": "Verificado", "en-US": "Verified" },
  "buscar.campo.k.privado": { "pt-BR": "Privado", "en-US": "Private" },
  "buscar.campo.k.is_private": { "pt-BR": "Privado", "en-US": "Private" },

  /* Valores booleanos (renderizados crus pela camada de exibição; pt-BR default
     pelo tDict, igual aos subtitles montados fora do React). */
  "buscar.campo.sim": { "pt-BR": "Sim", "en-US": "Yes" },
  "buscar.campo.nao": { "pt-BR": "Não", "en-US": "No" },

  /* Substantivo NEUTRO de contagem de coleção (multidomínio — nunca
     "pessoas/empresas"). Usado no subtitle-resumo de um resultado-coleção. */
  "buscar.shape.itens": { "pt-BR": "itens", "en-US": "items" }
};
