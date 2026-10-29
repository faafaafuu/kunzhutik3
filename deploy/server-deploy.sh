#!/usr/bin/env bash
# Deploys one environment on the server, run by CI over SSH (forced command) or by hand:
#   prod    — ~/kunzhutik3,    branch main, https://braitsgk.ru
#   staging — ~/brait-staging, branch dev,  https://dev.braitsgk.ru
# Builds the images there, starts them, checks /health; if the new version does not come up, the previous images
# are started again. The server copy lives in ~/brait-local/deploy.sh (updated from here by a deploy of prod).
set -euo pipefail

target="${1:-${SSH_ORIGINAL_COMMAND:-}}"
case "$target" in
  prod) dir="$HOME/kunzhutik3"; branch=main; health=http://127.0.0.1:8000/health; services="api telegram-bot" ;;
  staging) dir="$HOME/brait-staging"; branch=dev; health=http://172.17.0.1:8001/health; services="api" ;;
  *) echo "usage: deploy.sh prod|staging" >&2; exit 2 ;;
esac

# One deploy at a time: a second push waits for the first.
exec 9>/tmp/brait-deploy.lock
flock -w 1800 9

cd "$dir"
project=$(basename "$dir")
git fetch -q origin "$branch"
git checkout -q -B "$branch" "origin/$branch"
echo "== $target: $(git log --oneline -1)"

for service in $services; do
  sudo docker image inspect "$project-$service:latest" >/dev/null 2>&1 && sudo docker tag "$project-$service:latest" "$project-$service:previous"
done

sudo docker compose build $services
sudo docker compose up -d --no-build $services

for _ in $(seq 1 40); do
  if curl -fsS -m 3 "$health" >/dev/null 2>&1; then
    echo "== $target is up"
    [ "$target" = prod ] && install -m 700 deploy/server-deploy.sh "$HOME/brait-local/deploy.sh"
    exit 0
  fi
  sleep 3
done

echo "== $target did not come up: back to the previous version" >&2
sudo docker compose logs --tail 40 api >&2 || true
for service in $services; do
  sudo docker image inspect "$project-$service:previous" >/dev/null 2>&1 && sudo docker tag "$project-$service:previous" "$project-$service:latest"
done
sudo docker compose up -d --no-build $services
exit 1
