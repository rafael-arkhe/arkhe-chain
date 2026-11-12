const MEASURED = [
  ["perception", "Perception"],
  ["generation", "Generation"],
  ["attention", "Attention"],
  ["learning", "Learning"],
  ["memory", "Memory"],
  ["reasoning", "Reasoning"],
  ["metacognition", "Metacognition"],
  ["executive_function", "Executive function"],
  ["problem_solving", "Problem solving"],
  ["social_cognition", "Social cognition"],
];

function badge(text, kind) {
  const node = document.createElement("span");
  node.className = `badge ${kind}`;
  node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function showError(node, message) {
  node.className = "alert";
  node.hidden = false;
  node.setAttribute("role", "alert");
  node.textContent = message;
}

function hideError(node) {
  node.hidden = true;
  node.textContent = "";
}

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function labeledCell(tag, label, text) {
  const cell = document.createElement(tag);
  cell.dataset.label = label;
  cell.textContent = text;
  return cell;
}

function renderStatus(report) {
  document.getElementById("status-lead").textContent =
    "Catalog compiled into this binary. Local means implemented here. Pending means this process cannot do it.";
  document.title = `AGI - v${report.version}`;
  document.querySelector(".brand-name").textContent = document.title;
  document.getElementById("authority-value").textContent = report.authority ? "true" : "false";
  document.getElementById("runtime-value").textContent = report.runtime_verified ? "true" : "false";
  const facts = document.getElementById("status-facts");
  facts.hidden = false;
  clear(facts);
  for (const [name, value] of [
    ["Product", report.product],
    ["Version", report.version],
    ["Authority", report.authority ? "true" : "false"],
    ["Runtime verified", report.runtime_verified ? "true" : "false"],
    ["Persistence", report.persistence],
  ]) {
    const wrap = document.createElement("div");
    const term = document.createElement("p");
    const detail = document.createElement("p");
    term.className = "fact-label";
    detail.className = "fact-value";
    term.textContent = name;
    detail.textContent = value;
    wrap.append(term, detail);
    facts.append(wrap);
  }
  const rows = document.getElementById("status-rows");
  clear(rows);
  for (const item of report.components) {
    const row = document.createElement("tr");
    const name = labeledCell("th", "Component", item.name);
    name.scope = "row";
    const state = document.createElement("td");
    state.dataset.label = "State";
    const kind = item.state === "local" ? "local" : "pending";
    state.append(badge(item.state === "local" ? "Local" : "Pending", kind));
    const limit = labeledCell("td", "Limitation", item.limitation);
    row.append(name, state, limit);
    rows.append(row);
  }
  const commands = document.getElementById("command-rows");
  clear(commands);
  for (const item of report.commands) {
    const row = document.createElement("tr");
    const name = labeledCell("th", "Command", item.name);
    name.scope = "row";
    const surface = document.createElement("td");
    surface.dataset.label = "Surface";
    const operator = item.surface === "operator";
    surface.append(badge(operator ? "Operator" : "Terminal", operator ? "operator" : "terminal"));
    row.append(
      name,
      surface,
      labeledCell("td", "Does", item.summary),
      labeledCell("td", "Constraint", item.constraint),
    );
    commands.append(row);
  }
}

function stageList(tasks) {
  const list = document.createElement("ol");
  list.className = "stages";
  const order = ["design", "implement", "test", "audit", "deploy"];
  const items = Object.values(tasks);
  items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const task of items) {
    const line = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = task.id;
    const state = task.status === "verified" ? "pass" : task.status === "failed" ? "fail" : "pending";
    line.append(title, document.createTextNode(` — ${task.description}.`), badge(task.status, state));
    list.append(line);
  }
  return list;
}

function bindForm(form, output, path, render) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const goal = new FormData(form).get("goal");
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
    clear(output);
    const waiting = document.createElement("p");
    waiting.textContent = "Waiting for this agi.exe process.";
    output.append(waiting);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const payload = await readJson(response);
      clear(output);
      render(output, payload);
    } catch (error) {
      clear(output);
      const fail = document.createElement("p");
      fail.className = "alert";
      fail.setAttribute("role", "alert");
      fail.append(badge("FAIL", "fail"), document.createTextNode(` ${error.message}`));
      output.append(fail);
    } finally {
      button.removeAttribute("aria-busy");
      button.disabled = false;
    }
  });
}

