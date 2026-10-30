from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib import colors
import json

for name,file in [('Arial','arial.ttf'),('Arial-Bold','arialbd.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'C:/Windows/Fonts/'+file))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial',boldItalic='Arial-Bold')
W,H=595.2756,841.8898
M=43.2
CW=W-2*M
styles={k:ParagraphStyle(k,fontName=font,fontSize=size,leading=lead,spaceAfter=gap,textColor=colors.black) for k,font,size,lead,gap in [('body','Arial',11,12.65,8),('h1','Arial-Bold',17,19,12),('h2','Arial-Bold',12,14,7),('title','Arial-Bold',22,25,12),('cell','Arial',11,12.65,0)]}
def p(t,s='body'): return ('p',t,s)
def tbl(head,rows,widths): return ('t',head,rows,widths)
summary='''Arkhe proposes an open-source component for agents acting on behalf of different owners to verify what was requested, which policy authorised an action, and which evidence supports the resulting claim. The project targets Track 2.2 (Components), with emphasis on verifiable reporting and the enforcement of negotiated limits at an explicit effect boundary. It does not propose a general-purpose agent or a new foundation model.

An agent's signed statement is not evidence that its task was performed correctly. An inclusion proof is not evidence that a checkpoint is trustworthy. Arkhe makes these distinctions explicit: canonical request and policy commitments, authenticated worker evidence, optional human review, independently checked certificates, and durable receipts are verified as separate claims.

The existing research codebase includes a Rust authorisation gate, persistent evidence infrastructure, native and WASM verification, and an offline arithmetic certificate checker. These are a starting point, not an already-qualified multi-party trust system. The funded work would extract a bounded interface; connect two independently controlled agents to a host-controlled effect boundary; and evaluate the component against malicious counterparties, forged or transplanted evidence, policy changes, replay, and recovery failures.

The proposed six-month programme uses a procurement-and-budget scenario as a reproducible test of cross-owner coordination. A buyer delegates a bounded task; a supplier returns an offer and evidence; the host checks the current policy and evidence before permitting a simulated effect; an independent verifier checks the exported receipt. The same contract will be exercised through two agent adapters to test reuse. No payment or physical actuation is required for the initial experiment.

Success will be measured jointly by task completion, unauthorised effects, false rejection, verification cost, and reproducibility. The evaluation will compare an unguarded baseline, a logging-only baseline, and the enforced Arkhe path under matched conditions. Independent security review and a documented integration package are proposed milestones. New funded software would be released under MIT and Apache 2.0.

Rafael Oliveira, a psychologist and independent researcher, would lead the project full time. Jameson Bednarski is identified as an independent researcher; his allocation and technical responsibilities remain to be agreed. Named technical ownership, recruitment capacity, the budget, and specific commitments benefiting the UK must be finalised before submission.'''
pages=[[
p('Arkhe','title'),p('Verifiable policy-bound coordination for independent agents','h1'),
p('<b>ARIA Scaling Trust | Track 2.2 - Components</b><br/>Proposed duration: six months from an agreed start date<br/>Proposal draft for applicant review | 22 October 2026'),
p('Section 0: Summary','h2'),*[p(x) for x in summary.split('\n\n')]],
[
p('Section 1: Programme & Technical','h1'),p('1.1 Problem, hypothesis and programme fit','h2'),
p("Delegation across owners creates a gap between an agent's claim and an action another party should accept. A counterpart can supply correctly signed but irrelevant evidence, reuse a receipt, change a policy, or persuade an agent to exceed its authority. Logging makes some failures visible after the event; it does not make authorisation unavoidable."),
p('<b>Research hypothesis:</b> binding requests, policies, evidence and bounded certificates to a host-enforced decision can reduce unauthorised effects without making legitimate cross-owner tasks impractical. The study will measure that trade-off rather than assume it.'),
p("The component supports the call's Report pathway and enforcement of Negotiation outcomes. It accepts an agreed policy as input; it does not claim to elicit preferences, generate cryptographic protocols, prove arbitrary software correct, or replace a security reasoner. It must be useful to multiple agents and measurable in adversarial settings. [1, 2]"),
p('1.2 Existing baseline and qualification limits','h2'),
tbl(['Research asset','Documented capability and limit'],[
['ContainmentGate','Protected-action admission and explicit policy checks. Existing profiles do not establish an unavoidable boundary for every external provider.'],
['WormGraph / SQL','Canonical objects and persistent authorisation evidence in specific profiles. Inclusion or persistence does not establish execution truth.'],
['Portable verifier','Rust core, CLI, WASM and static vectors. Cross-runtime reproducibility must be rerun for the extracted release.'],
['Budget certificate','Independent bounded arithmetic checking tied to intent, worker, policy and specification. Offline/library flow; durable proof transport remains unfinished.']], [140,CW-140]),
p('These statements derive from repository documentation and the 22 October audit, not a new execution of the full suite for this proposal. Earlier local and CI results retain their original scope. Cognitive modules and synthetic evaluations are not evidence of AGI, general model accuracy or production security. [4-8]')],
[
p('1.3 Component and trust boundary','h1'),
p('A versioned contract will expose a narrow interface: submit request and evidence; verify identity, policy and certificate bindings; return a scoped decision; execute through the host boundary; export a receipt that a separate verifier can inspect.'),
tbl(['Step','Input, processing and output'],[
['1. Delegate','Buyer supplies canonical request, actor, target, nonce, limit and policy reference. Trust roots and policy are configured independently of counterparty evidence.'],
['2. Propose','Supplier returns an offer and worker evidence. Agent output is untrusted; agents do not receive governance signing keys.'],
['3. Verify','Gate checks authentic evidence, exact commitments, current policy, scope and required review. An independent checker validates the bounded certificate.'],
['4. Authorise','Host atomically records decision and effect intent. A restricted executor enforces replay and recovery rules before a simulated effect.'],
['5. Report','Receipt binds request, policy, decision, certificate and outcome. A separate verifier checks the export against independently supplied roots and checkpoint.']], [78,CW-78]),
p('Proposed verification flow','h2'),
p('<b>Buyer agent + supplier agent</b><br/>Request / offer / untrusted evidence<br/>|<br/><b>Host: trusted roots + policy + gate + independent checker</b><br/>Verified, scoped authorisation<br/>|<br/><b>Durable journal + restricted simulated executor</b><br/>Receipt and observed outcome<br/>|<br/><b>Independent Rust / WASM verifier</b>'),
p('The flow separates proposed integration from the baseline. Durable certificate transport and the cross-owner experiment are funded work, not completed capabilities.'),
p('<b>Threat model.</b> An adversary may control a counterparty agent, its messages, evidence transport and proposed actions; it may reorder, replay or corrupt requests and interrupt services. Trusted assumptions include configured policy and roots, signing custody, verifier implementation and enforcement at the executor. Compromise of these assumptions is a limitation, not silently covered by a hash or signature.')],
[
p('1.4 Evaluation and acceptance gates','h1'),
p('Use a two-owner procurement harness: a supplier offers items; a buyer may accept only within its delegated limit and scope. Begin with simulated effects and synthetic data. Connect two distinct agent adapters to the same contract; record and freeze model and runtime versions per experiment.'),
p('Compare matched configurations: (A) execution without the component; (B) signed logging without mandatory enforcement; (C) the enforced Arkhe path. Report every run, timeout and rejection. Fixed seeds support reproduction; held-back and independently supplied attacks test beyond known fixtures.'),
tbl(['Metric','Proposed acceptance target'],[
['Security','Zero unauthorised simulated effects across the mandatory rejection suite. A bounded test result, not a universal safety claim.'],
['Utility','At least 90% completion on valid scripted tasks; no more than a 5 percentage-point reduction versus the matched logging-only baseline.'],
['Adversarial breadth','At least 12 attack classes, each with 10 parameterised cases; independent-review findings reported separately.'],
['Binding / parity','All released vectors agree between native and WASM verification; altered request, policy, worker or certificate bindings are rejected.'],
['Recovery','No duplicate simulated effect in at least 100 injected crash/retry schedules; report availability and unresolved outcomes separately.'],
['Cost and reuse','Publish p50/p95 verification latency, receipt bytes, memory and throughput on fixed hardware; demonstrate two adapters without changing core semantics.']], [105,CW-105]),
p('Attack classes: forged signer, wrong root, stale review, policy substitution, cross-owner replay, nonce reuse, target substitution, certificate transplant, arithmetic overflow, malformed encoding, missing parent evidence and interrupted persistence. Add omission, equivocation and bypass cases where the profile makes those claims testable.'),
p("Measure verification separately from inference. Establish cost baselines in month 1; agree regression budgets before implementation changes. Task success is scored by harness ground truth, not agent self-report. Publish failed runs, uncertainty and negative findings alongside successes.")],
[
p('1.5 Differentiation and risks','h1'),
p("Arkhe's proposed contribution bridges pre-effect authorisation and independently checkable post-effect evidence. Signing authenticates statements; append-only logs preserve records. Neither alone establishes that a current policy authorised a particular effect. The experiment tests added value over these baselines."),
p('The October portfolio includes CCTI, ProtoSage/ProtoBench and the Agentic Security Reasoner. These are comparison and integration points, not confirmed partners. Arkhe would expose its contract and rejection corpus for comparison rather than claim exclusive novelty or duplicate a general protocol reasoner. [3]'),
tbl(['Risk / unknown','Mitigation and decision rule'],[
['Boundary bypass','Route every experimental effect through the host. Test alternative paths; a bypass blocks security claims and milestone acceptance.'],
['False / incomplete evidence','Separate authenticity from observed truth. Require independent harness observations; expose omitted or unverifiable facts.'],
['Policy drift / ambiguity','Use versioned explicit predicates and exact bindings. Reject changed or unsupported profiles; human review resolves ambiguous scope.'],
['Replay / crash semantics','Atomic decision/outbox persistence and executor idempotency. Test failpoints; do not generalise simulated results to arbitrary APIs.'],
['Privacy / trace leakage','Synthetic inputs first; minimise exports and document retention. No zero-knowledge or inference-confidentiality claim.'],
['Verifier defects','Bound input sizes, fuzz parsers, preserve static vectors, compare native/WASM, and obtain independent security review.'],
['Generalisation','Thin adapters, two integrations and held-back variants. Arena access and evolving interfaces remain dependencies.'],
['Delivery capacity','Assign qualified technical owners before submission. Recruit missing expertise; re-scope or defer if capacity is not secured.']], [125,CW-125]),
p('<b>Scope and dependencies.</b> Development hardware, qualified Rust/security engineering, independent review, authenticated root distribution and reproducible agent runtimes are required. No new cryptographic primitive, TEE guarantee, physical verification, arbitrary-program proof, real-money settlement or AGI claim is required for this component study.')],
[
p('1.6 Six-month project plan','h1'),
tbl(['Period','Work and reviewable exit gate'],[
['Month 1','Freeze threat model, API, snapshot and experiment protocol. Assign technical owners; inventory rights. Exit: agreed specification and runnable baseline harness.'],
['Month 2','Extract verification boundary and evidence profile. First adapter and fixtures. Exit: native/WASM parity and binding tests pass.'],
['Month 3','Durable certificate transport and journal-to-executor binding. Exit: crash/retry, rollback and replay gates pass.'],
['Month 4','Second adapter and multi-owner adversarial evaluation. Exit: matched A/B/C runs and mandatory attack matrix published.'],
['Month 5','Independent review, remediation and affected retests. Seek integration feedback. Exit: findings, dispositions and retest evidence.'],
['Month 6','Release code, verifier package, corpus and guide. Exit: clean-environment reproduction and report against all targets.']], [78,CW-78]),
p('Section 2: The Team','h1'),
p('<b>Rafael Oliveira - Project lead; psychologist and independent researcher.</b> Full-time availability, as stated by the applicant. Proposed duties: research framing, human delegation requirements, experiment coordination, evidence review and reporting. Rafael must confirm relevant prior contributions, technical competencies and personal motivation; implementation authorship is not inferred from repository access.'),
p('<b>Jameson Bednarski - Independent researcher.</b> Identified by the applicant as a collaborator. Allocation, start date, specialism, duties and prior contributions remain unconfirmed. This draft assigns no unverified technical qualification or hiring commitment.'),
p('<b>Technical ownership.</b> Rust/systems implementation, adversarial evaluation and independent review require qualified named owners before submission. No subcontractor, reviewer or UK institution is confirmed. The plan assumes capacity can be secured by kickoff; otherwise revise scope and schedule.'),
p('<b>Coordination.</b> Proposed weekly delivery review, fortnightly demonstrations and monthly risk review. Each milestone has one accountable owner and a reproducible evidence bundle. Reviewers assess remediation of their findings. Team motivation and short biographies await applicant confirmation.')],
[
p('References and completion notes','h1'),
p('[1] ARIA. Scaling Trust: Call for proposals - Rolling applications, v2.0, 4 September 2026. Sections 2-3 and 5-7. Applicant-supplied PDF. Funding page: aria.org.uk/opportunity-spaces/trust-everything-everywhere/scaling-trust/funding.'),
p('[2] ARIA. Scaling Trust Programme Thesis v2.0, February 2026. aria.org.uk/media/dkhlumky/scaling-trust-programme-thesis.pdf.'),
p('[3] Scaling Trust team. Building the Scaling Trust portfolio, 7 October 2026. scalingtrust.org.uk/blog/building-the-scaling-trust-portfolio/.'),
p('[4] Arkhe local source: docs/audits/2026-10-22-specification-audit.md. Scoped implementation coverage and validation limits.'),
p('[5] Arkhe local source: docs/PROOF-CARRYING-BUDGET.md. Arithmetic predicate, independent checker, gate integration and remaining transport limits.'),
p('[6] Arkhe local sources: verification/README.md; verification/docs/ARCHITECTURE.md; verification/docs/ADR/ADR-0004-golden-vectors-independence.md.'),
p('[7] Arkhe local sources: docs/STATUS.md; docs/SECURITY-MODEL.md; docs/SOURCE-TRACEABILITY.md. Historical claims are not fresh qualification.'),
p('[8] Arkhe local sources: docs/E01-CLEAN-ONBOARDING-CHECKLIST.md; docs/E01-REVIEW-INTAKE-2026-10-21.md. Participant evidence remains incomplete in the inspected record.'),
p('Applicant completion notes - remove before submission','h2'),
p("This is a review draft, not a ready-to-submit application. The work plan and numerical targets are proposals, not existing achievements or confirmed commitments. Team identities and Rafael's full-time availability were supplied by the applicant. Other staffing details remain open."),
p('Confirm biographies, motivation, allocation and availability; secure delivery/review capacity; agree a costed budget; establish background-IP rights; and provide a credible UK-benefit plan. No partnership, adoption commitment or Arena access is represented as secured.'),
p("Complete the portal's separate administrative responses, cost template and commercial hypothesis. Funding amount, other support, conflicts, applicant status and terms require applicant input. Replace local source references with accessible, versioned evidence links for evaluators."),
p("AI assisted the structure and drafting from applicant information, local documentation and programme materials. Applicants must verify all claims and commitments and comply with current ARIA guidance.")]]

out=Path('output/pdf');out.mkdir(parents=True,exist_ok=True)
path=out/'Arkhe-ARIA-Track-2.2-Proposal-Draft.pdf'
c=canvas.Canvas(str(path),pagesize=(W,H))
c.setTitle('Arkhe - ARIA Scaling Trust Track 2.2 - Proposal draft')
c.setAuthor('Rafael Oliveira; Jameson Bednarski - draft for review')
positions=[]
for idx,items in enumerate(pages):
    c.setFillColor(colors.black);c.setStrokeColor(colors.black)
    c.setFont('Arial',11);c.drawString(M,H-45,'ARKHE | SCALING TRUST | TRACK 2.2');c.line(M,H-51,W-M,H-51)
    y=H-66
    for item in items:
        if item[0]=='p':
            _,txt,sty=item
            obj=Paragraph(txt,styles[sty]);_,hh=obj.wrap(CW,H);obj.drawOn(c,M,y-hh);y-=hh+styles[sty].spaceAfter
        else:
            _,headers,rows,widths=item
            data=[[Paragraph('<b>'+x+'</b>',styles['cell']) for x in headers]]+[[Paragraph(x,styles['cell']) for x in row] for row in rows]
            obj=Table(data,colWidths=widths,hAlign='LEFT')
            obj.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.5,colors.black),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
            _,hh=obj.wrap(CW,H);obj.drawOn(c,M,y-hh);y-=hh+11
    if y<48: raise RuntimeError(f'Page {idx+1} overflow: {y}')
    positions.append(round(y,1))
    c.setFont('Arial',11);c.drawString(M,39,'DRAFT - applicant confirmation required');c.drawRightString(W-M,39,f'{idx+1} / {len(pages)}');c.showPage()
c.save()
assert len(summary.split())<=500
print(path.resolve())
print(json.dumps({'pages':len(pages),'summary_words':len(summary.split()),'bottom_positions':positions,'minimum_font':11,'font':'Arial','body_leading':12.65,'body_margin_pt':M}))

