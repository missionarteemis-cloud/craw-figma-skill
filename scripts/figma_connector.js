#!/usr/bin/env node

/**
 * Craw Figma Connector
 *
 * WebSocket server locale (ws://localhost:9199).
 * Il plugin Figma si connette a questo server.
 * Craw (via skill script) scrive comandi su questo canale.
 *
 * Uso:
 *   node figma_connector.js
 *
 * Opzioni:
 *   --port 9199    Porta del WebSocket (default 9199)
 */

const { WebSocketServer } = require("ws");
const http = require("http");

const PORT = parseInt(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || process.argv[process.argv.indexOf("--port") + 1] || "9199", 10);

// Coda di messaggi: quando il plugin non è connesso, i comandi si accumulano
// e vengono inviati appena il plugin si riconnette
let pluginSocket = null;
const pendingQueue = [];

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, req) => {
  // Identifica se è il plugin o Craw
  const ua = req.headers["user-agent"] || "";
  const isPlugin = ua.includes("Figma") || !req.headers["origin"] || req.headers["origin"].includes("figma");

  if (isPlugin) {
    console.log(`[${new Date().toISOString()}] Plugin connected`);
    pluginSocket = ws;

    // Invia tutti i comandi in attesa
    while (pendingQueue.length > 0) {
      const msg = pendingQueue.shift();
      try { ws.send(JSON.stringify(msg)); } catch {}
    }

    ws.on("close", () => {
      console.log(`[${new Date().toISOString()}] Plugin disconnected`);
      pluginSocket = null;
    });

    ws.on("message", (data) => {
      // Risposta del plugin → la inoltriamo a Craw via stdin/stdout
      const msg = data.toString();
      // Il chiamante (script skill) ascolta su stdout
      process.stdout.write(msg + "\n");
    });

  } else {
    // Connessione da Craw / script — probabilmente un messaggio one-shot
    console.log(`[${new Date().toISOString()}] Client connected (likely Craw)`);

    ws.on("message", (data) => {
      const msg = data.toString();
      if (pluginSocket && pluginSocket.readyState === ws.OPEN) {
        pluginSocket.send(msg);
      } else {
        pendingQueue.push(JSON.parse(msg));
      }
    });

    ws.on("close", () => {});
  }
});

// HTTP health check
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: "ok",
    pluginConnected: pluginSocket?.readyState === WebSocket.OPEN,
    pendingCommands: pendingQueue.length,
  }));
});
server.listen(PORT + 1, () => {
  console.log(`[${new Date().toISOString()}] HTTP health check on :${PORT + 1}`);
});

console.log(`[${new Date().toISOString()}] Craw Figma Connector listening on ws://localhost:${PORT}`);
console.log(`[${new Date().toISOString()}] Plugin status: waiting for connection...`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(`[${new Date().toISOString()}] Shutting down...`);
  wss.close();
  server.close();
  process.exit(0);
});
