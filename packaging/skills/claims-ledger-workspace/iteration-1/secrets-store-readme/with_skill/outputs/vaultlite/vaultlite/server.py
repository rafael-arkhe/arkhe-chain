"""HTTP handlers. The server holds the master key and serves secrets to clients."""
from .crypto import open_sealed, seal
from .audit import log

MASTER_KEY = None  # loaded from VAULTLITE_KEY at startup
STORE = {}


def put(name: str, value: str, user: str) -> None:
    STORE[name] = seal(MASTER_KEY, value.encode())
    log("write", name, user)


def get(name: str, user: str) -> str:
    log("read", name, user)
    return open_sealed(MASTER_KEY, STORE[name]).decode()


def delete(name: str, user: str) -> None:
    STORE.pop(name, None)
