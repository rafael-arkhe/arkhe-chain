/**
 * i18n — /buscar cards contextuais + coleta de Mídia assíncrona (2026-06-26).
 * Mesclado em DICT via spread em dict.ts.
 */
export const BUSCAR_COLETA_DICT: Record<string, { 'pt-BR': string; 'en-US': string }> = {
  "buscar.fato.situacao": {
    "pt-BR": "Situação",
    "en-US": "Status"
  },
  "buscar.fato.valido": {
    "pt-BR": "Válido",
    "en-US": "Valid"
  },
  "buscar.fato.invalido": {
    "pt-BR": "INVÁLIDO",
    "en-US": "INVALID"
  },
  "buscar.fato.documento": {
    "pt-BR": "Documento",
    "en-US": "Document"
  },
  "buscar.fato.tipo": {
    "pt-BR": "Tipo",
    "en-US": "Type"
  },
  "buscar.fato.regiao": {
    "pt-BR": "Região",
    "en-US": "Region"
  },
  "buscar.fato.operadora": {
    "pt-BR": "Operadora",
    "en-US": "Carrier"
  },
  "buscar.fato.e164": {
    "pt-BR": "E.164",
    "en-US": "E.164"
  },
  "buscar.fato.ddd": {
    "pt-BR": "DDD",
    "en-US": "Area code"
  },
  "buscar.fato.conta": {
    "pt-BR": "Conta",
    "en-US": "Account"
  },
  "buscar.fato.contaEncontrada": {
    "pt-BR": "conta encontrada",
    "en-US": "account found"
  },
  "buscar.fato.contasEncontradas": {
    "pt-BR": "contas encontradas",
    "en-US": "accounts found"
  },
  "buscar.fato.nenhumaConta": {
    "pt-BR": "Nenhuma conta encontrada",
    "en-US": "No account found"
  },
  "buscar.acao.buscarComValor": {
    "pt-BR": "Buscar com este valor",
    "en-US": "Search with this value"
  },
  "buscar.acao.aprofundarEmail": {
    "pt-BR": "Aprofundar e-mail",
    "en-US": "Dig deeper on e-mail"
  },
  "buscar.acao.buscarComEsteResultado": {
    "pt-BR": "Buscar com este resultado",
    "en-US": "Search with this result"
  },
  "buscar.detalhe.score": {
    "pt-BR": "relevância",
    "en-US": "score"
  },
  /* ──────────────────────────────────────────────────────────────────────
   * Renderização RICA por SHAPE (P2 ELO 2). Substantivos/títulos NEUTROS
   * (multidomínio — nunca "pessoas/empresas"). `{n}` interpolado no caller via
   * .replace('{n}', …), igual aos demais contadores.
   * ──────────────────────────────────────────────────────────────────────── */
  "buscar.resultado.itens": {
    "pt-BR": "{n} itens",
    "en-US": "{n} items"
  },
  "buscar.detalhe.galeria": {
    "pt-BR": "Galeria",
    "en-US": "Gallery"
  },
  "buscar.detalhe.itens": {
    "pt-BR": "Itens",
    "en-US": "Items"
  },
  "buscar.detalhe.campos": {
    "pt-BR": "Campos",
    "en-US": "Fields"
  },
  "buscar.galeria.video": {
    "pt-BR": "Vídeo",
    "en-US": "Video"
  },
  "ficha.midia.coletandoTitulo": {
    "pt-BR": "Coletando — {n} rede(s)",
    "en-US": "Collecting — {n} network(s)"
  },
  "ficha.midia.statOk": {
    "pt-BR": "{n} ok",
    "en-US": "{n} ok"
  },
  "ficha.midia.statBloqueado": {
    "pt-BR": "{n} bloqueado(s)",
    "en-US": "{n} blocked"
  },
  "ficha.midia.cancelar": {
    "pt-BR": "Cancelar",
    "en-US": "Cancel"
  },
  "ficha.midia.coletaConcluida": {
    "pt-BR": "Coleta concluída",
    "en-US": "Collection finished"
  },
  "ficha.midia.statusOk": {
    "pt-BR": "ok",
    "en-US": "ok"
  },
  "ficha.midia.statusBloqueado": {
    "pt-BR": "bloqueado: {motivo}",
    "en-US": "blocked: {motivo}"
  }
};
