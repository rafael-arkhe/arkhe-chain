using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using NUnit.Framework;

namespace Arkhe.Shmup.Conformance
{
    public sealed class GoldenVectorTests
    {
        static JsonElement[] Rows()
        {
            using (var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(
                TestContext.CurrentContext.TestDirectory, "golden-vectors-v1.json"))))
                return document.RootElement.GetProperty("vectors").EnumerateArray().Select(x => x.Clone()).ToArray();
        }

        static uint Component(JsonElement row)
        {
            switch (row.GetProperty("component").GetString())
            {
                case "WorkIntent": return 1;
                case "WorkerExecutionRecord": return 2;
                case "MatchSummary": return 3;
                default: throw new InvalidDataException("Unknown component");
            }
        }

        public static IEnumerable<TestCaseData> Vectors()
        {
            foreach (var row in Rows())
                yield return new TestCaseData(row).SetName("Golden_" + row.GetProperty("id").GetString());
        }

        [TestCaseSource(nameof(Vectors))]
        public void NativeBoundaryMatchesReference(JsonElement row)
        {
            string result = NativeConformance.Encode(Component(row), row.GetProperty("input").GetRawText());
            if (row.GetProperty("expected").GetString() == "REJECT")
            {
                Assert.That(result, Is.Null);
                return;
            }
            Assert.That(result, Is.Not.Null);
            using (var output = JsonDocument.Parse(result))
            {
                Assert.That(output.RootElement.GetProperty("canonical_cbor_hex").GetString(),
                    Is.EqualTo(row.GetProperty("expected_output").GetProperty("canonical_cbor_hex").GetString()));
                Assert.That(output.RootElement.GetProperty("record_hash").GetString(),
                    Is.EqualTo(row.GetProperty("expected_output").GetProperty("object_digest_hex").GetString()));
            }
        }

        [Test]
        public void CorpusHasAllThirtySevenVectors()
        {
            var rows = Rows();
            Assert.That(rows.Length, Is.EqualTo(37));
            Assert.That(rows.Select(x => x.GetProperty("id").GetString()).Distinct().Count(), Is.EqualTo(37));
            Assert.That(rows.Count(x => x.GetProperty("expected").GetString() == "ACCEPT"), Is.EqualTo(25));
            Assert.That(rows.Count(x => x.GetProperty("expected").GetString() == "REJECT"), Is.EqualTo(12));
        }

        [Test]
        public void LargePayload_NoMarshalingCorruption()
        {
            var row = Rows().Single(x => x.GetProperty("id").GetString() == "WER-large-refs-10k");
            Assert.That(row.GetProperty("input").GetProperty("evidence_refs").GetArrayLength(), Is.EqualTo(10000));
            string input = row.GetProperty("input").GetRawText();
            string first = NativeConformance.Encode(2, input);
            string second = NativeConformance.Encode(2, input);
            Assert.That(first, Is.Not.Null);
            Assert.That(second, Is.EqualTo(first));
            NativeBoundaryMatchesReference(row);
        }

        [Test]
        public void ShortOutputBufferIsRejectedWithoutWriting()
        {
            var row = Rows().First(x => x.GetProperty("expected").GetString() == "ACCEPT");
            byte[] input = Encoding.UTF8.GetBytes(row.GetProperty("input").GetRawText());
            byte[] output = Enumerable.Repeat((byte)0xa5, 32).ToArray();
            GCHandle pinned = GCHandle.Alloc(output, GCHandleType.Pinned);
            try
            {
                int result = NativeConformance.arkhe_conformance_encode(Component(row), input,
                    (uint)input.Length, pinned.AddrOfPinnedObject(), (uint)output.Length);
                Assert.That(result, Is.EqualTo(-2));
                Assert.That(output, Is.All.EqualTo((byte)0xa5));
            }
            finally { pinned.Free(); }
        }
    }
}
