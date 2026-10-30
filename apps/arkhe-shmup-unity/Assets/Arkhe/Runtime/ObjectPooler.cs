using System;
using Arkhe.Shmup.Core;
using UnityEngine;

namespace Arkhe.Shmup
{
    public sealed class ObjectPooler : MonoBehaviour
    {
        [Serializable]
        public sealed class Definition
        {
            public PooledEntity prefab;
            [Min(1)] public int capacity = 512;
        }

        sealed class Pool
        {
            public FixedSlots Slots;
            public PooledEntity[] Entities;
        }

        Pool[] pools;
        public bool Ready => pools != null;

        // Explicit setup before gameplay, never called by Spawn/Return.
        public void Initialize(Definition[] definitions)
        {
            if (Ready) throw new InvalidOperationException("Pool already initialized");
            if (definitions == null || definitions.Length == 0) throw new ArgumentException("No pools");
            for (int p = 0; p < definitions.Length; p++)
                if (definitions[p] == null || definitions[p].prefab == null || definitions[p].capacity < 1)
                    throw new ArgumentException("Invalid pool configuration");

            var created = new Pool[definitions.Length];
            // Inactive staging root prevents prefab OnEnable during prewarm.
            var staging = new GameObject("Prewarm (inactive)");
            staging.transform.SetParent(transform, false);
            staging.SetActive(false);
            for (int p = 0; p < definitions.Length; p++)
            {
                var cfg = definitions[p];
                var pool = new Pool { Slots = new FixedSlots(cfg.capacity), Entities = new PooledEntity[cfg.capacity] };
                for (int i = 0; i < cfg.capacity; i++)
                {
                    var entity = Instantiate(cfg.prefab, staging.transform);
                    entity.gameObject.SetActive(false);
                    entity.Configure(this, p, i);
                    entity.transform.SetParent(transform, false);
                    pool.Entities[i] = entity;
                }
                created[p] = pool;
            }
            pools = created;
        }

        public PooledEntity Spawn(int poolId, Vector3 position, Quaternion rotation,
            Vector3 velocity, float lifetime)
        {
            if (!Valid(poolId) || lifetime <= 0 || !pools[poolId].Slots.TryRent(out var lease)) return null;
            var entity = pools[poolId].Entities[lease.Slot];
            entity.Prepare(lease, position, rotation, velocity, lifetime);
            entity.gameObject.SetActive(true);
            return entity;
        }

        // Delayed callbacks must capture the lease from Spawn, not read a newer one.
        public bool Return(PooledEntity entity, Lease lease)
        {
            if (entity == null || entity.Owner != this || !Valid(entity.PoolId)) return false;
            var pool = pools[entity.PoolId];
            if (entity.Slot != lease.Slot || pool.Entities[lease.Slot] != entity || !pool.Slots.Return(lease)) return false;
            entity.Velocity = Vector3.zero; entity.Remaining = 0;
            entity.gameObject.SetActive(false);
            return true;
        }

        public int Capacity(int poolId) => Valid(poolId) ? pools[poolId].Slots.Capacity : 0;
        public int ActiveCount(int poolId) => Valid(poolId) ? pools[poolId].Slots.ActiveCount : 0;
        public long Dropped(int poolId) => Valid(poolId) ? pools[poolId].Slots.Dropped : 0;
        public PooledEntity ActiveAt(int poolId, int slot) => Valid(poolId) && pools[poolId].Slots.IsActive(slot)
            ? pools[poolId].Entities[slot] : null;
        bool Valid(int id) => pools != null && id >= 0 && id < pools.Length;
    }
}
