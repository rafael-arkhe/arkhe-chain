using System;
using Arkhe.Shmup.Core;

static class GridChecks
{
    public static int Run()
    {
        int checks = 0;
        void Check(bool ok, string label)
        { if (!ok) throw new Exception(label); checks++; Console.WriteLine("PASS grid: " + label); }
        var grid = new SpatialCircleGrid(16, 16, 64, 0.5f, -8, -8, 8, 8);
        Check(grid.Insert(0, 0.1f, 0, 0.3f, 1), "insert target");
        Check(grid.FirstHit(-0.2f, 0, -0.2f, 0, 0.05f, 1, out _) == 0, "neighbor-cell overlap");
        Check(grid.FirstHit(-7, 0, 7, 0, 0.01f, 1, out float t) == 0 && t > 0 && t < 1, "sweep prevents fast-shot tunneling");
        Check(grid.FirstHit(0.1f, 0, 0.1f, 0, 0, 1, out t) == 0 && t == 0, "zero-length segment inside target");
        Check(grid.FirstHit(1, 1, 1, 1, 0, 1, out _) == -1, "zero-length segment outside target");
        Check(grid.FirstHit(-7, 0, 7, 0, 0, 2, out _) == -1, "collision layer mask");
        Check(!grid.Insert(0, 1, 1, 0.2f, 1) && grid.Count == 1, "duplicate insertion rejected");
        Check(!grid.Insert(64, 0, 0, 0.2f, 1) && !grid.Insert(1, 9, 0, 0.2f, 1), "capacity and world bounds enforced");
        Check(!grid.Insert(1, 0, 0, 0.6f, 1) && !grid.Insert(1, float.NaN, 0, 0.1f, 1), "unsupported radius and NaN rejected");
        Check(grid.FirstHit(float.PositiveInfinity, 0, 0, 0, 0, 1, out _) == -1, "invalid query rejected");
        grid.Insert(1, -4, 0, 0.2f, 1);
        Check(grid.FirstHit(-7, 0, 7, 0, 0, 1, out _) == 1, "earliest contact wins over iteration order");
        grid.Clear(); grid.Insert(5, 0, 0, 0.2f, 1); grid.Insert(3, 0, 0, 0.2f, 1);
        Check(grid.FirstHit(-1, 0, 1, 0, 0, 1, out _) == 3, "equal contact ties use lowest id");
        grid.Clear(); grid.Insert(0, 0, 0, 0.5f, 1);
        Check(grid.FirstHit(-1, 0.5f, 1, 0.5f, 0, 1, out _) == 0, "tangent contact");
        grid.Clear(); grid.Insert(0, 8, 8, 0.5f, 1);
        Check(grid.FirstHit(9, 8, 7, 8, 0, 1, out _) == 0, "query from outside world hits edge target");
        grid.SetBounds(-16, -16, 16, 16);
        Check(grid.Count == 0 && grid.FirstHit(9, 8, 7, 8, 0, 1, out _) == -1, "resize clears stale entries");

        var rng = new Random(4262026);
        var xs = new float[64]; var ys = new float[64]; var radii = new float[64];
        grid.SetBounds(-8, -8, 8, 8);
        for (int i = 0; i < 64; i++)
        {
            xs[i] = (i % 8) * 2 - 7; ys[i] = (i / 8) * 2 - 7;
            radii[i] = 0.1f + (float)rng.NextDouble() * 0.4f;
            grid.Insert(i, xs[i], ys[i], radii[i], 1);
        }
        bool equivalent = true;
        long candidates = 0;
        for (int tick = 0; tick < 100; tick++)
            for (int projectile = 0; projectile < 600; projectile++)
            {
                float ax = (float)rng.NextDouble() * 16 - 8, ay = (float)rng.NextDouble() * 16 - 8;
                float bx = ax + (float)rng.NextDouble() - 0.5f, by = ay + (float)rng.NextDouble() - 0.5f;
                bool brute = false;
                for (int i = 0; i < 64; i++) brute |= Overlap(ax, ay, bx, by, xs[i], ys[i], radii[i] + 0.04);
                equivalent &= (grid.FirstHit(ax, ay, bx, by, 0.04f, 1, out _) >= 0) == brute;
                candidates += grid.LastCandidateChecks;
            }
        Check(equivalent, "600 projectiles x 100 ticks agree with independent brute-force oracle");
        Check(candidates < 600L * 100 * 64 / 4, "local queries examine less than 25% of all targets in this fixture");
        // Warm before measuring. Rebuild and query paths are both included.
        for (int i = 0; i < 10000; i++) grid.FirstHit(-1, -1, 1, 1, 0.04f, 1, out _);
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int tick = 0; tick < 1000; tick++)
        {
            grid.Clear();
            for (int i = 0; i < 64; i++) grid.Insert(i, xs[i], ys[i], radii[i], 1);
            for (int projectile = 0; projectile < 600; projectile++)
                grid.FirstHit(-1, -1, 1, 1, 0.04f, 1, out _);
        }
        long allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        Check(allocated == 0, "rebuild plus 600000 queries allocate zero managed bytes on .NET 8");
        return checks;
    }

    // Independent reference: closest point on segment, no grid and no quadratic roots.
    static bool Overlap(double ax, double ay, double bx, double by, double x, double y, double r)
    {
        double dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
        double t = length > 0 ? Math.Max(0, Math.Min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
        double ex = ax + t * dx - x, ey = ay + t * dy - y;
        return ex * ex + ey * ey <= r * r;
    }
}
