# Desktop NUnit conformance

This suite crosses C# P/Invoke into a native Rust `cdylib`, using caller-owned
buffers and the real `arkhe-core` parser/encoder. It is a desktop conformance
adapter, not an implementation of Unity's `ILocalMatchVerifier`, signatures,
ticket checking, replay verification, or the browser WASM ABI.

From the repository root in PowerShell:

```powershell
cargo build --locked --manifest-path apps/arkhe-shmup-unity/Tests/Conformance/native/Cargo.toml --target-dir target/unity-conformance
dotnet restore apps/arkhe-shmup-unity/Tests/Conformance/Conformance.csproj --locked-mode
$library = if ($IsWindows -or $env:OS -eq 'Windows_NT') { 'arkhe_unity_conformance.dll' } else { 'libarkhe_unity_conformance.so' }
$env:ARKHE_CONFORMANCE_LIBRARY = Join-Path $PWD "target/unity-conformance/debug/$library"
dotnet test apps/arkhe-shmup-unity/Tests/Conformance/Conformance.csproj --configuration Release --no-restore --logger "trx;LogFileName=desktop-conformance.trx" --results-directory TestResults/desktop-conformance
```

The workflow `.github/workflows/unity-conformance.yml` runs the same suite on
Windows and Linux on push, pull request, or manual dispatch. A test failure fails
the job; TRX results are uploaded even on failure. Repository branch protection
must require these jobs if merge blocking is desired; this file does not change
GitHub repository settings.

The 40 tests comprise 37 vector cases, an exact count/unique-ID/ACCEPT/REJECT
corpus check, `LargePayload_NoMarshalingCorruption`, and a short-output-buffer
check. Every accepted vector compares both canonical CBOR and `record_hash`
against the independent reference; `record_hash` here is the core object digest.
Rejection must return the explicit rejection code, not an ABI error or trap.
All successful output writes use pinned buffers with 16-byte canaries on each
side. The large-array test checks 10,000 digests, identical responses from two
calls, and agreement with the reference. Short output must leave memory untouched.

Input JSON is UTF-8 transferred as bytes, including Unicode and full-width
integers without conversion through C# floating-point values. This does not
exercise a Unity typed-object codec: the production codec remains unimplemented.

## Local evidence — 2026-10-28

Windows x64, .NET 8 test target, Rust 1.96.0: 40 passed, 0 failed, 0 skipped.
The build completed with zero C# warnings/errors. TRX:
`TestResults/desktop-conformance/desktop-conformance.trx`.

No remote CI execution was triggered from this workspace: it has no `.git`
directory or identified remote. The Windows local run does not establish Linux,
Unity Mono/IL2CPP, Android, iOS, C#↔WASM, WebGL, or cross-build reproducibility.
Those remain separate execution gates, not inferred successes.
