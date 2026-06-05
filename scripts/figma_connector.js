#!/usr/bin/env node

var WebSocketServer = require("ws").WebSocketServer;
var http = require("http");

var PORT = 9199;
var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) { if (args[i]==="--port"&&i+1<args.length) { PORT=parseInt(args[i+1],10); break; } if (args[i].startsWith("--port=")) { PORT=parseInt(args[i].split("=")[1],10); break; } }
if (isNaN(PORT)||PORT<1||PORT>65535) PORT=9199;

var pluginSocket = null;
var pendingQueue = [];
var resultStore = {};
var userMessageQueue = [];
var responseQueue = [];
var pendingCallbacks = {};

// ── WebSocket (for plugin) ──
var wss = new WebSocketServer({ port: PORT });

wss.on("connection", function(ws, req) {
  var d = new Date().toISOString();
  console.log("[" + d + "] Plugin connected via WebSocket");
  pluginSocket = ws;

  // Send any pending commands
  while (pendingQueue.length > 0) {
    var cmd = pendingQueue.shift();
    try { ws.send(JSON.stringify(cmd)); } catch(e) {}
  }

  ws.on("message", function(data) {
    var msg = data.toString();
    // Plugin doesn't send messages currently, but log if something arrives
    console.log("[" + new Date().toISOString() + "] Plugin msg: " + msg.slice(0, 200));
  });

  ws.on("close", function() {
    var d = new Date().toISOString();
    console.log("[" + d + "] Plugin disconnected");
    pluginSocket = null;
  });

  ws.on("error", function() {});
});

// ── HTTP (for Craw and fallback) ──
var server = http.createServer(function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  var path = req.url.split("?")[0];

  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", pluginConnected: pluginSocket !== null && pluginSocket.readyState === WebSocket.OPEN, pendingCommands: pendingQueue.length, pendingMessages: userMessageQueue.length, pendingResponses: responseQueue.length }));

  } else if (path === "/send-command") {
    readBody(req, function(body) {
      try {
        var cmd = JSON.parse(body);
        var id = cmd.id;
        if (pluginSocket && pluginSocket.readyState === WebSocket.OPEN) {
          pluginSocket.send(JSON.stringify(cmd));
        } else {
          pendingQueue.push(cmd);
        }
        var timeout = setTimeout(function() {
          delete pendingCallbacks[id];
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: id, status: "timeout", data: null }));
        }, 15000);
        pendingCallbacks[id] = function(result) {
          clearTimeout(timeout);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        };
      } catch(e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });

  } else if (path === "/queue") {
    readBody(req, function(body) {
      try { var msg = JSON.parse(body); msg.id = Date.now().toString(36) + Math.random().toString(36).slice(2,6); msg.status = "pending"; userMessageQueue.push(msg); res.writeHead(200); res.end(JSON.stringify({ok:true,id:msg.id})); }
      catch(e) { res.writeHead(400); res.end("Invalid JSON"); }
    });

  } else if (path === "/queue-messages") {
    var msgs = [];
    while (userMessageQueue.length > 0) { var m = userMessageQueue.shift(); m.status = "read"; msgs.push(m); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages: msgs }));

  } else if (path === "/queue-respond") {
    readBody(req, function(body) {
      try { responseQueue.push(JSON.parse(body)); res.writeHead(200); res.end(JSON.stringify({ok:true})); }
      catch(e) { res.writeHead(400); res.end("Invalid JSON"); }
    });

  } else if (path === "/queue-responses") {
    var responses = [];
    while (responseQueue.length > 0) { responses.push(responseQueue.shift()); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ responses: responses }));

  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

function readBody(req, cb) {
  var body = "";
  req.on("data", function(chunk) { body += chunk; });
  req.on("end", function() { cb(body); });
}

server.listen(PORT + 1, function() {
  var d = new Date().toISOString();
  console.log("[" + d + "] HTTP fallback on :" + (PORT + 1));
});

var d = new Date().toISOString();
console.log("[" + d + "] Craw Figma Connector listening");
console.log("[" + d + "] WebSocket  ws://localhost:" + PORT + " (plugin)");
console.log("[" + d + "] HTTP      :" + (PORT + 1) + " (Craw/fallback)");

process.on("SIGINT", function() {
  var d = new Date().toISOString();
  console.log("[" + d + "] Shutting down...");
  wss.close();
  server.close();
  process.exit(0);
});
