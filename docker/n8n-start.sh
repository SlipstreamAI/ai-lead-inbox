#!/bin/sh
set -eu
marker=/home/node/.n8n/.lead-inbox-imported
mkdir -p /home/node/.n8n
if [ ! -f "$marker" ]; then
  if n8n import:workflow --input=/files/n8n/ai-lead-inbox.workflow.json; then
    touch "$marker"
  else
    echo "n8n import failed. Import n8n/ai-lead-inbox.workflow.json from the editor."
  fi
fi
exec n8n start
