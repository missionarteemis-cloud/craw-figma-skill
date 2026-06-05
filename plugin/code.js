/// Craw Figma Connector — Plugin Code (ES5)
/// WebSocket connection to local ws://localhost:9199

var ws = null;
var reconnectTimer = null;
var WS_URL = "ws://localhost:9199";

function postUI(type, data) {
  data = data || {};
  var msg = { type: type };
  for (var key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      msg[key] = data[key];
    }
  }
  figma.ui.postMessage(msg);
}

function hasFills(node) { return "fills" in node; }
function hasResize(node) { return "resize" in node; }
function hasPosition(node) { return "x" in node && "y" in node; }

var commands = {
  createRectangle: function(p) {
    return figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
      var rect = figma.createRectangle();
      rect.x = typeof p.x !== "undefined" ? p.x : 0;
      rect.y = typeof p.y !== "undefined" ? p.y : 0;
      rect.resize(typeof p.width !== "undefined" ? p.width : 200, typeof p.height !== "undefined" ? p.height : 100);
      if (p.cornerRadius) rect.cornerRadius = p.cornerRadius;
      if (p.fillColor) rect.fills = [{ type: "SOLID", color: p.fillColor, opacity: p.opacity || 1 }];
      if (p.strokeColor) rect.strokes = [{ type: "SOLID", color: p.strokeColor }];
      if (p.strokeWeight) rect.strokeWeight = p.strokeWeight;
      if (p.name) rect.name = p.name;
      figma.currentPage.appendChild(rect);
      return { id: rect.id, name: rect.name, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  },

  createFrame: function(p) {
    return figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
      var frame = figma.createFrame();
      frame.x = typeof p.x !== "undefined" ? p.x : 0;
      frame.y = typeof p.y !== "undefined" ? p.y : 0;
      frame.resize(typeof p.width !== "undefined" ? p.width : 400, typeof p.height !== "undefined" ? p.height : 300);
      if (p.fillColor) frame.fills = [{ type: "SOLID", color: p.fillColor, opacity: p.opacity || 0 }];
      if (p.name) frame.name = p.name;
      figma.currentPage.appendChild(frame);
      return { id: frame.id, name: frame.name };
    });
  },

  createEllipse: function(p) {
    return figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
      var ell = figma.createEllipse();
      ell.x = typeof p.x !== "undefined" ? p.x : 0;
      ell.y = typeof p.y !== "undefined" ? p.y : 0;
      ell.resize(typeof p.width !== "undefined" ? p.width : 100, typeof p.height !== "undefined" ? p.height : 100);
      if (p.fillColor) ell.fills = [{ type: "SOLID", color: p.fillColor }];
      if (p.name) ell.name = p.name;
      figma.currentPage.appendChild(ell);
      return { id: ell.id, name: ell.name };
    });
  },

  createText: function(p) {
    return figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
      var text = figma.createText();
      text.x = typeof p.x !== "undefined" ? p.x : 0;
      text.y = typeof p.y !== "undefined" ? p.y : 0;
      if (p.name) text.name = p.name;
      if (typeof p.characters !== "undefined") text.characters = p.characters;
      if (p.fontSize) text.fontSize = p.fontSize;
      if (p.fillColor) text.fills = [{ type: "SOLID", color: p.fillColor }];
      if (p.textAlignHorizontal) text.textAlignHorizontal = p.textAlignHorizontal;
      if (p.fontName && p.fontName.family) {
        text.fontName = p.fontName;
      }
      figma.currentPage.appendChild(text);
      return { id: text.id, name: text.name };
    });
  },

  selectNode: function(p) {
    if (p.id) {
      var node = figma.getNodeById(p.id);
      if (node) {
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
        return { found: true };
      }
    }
    return { found: false };
  },

  updateNode: function(p) {
    var node = figma.getNodeById(p.id);
    if (!node) throw new Error("Node not found: " + p.id);
    if (typeof p.x !== "undefined" && hasPosition(node)) node.x = p.x;
    if (typeof p.y !== "undefined" && hasPosition(node)) node.y = p.y;
    if (p.resize && hasResize(node)) node.resize(p.resize.width, p.resize.height);
    if (p.fillColor && hasFills(node)) node.fills = [{ type: "SOLID", color: p.fillColor }];
    if (p.name) node.name = p.name;
    return { id: node.id, name: node.name, updated: true };
  },

  deleteNode: function(p) {
    if (p.id) {
      var node = figma.getNodeById(p.id);
      if (node) { node.remove(); return { deleted: true, id: p.id }; }
    }
    return { deleted: false };
  },

  getSelection: function() {
    return figma.currentPage.selection.map(function(n) {
      return {
        id: n.id, name: n.name, type: n.type,
        x: "x" in n ? n.x : undefined,
        y: "y" in n ? n.y : undefined,
        width: "width" in n ? n.width : undefined,
        height: "height" in n ? n.height : undefined
      };
    });
  },

  getPageInfo: function() {
    return {
      name: figma.currentPage.name,
      id: figma.currentPage.id,
      childCount: figma.currentPage.children.length
    };
  },

  setFillColor: function(p) {
    var node = figma.getNodeById(p.id);
    if (!node || !hasFills(node)) throw new Error("Node not found or no fills: " + p.id);
    node.fills = [{ type: "SOLID", color: p.color, opacity: p.opacity || 1 }];
    return { id: node.id, fillSet: true };
  },

  groupSelection: function() {
    var sel = figma.currentPage.selection;
    if (sel.length < 2) throw new Error("Select at least 2 nodes");
    var group = figma.group(sel, figma.currentPage);
    return { id: group.id, name: group.name };
  }
};

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    postUI("status", { connected: false });
    scheduleReconnect();
    return;
  }
  ws.onopen = function() {
    postUI("status", { connected: true });
    postUI("log", { text: "Connected to Craw connector", level: "" });
  };
  ws.onmessage = function(event) {
    var msg;
    try { msg = JSON.parse(event.data); } catch(e) { return; }
    var id = msg.id, command = msg.command, payload = msg.payload || {};
    postUI("log", { text: "Exec: " + command, level: "cmd" });
    var handler = commands[command];
    if (!handler) {
      ws.send(JSON.stringify({ id: id, status: "error", error: "Unknown command: " + command }));
      postUI("log", { text: "Error: Unknown command " + command, level: "err" });
      return;
    }
    try {
      var result = handler(payload);
      // Handle both sync and thenable returns
      if (result && typeof result.then === "function") {
        result.then(function(res) {
          ws.send(JSON.stringify({ id: id, status: "ok", result: res }));
          postUI("log", { text: "Done: " + command, level: "done" });
        }, function(err) {
          ws.send(JSON.stringify({ id: id, status: "error", error: err.message || String(err) }));
          postUI("log", { text: "Error: " + command + " — " + (err.message || String(err)), level: "err" });
        });
      } else {
        ws.send(JSON.stringify({ id: id, status: "ok", result: result }));
        postUI("log", { text: "Done: " + command, level: "done" });
      }
    } catch(err) {
      ws.send(JSON.stringify({ id: id, status: "error", error: err.message || String(err) }));
      postUI("log", { text: "Error: " + command + " — " + (err.message || String(err)), level: "err" });
    }
  };
  ws.onclose = function() {
    postUI("status", { connected: false });
    postUI("log", { text: "Disconnected", level: "err" });
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = function() {
    postUI("status", { connected: false });
    if (ws) ws.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(function() {
    reconnectTimer = null;
    connect();
  }, 3000);
}

figma.showUI(__html__, { width: 280, height: 400 });
figma.skipInvisibleInstanceChildren = true;

figma.ui.onmessage = function(msg) {
  if (msg.type === "ready") {
    connect();
  }
};
