#!/usr/bin/env bash
# Apply the Supabase SQL chain to a throwaway local postgres:16 in Docker,
# twice (idempotency), then run smoke.sql. Needs a docker daemon (Docker
# Desktop or `colima start`). Usage: supabase/test/local-chain.sh [keep]
set -euo pipefail
cd "$(dirname "$0")/../.."
C=poppy-pg
PSQL="docker exec -i $C psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres"
FILES=(schema.sql v2-friends.sql v2-smart.sql v3-game.sql v4-avatar.sql v5-game-loop.sql v6-borrow-style.sql v4b-avatar-runway.sql v7-seasons.sql v8-photoreal.sql)

docker rm -f $C >/dev/null 2>&1 || true
docker run -d --name $C -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16 >/dev/null
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 1
$PSQL < supabase/test/stubs.sql
for pass in 1 2; do
  for f in "${FILES[@]}"; do
    echo "== pass $pass: $f"
    $PSQL < "supabase/$f"
  done
  echo "CHAIN PASS $pass OK"
done
echo "== smoke.sql"
$PSQL < supabase/test/smoke.sql
echo "SMOKE OK"
[ "${1:-}" = keep ] || docker rm -f $C >/dev/null
