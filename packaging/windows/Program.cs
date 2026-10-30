using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;

internal static class Program
{
    static readonly string Root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    static readonly string Data = Path.GetFullPath(Environment.GetEnvironmentVariable("ARKHE_INTRA_DATA_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Arkhe", "Intra"));
    static readonly string Node = Path.Combine(Root, "runtime", "node.exe");
    static readonly string App = Path.Combine(Root, "app", "apps", "arkhe-intra");
    static readonly string StatePath = Path.Combine(Data, "server.json");
    static int Port => int.TryParse(Environment.GetEnvironmentVariable("ARKHE_PORT"), out int port) && port >= 1024 && port <= 65535 ? port : 3003;
    record State(int Pid, long Started, int Port);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct StartupInfo
    {
        public int cb; public string? reserved, desktop, title;
        public int x, y, width, height, xChars, yChars, fill, flags;
        public short show, reservedSize;
        public IntPtr reservedPtr, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo { public IntPtr process, thread; public int pid, tid; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static Process Detached(ProcessStartInfo info)
    {
        var block = string.Join('\0', info.Environment.Where(pair => pair.Value != null).OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase).Select(pair => pair.Key + "=" + pair.Value)) + "\0\0";
        var environment = Marshal.StringToHGlobalUni(block);
        var startup = new StartupInfo { cb = Marshal.SizeOf<StartupInfo>() };
        try
        {
            var command = new StringBuilder("\"" + info.FileName + "\" " + string.Join(' ', info.ArgumentList.Select(arg => "\"" + arg + "\"")));
            // No inherited handles: CLI callers must receive EOF when the launcher
            // exits, even though the local server intentionally remains alive.
            if (!CreateProcessW(info.FileName, command, IntPtr.Zero, IntPtr.Zero, false, 0x08000400, environment, info.WorkingDirectory, ref startup, out var child))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            CloseHandle(child.thread); CloseHandle(child.process);
            return Process.GetProcessById(child.pid);
        }
        finally { Marshal.FreeHGlobal(environment); }
    }
    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    static extern int MessageBox(IntPtr window, string text, string caption, uint type);
    static int Main(string[] args)
    {
        try
        {
            var command = args.FirstOrDefault() ?? "open";
            if (command is "help" or "--help" or "-h") { Console.WriteLine("Arkhe 0.1.0 local Windows x64\narkhe start | open | stop | status | doctor | setup | data | backup <new-directory>\nARKHE_PORT: default 3003. ARKHE_INTRA_DATA_DIR: default %LOCALAPPDATA%\\Arkhe\\Intra.\nUse credentials.json in the private data directory for first login.\nOllama and Rekor require separate configuration."); return 0; }
            if (command is "--version" or "version") { Console.WriteLine("0.1.0"); return 0; }
            Directory.CreateDirectory(Data);
            // Data contains credentials and signing keys. Restrict inheritance on Windows.
            var acl = new DirectorySecurity();
            acl.SetAccessRuleProtection(true, false);
            acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User!, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            new DirectoryInfo(Data).SetAccessControl(acl);
            using var mutex = new Mutex(false, "Local\\Arkhe-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Data.ToUpperInvariant()))));
            bool acquired;
            try { acquired = mutex.WaitOne(TimeSpan.FromSeconds(40)); } catch (AbandonedMutexException) { acquired = true; }
            if (!acquired) throw new Exception("Another Arkhe operation is in progress.");
            try
            {
                switch (command)
                {
                    case "data": Console.WriteLine(Data); return 0;
                    case "doctor":
                        foreach (var path in new[] { Node, Path.Combine(App, "server.js"), Path.Combine(Root, "setup", "scripts", "setup.mjs"), Path.Combine(Root, "bin", "arkhe-ollama.exe"), Path.Combine(App, "public", "verifier", "arkhe_verify_wasm_bg.wasm") })
                            if (!File.Exists(path)) throw new Exception("Missing packaged resource: " + path);
                        using (var check = Process.Start(Info(Node, "--version"))!) { check.WaitForExit(); if (check.ExitCode != 0) throw new Exception("Bundled Node failed."); }
                        Console.WriteLine("PASS bundled runtime/assets; data: " + Data + "\nOptional: Ollama server/model and trusted Rekor configuration."); return 0;
                    case "setup": Setup(); return 0;
                    case "status":
                        var state = ReadState();
                        if (state == null) { Console.WriteLine("STOPPED"); return 3; }
                        if (!Healthy(state.Port).GetAwaiter().GetResult()) throw new Exception("Recorded server is not healthy. Check server.log.");
                        Console.WriteLine($"RUNNING http://127.0.0.1:{state.Port} PID={state.Pid}"); return 0;
                    case "stop": Stop(); return 0;
                    case "backup":
                        if (args.Length != 2) throw new Exception("Usage: arkhe backup <new-directory>");
                        if (ReadState() != null) throw new Exception("Stop Arkhe before backup.");
                        var dest = Path.GetFullPath(args[1]);
                        if (Directory.Exists(dest) || File.Exists(dest) || dest.StartsWith(Data + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("Backup must be a new directory outside the data directory.");
                        Directory.CreateDirectory(dest);
                        new DirectoryInfo(dest).SetAccessControl(acl);
                        foreach (var file in Directory.GetFiles(Data)) if (Path.GetFileName(file) != "server.json") File.Copy(file, Path.Combine(dest, Path.GetFileName(file)));
                        Console.WriteLine("Backup created: " + dest + ". Contains private keys; keep access restricted."); return 0;
                    case "start": case "open":
                        var running = ReadState();
                        int port = running?.Port ?? Port;
                        if (running == null)
                        {
                            var probe = new TcpListener(IPAddress.Loopback, port);
                            try { probe.Start(); } catch (SocketException) { throw new Exception($"Port {port} is occupied. Set ARKHE_PORT to another port."); } finally { probe.Stop(); }
                            Setup();
                            var info = Info(Node, Path.Combine(App, "server.js")); info.WorkingDirectory = App;
                            info.Environment["HOSTNAME"] = "127.0.0.1";
                            info.Environment["PORT"] = port.ToString();
                            info.Environment["ARKHE_INTRA_ORIGIN"] = $"http://127.0.0.1:{port}";
                            // Node writes logs itself, allowing the launcher to exit without open pipes.
                            info.ArgumentList.Clear();
                            info.ArgumentList.Add(Path.Combine(Root, "setup", "server-host.mjs"));
                            info.Environment["ARKHE_SERVER_ENTRY"] = Path.Combine(App, "server.js");
                            using var child = Detached(info);
                            var current = new State(child.Id, child.StartTime.ToUniversalTime().Ticks, port);
                            File.WriteAllText(StatePath, JsonSerializer.Serialize(current));
                            bool ready = false;
                            for (int i = 0; i < 100; i++) { if (child.HasExited) break; if (Healthy(port).GetAwaiter().GetResult()) { ready = true; break; } Thread.Sleep(300); }
                            if (!ready) { Stop(); throw new Exception("Server startup failed. Check " + Path.Combine(Data, "server.log")); }
                        }
                        else if (!Healthy(port).GetAwaiter().GetResult()) throw new Exception("Server not healthy; stop it and inspect server.log.");
                        Console.WriteLine($"RUNNING http://127.0.0.1:{port}\nPrivate accounts and keys: {Data}");
                        if (command == "open") Process.Start(new ProcessStartInfo($"http://127.0.0.1:{port}/login") { UseShellExecute = true });
                        return 0;
                    default: throw new Exception("Unknown command. Use arkhe --help.");
                }
            }
            finally { mutex.ReleaseMutex(); }
        }
        catch (Exception e) { Console.Error.WriteLine("Arkhe: " + e.Message); if (args.Length == 0) MessageBox(IntPtr.Zero, e.Message, "Arkhe", 0x10); return 1; }
    }
    static ProcessStartInfo Info(string exe, params string[] args)
    {
        var info = new ProcessStartInfo(exe) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Root };
        foreach (var arg in args) info.ArgumentList.Add(arg);
        info.Environment["ARKHE_INSTALL_ROOT"] = Root;
        info.Environment["ARKHE_INTRA_DATA_DIR"] = Data;
        info.Environment["ARKHE_OLLAMA_EXECUTABLE"] = Path.Combine(Root, "bin", "arkhe-ollama.exe");
        if (!info.Environment.ContainsKey("ARKHE_OLLAMA_CONFIG")) info.Environment["ARKHE_OLLAMA_CONFIG"] = Path.Combine(Root, "config", "ollama.json");
        info.Environment["NODE_ENV"] = "production";
        info.Environment["NEXT_TELEMETRY_DISABLED"] = "1";
        return info;
    }
    static void Setup()
    {
        using var process = Process.Start(Info(Node, Path.Combine(Root, "setup", "scripts", "setup.mjs")))!;
        process.WaitForExit(); if (process.ExitCode != 0) throw new Exception("Account setup failed.");
    }
    static State? ReadState()
    {
        if (!File.Exists(StatePath)) return null;
        var state = JsonSerializer.Deserialize<State>(File.ReadAllText(StatePath)) ?? throw new Exception("Invalid server.json.");
        try
        {
            using var process = Process.GetProcessById(state.Pid);
            if (process.HasExited || process.StartTime.ToUniversalTime().Ticks != state.Started) return null;
            if (!string.Equals(process.MainModule?.FileName, Node, StringComparison.OrdinalIgnoreCase)) throw new Exception("Server PID belongs to a different executable; refusing process operation.");
            return state;
        }
        catch (ArgumentException) { return null; }
    }
    static void Stop()
    {
        var state = ReadState();
        if (state != null) { using var process = Process.GetProcessById(state.Pid); process.Kill(true); process.WaitForExit(10000); }
        File.Delete(StatePath); Console.WriteLine("STOPPED; data preserved.");
    }
    static async Task<bool> Healthy(int port)
    {
        try { using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(1) }; var json = await client.GetStringAsync($"http://127.0.0.1:{port}/api/health"); using var doc = JsonDocument.Parse(json); return doc.RootElement.GetProperty("service").GetString() == "arkhe-intra"; } catch { return false; }
    }
}
