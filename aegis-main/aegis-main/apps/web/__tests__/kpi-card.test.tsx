import { render, screen } from '@testing-library/react';
import { KpiCard } from '@/components/painel/kpi-card';
import { resolveFormatColor } from '@/lib/workshop/format-rules';

describe('KpiCard', () => {
  it('renderiza label, valor e delta positivo', () => {
    render(<KpiCard label="BOs · 24h" value={142} delta={8.4} />);
    expect(screen.getByText('BOs · 24h')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('+8.4%')).toBeInTheDocument();
  });

  it('exibe delta negativo sem sinal duplo', () => {
    render(<KpiCard label="Mandados em aberto" value={67} delta={-2.1} />);
    expect(screen.getByText('-2.1%')).toBeInTheDocument();
  });

  it('mostra "—" quando delta é null/undefined', () => {
    render(<KpiCard label="X" value={1} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('aceita hint customizado', () => {
    render(<KpiCard label="Online" value={19} delta={0} hint="agora" />);
    expect(screen.getByText('agora')).toBeInTheDocument();
  });
});

describe('KpiCard · Regras de cor (Backlog #8)', () => {
  // Reproduz a ponte do KpiCardWrapper: resolveFormatColor(value, rules) → valueColor.
  it('colore o número por regra gt → danger', () => {
    const rules = JSON.stringify([{ op: 'gt', threshold: 80, color: 'danger' }]);
    const color = resolveFormatColor(95, rules);
    render(<KpiCard label="Saturação" value={95} valueColor={color} />);
    const num = screen.getByTestId('kpi-value');
    expect(num).toHaveTextContent('95');
    expect(num).toHaveAttribute('data-value-color', 'danger');
    expect(num.className).toContain('text-danger');
  });

  it('colore o número por regra lt → success', () => {
    const rules = JSON.stringify([{ op: 'lt', threshold: 50, color: 'success' }]);
    const color = resolveFormatColor(20, rules);
    render(<KpiCard label="Risco" value={20} valueColor={color} />);
    const num = screen.getByTestId('kpi-value');
    expect(num).toHaveTextContent('20');
    expect(num).toHaveAttribute('data-value-color', 'success');
    expect(num.className).toContain('text-success');
  });

  it('colore o número por regra eq → info', () => {
    const rules = JSON.stringify([{ op: 'eq', threshold: 0, color: 'info' }]);
    const color = resolveFormatColor(0, rules);
    render(<KpiCard label="Pendências" value={0} valueColor={color} />);
    const num = screen.getByTestId('kpi-value');
    expect(num).toHaveTextContent('0');
    expect(num).toHaveAttribute('data-value-color', 'info');
    expect(num.className).toContain('text-info');
  });

  it('sem regra que casa → número sem cor (comportamento atual)', () => {
    const rules = JSON.stringify([{ op: 'gt', threshold: 80, color: 'danger' }]);
    const color = resolveFormatColor(40, rules); // 40 não passa de 80
    render(<KpiCard label="Saturação" value={40} valueColor={color} />);
    const num = screen.getByTestId('kpi-value');
    expect(num).not.toHaveAttribute('data-value-color');
    expect(num.className).not.toContain('text-danger');
  });

  it('sem format_rules (valueColor omitido) → comportamento atual', () => {
    render(<KpiCard label="Total" value={142} delta={8.4} />);
    const num = screen.getByTestId('kpi-value');
    expect(num).not.toHaveAttribute('data-value-color');
    expect(num.className).not.toContain('text-success');
    expect(num.className).not.toContain('text-danger');
    // delta segue colorido pela tendência própria (não afetado pela regra).
    expect(screen.getByText('+8.4%')).toBeInTheDocument();
  });

  it('unavailable tem prioridade sobre a cor da regra', () => {
    render(<KpiCard label="Saturação" value={95} valueColor="danger" unavailable />);
    const num = screen.getByTestId('kpi-value');
    expect(num).toHaveTextContent('—');
    expect(num).not.toHaveAttribute('data-value-color');
    expect(num.className).toContain('text-muted-on-light/70');
    expect(num.className).not.toContain('text-danger');
  });
});
