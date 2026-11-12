"""Retry a job with exponential backoff."""
import time


def run_with_retry(job, attempts=4, base_delay=0.1, sleep=time.sleep):
    for attempt in range(attempts):
        try:
            return job()
        except Exception:
            if attempt == attempts - 1:
                raise
            sleep(base_delay * 2 ** attempt)
