use agi_coder_core::ContentHash;
use agi_coder_inference::*;
fn request() -> InferenceRequest {
    InferenceRequest {
        model: "/models/checkpoint".into(),
        prompt: "Propose a fix without claiming verification.".into(),
        sampling: SamplingConfig {
            max_tokens: 128,
            ..Default::default()
        },
    }
}
fn client(scenario: &str) -> DeepInferClient {
    DeepInferClient::new(BridgeConfig {
        program: env!("CARGO_BIN_EXE_mock-inference-bridge").into(),
        args: vec![scenario.into()],
        timeout_milliseconds: 5000,
        max_response_bytes: 4096,
    })
    .unwrap()
}
#[tokio::test]
async fn valid_generation_is_bound_but_never_verified_evidence() {
    let request = request();
    let result = client("ok").generate(&request).await.unwrap();
    assert_eq!(result.request_digest, request.digest().unwrap());
    assert_eq!(
        result.output_artifact,
        ContentHash::hash(result.generation.text.as_bytes())
    );
    assert!(!result.verified);
}
#[tokio::test]
async fn altered_or_malformed_bridge_responses_fail_closed() {
    for scenario in [
        "wrong-request",
        "wrong-model",
        "wrong-revision",
        "wrong-protocol",
        "zero-tokens",
        "too-many-tokens",
        "empty-text",
        "invalid-json",
        "duplicate-response",
        "stdout-overflow",
        "stderr-overflow",
    ] {
        assert!(
            matches!(
                client(scenario).generate(&request()).await,
                Err(InferenceError::Protocol(_))
            ),
            "scenario {scenario}"
        );
    }
}
#[tokio::test]
async fn failed_process_and_timeout_are_explicit_and_redacted() {
    let error = client("error").generate(&request()).await.unwrap_err();
    assert!(matches!(error, InferenceError::Exit(_)));
    assert!(!error.to_string().contains("sensitive prompt"));
    let timed = DeepInferClient::new(BridgeConfig {
        program: env!("CARGO_BIN_EXE_mock-inference-bridge").into(),
        args: vec!["timeout".into()],
        timeout_milliseconds: 100,
        max_response_bytes: 4096,
    })
    .unwrap();
    assert!(matches!(
        timed.generate(&request()).await,
        Err(InferenceError::Timeout)
    ));
}
#[test]
fn invalid_sampling_and_limits_are_rejected_before_dispatch() {
    for sampling in [
        SamplingConfig {
            temperature: f64::NAN,
            ..Default::default()
        },
        SamplingConfig {
            top_p: 0.0,
            ..Default::default()
        },
        SamplingConfig {
            top_k: 0,
            ..Default::default()
        },
        SamplingConfig {
            max_tokens: 0,
            ..Default::default()
        },
        SamplingConfig {
            deterministic: true,
            seq_seed: None,
            ..Default::default()
        },
        SamplingConfig {
            structured_output: Some(StructuredOutput {
                schema_type: SchemaType::Json,
                schema: "[]".into(),
            }),
            ..Default::default()
        },
    ] {
        assert!(sampling.validate().is_err());
    }
    assert!(DeepInferClient::new(BridgeConfig {
        program: "python".into(),
        args: vec![],
        timeout_milliseconds: 0,
        max_response_bytes: 4096
    })
    .is_err());
    let mut r = request();
    let digest = r.digest().unwrap();
    r.sampling.seq_seed = Some(7);
    assert_ne!(r.digest().unwrap(), digest);
    r.prompt.clear();
    assert!(r.digest().is_err());
}
#[tokio::test]
async fn structured_sampling_reaches_the_bridge_without_losing_seed() {
    let mut request = request();
    request.sampling.deterministic = true;
    request.sampling.seq_seed = Some(u64::MAX);
    request.sampling.structured_output = Some(StructuredOutput {
        schema_type: SchemaType::Json,
        schema: r#"{"type":"object"}"#.into(),
    });
    let result = client("echo-sampling").generate(&request).await.unwrap();
    let echoed: SamplingConfig = serde_json::from_str(&result.generation.text).unwrap();
    assert_eq!(echoed.seq_seed, Some(u64::MAX));
    assert_eq!(
        echoed.structured_output.unwrap().schema,
        r#"{"type":"object"}"#
    );
}
#[tokio::test]
async fn cognition_consumes_a_proposal_without_advancing_task_status() {
    let plan = agi_coder_cognition::Planner::software("Fix an issue".into()).unwrap();
    let proposal = agi_coder_cognition::inference::propose_task(
        &client("ok"),
        &plan,
        "design",
        "/models/checkpoint".into(),
        SamplingConfig::default(),
    )
    .await
    .unwrap();
    assert!(!proposal.verified);
    assert_eq!(
        plan.tasks["design"].status,
        agi_coder_cognition::TaskStatus::Pending
    );
    assert!(agi_coder_cognition::inference::propose_task(
        &client("ok"),
        &plan,
        "deploy",
        "/models/checkpoint".into(),
        SamplingConfig::default()
    )
    .await
    .is_err());
}
