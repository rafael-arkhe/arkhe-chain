# Changelog

## 0.13.0 — November 9, 2026

- The receipt section shows the last recorded bundle verdict from this process. A pass still leaves `declares_agi` false. A key that is not 32 bytes stays an HTTP 400 and does not replace that verdict.

## 0.12.0 — November 9, 2026

- The operator page uses a local dark shell: a 240px sidebar, 10px corners, and status chips. The pending catalog and the `authority: false` banner stay on the page. No chat, CDN, React, or extra crate was added. `declares_agi` stays false.

## 0.11.0 — November 9, 2026

- The operator page can paste the public key and signature from `agi attest-receipt` onto the bundle draft and post that JSON to the existing verifier. The page never asks for the seed. A pass still leaves `declares_agi` false.

## 0.10.0 — November 9, 2026

- `bundle-draft` exports the process receipt, leaf, MMR root, and inclusion proof. The evaluator signature and public key stay empty. This process still rejects its own key. `declares_agi` stays false.

## 0.9.0 — November 9, 2026

- `link` checks the four separation dimensions and, only when they differ, signs this process's ed25519 receipt. It refuses to run before a grid pass. It does not sign the evaluator bundle. `declares_agi` stays false.

## 0.8.0 — November 9, 2026

- `handoff` takes one grid task into the checks that can recompute it. Generation and learning search the closed set without the program name. Reasoning checks the stated conclusion. Perception, attention, memory, and problem solving are filled only as drafts and are not recorded. `declares_agi` stays false.

## 0.7.0 — November 9, 2026

- Operator checks other than local-seek are written to `observations/journal.json` and recomputed when the process opens. The kernel admission journal stays in memory. This is not a Postgres session. `declares_agi` stays false.

## 0.6.0 — November 9, 2026

- The operator version comes from the binary. `agi status` and the page brand both report `0.6.0`. `declares_agi` stays false.

## 0.5.0 — November 9, 2026

- A finished local-seek level reports the steps taken over the known shortest path in this frame. The field is `ratio`. `score` stays null and `official` stays false. The status line names the faculty log and the local-seek file, and still says the kernel journal is in memory.
- The autonomy catalog row stays Pending. `agi release` still writes a local manifest after the plan, cargo test, and the ten faculty files. The deploy stage is inconclusive: no editor runs, and nothing is deployed.

## 0.4.1 — November 9, 2026

- Faculty submissions are written to `observations/faculties.json`. Opening the operator recomputes that log. A restarted process keeps the verdict only when the file still recomputes. This is not a Postgres session, and `declares_agi` stays false.

## 0.4.0 — November 9, 2026

- The ten faculties named in DeepMind's cognitive framework each have a local file that is recomputed. Perception, attention, learning, memory, reasoning, and problem solving no longer change because some other action ran. A pass is that recomputation. It is not a human baseline, and `declares_agi` stays false. Source: [Measuring Progress Toward AGI: A Cognitive Framework](https://arxiv.org/html/2605.28405).

## 0.3.0 — November 9, 2026

- Level 3 of local-seek has three walls. A blocked step counts and the marker stays. `agi arc3` loads `observations/local-seek.json` before applying actions. `official` stays false, `score` stays null, and `declares_agi` stays false.

## 0.2.0 — November 9, 2026

- `local-seek` now has three levels. Finishing a level carries the action count into the next one. `agi arc3` and the operator save the frame to `observations/local-seek.json` and reload it. `official` stays false and `score` stays null. `declares_agi` stays false.

## November 8, 2026

- Added the `agi` binary (`agi.exe` on Windows), the `status` catalog, and a loopback operator page for the plan and the labeled offline demo. The `agi-coder` binary remains. A Tauri shell, durable journal, and native inference stay pending.
- Replaced the Jules catalog entries with one MCP entry. `agi mcp` prints the stdio launch line and does not start a session.
- Added the pending-capability code: SQL journal transitions, a local transparency checkpoint, DeepInfer engine status, GPU attestation, production deployment, hosted CI observation, and the desktop shell report. `agi pending` prints them. Each result stays negative until an external proof exists.

## 0.1.0 — October 21, 2026

- Added `agi-coder-inference`, validated DeepInfer sampling/structured outputs, an offline Python bridge, a cognition proposal helper, the `infer` CLI command, pinned upstream source metadata, and CPU contract tests. Native engine execution remains pending.

- Added a self-contained 13-crate Rust workspace and two-package TypeScript workspace.
- Implemented signed execution records, exact request/artifact binding, a fail-closed gate, in-memory admission journal, portable MMR proofs, bounded planning, memory, research contracts, mutation verification, provider and executor interfaces, and a Jules REST client.
- Added an explicit offline CLI demo, real process mutation runner, official-SDK MCP stdio server, cross-language independent MMR vectors, and adversarial integration tests.
- Added CI and signed release-candidate workflows, deployment examples, specifications, ADRs, and explicit maturity limits.
