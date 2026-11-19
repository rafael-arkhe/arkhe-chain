import test from 'node:test';
import assert from 'node:assert/strict';
import { externalRelease, pilotCriteria, qualifications } from '../lib/govtech-gates.mjs';

test('os gates do GovTech recusam efeito externo', () => {
  assert.equal(qualifications.length, 5);
  assert.equal(pilotCriteria.length, 5);
  assert.equal(qualifications.every(item => item.status === 'pending'), true);
  assert.equal(externalRelease().released, false);
  assert.equal(new Set(pilotCriteria.map(item => item.id)).size, 5);
});
