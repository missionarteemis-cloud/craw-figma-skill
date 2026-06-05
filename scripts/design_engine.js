#!/usr/bin/env node
/**
 * Craw Figma Design Engine
 * 
 * Layer between user intent and Figma API commands.
 * Translates natural design descriptions into precise,
 * proportion-aware Figma commands.
 *
 * Usage:
 *   node design_engine.js --command heart --size 200 --color red --effects glassmorphism
 *   node design_engine.js --command star --points 5 --size 150 --color gold
 *
 * Features:
 * - Proportion-aware geometry (golden ratio, aesthetic defaults)
 * - Multi-step workflows (create shapes → boolean operations → style)
 * - References NotebookLM for design knowledge when available
 * - Outputs sequential figma_send.js commands
 */

// ── DEFAULT PROPORTIONS / DESIGN CONSTANTS ──
var PROPORTIONS = {
  // Heart: width = height * 0.85, lobes are circles ~65% of height
  heart: { aspectRatio: 0.85, lobeRatio: 0.55, tipRatio: 0.40 },
  // Star: innerRadius default 0.4 for sharp stars
  star: { defaultInnerRadius: 0.4 },
  // Button: height ~1/3 of width for pill shapes
  pill: { heightRatio: 0.33 },
  // Card: standard 16:9 or 4:3
  card: { aspectRatio: 16/9 }
};

// ── COLOR TO RGB ──
var COLORS = {
  // Named colors to Figma RGB (0-1 range)
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
  black:      { r: 0.00, g: 0.00, b: 0.00 },
  gray:       { r: 0.50, g: 0.50, b: 0.50 },
  darkGray:   { r: 0.20, g: 0.20, b: 0.20 },
  lightGray:  { r: 0.80, g: 0.80, b: 0.80 }
};

// ── EFFECT PRESETS ──
var EFFECTS = {
  glassmorphism: function(baseColor, opacity) {
    opacity = opacity || 0.3;
    return {
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1, a: opacity } },
      ],
      effects: [
        { type: "BACKGROUND_BLUR", radius: 20, visible: true }
      ],
      strokes: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 0.2 } }
      ],
      strokeWeight: 1
    };
  },
  softShadow: function(depth) {
    depth = depth || 1;
    var offsetY = depth * 4;
    var radius = depth * 8;
    return {
      effects: [
        { type: "DROP_SHADOW", blendMode: "NORMAL", color: { r: 0, g: 0, b: 0, a: depth * 0.1 }, offset: { x: 0, y: offsetY }, radius: radius, visible: true }
      ]
    };
  },
  neon: function(color) {
    color = color || { r: 0.2, g: 0.4, b: 0.95 };
    return {
      effects: [
        { type: "DROP_SHADOW", blendMode: "NORMAL", color: { r: color.r, g: color.g, b: color.b, a: 0.6 }, offset: { x: 0, y: 0 }, radius: 20, visible: true },
        { type: "DROP_SHADOW", blendMode: "NORMAL", color: { r: color.r, g: color.g, b: color.b, a: 0.4 }, offset: { x: 0, y: 0 }, radius: 40, visible: true }
      ],
      fills: [{ type: "SOLID", color: color, opacity: 1 }]
    };
  }
};

// ── HELPERS ──
function resolveColor(c) {
  if (typeof c === 'string' && COLORS[c.toLowerCase()]) return COLORS[c.toLowerCase()];
  if (typeof c === 'object' && c.r !== undefined) return c;
  // Parse hex
  if (typeof c === 'string' && c.startsWith('#')) {
    var hex = c.replace('#', '');
    return { r: parseInt(hex.substring(0,2),16)/255, g: parseInt(hex.substring(2,4),16)/255, b: parseInt(hex.substring(4,6),16)/255 };
  }
  return COLORS.red; // fallback
}

function solidFill(color, opacity) {
  return [{ type: "SOLID", color: resolveColor(color), opacity: opacity || 1 }];
}

// ── SHAPE BUILDERS ──

var builders = {};

