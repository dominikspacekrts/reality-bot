#!/bin/zsh
# Stops and removes the reality-bot LaunchAgents.
for name in check server; do
  launchctl bootout "gui/$(id -u)/cz.reality-bot.$name" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/cz.reality-bot.$name.plist"
done
echo "Plánované spouštění odstraněno."
