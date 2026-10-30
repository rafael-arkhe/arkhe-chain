use serde::{Deserialize, Serialize};
use std::time::Duration;
#[derive(Debug, thiserror::Error)]
pub enum JulesError {
    #[error("session {session_name} was created but journal recording failed; reconcile without redispatch")]
    UnrecordedSession { session_name: String },
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error("invalid Jules configuration or response: {0}")]
    Invalid(String),
    #[error("session polling deadline exceeded; reconcile before creating another session")]
    Timeout,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceContext {
    pub source: String,
    pub github_repo_context: GithubRepoContext,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepoContext {
    pub starting_branch: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSession {
    pub prompt: String,
    pub source_context: SourceContext,
    pub require_plan_approval: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub name: String,
    #[serde(default)]
    pub id: String,
    pub state: String,
    #[serde(default)]
    pub outputs: Vec<serde_json::Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activities {
    #[serde(default)]
    pub activities: Vec<serde_json::Value>,
    #[serde(default)]
    pub next_page_token: String,
}
pub struct JulesClient {
    client: reqwest::Client,
    base: reqwest::Url,
    key: reqwest::header::HeaderValue,
}
impl JulesClient {
    /// Record the name immediately after create, before polling. The host must
    /// already have reserved the operation. Uncertain create errors must not be
    /// retried automatically, even when no resource name could be recovered.
    pub async fn create_recorded(
        &self,
        request: &CreateSession,
        operation_id: agi_coder_core::OperationId,
        record: &mut impl FnMut(agi_coder_core::OperationId, &str) -> Result<(), String>,
    ) -> Result<Session, JulesError> {
        let session = self.create(request).await?;
        self.resource(&session.name)?;
        record(operation_id, &session.name).map_err(|_| JulesError::UnrecordedSession {
            session_name: session.name.clone(),
        })?;
        Ok(session)
    }
    pub fn new(api_key: &str) -> Result<Self, JulesError> {
        Self::with_base_url("https://jules.googleapis.com/v1alpha/", api_key)
    }
    pub fn with_base_url(base: &str, api_key: &str) -> Result<Self, JulesError> {
        let base = reqwest::Url::parse(base).map_err(|e| JulesError::Invalid(e.to_string()))?;
        if !(base.scheme() == "https"
            || (base.scheme() == "http"
                && matches!(base.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))))
            || !base.path().ends_with('/')
        {
            return Err(JulesError::Invalid(
                "HTTPS required except loopback; base must end in /".into(),
            ));
        }
        if api_key.trim().is_empty() {
            return Err(JulesError::Invalid("API key is empty".into()));
        }
        let mut key = reqwest::header::HeaderValue::from_str(api_key)
            .map_err(|_| JulesError::Invalid("invalid API key".into()))?;
        key.set_sensitive(true);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self { client, base, key })
    }
    fn resource(&self, name: &str) -> Result<reqwest::Url, JulesError> {
        let Some(id) = name.strip_prefix("sessions/") else {
            return Err(JulesError::Invalid("expected sessions/{id}".into()));
        };
        if id.is_empty()
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(JulesError::Invalid("invalid session id".into()));
        }
        self.base
            .join(name)
            .map_err(|e| JulesError::Invalid(e.to_string()))
    }
    pub async fn create(&self, request: &CreateSession) -> Result<Session, JulesError> {
        if request.prompt.trim().is_empty()
            || !request.source_context.source.starts_with("sources/")
            || request
                .source_context
                .github_repo_context
                .starting_branch
                .trim()
                .is_empty()
        {
            return Err(JulesError::Invalid(
                "prompt, source resource, and branch are required".into(),
            ));
        }
        let url = self
            .base
            .join("sessions")
            .map_err(|e| JulesError::Invalid(e.to_string()))?;
        Ok(self
            .client
            .post(url)
            .header("x-goog-api-key", self.key.clone())
            .json(request)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }
    pub async fn get(&self, name: &str) -> Result<Session, JulesError> {
        Ok(self
            .client
            .get(self.resource(name)?)
            .header("x-goog-api-key", self.key.clone())
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }
    pub async fn activities(&self, name: &str) -> Result<Vec<serde_json::Value>, JulesError> {
        let mut url = self.resource(name)?;
        url.set_path(&format!("{}/activities", url.path()));
        let mut all = Vec::new();
        let mut token = String::new();
        let mut seen = std::collections::BTreeSet::new();
        for _ in 0..100 {
            let page: Activities = self
                .client
                .get(url.clone())
                .header("x-goog-api-key", self.key.clone())
                .query(&[("pageToken", &token)])
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            all.extend(page.activities);
            if page.next_page_token.is_empty() {
                return Ok(all);
            }
            if !seen.insert(page.next_page_token.clone()) {
                return Err(JulesError::Invalid("repeated page token".into()));
            }
            token = page.next_page_token;
        }
        Err(JulesError::Invalid(
            "activity pagination limit exceeded".into(),
        ))
    }
    pub async fn wait(
        &self,
        name: &str,
        timeout: Duration,
        interval: Duration,
    ) -> Result<Session, JulesError> {
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let session = tokio::time::timeout_at(deadline, self.get(name))
                .await
                .map_err(|_| JulesError::Timeout)??;
            match session.state.as_str() {
                "COMPLETED"
                | "FAILED"
                | "AWAITING_PLAN_APPROVAL"
                | "AWAITING_USER_FEEDBACK"
                | "PAUSED" => return Ok(session),
                "QUEUED" | "PLANNING" | "IN_PROGRESS" => {}
                state => {
                    return Err(JulesError::Invalid(format!(
                        "unknown session state: {state}"
                    )))
                }
            }
            tokio::time::timeout_at(
                deadline,
                tokio::time::sleep(interval.max(Duration::from_millis(10))),
            )
            .await
            .map_err(|_| JulesError::Timeout)?;
        }
    }
}
