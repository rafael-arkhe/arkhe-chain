To: Filip Blagojević <filip@resomnium.com>
Subject: Following up on our call — exploring a CellOS × Arkhe pilot

Hi Filip,

Thanks again for the brief Google Meet call. I spent some time afterward reading your Cell essays and reviewing the public CellOS code, and I would like to explore a concrete collaboration between Resomnium and Arkhe.

What resonated most was the principle that every agent’s accountability chain ends with a human. The distinction between the steward who owns a judgment and the agents executing beneath that responsibility is closely aligned with how I am developing Arkhe.

Arkhe is a governance and evidence project that separates an agent’s proposal from the authority to act. Its prototype components include policy gates, signed evidence, and independent offline verification. These are development-stage capabilities with documented limits; a production integration would need to be qualified together.

I see a possible collaboration around an optional CellOS–Arkhe adapter: bind a specific action to its cell definition, policy version, responsible steward, and human approval, then export evidence that another party can verify. Since Resomnium already works with scoped authority and signed receipts, I would first want to understand your existing implementation and where an adapter would add value.

I also noticed the open discussion in CellOS issue #1 about typed actions and recomputable scope decisions. That seems like a useful starting point for comparing priorities and contributing a working integration.

For a first experiment, we could use a simple artifact-release workflow: an agent prepares a file, the steward approves its exact digest, and a controlled executor releases that file into a test environment. We would check the successful path alongside rejection cases such as a changed artifact, missing approval, or a replayed request. The output could be a small adapter, a reproducible demo, and an evidence bundle checked independently of the coordinating process.

My contribution would focus on Arkhe’s authorization and evidence components. Resomnium would bring the Cell model and help select a workflow that matters in practice. If the experiment proves useful, we could explore a broader open-source collaboration or a joint offering around accountable agent operations.

Would you be open to a 30-minute technical follow-up to compare this with your roadmap and choose a suitable first use case?

Best,
Rafael
