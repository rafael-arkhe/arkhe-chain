"""Offline teaching model, NOT an Arkhe protocol or a production executor.

Only standard-library cryptography is used: SHA-256 and HMAC with fixture keys.
HMAC demonstrates an authenticated relationship between trusted local roles; it
is not a publicly verifiable signature, a hardware attestation, or COSE.
"""
from dataclasses import asdict, dataclass, replace
import hashlib
import hmac
import json
from pathlib import Path
import sqlite3


def canonical(value):
    """Teaching JSON profile: no floats, string keys, UTF-8 without normalization."""
    def check(v):
        if v is None or type(v) in (str, int, bool):
            return
        if isinstance(v, list):
            for x in v:
                check(x)
            return
        if isinstance(v, dict) and all(type(k) is str for k in v):
            for x in v.values():
                check(x)
            return
        raise ValueError('unsupported canonical value')
    check(value)
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def digest(domain, value):
    return hashlib.sha256(domain.encode('ascii') + b'\0' + canonical(value)).hexdigest()


def tag(key, domain, value):
    return hmac.new(key, domain.encode('ascii') + b'\0' + canonical(value), hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class Request:
    tenant: str
    actor: str
    nonce: str
    target: str
    content: str
    costs: tuple

    def operation(self):
        return digest('BOOK:OP:1', [self.tenant, self.actor, self.nonce, self.target])

    def parameters(self):
        return digest('BOOK:PARAMS:1', [self.content, list(self.costs)])

    def identity(self):
        return digest('BOOK:INTENT:1', [self.operation(), self.parameters()])


@dataclass(frozen=True)
class Policy:
    tenant: str = 'tenant-a'
    actor: str = 'publisher'
    target: str = 'internal-reports'
    epoch: int = 1
    limit: int = 100
    max_items: int = 16

    def identity(self):
        return digest('BOOK:POLICY:1', asdict(self))


def prove(costs):
    if not costs or len(costs) > 256:
        raise ValueError('cost count')
    totals = [0]
    for n in costs:
        if type(n) is not int or not 0 <= n < 2**64:
            raise ValueError('cost domain')
        total = totals[-1] + n
        if total >= 2**64:
            raise ValueError('sum overflow')
        totals.append(total)
    return {'costs': list(costs), 'prefix': totals, 'total': totals[-1]}


def check_proof(proof, expected_costs, policy):
    # Independent verification does not call prove(). Strict shape/type checks
    # keep Python bool, which is an int subclass, outside the arithmetic domain.
    if set(proof) != {'costs', 'prefix', 'total'}:
        raise ValueError('proof schema')
    costs, prefix, total = proof['costs'], proof['prefix'], proof['total']
    if not isinstance(costs, list) or not isinstance(prefix, list):
        raise ValueError('proof arrays')
    if costs != list(expected_costs) or not 1 <= len(costs) <= min(policy.max_items, 256):
        raise ValueError('proof input/count')
    if len(prefix) != len(costs) + 1 or any(type(x) is not int for x in prefix):
        raise ValueError('proof derivation')
    if prefix[0] != 0 or type(total) is not int:
        raise ValueError('proof base/total')
    current = 0
    for index, cost in enumerate(costs):
        if type(cost) is not int or not 0 <= cost < 2**64:
            raise ValueError('proof cost domain')
        current += cost
        if current >= 2**64 or prefix[index + 1] != current:
            raise ValueError('proof step/overflow')
    if total != current or current > policy.limit:
        raise ValueError('proof conclusion')
    return digest('BOOK:PROOF:1', proof)


def review(request, policy, key, expires=1000):
    body = {'request': request.identity(), 'policy': policy.identity(), 'expires': expires}
    return {'body': body, 'tag': tag(key, 'BOOK:REVIEW:1', body)}


def authorize(request, policy, proof, approval, key, now, stopped=False):
    if stopped:
        raise ValueError('emergency stop')
    if (request.tenant, request.actor, request.target) != (policy.tenant, policy.actor, policy.target):
        raise ValueError('scope')
    body = approval['body']
    if not hmac.compare_digest(tag(key, 'BOOK:REVIEW:1', body), approval['tag']):
        raise ValueError('review authentication')
    if body['request'] != request.identity() or body['policy'] != policy.identity():
        raise ValueError('review binding')
    if type(now) is not int or type(body['expires']) is not int or not 0 <= now < body['expires']:
        raise ValueError('review time')
    checked = check_proof(proof, request.costs, policy)
    return digest('BOOK:AUTHZ:1', [request.identity(), policy.identity(), checked])


class Journal:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS jobs(op TEXT PRIMARY KEY, binding TEXT NOT NULL, state TEXT NOT NULL, receipt TEXT)')
        self.db.commit()

    def reserve(self, op, binding):
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            old = self.db.execute('SELECT binding,state,receipt FROM jobs WHERE op=?', (op,)).fetchone()
            if old:
                if old[0] != binding:
                    raise ValueError('parameter/policy conflict')
                return old[1], old[2]
            self.db.execute("INSERT INTO jobs VALUES(?,?,'UNCERTAIN',NULL)", (op, binding))
        return 'ACQUIRED', None

    def complete(self, op, binding, receipt):
        with self.db:
            n = self.db.execute("UPDATE jobs SET state='COMPLETED',receipt=? WHERE op=? AND binding=? AND state='UNCERTAIN'", (receipt, op, binding)).rowcount
            if n != 1:
                raise ValueError('completion transition')

    def close(self):
        self.db.close()


class Sink:
    """A local simulated destination, independently persisted from the journal."""
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute('CREATE TABLE IF NOT EXISTS publications(op TEXT PRIMARY KEY, params TEXT, receipt TEXT)')
        self.db.commit()
        self.calls = 0

    def execute(self, request):
        self.calls += 1
        receipt = digest('BOOK:SINK:1', [request.operation(), request.parameters()])
        with self.db:
            old = self.db.execute('SELECT params,receipt FROM publications WHERE op=?', (request.operation(),)).fetchone()
            if old:
                if old[0] != request.parameters():
                    raise ValueError('destination conflict')
                return old[1]
            self.db.execute('INSERT INTO publications VALUES(?,?,?)', (request.operation(), request.parameters(), receipt))
        return receipt

    def count(self):
        return self.db.execute('SELECT count(*) FROM publications').fetchone()[0]

    def close(self):
        self.db.close()


def dispatch(request, policy, proof, approval, key, now, journal, sink, fail_after_effect=False, stopped=False):
    # Reevaluate authority before both first dispatch and receipt replay.
    authorization = authorize(request, policy, proof, approval, key, now, stopped)
    binding = digest('BOOK:DISPATCH:1', [request.parameters(), policy.identity()])
    state, receipt = journal.reserve(request.operation(), binding)
    if state == 'COMPLETED':
        return receipt
    if state != 'ACQUIRED':
        raise ValueError('uncertain: reconciliation required')
    receipt = sink.execute(request)
    if fail_after_effect:
        raise RuntimeError('simulated response loss after destination commit')
    journal.complete(request.operation(), binding, receipt)
    return receipt


def memory_read(value, lineage, allowed_columns):
    """Strict teaching policy: incomplete/unknown lineage is denied, not guessed."""
    if lineage is None or not set(lineage).issubset(set(allowed_columns)):
        raise ValueError('memory lineage denied')
    return value


def validate_chain(events, trusted_head):
    previous = '0' * 64
    for seq, event in enumerate(events):
        if set(event) != {'seq', 'previous', 'kind', 'body', 'hash'}:
            raise ValueError('event schema')
        body = {k: event[k] for k in ('seq', 'previous', 'kind', 'body')}
        if event['seq'] != seq or event['previous'] != previous or event['hash'] != digest('BOOK:EVENT:1', body):
            raise ValueError('event chain')
        previous = event['hash']
    if previous != trusted_head:
        raise ValueError('untrusted final head')
    return True


def event_chain(records):
    events, previous = [], '0' * 64
    for seq, (kind, body) in enumerate(records):
        event = {'seq': seq, 'previous': previous, 'kind': kind, 'body': body}
        event['hash'] = digest('BOOK:EVENT:1', event)
        previous = event['hash']
        events.append(event)
    return events, previous


def main():
    import argparse
    import tempfile
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('book-lab-result.json'))
    args = parser.parse_args()
    key = b'FIXTURE-ONLY: shared reviewer secret, not a production key'
    request = Request('tenant-a', 'publisher', 'request-1', 'internal-reports', 'Reviewed report', (20, 30, 50))
    policy, now = Policy(), 10
    proof = prove(request.costs)
    approval = review(request, policy, key)
    with tempfile.TemporaryDirectory(prefix='arkhe-book-') as folder:
        journal, sink = Journal(str(Path(folder)/'journal.db')), Sink(str(Path(folder)/'destination.db'))
        try:
            first = dispatch(request, policy, proof, approval, key, now, journal, sink)
            replay = dispatch(request, policy, proof, approval, key, now, journal, sink)
            assert first == replay and sink.calls == 1
            events, head = event_chain([('authorization', {'request': request.identity()}), ('local-effect', {'receipt': first})])
            validate_chain(events, head)
            result = {'profile': 'book-publisher-lab/v1', 'synthetic': True,
                      'public_signature_verified': False, 'external_network_calls': 0,
                      'total': proof['total'], 'local_destination_calls': sink.calls,
                      'local_publications': sink.count(), 'replay_receipt_equal': first == replay,
                      'events': events, 'trusted_head_for_this_demo': head}
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
            print(json.dumps({k:v for k,v in result.items() if k != 'events'}, indent=2))
        finally:
            sink.close()
            journal.close()


if __name__ == '__main__':
    main()