builders.heart = function(params) {
  var size = params.size || 200;
  var x = params.x || 300;
  var y = params.y || 300;
  var color = resolveColor(params.color || 'red');
  var effects = params.effects || 'softShadow';

  // Proportion calculation
  var w = size;
  var h = size / PROPORTIONS.heart.aspectRatio;  // ~235 for 200px width
  var lobeR = w * PROPORTIONS.heart.lobeRatio / 2;  // radius of each lobe circle
  var lobeD = lobeR * 2;
  var lobeY = y;
  var centerX = x + w / 2;

  // Left lobe circle center
  var lx = centerX - lobeR * 0.7;
  var ly = y + lobeR * 0.4;
  var rx = centerX + lobeR * 0.7 - lobeD;
  var ry = y + lobeR * 0.4;

  // Triangle tip at bottom
  var tipW = lobeD * 0.65;
  var tipH = h - lobeR;
  var tx = centerX - tipW / 2;
  var ty = y + lobeR * 0.8;

  var fills = solidFill(color, 1);
  var strokes = [];

  // Build commands sequence
  var cmds = [];

  // 1. Left lobe
  cmds.push({
    command: "createEllipse",
    payload: {
      name: "Heart Lobe L", x: lx, y: ly, width: lobeD, height: lobeD,
      fills: fills, strokes: strokes
    }
  });

  // 2. Right lobe
  cmds.push({
    command: "createEllipse",
    payload: {
      name: "Heart Lobe R", x: rx, y: ry, width: lobeD, height: lobeD,
      fills: fills, strokes: strokes
    }
  });

  // 3. Triangle tip
  cmds.push({
    command: "createPolygon",
    payload: {
      name: "Heart Tip", x: tx, y: ty, width: tipW, height: tipH,
      pointCount: 3,
      fills: fills, strokes: strokes
    }
  });

  // Effects will be applied after boolean union
  cmds._afterBoolean = function(nodeId) {
    var after = [];
    // Apply shadow
    after.push({
      command: "updateNode",
      payload: {
        id: nodeId,
        effects: [{ type: "DROP_SHADOW", blendMode: "NORMAL", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 12, visible: true }],
        name: "Heart"
      }
    });
    // Apply gradient
    after.push({
      command: "setGradient",
      payload: {
        id: nodeId,
        gradientType: "LINEAR",
        stops: [
          { position: 0, color: resolveColor(params.lightColor || 'lightRed') },
          { position: 1, color: resolveColor(color) }
        ],
        transform: [[1, 0, 0], [0, 1, 0]]
      }
    });
    return after;
  };

  return cmds;
};

builders.star = function(params) {
  var size = params.size || 150;
  var x = params.x || 300;
  var y = params.y || 300;
  var points = params.points || 5;
  var color = resolveColor(params.color || 'gold');
  var innerRadius = params.innerRadius || PROPORTIONS.star.defaultInnerRadius;

  var w = size;
  var h = size;

  var fills = solidFill(color, 1);

  var cmds = [];
  cmds.push({
    command: "createStar",
    payload: {
      name: "Star",
      x: x, y: y, width: w, height: h,
      pointCount: points,
      innerRadius: innerRadius,
      fills: fills, strokes: []
    }
  });
  return cmds;
};

builders.button = function(params) {
  var label = params.label || "Button";
  var w = params.width || 160;
  var x = params.x || 300;
  var y = params.y || 300;
  var color = resolveColor(params.color || 'blue');
  var radius = params.radius || w * 0.5;

  var cmds = [];

  // Background shape
  cmds.push({
    command: "createRectangle",
    payload: {
      name: "Button BG", x: x, y: y, width: w, height: w * 0.33,
      cornerRadius: radius,
      fills: solidFill(color, 1), strokes: []
    }
  });

  return cmds;
};

// ── COMMAND SEQUENCE EXECUTOR ──
function executeSequence(shapeName, params) {
  var builder = builders[shapeName];
  if (!builder) { console.error("Unknown shape:", shapeName); process.exit(1); }

  var cmds = builder(params);
  var afterBoolean = cmds._afterBoolean;
  delete cmds._afterBoolean;

  var shapeIds = [];
  var shapeIdIndex = -1;

  for (var i = 0; i < cmds.length; i++) {
    var c = cmds[i];
    var payload = JSON.stringify(c.payload).replace(/'/g, "'\\''");
    // We need to track IDs - output each command and capture results
    console.log("STEP " + (i+1) + ": " + c.command);
    console.log("  payload: " + JSON.stringify(c.payload));
  }

  // If we have 3+ shapes, do boolean union
  if (cmds.length >= 2) {
    console.log("---");
    console.log("// After creation, run boolean union:");
    console.log("1. selectNode id=<first>");
    console.log("2. selectNode id=<second> + addToSelection");
    for (var j = 2; j < cmds.length; j++) {
      console.log((j+1) + ". selectNode id=<next> + addToSelection");
    }
    console.log((cmds.length+1) + ". groupSelection");
    console.log((cmds.length+2) + ". booleanOperation operation=union name=\"" + shapeName + "\"");
    console.log("");
    console.log("// Style after union:");
    if (afterBoolean) {
      console.log("// Apply effects to the resulting node");
    }
  }
}

// ── MAIN ──
var args = process.argv.slice(2);
var params = {};

for (var i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    var key = args[i].replace('--', '');
    var val = args[i+1];
    if (val && !val.startsWith('--')) {
      params[key] = val;
      i++;
    } else {
      params[key] = true;
    }
  }
}

var shape = params.command || params._ || 'heart';
if (!builders[shape]) {
  console.error("Unknown shape. Available:", Object.keys(builders).join(', '));
  process.exit(1);
}

// Convert numeric params
if (params.size) params.size = parseFloat(params.size);
if (params.x) params.x = parseFloat(params.x);
if (params.y) params.y = parseFloat(params.y);
if (params.points) params.points = parseInt(params.points);

console.log("=== Craw Design Engine ===");
console.log("Shape: " + shape);
console.log("Params: " + JSON.stringify(params));
console.log("---");
executeSequence(shape, params);
console.log("=== End ===");
