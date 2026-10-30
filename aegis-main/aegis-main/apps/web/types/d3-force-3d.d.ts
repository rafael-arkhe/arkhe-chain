/**
 * Ambient declaration for `d3-force-3d` — Sprint L9 (2026-05-23).
 *
 * Upstream não publica `.d.ts`. Declaramos só a superfície usada por
 * RedeCanvas e LineageGraphSVG (forceSimulation + forças básicas, 2D/3D).
 */
declare module 'd3-force-3d' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type AnyNode = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type AnyLink = any;

  export interface Simulation<N = AnyNode, L = AnyLink> {
    nodes(): N[];
    nodes(seed: N[]): this;
    force(name: string): unknown;
    force(name: string, force: unknown): this;
    alpha(): number;
    alpha(v: number): this;
    alphaTarget(v?: number): this;
    alphaDecay(): number;
    alphaDecay(v: number): this;
    velocityDecay(v?: number): this;
    restart(): this;
    stop(): this;
    tick(iterations?: number): this;
    on(type: string, listener: () => void): this;
    find(x: number, y: number, radius?: number): N | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }

  export interface ForceLink<N, L> {
    id(accessor: (n: N) => string): this;
    distance(v: number | ((l: L) => number)): this;
    strength(v: number | ((l: L) => number)): this;
    links(): L[];
    links(l: L[]): this;
  }

  export interface ForceManyBody {
    strength(v: number | (() => number)): this;
    distanceMin(v: number): this;
    distanceMax(v: number): this;
  }

  export interface ForceCenter {
    x(v?: number): this;
    y(v?: number): this;
    strength(v?: number): this;
  }

  export interface ForceCollide {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    radius(v: number | ((n: any) => number)): this;
    strength(v: number): this;
    iterations(n: number): this;
  }

  export function forceSimulation<N = AnyNode, L = AnyLink>(
    nodes?: N[],
    numDimensions?: number,
  ): Simulation<N, L>;

  export function forceLink<N = AnyNode, L = AnyLink>(links?: L[]): ForceLink<N, L>;
  export function forceManyBody(): ForceManyBody;
  export function forceCenter(x?: number, y?: number): ForceCenter;
  export function forceCollide(radius?: number | (() => number)): ForceCollide;
  export function forceRadial(radius?: number, x?: number, y?: number): unknown;
  export function forceX(x?: number): unknown;
  export function forceY(y?: number): unknown;
  export function forceZ(z?: number): unknown;
}
