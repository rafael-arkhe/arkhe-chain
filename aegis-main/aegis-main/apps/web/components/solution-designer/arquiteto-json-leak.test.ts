/**
 * BENCHMARK + GUARDA ANTI-REGRESSÃO (2026-06-08): o chat do AIP NUNCA pode
 * renderizar JSON CRU (requisito documentado: feedback_aip_chat_artifact_interactions
 * — dados estruturados viram artifact/plano, nunca code block). O leak real:
 * `extractArquitetoPlan` só remove o JSON quando ele parseia como plano
 * (`{problem: string}`); QUALQUER outro JSON do modelo (ou plano-só-JSON com prosa
 * vazia, que caía em `|| reply.text`) vazava como bloco de código.
 *
 * Este benchmark alimenta saídas REAIS típicas do modelo e afirma que o conteúdo
 * VISÍVEL (a mesma derivação que o ArquitetoChat usa) não tem JSON cru. Se alguém
 * regredir a sanitização, quebra.
 */
import { extractArquitetoPlan, stripStrayJson } from './ArquitetoChat';

/** Mesma derivação do componente (ArquitetoChat send): plano → prosa; senão → prosa
 *  com JSON solto removido; vazio com plano → fallback. */
function visibleOf(replyText: string): string {
  const detected = extractArquitetoPlan(replyText);
  return (
    (detected ? stripStrayJson(detected.prose) : stripStrayJson(replyText)) ||
    (detected ? 'PLANO_PRONTO' : '')
  );
}

/** Detecta JSON CRU grande que parseia — a assinatura do leak. */
function hasRawJson(s: string): boolean {
  for (const [o, c] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const a = s.indexOf(o);
    const b = s.lastIndexOf(c);
    if (a >= 0 && b - a >= 30) {
      try {
        JSON.parse(s.slice(a, b + 1));
        return true;
      } catch {
        /* não é JSON */
      }
    }
  }
  return false;
}

const PLAN = JSON.stringify({
  problem: 'Cadastro de livros',
  ontology_types: [{ kind: 'Livro' }, { kind: 'Autor' }],
  action_types: [{ name: 'criar_livro' }],
});

describe('AIP chat NUNCA renderiza JSON cru (benchmark de saídas reais)', () => {
  const leaky: Array<[string, string]> = [
    ['plano em ```aegis:plano```', 'Montei o app:\n```aegis:plano\n' + PLAN + '\n```'],
    ['plano em ```json```', 'Pronto:\n```json\n' + PLAN + '\n```'],
    ['plano cru sem cerca', 'Aqui está:\n' + PLAN],
    ['plano-só-JSON sem prosa', PLAN],
    [
      'JSON NÃO-plano (dump de ontologia) com prosa',
      'Os tipos são:\n' + JSON.stringify({ types: ['Livro', 'Autor', 'Editora', 'Genero'] }),
    ],
    [
      'array JSON cru no meio',
      'As ações ficaram: ' + JSON.stringify([{ name: 'a' }, { name: 'b' }, { name: 'c' }]) + ' — confira.',
    ],
  ];

  it.each(leaky)('não vaza JSON cru: %s', (_label, reply) => {
    expect(hasRawJson(visibleOf(reply))).toBe(false);
  });

  it('preserva prosa pura (sem JSON) intacta', () => {
    const reply = 'Que tipo de relatório você quer no painel?';
    expect(visibleOf(reply)).toBe(reply);
  });

  it('preserva código inline pequeno (não-JSON / curto)', () => {
    const reply = 'Use a variável {{total}} no prompt.';
    expect(visibleOf(reply)).toContain('{{total}}');
  });

  it('plano válido vira prosa limpa (sem o bloco)', () => {
    const detected = extractArquitetoPlan('Resumo do app:\n```aegis:plano\n' + PLAN + '\n```');
    expect(detected).not.toBeNull();
    expect(hasRawJson(detected!.prose)).toBe(false);
    expect(detected!.prose).toContain('Resumo do app');
  });
});
