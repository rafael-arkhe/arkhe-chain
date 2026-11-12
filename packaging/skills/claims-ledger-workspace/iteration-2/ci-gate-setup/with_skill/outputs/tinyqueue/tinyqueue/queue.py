"""In-memory FIFO queue."""
from collections import deque


class Queue:
    def __init__(self):
        self._items = deque()
        self._ids = set()

    def push(self, job_id, payload):
        if job_id in self._ids:
            return False
        self._ids.add(job_id)
        self._items.append((job_id, payload))
        return True

    def pop(self):
        job_id, payload = self._items.popleft()
        self._ids.discard(job_id)
        return job_id, payload
