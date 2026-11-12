from tinyqueue import Queue


def test_fifo():
    q = Queue()
    q.push("a", 1)
    q.push("b", 2)
    assert q.pop() == ("a", 1)
    assert q.pop() == ("b", 2)


def test_duplicates_dropped():
    q = Queue()
    assert q.push("a", 1) is True
    assert q.push("a", 2) is False
