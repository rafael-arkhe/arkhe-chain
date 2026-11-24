// RFC 9421 Ed25519 HTTP Message Signature verifier and test signer for 0x API responses.
// Covers request body binding (`content-digest`;req), response body binding (`content-digest`),
// 60-second freshness window with injectable clock, and local single-use replay prevention.

import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { hash as blake3Hex } from './proof.mjs';

export const DEFAULT_MAX_AGE_SECONDS = 60;
export const DEFAULT_MAX_FUTURE_SKEW_SECONDS = 5;

export const REQUIRED_0X_COMPONENTS = [
  '"@status"',
  '"content-type"',
  '"content-digest"',
  '"@method";req',
  '"@authority";req',
  '"@path";req',
  '"content-digest";req',
];

export function sha256Buffer(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest();
}

export function sha256Hex(bytes) {
  return sha256Buffer(bytes).toString('hex');
}

export function formatContentDigest(bytes) {
  return `sha-256=:${sha256Buffer(bytes).toString('base64')}:`;
}

export function parseContentDigest(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = /^sha-256=:([A-Za-z0-9+/]+={0,2}):$/.exec(headerValue.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== match[1]) return null;
  return decoded;
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

function resolveComponentValue(componentId, request, response) {
  switch (componentId) {
    case '"@status"':
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
        throw new Error('invalid response @status');
      }
      return String(response.status);
    case '"content-type"': {
      const value = getHeader(response.headers, 'content-type');
      if (typeof value !== 'string' || !value.trim()) throw new Error('missing response content-type');
      return value.trim();
    }
    case '"content-digest"': {
      const value = getHeader(response.headers, 'content-digest');
      if (typeof value !== 'string' || !value.trim()) throw new Error('missing response content-digest');
      return value.trim();
    }
    case '"@method";req': {
      if (typeof request.method !== 'string' || !request.method.trim()) throw new Error('missing request @method');
      return request.method.trim().toUpperCase();
    }
    case '"@authority";req': {
      if (typeof request.authority !== 'string' || !request.authority.trim()) throw new Error('missing request @authority');
      return request.authority.trim().toLowerCase();
    }
    case '"@path";req': {
      if (typeof request.path !== 'string' || !request.path.startsWith('/')) throw new Error('missing request @path');
      return request.path;
    }
    case '"@query";req': {
      if (typeof request.query === 'string' && request.query.startsWith('?')) return request.query;
      return '?';
    }
    case '"content-digest";req': {
      const value = getHeader(request.headers, 'content-digest');
      if (typeof value !== 'string' || !value.trim()) throw new Error('missing request content-digest');
      return value.trim();
    }
    default:
      throw new Error(`unsupported RFC 9421 component: ${componentId}`);
  }
}

export function buildSignatureParamsValue(components, params) {
  const list = `(${components.join(' ')})`;
  const parts = [list];
  if (params.created !== undefined) parts.push(`created=${params.created}`);
  if (params.keyid !== undefined) parts.push(`keyid="${params.keyid}"`);
  if (params.alg !== undefined) parts.push(`alg="${params.alg}"`);
  if (params.tag !== undefined) parts.push(`tag="${params.tag}"`);
  return parts.join(';');
}

export function buildSignatureBase(components, paramsValue, request, response) {
  const lines = components.map(id => `${id}: ${resolveComponentValue(id, request, response)}`);
  lines.push(`"@signature-params": ${paramsValue}`);
  return Buffer.from(lines.join('\n'), 'utf8');
}

export function parseSignatureInput(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const trimmed = headerValue.trim();
  const labelMatch = /^([a-z0-9_-]+)=(\(([^)]*)\)(;.+)?)$/.exec(trimmed);
  if (!labelMatch) return null;
  const [, label, paramsValue, innerComponents, rawParams = ''] = labelMatch;
  const components = innerComponents.trim().length ? innerComponents.trim().split(/\s+/) : [];
  if (!components.length) return null;

  const params = {};
  if (rawParams) {
    for (const segment of rawParams.slice(1).split(';')) {
      const eq = segment.indexOf('=');
      if (eq <= 0) return null;
      const key = segment.slice(0, eq).trim();
      const rawVal = segment.slice(eq + 1).trim();
      if (key === 'created') {
        if (!/^[0-9]{1,12}$/.test(rawVal)) return null;
        params.created = Number(rawVal);
      } else if (key === 'keyid' || key === 'alg' || key === 'tag') {
        const strMatch = /^"([^"\\]{1,128})"$/.exec(rawVal);
        if (!strMatch) return null;
        params[key] = strMatch[1];
      } else {
        return null;
      }
    }
  }
  return { label, paramsValue, components, params };
}

export function parseSignatureHeader(headerValue, expectedLabel) {
  if (typeof headerValue !== 'string') return null;
  const trimmed = headerValue.trim();
  const match = /^([a-z0-9_-]+)=:([A-Za-z0-9+/]+={0,2}):$/.exec(trimmed);
  if (!match) return null;
  const [, label, b64] = match;
  if (expectedLabel && label !== expectedLabel) return null;
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== b64) return null;
  return { label, bytes, base64: b64 };
}

