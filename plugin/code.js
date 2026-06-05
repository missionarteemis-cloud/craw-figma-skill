/// Craw Figma Connector — Plugin Code (ES5)
/// Connects to the local WebSocket bridge, receives commands, executes Figma API

var ws = null;
var WS_URL = "ws://localhost:9199";
var reconnectTimer = null;

function postUI(type, data) {
  var msg = {};
  msg.type = type;
  if (data) {
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      msg[keys[i]] = data[keys[i]];
    }
  }
  figma.ui.postMessage(msg);
}

function hasFills(node) { return "fills" in node; }
function hasResize(node) { return "resize" in node; }
function hasPosition(node) { return "x" in node && "y" in node; }

var commands = {};

commands.createRectangle = function(p) {
  return figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
    var rect = figma.createRectangle();
    rect.x = typeof p.x !== "undefined" ? p.x : 0;
    rect.y = typeof p.y !== "undefined" ? p.y : 0;
    rect.resize(typeof p.width !== "undefined" ? p.width : 200, typeof p.height !== "undefined" ? p.height : 100);
    if (p.cornerRadius) rect.cornerRadius = p.cornerRadius;
    if (p.fills) rect.fills = p.fills;
    if (p.strokes) rect.strokes = p.strokes;
    if (p.strokeWeight) rect.strokeWeight = p.strokeWeight;
    if (p.effects) rect.effects = p.effects;
    if (p.name) rect.name = p.name;
    figma.currentPage.appendChild(rect);
    var result = {};
    result.id = rect.id; result.name = rect.name;
    result.x = rect.x; result.y = rect.y;
    result.width = rect.width; result.height = rect.height;
    return result;
  });
};

commands.createFrame = function(p) {
  return figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
    var frame = figma.createFrame();
    frame.x = typeof p.x !== "undefined" ? p.x : 0;
    frame.y = typeof p.y !== "undefined" ? p.y : 0;
    frame.resize(typeof p.width !== "undefined" ? p.width : 400, typeof p.height !== "undefined" ? p.height : 300);
    if (p.fills) frame.fills = p.fills;
    if (p.effects) frame.effects = p.effects;
    if (p.name) frame.name = p.name;
    figma.currentPage.appendChild(frame);
    var result = {};
    result.id = frame.id; result.name = frame.name;
    return result;
  });
};

commands.createEllipse = function(p) {
  return figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
    var ell = figma.createEllipse();
    ell.x = typeof p.x !== "undefined" ? p.x : 0;
    ell.y = typeof p.y !== "undefined" ? p.y : 0;
    ell.resize(typeof p.width !== "undefined" ? p.width : 100, typeof p.height !== "undefined" ? p.height : 100);
    if (p.fills) ell.fills = p.fills;
    if (p.effects) ell.effects = p.effects;
    if (p.name) ell.name = p.name;
    figma.currentPage.appendChild(ell);
    var result = {};
    result.id = ell.id; result.name = ell.name;
    return result;
  });
};

commands.createText = function(p) {
  return figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
    var text = figma.createText();
    text.x = typeof p.x !== "undefined" ? p.x : 0;
    text.y = typeof p.y !== "undefined" ? p.y : 0;
    if (p.name) text.name = p.name;
    if (typeof p.characters !== "undefined") text.characters = p.characters;
    if (p.fontSize) text.fontSize = p.fontSize;
    if (p.fills) text.fills = p.fills;
    if (p.textAlignHorizontal) text.textAlignHorizontal = p.textAlignHorizontal;
    if (p.fontName && p.fontName.family) text.fontName = p.fontName;
    figma.currentPage.appendChild(text);
    var result = {};
    result.id = text.id; result.name = text.name;
    return result;
  });
};

commands.selectNode = function(p) {
  if (p.id) {
    var node = figma.getNodeById(p.id);
    if (node) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      var result = {};
      result.found = true;
      return result;
    }
  }
  var result = {};
  result.found = false;
  return result;
};

commands.updateNode = function(p) {
  var node = figma.getNodeById(p.id);
  if (!node) throw new Error("Node not found: " + p.id);
  if (typeof p.x !== "undefined" && hasPosition(node)) node.x = p.x;
  if (typeof p.y !== "undefined" && hasPosition(node)) node.y = p.y;
  if (p.resize && hasResize(node)) node.resize(p.resize.width, p.resize.height);
  if (p.fills && hasFills(node)) node.fills = p.fills;
  if (p.effects) node.effects = p.effects;
  if (p.name) node.name = p.name;
  var result = {};
  result.id = node.id; result.name = node.name; result.updated = true;
  return result;
};

