# tinyqueue

A tiny job queue for Python services.

## Features

- FIFO job queue with `push()` and `pop()`.
- Automatic retries with exponential backoff for failing jobs.
- Duplicate jobs (same id) are dropped.
- Jobs are persisted to disk and survive restarts.
- Thread-safe: share one queue across worker threads.
