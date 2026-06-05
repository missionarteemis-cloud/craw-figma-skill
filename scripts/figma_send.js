#!/usr/bin/env node

var http = require("http");

var CONNECTOR_URL = "http://localhost:9199";

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
if (urlIdx !== -1 && args[urlIdx + 1]) { CONNECTOR_URL = args[urlIdx + 1]; }

var msgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
var body = JSON.stringify({ id: msgId, command: command, payload: payload });

var cUrl = CONNECTOR_URL;
var protoEnd = cUrl.indexOf("://");
var hostPart = protoEnd !== -1 ? cUrl.slice(protoEnd + 3) : cUrl;
var colIdx = hostPart.indexOf(":");
var slashIdx = hostPart.indexOf("/");
var hostname = colIdx !== -1 ? hostPart.slice(0, colIdx) : (slashIdx !== -1 ? hostPart.slice(0, slashIdx) : hostPart);
var portStr = colIdx !== -1 ? (slashIdx !== -1 ? hostPart.slice(colIdx + 1, slashIdx) : hostPart.slice(colIdx + 1)) : "9200";

var options = {
  hostname: hostname || "localhost",
  port: parseInt(portStr || "9200", 10),
  path: "/send-command",
  method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
};

var req = http.request(options, function(res) {
  var data = "";
  res.on("data", function(chunk) { data += chunk; });
  res.on("end", function() {
    try {
      var result = JSON.parse(data);
      if (result.status === "ok") { console.log(JSON.stringify(result.data, null, 2)); process.exit(0); }
      else if (result.status === "error") { console.error("Error:", result.data ? result.data.error || JSON.stringify(result.data) : "unknown"); process.exit(1); }
      else if (result.status === "timeout") { console.error("Timeout: no response from plugin"); process.exit(1); }
      else { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
    } catch(e) { console.log(data); process.exit(0); }
  });
});

req.on("error", function(err) {
  console.error("Connection error:", err.message);
  console.error("Make sure figma_connector.js is running on " + CONNECTOR_URL);
  process.exit(1);
});

req.write(body);
req.end();
