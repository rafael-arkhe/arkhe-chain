import assert from 'node:assert/strict';
import test from 'node:test';
import { round } from '../src/round.js';
test('ties go to the even neighbour', () => { assert.equal(round(0.125), 0.12); assert.equal(round(0.375), 0.38); });
test('non-ties round normally', () => { assert.equal(round(1.006), 1.01); });
