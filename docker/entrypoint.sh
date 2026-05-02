#!/bin/sh
set -e

# Tiny local Redis for Chat SDK state only (subscriptions + per-thread cursorAgentId).
# Not exposed on port 6379; Node connects via redis://127.0.0.1:6379. No disk persistence.
redis-server \
  --bind 127.0.0.1 \
  --port 6379 \
  --save "" \
  --appendonly no \
  --daemonize yes \
  --dir /tmp \
  --logfile /tmp/redis.log \
  --maxmemory 32mb \
  --maxmemory-policy allkeys-lru

exec su-exec node:node node dist/server.js
