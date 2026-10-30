import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { createTransferCheckedInstruction, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { intentMemo } from './proof.mjs';
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const memoInstruction = text => new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(text) });
export function transferTransaction(intent, owner) {
  return new Transaction().add(memoInstruction(intentMemo(intent)),
    createTransferCheckedInstruction(new PublicKey(intent.source), new PublicKey(intent.mint), new PublicKey(intent.destination), owner, BigInt(intent.amount), intent.decimals, [], TOKEN_2022_PROGRAM_ID));
}
export function allowedEndpoint(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw Error('unsupported RPC URL');
  if (url.href === 'https://api.devnet.solana.com/') return value;
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return value;
  throw Error('Only localhost or official Solana devnet is allowed');
}
export const PUBLIC_GENESIS_HASHES = Object.freeze([
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'
]);
export function assertLocalGenesis(genesisHash) {
  if (new PublicKey(genesisHash).toBase58() !== genesisHash || PUBLIC_GENESIS_HASHES.includes(genesisHash)) throw Error('public cluster forbidden');
}
