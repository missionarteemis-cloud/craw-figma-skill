#!/usr/bin/env node
/**
 * SVG Path to Figma Vector converter
 * 
 * Takes an SVG path string, analyzes the path commands,
 * and sends a createVector command to Figma via the connector.
 * 
 * Usage:
 *   node svg_to_figma.js "M50,15 C25,0 0,25 25,55 L50,80 L75,55 C100,25 75,0 50,15Z"
 */

var http = require('http');
var CONNECTOR = process.env.FIGMA_CONNECTOR || 'http://localhost:9199';

// Simple SVG path to Figma vector converter
// Handles: M, L, C, Q, Z
function parseSVGPath(pathStr) {
  // Tokenize: commands and numbers
  var tokens = pathStr.match(/[MLQCZmlqcz]|[-+]?\d*\.?\d+/g);
  var vertices = [];
  var segments = [];
  var currentX = 0, currentY = 0;
  var startX = 0, startY = 0;
  var cmd = '';
  var i = 0;

  function next() { var v = parseFloat(tokens[i]); i++; return v; }

  while (i < tokens.length) {
    var t = tokens[i];
    if (t.match(/[MLQCZmlqcz]/)) {
      cmd = t;
      i++;
      continue;
    }

    if (cmd === 'M' || cmd === 'm') {
      var x = cmd === 'm' ? currentX + next() : next();
      var y = cmd === 'm' ? currentY + next() : next();
      startX = x; startY = y;
      currentX = x; currentY = y;
      // First M creates start vertex but no segment
      if (vertices.length === 0) {
        vertices.push({ x: x, y: y });
      }
    }
    else if (cmd === 'L' || cmd === 'l') {
      var x = cmd === 'l' ? currentX + next() : next();
      var y = cmd === 'l' ? currentY + next() : next();
      var prevIdx = vertices.length - 1;
      vertices.push({ x: x, y: y });
      segments.push({ start: prevIdx, end: vertices.length - 1 });
      currentX = x; currentY = y;
    }
    else if (cmd === 'C' || cmd === 'c') {
      var x1 = cmd === 'c' ? currentX + next() : next();
      var y1 = cmd === 'c' ? currentY + next() : next();
      var x2 = cmd === 'c' ? currentX + next() : next();
      var y2 = cmd === 'c' ? currentY + next() : next();
      var x = cmd === 'c' ? currentX + next() : next();
      var y = cmd === 'c' ? currentY + next() : next();
      var prevIdx = vertices.length - 1;
      vertices.push({ x: x, y: y });
      segments.push({
        start: prevIdx,
        end: vertices.length - 1,
        tangentStart: { x: x1 - currentX, y: y1 - currentY },
        tangentEnd: { x: x2 - x, y: y2 - y }
      });
      currentX = x; currentY = y;
    }
    else if (cmd === 'Q' || cmd === 'q') {
      var x1 = cmd === 'q' ? currentX + next() : next();
      var y1 = cmd === 'q' ? currentY + next() : next();
      var x = cmd === 'q' ? currentX + next() : next();
      var y = cmd === 'q' ? currentY + next() : next();
      var prevIdx = vertices.length - 1;
      vertices.push({ x: x, y: y });
      segments.push({
        start: prevIdx,
        end: vertices.length - 1,
        tangentStart: { x: x1 - currentX, y: y1 - currentY },
        tangentEnd: { x: x1 - x, y: y1 - y }
      });
      currentX = x; currentY = y;
    }
    else if (cmd === 'Z' || cmd === 'z') {
      // Close path: add segment back to start
      if (vertices.length > 0 && (currentX !== startX || currentY !== startY)) {
        segments.push({ start: vertices.length - 1, end: 0 });
      }
    }
  }

  return { vertices: vertices, segments: segments };
}

function sendCommand(command, payload) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify({ command: command, payload: payload, id: 'svg_' + Date.now() });
    var parsed = CONNECTOR.replace('http://', '').split(':');
    var req = http.request({
      hostname: parsed[0], port: parseInt(parsed[1]), path: '/send-command',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(body)); } catch(e) { resolve({ status: 'ok', raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  var args = process.argv.slice(2);
  var pathStr = args.join(' ');

  if (!pathStr || pathStr === '--help') {
    console.log("Usage: node svg_to_figma.js \"M10,20 C...Z\"");
    console.log("");
    console.log("Pre-built shapes:");
    console.log("  --heart      Standard heart path");
    console.log("  --star5      5-point star path");
    process.exit(0);
  }

  // Pre-built shapes
  if (pathStr === '--heart') {
    // Refined heart SVG with better tangent matching
    // Two cubic beziers per lobe for smoother curves
    pathStr = "M 50,18 C 35,0 0,15 0,42 C 0,65 25,82 50,98 C 75,82 100,65 100,42 C 100,15 65,0 50,18 Z";
  }
  if (pathStr === '--star5') {
    pathStr = "M 50,0 L 61,35 L 100,35 L 68,57 L 79,95 L 50,73 L 21,95 L 32,57 L 0,35 L 39,35 Z";
  }

  console.log("🦀 SVG → Figma Converter\n");
  console.log("Path: " + pathStr.substring(0, 80) + (pathStr.length > 80 ? "..." : ""));

  var shape = parseSVGPath(pathStr);
  console.log("  Vertices: " + shape.vertices.length);
  console.log("  Segments: " + shape.segments.length);

  // Scale and center
  // Find bounding box
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < shape.vertices.length; i++) {
    var v = shape.vertices[i];
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  var bw = maxX - minX || 100;
  var bh = maxY - minY || 100;
  var scale = 3; // scale factor
  var offsetX = 300 - (bw * scale / 2);
  var offsetY = 300 - (bh * scale / 2);

  for (var j = 0; j < shape.vertices.length; j++) {
    shape.vertices[j].x = (shape.vertices[j].x - minX) * scale + offsetX;
    shape.vertices[j].y = (shape.vertices[j].y - minY) * scale + offsetY;
  }

  console.log("  BBox: " + Math.round(bw*scale) + "x" + Math.round(bh*scale) + " at (" + Math.round(offsetX) + "," + Math.round(offsetY) + ")");

  // Send to Figma using native SVG import (much more accurate)
  console.log("\nSending SVG to Figma...");
  var result = await sendCommand("importSvg", {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(bw*scale) + '" height="' + Math.round(bh*scale) + '" viewBox="0 0 ' + Math.round(bw) + ' ' + Math.round(bh) + '"><path d="' + pathStr + '" fill="red"/></svg>'
  });

  if (result && result.status === 'ok' && result.data && result.data.id) {
    console.log("\n✅ Created at id=" + result.data.id);
    // Apply gradient + shadow
    await sendCommand("setGradient", {
      id: result.data.id,
      gradientType: "LINEAR",
      stops: [{ position: 0, color: { r: 1, g: 0.3, b: 0.3, a: 1 } }, { position: 1, color: { r: 0.85, g: 0, b: 0, a: 1 } }],
      transform: [[1, 0, 0], [0, 1, 0]]
    });
    await sendCommand("updateNode", {
      id: result.data.id,
      effects: [{ type: "DROP_SHADOW", blendMode: "NORMAL", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 12, visible: true }]
    });
    console.log("  ✓ Gradient + shadow applied");
  } else {
    console.log("\n❌ Error:", JSON.stringify(result));
  }
}

main().catch(console.error);
