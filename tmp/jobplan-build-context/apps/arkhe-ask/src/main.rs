//! arkhe-ask binary — env-selected wiring behind the real router.
//!
//! - LLM: `AZURE_OPENAI_ENDPOINT/_DEPLOYMENT/_API_KEY` select the real
//!   provider (reqwest, no SDK); anything missing falls back to the
//!   grounded echo (logged, never silent).
//! - Store: `DATABASE_URL` selects pgvector (sqlx) when an embedder is
//!   available; otherwise falls back to the in-memory corpus (logged).
//! - Identity defaults to Keycloak JWT; dev-header mode requires explicit opt-in.

use arkhe_ask::pipeline::{ChunkStore, Embedder, LlmProvider, StoredChunk};
use arkhe_ask::providers::azure::AzureOpenAiProvider;
use arkhe_ask::providers::pgvector::PgVectorStore;
use arkhe_ask::providers::{EchoProvider, InMemoryStore};
use std::sync::Arc;

fn dev_corpus() -> Vec<StoredChunk> {
    vec![StoredChunk {
        tenant_id: "tenant-a".into(),
        id: "e1".into(),
        text: "Sydney is the capital of Australia.".into(),
    }]
}

fn select_llm() -> (Box<dyn LlmProvider>, Option<Arc<dyn Embedder>>) {
    match AzureOpenAiProvider::from_env() {
        Ok(provider) => {
            eprintln!("llm: azure-openai");
            let embedder: Arc<dyn Embedder> = Arc::new(provider.clone());
            (Box::new(provider), Some(embedder))
        }
        Err(reason) => {
            eprintln!("llm: grounded echo ({reason})");
            (Box::new(EchoProvider), None)
        }
    }
}

fn select_store(embedder: Option<Arc<dyn Embedder>>) -> Box<dyn ChunkStore> {
    let database_url = std::env::var("DATABASE_URL").unwrap_or_default();
    if database_url.is_empty() {
        eprintln!("store: in-memory dev corpus");
        return Box::new(InMemoryStore {
            chunks: dev_corpus(),
        });
    }
    let Some(embedder) = embedder else {
        // No embedder means no way to index or search vectors: fail loudly
        // into the dev store rather than silently mis-answering.
        eprintln!(
            "store: DATABASE_URL is set but no AZURE_OPENAI_* embedder; \
             falling back to in-memory (pgvector needs embeddings)"
        );
        return Box::new(InMemoryStore {
            chunks: dev_corpus(),
        });
    };
    eprintln!("store: pgvector");
    Box::new(PgVectorStore::lazy(database_url, embedder))
}

#[tokio::main]
async fn main() {
    let telemetry = arkhe_ask::telemetry::init()
        .await
        .expect("telemetry initialization");
    let listen = std::env::var("ARKHE_LISTEN").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let (llm, embedder) = select_llm();
    let store = select_store(embedder);
    let auth = match std::env::var("ARKHE_AUTH_MODE")
        .as_deref()
        .unwrap_or("keycloak")
    {
        "keycloak" => {
            let auth = arkhe_ask::auth::KeycloakAuth::from_env()
                .await
                .unwrap_or_else(|e| panic!("Keycloak authentication configuration: {e}"));
            eprintln!("auth: keycloak JWT");
            Some(auth)
        }
        "dev-header" => {
            eprintln!("auth: explicit development X-Tenant-Id mode");
            None
        }
        mode => panic!("unknown ARKHE_AUTH_MODE: {mode}"),
    };
    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or_default();
    let app = if !brokers.trim().is_empty() {
        use arkhe_ask::events::{KafkaBus, PgProofJournal};
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(5)
            .connect(&std::env::var("DATABASE_URL").expect("DATABASE_URL required by outbox"))
            .await
            .expect("outbox database connection");
        let journal = Arc::new(
            PgProofJournal::connect(pool)
                .await
                .expect("outbox migrations"),
        );
        let worker = Arc::clone(&journal);
        let topic = std::env::var("KAFKA_TOPIC").unwrap_or_else(|_| "arkhe.ask.verified.v1".into());
        tokio::spawn(async move {
            loop {
                match KafkaBus::connect(
                    brokers.split(',').map(str::to_string).collect(),
                    topic.clone(),
                )
                .await
                {
                    Ok(bus) => loop {
                        let result = async {
                            worker.relay_once(&bus).await?;
                            worker.consume_once(&bus).await?;
                            Ok::<_, String>(())
                        }
                        .await;
                        if let Err(err) = result {
                            eprintln!("proof worker retry: {err}");
                            break;
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                    },
                    Err(err) => eprintln!("Kafka connect retry: {err}"),
                }
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        });
        eprintln!("proof journal: PostgreSQL outbox + Kafka");
        arkhe_ask::router_with_journal(store, llm, auth, journal)
    } else {
        eprintln!("proof journal: disabled (KAFKA_BROKERS absent)");
        match auth {
            Some(auth) => arkhe_ask::router_with_auth(store, llm, auth),
            None => arkhe_ask::router(store, llm),
        }
    };
    let listener = tokio::net::TcpListener::bind(&listen)
        .await
        .unwrap_or_else(|e| panic!("cannot bind {listen}: {e}"));
    eprintln!("arkhe-ask listening on {listen}");
    axum::serve(listener, app)
        .with_graceful_shutdown(arkhe_ask::telemetry::shutdown_signal())
        .await
        .expect("server error");
    if let Some(provider) = telemetry {
        tokio::task::spawn_blocking(move || provider.shutdown())
            .await
            .expect("telemetry shutdown task")
            .expect("telemetry export shutdown");
    }
}
