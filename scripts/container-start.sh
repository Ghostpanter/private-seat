#!/bin/sh
set -eu
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  echo "缺少 BETTER_AUTH_SECRET。用一段足够长的随机字符串，容器每次启动都要是同一段。" >&2
  exit 1
fi
if [ -z "${BETTER_AUTH_URL:-}" ]; then
  echo "缺少 BETTER_AUTH_URL。填你在浏览器里打开的地址，例如 http://localhost:8080" >&2
  exit 1
fi
mkdir -p "${PGLITE_DATA_DIR:-/data}"
exec node /app/.output/server/index.mjs
