using UnityEngine;
using Arkhe.Shmup.Core;

namespace Arkhe.Shmup
{
    [DefaultExecutionOrder(-1000)]
    public sealed class BenchmarkWorld : MonoBehaviour
    {
        public ObjectPooler pool;
        public PooledEntity hostilePrefab;
        public PooledEntity alliedPrefab;
        public PooledEntity enemyPrefab;
        public RelativeDragController player;
        public Camera gameplayCamera;
        [Range(1, 1024)] public int projectileCount = 500;
        public bool autoFire = true;
        public bool collisionQueries = true;
        public int CollisionHits { get; private set; }
        public long CandidateChecks { get; private set; }
        public long GridRejected => enemyGrid != null ? enemyGrid.RejectedInserts : 0;
        SpatialCircleGrid enemyGrid;
        const uint EnemyLayer = 1;
        public float dashCooldown = 7;
        float halfWidth;
        float halfHeight;
        float dashRemaining;
        float dashReady;
        float fireRemaining;
        bool focused = true;
        public int HostileCount => pool != null ? pool.ActiveCount(0) : 0;

        void Awake()
        {
            if (pool == null || player == null || gameplayCamera == null || hostilePrefab == null || alliedPrefab == null || enemyPrefab == null)
            { enabled = false; Debug.LogError("Incomplete benchmark scene; use Arkhe/Create Benchmark."); return; }
            Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 0;
            halfHeight = gameplayCamera.orthographicSize;
            halfWidth = halfHeight * gameplayCamera.aspect;
            pool.Initialize(new[] {
                new ObjectPooler.Definition { prefab = hostilePrefab, capacity = 1024 },
                new ObjectPooler.Definition { prefab = alliedPrefab, capacity = 192 },
                new ObjectPooler.Definition { prefab = enemyPrefab, capacity = 64 }
            });
            enemyGrid = new SpatialCircleGrid(16, 32, 64, 0.22f, -halfWidth, -halfHeight, halfWidth, halfHeight);
            for (int i = 0; i < 64; i++)
            {
                float x = Mathf.Lerp(-halfWidth * 0.85f, halfWidth * 0.85f, (i % 8) / 7f);
                float y = Mathf.Lerp(0.5f, halfHeight * 0.85f, (i / 8) / 7f);
                pool.Spawn(2, new Vector3(x, y, 0), Quaternion.identity, Vector3.zero, float.MaxValue);
            }
            // Exactly N hostiles, permanently moving/wrapping. No steady-state churn.
            for (int i = 0; i < projectileCount; i++)
            {
                float x = Mathf.Lerp(-halfWidth * 0.94f, halfWidth * 0.94f, (i % 25) / 24f);
                float y = Mathf.Lerp(-halfHeight, halfHeight, i / (float)projectileCount);
                float speed = 1.2f + i % 5 * 0.2f;
                pool.Spawn(0, new Vector3(x, y, 0), Quaternion.identity,
                    new Vector3(Mathf.Sin(i * 2.4f) * 0.3f, -speed, 0), float.MaxValue);
            }
        }

        void Update()
        {
            if (!focused) return;
            float dt = Time.unscaledDeltaTime;
            dashRemaining = Mathf.Max(0, dashRemaining - dt);
            dashReady = Mathf.Max(0, dashReady - dt);
            bool gesture = player.ConsumeDash();
            if ((gesture || Input.GetKeyDown(KeyCode.LeftShift)) && dashReady <= 0)
            { dashRemaining = 1.5f; dashReady = dashCooldown; }
        }

        void FixedUpdate()
        {
            if (!focused) return;
            // Recompute aspect after a screen-size change, outside entity loops.
            halfHeight = gameplayCamera.orthographicSize;
            halfWidth = halfHeight * gameplayCamera.aspect;
            float dt = Time.fixedUnscaledDeltaTime;
            float hostileDt = dt * (dashRemaining > 0 ? 0.25f : 1);
            enemyGrid.SetBounds(-halfWidth, -halfHeight, halfWidth, halfHeight);
            for (int i = 0; i < pool.Capacity(2); i++)
            {
                var enemy = pool.ActiveAt(2, i);
                if (enemy == null) continue;
                var p = enemy.CachedTransform.position;
                // Keep target centers within viewport after aspect changes.
                p.x = Mathf.Clamp(p.x, -halfWidth, halfWidth);
                p.y = Mathf.Clamp(p.y, -halfHeight, halfHeight);
                enemy.CachedTransform.position = p;
                enemyGrid.Insert(i, p.x, p.y, 0.22f, EnemyLayer);
            }
            for (int i = 0; i < pool.Capacity(0); i++)
            {
                var entity = pool.ActiveAt(0, i);
                if (entity == null) continue;
                var position = entity.CachedTransform.position + entity.Velocity * hostileDt;
                if (position.y < -halfHeight - 0.15f) position.y = halfHeight + 0.15f;
                if (position.x < -halfWidth) position.x = halfWidth;
                else if (position.x > halfWidth) position.x = -halfWidth;
                entity.CachedTransform.position = position;
            }
            for (int i = 0; i < pool.Capacity(1); i++)
            {
                var entity = pool.ActiveAt(1, i);
                if (entity == null) continue;
                var before = entity.CachedTransform.position;
                var after = before + entity.Velocity * dt;
                entity.CachedTransform.position = after;
                entity.Remaining -= dt;
                if (collisionQueries)
                {
                    int hit = enemyGrid.FirstHit(before.x, before.y, after.x, after.y, 0.04f, EnemyLayer, out _);
                    CandidateChecks += enemyGrid.LastCandidateChecks;
                    if (hit >= 0)
                    {
                        CollisionHits++;
                        pool.Return(entity, entity.Lease);
                        continue;
                    }
                }
                if (entity.Remaining <= 0 || entity.CachedTransform.position.y > halfHeight + 1)
                    pool.Return(entity, entity.Lease);
            }
            if (!autoFire) return;
            fireRemaining -= dt;
            if (fireRemaining <= 0)
            {
                fireRemaining += 0.12f;
                var origin = player.transform.position + Vector3.up * 0.25f;
                pool.Spawn(1, origin + Vector3.left * 0.09f, Quaternion.identity, Vector3.up * 14, 2);
                pool.Spawn(1, origin + Vector3.right * 0.09f, Quaternion.identity, Vector3.up * 14, 2);
            }
        }

        void OnApplicationFocus(bool value) { focused = value; }
        void OnApplicationPause(bool value) { focused = !value; }
    }
}
