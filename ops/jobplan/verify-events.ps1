param(
    [string]$Connection = "arkhe-runtime",
    [string]$Brokers = "127.0.0.1:59092",
    [string]$OutputPath = "apps/arkhe-ask/verification-kafka.txt"
)
$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "Set DATABASE_URL for a pgvector test database" }
$testTopic = "arkhe-ask-test-" + [guid]::NewGuid().ToString("N")
$traceTopic = "arkhe-ask-trace-" + [guid]::NewGuid().ToString("N")
$crashTopic = "arkhe-ask-crash-" + [guid]::NewGuid().ToString("N")
$previousCrashTopic = $env:KAFKA_CRASH_TEST_TOPIC
$previousCrashEvidence = $env:ARKHE_CRASH_EVIDENCE_PATH
$previousTraceTopic = $env:KAFKA_TRACE_TEST_TOPIC
$previousBrokers = $env:KAFKA_BROKERS
$previousTopic = $env:KAFKA_TEST_TOPIC
try {
    & podman --connection $Connection exec arkhe-jobplan-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic $testTopic --partitions 1 --replication-factor 1
    if ($LASTEXITCODE -ne 0) { throw "Topic provisioning failed" }
    & podman --connection $Connection exec arkhe-jobplan-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic $traceTopic --partitions 1 --replication-factor 1
    if ($LASTEXITCODE -ne 0) { throw "Trace topic provisioning failed" }
    & podman --connection $Connection exec arkhe-jobplan-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic $crashTopic --partitions 1 --replication-factor 1
    if ($LASTEXITCODE -ne 0) { throw "Crash topic provisioning failed" }
    $env:KAFKA_CRASH_TEST_TOPIC = $crashTopic
    $env:ARKHE_CRASH_EVIDENCE_PATH = Join-Path (Get-Location) "apps/arkhe-ask/verification-process-crash.json"
    $env:KAFKA_TRACE_TEST_TOPIC = $traceTopic
    $env:KAFKA_BROKERS = $Brokers
    $env:KAFKA_TEST_TOPIC = $testTopic
    & cargo test -p arkhe-ask --test events -- --ignored --nocapture 2>&1 | Tee-Object -FilePath $OutputPath
    if ($LASTEXITCODE -ne 0) { throw "Kafka integration tests failed; topic retained for inspection: $testTopic" }
    & cargo test -p arkhe-ask --test crash_recovery -- --ignored --nocapture 2>&1 | Tee-Object -FilePath $OutputPath -Append
    if ($LASTEXITCODE -ne 0) { throw "Process crash test failed; topic retained: $crashTopic" }
    & podman --connection $Connection exec arkhe-jobplan-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic $testTopic
    if ($LASTEXITCODE -ne 0) { throw "Test passed but temporary topic cleanup failed" }
    & podman --connection $Connection exec arkhe-jobplan-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic $traceTopic
    if ($LASTEXITCODE -ne 0) { throw "Trace topic cleanup failed" }
    & podman --connection $Connection exec arkhe-jobplan-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic $crashTopic
    if ($LASTEXITCODE -ne 0) { throw "Crash topic cleanup failed" }
} finally {
    $env:KAFKA_CRASH_TEST_TOPIC = $previousCrashTopic
    $env:ARKHE_CRASH_EVIDENCE_PATH = $previousCrashEvidence
    $env:KAFKA_TRACE_TEST_TOPIC = $previousTraceTopic
    $env:KAFKA_BROKERS = $previousBrokers
    $env:KAFKA_TEST_TOPIC = $previousTopic
}
