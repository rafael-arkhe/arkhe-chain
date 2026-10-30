using System;
using Arkhe.Shmup.Core;

static class Program
{
    static int count;
    static void Check(bool ok, string label)
    { if (!ok) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }
    static void Near(float a, float b, string label) => Check(Math.Abs(a - b) < 0.0001f, label);

    static void Main()
    {
        var pool = new FixedSlots(2);
        Check(pool.TryRent(out var a) && pool.TryRent(out _), "unique slots can fill capacity");
        Check(!pool.TryRent(out _) && pool.ActiveCount == 2 && pool.Dropped == 1, "exhaustion drops without growth");
        Check(pool.Return(a) && !pool.Return(a), "duplicate return rejected");
        Check(pool.TryRent(out var next) && next.Slot == a.Slot && next.Generation != a.Generation, "recycle changes generation");
        Check(!pool.Return(a) && pool.ActiveCount == 2, "stale callback cannot return a reused slot");
        Check(!pool.Return(new Lease(-1, 1)) && !pool.Return(new Lease(99, 1)), "foreign slot rejected");
        var stress = new FixedSlots(1024);
        bool healthy = true;
        for (int round = 0; round < 10000; round++)
        { healthy &= stress.TryRent(out var lease); healthy &= stress.Return(lease); }
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int round = 0; round < 1000000; round++)
        { healthy &= stress.TryRent(out var lease); healthy &= stress.Return(lease); }
        long bytes = GC.GetAllocatedBytesForCurrentThread() - before;
        Check(healthy && stress.ActiveCount == 0 && stress.Capacity == 1024, "one million lease cycles preserve capacity");
        Check(bytes == 0, "pool core loop allocates zero managed bytes on .NET 8");
        var drag = new RelativeDragState();
        drag.Bounds(-4, -8, 4, 8); drag.Reset(0, -3);
        Check(drag.Begin(7, 0, -5), "first finger captured");
        Check(!drag.Begin(8, 0, 0) && !drag.Move(8, 2, 2), "second finger ignored");
        drag.Move(7, 1, -4);
        Near(drag.TargetX, 1, "horizontal relative delta");
        Near(drag.TargetY, -2, "vertical relative delta without offset drift");
        for (int i = 0; i < 120; i++) drag.Move(7, 1, -4);
        Near(drag.TargetY, -2, "stationary touch never drifts");
        drag.Move(7, 1, -2);
        Check(drag.TargetY >= -2 + drag.Offset, "target remains above finger inside bounds");
        drag.End(8); Check(drag.Pointer == 7, "foreign release ignored");
        drag.End(7); Check(drag.Pointer == int.MinValue, "own release clears pointer");
        drag.Step(0, -3, 1f / 60, out float x, out float y);
        Check(x > 0 && y > -3, "smoothing continues after release");
        Check(Math.Sqrt(x * x + (y + 3) * (y + 3)) <= drag.MaxSpeed / 60 + 0.00001, "speed cap enforced");
        drag.Begin(1, 0, 0); drag.Move(1, 100, 100);
        Check(drag.TargetX == 4 && drag.TargetY == 8, "viewport bounds enforced");
        drag.Cancel(); Check(drag.Pointer == int.MinValue, "focus cancellation");
        var entitlements = new EntitlementSnapshot(new Subscription(200, 20, 3),
            new BattlePass("s1", 100, 0, true), new VipState(500, 2, 1000, 500));
        Check(entitlements.PreviewPoints(630, 100, true) == 2772, "booster plus rewarded plus VIP matches Rust policy");
        Check(entitlements.PreviewPoints(630, 200, false) == 693, "subscription expires exactly at timestamp");
        Check(entitlements.BattlePass.Open(100) && !entitlements.BattlePass.Open(100 + 30 * 86400), "season is half-open 30 day window");
        bool overflow = false;
        try { entitlements.PreviewPoints(ulong.MaxValue, 100, true); } catch (OverflowException) { overflow = true; }
        Check(overflow, "reward overflow fails closed");
        bool rejected = false;
        try { MatchSubmissionGate.Build(null, null, null, null, null, null); }
        catch (InvalidOperationException) { rejected = true; }
        Check(rejected, "missing WASM/codec/signing adapters reject submission");
        var summary = new MatchSummary { SessionId = new byte[32], PlayerId = new byte[32],
            StageSeed = new byte[32], InputDigest = new byte[32], StateHash = new byte[32], SurvivalMs = 1000 };
        rejected = false;
        try { MatchSubmissionGate.Build(summary, new byte[1], new byte[1], new Codec(), new Signer(), new Verifier()); }
        catch (InvalidOperationException) { rejected = true; }
        Check(rejected, "local verifier rejection never produces a signed submission");
        count += GridChecks.Run();
        Console.WriteLine(count + " checks passed. Unity rendering/runtime and device timings NOT tested.");
    }
    sealed class Codec : ICanonicalMatchCodec
    { public byte[] EncodeSigningPayload(MatchSummary summary) => new byte[1]; }
    sealed class Signer : ISessionSigner
    { public byte[] Sign(byte[] bytes) => new byte[64]; }
    sealed class Verifier : ILocalMatchVerifier
    { public bool Verify(byte[] payload, byte[] signature, byte[] ticket, byte[] replay) => false; }
}
