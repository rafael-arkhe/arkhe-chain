/**
 * ELO POPOVERS — primitivo FloatingPopover.
 *
 * Cobertura do contrato CRÍTICO (o bug que estava fechando popovers no scroll):
 *   1. fechado → nada no DOM (portal não monta).
 *   2. aberto → renderiza em portal (document.body) com role/aria/testid.
 *   3. SCROLL com target DENTRO do popover → NÃO fecha (deixa a lista rolar).
 *   4. SCROLL fora (window/document) → reposiciona, NÃO fecha.
 *   5. ESC fecha.
 *   6. mousedown FORA (nem popover nem gatilho) fecha; DENTRO não fecha.
 *   7. o corpo rolável tem max-height + overflow-y-auto (não estoura a viewport).
 *   8. foca o 1º item interativo ao abrir.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { FloatingPopover } from '@/components/ui/floating-popover';

function Harness({
  startOpen = true,
  ...rest
}: {
  startOpen?: boolean;
} & Partial<React.ComponentProps<typeof FloatingPopover>>) {
  const [open, setOpen] = React.useState(startOpen);
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={anchorRef} data-testid="trigger" onClick={() => setOpen((v) => !v)}>
        abrir
      </button>
      <FloatingPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        role="menu"
        ariaLabel="menu de teste"
        testId="fp"
        bodyTestId="fp-body"
        {...rest}
      >
        <button data-testid="fp-item-1">item 1</button>
        <button data-testid="fp-item-2">item 2</button>
      </FloatingPopover>
    </div>
  );
}

test('1. fechado → nada no DOM (portal não monta)', () => {
  render(<Harness startOpen={false} />);
  expect(screen.queryByTestId('fp')).toBeNull();
  expect(screen.queryByTestId('fp-item-1')).toBeNull();
});

test('2. aberto → portal em document.body com role/aria/testid', () => {
  render(<Harness />);
  const pop = screen.getByTestId('fp');
  expect(pop).toBeInTheDocument();
  expect(pop).toHaveAttribute('role', 'menu');
  expect(pop).toHaveAttribute('aria-label', 'menu de teste');
  // portado para o body (fora da árvore do componente).
  expect(pop.parentElement).toBe(document.body);
});

test('3. SCROLL com target DENTRO do popover NÃO fecha', () => {
  render(<Harness />);
  const body = screen.getByTestId('fp-body');
  expect(screen.getByTestId('fp')).toBeInTheDocument();
  // dispatch capturável: target = elemento DENTRO do popover.
  fireEvent.scroll(body);
  // ainda aberto — a lista pode rolar livremente.
  expect(screen.getByTestId('fp')).toBeInTheDocument();
  // também ao rolar um item interno.
  fireEvent.scroll(screen.getByTestId('fp-item-1'));
  expect(screen.getByTestId('fp')).toBeInTheDocument();
});

test('4. SCROLL fora (window) reposiciona e NÃO fecha', () => {
  render(<Harness />);
  expect(screen.getByTestId('fp')).toBeInTheDocument();
  // scroll de um ancestral arbitrário (fora do popover) → reposiciona, não fecha.
  const outside = document.createElement('div');
  document.body.appendChild(outside);
  fireEvent.scroll(outside);
  expect(screen.getByTestId('fp')).toBeInTheDocument();
  // scroll no window/document também não fecha.
  fireEvent.scroll(window);
  expect(screen.getByTestId('fp')).toBeInTheDocument();
  document.body.removeChild(outside);
});

test('5. ESC fecha', () => {
  render(<Harness />);
  expect(screen.getByTestId('fp')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByTestId('fp')).toBeNull();
});

test('6. mousedown FORA fecha; DENTRO não fecha', () => {
  render(<Harness />);
  // clique DENTRO não fecha.
  fireEvent.mouseDown(screen.getByTestId('fp-item-1'));
  expect(screen.getByTestId('fp')).toBeInTheDocument();
  // clique no gatilho não fecha pela lógica do popover.
  fireEvent.mouseDown(screen.getByTestId('trigger'));
  expect(screen.getByTestId('fp')).toBeInTheDocument();
  // clique FORA (nem popover, nem gatilho) fecha.
  fireEvent.mouseDown(document.body);
  expect(screen.queryByTestId('fp')).toBeNull();
});

test('7. corpo rolável tem max-height + overflow-y-auto', () => {
  render(<Harness maxHeight="min(70vh, 520px)" />);
  const pop = screen.getByTestId('fp');
  // a altura máxima vive no container (cap da viewport).
  expect(pop.style.maxHeight).toBe('min(70vh, 520px)');
  // o corpo recebe o scroll.
  const body = screen.getByTestId('fp-body');
  expect(body.className).toMatch(/overflow-y-auto/);
});

test('8. foca o 1º item interativo ao abrir', () => {
  render(<Harness />);
  expect(screen.getByTestId('fp-item-1')).toHaveFocus();
});

test('9. autoFocus=false NÃO rouba o foco', () => {
  render(<Harness autoFocus={false} />);
  expect(screen.getByTestId('fp-item-1')).not.toHaveFocus();
});

test('10. header não-rolável renderiza ACIMA do corpo', () => {
  render(
    <Harness
      header={<div data-testid="fp-header">cabeçalho fixo</div>}
    />,
  );
  expect(screen.getByTestId('fp-header')).toBeInTheDocument();
  // header fora do corpo rolável.
  const body = screen.getByTestId('fp-body');
  expect(body.contains(screen.getByTestId('fp-header'))).toBe(false);
});
