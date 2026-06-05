#!/usr/bin/env node

/**
 * figma_send.js — Invia un comando al plugin Figma via HTTP.
 *
 * Uso:
 *   node figma_send.js <comando> [--payload '{"key":"val"}']
 *   node figma_send.js createRectangle --payload '{"x":100,"y":100,"width":400,"height":300,"fillColor":{"r":0.14,"g":0.49,"b":1},"cornerRadius":12}'
 *   node figma_send.js getSelection
 *
 * Opzioni:
 *   --url http://localhost:9199   (default: $FIGMA_CONNECTOR_URL o http://localhost:9199)
 */

var http = require("http");
var url_mod = require("url");

var CONNECTOR_URL = process.env.FIGMA_CONNECTOR_URL || "http://localhost:9199";

var args = process.argv.slice(2);
var command = args[0];

if (!command || command === "--help") {
  console.log("Usage: node figma_send.js <command> [--payload '{}']");
  console.log("Commands: createRectangle, createFrame, createEllipse, createText, selectNode, updateNode, deleteNode, getSelection, getPageInfo, setFillColor, groupSelection");
  process.exit(command ? 0 : 1);
}

var payload = {};
var payloadIdx = args.indexOf("--payload");
if (payloadIdx !== -1 && args[payloadIdx + 1]) {
  try { payload = JSON.parse(args[payloadIdx + 1]); } catch(e) { console.error("Invalid JSON payload"); process.exit(1); }
}

var urlIdx = args.indexOf("--url");
if (urlIdx !== -1 && args[urlIdx + 1]) {
  CONNECTOR_URL = args[urlIdx + 1];
}

var msgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
var body = JSON.stringify({ id: msgId, command: command, payload: payload });

var parsed = url_mod.parse(CONNECTOR_URL);

var options = {
  hostname: parsed.hostname || "localhost",
  port: parseInt(parsed.port || "9199", 10),
  path: "/send-command",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  }
};

var req = http.request(options, function(res) {
  var data = "";
  res.on("data", function(chunk) { data += chunk; });
  res.on("end", function() {
    try {
      var result = JSON.parse(data);
      if (result.status === "ok") {
        console.log(JSON.stringify(result.data, null, 2));
        process.exit(0);
      } else if (result.status === "error") {
        console.error("Error:", result.data ? result.data.error || JSON.stringify(result.data) : "unknown");
        process.exit(1);
      } else if (result.status === "timeout") {
        console.error("Timeout: no response from plugin");
        process.exit(1);
      } else {
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      }
    } catch(e) {
      console.log(data);
      process.exit(0);
    }
  });
});

req.on("error", function(err) {
  console.error("Connection error:", err.message);
  console.error("Make sure figma_connector.js is running on " + CONNECTOR_URL);
  process.exit(1);
});

req.write(body);
req.end();
