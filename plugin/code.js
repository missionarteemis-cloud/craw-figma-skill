/// Craw Figma Connector — Plugin Code (ES5)
/// Receives commands from UI via postMessage, executes Figma API

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
      if (p.fills) rect.fills = p.fills;
      if (p.strokes) rect.strokes = p.strokes;
      if (p.strokeWeight) rect.strokeWeight = p.strokeWeight;
      if (p.effects) rect.effects = p.effects;
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
      if (p.fills) frame.fills = p.fills;
      if (p.effects) frame.effects = p.effects;
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
      if (p.fills) ell.fills = p.fills;
      if (p.effects) ell.effects = p.effects;
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
      if (p.fills) text.fills = p.fills;
      if (p.textAlignHorizontal) text.textAlignHorizontal = p.textAlignHorizontal;
      if (p.fontName && p.fontName.family) text.fontName = p.fontName;
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
    if (p.fills && hasFills(node)) node.fills = p.fills;
    if (p.effects) node.effects = p.effects;
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
      return { id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, width: n.width, height: n.height };
    });
  },

  getPageInfo: function() {
    return { name: figma.currentPage.name, id: figma.currentPage.id, childCount: figma.currentPage.children.length };
  },

  setFillColor: function(p) {
    var node = figma.getNodeById(p.id);
    if (!node || !hasFills(node)) throw new Error("Node not found or no fills");
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

function executeCommand(cmd) {
  if (!cmd || !cmd.command) {
    postUI("log", { text: "Invalid command", level: "err" });
    return;
  }
  postUI("log", { text: "Exec: " + cmd.command, level: "cmd" });
  var handler = commands[cmd.command];
  if (!handler) {
    postUI("log", { text: "Unknown command: " + cmd.command, level: "err" });
    return;
  }
  try {
    var result = handler(cmd.payload || {});
    if (result && typeof result.then === "function") {
      result.then(
        function(res) { postUI("log", { text: "Done: " + (res.name || res.id || JSON.stringify(res).slice(0, 60)), level: "done" }); },
        function(err) { postUI("log", { text: "Error: " + (err.message || String(err)), level: "err" }); }
      );
    } else {
      postUI("log", { text: "Done: " + JSON.stringify(result).slice(0, 80), level: "done" });
    }
  } catch(err) {
    postUI("log", { text: "Error: " + (err.message || String(err)), level: "err" });
  }
}

// Periodic selection and page info updates
function startPeriodicUpdates() {
  setInterval(function() {
    try {
      var page = figma.currentPage;
      postUI("page-info", { name: page.name, id: page.id, childCount: page.children.length });
      var sel = figma.currentPage.selection.map(function(n) {
        return { id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, width: n.width, height: n.height };
      });
      postUI("selection-update", { nodes: sel });
    } catch(e) {}
  }, 1000);
}

figma.showUI(__html__, { width: 320, height: 500 });
figma.skipInvisibleInstanceChildren = true;

figma.ui.onmessage = function(msg) {
  if (msg.type === "ready") {
    postUI("log", { text: "Plugin loaded", level: "" });
    startPeriodicUpdates();
    return;
  }

  // Execute command received from UI
  if (msg.type === "exec-command") {
    executeCommand(msg.command);
    return;
  }

  // Update page info (from UI)
  if (msg.type === "update-page") {
    var page = figma.currentPage;
    postUI("page-info", { name: page.name, id: page.id, childCount: page.children.length });
    return;
  }
};
