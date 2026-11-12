import pytest
from tinyqueue import run_with_retry


def test_backoff_doubles():
    delays, calls = [], []
    def job():
        calls.append(1)
        if len(calls) < 3:
            raise RuntimeError
        return "ok"
    assert run_with_retry(job, sleep=delays.append) == "ok"
    assert delays == [0.1, 0.2]


def test_gives_up():
    with pytest.raises(RuntimeError):
        run_with_retry(lambda: (_ for _ in ()).throw(RuntimeError()), attempts=2, sleep=lambda s: None)
