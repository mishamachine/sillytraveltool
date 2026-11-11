#!/bin/sh
# Usage: scripts/test-migrations/container/run.sh <sql file under scripts/test-migrations/container/>
# Starts a throwaway supabase/postgres container (non-superuser `postgres`), runs the file from the repo root, removes the container.
set -e
IMG=public.ecr.aws/supabase/postgres:17.11.0.004
NAME=stt-pgtest-$$
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pgtest "$IMG" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
for i in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
sleep 3
docker exec "$NAME" mkdir -p /work; docker cp supabase "$NAME":/work/supabase >/dev/null; docker cp scripts "$NAME":/work/scripts >/dev/null
docker exec -w /work -e PGPASSWORD=pgtest "$NAME" psql -h localhost -U postgres -v ON_ERROR_STOP=1 -f "$1"
