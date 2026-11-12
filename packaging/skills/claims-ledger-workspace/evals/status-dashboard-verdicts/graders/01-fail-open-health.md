---
type: llm
focus: trace
weight: 1
---

The output identifies that HealthBadge.tsx shows Healthy when health is null or ok is missing (the ?? true default), i.e. it fails open.
