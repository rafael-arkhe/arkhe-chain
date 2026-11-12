//! Local checks for the ten faculties named by DeepMind's cognitive framework.
//! Each verdict is recomputed from the file. None of these checks loads a model,
//! compares a human baseline, edits a repository, or deploys.

use crate::planner::Planner;
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FacultyReport {
    pub verdict: &'static str,
    pub reason: String,
}

const PROGRAMS: [&str; 4] = [
    "identity",
    "transpose",
    "flip_horizontal",
    "flip_vertical",
];

#[derive(Debug, Deserialize)]
struct GenerationFile {
    train: Vec<PairFile>,
    test_input: Vec<Vec<u8>>,
    test_output: Vec<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct PairFile {
    input: Vec<Vec<u8>>,
    output: Vec<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct ExecutiveFile {
    goal: String,
    completed: Vec<String>,
    production: bool,
    editor: bool,
}

#[derive(Debug, Deserialize)]
struct SocialFile {
    program: String,
    input: Vec<Vec<u8>>,
    claimed_output: Vec<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct MetacognitionFile {
    program: String,
    input: Vec<Vec<u8>>,
    output: Vec<Vec<u8>>,
    recorded_verdict: String,
}

#[derive(Debug, Deserialize)]
struct PerceptionFile {
    frame: Vec<Vec<u8>>,
    reported: Vec<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct AttentionFile {
    frame: Vec<Vec<u8>>,
    target: u8,
    selected: Vec<[u8; 2]>,
}

#[derive(Debug, Deserialize)]
struct MemoryFile {
    stored: Vec<Vec<u8>>,
    recalled: Vec<Vec<u8>>,
    delay_steps: u32,
}

#[derive(Debug, Deserialize)]
struct ReasoningFile {
    program: String,
    premise: Vec<Vec<u8>>,
    conclusion: Vec<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct ProblemFile {
    frame: Vec<Vec<u8>>,
    target: u8,
    selected: Vec<[u8; 2]>,
    program: String,
    premise: Vec<Vec<u8>>,
    conclusion: Vec<Vec<u8>>,
}

pub fn check_perception(body: &[u8]) -> Result<FacultyReport, String> {
    let file: PerceptionFile = serde_json::from_slice(body)
        .map_err(|_| "perception file must include frame and reported".to_string())?;
    let frame = parse_grid(&file.frame)?;
    let reported = parse_grid(&file.reported)?;
    if reported == frame {
        Ok(pass(
            "the reported frame matches the grid that was read. This is not a human sensory baseline.",
        ))
    } else {
        Ok(fail("the reported frame does not match the grid that was read"))
    }
}

pub fn check_attention(body: &[u8]) -> Result<FacultyReport, String> {
    let file: AttentionFile = serde_json::from_slice(body).map_err(|_| {
        "attention file must include frame, target, and selected".to_string()
    })?;
    if file.target > 9 {
        return Err("target must be 0 to 9".into());
    }
    let frame = parse_grid(&file.frame)?;
    if file.selected == cells_with(&frame, file.target) {
        Ok(pass(
            "the selected cells are the target and the other values were left out. This is not a sustained-attention evaluation.",
        ))
    } else {
        Ok(fail(
            "the selection includes a distractor or misses a target cell",
        ))
    }
}

pub fn check_learning(body: &[u8]) -> Result<FacultyReport, String> {
    let file: GenerationFile = serde_json::from_slice(body).map_err(|_| {
        "learning file must include train, test_input, and test_output".to_string()
    })?;
    if file.train.iter().any(|pair| {
        pair.input == file.test_input && pair.output == file.test_output
    }) {
        return Ok(fail(
            "the held-out pair was already in the training set",
        ));
    }
    let report = check_generation(body)?;
    if report.verdict == "pass" {
        Ok(pass(
            "the rule fit on the training pairs and applied to a new pair. This is not a human-baseline learning evaluation.",
        ))
    } else {
        Ok(report)
    }
}

pub fn check_memory(body: &[u8]) -> Result<FacultyReport, String> {
    let file: MemoryFile = serde_json::from_slice(body).map_err(|_| {
        "memory file must include stored, recalled, and delay_steps".to_string()
    })?;
    let stored = parse_grid(&file.stored)?;
    let recalled = parse_grid(&file.recalled)?;
    if file.delay_steps == 0 {
        return Ok(fail(
            "delay_steps must be at least 1; a same-step copy is not retrieval over time",
        ));
    }
    if recalled == stored {
        Ok(pass(
            "the recall matches the stored grid. The delay is a count in the file, not a restart, and this is not a human memory baseline.",
        ))
    } else {
        Ok(fail("the recall does not match the stored grid"))
    }
}

pub fn check_reasoning(body: &[u8]) -> Result<FacultyReport, String> {
    let file: ReasoningFile = serde_json::from_slice(body).map_err(|_| {
        "reasoning file must include program, premise, and conclusion".to_string()
    })?;
    let premise = parse_grid(&file.premise)?;
    let conclusion = parse_grid(&file.conclusion)?;
    if apply(&file.program, &premise)? == conclusion {
        Ok(pass(
            "the conclusion follows from the program. This is not a general reasoning benchmark.",
        ))
    } else {
        Ok(fail("the conclusion does not follow from the program"))
    }
}

pub fn check_problem_solving(body: &[u8]) -> Result<FacultyReport, String> {
    let file: ProblemFile = serde_json::from_slice(body).map_err(|_| {
        "problem file must include frame, target, selected, program, premise, and conclusion"
            .to_string()
    })?;
    let attention = serde_json::to_vec(&serde_json::json!({
        "frame": file.frame,
        "target": file.target,
        "selected": file.selected,
    }))
    .map_err(|error| error.to_string())?;
    let attention = check_attention(&attention)?;
    if attention.verdict != "pass" {
        return Ok(attention);
    }
    let reasoning = serde_json::to_vec(&serde_json::json!({
        "program": file.program,
        "premise": file.premise,
        "conclusion": file.conclusion,
    }))
    .map_err(|error| error.to_string())?;
    let reasoning = check_reasoning(&reasoning)?;
    if reasoning.verdict != "pass" {
        return Ok(reasoning);
    }
    Ok(pass(
        "the target cells were selected and the conclusion follows. This does not compare the result with a human baseline.",
    ))
}

pub fn check_generation(body: &[u8]) -> Result<FacultyReport, String> {
    let file: GenerationFile =
        serde_json::from_slice(body).map_err(|_| "generation file must include train, test_input, and test_output".to_string())?;
    let train = file
        .train
        .iter()
        .map(|pair| -> Result<_, String> {
            Ok((parse_grid(&pair.input)?, parse_grid(&pair.output)?))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if train.is_empty() {
        return Err("generation needs at least one training pair".into());
    }
    let test_input = parse_grid(&file.test_input)?;
    let test_output = parse_grid(&file.test_output)?;
    let fits: Vec<&str> = PROGRAMS
        .into_iter()
        .filter(|program| {
            train.iter().all(|(input, output)| {
                apply(program, input).is_ok_and(|got| &got == output)
            })
        })
        .collect();
    let report = match fits.as_slice() {
        [program] => {
            let got = apply(program, &test_input)?;
            if got == test_output {
                pass(format!(
                    "generated {program} from the closed set; the held-out test matched. This is not model generation."
                ))
            } else {
                fail(format!(
                    "generated {program}; the held-out test did not match"
                ))
            }
        }
        [] => fail("no program in the closed set fits the training pairs"),
        many => fail(format!(
            "generation is ambiguous: {}",
            many.join(", ")
        )),
    };
    Ok(report)
}

pub fn check_executive(body: &[u8]) -> Result<FacultyReport, String> {
    let file: ExecutiveFile = serde_json::from_slice(body).map_err(|_| {
        "executive file must include goal, completed, production, and editor".to_string()
    })?;
    if file.completed.is_empty() {
        return Ok(fail("no stage was executed"));
    }
    let mut plan = Planner::software(file.goal).map_err(|error| error.to_string())?;
    for id in &file.completed {
        if let Err(error) = plan.start(id).and_then(|_| plan.finish(id, true)) {
            return Ok(fail(format!("{id} is not the next ready stage: {error}")));
        }
    }
    if file.production || file.editor {
        return Ok(fail(
            "production and editor stay false; this check does not deploy or edit a repository",
        ));
    }
    Ok(pass(
        "executed a planner prefix in order. production and editor stay false",
    ))
}

pub fn claim_matches(body: &[u8]) -> Result<bool, String> {
    let file: SocialFile = serde_json::from_slice(body).map_err(|_| {
        "social file must include program, input, and claimed_output".to_string()
    })?;
    let input = parse_grid(&file.input)?;
    let claimed = parse_grid(&file.claimed_output)?;
    Ok(apply(&file.program, &input)? == claimed)
}

pub fn check_metacognition(body: &[u8]) -> Result<FacultyReport, String> {
    let file: MetacognitionFile = serde_json::from_slice(body).map_err(|_| {
        "metacognition file must include program, input, output, and recorded_verdict".to_string()
    })?;
    if file.recorded_verdict != "pass" && file.recorded_verdict != "fail" {
        return Err("recorded_verdict must be pass or fail".into());
    }
    let input = parse_grid(&file.input)?;
    let recorded = parse_grid(&file.output)?;
    let matches = apply(&file.program, &input)? == recorded;
    let recomputed = if matches { "pass" } else { "fail" };
    if recomputed == file.recorded_verdict {
        Ok(pass(format!(
            "recomputed {recomputed}; it matches the recorded verdict"
        )))
    } else {
        Ok(fail(format!(
            "recomputed {recomputed}; the recorded verdict was {}",
            file.recorded_verdict
        )))
    }
}

pub fn apply(program: &str, grid: &[Vec<u8>]) -> Result<Vec<Vec<u8>>, String> {
    match program {
        "identity" => Ok(grid.to_vec()),
        "flip_horizontal" => Ok(grid
            .iter()
            .map(|row| row.iter().rev().copied().collect())
            .collect()),
        "flip_vertical" => Ok(grid.iter().rev().cloned().collect()),
        "transpose" => {
            let width = grid[0].len();
            let mut out = vec![vec![0; grid.len()]; width];
            for (y, row) in grid.iter().enumerate() {
                for (x, cell) in row.iter().enumerate() {
                    out[x][y] = *cell;
                }
            }
            Ok(out)
        }
        _ => Err("program must be identity, transpose, flip_horizontal, or flip_vertical".into()),
    }
}

pub fn parse_grid(grid: &[Vec<u8>]) -> Result<Vec<Vec<u8>>, String> {
    if grid.is_empty()
        || grid.len() > 30
        || grid
            .iter()
            .any(|row| row.is_empty() || row.len() > 30 || row.len() != grid[0].len())
    {
        return Err("grids must be rectangular, 1 to 30 cells on each side, values 0 to 9".into());
    }
    if grid.iter().flatten().any(|cell| *cell > 9) {
        return Err("grid values must be 0 to 9".into());
    }
    Ok(grid.to_vec())
}

fn cells_with(frame: &[Vec<u8>], target: u8) -> Vec<[u8; 2]> {
    let mut cells = Vec::new();
    for (y, row) in frame.iter().enumerate() {
        for (x, cell) in row.iter().enumerate() {
            if *cell == target {
                cells.push([x as u8, y as u8]);
            }
        }
    }
    cells
}

fn pass(reason: impl Into<String>) -> FacultyReport {
    FacultyReport {
        verdict: "pass",
        reason: reason.into(),
    }
}

fn fail(reason: impl Into<String>) -> FacultyReport {
    FacultyReport {
        verdict: "fail",
        reason: reason.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(name: &str) -> &'static str {
        match name {
            "generation/pass" => include_str!("../fixtures/generation/pass.json"),
            "generation/ambiguous" => include_str!("../fixtures/generation/ambiguous.json"),
            "generation/held-out-fail" => include_str!("../fixtures/generation/held-out-fail.json"),
            "executive/pass" => include_str!("../fixtures/executive/pass.json"),
            "executive/skipped" => include_str!("../fixtures/executive/skipped.json"),
            "executive/production" => include_str!("../fixtures/executive/production.json"),
            "social/pass" => include_str!("../fixtures/social/pass.json"),
            "social/false-claim" => include_str!("../fixtures/social/false-claim.json"),
            "metacognition/agree" => include_str!("../fixtures/metacognition/agree.json"),
            "metacognition/recorded-failure" => {
                include_str!("../fixtures/metacognition/recorded-failure.json")
            }
            "metacognition/disagree" => include_str!("../fixtures/metacognition/disagree.json"),
            "perception/pass" => include_str!("../fixtures/perception/pass.json"),
            "perception/misread" => include_str!("../fixtures/perception/misread.json"),
            "attention/pass" => include_str!("../fixtures/attention/pass.json"),
            "attention/distractor" => include_str!("../fixtures/attention/distractor.json"),
            "learning/pass" => include_str!("../fixtures/learning/pass.json"),
            "learning/copied" => include_str!("../fixtures/learning/copied.json"),
            "memory/pass" => include_str!("../fixtures/memory/pass.json"),
            "memory/mismatch" => include_str!("../fixtures/memory/mismatch.json"),
            "reasoning/pass" => include_str!("../fixtures/reasoning/pass.json"),
            "reasoning/invalid" => include_str!("../fixtures/reasoning/invalid.json"),
            "problem/pass" => include_str!("../fixtures/problem/pass.json"),
            "problem/broken" => include_str!("../fixtures/problem/broken.json"),
            _ => panic!("unknown fixture"),
        }
    }

    #[test]
    fn the_remaining_faculties_pass_only_when_recomputed() {
        let cases = [
            ("perception/pass", "perception/misread", check_perception as fn(&[u8]) -> Result<FacultyReport, String>),
            ("attention/pass", "attention/distractor", check_attention),
            ("learning/pass", "learning/copied", check_learning),
            ("memory/pass", "memory/mismatch", check_memory),
            ("reasoning/pass", "reasoning/invalid", check_reasoning),
            ("problem/pass", "problem/broken", check_problem_solving),
        ];
        for (pass_name, fail_name, check) in cases {
            let passed = check(file(pass_name).as_bytes()).unwrap();
            assert_eq!(passed.verdict, "pass", "{pass_name}");
            assert!(passed.reason.contains("not a") || passed.reason.contains("does not compare"));
            assert_eq!(check(file(fail_name).as_bytes()).unwrap().verdict, "fail", "{fail_name}");
        }
    }

    #[test]
    fn generation_fixtures_match_the_closed_set() {
        let passed = check_generation(file("generation/pass").as_bytes()).unwrap();
        assert_eq!(passed.verdict, "pass");
        assert!(passed.reason.contains("transpose"));
        assert_eq!(
            check_generation(file("generation/ambiguous").as_bytes())
                .unwrap()
                .verdict,
            "fail"
        );
        assert_eq!(
            check_generation(file("generation/held-out-fail").as_bytes())
                .unwrap()
                .verdict,
            "fail"
        );
    }

    #[test]
    fn executive_fixtures_follow_the_planner_and_refuse_production() {
        assert_eq!(
            check_executive(file("executive/pass").as_bytes())
                .unwrap()
                .verdict,
            "pass"
        );
        let skipped = check_executive(file("executive/skipped").as_bytes()).unwrap();
        assert_eq!(skipped.verdict, "fail");
        assert!(skipped.reason.contains("test"));
        let production = check_executive(file("executive/production").as_bytes()).unwrap();
        assert_eq!(production.verdict, "fail");
        assert!(production.reason.contains("production"));
    }

    #[test]
    fn social_fixtures_are_recomputed() {
        assert!(claim_matches(file("social/pass").as_bytes()).unwrap());
        assert!(!claim_matches(file("social/false-claim").as_bytes()).unwrap());
    }

    #[test]
    fn metacognition_fixtures_compare_the_record_with_a_fresh_run() {
        assert_eq!(
            check_metacognition(file("metacognition/agree").as_bytes())
                .unwrap()
                .verdict,
            "pass"
        );
        assert_eq!(
            check_metacognition(file("metacognition/recorded-failure").as_bytes())
                .unwrap()
                .verdict,
            "pass"
        );
        let disagree = check_metacognition(file("metacognition/disagree").as_bytes()).unwrap();
        assert_eq!(disagree.verdict, "fail");
        assert!(disagree.reason.contains("recomputed fail"));
    }
}
