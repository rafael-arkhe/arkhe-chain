use agi_coder_core::ContentHash;
use agi_coder_verification::*;
// Spawn this test executable as a portable external test command.
fn command(test: &str) -> TestCommand {
    TestCommand {
        program: std::env::current_exe().unwrap().to_string_lossy().into(),
        args: vec!["--exact".into(), test.into(), "--ignored".into()],
        working_directory: std::env::current_dir().unwrap(),
    }
}
#[test]
#[ignore = "subprocess fixture"]
fn child_pass() {}
#[test]
#[ignore = "subprocess fixture"]
fn child_fail() {
    panic!("mutant violates specification");
}
#[test]
#[ignore = "subprocess fixture"]
fn child_slow() {
    std::thread::sleep(std::time::Duration::from_secs(10));
}
fn campaign() -> ProcessCampaign {
    ProcessCampaign {
        specification_digest: ContentHash::hash(b"independent tests"),
        specification_author: "reviewer".into(),
        implementation_author: "worker".into(),
        baseline: command("child_pass"),
        mutants: vec![PreparedMutant {
            id: "wrong-comparison".into(),
            test: command("child_fail"),
        }],
        timeout_milliseconds: 2000,
        minimum_score_basis_points: 10000,
    }
}
#[test]
fn real_process_mutation_and_failed_baseline() {
    let mut c = campaign();
    let r = c.run().unwrap();
    assert!(r.accepted);
    assert_eq!(r.score_basis_points, 10000);
    c.baseline = command("child_fail");
    let r = c.run().unwrap();
    assert!(!r.accepted);
    assert!(r.outcomes.is_empty());
}
#[test]
fn timeouts_and_spawn_errors_are_not_killed_mutants() {
    let mut c = campaign();
    // Leave room for Windows child-process startup under nextest concurrency.
    c.timeout_milliseconds = 2000;
    c.mutants[0].test = command("child_slow");
    let r = c.run().unwrap();
    assert!(!r.accepted);
    assert_eq!(r.outcomes[0].1, ProcessOutcome::TimedOut);
    assert_eq!(r.score_basis_points, 0);
    c.mutants[0].test.program = "agi-coder-nonexistent-binary".into();
    let r = c.run().unwrap();
    assert!(!r.accepted);
    assert!(matches!(r.outcomes[0].1, ProcessOutcome::Error(_)));
}
