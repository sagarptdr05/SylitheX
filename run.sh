#!/usr/bin/env bash
# TerraTrust AI: one-command local run (backend :8000 + frontend :5173)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
if [ ! -f data/aois/nashik/aoi.json ] || [ ! -f data/aois/vasai-virar/aoi.json ]; then
  echo "▶ Downloading Sentinel-1/2 time series (Nashik + Vasai–Virar) from Microsoft Planetary Computer (first run only)…"
  .venv/bin/python ../scripts/download_demo_data.py
fi
if [ ! -f data/aois/nashik/results/downstream.json ] || [ ! -f data/aois/vasai-virar/results/downstream.json ]; then
  echo "▶ Building locations: baselines, models, demo scenes, demo datasets…"
  .venv/bin/python ../scripts/build_aoi.py nashik vasai-virar
fi
if [ ! -f models/xgb.json ]; then
  echo "▶ Building the Synthetic Corruption Benchmark + XGBoost…"
  .venv/bin/python ../scripts/build_benchmark.py
fi
.venv/bin/uvicorn app.main:app --port 8000 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
echo "▶ TerraTrust running: UI http://localhost:5173 · API docs http://localhost:8000/docs"
npm run dev
