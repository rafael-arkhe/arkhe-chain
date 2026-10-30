using System;
using System.Globalization;
using System.IO;
using System.Text;
using Unity.Profiling;
using UnityEngine;

namespace Arkhe.Shmup
{
    // Collection allocates arrays once; sorting/JSON/CSV/logging only after measurement.
    [DefaultExecutionOrder(1000)]
    public sealed class FrameTimeRecorder : MonoBehaviour
    {
        public BenchmarkWorld world;
        public float warmupSeconds = 5;
        public float measurementSeconds = 60;
        const int MaxSamples = 18000;
        readonly float[] frameMs = new float[MaxSamples];
        readonly long[] mainNs = new long[MaxSamples];
        readonly long[] gcBytes = new long[MaxSamples];
        ProfilerRecorder mainThread;
        ProfilerRecorder gc;
        float clock, measured;
        int samples, minHostiles = int.MaxValue, maxHostiles;
        bool completed;
        bool interrupted;

        [Serializable]
        sealed class Report
        {
            public string utc, unity, device, os, gpu, graphicsApi, pipeline;
            public int width, height, targetFps, samples, expectedHostiles, minHostiles, maxHostiles;
            public float warmupSeconds, requestedSeconds, measuredSeconds, p50Ms, p95Ms, p99Ms, worstMs;
            public long maxGcBytes;
            public int gcSamples, cpuSamples;
            public bool interrupted, sampleLimitReached, sampleWindowComplete, workloadStable;
            public bool frameBudgetMet;
            public bool isEditor, developmentBuild;
            public bool collisionQueries;
            public int collisionHits;
            public long candidateChecks, rejectedGridInserts;
        }

        void OnEnable()
        {
            clock = measured = 0; samples = 0; completed = interrupted = false;
            minHostiles = int.MaxValue; maxHostiles = 0;
            mainThread = ProfilerRecorder.StartNew(ProfilerCategory.Internal, "Main Thread", 1);
            gc = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "GC Allocated In Frame", 1);
        }

        void LateUpdate()
        {
            if (completed) return;
            clock += Time.unscaledDeltaTime;
            if (clock < warmupSeconds) return;
            if (world == null || !world.enabled) { enabled = false; return; }
            if (samples >= MaxSamples) { Finish(); return; }
            frameMs[samples] = Time.unscaledDeltaTime * 1000;
            mainNs[samples] = mainThread.Valid && mainThread.Count > 0 ? mainThread.LastValue : -1;
            gcBytes[samples] = gc.Valid && gc.Count > 0 ? gc.LastValue : -1;
            minHostiles = Mathf.Min(minHostiles, world.HostileCount);
            maxHostiles = Mathf.Max(maxHostiles, world.HostileCount);
            measured += Time.unscaledDeltaTime;
            samples++;
            if (measured >= measurementSeconds) Finish();
        }

        void Finish()
        {
            completed = true;
            mainThread.Stop(); gc.Stop();
            var sorted = new float[samples];
            Array.Copy(frameMs, sorted, samples);
            Array.Sort(sorted);
            long maxGc = -1;
            int validGc = 0, validCpu = 0;
            var csv = new StringBuilder(samples * 45);
            csv.AppendLine("sample,frame_interval_ms,previous_main_thread_ns,previous_gc_bytes");
            for (int i = 0; i < samples; i++)
            {
                csv.Append(i).Append(',').Append(frameMs[i].ToString("F4", CultureInfo.InvariantCulture))
                    .Append(',').Append(mainNs[i]).Append(',').Append(gcBytes[i]).AppendLine();
                if (gcBytes[i] >= 0) { validGc++; maxGc = Math.Max(maxGc, gcBytes[i]); }
                if (mainNs[i] >= 0) validCpu++;
            }
            var report = new Report {
                utc = DateTime.UtcNow.ToString("O"), unity = Application.unityVersion,
                device = SystemInfo.deviceModel, os = SystemInfo.operatingSystem,
                gpu = SystemInfo.graphicsDeviceName, graphicsApi = SystemInfo.graphicsDeviceType.ToString(),
                pipeline = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline != null
                    ? UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline.GetType().Name : "Built-in",
                width = Screen.width, height = Screen.height, targetFps = Application.targetFrameRate,
                isEditor = Application.isEditor, developmentBuild = Debug.isDebugBuild,
                collisionQueries = world.collisionQueries, collisionHits = world.CollisionHits,
                candidateChecks = world.CandidateChecks, rejectedGridInserts = world.GridRejected,
                samples = samples, expectedHostiles = world.projectileCount,
                minHostiles = minHostiles, maxHostiles = maxHostiles,
                warmupSeconds = warmupSeconds, requestedSeconds = measurementSeconds, measuredSeconds = measured,
                p50Ms = Percentile(sorted, 0.50f), p95Ms = Percentile(sorted, 0.95f),
                p99Ms = Percentile(sorted, 0.99f), worstMs = sorted[samples - 1],
                maxGcBytes = maxGc, gcSamples = validGc, cpuSamples = validCpu,
                interrupted = interrupted, sampleLimitReached = samples >= MaxSamples,
                sampleWindowComplete = measured >= measurementSeconds,
                workloadStable = minHostiles == world.projectileCount && maxHostiles == world.projectileCount,
                frameBudgetMet = Percentile(sorted, 0.99f) <= 1000f / 60f
            };
            string directory = Path.Combine(Application.persistentDataPath, "benchmarks");
            Directory.CreateDirectory(directory);
            string prefix = Path.Combine(directory, "shmup-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff"));
            File.WriteAllText(prefix + ".csv", csv.ToString());
            File.WriteAllText(prefix + ".json", JsonUtility.ToJson(report, true));
            Debug.Log("Benchmark finished: " + prefix + ".json");
        }

        static float Percentile(float[] sorted, float p) => sorted[Mathf.Clamp(Mathf.CeilToInt(sorted.Length * p) - 1, 0, sorted.Length - 1)];
        void OnApplicationFocus(bool value) { if (!value) interrupted = true; }
        void OnApplicationPause(bool value) { if (value) interrupted = true; }
        void OnDisable() { mainThread.Dispose(); gc.Dispose(); }
    }
}
