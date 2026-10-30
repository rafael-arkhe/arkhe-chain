"""Download the pinned official Radicle laboratory tool without executing it.

SHA-256 is checked against the official HTTPS origin. Signer trust is a separate
step: bootstrap.sh checks cryptographic consistency, and README records the
observed mismatch with the download page's advertised signer keys.
"""
import argparse
import hashlib
from pathlib import Path
import tarfile
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tools', type=Path, required=True)
    args = parser.parse_args()
    args.tools.mkdir(parents=True, exist_ok=True)
    url = 'https://files.radicle.dev/releases/1.10.3/radicle-1.10.3-x86_64-unknown-linux-musl.tar.xz'
    for suffix in ['', '.sha256', '.sig']:
        target = args.tools / ('radicle.tar.xz' + suffix)
        if not target.exists():
            with urlopen(url + suffix, timeout=45) as response:
                data = response.read(32 * 1024 * 1024 + 1)
                if len(data) > 32 * 1024 * 1024:
                    raise ValueError('Radicle download exceeds laboratory limit')
                target.write_bytes(data)
    expected = (args.tools / 'radicle.tar.xz.sha256').read_text().split()[0]
    actual = hashlib.sha256((args.tools / 'radicle.tar.xz').read_bytes()).hexdigest()
    if expected != actual:
        raise ValueError('official archive checksum mismatch')
    destination = args.tools / 'radicle'
    if not destination.exists():
        with tarfile.open(args.tools / 'radicle.tar.xz') as archive:
            archive.extractall(destination, filter='data')
    print('Official HTTPS archive SHA-256:', actual)
    print('Signer identity authentication must be assessed separately; see README.')


if __name__ == '__main__':
    main()
