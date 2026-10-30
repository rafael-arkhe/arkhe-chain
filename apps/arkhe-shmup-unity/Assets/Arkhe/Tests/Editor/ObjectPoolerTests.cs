using Arkhe.Shmup.Core;
using NUnit.Framework;
using UnityEngine;

namespace Arkhe.Shmup.Tests
{
    public sealed class ObjectPoolerTests
    {
        GameObject root, template;
        ObjectPooler pool;

        [SetUp] public void Setup()
        {
            root = new GameObject("Pool under test");
            template = new GameObject("Template");
            template.SetActive(false);
            var entity = template.AddComponent<PooledEntity>();
            pool = root.AddComponent<ObjectPooler>();
            pool.Initialize(new[] { new ObjectPooler.Definition { prefab = entity, capacity = 2 } });
        }

        [TearDown] public void Cleanup()
        { Object.DestroyImmediate(root); Object.DestroyImmediate(template); }

        PooledEntity Spawn() => pool.Spawn(0, Vector3.one, Quaternion.identity, Vector3.up, 1);

        [Test] public void ExhaustionDoesNotCreateObjects()
        {
            int children = root.transform.childCount;
            Assert.NotNull(Spawn()); Assert.NotNull(Spawn()); Assert.IsNull(Spawn());
            Assert.AreEqual(children, root.transform.childCount);
            Assert.AreEqual(2, pool.ActiveCount(0)); Assert.AreEqual(1, pool.Dropped(0));
        }

        [Test] public void DuplicateAndStaleReturnAreIgnored()
        {
            var entity = Spawn(); Lease old = entity.Lease;
            Assert.IsTrue(entity.gameObject.activeSelf);
            Assert.IsTrue(pool.Return(entity, old));
            Assert.IsFalse(entity.gameObject.activeSelf);
            Assert.IsFalse(pool.Return(entity, old));
            Assert.AreSame(entity, Spawn());
            Assert.IsFalse(pool.Return(entity, old));
            Assert.AreEqual(1, pool.ActiveCount(0));
        }

        [Test] public void InvalidPoolAndForeignEntityAreRejected()
        {
            Assert.IsNull(pool.Spawn(99, Vector3.zero, Quaternion.identity, Vector3.zero, 1));
            Assert.IsFalse(pool.Return(template.GetComponent<PooledEntity>(), new Lease(0, 1)));
        }
    }
}
