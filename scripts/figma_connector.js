#!/usr/bin/env node

/**
 * Craw Figma Connector (HTTP polling mode)
 *
 * Ascolta su due porte:
 * - :9199  HTTP: il plugin Figma fa poll qui per nuovi comandi e POST risultati
 * - :9200  HTTP: health check
 *
 * Uso:
 *   node figma_connector.js
 *   node figma_connector.js --port 9199
 */

var http = require("http");
var url = require("url");

var PORT = 9199;
var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) {
  if (args[i] === "--port" && i + 1 < args.length) { PORT = parseInt(args[i + 1], 10); break; }
  if (args[i].startsWith("--port=")) { PORT = parseInt(args[i].split("=")[1], 10); break; }
}
if (isNaN(PORT) || PORT < 1 || PORT > 65535) PORT = 9199;

// Coda comandi: Craw scrive qui, plugin fa poll e prende
var commandQueue = [];
// Risultati: plugin POST qui, Craw aspetta
var resultStore = {};
// Callback per attese
var pendingCallbacks = {};

// ── HTTP Server (polling endpoint) ──────────────────────────────────
var server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var path = parsed.pathname;

  // CORS headers per richieste dal plugin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (path === "/next-command") {
    // Plugin fa poll per nuovi comandi
    var cmd = commandQueue.shift() || null;
    if (cmd) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cmd));
    } else {
      res.writeHead(204);
      res.end();
    }

  } else if (path === "/result") {
    // Plugin POST risultati
    var body = "";
    req.on("data", function(chunk) { body += chunk; });
    req.on("end", function() {
      try {
        var result = JSON.parse(body);
        resultStore[result.id] = result;
        // Se c'è un pending callback per questo ID, lo risolviamo
        if (pendingCallbacks[result.id]) {
          pendingCallbacks[result.id](result);
          delete pendingCallbacks[result.id];
        }
      } catch(e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });

  } else if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      pendingCommands: commandQueue.length,
      pendingResults: Object.keys(pendingCallbacks).length
    }));

  } else if (path === "/send-command") {
    // Craw invia un comando (via figma_send.js)
    var body = "";
    req.on("data", function(chunk) { body += chunk; });
    req.on("end", function() {
      try {
        var cmd = JSON.parse(body);
        var id = cmd.id;
        commandQueue.push(cmd);

        // Aspetta il risultato (polling reply)
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

        // Se il risultato arriva prima che il plugin lo legga…
        // (caso raro ma gestito)
        if (resultStore[id]) {
          var r = resultStore[id];
          if (pendingCallbacks[id]) {
            pendingCallbacks[id](r);
            delete pendingCallbacks[id];
          }
          delete resultStore[id];
        }
      } catch(e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });

  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, function() {
  var d = new Date().toISOString();
  console.log("[" + d + "] Craw Figma Connector (HTTP) listening on http://localhost:" + PORT);
  console.log("[" + d + "] Waiting for plugin...");
});

process.on("SIGINT", function() {
  var d = new Date().toISOString();
  console.log("[" + d + "] Shutting down...");
  server.close();
  process.exit(0);
});
