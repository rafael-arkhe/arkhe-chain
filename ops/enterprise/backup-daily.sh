#!/bin/sh
set -eu
: "${ARKHE_DATA_VOLUME:?Set existing application volume}"
: "${ARKHE_BACKUP_DIRECTORY:?Set prepared independent backup directory}"
: "${ARKHE_BACKUP_IMAGE:?Set the tested application image digest}"
case "$ARKHE_BACKUP_DIRECTORY" in /*) ;; *) echo 'Backup directory must be absolute' >&2; exit 1;; esac
[ -d "$ARKHE_BACKUP_DIRECTORY" ] || { echo 'Backup directory must already exist' >&2; exit 1; }
exec podman run --rm --read-only --network none --cap-drop=ALL --security-opt=no-new-privileges \
  --tmpfs /tmp:rw,nosuid,size=32m \
  -v "${ARKHE_DATA_VOLUME}:/data:ro" \
  -v "${ARKHE_BACKUP_DIRECTORY}:/backups:rw" \
  --entrypoint node "$ARKHE_BACKUP_IMAGE" /app/apps/arkhe-intra/scripts/backup.mjs \
  backup /data "/backups/$(date -u +%Y%m%dT%H%M%SZ)"
