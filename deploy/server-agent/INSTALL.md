# MyTrackHub server agent — install

What it gives the website (MyTPlus administrators only):

- **Logs → Server logs**: SSH sign-ins (and failures), sign-outs, sudo, su, user/group
  changes, file deletes/changes in `/var/www`, `/etc/nginx`, `/etc/ssh`, and any attempt
  to change or stop auditing or the agent.
- **Server → Clear cache**: cache sizes and one-click clearing (memory page cache,
  journal, APT, old /tmp files, PM2 logs, nginx cache). Every click is logged with who did it.

Server capacity (**Server → Capacity**) needs nothing here: the API reads it itself.

Everything below runs on the Linux server that runs the API, as a user with `sudo`.

## 1. API key (once)

```bash
openssl rand -hex 32
```

Put the value in `api/.env.production`:

```
SERVER_AGENT_KEY=<the value>
```

and restart the API: `pm2 restart mytrackhub-api`.

## 2. auditd

```bash
sudo apt-get install -y auditd           # RHEL/Rocky: sudo dnf install -y audit
sudo cp 60-mytrackhub.rules /etc/audit/rules.d/
sudo augenrules --load
sudo systemctl enable --now auditd
sudo auditctl -l | grep mth_             # should list the rules
```

Recommended in `/etc/audit/auditd.conf`: `log_format = ENRICHED` (user names are
written into the log), then `sudo service auditd restart`.

## 3. The agent

```bash
sudo mkdir -p /opt/mytrackhub-agent
sudo cp agent.mjs /opt/mytrackhub-agent/
sudo cp mytrackhub-agent.env.example /etc/mytrackhub-agent.env
sudo chmod 600 /etc/mytrackhub-agent.env
sudo nano /etc/mytrackhub-agent.env      # AGENT_KEY = the same value as SERVER_AGENT_KEY
                                         # PM2_LOG_DIR = /home/<pm2 user>/.pm2/logs
sudo cp mytrackhub-agent.service /etc/systemd/system/
```

Node must be reachable for root. Check with `sudo which node`; if it is empty (nvm),
change `ExecStart` in the service file to the full path, e.g.
`ExecStart=/home/deploy/.nvm/versions/node/v20.18.0/bin/node /opt/mytrackhub-agent/agent.mjs`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mytrackhub-agent
sudo journalctl -u mytrackhub-agent -f   # should show "MyTrackHub agent … →" and no errors
```

Open the website → **Logs → Server logs**: the server appears with a green
"reporting" badge within a minute.

## 4. Test

```bash
ssh <you>@server                  # → "SSH sign-in"
sudo ls /root                     # → "sudo: /usr/bin/ls /root"
touch /var/www/test.txt && rm /var/www/test.txt   # → "Deleted /var/www/test.txt"
```

## 5. SQL Server (other machine)

Deletes made directly in the database (SSMS, scripts) happen on the SQL Server
machine, which this agent cannot see. Run `sqlserver-audit.sql` there (adjust the
folder and database name). It records every DELETE, schema change and sign-in with
the login name, client IP and SQL text.

## Notes

- If the API is down, nothing is lost: the agent keeps its read position and sends
  the entries once the API is back.
- If the agent stops (or someone stops it), the website shows **"silent"** for that
  server after 3 minutes, and the stop itself is logged ("Agent stopped").
- After everything works you may add `-e 2` at the end of the rules file: the audit
  rules are then locked until the next reboot.
- Update the agent: copy the new `agent.mjs`, then `sudo systemctl restart mytrackhub-agent`.
