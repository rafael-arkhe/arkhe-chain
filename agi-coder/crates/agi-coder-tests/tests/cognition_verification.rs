use agi_coder_cognition::*;
use agi_coder_verification::*;
#[test]
fn dependency_cycles_and_missing_nodes_are_rejected() {
    let task = |id: &str, deps: Vec<String>| Task {
        id: id.into(),
        description: id.into(),
        dependencies: deps,
        status: TaskStatus::Pending,
        attempts: 0,
    };
    assert!(Planner::build(
        "goal".into(),
        vec![task("a", vec!["b".into()]), task("b", vec!["a".into()])],
        2
    )
    .is_err());
    assert!(Planner::build("goal".into(), vec![task("a", vec!["missing".into()])], 2).is_err());
    assert!(Planner::build("goal".into(), vec![task("a", vec![]), task("a", vec![])], 2).is_err());
}
#[test]
fn failed_verification_blocks_downstream_and_exhausts_retries() {
    let mut plan = Planner::software("goal".into()).unwrap();
    assert!(plan.start("deploy").is_err());
    for _ in 0..3 {
        plan.start("design").unwrap();
        plan.finish("design", false).unwrap();
    }
    assert_eq!(plan.tasks["design"].status, TaskStatus::Failed);
    assert!(plan.next_ready().is_none());
    assert!(!plan.is_complete());
}
struct Env {
    actions: u32,
}
impl AgentEnvironment for Env {
    fn perceive(&mut self) -> Result<String, PlanError> {
        Ok("observation".into())
    }
    fn act(&mut self, _: &str) -> Result<(), PlanError> {
        self.actions += 1;
        Ok(())
    }
    fn verify(&mut self, _: &str) -> Result<bool, PlanError> {
        Ok(true)
    }
}
#[test]
fn bounded_loop_resumes_and_finishes_in_dependency_order() {
    let mut state = WorkingState {
        plan: Planner::software("goal".into()).unwrap(),
        observations: vec![],
        steps: 0,
    };
    let mut env = Env { actions: 0 };
    assert!(run_bounded(&mut state, &mut env, 2).is_err());
    assert_eq!(state.steps, 2);
    run_bounded(&mut state, &mut env, 3).unwrap();
    assert!(state.plan.is_complete());
    assert_eq!(env.actions, 5);
}
#[test]
fn mutation_score_requires_baseline_and_independent_specification() {
    let spec = Specification {
        requirement: "Return twice the input".into(),
        author: "reviewer".into(),
        cases: vec![
            Case {
                input: 0,
                expected: 0,
            },
            Case {
                input: 2,
                expected: 4,
            },
            Case {
                input: -3,
                expected: -6,
            },
        ],
    };
    let baseline = |x: i64| Ok(x * 2);
    let plus = |x: i64| Ok(x + 2);
    let constant = |_: i64| Ok(0);
    let equivalent = |x: i64| Ok(x + x);
    let mutants = [
        Mutant {
            id: "plus".into(),
            implementation: &plus,
        },
        Mutant {
            id: "constant".into(),
            implementation: &constant,
        },
        Mutant {
            id: "equivalent".into(),
            implementation: &equivalent,
        },
    ];
    let verifier = SpecificationVerifier {
        minimum_score_basis_points: 7000,
    };
    let report = verifier
        .verify(&spec, "worker", &baseline, &mutants)
        .unwrap();
    assert_eq!(report.score_basis_points, 6666);
    assert!(!report.accepted);
    assert!(
        !verifier
            .verify(&spec, "worker", &constant, &mutants[..2])
            .unwrap()
            .accepted
    );
    assert!(verifier
        .verify(&spec, "reviewer", &baseline, &mutants)
        .is_err());
    assert!(verifier.verify(&spec, "worker", &baseline, &[]).is_err());
    assert!(
        verifier
            .verify(&spec, "worker", &baseline, &mutants[..2])
            .unwrap()
            .accepted
    );
}
#[test]
fn memory_round_trip_preserves_sources_and_refuses_overwrite() {
    let path = std::env::temp_dir().join(format!(
        "agi-memory-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ));
    let mut memory = agi_coder_memory::Memory::default();
    memory.working.context.insert("goal".into(), "test".into());
    memory.facts.push(agi_coder_memory::semantic::Fact {
        text: "Rust dependency".into(),
        source: agi_coder_core::ContentHash::hash(b"source"),
    });
    memory.save(&path).unwrap();
    assert!(memory.save(&path).is_err());
    let loaded = agi_coder_memory::Memory::load(&path).unwrap();
    assert_eq!(loaded.working.context["goal"], "test");
    assert_eq!(
        agi_coder_memory::semantic::search(&loaded.facts, "RUST").len(),
        1
    );
    std::fs::remove_file(path).unwrap();
}
#[test]
fn research_resolution_requires_evidence_and_costs_check_overflow() {
    use agi_coder_core::*;
    use agi_coder_research::*;
    let source = Source::capture(
        "https://example.test/spec".into(),
        Timestamp(1),
        "requirement".into(),
    );
    assert!(source.verify());
    let mut h = Hypothesis {
        statement: "claim".into(),
        outcome: Outcome::Pending,
        evidence: vec![],
    };
    assert!(h.resolve(Outcome::Supported, vec![]).is_err());
    h.resolve(Outcome::Supported, vec![source.digest]).unwrap();
    assert!(h.resolve(Outcome::Refuted, vec![source.digest]).is_err());
    let mut cost = agi_coder_cost::CostTracker::default();
    cost.record(agi_coder_cost::CostEntry {
        category: "estimated".into(),
        micro_usd: u64::MAX,
        measured: false,
    })
    .unwrap();
    assert!(cost
        .record(agi_coder_cost::CostEntry {
            category: "overflow".into(),
            micro_usd: 1,
            measured: true
        })
        .is_err());
}
