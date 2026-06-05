#!/usr/bin/env node
/**
 * Craw Figma Design Engine — Orchestrator
 * 
 * Single entry point for design commands.
 * Accepts a prompt, plans the Figma operations, executes them,
 * and returns the result.
 * 
 * Usage:
 *   node design_orchestrator.js "disegnami un cuoricino rosso con effetto vetro"
 *   node design_orchestrator.js "stella dorata a 5 punte, 200px"
 *   node design_orchestrator.js --shape heart --size 200 --color red --effects glassmorphism
 * 
 * Architecture:
 *   Design Engine (coordinate)  →  Orchestrator (sequencing)  →  HTTP to Connector  →  Figma
 */

var http = require('http');

var CONNECTOR_URL = process.env.FIGMA_CONNECTOR || 'http://localhost:9199';

// ── PROPORTIONS ──
var PROPORTIONS = {
  heart: { aspectRatio: 0.85, lobeRatio: 0.55, tipRatio: 0.40 },
  star: { defaultInnerRadius: 0.38 },
};

// ── COLORS ──
var COLORS = {
  red:        { r: 0.90, g: 0.10, b: 0.10 },
  darkRed:    { r: 0.70, g: 0.05, b: 0.05 },
  lightRed:   { r: 1.00, g: 0.30, b: 0.30 },
  gold:       { r: 0.95, g: 0.75, b: 0.15 },
  blue:       { r: 0.20, g: 0.40, b: 0.95 },
  darkBlue:   { r: 0.10, g: 0.15, b: 0.40 },
  teal:       { r: 0.10, g: 0.75, b: 0.70 },
  green:      { r: 0.20, g: 0.70, b: 0.20 },
  purple:     { r: 0.55, g: 0.20, b: 0.80 },
  pink:       { r: 0.95, g: 0.40, b: 0.65 },
  orange:     { r: 0.95, g: 0.55, b: 0.10 },
  white:      { r: 1.00, g: 1.00, b: 1.00 },
  black:      { r: 0.00, g: 0.00, b: 0.00 }
};

function resolveColor(c) {
  if (typeof c === 'string' && COLORS[c.toLowerCase()]) return COLORS[c.toLowerCase()];
  if (typeof c === 'object' && c.r !== undefined) return c;
  if (typeof c === 'string' && c.startsWith('#')) {
    var hex = c.replace('#', '');
    return { r: parseInt(hex.substring(0,2),16)/255, g: parseInt(hex.substring(2,4),16)/255, b: parseInt(hex.substring(4,6),16)/255 };
  }
  return COLORS.red;
}

function solidFill(color, opacity) {
  return [{ type: "SOLID", color: resolveColor(color), opacity: opacity || 1 }];
}

// ── HTTP CLIENT TO CONNECTOR ──
function sendCommand(command, payload) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify({ command: command, payload: payload, id: "or_" + Date.now() });
    var parsed = CONNECTOR_URL.replace('http://', '').split(':');
    var host = parsed[0];
    var port = parseInt(parsed[1]);

    var req = http.request({
      hostname: host, port: port, path: '/send-command',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(body)); }
        catch(e) { resolve({ status: 'ok', raw: body }); }
      });
    });
    req.on('error', function(e) { reject(e); });
    req.write(data);
    req.end();
  });
}

function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ── SHAPE BUILDERS ──

var builders = {};

builders.heart = function(params) {
  var size = params.size || 200;
  var x = params.x || 300;
  var y = params.y || 300;
  var color = resolveColor(params.color || 'red');

  var w = size;
  var h = size / PROPORTIONS.heart.aspectRatio;
  var lobeR = w * PROPORTIONS.heart.lobeRatio / 2;
  var lobeD = lobeR * 2;
  var centerX = x + w / 2;
  var tipW = lobeD * 0.65;
  var tipH = h - lobeR;
  var fills = solidFill(color, 1);

  return [
    {
      command: "createEllipse",
      payload: { name: "LobeL", x: centerX - lobeR * 1.2, y: y + lobeR * 0.2, width: lobeD, height: lobeD, fills: fills, strokes: [] }
    },
    {
      command: "createEllipse",
      payload: { name: "LobeR", x: centerX - lobeR * 0.2, y: y + lobeR * 0.2, width: lobeD, height: lobeD, fills: fills, strokes: [] }
    },
    {
      command: "createPolygon",
      payload: { name: "Tip", x: centerX - tipW / 2, y: y + lobeR * 0.7, width: tipW, height: tipH, pointCount: 3, fills: fills, strokes: [] }
    }
  ];
};

