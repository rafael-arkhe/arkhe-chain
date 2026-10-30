# LEX-ASCII-1: external conformance and conceptual review

Implement this contract from this document alone. Do not consult the organizer's
prior implementations, test answers, repository, or conversation. Disclose any
prior access rather than claiming clean-room independence. Choose your own
language, implementation technique and tests. Return source and result JSONL;
do not submit only an asserted score. No network or model access is required.

## Scope

This is a lexical heuristic, not entailment, truth, authorization, signatures,
retrieval, runtime attestation or general intelligence. Conformance and adequacy
are separate questions. The contract was documented from an existing profile;
agreement with it is not evidence that its design is sound. Report defects even
if implementing them is necessary for conformance.

## Input and output

Each input JSONL row has case_id, claim (text and evidence_id), and an evidence
array of objects with id and text. IDs are unique, nonempty and use ASCII letters,
digits, underscore, dot, colon or hyphen. Each text is at most 32768 characters.
The supported text alphabet is printable ASCII plus tab, carriage return and
newline. A claim must not be empty after whitespace trimming. Cases are independent.

Return exactly one JSONL row per case, in any order. A row contains case_id and
verdict. Verdict has exactly these six fields:

- status: PASS_LEXICAL, FAIL_LEXICAL or UNSUPPORTED.
- error_kind: null, UnknownEvidence, EntityNotInEvidence, InsufficientSupport or
  UnsupportedProfile.
- evidence_id: the input claim's evidence_id.
- entity: the first missing entity token, otherwise null.
- jaccard_numerator: raw intersection cardinality, or null if not calculated.
- jaccard_denominator: raw union cardinality, or null if not calculated.

Do not reduce the cardinalities as a fraction. Do not substitute a rounded score
for them. If a case is outside the supported profile, return UNSUPPORTED with
UnsupportedProfile and null entity/cardinalities. Do not inspect other cases.

## Token boundaries

Scan left to right. At an ASCII digit, or a hyphen immediately followed by an
ASCII digit, start a numeral. Consume digits and any repeated dot-or-comma plus
following digit groups. The sign, dots and commas stay in the numeral. Otherwise,
at an ASCII letter or underscore start a word and consume subsequent ASCII
letters, digits and underscores. Every remaining character is punctuation or
whitespace; it separates tokens and is ignored. A digit inside a word stays in
that word. A digit-started token does not absorb subsequent letters.

## Ordered checks

1. Validate the supported profile. Resolve evidence_id by exact ID equality.
   If absent: FAIL_LEXICAL, UnknownEvidence, null entity and cardinalities.
2. In token order, every numeral and every word starting with A-Z is an entity,
   except the capitalized exceptions below. For each entity, require its exact
   case-sensitive character sequence to appear somewhere in the cited text.
   Presence is a substring check, NOT token equality. The first absent entity
   yields FAIL_LEXICAL, EntityNotInEvidence and that token; cardinalities are null.
3. Create a set of lowercase word tokens in the claim and a set in the cited
   evidence. Ignore numeral tokens and remove lowercase stopwords below. Duplicate
   words count once. Let n be intersection size and d union size.
4. If d is zero, score is defined as zero and the result is FAIL_LEXICAL with
   InsufficientSupport and cardinalities 0,0. Otherwise PASS_LEXICAL iff 2*n >= d;
   below the threshold return FAIL_LEXICAL with InsufficientSupport. Entity is null.
   A passing verdict has error_kind null.

Capitalized entity exceptions, exact spelling:

The This That These Those However Therefore In On At For But And Or A An It We
They He She I You If When While Although Because Since After Before During As
By Of To With From Not No Yes

Lowercase keyword stopwords:

the a an is are was were be been being of to in on at for with by from as and or
but not no if then than that this it its we they he she i you his her their our
your my me us them him

## Required review alongside conformance

Describe the consequences of negation removal, substring numeral presence,
capitalization, and paragraph length for false accepts and false rejects. Propose
counterexamples and changes separately; do not quietly change this contract to
improve your conformance result. State which claims about semantic support would
be unjustified even if all cases match.

## Provenance and independence

Fill the submission manifest honestly, identify the author/team and organization
(a stable reviewer identifier is sufficient), disclose source access, and supply
the SHA-256 of the actual source/archive. Statements of independence are claims
to be checked by a human organizer; they do not automatically establish it.
Third-implementation agreement alone does not authorize production trust
promotion, prove semantic validity, or change any AGI/capability classification.
