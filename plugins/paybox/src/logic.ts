import * as z from 'zod/v4';
import { atomicAmount } from './paybox.js';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const MAX_PAYMENT_LAMPORTS = 1_000_000_000n;
export function addressBytes(address: string): Buffer {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error('Use a valid public Solana address.');
  let value = 0n;
  for (const character of address) value = value * 58n + BigInt(BASE58.indexOf(character));
  const bytes: number[] = [];
  while (value > 0n) { bytes.unshift(Number(value & 255n)); value >>= 8n; }
  const leading = address.match(/^1*/)?.[0].length ?? 0;
  const result = Buffer.concat([Buffer.alloc(leading), Buffer.from(bytes)]);
  if (result.length !== 32) throw new Error('Public addresses must decode to 32 bytes.');
  return result;
}
export const publicAddress = z.string().min(32).max(44).refine(value => {
  try { addressBytes(value); return value !== SYSTEM_PROGRAM; } catch { return false; }
}, 'Use a public Solana address other than the system program.');
export const splitInput = z.object({
  sender: publicAddress.describe('Chosen PayBox wallet public address; never a private key.'),
  amountSol: z.string().max(20).describe('Positive SOL decimal string, at most nine decimals and 1 SOL.'),
  recipients: z.array(z.object({address: publicAddress, basisPoints: z.number().int().min(1).max(10000)}).strict()).min(1).max(4),
  network: z.literal('solana:mainnet').describe('Real funds. This is independent of Arkhe Devnet records.'),
}).strict();
export type SplitInput = z.infer<typeof splitInput>;
export function allocateSplit(input: SplitInput) {
  splitInput.parse(input);
  const total = BigInt(atomicAmount(input.amountSol, 9));
  if (total <= 0n || total > MAX_PAYMENT_LAMPORTS) throw new Error('Choose more than zero and at most 1 SOL.');
  if (new Set(input.recipients.map(item => item.address)).size !== input.recipients.length) throw new Error('Recipients must be distinct.');
  if (input.recipients.reduce((sum, item) => sum + item.basisPoints, 0) !== 10000) throw new Error('Shares must total 10000 basis points (100%).');
  let allocated = 0n;
  const recipients = input.recipients.map((recipient, index) => {
    const lamports = index === input.recipients.length - 1 ? total - allocated : total * BigInt(recipient.basisPoints) / 10000n;
    if (lamports <= 0n) throw new Error('Each recipient must receive at least one lamport.');
    allocated += lamports;
    return {...recipient, lamports};
  });
  if (allocated !== total) throw new Error('Payment conservation check failed.');
  return {total, recipients};
}

// Legacy Solana wire format, restricted to <=4 native SystemProgram transfers.
// All counts are <128, hence their short-vector encoding is one byte.
export function buildUnsignedSplit(input: SplitInput): string {
  const split = allocateSplit(input);
  const accounts = [input.sender, ...split.recipients.map(item => item.address).filter(address => address !== input.sender), SYSTEM_PROGRAM];
  const programIndex = accounts.length - 1;
  const instructions = split.recipients.map(recipient => {
    const data = Buffer.alloc(12);
    data.writeUInt32LE(2, 0); // SystemInstruction::Transfer
    data.writeBigUInt64LE(recipient.lamports, 4);
    return Buffer.concat([Buffer.from([programIndex, 2, 0, accounts.indexOf(recipient.address), data.length]), data]);
  });
  const message = Buffer.concat([
    Buffer.from([1, 0, 1, accounts.length]), // One signer, payer first; system program read-only.
    ...accounts.map(addressBytes), Buffer.alloc(32), // PayBox supplies a fresh recent blockhash.
    Buffer.from([instructions.length]), ...instructions,
  ]);
  const transaction = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), message]);
  if (transaction.length > 1232) throw new Error('Transaction exceeds the PayBox packet limit.');
  return transaction.toString('base64');
}

export async function boundedJson(url: string, headers: Record<string, string> = {}, fetcher: typeof fetch = fetch): Promise<unknown> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['arkhe.computer','api.github.com'].includes(parsed.hostname) || parsed.port || parsed.username || parsed.password) throw new Error('Network destination is not allowed.');
  const response = await fetcher(url, {headers, redirect:'error', signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error(response.status === 202 ? 'Record confirmation is pending.' : 'The remote service could not complete this lookup.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The service returned no readable response.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) { await reader.cancel(); throw new Error('The service response exceeded the size limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export const signatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
export const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const registration = z.object({
  signature:signatureSchema, verified:z.literal(true), network:z.literal('devnet'), slot:z.number().int().nonnegative(), blockTime:z.number().int().nullable(),
  memo:z.object({domain:z.literal('arkhe.devnet.v1'),schema:z.literal(1),network:z.literal('devnet'),genesis:z.literal(DEVNET_GENESIS),kind:z.literal('register'),owner:publicAddress,hash:fingerprintSchema,algorithm:z.literal('blake3'),title:z.string().min(1).max(80),author:z.string().min(1).max(60),size:z.number().int().nonnegative().max(25*1024*1024)}),
});
export function inspectRegistration(body: unknown, signature: string, fingerprint?: string) {
  const record = registration.parse(body);
  if (record.signature !== signature) throw new Error('The response belongs to a different receipt.');
  return {status:'record_confirmed' as const, network:'devnet' as const, title:record.memo.title, creator:record.memo.author, signer:record.memo.owner, fingerprint:record.memo.hash, comparison:fingerprint === undefined ? 'not_requested' as const : fingerprint === record.memo.hash ? 'match' as const : 'different' as const, receiptUrl:'https://arkhe.computer/certificate/'+signature, evidence:'Arkhe service readback; not independent local chain verification.'};
}
