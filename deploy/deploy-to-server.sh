#!/usr/bin/env bash
# Deploy MyTrackHub from this computer to the server, then install the server
# agent. Run from the project folder:
#
#   bash deploy/deploy-to-server.sh                 # administrator@172.28.14.181
#   bash deploy/deploy-to-server.sh user@host       # another server
#
# It asks for the SSH password (unless your key is installed) and, on the
# server, for the sudo password. Nothing is changed before a backup is made,
# and the API is rolled back automatically if it does not come up healthy.
set -euo pipefail

TARGET="${1:-administrator@172.28.14.181}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="/tmp/mytrackhub-release"
# One SSH connection for all steps → the password is asked only once.
CTL="$HOME/.ssh/mytrackhub-%r@%h:%p"
SSH=(ssh -o ControlMaster=auto -o "ControlPath=$CTL" -o ControlPersist=10m -o StrictHostKeyChecking=accept-new)

step() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }

step "1/4 Build the website (admin/.output/public)"
(cd "$ROOT/admin" && npm run generate >/dev/null)
test -f "$ROOT/admin/.output/public/index.html" || { echo "Build failed"; exit 1; }

step "2/4 Connect to $TARGET"
"${SSH[@]}" "$TARGET" "echo connected to \$(hostname) as \$(whoami); rm -rf $STAGE && mkdir -p $STAGE"

step "3/4 Upload the release to $STAGE (code only — no .env, no node_modules)"
RSYNC_SSH="ssh -o ControlMaster=auto -o ControlPath=$CTL -o ControlPersist=10m"
rsync -az -e "$RSYNC_SSH" \
  --exclude node_modules --exclude '.env' --exclude '.env.*' --exclude '*.bak' --exclude '*.pre-mssql.bak' \
  "$ROOT/api/src" "$ROOT/api/package.json" "$ROOT/api/package-lock.json" "$TARGET:$STAGE/api/"
rsync -az -e "$RSYNC_SSH" "$ROOT/admin/.output/public/" "$TARGET:$STAGE/admin-public/"
rsync -az -e "$RSYNC_SSH" "$ROOT/deploy/server-agent" "$ROOT/deploy/remote-install.sh" "$TARGET:$STAGE/deploy/"

step "4/4 Install on the server (asks for the sudo password)"
"${SSH[@]}" -t "$TARGET" "bash $STAGE/deploy/remote-install.sh $STAGE"

"${SSH[@]}" -O exit "$TARGET" 2>/dev/null || true
printf '\n\033[1;32m✔ Done.\033[0m Open http://172.28.14.181/server and Logs → Server logs.\n'
