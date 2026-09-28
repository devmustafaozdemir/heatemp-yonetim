#!/usr/bin/env bash
# Yerel yığını durdurur ve verisini siler.
set -euo pipefail
cd "$(dirname "$0")"
docker compose --profile storage down -v
