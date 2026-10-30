use crate::{EndpointPolicy, Error};
use futures_util::{SinkExt, StreamExt};
use nostr::Event;
use serde_json::{json, Value};
use std::{collections::HashSet, time::Duration};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{protocol::WebSocketConfig, Message},
};
use url::Url;

#[derive(Clone, Debug)]
pub struct Candidate {
    pub url: Url,
    pub sha256: [u8; 32],
    /// Claimed MIME type and publisher are metadata, not content authority.
    pub mime: Option<String>,
    pub publisher: Option<String>,
}

#[derive(Debug, Default)]
pub struct DiscoveryObservation {
    pub candidates: Vec<Candidate>,
    /// EOSE only describes this relay's response, never global completeness.
    pub relay_eose: Vec<String>,
    pub diagnostics: Vec<String>,
    pub rejected_events: usize,
}

pub struct NostrDiscovery {
    relays: Vec<Url>,
    policy: EndpointPolicy,
    deadline: Duration,
    max_events: usize,
    max_candidates: usize,
}

impl NostrDiscovery {
    pub fn new(
        relays: Vec<Url>,
        policy: EndpointPolicy,
        deadline: Duration,
        max_events: usize,
        max_candidates: usize,
    ) -> Result<Self, Error> {
        if relays.is_empty()
            || relays.len() > 8
            || deadline.is_zero()
            || max_events == 0
            || max_events > 256
            || max_candidates == 0
            || max_candidates > 32
            || relays.iter().any(|u| !policy.allows(u, true))
        {
            return Err(Error::InvalidInput);
        }
        Ok(Self {
            relays,
            policy,
            deadline,
            max_events,
            max_candidates,
        })
    }

    /// Caller supplies the expected SHA-256; a discovered BLAKE3 is never trusted.
    pub async fn lookup(&self, sha256: [u8; 32]) -> DiscoveryObservation {
        let mut observation = DiscoveryObservation::default();
        let mut seen = HashSet::new();
        let per_relay = (self.deadline / self.relays.len() as u32).max(Duration::from_millis(1));
        let mut frames = 0usize;
        for relay in &self.relays {
            if frames >= self.max_events || observation.candidates.len() >= self.max_candidates {
                observation
                    .diagnostics
                    .push("observation budget exhausted".into());
                break;
            }
            let query = async {
                let config = WebSocketConfig::default()
                    .max_message_size(Some(64 * 1024))
                    .max_frame_size(Some(64 * 1024));
                let (mut socket, _) =
                    connect_async_with_config(relay.as_str(), Some(config), false)
                        .await
                        .map_err(|_| ())?;
                socket.send(Message::Text(json!(["REQ", "arkhe-lookup", {"kinds":[1063],"#x":[hex::encode(sha256)],"limit":self.max_events}]).to_string().into())).await.map_err(|_| ())?;
                while let Some(message) = socket.next().await {
                    frames += 1;
                    if frames > self.max_events {
                        return Err(());
                    }
                    let message = message.map_err(|_| ())?;
                    let Message::Text(text) = message else {
                        continue;
                    };
                    let Ok(value) = serde_json::from_str::<Value>(&text) else {
                        observation.rejected_events += 1;
                        continue;
                    };
                    if value[0] == "EOSE" && value[1] == "arkhe-lookup" {
                        observation.relay_eose.push(relay.to_string());
                        return Ok(());
                    }
                    if value[0] != "EVENT" || value[1] != "arkhe-lookup" {
                        continue;
                    }
                    let candidate = serde_json::from_value::<Event>(value[2].clone())
                        .ok()
                        .and_then(|event| self.candidate(&event, sha256));
                    if let Some(candidate) = candidate {
                        if seen.insert(candidate.url.to_string()) {
                            observation.candidates.push(candidate);
                        }
                        if observation.candidates.len() >= self.max_candidates {
                            return Err(());
                        }
                    } else {
                        observation.rejected_events += 1;
                    }
                }
                Err(())
            };
            if !matches!(tokio::time::timeout(per_relay, query).await, Ok(Ok(()))) {
                observation.diagnostics.push(format!(
                    "relay incomplete: {}",
                    relay.origin().ascii_serialization()
                ));
            }
        }
        observation
    }

    fn candidate(&self, event: &Event, expected: [u8; 32]) -> Option<Candidate> {
        if event.kind.as_u16() != 1063 || event.verify().is_err() {
            return None;
        }
        let tag = |name: &str| -> Option<String> {
            let mut tags = event
                .tags
                .iter()
                .filter(|t| t.as_slice().first().is_some_and(|s| s == name));
            let first = tags.next()?.as_slice();
            if first.len() != 2 || tags.next().is_some() {
                return None;
            }
            Some(first[1].clone())
        };
        if tag("x")? != hex::encode(expected) {
            return None;
        }
        let url = Url::parse(&tag("url")?).ok()?;
        if !self.policy.allows(&url, false) {
            return None;
        }
        let mime = tag("m")?;
        if mime.len() > 128
            || !mime.is_ascii()
            || mime != mime.to_ascii_lowercase()
            || !mime.contains('/')
        {
            return None;
        }
        Some(Candidate {
            url,
            sha256: expected,
            mime: Some(mime),
            publisher: Some(event.pubkey.to_hex()),
        })
    }
}
