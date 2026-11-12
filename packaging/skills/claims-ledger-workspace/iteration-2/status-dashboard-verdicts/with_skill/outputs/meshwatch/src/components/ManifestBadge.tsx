import { useEffect, useState } from 'react';
import { verifyManifest } from '../lib/verify';

export function ManifestBadge({ manifest, signature, publicKey }: { manifest: Uint8Array; signature: Uint8Array; publicKey: CryptoKey }) {
  const [valid, setValid] = useState<boolean | null>(null);
  useEffect(() => { verifyManifest(manifest, signature, publicKey).then(setValid); }, [manifest, signature, publicKey]);
  if (valid === null) return <span className="badge grey">Manifest: checking…</span>;
  return valid
    ? <span className="badge green">Manifest: VERIFIED</span>
    : <span className="badge red">Manifest: INVALID SIGNATURE</span>;
}
