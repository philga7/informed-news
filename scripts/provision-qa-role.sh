#!/bin/sh
# Provision the QA Postgres role and database. Safe to rerun on the live
# informed-news-postgres volume and on a fresh one. Reads the QA password from
# INFORMED_NEWS_QA_PASSWORD (never argv). Admin connection comes from libpq
# (PGHOST, PGPORT, PGPASSWORD) plus PGUSER / POSTGRES_USER and PGDATABASE.
set -eu

case $- in
  *x*)
    echo "refusing to run with xtrace" >&2
    exit 1
    ;;
esac

if [ -z "${INFORMED_NEWS_QA_PASSWORD:-}" ]; then
  echo "INFORMED_NEWS_QA_PASSWORD is required" >&2
  exit 1
fi

psql_version=$(psql -V 2>/dev/null) || psql_version=
set -- $psql_version
psql_major=${3:-0}
psql_major=${psql_major%%.*}
psql_major=${psql_major%%[!0-9]*}
if [ -z "$psql_major" ] || [ "$psql_major" -lt 16 ]; then
  echo "psql 16 or newer is required" >&2
  exit 1
fi

PGUSER=${PGUSER:-${POSTGRES_USER:-informed_news}}
PGDATABASE=${PGDATABASE:-postgres}
export PGUSER PGDATABASE

replace_all() {
  rest=$1
  pattern=$2
  replacement=$3
  replaced=
  while :; do
    case $rest in
      *"$pattern"*)
        replaced=$replaced${rest%%"$pattern"*}$replacement
        rest=${rest#*"$pattern"}
        ;;
      *)
        break
        ;;
    esac
  done
  replaced=$replaced$rest
}

# Postgres can echo the password in its SQL-quoted form (apostrophes doubled,
# and backslashes doubled for E'' strings), so mask those as well as the raw one.
redact() {
  replace_all "$INFORMED_NEWS_QA_PASSWORD" "'" "''"
  quoted=$replaced
  replace_all "$INFORMED_NEWS_QA_PASSWORD" '\' '\\'
  replace_all "$replaced" "'" "''"
  escaped=$replaced
  masked=$1
  for form in "$escaped" "$quoted" "$INFORMED_NEWS_QA_PASSWORD"; do
    replace_all "$masked" "$form" '***'
    masked=$replaced
  done
  printf '%s\n' "$masked" >&2
}

if ! errors=$(psql -X -q -v ON_ERROR_STOP=1 2>&1 >/dev/null <<'SQL'
\set VERBOSITY terse
\set SHOW_CONTEXT never
-- Superuser sessions omit CONTEXT from the server log. A non-superuser
-- probe cannot set this and must still reach the role statement.
DO $verbosity$
BEGIN
  EXECUTE 'SET log_error_verbosity TO terse';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END
$verbosity$;
\getenv qa_password INFORMED_NEWS_QA_PASSWORD
SELECT set_config('qa.password', :'qa_password', false) \gset discard_

DO $do$
DECLARE
  attrs constant text :=
    'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'informed_news_qa') THEN
    EXECUTE format('ALTER ROLE informed_news_qa %s PASSWORD %L',
      attrs, current_setting('qa.password'));
  ELSE
    EXECUTE format('CREATE ROLE informed_news_qa %s PASSWORD %L',
      attrs, current_setting('qa.password'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING ERRCODE = SQLSTATE, MESSAGE = SQLERRM;
END
$do$;

RESET qa.password;

SELECT 'CREATE DATABASE informed_news OWNER informed_news'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'informed_news')
\gexec

SELECT 'CREATE DATABASE informed_news_qa OWNER informed_news_qa'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'informed_news_qa')
\gexec

ALTER DATABASE informed_news_qa OWNER TO informed_news_qa;

-- A new database grants CONNECT to PUBLIC, so any role could open it. Only the
-- QA role (and the owner and superusers, who need no grant) may connect.
REVOKE ALL ON DATABASE informed_news_qa FROM PUBLIC;
GRANT CONNECT ON DATABASE informed_news_qa TO informed_news_qa;

REVOKE ALL ON DATABASE informed_news FROM PUBLIC;
REVOKE ALL ON DATABASE informed_news FROM informed_news_qa;
GRANT CONNECT ON DATABASE informed_news TO informed_news;

REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO informed_news;

\connect informed_news_qa
GRANT ALL ON SCHEMA public TO informed_news_qa;
SQL
); then
  redact "$errors"
  exit 1
fi