export function sign0xHttpResponse({
  request,
  response,
  privateKey,
  keyId,
  created,
  tag = '0x-swap-api',
  label = 'sig',
  components = REQUIRED_0X_COMPONENTS,
}) {
  if (!Number.isSafeInteger(created) || created < 0) throw new Error('invalid created timestamp');
  const reqBodyBytes = Buffer.isBuffer(request.bodyBytes) ? request.bodyBytes : Buffer.from(request.bodyBytes, 'utf8');
  const resBodyBytes = Buffer.isBuffer(response.bodyBytes) ? response.bodyBytes : Buffer.from(response.bodyBytes, 'utf8');

  const requestHeaders = {
    'accept-signature': `${label}=()`,
    'content-type': 'application/json',
    ...request.headers,
    'content-digest': formatContentDigest(reqBodyBytes),
  };
  const responseHeaders = {
    'content-type': 'application/json',
    ...response.headers,
    'content-digest': formatContentDigest(resBodyBytes),
  };

  const normalizedRequest = { ...request, headers: requestHeaders, bodyBytes: reqBodyBytes };
  const normalizedResponse = { ...response, headers: responseHeaders, bodyBytes: resBodyBytes };
  const paramsValue = buildSignatureParamsValue(components, { created, keyid: keyId, alg: 'ed25519', tag });
  const signatureBase = buildSignatureBase(components, paramsValue, normalizedRequest, normalizedResponse);
  const sigBytes = sign(null, signatureBase, privateKey);

  return {
    request: normalizedRequest,
    response: {
      ...normalizedResponse,
      headers: {
        ...responseHeaders,
        'signature-input': `${label}=${paramsValue}`,
        signature: `${label}=:${sigBytes.toString('base64')}:`,
      },
    },
    signatureBase: signatureBase.toString('utf8'),
  };
}

export class SingleUseReplayStore {
  constructor() {
    this.consumed = new Map();
  }
  has(key) {
    return this.consumed.has(key);
  }
  consume(key, metadata) {
    if (this.consumed.has(key)) return false;
    this.consumed.set(key, metadata);
    return true;
  }
}

