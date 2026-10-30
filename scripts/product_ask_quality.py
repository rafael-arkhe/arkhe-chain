"""Exercise local pgvector/Kafka integration tests in disposable labelled containers."""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/evidence/2026-10-28-product-quality/ask'
OUT.mkdir(parents=True, exist_ok=True)
engine = ['podman', '--connection', 'arkhe-runtime']
suffix = uuid.uuid4().hex[:12]
pg, kafka = 'arkhe-qa-vector-' + suffix, 'arkhe-qa-kafka-' + suffix
report = {'scope': 'Disposable local pgvector and Kafka. Synthetic embedding/generation; Azure calls excluded.', 'gates': []}


def run(name, command, env=None):
    print('RUN ' + name, flush=True)
    with (OUT / (name + '.log')).open('w', encoding='utf-8') as log:
        result = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    report['gates'].append({'name': name, 'exit_code': result.returncode})
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    if result.returncode:
        raise RuntimeError(name + ' failed; see scoped log')


try:
    run('create-pgvector', engine + ['run', '-d', '--rm', '--name', pg, '--label', 'io.arkhe.quality=20261028',
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'docker.io/pgvector/pgvector:pg16'])
    port = subprocess.check_output(engine + ['port', pg, '5432'], text=True).strip().rsplit(':', 1)[1]
    for _ in range(60):
        if subprocess.run(engine + ['exec', pg, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True).returncode == 0:
            break
        time.sleep(.5)
    else:
        raise RuntimeError('pgvector readiness timeout')
    env = {**os.environ, 'DATABASE_URL': f'postgresql://postgres@127.0.0.1:{port}/postgres',
           'ARKHE_CRASH_EVIDENCE_PATH': str(OUT / 'process-crash.json')}
    for label, test, pattern in [('vector', 'providers', 'pgvector_'), ('tenant-auth', 'auth', ''), ('hybrid', 'hybrid_retrieval', '')]:
        command = ['cargo', 'test', '--locked', '-p', 'arkhe-ask', '--test', test]
        if pattern:
            command.append(pattern)
        run(label, command + ['--', '--ignored', '--nocapture', '--test-threads=1'], env)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        kafka_port = sock.getsockname()[1]
    settings = {
        'CLUSTER_ID': base64.urlsafe_b64encode(uuid.uuid4().bytes).decode().rstrip('='),
        'KAFKA_NODE_ID': '1', 'KAFKA_PROCESS_ROLES': 'broker,controller',
        'KAFKA_LISTENERS': 'INTERNAL://:9092,CONTROLLER://:9093,EXTERNAL://:9094',
        'KAFKA_ADVERTISED_LISTENERS': f'INTERNAL://localhost:9092,EXTERNAL://127.0.0.1:{kafka_port}',
        'KAFKA_LISTENER_SECURITY_PROTOCOL_MAP': 'INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT,EXTERNAL:PLAINTEXT',
        'KAFKA_CONTROLLER_LISTENER_NAMES': 'CONTROLLER', 'KAFKA_INTER_BROKER_LISTENER_NAME': 'INTERNAL',
        'KAFKA_CONTROLLER_QUORUM_VOTERS': '1@localhost:9093', 'KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR': '1',
        'KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR': '1', 'KAFKA_TRANSACTION_STATE_LOG_MIN_ISR': '1',
        'KAFKA_AUTO_CREATE_TOPICS_ENABLE': 'false', 'KAFKA_HEAP_OPTS': '-Xms256m -Xmx512m'
    }
    command = engine + ['run', '-d', '--rm', '--name', kafka, '--label', 'io.arkhe.quality=20261028', '-p', f'127.0.0.1:{kafka_port}:9094']
    for key, value in settings.items():
        command += ['-e', key + '=' + value]
    run('create-kafka', command + ['docker.io/apache/kafka:3.9.1'])
    topics_cli = engine + ['exec', kafka, '/opt/kafka/bin/kafka-topics.sh', '--bootstrap-server', 'localhost:9092']
    for _ in range(45):
        ready = subprocess.run(topics_cli + ['--list'], capture_output=True, timeout=15)
        if ready.returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Kafka readiness timeout')
    env['KAFKA_BROKERS'] = f'127.0.0.1:{kafka_port}'
    for key, kind in [('KAFKA_TEST_TOPIC', 'events'), ('KAFKA_TRACE_TEST_TOPIC', 'trace'), ('KAFKA_CRASH_TEST_TOPIC', 'crash')]:
        topic = 'quality-' + kind + '-' + suffix
        run('topic-' + kind, topics_cli + ['--create', '--topic', topic, '--partitions', '1', '--replication-factor', '1'])
        env[key] = topic
    for target in ['events', 'crash_recovery']:
        run(target, ['cargo', 'test', '--locked', '-p', 'arkhe-ask', '--test', target, '--', '--ignored', '--nocapture', '--test-threads=1'], env)
    report['status'] = 'PASS'
except Exception as error:
    report['status'] = 'FAIL'
    report['error'] = str(error)
    print(error, flush=True)
finally:
    report['cleanup'] = {}
    for name in [kafka, pg]:
        label = subprocess.run(engine + ['inspect', name, '--format', '{{index .Config.Labels "io.arkhe.quality"}}'], capture_output=True, text=True)
        if label.returncode == 0 and label.stdout.strip() == '20261028':
            report['cleanup'][name] = subprocess.run(engine + ['stop', name], capture_output=True).returncode == 0
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
raise SystemExit(0 if report['status'] == 'PASS' else 1)
