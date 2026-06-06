#!/usr/bin/env bash
# Convenience launcher for AgentOS (backend API + worker + frontend dev server).
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p /tmp/logs

echo "→ Starting FastAPI on :8000"
( cd "$ROOT/backend" && nohup venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/logs/backend.log 2>&1 & )

echo "→ Starting agent worker"
( cd "$ROOT/backend" && nohup venv/bin/python worker.py > /tmp/logs/worker.log 2>&1 & )

echo "→ Starting Vite dev server on :5173"
( cd "$ROOT/frontend" && nohup npm run dev > /tmp/logs/frontend.log 2>&1 & )

sleep 4
echo "Done. Frontend: http://localhost:5173  API: http://localhost:8000"
