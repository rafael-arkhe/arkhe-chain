# Arkhe and Saifuro partnership brief

Prepared for Saifuro by Rafael Oliveira. Discussion proposal dated 27 October 2026. No partnership, production integration or commercial commitment is implied.

## Proposed evaluation

I propose a bounded pilot to test whether Arkhe can package Saifuro authorization records and separately collected execution evidence into independently verifiable audit bundles. Saifuro already describes a decision log. The pilot would measure what an additional verification layer contributes to an existing workflow.

## Intended customer outcome

A reviewer could verify the integrity and provenance of disclosed records using a retained bundle and approved trust material. The bundle would distinguish a signed authorization from a later payment outcome. Missing or conflicting evidence would remain visible rather than being presented as a successful settlement.

## Responsibility boundary

Saifuro would remain responsible for its authorization service and signing model. Customer payment systems would retain authority to execute payments. Arkhe would receive only the agreed evidence fields and would not receive wallet keys, custody rights or authority to release escrow funds. This is a proposed architecture requiring implementation and review.

## Pilot outline

Use synthetic or approved sandbox records. Agree the evidence schema and trust model. Build a minimal ingestion adapter and export an offline bundle. Test modifications, duplicate events and missing outcomes. Compare the review process with the current log export. Jointly decide whether the measured benefit supports a commercial phase.

## Commercial and IP approach

A fixed pilot scope would separate engineering services from any license to specifically identified private materials. Existing open source rights would remain intact. Ownership of new connectors would be agreed per deliverable before development. No transaction volume, pricing, equity grant or audit saving is assumed.

## Proposed next step

Confirm a technical counterpart and exchange a short written problem statement. A separate NDA and evaluation agreement can cover restricted materials if both teams choose to proceed. My main contribution is Web3 product reasoning, context engineering and written specifications supported by AI. Production Solidity ownership would require an experienced smart contract engineer.
