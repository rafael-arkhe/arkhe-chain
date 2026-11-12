# meshwatch status dashboard: spec

1. Release manifests are signed with Ed25519 and verified in the browser before the "Manifest" badge turns green.
2. The health badge reflects live probes of the mesh; it turns red when any probe fails.
3. The deploy pipeline view shows the true state of each stage.
4. Every node is hardware-attested (TPM 2.0) before it joins the mesh.
5. The node counter shows how many nodes are online right now.
