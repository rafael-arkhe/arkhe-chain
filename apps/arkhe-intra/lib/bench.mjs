/** @typedef {'client' | 'policy' | 'gate' | 'preempt' | 'receipt' | 'effect' | 'resume' | 'formal' | 'eval' | 'preview'} Pane */

export const channels = [
  ['Rede', 'Held', 'Unmediated'],
  ['Ficheiro', 'Held', 'Unmediated'],
  ['IPC local', 'Held', 'Unmediated'],
  ['Memória partilhada', 'Held', 'Unmediated'],
];

export const stores = [
  ['Atomic', 'Unavailable', 'NotImplemented'],
  ['Journal', 'Unavailable', 'NotImplemented'],
];

export const limits = [
  ['preempt', 'Preempção', 'NotImplemented'],
  ['resume', 'Retoma', 'Unavailable'],
  ['formal', 'Formal', 'TLC por correr'],
  ['eval', 'Avaliação', 'not scored'],
];

export const layers = [
  { id: 'client', title: 'Cliente', line: 'Sem snapshot · não assina', body: 'O pin unpinned não traz pesos. O cliente não assina, não escreve evidência e não solta efeito.' },
  { id: 'policy', title: 'Política', line: 'Deny · perfil de desenvolvimento', body: 'A política de desenvolvimento recusa a transição protegida. O modelo não altera este veredito.' },
  { id: 'gate', title: 'Gate', line: '', body: '' },
  { id: 'preempt', title: 'Preempção', line: 'NotImplemented', body: 'preempt devolve NotImplemented. Nenhum processo recebe sinal.' },
  { id: 'receipt', title: 'Recibo', line: 'Por emitir', body: 'O recibo aparece depois do commit da evidência. Este ecrã não emite o recibo e não lança processo.' },
  { id: 'effect', title: 'Efeito', line: 'Held · Unmediated', body: 'Todos os canais devolvem Held, motivo Unmediated. A barreira não está ligada.' },
  { id: 'resume', title: 'Retoma', line: 'Unavailable · NotImplemented', body: 'Atomic e journal não retomam. Retoma não é evidência nem consenso.' },
  { id: 'formal', title: 'Formal', line: 'TLC por correr', body: 'admit, resume e decide estão escritos. O TLC não correu e nenhum teorema foi aceite.' },
  { id: 'eval', title: 'Avaliação', line: 'not scored', body: 'A tarefa none não está congelada e human_hours é nulo. O verificador recusa pontuar.' },
  { id: 'preview', title: 'Preview', line: 'Qualificação em falta', body: 'O Podman só corre com qualificação assinada. Este caminho não solta o efeito.' },
];

/** @param {boolean} stopped */
export function gateLine(stopped) {
  return stopped ? 'Reject · paragem de emergência' : 'Reject · regra em falta';
}

/** @param {boolean} stopped */
export function gateBody(stopped) {
  return stopped
    ? 'O bool de paragem está ligado. A próxima decisão rejeita. Nenhum processo recebe sinal.'
    : 'O gate rejeita enquanto a razão não for RuleAllowed.';
}

/** @param {string} text */
export function proposalError(text) {
  const value = text.trim();
  if (value.length < 10 || value.length > 2000) return 'Escreva uma proposta entre 10 e 2000 caracteres.';
  return '';
}

/** @param {Pane} pane @param {boolean} stopped */
export function layerLine(pane, stopped) {
  if (pane === 'gate') return gateLine(stopped);
  return layers.find(layer => layer.id === pane)?.line ?? '';
}

/** @param {Pane} pane @param {boolean} stopped */
export function layerBody(pane, stopped) {
  if (pane === 'gate') return gateBody(stopped);
  return layers.find(layer => layer.id === pane)?.body ?? '';
}

/** @param {Pane} pane @param {boolean} stopped */
export function paneBody(pane, stopped) {
  return layerBody(pane, stopped);
}

export const groups = [
  { id: 'proposta', title: 'Proposta', ids: ['intent', 'client'] },
  { id: 'decisao', title: 'Decisão', ids: ['policy', 'gate'] },
  { id: 'registo', title: 'Registo', ids: ['evidence', 'receipt'] },
  { id: 'efeito', title: 'Efeito', ids: ['effect', 'preempt', 'preview'] },
  { id: 'fora', title: 'Fora deste caminho', ids: ['resume', 'formal', 'eval', 'consensus'] },
];

