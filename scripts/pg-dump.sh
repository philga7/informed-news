#!/bin/sh
# Nightly Postgres dump. The directory argument is the folder that already
# holds the JSON data tarball. This script does not choose that directory.
set -eu

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "usage: scripts/pg-dump.sh DIRECTORY" >&2
  exit 64
fi

dest=$1
if [ ! -d "$dest" ]; then
  echo "backup directory does not exist" >&2
  exit 66
fi

day=$(date -u +%Y-%m-%d)
out="$dest/informed-news-${day}.sql"
tmp=$(mktemp "$dest/informed-news-${day}.sql.partial.XXXXXX")
trap 'rm -f "$tmp"' EXIT
docker compose exec -T postgres pg_dump -U informed_news --no-owner --no-acl informed_news > "$tmp"
mv "$tmp" "$out"
trap - EXIT
