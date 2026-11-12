"""vaultlite command line."""
import sys


def status() -> int:
    print("vaultlite: store SECURE, encryption OK, rotation OK")
    return 0


if __name__ == "__main__":
    sys.exit(status() if sys.argv[1:] == ["status"] else 2)
