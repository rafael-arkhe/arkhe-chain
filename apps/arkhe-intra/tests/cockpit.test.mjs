import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYERS, cascade, gateState, proofVerdict, triadState } from '../lib/cockpit.mjs';

test('layers follow the architecture and only L2/L3 hold authority', () => {
  assert.deepEqual(LAYERS.map((l) => l.id), ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9']);
  assert.deepEqual(LAYERS.filter((l) => l.authority).map((l) => l.id), ['L2', 'L3']);
});

test('a refuted layer blocks every layer above it, not below', () => {
  const rows = cascade({ L0: 'LEMMA', L1: 'LEMMA', L2: 'REFUTED', L3: 'LEMMA', L8: 'LEMMA' });
  assert.deepEqual(rows.slice(0, 3).map((r) => r.blockedBy), [null, null, null]);
  assert.ok(rows.slice(3).every((r) => r.blockedBy === 'L2'));
});

test('missing or unknown layer states are PENDING, never LEMMA', () => {
  const rows = cascade({ L0: 'ok', L1: undefined });
  assert.ok(rows.every((r) => r.tau === 'PENDING'));
  assert.ok(rows.every((r) => r.blockedBy === null));
});

test('proof verdict: any failure rejects', () => {
  const v = proofVerdict([
    { id: 'mmr', title: 'MMR', status: 'pass' },
    { id: 'sig', title: 'Assinaturas', status: 'fail' },
    { id: 'blake3', title: 'BLAKE3', status: 'pending' },
  ]);
  assert.equal(v.verdict, 'Rejected');
  assert.equal(v.reason, 'Refuted{sig}');
});

test('proof verdict: required pending, skipped or unknown steps are incomplete', () => {
  for (const status of ['pending', 'skipped', 'maybe']) {
    const v = proofVerdict([{ id: 'a', title: 'A', status: 'pass' }, { id: 'b', title: 'B', status }]);
    assert.equal(v.verdict, 'Incomplete', status);
    assert.equal(v.reason, 'Incomplete{b}');
  }
  assert.equal(proofVerdict([]).verdict, 'Incomplete');
});

test('proof verdict: only an optional step may be skipped', () => {
  const v = proofVerdict([
    { id: 'a', title: 'A', status: 'pass' },
    { id: 'nix', title: 'Rebuild', status: 'skipped', optional: true },
  ]);
  assert.equal(v.verdict, 'Verified');
  assert.equal(proofVerdict([{ id: 'nix', title: 'R', status: 'pending', optional: true }]).verdict, 'Incomplete');
});

test('gate enables only on ok === true and always names the reason otherwise', () => {
  assert.deepEqual(gateState({ ok: true }), { enabled: true, reason: null });
  assert.equal(gateState({ ok: false, kind: 'Refuted', detail: 'split-view' }).reason, 'Refuted{split-view}');
  for (const bad of [null, undefined, {}, { ok: 'true' }, { ok: 1 }, { ok: false, kind: 'Allow' }]) {
    const g = gateState(bad);
    assert.equal(g.enabled, false, JSON.stringify(bad));
    assert.match(g.reason, /^(Incomplete|Refuted|Pending)\{.+\}$/);
  }
});

test('triad downgrades an unsupported LEMMA and rejects impossible numbers', () => {
  assert.deepEqual(triadState({ have: 2, need: 3, tau: 'LEMMA' }), { tau: 'CONJECTURE', fraction: 2 / 3, label: '2/3' });
  assert.equal(triadState({ have: 3, need: 3, tau: 'LEMMA' }).tau, 'LEMMA');
  assert.equal(triadState({ have: 5, need: 3, tau: 'LEMMA' }).fraction, 1);
  for (const bad of [{ have: 1, need: 0 }, { have: -1, need: 2 }, { have: 1.5, need: 2 }]) {
    assert.equal(triadState({ ...bad, tau: 'LEMMA' }).tau, 'PENDING');
  }
});
