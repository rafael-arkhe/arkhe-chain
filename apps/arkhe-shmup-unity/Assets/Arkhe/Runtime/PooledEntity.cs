using Arkhe.Shmup.Core;
using UnityEngine;

namespace Arkhe.Shmup
{
    // No Return in OnDisable: pool owns activation, avoiding reentrant double return.
    public sealed class PooledEntity : MonoBehaviour
    {
        internal ObjectPooler Owner;
        internal int PoolId;
        internal int Slot;
        public Lease Lease { get; internal set; }
        public Vector3 Velocity { get; internal set; }
        public float Remaining { get; internal set; }
        internal Transform CachedTransform;

        internal void Configure(ObjectPooler owner, int poolId, int slot)
        {
            Owner = owner; PoolId = poolId; Slot = slot; CachedTransform = transform;
        }

        internal void Prepare(Lease lease, Vector3 position, Quaternion rotation,
            Vector3 velocity, float lifetime)
        {
            Lease = lease; Velocity = velocity; Remaining = lifetime;
            CachedTransform.SetPositionAndRotation(position, rotation);
        }
    }
}
