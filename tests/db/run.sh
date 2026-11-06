#!/usr/bin/env bash
# Applies all migrations to a throwaway database and runs the security test suite.
# Usage: PGHOST=... PGPORT=... PGUSER=... tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="pairvella_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
run() { psql -v ON_ERROR_STOP=1 -q -d "$DB" "$@"; }
run -f tests/db/supabase_stubs.sql
for f in supabase/migrations/*.sql; do run -f "$f"; done
run -f tests/db/security.test.sql
