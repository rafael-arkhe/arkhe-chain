import { base58Decode } from './crypto-utils';
import { ARKHE_MEMO_PROGRAM_ID } from '../models/solana.types';

// Legacy message: payer signs, Memo program is the only readonly account.
export function memoMessage(payer: string, blockhash: string, memo: string): Uint8Array<ArrayBuffer> {
  const keys = [base58Decode(payer), base58Decode(ARKHE_MEMO_PROGRAM_ID), base58Decode(blockhash)];
  if (keys.some(key => key.length !== 32)) throw new Error('Invalid Solana public key or blockhash.');
  const data = new TextEncoder().encode(memo);
  if (data.length > 566) throw new Error('Memo exceeds transaction limit.');
  const length: number[] = [];
  let remaining = data.length;
  do { const byte = remaining & 127; remaining >>>= 7; length.push(byte | (remaining ? 128 : 0)); } while (remaining);
  return new Uint8Array([1, 0, 1, 2, ...keys[0], ...keys[1], ...keys[2], 1, 1, 1, 0, ...length, ...data]);
}

export function signedMemoTransaction(message: Uint8Array, signature: Uint8Array): Uint8Array<ArrayBuffer> {
  if (signature.length !== 64) throw new Error('Invalid Ed25519 signature.');
  return new Uint8Array([1, ...signature, ...message]);
}
