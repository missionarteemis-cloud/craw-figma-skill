#!/usr/bin/env node

var http = require("http");

// ── Log helpers with emoji ──
function log() { console.log("  🦀", Array.prototype.join.call(arguments, " ")); }
function logCmd(cmd) { console.log("  ⚡", cmd.command || "?", "—", cmd.payload ? (cmd.payload.name || "") : ""); }
function logTimeout(id, cmd, timeoutMs) { var ms = timeoutMs || 30000; console.log("  ⏰ TIMEOUT", id, "—", cmd.command || "?", "(" + ms + "ms)"); }
function logServer(port) { console.log("\n  🦀━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"); console.log("  🦀  Craw Figma Connector — ready"); console.log("  🦀  http://localhost:" + port); console.log("  🦀━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"); }
var PORT = 9199;
var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) {
  if (args[i] === "--port" && i + 1 < args.length) { PORT = parseInt(args[i + 1], 10); break; }
  if (args[i].startsWith("--port=")) { PORT = parseInt(args[i].split("=")[1], 10); break; }
}
if (isNaN(PORT) || PORT < 1 || PORT > 65535) PORT = 9199;

var pendingQueue = [];
var resultStore = {};
var userMessageQueue = [];
var responseQueue = [];

var server = http.createServer(function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  var url = req.url;
  var path = url.split("?")[0];

  // Health check
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", pendingCommands: pendingQueue.length, pendingMessages: userMessageQueue.length, pendingResponses: responseQueue.length }));
    return;
  }

  // Send command to plugin (used by figma_send.js and Craw)
  if (path === "/send-command") {
    readBody(req, function(body) {
      try { var cmd = JSON.parse(body); } catch(e) { console.log("  ❌ Invalid JSON"); res.writeHead(400); res.end("Invalid JSON"); return; }
      logCmd(cmd);
      cmd.timestamp = Date.now();
      pendingQueue.push(cmd);

      var id = cmd.id || Date.now().toString(36);
      var CMD_TIMEOUT = parseInt(process.env.FIGMA_CMD_TIMEOUT, 10) || 30000;
      var timeout = setTimeout(function() {
        logTimeout(id, cmd, CMD_TIMEOUT);
        delete resultStore[id];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: id, status: "timeout", data: null }));
      }, CMD_TIMEOUT);
      resultStore[id] = { resolve: function(result) {
        clearTimeout(timeout);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      }};
    });
    return;
  }

  // Plugin polls for next command
  if (path === "/next-command") {
    if (pendingQueue.length > 0) {
      var cmd = pendingQueue.shift();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ command: cmd }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ command: null }));
    }
    return;
  }

  // Plugin posts command result
  if (path === "/result") {
    readBody(req, function(body) {
      try {
        var result = JSON.parse(body);
        var id = result.id;
        if (id && resultStore[id]) {
          resultStore[id].resolve(result);
          delete resultStore[id];
        } else {
          resultStore[id] = result;
        }
      } catch(e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // User message queue (from UI)
  if (path === "/queue") {
    readBody(req, function(body) {
      try {
        var msg = JSON.parse(body);
        msg.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        msg.status = "pending";
        userMessageQueue.push(msg);
      } catch(e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // Craw polls for user messages
  if (path === "/queue-messages") {
    var msgs = [];
    while (userMessageQueue.length > 0) {
      var m = userMessageQueue.shift();
      m.status = "read";
      msgs.push(m);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages: msgs }));
    return;
  }

  // Craw posts response to user message
  if (path === "/queue-respond") {
    readBody(req, function(body) {
      try { responseQueue.push(JSON.parse(body)); } catch(e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // UI polls for responses
  if (path === "/queue-responses") {
    var responses = [];
    while (responseQueue.length > 0) { responses.push(responseQueue.shift()); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ responses: responses }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

function readBody(req, cb) {
  var body = "";
  req.on("data", function(chunk) { body += chunk; });
  req.on("end", function() { cb(body); });
}

server.listen(PORT, function() {
  logServer(PORT);
});

process.on("SIGINT", function() {
  server.close();
  process.exit(0);
});