bindForm(document.getElementById("plan-form"), document.getElementById("plan-result"), "/api/plan", (output, payload) => {
  const note = document.createElement("p");
  note.textContent = "Plan built. Stages are pending. This is not an implementation and not a PASS.";
  output.append(note, stageList(payload.tasks));
  refreshSession().catch((error) => showError(document.getElementById("status-error"), error.message));
});

bindForm(document.getElementById("demo-form"), document.getElementById("demo-result"), "/api/demo", (output, payload) => {
  const verdict = document.createElement("p");
  verdict.append(
    badge("INCONCLUSIVE", "inconclusive"),
    document.createTextNode(` Deployment: ${payload.deployment_reason}`),
  );
  const meta = document.createElement("p");
  meta.textContent = `Mode ${payload.mode}. Records ${payload.records}. Authority ${payload.authority}. Deployed ${payload.deployed}.`;
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = "Planner status verified means the demo stage finished inside this process. It is not independent production verification.";
  output.append(verdict, meta, note, stageList(payload.plan.tasks));
  refreshSession().catch((error) => showError(document.getElementById("status-error"), error.message));
});

document.getElementById("bitflip").addEventListener("click", async () => {
  const output = document.getElementById("bitflip-result");
  const button = document.getElementById("bitflip");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  clear(output);
  try {
    const payload = await readJson(await fetch("/api/bitflip", { method: "POST" }));
    const line = document.createElement("p");
    line.append(badge("FAIL", "fail"), document.createTextNode(` ${payload.reason}`));
    const digests = document.createElement("p");
    digests.className = "hint";
    digests.textContent = `BLAKE3 ${payload.original} -> ${payload.flipped}. Signature checked: ${payload.signature_checked}.`;
    output.append(line, digests);
    refreshSession().catch(() => {});
  } catch (error) {
    const fail = document.createElement("p");
    fail.className = "alert";
    fail.setAttribute("role", "alert");
    fail.textContent = error.message;
    output.append(fail);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
});

document.getElementById("bundle-form").addEventListener("submit", (event) => event.preventDefault());
document.getElementById("bundle-file").addEventListener("change", async () => {
  const note = document.getElementById("bundle-note");
  const file = document.getElementById("bundle-file").files[0];
  if (!file) {
    note.textContent = "No bundle selected.";
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    const body = await readJson(await fetch("/api/bundle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    note.textContent = `${body.verdict.toUpperCase()} ${body.reason}`;
    renderSession(body.session);
  } catch (error) {
    note.textContent = error.message;
  }
});

function paintBadge(text) {
  const kind = text === "pass" ? "pass" : text === "fail" || text === "contested" ? "fail" : "pending";
  return badge(text.toUpperCase(), kind);
}

function nextStep(session) {
  if (session.correction_available) {
    return "A failed action is still in the log. Record a correction, or the assessment stays contested.";
  }
  const gridPassed = session.actions.some((action) => action.kind === "grid" && action.verdict === "pass");
  if (!gridPassed) return "Next: run a grid check. Nothing else on this page can place L1.";
  if (!session.separation || !session.separation.pass) {
    return "Next: check that the proposer and the evaluator differ.";
  }
  if (!session.receipt.valid) return "Next: issue a process receipt.";
  const bundlePassed = session.actions.some((action) => action.kind === "bundle" && action.verdict === "pass");
  if (!bundlePassed) return "Next: import a bundle signed by a different key.";
  return "The checks recorded in this process passed. This does not certify AGI.";
}

function renderSession(session) {
  const faculties = document.getElementById("faculties");
  clear(faculties);
  for (const [key, label] of MEASURED) {
    const item = document.createElement("li");
    item.append(document.createTextNode(`${label} `), paintBadge(session.faculties[key]));
    faculties.append(item);
  }
  const placed = session.ladder === "L1";
  document.getElementById("ladder-line").textContent = placed
    ? "L1 placed by a grid check in this process. L2 through L7 are not available here."
    : "L1 is not placed. L2 through L7 are not available here.";
  const summary = document.getElementById("grid-summary");
  const grid = document.getElementById("arc-grid");
  clear(grid);
  const width = session.grid[0] ? session.grid[0].length : 0;
  if (width === 0) {
    grid.hidden = true;
    summary.hidden = false;
    summary.textContent = "No grid check in this process yet.";
  } else {
    summary.hidden = true;
    grid.hidden = false;
    grid.style.gridTemplateColumns = `repeat(${width}, minmax(1.75rem, auto))`;
    for (const row of session.grid) {
      for (const cell of row) {
        const span = document.createElement("span");
        span.textContent = String(cell);
        grid.append(span);
      }
    }
  }
  const trace = document.getElementById("arc-trace");
  clear(trace);
  for (const line of session.trace) {
    const item = document.createElement("li");
    item.textContent = line;
    trace.append(item);
  }
  const last = session.horizons_ms.at(-1);
  document.getElementById("efficiency").textContent = [
    session.efficiency ? `Learning efficiency 1/(cost+tokens) = ${session.efficiency}. Inputs were supplied with the task.` : "",
    last === undefined ? "" : `Latest check took ${last} ms in this process.`,
  ].filter(Boolean).join(" ");
  const separation = session.separation;
  document.getElementById("proposer-state").textContent = separation ? separation.reason : "";
  document.getElementById("evaluator-state").textContent = separation
    ? `Separation ${separation.pass ? "passed" : "failed"}.`
    : "";
  document.getElementById("separation-note").textContent = separation ? "" : "No separation check has run.";
  document.getElementById("correct").hidden = !session.correction_available;
  const rows = document.getElementById("action-rows");
  clear(rows);
  if (session.actions.length === 0) {
    const row = document.createElement("tr");
    const cell = labeledCell("td", "Log", "No actions recorded.");
    cell.colSpan = 4;
    row.append(cell);
    rows.append(row);
  }
  for (const action of session.actions) {
    const row = document.createElement("tr");
    row.append(
      labeledCell("td", "Index", String(action.index)),
      labeledCell("td", "Kind", action.kind),
      labeledCell("td", "Verdict", action.verdict),
      labeledCell("td", "Corrects", action.corrects == null ? "" : String(action.corrects)),
    );
    rows.append(row);
  }
  document.getElementById("mmr-root").textContent = session.leaves ? session.root : "none";
  const proof = document.getElementById("mmr-proof");
  proof.hidden = !session.proof;
  proof.textContent = session.proof ? JSON.stringify(session.proof, null, 2) : "";
  const fields = document.getElementById("receipt-fields");
  clear(fields);
  const receiptFields = session.receipt.fields;
  document.getElementById("receipt-summary").textContent = receiptFields
    ? `Receipt is 174 bytes. Signature ${session.receipt.valid ? "verifies" : "does not verify"}. Algorithm ${session.algorithm}.`
    : "No receipt issued.";
  document.getElementById("copy-receipt").hidden = !session.receipt.hex;
  document.getElementById("receipt-raw").hidden = !receiptFields;
  if (receiptFields) {
    for (const [name, value] of Object.entries(receiptFields)) {
      const wrap = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = name;
      detail.textContent = String(value);
      wrap.append(term, detail);
      fields.append(wrap);
    }
  }
  const verdict = document.getElementById("assessment-verdict");
  clear(verdict);
  verdict.append(
    paintBadge(session.assessment),
    document.createTextNode(session.assessment === "pass"
      ? " Checks in this process passed. This does not certify AGI."
      : " declares_agi is false."),
  );
  document.getElementById("next-step").textContent = nextStep(session);
  const recorded = [...session.actions].reverse().find((action) => action.kind === "bundle");
  const bundleState = document.getElementById("bundle-state");
  if (!recorded) {
    bundleState.textContent = "No bundle check recorded.";
  } else if (recorded.verdict === "pass") {
    bundleState.textContent = "Last bundle check passed. declares_agi is false.";
  } else if (!session.receipt.valid) {
    bundleState.textContent = `Last bundle check ${recorded.verdict}. The process receipt does not verify. declares_agi is false.`;
  } else {
    bundleState.textContent = `Last bundle check ${recorded.verdict}. declares_agi is false.`;
  }
  const faculty = session.last_check;
  document.getElementById("faculty-result").textContent = faculty
    ? `${faculty.kind}: ${faculty.verdict.toUpperCase()}. ${faculty.reason}`
    : "No faculty check has run.";
  paintArc3(session.arc3);
}

function paintArc3(arc3) {
  const status = document.getElementById("arc3-status");
  const grid = document.getElementById("arc3-grid");
  clear(grid);
  if (!arc3) {
    grid.hidden = true;
    status.textContent = "No interactive frame yet.";
    return;
  }
  grid.hidden = false;
  grid.style.gridTemplateColumns = `repeat(${arc3.frame[0].length}, 0.85rem)`;
  for (const row of arc3.frame) {
    for (const cell of row) {
      const span = document.createElement("span");
      span.dataset.c = String(cell);
      grid.append(span);
    }
  }
  const walls = arc3.walls ? `${arc3.walls} walls. ` : "";
  const ratio = arc3.ratio ? ` Finished level ${arc3.ratio} against the known shortest path.` : "";
  const next = arc3.won && arc3.level < arc3.levels ? " The next action opens the next level." : "";
  status.textContent = `Level ${arc3.level} of ${arc3.levels}. ${walls}${arc3.actions} actions.${ratio}${next} ${arc3.won ? "Level ended." : "Level open."} No RHAE score. declares_agi false.`;
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

function bindFaculty(formId, fieldId, errorId, path) {
  document.getElementById(formId).addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    const error = document.getElementById(errorId);
    button.disabled = true;
    hideError(error);
    try {
      const payload = JSON.parse(document.getElementById(fieldId).value);
      renderSession(await postJson(path, payload));
    } catch (caught) {
      showError(error, caught.message);
    } finally {
      button.disabled = false;
    }
  });
}

bindFaculty("perception-form", "perception-file", "perception-error", "/api/perception");
bindFaculty("attention-form", "attention-file", "attention-error", "/api/attention");
bindFaculty("learning-form", "learning-file", "learning-error", "/api/learning");
bindFaculty("memory-form", "memory-file", "memory-error", "/api/memory");
bindFaculty("reasoning-form", "reasoning-file", "reasoning-error", "/api/reasoning");
bindFaculty("problem-form", "problem-file", "problem-error", "/api/problem");
bindFaculty("generation-form", "generation-file", "generation-error", "/api/generation");
bindFaculty("executive-form", "executive-file", "executive-error", "/api/executive");
bindFaculty("social-form", "social-file", "social-error", "/api/social");
bindFaculty("metacognition-form", "metacognition-file", "metacognition-error", "/api/metacognition");

for (const button of document.querySelectorAll("[data-arc3]")) {
  button.addEventListener("click", async () => {
    const error = document.getElementById("arc3-error");
    hideError(error);
    button.disabled = true;
    try {
      renderSession(await postJson("/api/arc3", { action: button.dataset.arc3 }));
    } catch (caught) {
      showError(error, caught.message);
    } finally {
      button.disabled = false;
    }
  });
}

document.getElementById("arc3-click").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("arc3-error");
  const button = event.target.querySelector("button");
  hideError(error);
  button.disabled = true;
  try {
    renderSession(await postJson("/api/arc3", {
      action: "click",
      x: Number(document.getElementById("arc3-x").value),
      y: Number(document.getElementById("arc3-y").value),
    }));
  } catch (caught) {
    showError(error, caught.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("arc-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  const error = document.getElementById("grid-error");
  button.disabled = true;
  hideError(error);
  try {
    renderSession(await postJson("/api/grid", JSON.parse(document.getElementById("arc-task").value)));
  } catch (caught) {
    showError(error, caught.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("grid-handoff").addEventListener("click", async () => {
  const button = document.getElementById("grid-handoff");
  const error = document.getElementById("grid-error");
  const note = document.getElementById("handoff-note");
  button.disabled = true;
  hideError(error);
  note.textContent = "";
  try {
    const payload = await postJson("/api/handoff", JSON.parse(document.getElementById("arc-task").value));
    renderSession(payload.session);
    const task = JSON.parse(document.getElementById("arc-task").value);
    const search = { train: task.train, test_input: task.test_input, test_output: task.test_output };
    document.getElementById("generation-file").value = JSON.stringify(search);
    document.getElementById("learning-file").value = JSON.stringify(search);
    document.getElementById("reasoning-file").value = JSON.stringify({
      program: task.program,
      premise: task.test_input,
      conclusion: task.test_output,
    });
    document.getElementById("perception-file").value = JSON.stringify(payload.prepared.perception);
    document.getElementById("attention-file").value = JSON.stringify(payload.prepared.attention);
    document.getElementById("memory-file").value = JSON.stringify(payload.prepared.memory);
    document.getElementById("problem-file").value = JSON.stringify(payload.prepared.problem);
    const ran = payload.ran.map((item) => `${item.check} ${item.verdict}`).join(", ");
    note.textContent = `${ran}. ${payload.reason} declares_agi false.`;
  } catch (caught) {
    showError(error, caught.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("separation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    renderSession(await postJson("/api/separation", data));
  } catch (error) {
    document.getElementById("separation-note").textContent = error.message;
  }
});

document.getElementById("link-parties").addEventListener("click", async () => {
  const form = document.getElementById("separation-form");
  const note = document.getElementById("separation-note");
  const button = document.getElementById("link-parties");
  button.disabled = true;
  try {
    const payload = await postJson("/api/link", Object.fromEntries(new FormData(form)));
    renderSession(payload.session);
    note.textContent = `${payload.reason} declares_agi false.`;
  } catch (error) {
    note.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("correct").addEventListener("click", async () => {
  try {
    renderSession(await readJson(await fetch("/api/correction", { method: "POST" })));
  } catch (error) {
    document.getElementById("separation-note").textContent = error.message;
  }
});

document.getElementById("issue-receipt").addEventListener("click", async () => {
  const note = document.getElementById("receipt-note");
  hideError(note);
  try {
    renderSession(await readJson(await fetch("/api/receipt", { method: "POST" })));
  } catch (error) {
    showError(note, error.message);
  }
});

document.getElementById("bundle-draft").addEventListener("click", async () => {
  const note = document.getElementById("bundle-note");
  const button = document.getElementById("bundle-draft");
  button.disabled = true;
  try {
    const draft = await readJson(await fetch("/api/bundle-draft", { method: "POST" }));
    document.getElementById("bundle-draft-json").value = JSON.stringify(draft, null, 2);
    note.className = "hint";
    note.textContent = `${draft.reason} declares_agi false.`;
  } catch (error) {
    note.className = "empty";
    note.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("bundle-verify").addEventListener("click", async () => {
  const note = document.getElementById("bundle-note");
  const button = document.getElementById("bundle-verify");
  const publicKey = document.getElementById("evaluator-public").value.trim();
  const signature = document.getElementById("evaluator-signature").value.trim();
  button.disabled = true;
  try {
    if (!publicKey || !signature) {
      throw new Error("Paste the evaluator public key and signature. This page does not take the seed.");
    }
    const raw = document.getElementById("bundle-draft-json").value;
    if (!raw) throw new Error("Prepare the independent bundle before pasting a signature.");
    const draft = JSON.parse(raw);
    draft.public_key_hex = publicKey;
    draft.signature_hex = signature;
    const body = await readJson(await fetch("/api/bundle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    }));
    note.className = "hint";
    note.textContent = `${body.verdict.toUpperCase()} ${body.reason} declares_agi false.`;
    renderSession(body.session);
  } catch (error) {
    note.className = "empty";
    note.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("copy-receipt").addEventListener("click", async () => {
  const note = document.getElementById("receipt-note");
  try {
    const session = await readJson(await fetch("/api/session"));
    if (!session.receipt.hex) throw new Error("No receipt issued.");
    await navigator.clipboard.writeText(session.receipt.hex);
    note.className = "hint";
    note.hidden = false;
    note.removeAttribute("role");
    note.textContent = "Receipt hex copied.";
  } catch (error) {
    showError(note, error.message);
  }
});

async function refreshSession() {
  renderSession(await readJson(await fetch("/api/session")));
}

fetch("/api/status")
  .then(readJson)
  .then(renderStatus)
  .then(refreshSession)
  .catch((error) => {
    showError(document.getElementById("status-error"), error.message);
    showError(document.getElementById("command-error"), error.message);
  });
