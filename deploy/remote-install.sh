#!/usr/bin/env bash
# Runs ON THE SERVER (started by deploy/deploy-to-server.sh).
#   1. checks  2. backup  3. new code  4. agent key  5. restart API (+ rollback)
#   6. auditd + rules  7. server agent  8. verify
set -euo pipefail

STAGE="${1:-/tmp/mytrackhub-release}"
APP="/var/www/MyTrackHub"
LABEL="172.28.14.181"
API_NAME="mytrackhub-api"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/var/backups/mytrackhub-$STAMP.tgz"

step() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok() { printf '   \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '   \033[33m!\033[0m %s\n' "$*"; }
die() {
  printf '   \033[31m✘ %s\033[0m\n' "$*"
  exit 1
}

# ── 1. checks ──
step "1. Checks"
sudo -v || die "sudo is needed"
ok "sudo works"
[ -d "$APP/api/src" ] || die "$APP/api/src not found"
[ -f "$APP/api/.env.production" ] || die "$APP/api/.env.production not found"
OWNER="$(stat -c %U "$APP/api")"
ok "app folder $APP (owner: $OWNER)"

# Who runs PM2 (the "God Daemon"), its home, and the node binary it runs on
# (taken from the running process, so nvm / custom paths just work).
PM2_LINE="$(ps -eo pid=,args= | grep -m1 '[P]M2 v.*God Daemon' || true)"
PM2_PID="$(awk '{print $1}' <<<"$PM2_LINE")"
[ -n "$PM2_PID" ] || die "PM2 is not running (expected it to run $API_NAME)"
PM2_USER="$(stat -c %U "/proc/$PM2_PID")"
PM2_HOME="$(sed -n 's/.*God Daemon (\(.*\)).*/\1/p' <<<"$PM2_LINE")"
NODE_BIN="$(sudo readlink -f "/proc/$PM2_PID/exe")"
[ -x "$NODE_BIN" ] || die "cannot find the node binary of PM2"
NODE_DIR="$(dirname "$NODE_BIN")"
ok "PM2 runs as $PM2_USER (home $PM2_HOME)"
ok "node $("$NODE_BIN" -v) at $NODE_BIN"
as_pm2() { sudo -u "$PM2_USER" -H env "PATH=$NODE_DIR:$PATH" "PM2_HOME=$PM2_HOME" bash -c "$*"; }
as_pm2 "pm2 describe $API_NAME >/dev/null" || die "PM2 has no process named $API_NAME (PM2_HOME=$PM2_HOME)"
FREE_MB="$(df -Pm "$APP" | awk 'NR==2{print $4}')"
[ "$FREE_MB" -gt 300 ] || die "only ${FREE_MB} MB free on the disk"
ok "${FREE_MB} MB free"

# ── 2. backup ──
step "2. Backup → $BACKUP"
sudo mkdir -p /var/backups
sudo tar czf "$BACKUP" -C "$APP" --exclude='api/node_modules' api admin/.output 2>/dev/null ||
  sudo tar czf "$BACKUP" -C "$APP" --exclude='api/node_modules' api
ok "saved ($(du -h "$BACKUP" | cut -f1))"

rollback() {
  warn "Rolling back to the backup…"
  sudo rm -rf "$APP/api/src" "$APP/admin/.output/public"
  sudo tar xzf "$BACKUP" -C "$APP"
  sudo chown -R "$OWNER": "$APP/api" "$APP/admin/.output" 2>/dev/null || true
  as_pm2 "pm2 restart $API_NAME --update-env >/dev/null" || true
  die "Deploy failed — the previous version is restored. Backup: $BACKUP"
}

# ── 3. new code ──
step "3. New code"
sudo rsync -a --delete "$STAGE/api/src/" "$APP/api/src/"
sudo cp "$STAGE/api/package.json" "$STAGE/api/package-lock.json" "$APP/api/"
sudo mkdir -p "$APP/admin/.output/public"
sudo rsync -a --delete "$STAGE/admin-public/" "$APP/admin/.output/public/"
sudo chown -R "$OWNER": "$APP/api/src" "$APP/api/package.json" "$APP/api/package-lock.json" "$APP/admin/.output"
ok "API code and website updated"

# Install dependencies only when the lock file changed.
if ! sudo tar xzf "$BACKUP" -O api/package-lock.json 2>/dev/null | cmp -s - "$APP/api/package-lock.json"; then
  warn "dependencies changed → npm install"
  sudo -u "$OWNER" -H env "PATH=$NODE_DIR:$PATH" bash -c "cd '$APP/api' && npm install --omit=dev --no-audit --no-fund" || rollback
fi

# ── 4. agent key in the API settings ──
step "4. Agent key"
ENVF="$APP/api/.env.production"
KEY="$(sudo sed -n 's/^SERVER_AGENT_KEY=\(.\{24,\}\)$/\1/p' "$ENVF" | tail -1)"
if [ -z "$KEY" ]; then
  KEY="$(openssl rand -hex 32)"
  sudo sed -i '/^SERVER_AGENT_KEY=/d' "$ENVF"
  printf '\n# Server agent (deploy/server-agent)\nSERVER_AGENT_KEY=%s\n' "$KEY" | sudo tee -a "$ENVF" >/dev/null
  ok "new SERVER_AGENT_KEY added to .env.production"
else
  ok "SERVER_AGENT_KEY already set"
fi

# ── 5. restart the API, check health, roll back if it fails ──
step "5. Restart API"
as_pm2 "pm2 restart $API_NAME --update-env >/dev/null" || rollback
PORT="$(sudo sed -n 's/^PORT=\([0-9]*\)$/\1/p' "$ENVF" | tail -1)"
PORT="${PORT:-4000}"
for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
  [ "$i" = 30 ] && {
    as_pm2 "pm2 logs $API_NAME --lines 30 --nostream" || true
    rollback
  }
done
ok "API healthy on port $PORT"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/v1/server-agent/events" \
  -H 'content-type: application/json' -H "x-agent-key: $KEY" -d "{\"host\":\"$LABEL\",\"events\":[]}")"
[ "$CODE" = 200 ] || rollback
ok "agent endpoint accepts the key"
as_pm2 "pm2 save >/dev/null" || true

# ── 6. auditd ──
step "6. auditd"
if ! command -v auditctl >/dev/null 2>&1; then
  if command -v apt-get >/dev/null; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y auditd >/dev/null
  elif command -v dnf >/dev/null; then
    sudo dnf install -y audit >/dev/null
  else
    sudo yum install -y audit >/dev/null
  fi
  ok "auditd installed"
fi
sudo install -m 640 "$STAGE/deploy/server-agent/60-mytrackhub.rules" /etc/audit/rules.d/60-mytrackhub.rules
if grep -q '^log_format *= *RAW' /etc/audit/auditd.conf 2>/dev/null; then
  sudo sed -i 's/^log_format *= *RAW/log_format = ENRICHED/' /etc/audit/auditd.conf
fi
sudo systemctl enable auditd >/dev/null 2>&1 || true
sudo systemctl restart auditd 2>/dev/null || sudo service auditd restart
sudo augenrules --load >/dev/null 2>&1 || true
N="$(sudo auditctl -l | grep -c 'mth_' || true)"
[ "$N" -gt 0 ] && ok "$N audit rules active" || warn "audit rules not loaded (check: sudo auditctl -l)"

# ── 7. the server agent ──
step "7. Server agent"
sudo mkdir -p /opt/mytrackhub-agent
sudo install -m 644 "$STAGE/deploy/server-agent/agent.mjs" /opt/mytrackhub-agent/agent.mjs
PM2_LOGS="$PM2_HOME/logs"
sudo tee /etc/mytrackhub-agent.env >/dev/null <<EOF
API_URL=http://127.0.0.1:$PORT/api/v1/server-agent
AGENT_KEY=$KEY
HOST_LABEL=$LABEL
PM2_LOG_DIR=$PM2_LOGS
NGINX_CACHE_DIR=
JOURNAL_KEEP=7d
TMP_DAYS=7
EOF
sudo chmod 600 /etc/mytrackhub-agent.env
sed "s#^ExecStart=.*#ExecStart=$NODE_BIN /opt/mytrackhub-agent/agent.mjs#" \
  "$STAGE/deploy/server-agent/mytrackhub-agent.service" | sudo tee /etc/systemd/system/mytrackhub-agent.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable mytrackhub-agent >/dev/null 2>&1
sudo systemctl restart mytrackhub-agent
sleep 6
systemctl is-active --quiet mytrackhub-agent || {
  sudo journalctl -u mytrackhub-agent -n 30 --no-pager
  die "the agent did not start (the API itself is fine)"
}
if sudo journalctl -u mytrackhub-agent --since "-1min" --no-pager | grep -q 'error:'; then
  sudo journalctl -u mytrackhub-agent -n 15 --no-pager
  warn "agent runs but reported errors (see above)"
else
  ok "agent running and reporting as $LABEL"
fi

# ── 8. done ──
step "8. Summary"
ok "backup: $BACKUP"
ok "website + API updated, API healthy"
ok "auditd + agent running"
rm -rf "$STAGE"
