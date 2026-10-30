"""No private-data RAG release until its serving integration has been reviewed."""
import json
from pathlib import Path
policy=json.loads(Path('config/ai-security.json').read_text(encoding='utf-8-sig'))
if policy['privateRagEnabled'] is not False:
    raise SystemExit('FAIL private RAG serving is not approved or implemented')
print('PASS private RAG disabled; authorization and adversarial gates required')