commands.deleteNode = function(p) {
  var result = {};
  if (p.id) {
    var node = figma.getNodeById(p.id);
    if (node) {
      node.remove();
      result.deleted = true;
      result.id = p.id;
      return result;
    }
  }
  result.deleted = false;
  return result;
};

commands.getSelection = function() {
  return figma.currentPage.selection.map(function(n) {
    var r = {};
    r.id = n.id; r.name = n.name; r.type = n.type; r.x = n.x; r.y = n.y; r.width = n.width; r.height = n.height;
    return r;
  });
};

commands.getPageInfo = function() {
  var result = {};
  result.name = figma.currentPage.name;
  result.id = figma.currentPage.id;
  result.childCount = figma.currentPage.children.length;
  return result;
};

commands.setFillColor = function(p) {
  var node = figma.getNodeById(p.id);
  if (!node || !hasFills(node)) throw new Error("Node not found or no fills");
  node.fills = [{ type: "SOLID", color: p.color, opacity: p.opacity || 1 }];
  var result = {};
  result.id = node.id; result.fillSet = true;
  return result;
};

commands.groupSelection = function() {
  var sel = figma.currentPage.selection;
  if (sel.length < 2) throw new Error("Select at least 2 nodes");
  var group = figma.group(sel, figma.currentPage);
  var result = {};
  result.id = group.id; result.name = group.name;
  return result;
};

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(WS_URL);
  } catch(e) {
    scheduleReconnect();
    return;
  }
  ws.onopen = function() {
    var log = {};
    log.text = "Connected to Craw";
    log.level = "";
    postUI("log", log);
    postUI("status", { connected: true });
    startPeriodicUpdates();
  };
  ws.onmessage = function(event) {
    var msg;
    try {
      msg = JSON.parse(event.data);
    } catch(e) {
      return;
    }
    var command = msg.command;
    var payload = msg.payload || {};
    var logMsg = {};
    logMsg.text = "Exec: " + command;
    logMsg.level = "cmd";
    postUI("log", logMsg);
    var handler = commands[command];
    if (!handler) {
      var errMsg = {};
      errMsg.text = "Unknown: " + command;
      errMsg.level = "err";
      postUI("log", errMsg);
      return;
    }
    try {
      var result = handler(payload);
      if (result && typeof result.then === "function") {
        result.then(
          function(res) {
            var doneMsg = {};
            doneMsg.text = "Done: " + (res.name || res.id || JSON.stringify(res).slice(0, 80));
            doneMsg.level = "done";
            postUI("log", doneMsg);
          },
          function(err) {
            var errMsg = {};
            errMsg.text = "Error: " + (err.message || String(err));
            errMsg.level = "err";
            postUI("log", errMsg);
          }
        );
      } else {
        var doneMsg = {};
        doneMsg.text = "Done: " + JSON.stringify(result).slice(0, 80);
        doneMsg.level = "done";
        postUI("log", doneMsg);
      }
    } catch(err) {
      var errMsg = {};
      errMsg.text = "Error: " + (err.message || String(err));
      errMsg.level = "err";
      postUI("log", errMsg);
    }
  };
  ws.onclose = function() {
    postUI("status", { connected: false });
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = function() {
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

function startPeriodicUpdates() {
  setInterval(function() {
    try {
      var pageMsg = {};
      pageMsg.name = figma.currentPage.name;
      pageMsg.id = figma.currentPage.id;
      pageMsg.childCount = figma.currentPage.children.length;
      postUI("page-info", pageMsg);
      var selArray = figma.currentPage.selection.map(function(n) {
        var r = {};
        r.id = n.id;
        r.name = n.name;
        r.type = n.type;
        r.x = n.x;
        r.y = n.y;
        r.width = n.width;
        r.height = n.height;
        return r;
      });
      var selMsg = {};
      selMsg.nodes = selArray;
      postUI("selection-update", selMsg);
    } catch(e) {}
  }, 1000);
}

figma.showUI(__html__, { width: 320, height: 500 });
figma.skipInvisibleInstanceChildren = true;

figma.ui.onmessage = function(msg) {
  if (msg.type === "ready") {
    var logMsg = {};
    logMsg.text = "Plugin loaded";
    logMsg.level = "";
    postUI("log", logMsg);
    connect();
  }
};
