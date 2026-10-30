using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Arkhe.Shmup.Editor
{
    public static class BenchmarkSceneBuilder
    {
        const string Root = "Assets/Arkhe/Generated";
        public const string ScenePath = Root + "/Benchmark500Collisions.unity";

        [MenuItem("Arkhe/Create Benchmark 500")]
        public static void Create()
        {
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            if (File.Exists(ScenePath))
            { EditorSceneManager.OpenScene(ScenePath); return; }
            Directory.CreateDirectory(Root);
            AssetDatabase.Refresh();
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(Root + "/MobileURP.asset");
            if (pipeline == null)
            {
                var rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(Root + "/MobileRenderer.asset");
                if (rendererData == null)
                {
                    rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
                    AssetDatabase.CreateAsset(rendererData, Root + "/MobileRenderer.asset");
                }
                pipeline = UniversalRenderPipelineAsset.Create(rendererData);
                pipeline.supportsHDR = false;
                pipeline.msaaSampleCount = 1;
                pipeline.useSRPBatcher = true;
                pipeline.supportsCameraDepthTexture = false;
                pipeline.supportsCameraOpaqueTexture = false;
                AssetDatabase.CreateAsset(pipeline, Root + "/MobileURP.asset");
            }
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;

            var sprite = CreateSprite();
            var material = AssetDatabase.LoadAssetAtPath<Material>(Root + "/Sprite.mat");
            if (material == null)
            {
                material = new Material(Shader.Find("Arkhe/ShmupSprite"));
                AssetDatabase.CreateAsset(material, Root + "/Sprite.mat");
            }
            var hostile = CreatePrefab("Hostile", sprite, material, new Color(1, 0.12f, 0.4f), 20, 0.14f);
            var ally = CreatePrefab("Ally", sprite, material, new Color(0.2f, 1, 1), 10, 0.08f);
            var enemy = CreatePrefab("EnemyTarget", sprite, material, new Color(1, 0.6f, 0.15f), 5, 0.44f);
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.orthographic = true; camera.orthographicSize = 8;
            camera.transform.position = new Vector3(0, 0, -10);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.015f, 0.025f, 0.07f);
            camera.allowHDR = false;
            cameraObject.AddComponent<UniversalAdditionalCameraData>();

            var ship = new GameObject("Player • relative drag");
            ship.transform.position = new Vector3(0, -5, 0);
            ship.transform.localScale = new Vector3(0.4f, 0.6f, 1);
            var shipRenderer = ship.AddComponent<SpriteRenderer>();
            shipRenderer.sprite = sprite; shipRenderer.sharedMaterial = material;
            shipRenderer.color = new Color(0.15f, 0.85f, 1); shipRenderer.sortingOrder = 10;
            var drag = ship.AddComponent<RelativeDragController>();
            drag.gameplayCamera = camera;
            var root = new GameObject("Benchmark 500 • prewarm before play");
            var pool = root.AddComponent<ObjectPooler>();
            var world = root.AddComponent<BenchmarkWorld>();
            world.pool = pool; world.hostilePrefab = hostile; world.alliedPrefab = ally;
            world.enemyPrefab = enemy;
            world.player = drag; world.gameplayCamera = camera; world.projectileCount = 500;
            root.AddComponent<FrameTimeRecorder>().world = world;

            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan, GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.iOS, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.iOS, new[] { GraphicsDeviceType.Metal });
            Time.fixedDeltaTime = 1f / 60f;
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("Benchmark ready. Play: 5s warmup + 60s samples. Build to device for frame-time evidence.");
        }

        static Sprite CreateSprite()
        {
            var existing = AssetDatabase.LoadAssetAtPath<Sprite>(Root + "/Circle.png");
            if (existing != null) return existing;
            var texture = new Texture2D(32, 32, TextureFormat.RGBA32, false);
            var pixels = new Color32[32 * 32];
            for (int y = 0; y < 32; y++)
                for (int x = 0; x < 32; x++)
                {
                    float distance = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(16, 16));
                    pixels[y * 32 + x] = new Color32(255, 255, 255, (byte)(Mathf.Clamp01(16 - distance) * 255));
                }
            texture.SetPixels32(pixels); texture.Apply();
            string path = Root + "/Circle.png";
            File.WriteAllBytes(path, texture.EncodeToPNG());
            Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(path);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType = TextureImporterType.Sprite;
            importer.spritePixelsPerUnit = 32;
            importer.mipmapEnabled = false;
            importer.SetPlatformTextureSettings(new TextureImporterPlatformSettings {
                name = "Android", overridden = true, maxTextureSize = 64, format = TextureImporterFormat.ASTC_6x6 });
            importer.SetPlatformTextureSettings(new TextureImporterPlatformSettings {
                name = "iPhone", overridden = true, maxTextureSize = 64, format = TextureImporterFormat.ASTC_6x6 });
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }

        static PooledEntity CreatePrefab(string name, Sprite sprite, Material material, Color color, int order, float size)
        {
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(Root + "/" + name + ".prefab");
            if (existing != null) return existing.GetComponent<PooledEntity>();
            var source = new GameObject(name);
            source.transform.localScale = new Vector3(size, size, 1);
            var visual = source.AddComponent<SpriteRenderer>();
            visual.sprite = sprite; visual.sharedMaterial = material; visual.color = color; visual.sortingOrder = order;
            source.AddComponent<PooledEntity>();
            var saved = PrefabUtility.SaveAsPrefabAsset(source, Root + "/" + name + ".prefab");
            Object.DestroyImmediate(source);
            return saved.GetComponent<PooledEntity>();
        }
    }
}
