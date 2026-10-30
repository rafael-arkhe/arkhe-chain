/**
 * /geo — o rótulo é a coisa mais cara do globo, e ninguém suspeita disso.
 *
 * No Cesium um `Label` NÃO é uma primitiva: é um billboard por CARACTERE,
 * mais um de fundo quando `showBackground`. Ligar uma camada de 40k nós com
 * nomes de ~20 caracteres materializava ~880 MIL primitivas de texto de uma
 * vez — o que o operador viu como "milhões de labels brancas" e travamento
 * instantâneo. Estes testes travam as duas defesas: não criar texto onde ele
 * seria ilegível, e não recarregar o mundo a cada micro-movimento de câmera.
 */
import { rectangleToBbox } from '@/components/geo/geo-utils';

describe('bbox do viewport (gatilho de recarga)', () => {
  const deg = (d: number) => (d * Math.PI) / 180;

  it('micro-movimento NÃO gera bbox novo (era o que recriava todas as entidades)', () => {
    // ~1 m de deslocamento: com 5 casas decimais isso virava string nova a
    // cada frame de pan → recarga → globo apagava e reconstruía tudo (o lag e
    // a piscada das camadas 3D).
    const a = rectangleToBbox(deg(-48.05), deg(-23.6), deg(-48.0), deg(-23.55));
    const b = rectangleToBbox(
      deg(-48.05 + 0.000009), deg(-23.6), deg(-48.0), deg(-23.55),
    );
    expect(a).toBe(b);
  });

  it('movimento REAL continua gerando bbox novo (a recarga ainda acontece)', () => {
    const a = rectangleToBbox(deg(-48.05), deg(-23.6), deg(-48.0), deg(-23.55));
    const b = rectangleToBbox(deg(-48.02), deg(-23.6), deg(-47.97), deg(-23.55));
    expect(a).not.toBe(b);
  });

  it('precisão de ~110 m é suficiente para o recorte do mapa', () => {
    const bbox = rectangleToBbox(deg(-48.0512345), deg(-23.6), deg(-48.0), deg(-23.55));
    expect(bbox).toBeTruthy();
    // 3 casas decimais em cada um dos 4 cantos
    for (const parte of bbox!.split(',')) {
      expect(parte.split('.')[1]).toHaveLength(3);
    }
  });
});
