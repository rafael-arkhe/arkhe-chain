import { memoMessage, signedMemoTransaction } from './solana-transaction';
import {Injectable, signal} from '@angular/core';
import {
  ARKHE_COMMITMENT_DOMAIN,
  ARKHE_MEMO_PREFIX,
  ARKHE_MEMO_PROGRAM_ID,
  OnChainAnchorProgress,
  SOLANA_CLUSTERS,
  SolanaCluster,
  SolanaTxInspection,
  SolanaWalletState
} from '../models/solana.types';
import {base58Decode, base58Encode, hexToBytes, sha256Sync} from './crypto-utils';

interface InjectedSolana {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toBase58: () => string; toString: () => string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58: () => string } }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string }>;
  request?: (request: { method: string; params: { message: string } }) => Promise<{ signature: string }>;
  signMessage?: (msg: Uint8Array) => Promise<{ signature: Uint8Array }>;
}

interface SolanaRawTxResponse {
  slot?: number;
  blockTime?: number;
  meta?: {
    err?: unknown;
    fee?: number;
    logMessages?: string[];
    innerInstructions?: {
      instructions?: {
        programId?: string;
        parsed?: string | { info?: string };
      }[];
    }[];
  };
  transaction?: {
    message?: {
      instructions?: {
        programId?: string;
        parsed?: string | { info?: string };
      }[];
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class SolanaWeb3Service {
  readonly selectedCluster = signal<SolanaCluster>('devnet');
  readonly customRpcUrl = signal<string>('https://api.devnet.solana.com');

  readonly walletState = signal<SolanaWalletState>({
    connected: false,
    connecting: false,
    publicKey: null,
    balanceLamports: 0,
    balanceSol: 0,
    providerType: 'ephemeral',
    walletName: 'None',
    cluster: 'devnet',
    lastUpdated: null,
    error: null
  });

  readonly anchorProgress = signal<OnChainAnchorProgress>({
    active: false,
    step: 'idle',
    stepMessage: 'Awaiting action...',
    txSignature: null,
    commitmentBase58: null,
    memoPayload: null,
    slot: null,
    blockTime: null,
    error: null
  });

  readonly inspectedTx = signal<SolanaTxInspection | null>(null);
  readonly isInspecting = signal<boolean>(false);
  readonly rpcLatencyMs = signal<number | null>(null);

  // Stored ephemeral keypair for testnet exploration without browser extensions
  private ephemeralSecretKey: CryptoKey | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      void this.initStoredEphemeralWallet().catch(error => this.walletState.update(state => ({ ...state, error: String(error) })));
    }
  }

  // --- Cluster Management ---

  getRpcUrl(): string {
    const cluster = this.selectedCluster();
    if (cluster === 'custom') {
      return this.customRpcUrl();
    }
    return SOLANA_CLUSTERS[cluster]?.rpcUrl || 'https://api.devnet.solana.com';
  }

  getExplorerUrl(txSignature: string): string {
    const cluster = this.selectedCluster();
    const tpl = SOLANA_CLUSTERS[cluster]?.explorerUrl || 'https://explorer.solana.com/tx/{sig}?cluster=devnet';
    return tpl.replace('{sig}', txSignature);
  }

  setCluster(cluster: SolanaCluster) {
    this.selectedCluster.set(cluster);
    this.pingCluster();
    if (this.walletState().connected && this.walletState().publicKey) {
      this.refreshBalance();
    }
  }

  setCustomRpcUrl(url: string) {
    this.customRpcUrl.set(url.trim());
    if (this.selectedCluster() === 'custom') {
      this.pingCluster();
    }
  }

  async pingCluster(): Promise<number | null> {
    const startTime = performance.now();
    try {
      await this.callRpc('getSlot', []);
      const latency = Math.round(performance.now() - startTime);
      this.rpcLatencyMs.set(latency);
      return latency;
    } catch {
      this.rpcLatencyMs.set(null);
      return null;
    }
  }

  // --- RPC Communication with Automatic Backend Proxy Fallback ---

  async callRpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const rpcUrl = this.getRpcUrl();
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };

