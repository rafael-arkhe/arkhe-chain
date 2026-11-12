# agi operator

Surface for the `agi` binary. This is not Arkhe Intra, Cockpit, Enterprise, or GovTech. Those products keep their own visual systems.

## What the screen is for

One local operator, on one machine, looking at three honest questions:

1. Which capabilities are implemented in this binary, and which are still pending?
2. What dependency plan does a goal produce, before any edit?
3. What does the labeled offline demo actually return?

The page does not start inference, mutation campaigns, or deployment.

## Layout

One scrolling page. A 240px sidebar lists every section, including the pending catalog. It does not hide a section behind a tab. Below 768px the sidebar stacks and the links wrap. The workspace opens with the assessment, then a banner that reads authority and runtime verification from `/api/status`. Both stay false in this binary. Under that, one sentence names the next action that can change the assessment.

The steps are the actions this process can actually run, in order: check a grid, run a faculty file, compare proposer and evaluator, issue a receipt and import a bundle, then read the session log. Each of the ten faculties has its own file. A pass is that recomputation, not a human baseline. Submitted files are replayed from `observations/faculties.json` when the operator opens. Grid, separation, receipt, bundle, plan, demo, bit-flip, handoff, and link checks are replayed from `observations/journal.json`. The kernel admission journal stays in memory. Plan, the labeled demo, and the bit-flip check sit below those steps. Terminal commands are listed inside a disclosure because this page cannot run them.

Controls that could not change a result are gone: the loopback pill, the five module tabs, the L2–L7 ladder rows, and the empty duration list. Generation, executive function, social cognition, and metacognition change only after their own file is recomputed. Receipt field hex stays collapsed until a receipt exists. The correction button stays hidden until a failure is unresolved.

Scores, radar values, ARC-AGI scores, and a VERIFIED sufficiency seal are omitted because this process cannot compute them. The interactive frame is the local-seek turn loop: three levels, keys, undo, and click. Level 3 draws walls. A finished level shows steps over the known shortest path in this frame. That ratio is not RHAE. The operator reloads `observations/local-seek.json` and continues it. It is not an ARC-AGI-3 environment and it does not compute RHAE. Tauri, WebAssembly, ML-DSA-65, and an ARC runner are not linked. Inter and JetBrains Mono are not bundled.

Actions are named with a verb and an object: "Run grid check", "Generate a program", "Check the execution prefix", "Judge another party's claim", "Recompute a recorded verdict", "Check separation", "Issue process receipt", "Build dependency plan", and "Run offline demo". The demo form lists its public key, synthetic tests, and in-memory journal before the button.

## Color and type

Page `#0c1219`, panels `#151e2a`, borders `#1e293b`, text `#e7edf5`, secondary text `#94a3b8`. Corners are 10px. The accent `#60a5fa` on `#172554` is for Local and Operator chips, the primary button, and focus. Pending uses `#fbbf24` on `#422006`. FAIL uses `#f87171` on `#450a0a`. PASS uses `#2dd4bf` on `#134e4a` only after a real pass. The authority banner uses the pending pair and prints the two false values in the fail color.

Type is Segoe UI, then `ui-sans-serif`. Digests use Cascadia Mono or Consolas.

Green, amber, and red are reserved for verdicts. The catalog uses the words Local and Pending. PASS is not used for the catalog. FAIL is used for a failed request and for the local bit-flip digest check. INCONCLUSIVE is used for deployment after the demo. VERIFIED is not shown.

## States

Status starts as "Loading the catalog compiled into this binary" and replaces that sentence from `/api/status`. The grid, separation, receipt, plan, demo, and bit-flip regions each start empty. A plan or demo submit disables its button, sets `aria-busy`, and says it is waiting. Errors stay next to the action that failed.

The receipt section names the last recorded bundle verdict. A pass there does not change the authority banner. A key that is not 32 bytes is an error next to the button and does not replace that verdict. The receipt chip says the signature verifies only after the ed25519 check of the 174-byte body succeeds. The bundle note says PASS only after a different key and the inclusion proof verify. That session assessment does not change the authority banner, `declares_agi`, or the demo. The demo stays `deployed: false` and INCONCLUSIVE. A missing bundle is an error, not a pass. ML-DSA-65 is not part of this receipt.

## Access

Skip link, in-page jump links, visible focus, a label on every field, and `aria-live` on plan, demo, and bit-flip results. Below 800px the two-column steps stack, buttons take the full width, and tables become labeled blocks. `prefers-reduced-motion` disables animation. Print drops forms, jump links, and the terminal disclosure.

## References

Used as constraints, not as copied screens:

- CTA naming: action plus object, from the CTA Gallery pattern described for Arkhe.
- Semantic green, amber, and red held for verdicts, from the Realtime Colors guidance in the Arkhe design skill.
- System fonts only. Uncut and Fontjoy were not used to add a webfont.

The November 8, 2026 cockpit proposal supplied the step order (grid, separation, receipt, assessment). Not incorporated from that proposal: Tauri, React, WebAssembly, ML-DSA-65, ARC task execution, faculty scores, and a METR chart. BoardUI supplied the sidebar, the 10px radius, and the chip shape. Its chat and agent runtime are not in this page. Tailwind, a CDN, askama, and axum are not used. The HTML and CSS are files compiled into the binary.

Catalogued and not incorporated: SVGL, Land-book, UI Colors exports, BG Ibelick, Haikei, Lucide packages, unDraw, LottieFiles, 21st.dev, React Bits, Magic UI, and Uiverse. The console is local CSS.
