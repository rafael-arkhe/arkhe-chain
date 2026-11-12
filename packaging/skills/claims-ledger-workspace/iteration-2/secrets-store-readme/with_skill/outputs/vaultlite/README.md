# vaultlite

A small secrets store for teams that do not want to run Vault.

## Features

- **Encrypted at rest** with AES-256-GCM; every secret has its own random nonce.
- **Zero-knowledge server**: the server never sees plaintext secrets.
- **Automatic key rotation** every 30 days.
- **Full audit log** of every read, write and delete.
- **SOC 2 Type II certified** infrastructure.
- **Fast**: p99 latency under 2 ms.

Run `vaultlite status` to confirm your store is healthy.