export function verify0xHttpResponse({
  request,
  response,
  trustedKeys,
  nowUnixSeconds,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  maxFutureSkewSeconds = DEFAULT_MAX_FUTURE_SKEW_SECONDS,
  expectedTag = '0x-swap-api',
  replayStore = null,
}) {
  const reqBodyBytes = Buffer.isBuffer(request.bodyBytes) ? request.bodyBytes : Buffer.from(request.bodyBytes, 'utf8');
  const resBodyBytes = Buffer.isBuffer(response.bodyBytes) ? response.bodyBytes : Buffer.from(response.bodyBytes, 'utf8');
  const requestBodySha256 = sha256Hex(reqBodyBytes);
  const responseBodySha256 = sha256Hex(resBodyBytes);

  const fail = (code, detail, extra = {}) => ({
    ok: false,
    code,
    detail,
    requestBodySha256,
    responseBodySha256,
    nowUnixSeconds,
    ...extra,
  });

  if (!Number.isSafeInteger(nowUnixSeconds) || nowUnixSeconds < 0) {
    return fail('INVALID_CLOCK', 'Clock timestamp must be a non-negative safe integer.');
  }

  // 1. Verify request body matches Content-Digest header
  const reqDigestHeader = getHeader(request.headers, 'content-digest');
  const reqDigestParsed = parseContentDigest(reqDigestHeader);
  if (!reqDigestParsed) {
    return fail('MISSING_OR_INVALID_REQUEST_CONTENT_DIGEST', 'Request lacks a valid sha-256 Content-Digest header.');
  }
  const actualReqDigest = sha256Buffer(reqBodyBytes);
  if (!reqDigestParsed.equals(actualReqDigest)) {
    return fail('REQUEST_BODY_DIGEST_MISMATCH', 'Request body bytes do not match request Content-Digest header.');
  }

  // 2. Verify response body matches Content-Digest header
  const resDigestHeader = getHeader(response.headers, 'content-digest');
  const resDigestParsed = parseContentDigest(resDigestHeader);
  if (!resDigestParsed) {
    return fail('MISSING_OR_INVALID_RESPONSE_CONTENT_DIGEST', 'Response lacks a valid sha-256 Content-Digest header.');
  }
  const actualResDigest = sha256Buffer(resBodyBytes);
  if (!resDigestParsed.equals(actualResDigest)) {
    return fail('RESPONSE_BODY_DIGEST_MISMATCH', 'Response body bytes do not match response Content-Digest header.');
  }

  // 3. Parse Signature-Input and Signature headers
  const sigInputHeader = getHeader(response.headers, 'signature-input');
  const sigHeader = getHeader(response.headers, 'signature');
  const parsedInput = parseSignatureInput(sigInputHeader);
  if (!parsedInput) {
    return fail('INVALID_SIGNATURE_INPUT', 'Missing or malformed RFC 9421 Signature-Input header.');
  }
  const parsedSig = parseSignatureHeader(sigHeader, parsedInput.label);
  if (!parsedSig) {
    return fail('INVALID_SIGNATURE_HEADER', 'Missing or malformed RFC 9421 Signature header.');
  }

  // 4. Verify required covered components (especially request body digest binding)
  const componentSet = new Set(parsedInput.components);
  if (componentSet.size !== parsedInput.components.length) {
    return fail('DUPLICATE_SIGNATURE_COMPONENTS', 'Signature-Input contains duplicate component identifiers.');
  }
  for (const required of REQUIRED_0X_COMPONENTS) {
    if (!componentSet.has(required)) {
      return fail('MISSING_REQUIRED_SIGNED_COMPONENT', `Signature-Input does not cover required component ${required}.`);
    }
  }

  // 5. Verify algorithm, tag, keyid, and freshness window (60s)
  const { created, keyid, alg, tag } = parsedInput.params;
  if (alg !== 'ed25519') {
    return fail('UNSUPPORTED_SIGNATURE_ALG', `Expected alg="ed25519", received "${alg ?? ''}".`);
  }
  if (tag !== expectedTag) {
    return fail('UNEXPECTED_SIGNATURE_TAG', `Expected tag="${expectedTag}", received "${tag ?? ''}".`);
  }
  if (!Number.isSafeInteger(created)) {
    return fail('MISSING_CREATED_TIMESTAMP', 'Signature-Input lacks a valid created timestamp.');
  }
  const ageSeconds = nowUnixSeconds - created;
  if (ageSeconds > maxAgeSeconds) {
    return fail('RESPONSE_SIGNATURE_EXPIRED', `Signature age ${ageSeconds}s exceeds max window of ${maxAgeSeconds}s.`, {
      keyId: keyid ?? null,
      created,
      ageSeconds,
    });
  }
  if (created - nowUnixSeconds > maxFutureSkewSeconds) {
    return fail('RESPONSE_SIGNATURE_FROM_FUTURE', `Signature created ${created} is too far ahead of clock ${nowUnixSeconds}.`, {
      keyId: keyid ?? null,
      created,
      ageSeconds,
    });
  }

  const keyEntry = trustedKeys && keyid ? trustedKeys[keyid] : null;
  if (!keyEntry) {
    return fail('UNTRUSTED_0X_KEY_ID', `Key id "${keyid ?? ''}" is not in the pinned 0x trust store.`, {
      keyId: keyid ?? null,
      created,
      ageSeconds,
    });
  }

  const publicKey = typeof keyEntry === 'string' || Buffer.isBuffer(keyEntry)
    ? createPublicKey(keyEntry)
    : (keyEntry.kty ? createPublicKey({ key: keyEntry, format: 'jwk' }) : keyEntry);

  // 6. Reconstruct canonical RFC 9421 signature base and verify Ed25519 signature
  let signatureBase;
  try {
    signatureBase = buildSignatureBase(parsedInput.components, parsedInput.paramsValue, request, response);
  } catch (error) {
    return fail('SIGNATURE_BASE_ERROR', error.message, { keyId: keyid, created, ageSeconds });
  }

  const valid = verify(null, signatureBase, publicKey, parsedSig.bytes);
  if (!valid) {
    return fail('INVALID_0X_ED25519_SIGNATURE', 'Ed25519 signature verification failed against canonical RFC 9421 base.', {
      keyId: keyid,
      created,
      ageSeconds,
    });
  }

  // 7. Enforce Arkhe local single-use replay guard (within the 60s window)
  const responseSignatureDigest = blake3Hex(
    Buffer.concat([
      Buffer.from('ARKHE:0X-RESPONSE-USE:v1\0'),
      Buffer.from(requestBodySha256, 'utf8'),
      Buffer.from(':'),
      Buffer.from(responseBodySha256, 'utf8'),
      Buffer.from(':'),
      parsedSig.bytes,
    ])
  );

  if (replayStore) {
    const consumed = replayStore.consume(responseSignatureDigest, {
      keyId: keyid,
      created,
      consumedAt: nowUnixSeconds,
    });
    if (!consumed) {
      return fail(
        'RESPONSE_REPLAY_DETECTED',
        'Authentic 0x response was already consumed; Arkhe enforces single-use even inside the 60s window.',
        { keyId: keyid, created, ageSeconds, responseSignatureDigest }
      );
    }
  }

  return {
    ok: true,
    code: 'VALID_0X_SIGNATURE',
    detail: '0x Ed25519 RFC 9421 signature, request/response Content-Digest binding, freshness window, and single-use check passed.',
    requestBodySha256,
    responseBodySha256,
    nowUnixSeconds,
    keyId: keyid,
    created,
    ageSeconds,
    coveredComponents: parsedInput.components,
    responseSignatureDigest,
  };
}