builders.star = function(params) {
  var size = params.size || 150;
  var x = params.x || 300;
  var y = params.y || 300;
  var points = params.points || 5;
  var color = resolveColor(params.color || 'gold');
  var fills = solidFill(color, 1);

  return [{
    command: "createStar",
    payload: { name: "Star", x: x, y: y, width: size, height: size, pointCount: points, innerRadius: PROPORTIONS.star.defaultInnerRadius, fills: fills, strokes: [] }
  }];
};

// ── ORCHESTRATOR ──
async function orchestrate(shapeName, params) {
  var builder = builders[shapeName];
  if (!builder) throw new Error("Unknown shape: " + shapeName);

  console.log("🏗️  Planning " + shapeName + "...");
  var cmds = builder(params);

  var shapeIds = [];
  var errors = [];

  // Step 1: Execute all creation commands
  for (var i = 0; i < cmds.length; i++) {
    var c = cmds[i];
    console.log("  → " + c.command + " (" + (c.payload.name || 'unnamed') + ")");
    try {
      var result = await sendCommand(c.command, c.payload);
      if (result.status === 'ok' && result.data && result.data.id) {
        shapeIds.push(result.data.id);
        console.log("    ✓ id=" + result.data.id);
      } else if (result.status === 'pending') {
        // Pending means it's queued — wait and check
        console.log("    ⏳ queued, waiting...");
        await wait(3000);
        shapeIds.push(result.id || 'pending');
      } else {
        errors.push(c.command + ": " + JSON.stringify(result));
        console.log("    ✗ " + JSON.stringify(result));
      }
    } catch(e) {
      errors.push(c.command + ": " + e.message);
      console.log("    ✗ " + e.message);
    }
  }

  if (errors.length > 0 && shapeIds.length < 2) {
    console.log("\n❌ Too many errors, aborting.");
    return { status: 'error', errors: errors };
  }

  // Step 2: If multiple shapes, boolean union
  if (shapeIds.length >= 2) {
    console.log("\n🔗 Union " + shapeIds.length + " shapes...");
    try {
      // Select first
      await sendCommand("selectNode", { id: shapeIds[0] });
      await wait(500);
      // Select rest
      for (var k = 1; k < shapeIds.length; k++) {
        await sendCommand("selectNode", { id: shapeIds[k], addToSelection: true });
        await wait(300);
      }
      await wait(500);
      // Group
      console.log("  → groupSelection");
      var grp = await sendCommand("groupSelection", {});
      if (grp.status === 'ok' && grp.data && grp.data.id) {
        var grpId = grp.data.id;
        await wait(500);
        // Boolean union
        console.log("  → booleanOperation union");
        var bool = await sendCommand("booleanOperation", { id: grpId, operation: "union", name: params.capitalizeName || (shapeName.charAt(0).toUpperCase() + shapeName.slice(1)) });
        if (bool.status === 'ok' && bool.data && bool.data.id) {
          var finalId = bool.data.id;
          console.log("  ✓ Final shape id=" + finalId);
          // Step 3: Apply effects
          var effectCmds = [];
          var eColor = resolveColor(params.color || 'red');

          // Gradient
          effectCmds.push(sendCommand("setGradient", {
            id: finalId,
            gradientType: "LINEAR",
            stops: [
              { position: 0, color: { r: Math.min(1, eColor.r + 0.2), g: Math.min(1, eColor.g + 0.2), b: Math.min(1, eColor.b + 0.2), a: 1 } },
              { position: 1, color: { r: eColor.r, g: eColor.g, b: eColor.b, a: 1 } }
            ],
            transform: [[1, 0, 0], [0, 1, 0]]
          }));

          // Shadow
          effectCmds.push(sendCommand("updateNode", {
            id: finalId,
            effects: [{ type: "DROP_SHADOW", blendMode: "NORMAL", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 12, visible: true }]
          }));

          await Promise.all(effectCmds);
          console.log("  ✓ Effects applied");

          console.log("\n✅ Done! Shape created in Figma.");
          return { status: 'ok', id: finalId };
        }
      }
    } catch(e) {
      console.log("  ✗ " + e.message);
      return { status: 'error', error: e.message };
    }
  } else if (shapeIds.length === 1) {
    console.log("\n✅ Single shape created at id=" + shapeIds[0]);
    return { status: 'ok', id: shapeIds[0] };
  }
}

