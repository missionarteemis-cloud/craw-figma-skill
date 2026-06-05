/// Craw Figma Connector — Plugin Code (ES5, HTTP polling instead of WebSocket)
/// Polls the local connector at http://localhost:9199 for commands

var pollInterval = null;
var POLL_URL = "http://localhost:9199";

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

// Poll for commands from the HTTP endpoint
function pollForCommands() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", POLL_URL + "/next-command?t=" + Date.now(), true);
  xhr.timeout = 5000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var cmd = JSON.parse(xhr.responseText);
        executeCommand(cmd);
      } catch(e) {
        // empty or invalid response
      }
    }
    // poll again after delay
  };
  xhr.onerror = function() {
    // connection refused — connector not running
  };
  xhr.send();
}

function executeCommand(cmd) {
  if (!cmd || !cmd.command) return;
  postUI("log", { text: "Exec: " + cmd.command, level: "cmd" });
  var handler = commands[cmd.command];
  if (!handler) {
    sendResult(cmd.id, "error", "Unknown command: " + cmd.command);
    return;
  }
  try {
    var result = handler(cmd.payload || {});
    if (result && typeof result.then === "function") {
      result.then(function(res) { sendResult(cmd.id, "ok", res); }, function(err) { sendResult(cmd.id, "error", err.message || String(err)); });
    } else {
      sendResult(cmd.id, "ok", result);
    }
  } catch(err) {
    sendResult(cmd.id, "error", err.message || String(err));
  }
}

function sendResult(id, status, data) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", POLL_URL + "/result", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  var body = JSON.stringify({ id: id, status: status, data: status === "ok" ? data : { error: data } });
  xhr.send(body);
  if (status === "ok") {
    postUI("log", { text: "Done: " + (data && data.name ? data.name : ""), level: "done" });
  } else {
    postUI("log", { text: "Error: " + data, level: "err" });
  }
}

function startPolling() {
  postUI("status", { connected: true });
  postUI("log", { text: "Connected (HTTP polling mode)", level: "" });
  // Poll every 1 second
  pollInterval = setInterval(pollForCommands, 1000);
  pollForCommands();
}

function checkHealth() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", POLL_URL + "/health?t=" + Date.now(), true);
  xhr.timeout = 2000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      if (!pollInterval) startPolling();
    } else {
      postUI("status", { connected: false });
    }
  };
  xhr.onerror = function() {
    postUI("status", { connected: false });
  };
  xhr.send();
}

figma.showUI(__html__, { width: 280, height: 400 });
figma.skipInvisibleInstanceChildren = true;

figma.ui.onmessage = function(msg) {
  if (msg.type === "ready") {
    // Check immediately and then every 3 seconds if not connected
    checkHealth();
    if (!pollInterval) {
      setInterval(function() {
        if (!pollInterval) checkHealth();
      }, 3000);
    }
  }
};