export const screens = [
  { id: 'intent', path: 'intent', fn: 'registarIntent', title: 'WorkIntent', line: 'Por registar', summary: 'A bancada não constrói WorkIntent nem WorkerExecutionRecord.' },
  { id: 'policy', path: 'politica', fn: 'recusarPolitica', title: 'Política', line: 'Deny · perfil de desenvolvimento', summary: 'O veredito de desenvolvimento recusa a transição protegida. O modelo não o altera.' },
  { id: 'gate', path: 'gate', fn: 'decidir', title: 'Gate', line: '', summary: 'A decisão local rejeita. O bool de paragem não envia sinal.' },
  { id: 'evidence', path: 'evidencia', fn: 'commitProposto', title: 'Evidência', line: 'Por gravar', summary: 'Este ecrã não grava WormGraph nem abre transação.' },
  { id: 'receipt', path: 'recibo', fn: 'emitirRecibo', title: 'Recibo', line: 'Por emitir', summary: 'O recibo real aparece depois do commit. Aqui ele não é emitido e não lança processo.' },
  { id: 'effect', path: 'efeito', fn: 'admit', title: 'Efeito', line: 'Held · Unmediated', summary: 'admit segura os quatro canais. A barreira não está ligada.' },
  { id: 'preempt', path: 'preempcao', fn: 'preempt', title: 'Preempção', line: 'NotImplemented', summary: 'preempt devolve NotImplemented. Nenhum processo recebe sinal.' },
  { id: 'resume', path: 'retoma', fn: 'resume', title: 'Retoma', line: 'Unavailable · NotImplemented', summary: 'Atomic e journal não retomam. Retoma não é evidência nem consenso.' },
  { id: 'client', path: 'cliente', fn: 'lerCliente', title: 'Cliente', line: 'Sem snapshot · não assina', summary: 'O pin unpinned não traz pesos. O cliente não assina, não escreve evidência e não solta efeito.' },
  { id: 'formal', path: 'formal', fn: 'lerFormal', title: 'Formal', line: 'TLC por correr', summary: 'admit, resume e decide estão escritos. O TLC não correu e nenhum teorema foi aceite.' },
  { id: 'eval', path: 'avaliacao', fn: 'recusarNota', title: 'Avaliação', line: 'not scored', summary: 'A tarefa none não está congelada e human_hours é nulo. O verificador recusa pontuar.' },
  { id: 'preview', path: 'preview', fn: 'qualificarPreview', title: 'Preview', line: 'Qualificação em falta', summary: 'O Podman só corre com qualificação assinada. Este caminho não solta o efeito.' },
  { id: 'consensus', path: 'consenso', fn: 'lerConsenso', title: 'Consenso', line: 'Fio PENDING', summary: 'O fio de consenso está pendente. Consenso não é durabilidade e não é o gate.' },
];

/** @param {string} id @param {boolean} stopped */
function screenFields(id, stopped) {
  if (id === 'intent') return [['Registado', 'não'], ['WER', 'não']];
  if (id === 'policy') return [['Veredito', 'Deny']];
  if (id === 'gate') return [['Decisão', 'Reject'], ['Razão', stopped ? 'paragem de emergência' : 'regra em falta'], ['Sinal', 'não']];
  if (id === 'evidence') return [['Commit', 'não']];
  if (id === 'receipt') return [['Emitido', 'não'], ['Lança processo', 'não']];
  if (id === 'effect') return [['Ligada', 'não'], ...channels.map(([name, release, reason]) => [name, `${release} · ${reason}`])];
  if (id === 'preempt') return [['Estado', 'NotImplemented'], ['Sinal', 'não']];
  if (id === 'resume') return [...stores.map(([name, release, reason]) => [name, `${release} · ${reason}`]), ['É evidência', 'não'], ['É consenso', 'não']];
  if (id === 'client') return [['Pin', 'unpinned'], ['Assina', 'não'], ['Escreve evidência', 'não'], ['Solta efeito', 'não']];
  if (id === 'formal') return [['TLC', 'por correr'], ['Teorema aceite', 'não']];
  if (id === 'eval') return [['Nota', 'not scored'], ['Congelada', 'não'], ['human_hours', 'nulo']];
  if (id === 'preview') return [['Qualificado', 'não'], ['Solta efeito', 'não']];
  if (id === 'consensus') return [['Fio', 'PENDING'], ['É durabilidade', 'não'], ['É o gate', 'não']];
  return [];
}

/** @param {string} id */
export function groupOf(id) {
  return groups.find(group => group.ids.includes(id)) ?? null;
}

/** @param {string} path */
export function screenByPath(path) {
  return screens.find(screen => screen.path === path) ?? null;
}

/** @param {string} id @param {boolean} stopped */
export function runScreen(id, stopped = false) {
  const screen = screens.find(item => item.id === id);
  if (!screen) return null;
  const line = id === 'gate' ? gateLine(stopped) : screen.line;
  return { ...screen, line, fields: screenFields(id, stopped), releasesEffect: false };
}
