// Read-only shadow probe against live 0x POST /solana/swap-instructions.
// NEVER persists 0x-api-key, NEVER signs any Solana transaction, NEVER broadcasts.
// Fetches a signed 0x response (Accept-Signature + Content-Digest), verifies its RFC 9421
// Ed25519 signature against 0x's published public key, and saves a sanitized capture to output/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@solana/web3.js';
import { formatContentDigest, parseSignatureInput, verify0xHttpResponse } from './zerox-rfc9421.mjs';

// Published 0x production Ed25519 signing key from docs.0x.org/docs/developer-resources/response-signatures
export const OFFICIAL_0X_JWKS = {
  '0x-signing-key-prod-24092026': {
    kty: 'OKP',
    crv: 'Ed25519',
    kid: '0x-signing-key-prod-24092026',
    x: '19P3C981JsyQsqwVho8Tlabx51rslvdruSH59mGuWn0',
  },
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function fetchLive0xSwapInstructions({ apiKey, bodyObj, version = 'v2' }) {
  const bodyStr = JSON.stringify(bodyObj);
  const bodyBytes = Buffer.from(bodyStr, 'utf8');
  const contentDigest = formatContentDigest(bodyBytes);

  const url = 'https://api.0x.org/solana/swap-instructions';
  const reqHeaders = {
    '0x-api-key': apiKey,
    '0x-version': version,
    'content-type': 'application/json',
    'accept-signature': 'sig=()',
    'content-digest': contentDigest,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: reqHeaders,
    body: bodyBytes,
    signal: AbortSignal.timeout(20_000),
  });

  const resBytes = Buffer.from(await res.arrayBuffer());
  const resHeaders = {};
  for (const [k, v] of res.headers.entries()) {
    resHeaders[k.toLowerCase()] = v;
  }

  // Strip secret apiKey before returning or saving
  const sanitizedReqHeaders = {
    '0x-version': version,
    'content-type': 'application/json',
    'accept-signature': 'sig=()',
    'content-digest': contentDigest,
  };

  return {
    request: {
      method: 'POST',
      authority: 'api.0x.org',
      path: '/solana/swap-instructions',
      query: '?',
      headers: sanitizedReqHeaders,
      bodyBytes,
      bodyObj,
    },
    response: {
      status: res.status,
      headers: resHeaders,
      bodyBytes: resBytes,
      bodyText: resBytes.toString('utf8'),
    },
    capturedAtUnix: Math.floor(Date.now() / 1000),
  };
}

async function main() {
  const apiKey = process.env.ZEROX_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Set ZEROX_API_KEY environment variable (never committed or logged).');
  }

  // Ephemeral deterministic non-funded public key (never signs or submits)
  const taker = Keypair.fromSeed(Buffer.alloc(32, 91)).publicKey.toBase58();

  // Exact live 0x POST /solana/swap-instructions schema (token_in, token_out, amount_in: u64, taker)
  const payload = {
    token_in: WSOL_MINT,
    token_out: USDC_MINT,
    amount_in: 100_000_000, // 0.1 SOL (u64)
    taker,
    slippage_bps: 50,
  };

  const capture = await fetchLive0xSwapInstructions({ apiKey, bodyObj: payload });
  const schemaUsed = 'token_in/token_out/amount_in(u64)';

  const sigInputRaw = capture.response.headers['signature-input'] ?? null;
  const sigRaw = capture.response.headers['signature'] ?? null;
  const parsedSigInput = sigInputRaw ? parseSignatureInput(sigInputRaw) : null;

  let verification = null;
  if (capture.response.status === 200 && sigInputRaw && sigRaw) {
    verification = verify0xHttpResponse({
      request: capture.request,
      response: capture.response,
      trustedKeys: OFFICIAL_0X_JWKS,
      nowUnixSeconds: capture.capturedAtUnix,
      expectedTag: parsedSigInput?.params?.tag ?? '0x-swap-api',
    });
  }

  let parsedBody = null;
  try {
    parsedBody = JSON.parse(capture.response.bodyText);
  } catch {
    parsedBody = null;
  }

  mkdirSync('output', { recursive: true });
  const sanitizedFile = {
    schema: 'arkhe-zerox-live-shadow-capture/v1',
    provenance: '0x-official',
    capturedAtUnix: capture.capturedAtUnix,
    schemaUsed,
    request: {
      method: capture.request.method,
      authority: capture.request.authority,
      path: capture.request.path,
      query: capture.request.query,
      headers: capture.request.headers,
      bodyBase64: capture.request.bodyBytes.toString('base64'),
      bodyObj: capture.request.bodyObj,
    },
    response: {
      status: capture.response.status,
      headers: {
        'content-type': capture.response.headers['content-type'] ?? null,
        'content-digest': capture.response.headers['content-digest'] ?? null,
        'signature-input': sigInputRaw,
        signature: sigRaw,
      },
      bodyBase64: capture.response.bodyBytes.toString('base64'),
    },
    verification,
  };
  writeFileSync('output/zerox-live-capture.json', JSON.stringify(sanitizedFile, null, 2));

  // Summarize without dumping huge binary payloads or any API key
  const summary = {
    httpStatus: capture.response.status,
    schemaUsed,
    capturedAtUnix: capture.capturedAtUnix,
    takerPublicKey: taker,
    returnedHeaders: {
      'content-type': capture.response.headers['content-type'] ?? null,
      'content-digest': capture.response.headers['content-digest'] ?? null,
      'signature-input': sigInputRaw,
      signaturePresent: Boolean(sigRaw),
    },
    parsedSignatureInput: parsedSigInput,
    officialKeyVerification: verification,
    responseTopLevelKeys: parsedBody && typeof parsedBody === 'object' ? Object.keys(parsedBody) : null,
    errorPreview: capture.response.status !== 200 ? capture.response.bodyText.slice(0, 800) : null,
    retryError: capture.retryError ?? null,
    savedSanitizedCapture: 'output/zerox-live-capture.json',
    realSignaturesProduced: 0,
    broadcastCalls: 0,
  };

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
