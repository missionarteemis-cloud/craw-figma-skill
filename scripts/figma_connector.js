#!/usr/bin/env node

var http = require("http");

var PORT = 9199;
var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) {
  if (args[i] === "--port" && i + 1 < args.length) { PORT = parseInt(args[i + 1], 10); break; }
  if (args[i].startsWith("--port=")) { PORT = parseInt(args[i].split("=")[1], 10); break; }
}
if (isNaN(PORT) || PORT < 1 || PORT > 65535) PORT = 9199;

// Command queue: plugin polls here
var commandQueue = [];
// Result store: plugin posts results here
var resultStore = {};
// User message queue: plugin posts user chat messages here
var userMessageQueue = [];
// Response queue: Craw posts responses here, plugin polls
var responseQueue = [];
// Pending callbacks for send-command
var pendingCallbacks = {};

function serverCORS(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return true; }
  return false;
}

function readBody(req, cb) {
  var body = "";
  req.on("data", function(chunk) { body += chunk; });
  req.on("end", function() { cb(body); });
}

var server = http.createServer(function(req, res) {
  if (serverCORS(req, res)) return;

  var path = req.url.split("?")[0];

  // Plugin polls for next command to execute
  if (path === "/next-command") {
    var cmd = commandQueue.shift() || null;
    if (cmd) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cmd));
    } else {
      res.writeHead(204);
      res.end();
    }

  // Plugin posts result of a command execution
  } else if (path === "/result") {
    readBody(req, function(body) {
      try {
        var result = JSON.parse(body);
        resultStore[result.id] = result;
        if (pendingCallbacks[result.id]) {
          pendingCallbacks[result.id](result);
          delete pendingCallbacks[result.id];
        }
      } catch(e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });

  // Craw sends a command and waits for result
  } else if (path === "/send-command") {
    readBody(req, function(body) {
      try {
        var cmd = JSON.parse(body);
        var id = cmd.id;
        commandQueue.push(cmd);

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

        if (resultStore[id]) {
          var r = resultStore[id];
          if (pendingCallbacks[id]) { pendingCallbacks[id](r); delete pendingCallbacks[id]; }
          delete resultStore[id];
        }
      } catch(e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });

  // Plugin posts a user chat message to the queue
  } else if (path === "/queue") {
    readBody(req, function(body) {
      try {
        var msg = JSON.parse(body);
        msg.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        msg.status = "pending";
        userMessageQueue.push(msg);
        var d = new Date().toISOString();
        console.log("[" + d + "] User message: " + msg.text);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, id: msg.id }));
      } catch(e) {
        res.writeHead(400);
        res.end("Invalid JSON");
      }
    });

  // Craw checks for pending user messages
  } else if (path === "/queue-messages") {
    var msgs = [];
    while (userMessageQueue.length > 0) {
      var m = userMessageQueue.shift();
      m.status = "read";
      msgs.push(m);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages: msgs }));

  // Craw posts response to a user message
  } else if (path === "/queue-respond") {
    readBody(req, function(body) {
      try {
        var resp = JSON.parse(body);
        responseQueue.push(resp);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400);
        res.end("Invalid JSON");
      }
    });

  // Plugin polls for responses to user messages
  } else if (path === "/queue-responses") {
    var responses = [];
    while (responseQueue.length > 0) {
      responses.push(responseQueue.shift());
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ responses: responses }));

  // Craw or plugin health check
  } else if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      pendingCommands: commandQueue.length,
      pendingMessages: userMessageQueue.length,
      pendingResponses: responseQueue.length,
      pendingResults: Object.keys(pendingCallbacks).length
    }));

  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, function() {
  var d = new Date().toISOString();
  console.log("[" + d + "] Craw Figma Connector listening on :" + PORT);
});

process.on("SIGINT", function() {
  var d = new Date().toISOString();
  console.log("[" + d + "] Shutting down...");
  server.close();
  process.exit(0);
});
