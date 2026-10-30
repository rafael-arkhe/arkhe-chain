using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace Arkhe.Shmup.Conformance
{
    // Test adapter to a real native library; not Unity's production verifier.
    internal static class NativeConformance
    {
        static NativeConformance()
        {
            string path = Environment.GetEnvironmentVariable("ARKHE_CONFORMANCE_LIBRARY");
            if (String.IsNullOrEmpty(path))
                throw new InvalidOperationException("ARKHE_CONFORMANCE_LIBRARY must identify the native adapter");
            IntPtr library = NativeLibrary.Load(System.IO.Path.GetFullPath(path));
            NativeLibrary.SetDllImportResolver(typeof(NativeConformance).Assembly,
                (name, assembly, searchPath) => name == "arkhe_unity_conformance" ? library : IntPtr.Zero);
        }

        [DllImport("arkhe_unity_conformance", CallingConvention = CallingConvention.Cdecl)]
        internal static extern int arkhe_conformance_encode(uint component,
            [In] byte[] input, uint inputLength, IntPtr output, uint capacity);

        internal static string Encode(uint component, string input)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(input);
            int length = arkhe_conformance_encode(component, bytes, checked((uint)bytes.Length), IntPtr.Zero, 0);
            if (length == -1) return null;
            if (length <= 0 || length > 8 * 1024 * 1024)
                throw new InvalidOperationException("Native sizing call failed: " + length);
            // Canary bytes surround caller-owned output memory.
            byte[] guarded = new byte[length + 32];
            Array.Fill(guarded, (byte)0xa5);
            GCHandle pinned = GCHandle.Alloc(guarded, GCHandleType.Pinned);
            try
            {
                int written = arkhe_conformance_encode(component, bytes, checked((uint)bytes.Length),
                    IntPtr.Add(pinned.AddrOfPinnedObject(), 16), checked((uint)length));
                if (written != length) throw new InvalidOperationException("Native output size changed: " + written);
                for (int i = 0; i < 16; i++)
                    if (guarded[i] != 0xa5 || guarded[length + 16 + i] != 0xa5)
                        throw new InvalidOperationException("Native output corrupted a guard region");
                string result = Encoding.UTF8.GetString(guarded, 16, length);
                using (JsonDocument.Parse(result)) { }
                return result;
            }
            finally { pinned.Free(); }
        }
    }
}
