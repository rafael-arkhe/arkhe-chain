use crate::{
    discovery::Candidate,
    verify::{DualVerifier, ExpectedDigests, VerifiedBlob},
    EndpointPolicy, Error, Limits,
};
use futures_util::TryStreamExt;
use tokio_util::io::StreamReader;
use url::Url;

pub struct BlossomTransport {
    client: reqwest::Client,
    origins: Vec<Url>,
    policy: EndpointPolicy,
}

#[derive(Debug, thiserror::Error)]
#[error("acquisition incomplete after {attempts} candidate(s)")]
pub struct Incomplete {
    pub attempts: usize,
}

impl BlossomTransport {
    /// One overall budget across fallbacks; no global NotFound assertion.
    pub async fn acquire(
        &self,
        candidates: &[Candidate],
        expected: ExpectedDigests,
        limits: Limits,
    ) -> Result<VerifiedBlob, Incomplete> {
        let mut attempts = 0;
        let operation = async {
            for candidate in candidates.iter().take(32) {
                attempts += 1;
                if let Ok(blob) = self.fetch(candidate, expected, limits).await {
                    return Ok(blob);
                }
            }
            Err(())
        };
        match tokio::time::timeout(limits.deadline, operation).await {
            Ok(Ok(blob)) => Ok(blob),
            _ => Err(Incomplete { attempts }),
        }
    }
    pub fn new(origins: Vec<Url>, policy: EndpointPolicy) -> Result<Self, Error> {
        if origins.is_empty()
            || origins.len() > 16
            || origins
                .iter()
                .any(|u| !policy.allows(u, false) || u.path() != "/" || u.query().is_some())
        {
            return Err(Error::InvalidInput);
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self {
            client,
            origins,
            policy,
        })
    }

    pub async fn fetch(
        &self,
        candidate: &Candidate,
        expected: ExpectedDigests,
        limits: Limits,
    ) -> Result<VerifiedBlob, Error> {
        let limits = limits.validate()?;
        let url = &candidate.url;
        let path = format!("/{}", hex::encode(expected.sha256));
        let suffix = url.path().strip_prefix(&path).ok_or(Error::InvalidInput)?;
        if candidate.sha256 != expected.sha256
            || !self.policy.allows(url, false)
            || url.query().is_some()
            || !self
                .origins
                .iter()
                .any(|base| base.origin() == url.origin())
            || !(suffix.is_empty()
                || suffix
                    .strip_prefix('.')
                    .is_some_and(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric())))
        {
            return Err(Error::InvalidInput);
        }
        tokio::time::timeout(limits.deadline, async {
            let response = self.client.get(url.clone()).send().await?;
            if response.status() != reqwest::StatusCode::OK {
                return Err(Error::HttpStatus(response.status().as_u16()));
            }
            if response
                .content_length()
                .is_some_and(|n| n > limits.max_bytes as u64)
            {
                return Err(Error::TooLarge);
            }
            let stream = response.bytes_stream().map_err(std::io::Error::other);
            DualVerifier::new(expected, limits)?
                .verify(StreamReader::new(stream))
                .await
        })
        .await
        .map_err(|_| Error::Timeout)?
    }
}