// ── PARSE PROMPT ──
function parsePrompt(text) {
  text = text.toLowerCase();
  var params = {};

  // Shape detection
  if (text.includes('cuor') || text.includes('heart') || text.includes('❤')) {
    params.shape = 'heart';
  } else if (text.includes('stell') || text.includes('star')) {
    params.shape = 'star';
    if (text.match(/(\d+)\s*punt/)) params.points = parseInt(text.match(/(\d+)\s*punt/)[1]);
  } else if (text.includes('bott') || text.includes('button') || text.includes('pulsant')) {
    params.shape = 'button';
  } else {
    params.shape = 'heart'; // default
  }

  // Size
  if (text.match(/(\d+)\s*px/)) params.size = parseInt(text.match(/(\d+)\s*px/)[1]);
  else if (text.match(/(\d+)\s*pixel/)) params.size = parseInt(text.match(/(\d+)\s*pixel/)[1]);
  else if (text.includes('grand')) params.size = 250;
  else if (text.includes('piccol')) params.size = 100;
  else params.size = 200;

  // Color
  var colorNames = Object.keys(COLORS);
  for (var i = 0; i < colorNames.length; i++) {
    if (text.includes(colorNames[i])) { params.color = colorNames[i]; break; }
  }
  if (!params.color) {
    if (text.includes('dor') || text.includes('oro')) params.color = 'gold';
    else if (text.includes('blu') || text.includes('azzurr')) params.color = 'blue';
    else if (text.includes('verd')) params.color = 'green';
    else if (text.includes('viol') || text.includes('lill') || text.includes('porpor')) params.color = 'purple';
    else if (text.includes('ros') || text.includes('rosa')) params.color = 'pink';
    else if (text.includes('aranci')) params.color = 'orange';
    else params.color = 'red';
  }

  // Effects
  if (text.includes('glass') || text.includes('vetr') || text.includes('trasparent')) params.glassmorphism = true;
  if (text.includes('neon') || text.includes('luc')) params.neon = true;
  if (text.includes('ombra') || text.includes('shadow')) params.shadow = true;

  return params;
}

// ── MAIN ──
async function main() {
  var args = process.argv.slice(2);
  var prompt = args.join(' ');
  var params;

  if (args.length === 0) {
    console.log("Usage: node design_orchestrator.js \"draw me a red heart\"");
    console.log("       node design_orchestrator.js --shape heart --size 200 --color red");
    process.exit(0);
  }

  // Handle structured params
  if (args[0] === '--shape' || args[0] === '-s') {
    params = { shape: args[1] || 'heart', size: 200 };
    for (var i = 2; i < args.length; i++) {
      if (args[i] === '--size') params.size = parseInt(args[i+1]);
      if (args[i] === '--color') params.color = args[i+1];
      if (args[i] === '--points') params.points = parseInt(args[i+1]);
    }
  } else {
    params = parsePrompt(prompt);
  }

  console.log("🦀 Craw Figma Design Engine\n");
  console.log("Prompt: " + prompt);
  console.log("Parsed: " + JSON.stringify(params));
  console.log("");

  try {
    var result = await orchestrate(params.shape, params);
    if (result && result.status === 'ok') {
      console.log("\n🔗 Final ID: " + result.id);
    } else {
      console.log("\n❌ Failed: " + JSON.stringify(result));
    }
  } catch(e) {
    console.error("\n💥 Orchestration error:", e.message);
  }
}

main();
