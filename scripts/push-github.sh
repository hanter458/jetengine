#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
gh auth status || gh auth login -h github.com -p https -w
if ! gh repo view hanter458/jetengine >/dev/null 2>&1; then
  gh repo create jetengine --public --source=. --remote=origin --push \
    --description "EDF-1000 — 1 m electric ducted fan: parametric 3D CAD + physics sim"
else
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/hanter458/jetengine.git"
  git push -u origin main
fi
echo "OK: https://github.com/hanter458/jetengine"
