/**
 * Widget catalog parity — backend (source of truth) ↔ frontend registry.
 *
 * The canonical widget catalog lives in the backend
 * (`aegis.workshop.widget_catalog`) and is mirrored to
 * `lib/workshop/widget-catalog.json` (regenerate with:
 *   cd ontology-module && python3 -c "from aegis.workshop import widget_catalog as wc; \
 *     import json; print(json.dumps([e.model_dump() for e in wc.WIDGET_CATALOG], \
 *     ensure_ascii=False, indent=2))" > ../security-app/lib/workshop/widget-catalog.json
 * ).
 *
 * These tests fail the build if the two drift — i.e. a widget gets registered
 * in the frontend without a catalog entry, or vice-versa. That keeps the
 * backend authoritative without a runtime dependency on the live API.
 */
import fs from 'fs';
import path from 'path';

import '@/components/workshop/widgets'; // side-effect: registerWidget for all
import { getRegisteredWidgets } from '@/components/workshop/WorkshopV2Renderer';

interface CatalogEntry {
  type: string;
  label: string;
  category: string;
  proposable: boolean;
  inputs: { name: string; variable_type: string }[];
  outputs: { name: string; variable_type: string }[];
}

function loadCatalog(): CatalogEntry[] {
  const p = path.join(process.cwd(), 'lib', 'workshop', 'widget-catalog.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as CatalogEntry[];
}

describe('widget catalog parity (backend ↔ frontend)', () => {
  const catalog = loadCatalog();
  const catalogTypes = new Set(catalog.map((e) => e.type));
  const registryTypes = new Set(getRegisteredWidgets().map((w) => w.type));

  test('every registered frontend widget has a catalog entry', () => {
    const missing = [...registryTypes].filter((t) => !catalogTypes.has(t)).sort();
    expect(missing).toEqual([]);
  });

  test('every catalog widget is registered in the frontend', () => {
    const orphan = [...catalogTypes].filter((t) => !registryTypes.has(t)).sort();
    expect(orphan).toEqual([]);
  });

  test('catalog uses the five canonical categories', () => {
    const valid = new Set([
      'core_display',
      'visualization',
      'filtering',
      'event_nav',
      'embed',
    ]);
    const bad = catalog.filter((e) => !valid.has(e.category)).map((e) => e.type);
    expect(bad).toEqual([]);
  });

  test('catalog types are unique', () => {
    expect(catalogTypes.size).toBe(catalog.length);
  });
});
