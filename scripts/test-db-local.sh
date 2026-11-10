#!/usr/bin/env bash
set -euo pipefail
S13S_PG_BIN="$(pwd)/node_modules/@embedded-postgres/linux-x64/native/bin"
S13S_TEST_DIR="$(mktemp -d)"
cleanup() {
  "$S13S_PG_BIN/pg_ctl" -D "$S13S_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$S13S_TEST_DIR"
}
trap cleanup EXIT
"$S13S_PG_BIN/initdb" -D "$S13S_TEST_DIR/data" --auth=trust --username=postgres --locale=C --encoding=UTF8 >/dev/null
"$S13S_PG_BIN/pg_ctl" -D "$S13S_TEST_DIR/data" -l "$S13S_TEST_DIR/log" -o '-p 55439 -h 127.0.0.1 -c unix_socket_directories=' start >/dev/null
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55439/postgres node --import tsx "${1:-scripts/test-db.ts}" "${@:2}"
