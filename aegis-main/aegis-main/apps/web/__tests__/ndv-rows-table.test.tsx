/**
 * F8.2b+c — NdvRowsTable: busca nas linhas + paging [1,10,25,50,100] + hover
 * de linha (alimenta o preview de token). Paridade n8n §4.
 */
import { render, screen, fireEvent } from '@testing-library/react';

import { NdvRowsTable, filterRows } from '@/components/dados/ndv-rows-table';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

const ROWS = Array.from({ length: 30 }, (_, i) => ({ g: `G${i + 1}`, cidade: i % 2 ? 'Sorocaba' : 'Itu' }));

describe('filterRows', () => {
  it('substring case-insensitive em qualquer valor; vazio = tudo', () => {
    expect(filterRows(ROWS, '')).toHaveLength(30);
    expect(filterRows(ROWS, 'soroca')).toHaveLength(15);
    expect(filterRows(ROWS, 'G3')).toHaveLength(2); // G3 e G30
    expect(filterRows(ROWS, 'zzz')).toHaveLength(0);
  });
});

describe('NdvRowsTable', () => {
  it('default 25 por página; pager navega; contagem honesta', () => {
    render(<NdvRowsTable cols={['g', 'cidade']} rows={ROWS} testid="tb" />);
    expect(screen.getByTestId('tb-row-0')).toBeInTheDocument();
    expect(screen.queryByTestId('tb-row-25')).not.toBeInTheDocument();
    expect(screen.getByTestId('tb-page')).toHaveTextContent('1/2');
    fireEvent.click(screen.getByTestId('tb-next'));
    expect(screen.getByTestId('tb-row-25')).toBeInTheDocument();
    expect(screen.getByTestId('tb-count')).toHaveTextContent('30');
  });

  it('busca filtra + reseta página; page size muda o corte', () => {
    render(<NdvRowsTable cols={['g', 'cidade']} rows={ROWS} testid="tb" />);
    fireEvent.click(screen.getByTestId('tb-next')); // página 2
    fireEvent.change(screen.getByTestId('tb-search'), { target: { value: 'itu' } });
    expect(screen.getByTestId('tb-count')).toHaveTextContent('15/30');
    expect(screen.getByTestId('tb-row-0')).toBeInTheDocument(); // voltou pra pág 1
    fireEvent.change(screen.getByTestId('tb-pagesize'), { target: { value: '10' } });
    expect(screen.getByTestId('tb-page')).toHaveTextContent('1/2');
    fireEvent.change(screen.getByTestId('tb-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('tb-empty')).toBeInTheDocument();
  });

  it('inc4: renderiza TODAS as colunas (sem cap de 8) — data-table nível n8n', () => {
    const cols = Array.from({ length: 14 }, (_, i) => `c${i}`);
    const row = Object.fromEntries(cols.map((c) => [c, `v${c}`]));
    render(<NdvRowsTable cols={cols} rows={[row]} testid="tb" />);
    const headers = screen.getByTestId('tb-table').querySelectorAll('thead th');
    expect(headers).toHaveLength(14); // antes: capado em 8 (bug do NDV)
    // célula larga truncada guarda o valor cheio no title (hover revela).
    const cells = screen.getByTestId('tb-table').querySelectorAll('tbody td');
    expect(cells[0]).toHaveAttribute('title', 'vc0');
  });

  it('hover na linha emite a LINHA (e null ao sair da tabela)', () => {
    const onHover = jest.fn();
    render(<NdvRowsTable cols={['g']} rows={ROWS} testid="tb" onHoverRow={onHover} />);
    fireEvent.mouseEnter(screen.getByTestId('tb-row-1'));
    expect(onHover).toHaveBeenCalledWith(ROWS[1]);
    fireEvent.mouseLeave(screen.getByTestId('tb-row-1').parentElement!);
    expect(onHover).toHaveBeenCalledWith(null);
  });
});
