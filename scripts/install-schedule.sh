#!/bin/zsh
# Installs two macOS LaunchAgents:
#  - cz.reality-bot.check   runs the check at the times in config.json → schedule
#  - cz.reality-bot.server  keeps the UI running on http://localhost:4747
# Re-run after changing the schedule. Remove with scripts/uninstall-schedule.sh.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
NODE="$(command -v node)"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$ROOT/logs"

TIMES=$("$NODE" -e 'const c=require("./config.json");for(const t of c.schedule){const[h,m]=t.split(":").map(Number);console.log(`<dict><key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer></dict>`)}')

cat > "$AGENTS/cz.reality-bot.check.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cz.reality-bot.check</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$ROOT/src/check.js</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartCalendarInterval</key><array>
$TIMES
  </array>
  <key>StandardOutPath</key><string>$ROOT/logs/check.log</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/check.log</string>
</dict></plist>
EOF

cat > "$AGENTS/cz.reality-bot.server.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cz.reality-bot.server</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$ROOT/server.js</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/logs/server.log</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/server.log</string>
</dict></plist>
EOF

for name in check server; do
  launchctl bootout "gui/$(id -u)/cz.reality-bot.$name" 2>/dev/null || true
  # bootout finishes asynchronously; retry until launchd accepts the new agent.
  for try in 1 2 3 4 5; do
    launchctl bootstrap "gui/$(id -u)" "$AGENTS/cz.reality-bot.$name.plist" 2>/dev/null && break
    sleep 1
  done
done
echo "Hotovo. Kontrola poběží v: $("$NODE" -e 'console.log(require("./config.json").schedule.join(", "))'). UI: http://localhost:4747"