    // Mutations use a single request: a lost response must never cause automatic resubmission.
    if (['sendTransaction', 'requestAirdrop'].includes(method)) {
      const response = await fetch('/api/solana-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rpcUrl, body: payload }), signal: AbortSignal.timeout(15000) });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(json.error?.message || json.error || 'Solana request failed.');
      return json.result as T;
    }

    // First attempt direct call to RPC endpoint
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000)
      });

      if (response.ok) {
        const json = await response.json();
        if (json.error) {
          throw new Error(json.error.message || `RPC Error: ${JSON.stringify(json.error)}`);
        }
        return json.result as T;
      }
    } catch {
      // CORS or network failure: fallback to server-side proxy
    }

    // Proxy fallback through Express backend `/api/solana-proxy`
    const proxyResponse = await fetch('/api/solana-proxy', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        rpcUrl,
        body: payload
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!proxyResponse.ok) {
      throw new Error(`Solana Proxy HTTP ${proxyResponse.status}: ${proxyResponse.statusText}`);
    }

    const proxyJson = await proxyResponse.json();
    if (proxyJson.error) {
      throw new Error(typeof proxyJson.error === 'string' ? proxyJson.error : proxyJson.error.message || 'Solana RPC Error');
    }

    return proxyJson.result as T;
  }

  // --- Wallet Management ---

  private getInjectedProvider(): InjectedSolana | null {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as { solana?: InjectedSolana; phantom?: { solana?: InjectedSolana }; solflare?: InjectedSolana };
    if (win.phantom?.solana) return win.phantom.solana;
    if (win.solana) return win.solana;
    if (win.solflare) return win.solflare;
    return null;
  }

  hasInjectedWallet(): boolean {
    return this.getInjectedProvider() !== null;
  }

  async connectInjectedWallet(): Promise<void> {
    const provider = this.getInjectedProvider();
    if (!provider) {
      throw new Error('No Solana Web3 browser wallet (Phantom / Solflare) detected.');
    }

    this.walletState.update(s => ({...s, connecting: true, error: null}));

    try {
      const resp = await provider.connect();
      const pubkey = resp.publicKey ? resp.publicKey.toBase58() : provider.publicKey?.toBase58() || null;
      if (!pubkey) throw new Error('Failed to retrieve wallet public key.');

      const walletName = provider.isPhantom ? 'Phantom Wallet' : provider.isSolflare ? 'Solflare' : 'Injected Web3';

      this.walletState.set({
        connected: true,
        connecting: false,
        publicKey: pubkey,
        balanceLamports: 0,
        balanceSol: 0,
        providerType: 'injected',
        walletName,
        cluster: this.selectedCluster(),
        lastUpdated: new Date().toISOString(),
        error: null
      });

      await this.refreshBalance();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Wallet connection failed';
      this.walletState.update(s => ({...s, connecting: false, error: msg}));
      throw e;
    }
  }

  async generateNewEphemeralWallet(): Promise<void> {
    if (typeof window === 'undefined') return;
    const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    const publicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    this.ephemeralSecretKey = pair.privateKey;
    const publicKey = base58Encode(publicBytes);
    try {
      sessionStorage.setItem('arkhe_ephemeral_v2', btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)))));
      sessionStorage.setItem('arkhe_ephemeral_v2_pubkey', publicKey);
    } catch { /* The in-memory wallet remains usable without session storage. */ }
    this.walletState.set({ connected: true, connecting: false, publicKey, balanceLamports: 0, balanceSol: 0,
      providerType: 'ephemeral', walletName: 'Carteira Efêmera Devnet', cluster: this.selectedCluster(),
      lastUpdated: new Date().toISOString(), error: null });
    await this.refreshBalance();
  }

  private async initStoredEphemeralWallet(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const savedKey = sessionStorage.getItem('arkhe_ephemeral_v2');
      const publicKey = sessionStorage.getItem('arkhe_ephemeral_v2_pubkey');
      if (savedKey && publicKey) {
        const bytes = Uint8Array.from(atob(savedKey), character => character.charCodeAt(0));
        const privateKey = await crypto.subtle.importKey('pkcs8', bytes, 'Ed25519', true, ['sign']);
        const jwk = await crypto.subtle.exportKey('jwk', privateKey);
        const publicBytes = Uint8Array.from(atob((jwk.x || '').replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
        if (base58Encode(publicBytes) !== publicKey) throw new Error('Stored wallet key mismatch.');
        this.ephemeralSecretKey = privateKey;
        this.walletState.update(state => ({ ...state, connected: true, publicKey, walletName: 'Carteira Efêmera Devnet' }));
        await this.refreshBalance();
      }
    } catch {
      sessionStorage.removeItem('arkhe_ephemeral_v2');
      sessionStorage.removeItem('arkhe_ephemeral_v2_pubkey');
    }
  }

  disconnectWallet(): void {
    this.ephemeralSecretKey = null;
    sessionStorage.removeItem('arkhe_ephemeral_v2');
    sessionStorage.removeItem('arkhe_ephemeral_v2_pubkey');
    const provider = this.getInjectedProvider();
    if (provider && this.walletState().providerType === 'injected') {
      try {
        provider.disconnect();
      } catch {
        // Ignore
      }
    }

    this.walletState.update(s => ({
      ...s,
      connected: false,
      publicKey: null,
      balanceLamports: 0,
      balanceSol: 0,
      error: null
    }));
  }

  async refreshBalance(): Promise<void> {
    const pub = this.walletState().publicKey;
    if (!pub) return;

    try {
      const result = await this.callRpc<{ value: number }>('getBalance', [pub]);
      const lamports = result?.value || 0;
      this.walletState.update(s => ({
        ...s,
        balanceLamports: lamports,
        balanceSol: lamports / 1000000000,
        lastUpdated: new Date().toISOString()
      }));
    } catch (error) {
      this.walletState.update(state => ({ ...state, balanceLamports: 0, balanceSol: 0, error: error instanceof Error ? error.message : 'Saldo indisponível.' }));
    }
  }

  async requestAirdrop(lamports = 1000000000): Promise<string> {
    const pub = this.walletState().publicKey;
    if (!pub) throw new Error('Connect a wallet before requesting an airdrop.');
    if (!['devnet', 'testnet', 'localnet'].includes(this.selectedCluster())) throw new Error('Airdrop disponível apenas em redes de teste.');
    if (!Number.isSafeInteger(lamports) || lamports <= 0 || lamports > 2000000000) throw new Error('Quantidade inválida.');
    const signature = await this.callRpc<string>('requestAirdrop', [pub, lamports]);
    if (!signature || base58Decode(signature).length !== 64) throw new Error('RPC returned an invalid airdrop signature.');
    await this.waitForFinalization(signature);
    await this.refreshBalance();
    return signature;
  }

  private async waitForFinalization(signature: string): Promise<void> {
    for (let attempt = 0; attempt < 45; attempt++) {
      const statuses = await this.callRpc<{ value: ({ err: unknown; confirmationStatus: string } | null)[] }>('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
      const status = statuses.value[0];
      if (status?.err) throw new Error('Transaction failed on chain: ' + JSON.stringify(status.err));
      if (status?.confirmationStatus === 'finalized') return;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Transaction submitted; finalization not confirmed. Inspect the existing signature before retrying.');
  }

  // --- Cryptographic Anchor Computation (Exact Arkhe Protocol) ---

  computeAnchorCommitment(contentHash: string, mmrRoot: string): { commitmentBytes: Uint8Array; commitmentBase58: string; memoText: string } {
    if (!/^[a-f0-9]{64}$/i.test(contentHash) || !/^[a-f0-9]{64}$/i.test(mmrRoot)) throw new Error('Content hash and MMR root must be 32-byte hexadecimal digests.');
    const domainBytes = new TextEncoder().encode(ARKHE_COMMITMENT_DOMAIN);
    const contentBytes = hexToBytes(contentHash);
    const mmrBytes = hexToBytes(mmrRoot);

    const merged = new Uint8Array(domainBytes.length + contentBytes.length + mmrBytes.length);
    merged.set(domainBytes, 0);
    merged.set(contentBytes, domainBytes.length);
    merged.set(mmrBytes, domainBytes.length + contentBytes.length);

    const commitmentHex = sha256Sync(merged);
    const commitmentBytes = hexToBytes(commitmentHex);
    const commitmentBase58 = base58Encode(commitmentBytes);
    const memoText = ARKHE_MEMO_PREFIX + commitmentBase58;

    return {commitmentBytes, commitmentBase58, memoText};
  }

  // --- On-Chain Anchoring Pipeline (Real Solana Devnet + Fallback) ---

  async anchorToSolana(
    contentHash: string,
    mmrRoot: string
  ): Promise<{ signature: string; commitment: string; slot: number; blockTime: number }> {
    if (this.anchorProgress().active) throw new Error('Ancoragem já em andamento.');
    const wallet = this.walletState();
    if (!wallet.connected || !wallet.publicKey) {
      throw new Error('No connected wallet to sign and pay the Solana transaction fee.');
    }

    this.anchorProgress.set({
      active: true,
      step: 'preparing',
      stepMessage: 'Computing canonical cryptographic commitment...',
      txSignature: null,
      commitmentBase58: null,
      memoPayload: null,
      slot: null,
      blockTime: null,
      error: null
    });

    try {
      // Step 1: Compute commitment & memo
      const {commitmentBase58, memoText} = this.computeAnchorCommitment(contentHash, mmrRoot);

      this.anchorProgress.update(p => ({
        ...p,
        step: 'fetching_blockhash',
        stepMessage: 'Fetching latest blockhash from Solana cluster...',
        commitmentBase58,
        memoPayload: memoText
      }));

      if (this.selectedCluster() === 'mainnet-beta' && wallet.providerType === 'ephemeral') {
        throw new Error('Use uma carteira externa para autorizar transações na mainnet.');
      }
      const latest = await this.callRpc<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
      const message = memoMessage(wallet.publicKey!, latest.value.blockhash, memoText);
      this.anchorProgress.update(progress => ({ ...progress, step: 'signing', stepMessage: 'Assinando a transação Memo…' }));
      let signature: string;
      if (wallet.providerType === 'injected') {
        const provider = this.getInjectedProvider();
        if (!provider?.request) throw new Error('Esta carteira não oferece assinatura de transações pelo método request.');
        signature = (await provider.request({ method: 'signAndSendTransaction', params: { message: base58Encode(message) } })).signature;
      } else {
        if (!this.ephemeralSecretKey) throw new Error('Gere uma carteira efêmera antes de assinar.');
        const signed = new Uint8Array(await crypto.subtle.sign('Ed25519', this.ephemeralSecretKey, message));
        const transaction = signedMemoTransaction(message, signed);
        signature = base58Encode(signed);
        // Retain the signature even when the RPC response is lost; do not rebroadcast automatically.
        this.anchorProgress.update(progress => ({ ...progress, txSignature: signature, step: 'broadcasting', stepMessage: 'Enviando transação assinada…' }));
        const result = await this.callRpc<string>('sendTransaction', [btoa(String.fromCharCode(...transaction)), { encoding: 'base64', skipPreflight: false, maxRetries: 0 }]);
        if (result !== signature) throw new Error('RPC returned a different transaction signature.');
      }
      if (base58Decode(signature).length !== 64) throw new Error('Invalid transaction signature.');
      this.anchorProgress.update(progress => ({ ...progress, txSignature: signature, step: 'confirming', stepMessage: 'Aguardando finalização na rede…' }));
      await this.waitForFinalization(signature);
      const inspected = await this.inspectTransaction(signature, commitmentBase58);
      if (!inspected.found || !inspected.commitmentMatches || inspected.err || inspected.slot === null || inspected.blockTime === null) {
        throw new Error('A transação não pôde ser confirmada com o compromisso esperado.');
      }
      this.anchorProgress.update(progress => ({ ...progress, active: false, step: 'completed', stepMessage: 'Transação finalizada e compromisso conferido.', slot: inspected.slot, blockTime: inspected.blockTime }));
      return { signature, commitment: commitmentBase58, slot: inspected.slot, blockTime: inspected.blockTime };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Solana anchoring failed';
      this.anchorProgress.update(p => ({
        ...p,
        active: false,
        step: 'error',
        stepMessage: 'Anchoring error.',
        error: msg
      }));
      throw err;
    }
  }

  // --- Deep On-Chain Transaction Inspector ---

  async inspectTransaction(signature: string, expectedCommitment?: string, generatedAtIso?: string): Promise<SolanaTxInspection> {
    const cleanSig = signature.trim();
    this.isInspecting.set(true);

    const initialResult: SolanaTxInspection = {
      signature: cleanSig,
      cluster: this.selectedCluster(),
      found: false,
      fetching: true,
      error: null,
      slot: null,
      blockTime: null,
      blockTimeIso: null,
      confirmationStatus: null,
      feeLamports: null,
      feeSol: null,
      err: null,
      extractedMemos: [],
      matchedArkheMemo: null,
      extractedCommitment: null,
      expectedCommitment: expectedCommitment || null,
      commitmentMatches: false,
      blockTimeCompliesWithGeneratedAt: false,
      driftSeconds: null,
      driftFormatted: '—',
      programLogs: [],
      rawResult: null
    };

    this.inspectedTx.set(initialResult);

    try {
      // Call getTransaction with jsonParsed
      const tx = await this.callRpc<SolanaRawTxResponse>('getTransaction', [
        cleanSig,
        {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
          commitment: 'finalized'
        }
      ]);

      if (!tx) {
        // Fallback for simulated/synthetic verification
        throw new Error('Transação não encontrada no RPC selecionado.');
      }

      const memos = this.extractMemosFromTx(tx);
      const slot = tx.slot || null;
      const blockTime = tx.blockTime || null;
      const blockTimeIso = blockTime ? new Date(blockTime * 1000).toISOString() : null;
      const feeLamports = tx.meta?.fee ?? null;
      const programLogs = tx.meta?.logMessages || [];

      // Check memos for ARKHE:v1:<commitment>
      let matchedArkheMemo: string | null = null;
      let extractedCommitment: string | null = null;
      for (const m of memos) {
        if (m.startsWith(ARKHE_MEMO_PREFIX)) {
          matchedArkheMemo = m;
          extractedCommitment = m.slice(ARKHE_MEMO_PREFIX.length);
          break;
        }
      }

      const commitmentMatches = !!(expectedCommitment && extractedCommitment && expectedCommitment === extractedCommitment);

      // Check blockTime against generated_at
      let driftSeconds: number | null = null;
      let driftFormatted = '—';
      let compliesWithGen = false;

      if (blockTime && generatedAtIso) {
        try {
          const genEpoch = Math.floor(new Date(generatedAtIso).getTime() / 1000);
          driftSeconds = blockTime - genEpoch;
          compliesWithGen = blockTime >= genEpoch;
          const absDiff = Math.abs(driftSeconds);
          const mins = Math.floor(absDiff / 60);
          const secs = absDiff % 60;
          driftFormatted = `${driftSeconds >= 0 ? '+' : '-'}${mins}m ${secs}s`;
        } catch {
          // Ignore
        }
      }

      const report: SolanaTxInspection = {
        signature: cleanSig,
        cluster: this.selectedCluster(),
        found: true,
        fetching: false,
        error: null,
        slot,
        blockTime,
        blockTimeIso,
        confirmationStatus: 'finalized',
        feeLamports,
        feeSol: feeLamports === null ? null : feeLamports / 1000000000,
        err: tx.meta?.err || null,
        extractedMemos: memos,
        matchedArkheMemo,
        extractedCommitment,
        expectedCommitment: expectedCommitment || null,
        commitmentMatches,
        blockTimeCompliesWithGeneratedAt: compliesWithGen,
        driftSeconds,
        driftFormatted,
        programLogs,
        rawResult: tx
      };

      this.inspectedTx.set(report);
      this.isInspecting.set(false);
      return report;
    } catch (error) {
      const report = { ...initialResult, fetching: false, error: error instanceof Error ? error.message : 'Consulta indisponível.' };
      this.inspectedTx.set(report);
      return report;
    } finally { this.isInspecting.set(false); }
  }

  private extractMemosFromTx(tx: SolanaRawTxResponse | null): string[] {
    const memos: string[] = [];
    if (!tx) return memos;

    const outerIxs = tx.transaction?.message?.instructions || [];
    for (const ix of outerIxs) {
      if (ix.programId === ARKHE_MEMO_PROGRAM_ID) {
        if (typeof ix.parsed === 'string') memos.push(ix.parsed);
        else if (ix.parsed && typeof ix.parsed.info === 'string') memos.push(ix.parsed.info);
      }
    }

    const innerSets = tx.meta?.innerInstructions || [];
    for (const set of innerSets) {
      for (const ix of set.instructions || []) {
        if (ix.programId === ARKHE_MEMO_PROGRAM_ID) {
          if (typeof ix.parsed === 'string') memos.push(ix.parsed);
          else if (ix.parsed && typeof ix.parsed.info === 'string') memos.push(ix.parsed.info);
        }
      }
    }

    return memos;
  }
}
