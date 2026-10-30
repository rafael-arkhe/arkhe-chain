using System;

namespace Arkhe.Shmup.Core
{
    // World coordinates, +Y up. No screen/Unity dependencies or per-frame drift.
    public sealed class RelativeDragState
    {
        public int Pointer { get; private set; } = int.MinValue;
        public float TargetX { get; private set; }
        public float TargetY { get; private set; }
        public float Offset = 1.8f;
        public float Sensitivity = 1;
        public float Response = 18;
        public float MaxSpeed = 12;
        float previousX, previousY;
        float minX, minY, maxX, maxY;

        public void Bounds(float left, float bottom, float right, float top)
        {
            if (left > right || bottom > top) throw new ArgumentException("Invalid bounds");
            minX = left; minY = bottom; maxX = right; maxY = top;
            ClampTarget();
        }

        public void Reset(float shipX, float shipY)
        {
            Cancel(); TargetX = shipX; TargetY = shipY; ClampTarget();
        }

        public bool Begin(int id, float x, float y)
        {
            if (Pointer != int.MinValue || id == int.MinValue) return false;
            Pointer = id; previousX = x; previousY = y;
            TargetY = Math.Max(TargetY, y + Offset);
            ClampTarget(); return true;
        }

        public bool Move(int id, float x, float y)
        {
            if (Pointer != id || Pointer == int.MinValue) return false;
            TargetX += (x - previousX) * Sensitivity;
            TargetY += (y - previousY) * Sensitivity;
            TargetY = Math.Max(TargetY, y + Offset);
            previousX = x; previousY = y;
            ClampTarget(); return true;
        }

        public void End(int id) { if (Pointer == id) Cancel(); }
        public void Cancel() { Pointer = int.MinValue; }

        public void Step(float x, float y, float dt, out float resultX, out float resultY)
        {
            double dx = TargetX - x, dy = TargetY - y;
            double distance = Math.Sqrt(dx * dx + dy * dy);
            double blend = 1 - Math.Exp(-Math.Max(0, Response) * Math.Max(0, dt));
            double step = Math.Min(distance * blend, Math.Max(0, MaxSpeed) * Math.Max(0, dt));
            double factor = distance > 0 ? step / distance : 0;
            resultX = Clamp((float)(x + dx * factor), minX, maxX);
            resultY = Clamp((float)(y + dy * factor), minY, maxY);
        }

        void ClampTarget()
        {
            TargetX = Clamp(TargetX, minX, maxX);
            TargetY = Clamp(TargetY, minY, maxY);
        }
        static float Clamp(float v, float min, float max) => Math.Max(min, Math.Min(max, v));
    }
}
