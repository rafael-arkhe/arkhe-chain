using System;

namespace Arkhe.Shmup.Core
{
    // Broad-phase for circle TARGETS; swept circle queries for projectiles.
    // Each target occupies one cell; query expands by the largest allowed target radius.
    public sealed class SpatialCircleGrid
    {
        readonly int columns, rows;
        readonly int[] heads, next;
        readonly bool[] present;
        readonly float[] x, y, radius;
        readonly uint[] layers;
        readonly float maxRadius;
        float left, bottom, right, top;
        double cellWidth, cellHeight;
        public int Count { get; private set; }
        public int LastCandidateChecks { get; private set; }
        public long RejectedInserts { get; private set; }

        public SpatialCircleGrid(int columns, int rows, int capacity, float maxTargetRadius,
            float left, float bottom, float right, float top)
        {
            if (columns < 1 || rows < 1 || capacity < 1 || !Finite(maxTargetRadius) || maxTargetRadius < 0)
                throw new ArgumentOutOfRangeException();
            this.columns = columns; this.rows = rows; maxRadius = maxTargetRadius;
            heads = new int[checked(columns * rows)]; next = new int[capacity];
            present = new bool[capacity]; x = new float[capacity]; y = new float[capacity];
            radius = new float[capacity]; layers = new uint[capacity];
            SetBounds(left, bottom, right, top);
        }

        // Invalidates old entries. Safe to call on viewport changes; never reallocates.
        public void SetBounds(float left, float bottom, float right, float top)
        {
            if (!Finite(left) || !Finite(bottom) || !Finite(right) || !Finite(top) || left >= right || bottom >= top)
                throw new ArgumentException("Invalid grid bounds");
            this.left = left; this.bottom = bottom; this.right = right; this.top = top;
            cellWidth = ((double)right - left) / columns;
            cellHeight = ((double)top - bottom) / rows;
            Clear();
        }

        public void Clear()
        {
            for (int i = 0; i < heads.Length; i++) heads[i] = -1;
            Array.Clear(present, 0, present.Length);
            Count = 0; LastCandidateChecks = 0;
        }

        public bool Insert(int id, float centerX, float centerY, float targetRadius, uint layer)
        {
            if (id < 0 || id >= x.Length || present[id] || !Finite(centerX) || !Finite(centerY)
                || !Finite(targetRadius) || targetRadius < 0 || targetRadius > maxRadius || layer == 0
                || centerX < left || centerX > right || centerY < bottom || centerY > top)
            { RejectedInserts++; return false; }
            int cell = CellY(centerY) * columns + CellX(centerX);
            x[id] = centerX; y[id] = centerY; radius[id] = targetRadius; layers[id] = layer;
            next[id] = heads[cell]; heads[cell] = id; present[id] = true; Count++;
            return true;
        }

        // First contact along segment, with lowest id as deterministic tie-break.
        // Caller must rebuild after target removal/movement before another query.
        public int FirstHit(float fromX, float fromY, float toX, float toY,
            float projectileRadius, uint targetMask, out float contactT)
        {
            LastCandidateChecks = 0; contactT = 1;
            if (!Finite(fromX) || !Finite(fromY) || !Finite(toX) || !Finite(toY)
                || !Finite(projectileRadius) || projectileRadius < 0 || targetMask == 0) return -1;
            double reach = (double)projectileRadius + maxRadius;
            int minX = CellX(Math.Min(fromX, toX) - reach), maxX = CellX(Math.Max(fromX, toX) + reach);
            int minY = CellY(Math.Min(fromY, toY) - reach), maxY = CellY(Math.Max(fromY, toY) + reach);
            int hit = -1; double best = 1;
            for (int row = minY; row <= maxY; row++)
                for (int col = minX; col <= maxX; col++)
                    for (int id = heads[row * columns + col]; id != -1; id = next[id])
                    {
                        if ((layers[id] & targetMask) == 0) continue;
                        LastCandidateChecks++;
                        if (Sweep(fromX, fromY, toX, toY, x[id], y[id], (double)projectileRadius + radius[id], out double t)
                            && (hit == -1 || t < best || (t == best && id < hit)))
                        { hit = id; best = t; }
                    }
            contactT = (float)best; return hit;
        }

        static bool Sweep(double ax, double ay, double bx, double by, double cx, double cy, double r, out double t)
        {
            double ox = ax - cx, oy = ay - cy, dx = bx - ax, dy = by - ay;
            double c = ox * ox + oy * oy - r * r;
            if (c <= 0) { t = 0; return true; }
            double a = dx * dx + dy * dy;
            if (a == 0) { t = 1; return false; }
            double b = ox * dx + oy * dy;
            double discriminant = b * b - a * c;
            if (discriminant < 0) { t = 1; return false; }
            t = (-b - Math.Sqrt(discriminant)) / a;
            return t >= 0 && t <= 1;
        }

        int CellX(double value) => Index((value - left) / cellWidth, columns);
        int CellY(double value) => Index((value - bottom) / cellHeight, rows);
        static int Index(double value, int count) => value <= 0 ? 0 : value >= count - 1 ? count - 1 : (int)Math.Floor(value);
        static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
