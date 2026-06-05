#!/usr/bin/env node

/**
 * figma_send.js — Invia un comando al plugin Figma via WebSocket locale.
 *
 * Uso:
 *   node figma_send.js <comando> [--payload '{"key":"val"}']
 *   node figma_send.js createRectangle --payload '{"x":100,"y":100,"width":400,"height":300,"fillColor":{"r":0.14,"g":0.49,"b":1},"cornerRadius":12}'
 *   node figma_send.js getSelection
 *   node figma_send.js setFillColor --payload '{"id":"1234","color":{"r":1,"g":0.42,"b":0.21}}'
 *
 * Comandi disponibili:
 *   createRectangle, createFrame, createEllipse, createText,
 *   selectNode, updateNode, deleteNode, getSelection, getPageInfo,
 *   setFillColor, groupSelection
 */

const WebSocket = require("ws");
const WS_URL = process.env.FIGMA_WS_URL || "ws://localhost:9199";
const TIMEOUT_MS = 15000;

const args = process.argv.slice(2);
const command = args[0];
if (!command || command === "--help") {
  console.log("Usage: node figma_send.js <command> [--payload '{}']");
  console.log("Commands: createRectangle, createFrame, createEllipse, createText, selectNode, updateNode, deleteNode, getSelection, getPageInfo, setFillColor, groupSelection");
  process.exit(command ? 0 : 1);
}

let payload = {};
const payloadIdx = args.indexOf("--payload");
if (payloadIdx !== -1 && args[payloadIdx + 1]) {
  try { payload = JSON.parse(args[payloadIdx + 1]); } catch { console.error("Invalid JSON payload"); process.exit(1); }
}

const msgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const msg = JSON.stringify({ id: msgId, command, payload });

const ws = new WebSocket(WS_URL);
let responded = false;

const timer = setTimeout(() => {
  if (!responded) {
    responded = true;
    console.error("Timeout: no response from plugin");
    ws.close();
    process.exit(1);
  }
}, TIMEOUT_MS);

ws.on("open", () => {
  ws.send(msg);
});

ws.on("message", (data) => {
  if (responded) return;
  responded = true;
  clearTimeout(timer);
  try {
    const res = JSON.parse(data.toString());
    if (res.id !== msgId) {
      // Potrebbe essere di un'altra sessione, ignoriamo
      responded = false;
      return;
    }
    if (res.status === "ok") {
      console.log(JSON.stringify(res.result, null, 2));
      process.exit(0);
    } else {
      console.error("Error:", res.error || "unknown");
      process.exit(1);
    }
  } catch {
    console.log(data.toString());
    process.exit(0);
  }
  ws.close();
});

ws.on("error", (err) => {
  if (!responded) {
    responded = true;
    clearTimeout(timer);
    console.error("WebSocket error:", err.message);
    process.exit(1);
  }
});
