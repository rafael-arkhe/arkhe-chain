# Cognitive inference pilot v1

This pilot opens an inference path without a cloud account. It evaluates a local
model, not a model trained by Arkhe. The existing delegated audit remains a
separate fixed workflow. No inference result grants permission or submits a
transaction. There is no tool execution, training, retention experiment, or
measurement of the cognitive uplift of Arkhe in this version.

## Invariants, threats, enforcement, verification

| Property | Failure | Enforcement | Check |
| --- | --- | --- | --- |
| Clean identical source commit and tree before/after | Wrong source attribution | Git validation | Manifest and summary |
| Expected labels excluded from model requests | Answer leakage | Request builder receives only prompt text | Mutating labels leaves payload identical |
| Every started attempt is visible | Survivorship bias | Append started/finished events and flush each | Require 18 finished records for complete run |
| Fixed generation limits | Unfair comparisons | 128 tokens, seed 17, temperature 0, one call/item, 60-second timeout | Inspect recorded requests |
| Local endpoint only | Unexpected cloud spend or data transmission | Exact loopback IPv4, HTTP, explicit port, no credentials, redirects or proxies | Endpoint rejection tests |
| Pinned files | Accidental model/server replacement | SHA256 before and after | CLI pins and summary |

The running server identity is operator-attested. Hashing files does not prove
that a process loaded those files. Shared libraries, chat template, hardware,
and runtime can affect results. This is not remote attestation or guaranteed
bitwise reproducibility. Local processes can read the evaluation files, so this
is not an adversarial isolation boundary. Started events allow detection of an
interrupted run, not power-loss durability. A missing summary means incomplete.

## Preregistered narrow protocol

18 independent stateless requests, six per condition, in a fixed order:

1. Explicit affine rule: arithmetic/instruction baseline.
2. Examples only: infer the simplest affine rule from three examples.
3. Transfer: same rule/examples/query, parcel-label wording.

Rules: `(a,b) = (2,1), (3,2), (4,-1)`. Example inputs: 1,2,3.
Reserved query inputs: 5,7. All are declared in code before live scoring.
These are synthetic probes, not a secret benchmark. The labels are generated
deterministically by arithmetic, separately from requests. Each answer must be
an exact integer string after trimming whitespace, with finish reason `stop`.
Truncated, malformed and failed responses remain incorrect in the denominator.
Raw response JSON, prompts, labels, latencies and errors are retained.

This measures narrow few-shot rule induction and a wording-transfer probe.
It does not establish improvement through experience, weight learning, memory
retention, independence from pretraining, or broad generality. Sample size six
per condition cannot support a strong capability claim. Conditions have the same
output cap, but input token lengths differ and must be included in cost analysis.

## Pinned local backend

- llama.cpp release `b12282`, official Ubuntu x64 archive.
- Archive SHA256: `26f7e67260769ea02db1972b0536cc881b5f13fc30a1caecd8cb3f070c9d5200`.
- Model: `Qwen/Qwen3-0.6B-GGUF`, revision `23749fefcc72300e3a2ad315e1317431b06b590a`.
- File: `Qwen3-0.6B-Q8_0.gguf`, 639446688 bytes.
- Weights SHA256: `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`.
- Model license metadata: Apache-2.0. Preserve upstream license when distributing.

Download from the official repositories, verify the archive digest before
extracting, and keep runtime files outside the checkout. Start the extracted
server with the exact model file, loopback only:

```sh
llama-server -m /absolute/runtime/Qwen3-0.6B-Q8_0.gguf --alias arkhe-pilot \
  --host 127.0.0.1 --port 8087 -c 2048 -t 2 -ngl 0 --jinja
```

Record server command, startup log and binary SHA256. Run from a clean source
commit using Python 3.12+, no third-party Python dependency:

```sh
python -B -m unittest discover -s tests -p test_cognitive_pilot.py -v
python -B scripts/cognitive_pilot.py --model arkhe-pilot \
  --weights /absolute/runtime/Qwen3-0.6B-Q8_0.gguf \
  --weights-sha256 9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031 \
  --server-binary /absolute/runtime/llama-server \
  --server-sha256 SHA256_OF_EXTRACTED_BINARY --output /absolute/evidence/fresh-run
```

Exit zero means the run completed without transport errors and identity checks
passed. It does not mean all answers were correct. Inspect `summary.json`.

## How to audit this code

Check `identity` for clean source enforcement, `validate_endpoint` and `infer`
for network restrictions, `cases` for the declared tasks, `payload` for label
separation and fixed limits, and `run` for records, hashes and denominators.
Recompute exact scores from finished events in `attempts.jsonl`. Confirm there
are 18 starts and 18 finishes with unique matching IDs. Check all identity flags.
Compare the manifest commit/tree to the published source. File hashes establish
integrity only relative to a trusted copy of the summary.

For later studies, freeze separate multi-family held-out tasks and compare the
same model alone, with tools, and with the full Arkhe system under explicit
token/time/tool budgets. Test memory with session resets and ablation. Test
weight learning only with actual training, held-out evaluation and forgetting
measurements. Inspect can host local/OpenAI-compatible evaluations:

- https://inspect.aisi.org.uk/providers
- https://github.com/ggml-org/llama.cpp/tree/b12282/tools/server
- https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/tree/23749fefcc72300e3a2ad315e1317431b06b590a
