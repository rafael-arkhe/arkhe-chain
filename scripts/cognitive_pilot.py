#!/usr/bin/env python3
"""Bounded local inference pilot. Scores are not evidence of AGI or weight learning."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time
import urllib.request
from urllib.parse import urlsplit


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()


def identity(repo):
    if git(repo, 'status', '--porcelain', '--untracked-files=normal'):
        raise ValueError('source checkout must be clean')
    return {'commit': git(repo, 'rev-parse', 'HEAD'),
            'tree': git(repo, 'rev-parse', 'HEAD^{tree}')}


def validate_endpoint(url):
    p = urlsplit(url)
    if (p.scheme != 'http' or p.hostname != '127.0.0.1' or p.username
            or p.password or p.query or p.fragment or p.path != '/v1'):
        raise ValueError('only http://127.0.0.1:PORT/v1 is allowed')
    if not p.port:
        raise ValueError('explicit port required')
    return url


def cases():
    """Fixed v1 pilot, declared before live scoring. All items must be reported."""
    for a, b in [(2, 1), (3, 2), (4, -1)]:
        examples = ', '.join(f'{x}->{a*x+b}' for x in [1, 2, 3])
        for x in [5, 7]:
            target = str(a*x+b)
            for condition in ['explicit_rule', 'examples', 'transfer']:
                if condition == 'explicit_rule':
                    prompt = f'Rule: y = {a} * x + ({b}). For x={x}, return y.'
                elif condition == 'examples':
                    prompt = f'Use the simplest affine rule in these examples: {examples}. What is the output for {x}?'
                else:
                    prompt = f'A machine follows the simplest affine rule: {examples}. A parcel has input {x}. What output label does the machine assign?'
                yield {'id': f'{a}_{b}_{x}_{condition}', 'condition': condition,
                       'prompt': prompt, 'expected': target}


def payload(case, model):
    return {'model': model, 'messages': [
        {'role': 'system', 'content': 'Return only the signed integer answer, without explanation. /no_think'},
        {'role': 'user', 'content': case['prompt']}],
        'temperature': 0, 'seed': 17, 'max_tokens': 128,
        'stream': False, 'chat_template_kwargs': {'enable_thinking': False}}


def correct_answer(answer, finish, expected):
    return finish == 'stop' and answer.strip() == expected


def infer(endpoint, request):
    body = json.dumps(request).encode()
    req = urllib.request.Request(endpoint + '/chat/completions', data=body,
                                 headers={'Content-Type': 'application/json'})
    # Never follow redirects or inherit HTTP proxy settings for local requests.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=60) as response:
        raw = response.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError('response exceeds 1 MiB')
    data = json.loads(raw)
    choice = data['choices'][0]
    content = choice['message']['content']
    if not isinstance(content, str):
        raise ValueError('missing textual answer')
    return data, content, choice.get('finish_reason')


def run(args):
    repo = Path(__file__).resolve().parents[1]
    source = identity(repo)
    endpoint = validate_endpoint(args.endpoint)
    output = args.output.resolve()
    if output.is_relative_to(repo):
        raise ValueError('output must be outside source checkout')
    if digest(args.weights) != args.weights_sha256:
        raise ValueError('weights SHA256 mismatch')
    binary_hash = digest(args.server_binary)
    if binary_hash != args.server_sha256:
        raise ValueError('server binary SHA256 mismatch')
    output.mkdir(parents=True, exist_ok=False)
    manifest = {'schema': 'arkhe-cognitive-pilot-v1', **source,
        'model': args.model, 'weights_sha256': args.weights_sha256,
        'server_binary_sha256': binary_hash, 'endpoint': endpoint,
        'platform': platform.platform(), 'python': platform.python_version(),
        'limits': {'requests': 18, 'max_tokens_per_request': 128, 'timeout_seconds': 60},
        'claim_limits': ['local backend identity is operator attested',
                         'no weight updates', 'one synthetic affine task family',
                         'no Arkhe cognitive uplift comparison', 'not an AGI evaluation']}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    records = []
    with (output / 'attempts.jsonl').open('x') as log:
        for case in cases():
            request = payload(case, args.model)
            record = {**case, 'request': request, 'correct': False}
            start = time.monotonic()
            log.write(json.dumps({'event': 'started', 'id': case['id']})+'\n')
            log.flush()
            try:
                response, answer, finish = infer(endpoint, request)
                record.update(response=response, answer=answer, finish_reason=finish,
                              correct=correct_answer(answer, finish, case['expected']))
            except Exception as error:
                record['error'] = f'{type(error).__name__}: {error}'
            record['seconds'] = time.monotonic()-start
            records.append(record)
            log.write(json.dumps({'event': 'finished', **record})+'\n')
            log.flush()
    summary = {'source_unchanged': identity(repo) == source,
               'weights_unchanged': digest(args.weights) == args.weights_sha256,
               'server_binary_unchanged': digest(args.server_binary) == binary_hash,
               'conditions': {}}
    for condition in ['explicit_rule', 'examples', 'transfer']:
        group = [r for r in records if r['condition'] == condition]
        summary['conditions'][condition] = {'correct': sum(r['correct'] for r in group),
            'total': len(group), 'errors': sum('error' in r for r in group)}
    summary['attempts_sha256'] = digest(output / 'attempts.jsonl')
    summary['manifest_sha256'] = digest(output / 'manifest.json')
    (output / 'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    print(json.dumps(summary, indent=2))
    return 0 if all(summary[k] for k in ['source_unchanged', 'weights_unchanged', 'server_binary_unchanged']) and not any('error' in r for r in records) else 1


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--endpoint', default='http://127.0.0.1:8087/v1')
    p.add_argument('--model', required=True)
    p.add_argument('--weights', type=Path, required=True)
    p.add_argument('--weights-sha256', required=True)
    p.add_argument('--server-binary', type=Path, required=True)
    p.add_argument('--server-sha256', required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    try:
        return run(args)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        p.exit(1, str(error)+'\n')


if __name__ == '__main__':
    raise SystemExit(main())
