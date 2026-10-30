import { describe, it, expect, vi, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { SolanaWeb3Service } from './solana-web3.service';
import { base58Decode, base58Encode } from './crypto-utils';
import { memoMessage } from './solana-transaction';

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('Solana: real signatures and no synthetic success', () => {
  it('creates an Ed25519 payer and sends a verifiable signed Memo only once', async () => {
    vi.stubGlobal('crypto', webcrypto);
    sessionStorage.clear();
    const service = new SolanaWeb3Service();
    let submitted = 0;
    let signedBytes = new Uint8Array();
    let commitment = '';
    vi.spyOn(service, 'callRpc').mockImplementation(async (method, params) => {
      if (method === 'getBalance') return { value: 0 } as never;
      if (method === 'getLatestBlockhash') return { value: { blockhash: base58Encode(new Uint8Array(32).fill(4)) } } as never;
      if (method === 'sendTransaction') {
        submitted++;
        signedBytes = Uint8Array.from(atob(params![0] as string), character => character.charCodeAt(0));
        const payer = await crypto.subtle.importKey('raw', new Uint8Array(base58Decode(service.walletState().publicKey!)), 'Ed25519', false, ['verify']);
        expect(await crypto.subtle.verify('Ed25519', payer, signedBytes.slice(1, 65), signedBytes.slice(65))).toBe(true);
        const memo = new TextDecoder().decode(signedBytes.slice(-52));
        expect(new TextDecoder().decode(signedBytes)).toContain('ARKHE:v1:');
        expect(memo.length).toBeGreaterThan(0);
        return base58Encode(signedBytes.slice(1, 65)) as never;
      }
      if (method === 'getSignatureStatuses') return { value: [{ err: null, confirmationStatus: 'finalized' }] } as never;
      if (method === 'getTransaction') return { slot: 10, blockTime: 100, meta: { err: null, fee: 5000 }, transaction: { message: { instructions: [{ programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', parsed: 'ARKHE:v1:' + commitment }] } } } as never;
      throw new Error('Unexpected method ' + method);
    });
    await service.generateNewEphemeralWallet();
    expect(service.walletState().balanceSol).toBe(0);
    commitment = service.computeAnchorCommitment('a'.repeat(64), 'b'.repeat(64)).commitmentBase58;
    const result = await service.anchorToSolana('a'.repeat(64), 'b'.repeat(64));
    expect(result.slot).toBe(10);
    expect(submitted).toBe(1);
    expect(service.anchorProgress().step).toBe('completed');
  });

  it('reports missing transactions and failed airdrops without fabricated balances', async () => {
    sessionStorage.clear();
    const service = new SolanaWeb3Service();
    vi.spyOn(service, 'callRpc').mockResolvedValue(null as never);
    const report = await service.inspectTransaction(base58Encode(new Uint8Array(64).fill(2)), 'expected');
    expect(report.found).toBe(false);
    expect(report.commitmentMatches).toBe(false);
    expect(report.error).toBeTruthy();
    service.walletState.update(state => ({ ...state, connected: true, publicKey: base58Encode(new Uint8Array(32).fill(1)) }));
    vi.spyOn(service, 'callRpc').mockRejectedValue(new Error('offline'));
    await expect(service.requestAirdrop()).rejects.toThrow('offline');
    expect(service.walletState().balanceLamports).toBe(0);
    expect(() => memoMessage('invalid', 'invalid', 'test')).toThrow();
  });

  it('preserves the signed transaction ID after an ambiguous submission without retry', async () => {
    vi.stubGlobal('crypto', webcrypto);
    sessionStorage.clear();
    const service = new SolanaWeb3Service();
    let submissions = 0;
    vi.spyOn(service, 'callRpc').mockImplementation(async method => {
      if (method === 'getBalance') return { value: 0 } as never;
      if (method === 'getLatestBlockhash') return { value: { blockhash: base58Encode(new Uint8Array(32).fill(3)) } } as never;
      if (method === 'sendTransaction') { submissions++; throw new Error('response lost'); }
      throw new Error('Unexpected RPC call after lost response');
    });
    await service.generateNewEphemeralWallet();
    await expect(service.anchorToSolana('a'.repeat(64), 'b'.repeat(64))).rejects.toThrow('response lost');
    expect(submissions).toBe(1);
    expect(service.anchorProgress().step).toBe('error');
    expect(base58Decode(service.anchorProgress().txSignature!).length).toBe(64);
  });
});
