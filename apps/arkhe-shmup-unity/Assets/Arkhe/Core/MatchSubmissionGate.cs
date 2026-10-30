using System;

namespace Arkhe.Shmup.Core
{
    // Proposed transport boundary. This is NOT an implementation of arkhe-verify's ABI.
    public sealed class MatchSummary
    {
        public byte Version = 1;
        public byte[] SessionId, PlayerId, StageSeed, InputDigest, StateHash;
        public uint SurvivalMs, ProjectilesAbsorbed;
        public ushort WavesCleared, BossesDefeated;
        public ulong FinalScore;
    }

    public interface ICanonicalMatchCodec
    {
        // Domain-separated, versioned AKG-CBOR encoding EXCLUDING client_sig.
        // state_hash commits simulation state, never this summary itself.
        byte[] EncodeSigningPayload(MatchSummary summary);
    }

    public interface ISessionSigner
    {
        // Private key generated/held on device; backend registers public key with challenge.
        byte[] Sign(byte[] signingPayload);
    }

    public interface ILocalMatchVerifier
    {
        // Checks server ticket, seed, input digest, state commitment and session signature.
        // Native/WASM implementation required. Unsupported versions/traps return false.
        bool Verify(byte[] signingPayload, byte[] signature, byte[] ticket, byte[] replay);
    }

    public sealed class SignedMatch
    {
        public readonly byte[] Payload;
        public readonly byte[] Signature;
        public SignedMatch(byte[] payload, byte[] signature) { Payload = payload; Signature = signature; }
    }

    public static class MatchSubmissionGate
    {
        // No networking or credits. All adapters absent -> reject, never fabricate a proof.
        public static SignedMatch Build(MatchSummary summary, byte[] ticket, byte[] replay,
            ICanonicalMatchCodec codec, ISessionSigner signer, ILocalMatchVerifier verifier)
        {
            if (summary == null || codec == null || signer == null || verifier == null)
                throw new InvalidOperationException("Match verification adapters unavailable");
            if (summary.Version != 1 || !Digest(summary.SessionId) || !Digest(summary.PlayerId)
                || !Digest(summary.StageSeed) || !Digest(summary.InputDigest) || !Digest(summary.StateHash)
                || summary.SurvivalMs == 0 || summary.SurvivalMs > 1800000
                || ticket == null || ticket.Length == 0 || ticket.Length > 16384
                || replay == null || replay.Length == 0 || replay.Length > 4000000)
                throw new ArgumentException("Invalid match envelope");
            byte[] payload = codec.EncodeSigningPayload(summary);
            if (payload == null || payload.Length == 0 || payload.Length > 16384)
                throw new InvalidOperationException("Invalid canonical payload");
            byte[] signature = signer.Sign(payload);
            if (signature == null || signature.Length != 64 || !verifier.Verify(payload, signature, ticket, replay))
                throw new InvalidOperationException("Match is not locally verifiable");
            return new SignedMatch(payload, signature);
        }
        static bool Digest(byte[] bytes) => bytes != null && bytes.Length == 32;
    }
}
