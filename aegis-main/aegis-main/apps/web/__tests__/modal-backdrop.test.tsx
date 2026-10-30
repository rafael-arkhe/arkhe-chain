import { fireEvent, render, screen } from '@testing-library/react';
import { ModalBackdrop, ModalPortal } from '@/components/ui/modal-backdrop';

/**
 * ELO BACKDROP — contrato do primitivo canônico de scrim de modal.
 *
 * Garante (testável sem render visual ao vivo):
 *  - aplica a classe canônica `.ds-overlay` (scrim escuro sólido único);
 *  - NUNCA traz `backdrop-blur*` (glassmorphism BANIDO pelo DS);
 *  - cobre o viewport (`fixed inset-0`) por default, com z-index acima do
 *    chrome quando o consumidor não declara um z- próprio;
 *  - modo `absolute` para scrim filho de um root posicionado;
 *  - dispara onClick (fechar) e respeita z- declarado pelo consumidor.
 */
describe('ModalBackdrop (ELO BACKDROP)', () => {
  it('aplica .ds-overlay + fixed inset-0 e NUNCA backdrop-blur', () => {
    render(<ModalBackdrop data-testid="bd" />);
    const el = screen.getByTestId('bd');
    expect(el).toHaveClass('ds-overlay');
    expect(el).toHaveClass('fixed');
    expect(el).toHaveClass('inset-0');
    expect(el.className).not.toMatch(/backdrop-blur/);
    expect(el.className).not.toMatch(/bg-black/);
    expect(el).toHaveAttribute('data-ds-overlay', 'true');
  });

  it('overlay fixo sem z- declarado recebe z-index default acima do chrome', () => {
    render(<ModalBackdrop data-testid="bd" />);
    expect(screen.getByTestId('bd').className).toMatch(/z-\[120\]/);
  });

  it('respeita o z- declarado pelo consumidor (não sobrescreve empilhamento)', () => {
    render(<ModalBackdrop data-testid="bd" className="z-[60]" />);
    const cls = screen.getByTestId('bd').className;
    expect(cls).toMatch(/z-\[60\]/);
    expect(cls).not.toMatch(/z-\[120\]/);
  });

  it('modo absolute para scrim filho de root posicionado', () => {
    render(<ModalBackdrop data-testid="bd" position="absolute" />);
    const cls = screen.getByTestId('bd').className;
    expect(cls).toMatch(/absolute/);
    expect(cls).not.toMatch(/(^|\s)fixed(\s|$)/);
    expect(cls).not.toMatch(/z-\[120\]/);
  });

  it('dispara onClick (fechar) ao clicar no scrim', () => {
    const onClick = jest.fn();
    render(<ModalBackdrop data-testid="bd" onClick={onClick} />);
    fireEvent.click(screen.getByTestId('bd'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('empilha conteúdo (card do modal) sobre o scrim', () => {
    render(
      <ModalBackdrop data-testid="bd">
        <div data-testid="card">conteúdo</div>
      </ModalBackdrop>,
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  // ELO PORTAL — a correção definitiva da cobertura: o overlay FIXO é portado
  // p/ document.body, escapando QUALQUER containing-block ancestral (um pai com
  // transform/filter/will-change escopa `position:fixed` a ele, e o scrim
  // deixava de cobrir header/painéis irmãos — a "linha branca no topo").
  it('overlay FIXO é portado p/ document.body (escapa containing-block ancestral)', () => {
    const { container } = render(
      // ancestral com transform = novo containing block (o gatilho do bug)
      <div style={{ transform: 'translateZ(0)' }}>
        <ModalBackdrop data-testid="bd" />
      </div>,
    );
    const el = screen.getByTestId('bd');
    expect(container).not.toContainElement(el); // NÃO ficou preso à coluna
    expect(el.parentElement).toBe(document.body); // filho DIRETO de <body>
  });

  it('overlay ABSOLUTO NÃO é portado (scrim filho do root posicionado)', () => {
    const { container } = render(<ModalBackdrop data-testid="bd" position="absolute" />);
    expect(container).toContainElement(screen.getByTestId('bd'));
  });

  it('ModalPortal renderiza children direto em document.body', () => {
    const { container } = render(
      <ModalPortal>
        <div data-testid="portaled">x</div>
      </ModalPortal>,
    );
    const el = screen.getByTestId('portaled');
    expect(container).not.toContainElement(el);
    expect(el.parentElement).toBe(document.body);
  });
});
