#!/usr/bin/env python3
from pathlib import Path
import sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/01-Consolidated-Normative-Snapshot.md")
text = p.read_text(encoding="utf-8")

checks = [
    ("Finding schema excludes severity",
     "`severity` is not a field of Finding." in text),
    ("Eligibility uses FindingDisposition",
     "`Finding.severity == BLOCKING => NotEligible`" in text
     and "`exists d: d.disposition == BLOCKING => NotEligible`" in text),
    ("QualifiedClaimRef excluded",
     "`QualifiedClaimRef` is not part of the PoC." in text),
    ("PolicyCore not assumed",
     "There is no Arkhe `PolicyCore` in this snapshot." in text),
    ("DomainPolicy deferred",
     "`DomainPolicy` is deferred" in text),
    ("W02-04 blocker visible",
     "`W02-04 = OPEN" in text),
    ("W02-09 blocker visible",
     "`W02-09 = BLOCKED" in text),
]

print("Snapshot audit:", p)
failed = False
for name, ok in checks:
    print(("PASS" if ok else "FAIL"), "-", name)
    failed |= not ok
sys.exit(1 if failed else 0)
