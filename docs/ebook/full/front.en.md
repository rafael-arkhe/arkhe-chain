# Preface

An agent proposes an action. A person or policy permits it. A service attempts
it. Later, another team asks what happened and why. This book is about the
contracts needed to connect those statements without making the producer's
explanation the final authority.

The subject is practical engineering of evidence and authorization. Arkhe
provides native types and checkers that we inspect directly. A separate offline
teaching application provides a complete small workflow that can be executed,
broken, and inspected without a production account. The application is not a
replacement for the native kernel. Its deliberately simpler profile makes
failure boundaries visible before a reader implements a real integration.

The intended reader is an engineer responsible for systems that can change
external state. Security reviewers, operators, and governance owners will find
the same decisions expressed as evidence requirements, state transitions, and
acceptance procedures. Basic programming and familiarity with API requests,
hashes, signatures, and database transactions are helpful. Formal proof expertise
is not required to run the arithmetic example.

## The Question Each Part Answers

Part I defines the verification problem and establishes who owns each claim.
Part II explains the architecture, canonical identities, inclusion, and checked
output certificates. Part III develops host integration, journaling, evidence
adapters, and client interfaces. Part IV addresses policy changes, disputes,
and costs. Part V applies those principles to code, distributed computation,
and content provenance. Part VI provides a glossary, contract reference,
operational checklist, and reproduction ledger.

Each numbered chapter contains a concrete problem, implementation analysis,
a worked engineering case, and an exercise with acceptance criteria. The
worked cases expand the component descriptions into decisions a reader can
make: which bytes are compared, when a state is durable, what a caller may
retry, how a policy change affects queued work, and which observation supports
a result. This is the complete assembled reading edition, not an outline of
chapters to be written later.

## How the Sources Were Selected

Sources have different roles. Specifications define protocols; original
research proposes methods; maintainers describe their interfaces; operational
accounts expose practical failure modes. An engineering conclusion should
identify which kind of source supports it. When a claim concerns Arkhe's
behavior, local code and reproducible tests take precedence over a description
of another system.

The research cutoff is October 22, 2026. The bibliography retains exact source
names and versions. The two newly discussed agent-evidence profiles are
individual Internet-Drafts, not adopted standards. The cited execution-proof
and contract-proof publications are research, not proof that the local kernel
implements their models. Final post-quantum signature specifications define
algorithms; they do not by themselves validate an application or require a
particular deployment to use a hybrid envelope.

The engineering material is written independently. References explain the
origin and limits of a concept; they are not pasted implementation instructions.
No market-growth claim, claimed performance result of another project, or
vendor assurance level is presented as measured Arkhe capability.

## Two Laboratories, Two Sets of Claims

The native arithmetic laboratory belongs to the main workspace. It uses the
repository's canonical identity rules and independently checked finite
certificate. Run it from the repository root:

```powershell
cargo run --locked -p arkhe-kernel --example budget_pco
```

The companion publisher laboratory is separate:

```powershell
python docs/ebook/lab/publisher.py --output docs/ebook/evidence/publisher-demo.json
python -m unittest discover -s docs/ebook/lab -v
```

It uses only the Python standard library, deterministic JSON, SHA-256, and a
fixture HMAC. HMAC provides a shared-secret teaching mechanism; it is not a
publicly verifiable signature. Its profile is `book-publisher-lab/v1`, not an
Arkhe wire protocol, a COSE envelope, or a post-quantum implementation.
Its simulated destination is a local database, and its databases are isolated
temporary files. It performs no network publication or payment.

The lab demonstrates accepted and rejected authorization, a durable reservation,
receipt replay, loss of acknowledgment after a local effect, lineage gating,
and checking an event chain against a retained head. Its limitations are part
of the lesson: it has no production identity service, owner-token recovery API,
qualified sandbox, or public transparency service. A reader can study these
boundaries without pretending the demonstrator supplies them.

## Read Evidence Labels Literally

An **inspected implementation** is a statement about identified source code.
A **reproduced result** records a command and observed outcome. A **synthetic
scenario** is invented to explain a contract. A **proposed integration** is
additional work, even when its design is detailed. A **qualified deployment**
would require evidence for the actual environment and operational scope; a
passing unit test does not supply it.

These labels are not confidence percentages. They prevent an observation from
being silently promoted into a stronger conclusion. A statement can be
authenticated yet false, included yet stale, authorized yet not executed, or
arithmetically correct yet based on invented costs.

## Independence, Rights, and Publication Details

This is an independent publication. Third-party names appear in references and
literal technical identifiers where necessary for accuracy. They do not imply
sponsorship, endorsement, certification, or permission to use a third party's
marks as a product identity. The cover contains the project title and subtitle.

This manuscript includes AI-generated text and requires the publisher's own
rights and platform-disclosure decisions. The author is Rafael Oliveira, as
supplied by the publisher. No ISBN, copyright ownership, or license is
invented in this edition. The technical
manuscript can be complete while those publication details remain unresolved.
The final publication checklist distinguishes those tasks from writing content.

All examples assume explicit authority to operate the environment used. The
companion lab is designed to run locally without external effects. Commands
that would need real providers, credentials, or qualified infrastructure are
described as integration requirements rather than executed demonstrations.
