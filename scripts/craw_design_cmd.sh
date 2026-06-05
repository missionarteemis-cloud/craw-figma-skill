#!/bin/bash
# Craw Design Command — invoked by Craw (not by user directly)
# 
# This script is called when Craw needs to design something in Figma.
# It integrates NotebookLM consultation with the Design Orchestrator.
#
# Usage (by Craw):
#   ./craw_design_cmd.sh "disegnami un cuoricino rosso con ombra"
#
# This is NOT meant to be run standalone — it's the execution layer
# that Craw uses after consulting NotebookLM for design advice.

PROMPT="$*"
ORCHESTRATOR="$(dirname "$0")/design_orchestrator.js"

if [ -z "$PROMPT" ]; then
  echo "Usage: craw_design_cmd.sh <design prompt>"
  exit 1
fi

echo "🦀 Craw Design Command"
echo "━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Pass through to orchestrator
node "$ORCHESTRATOR" "$PROMPT"
