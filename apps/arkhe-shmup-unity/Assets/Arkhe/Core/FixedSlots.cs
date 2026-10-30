using System;

namespace Arkhe.Shmup.Core
{
    public readonly struct Lease
    {
        public readonly int Slot;
        public readonly ulong Generation;
        public Lease(int slot, ulong generation) { Slot = slot; Generation = generation; }
    }

    // Pure C# core, also used directly by Unity. No allocations after construction.
    public sealed class FixedSlots
    {
        readonly int[] free;
        readonly bool[] active;
        readonly ulong[] generations;
        int available;
        public int Capacity => free.Length;
        public int ActiveCount => Capacity - available;
        public long Dropped { get; private set; }

        public FixedSlots(int capacity)
        {
            if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity));
            free = new int[capacity]; active = new bool[capacity];
            generations = new ulong[capacity]; available = capacity;
            for (int i = 0; i < capacity; i++) free[i] = capacity - i - 1;
        }

        public bool TryRent(out Lease lease)
        {
            if (available == 0) { Dropped++; lease = default; return false; }
            int slot = free[--available];
            active[slot] = true;
            generations[slot]++;
            lease = new Lease(slot, generations[slot]);
            return true;
        }

        public bool IsActive(int slot) => slot >= 0 && slot < Capacity && active[slot];

        public bool Return(Lease lease)
        {
            if (!IsActive(lease.Slot) || generations[lease.Slot] != lease.Generation) return false;
            active[lease.Slot] = false;
            free[available++] = lease.Slot;
            return true;
        }
    }
}
