/**
 * Type augmentation for Cesium side-effect imports.
 *
 * Cesium 1.x ships its own complete typings (package "types":
 * ./Source/Cesium.d.ts), so the runtime module `import * as Cesium from
 * 'cesium'` is fully typed without `@types/cesium`. The ONLY thing the
 * compiler can't resolve is the CSS side-effect import used to inject the
 * Cesium widget styles:
 *
 *   await import('cesium/Build/Cesium/Widgets/widgets.css');
 *
 * Next.js handles the CSS at bundle time; here we just declare it so
 * `tsc --noEmit` doesn't flag TS2307. Declared narrowly (exact path) to
 * avoid swallowing other unrelated module-resolution errors.
 */
declare module 'cesium/Build/Cesium/Widgets/widgets.css';
