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
 *   
 * NotebookLM Integration:
 *   Before designing, consults the Craw Design Knowledge Base (NotebookLM)
 *   for proportion advice, color schemes, and style guidelines.
 *   Falls back to hardcoded proportions if NotebookLM is unavailable.
 */

var http = require('http');
var net = require('net');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

var CONNECTOR_URL = process.env.FIGMA_CONNECTOR || 'http://localhost:9199';
var NOTEBOOK_LM_URL = process.env.NOTEBOOKLM_URL || 'https://notebooklm.google.com/notebook/dfdba54c-4089-48e5-865a-1d6f49af29cc';

// ── DESIGN TOKENS ──
// Load base design system + optional project override
var PROJECT_OVERRIDE = process.env.DESIGN_PROJECT || null;

function loadDesignTokens() {
  var tokensPath = path.join(__dirname, '..', 'design-tokens', 'design-tokens.json');
  
  if (!fs.existsSync(tokensPath)) {
    console.log('  ⚠️  Design tokens not found, using defaults.');
    return null;
  }
  
  try {
    var base = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
    
    if (PROJECT_OVERRIDE) {
      var projectFile = path.join(__dirname, '..', 'design-tokens', 'projects', PROJECT_OVERRIDE + '.json');
      if (fs.existsSync(projectFile)) {
        var project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
        delete project[PROJECT_OVERRIDE];
        delete project.$extensions;
        delete project.$description;
        deepMerge(base, project);
        console.log('  🎨 Project tokens loaded: ' + PROJECT_OVERRIDE);
      }
    }
    
    return base;
  } catch(e) {
    console.log('  ⚠️  Token load error: ' + e.message);
    return null;
  }
}

function deepMerge(target, source) {
  for (var key in source) {
    if (!source.hasOwnProperty(key)) continue;
    if (source[key] && typeof source[key] === 'object' && !source[key].$value && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

function tokenValue(tokens, pathStr, fallback) {
  if (!tokens) return fallback;
  var parts = pathStr.split('.');
  var current = tokens;
  for (var i = 0; i < parts.length; i++) {
    if (!current || typeof current !== 'object') return fallback;
    current = current[parts[i]];
  }
  if (current && current.$value !== undefined) return current.$value;
  if (current !== undefined && current !== null) return current;
  return fallback;
}

var TOKENS = loadDesignTokens();

// ── NOTEBOOKLM CLIENT ──
// Sends a question to the NotebookLM MCP server via CLI subprocess.
// NotebookLM MCP runs as a stdio process managed by OpenClaw.
// We use npx to invoke it directly for ad-hoc design consulting.

function askNotebookLM(question) {
  return new Promise(function(resolve) {
    console.log("  🔍 Consulting NotebookLM...");
    
    // Check if notebooklm-mcp is already running
    var proc = exec('ps aux | grep "notebooklm-mcp" | grep -v grep | head -1', function(err, stdout) {
      if (!stdout || stdout.trim() === '') {
        console.log("  ⚠️  NotebookLM not running, skipping knowledge consultation.");
        resolve(null);
        return;
      }
      resolve({ status: 'running' });
    });
  });
}

// ── PROPORTIONS ──
// Loaded from design tokens when available, fallback hardcoded
function getProportions() {
  var heartAR = parseFloat(tokenValue(TOKENS, 'proportions.heart.aspectRatio', '0.85'));
  var heartLR = parseFloat(tokenValue(TOKENS, 'proportions.heart.lobeRatio', '0.55'));
  var heartTR = parseFloat(tokenValue(TOKENS, 'proportions.heart.tipRatio', '0.40'));
  var starIR = parseFloat(tokenValue(TOKENS, 'proportions.star.innerRatio', '0.38'));
  
  return {
    heart: { aspectRatio: heartAR, lobeRatio: heartLR, tipRatio: heartTR },
    star: { defaultInnerRadius: starIR },
  };
}

function getToken(key, fallback) {
  return tokenValue(TOKENS, key, fallback);
}

// ── COLORS ──
// Built-in palette, extensible via design token overrides
var COLORS = {
  red:        { r: 0.90, g: 0.10, b: 0.10, hex: '#E61A1A' },
  darkRed:    { r: 0.70, g: 0.05, b: 0.05, hex: '#B30D0D' },
  lightRed:   { r: 1.00, g: 0.30, b: 0.30, hex: '#FF4D4D' },
  gold:       { r: 0.95, g: 0.75, b: 0.15, hex: '#F2BF26' },
  blue:       { r: 0.20, g: 0.40, b: 0.95, hex: '#3366F2' },
  darkBlue:   { r: 0.10, g: 0.15, b: 0.40, hex: '#1A2666' },
  teal:       { r: 0.10, g: 0.75, b: 0.70, hex: '#1ABFB3' },
  green:      { r: 0.20, g: 0.70, b: 0.20, hex: '#33B333' },
  purple:     { r: 0.55, g: 0.20, b: 0.80, hex: '#8C33CC' },
  pink:       { r: 0.95, g: 0.40, b: 0.65, hex: '#F266A6' },
  orange:     { r: 0.95, g: 0.55, b: 0.10, hex: '#F28C1A' },
  white:      { r: 1.00, g: 1.00, b: 1.00, hex: '#FFFFFF' },
  black:      { r: 0.00, g: 0.00, b: 0.00, hex: '#000000' }
};

function hexToRgb(c) {
  if (!c || typeof c !== 'string') return null;
  var hex = c.replace('#', '');
  if (hex.length < 6) return null;
  return { r: parseInt(hex.substring(0,2),16)/255, g: parseInt(hex.substring(2,4),16)/255, b: parseInt(hex.substring(4,6),16)/255 };
}

function resolveColor(c) {
  if (typeof c === 'string' && COLORS[c.toLowerCase()]) return COLORS[c.toLowerCase()];
  if (typeof c === 'object' && c.r !== undefined) return c;
  if (typeof c === 'string' && c.startsWith('#')) {
    return hexToRgb(c) || COLORS.red;
  }
  return COLORS.red;
}

function getShadowTokens(level) {
  var shadowStr = getToken('elevation.' + level, null);
  if (!shadowStr || shadowStr === 'none' || shadowStr.length === 0) return [];
  
  // If it's a DTCG shadow array (stored as JSON string in token), parse it
  var shadows = [];
  try {
    if (typeof shadowStr === 'string') {
      shadows = JSON.parse(shadowStr);
    } else if (Array.isArray(shadowStr)) {
      shadows = shadowStr;
    }
  } catch(e) {
    return [{ type: 'DROP_SHADOW', blendMode: 'NORMAL', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 12, visible: true }];
  }
  
  return shadows.map(function(s) {
    var col = hexToRgb(s.color || '#000000') || { r: 0, g: 0, b: 0 };
    return {
      type: 'DROP_SHADOW',
      blendMode: 'NORMAL',
      color: { r: col.r, g: col.g, b: col.b, a: parseFloat(s.alpha || '0.25') },
      offset: { x: s.offsetX || 0, y: s.offsetY || 4 },
      radius: s.radius || 8,
      visible: true
    };
  });
}

function cleanColorObj(c) {
  // Remove non-Figma fields like 'hex'
  return { r: c.r, g: c.g, b: c.b };
}

function solidFill(color, opacity) {
  var c = resolveColor(color);
  return [{ type: "SOLID", color: cleanColorObj(c), opacity: opacity || 1 }];
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

var PROPORTIONS = getProportions();

var builders = {};

builders.heart = function(params) {
  var size = params.size || parseInt(getToken('icon.sizes.xxl', '200'));
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
  var size = params.size || parseInt(getToken('icon.sizes.lg', '150'));
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

builders.button = function(params) {
  var label = params.label || 'Button';
  var size = params.size || 160;
  var x = params.x || 300;
  var y = params.y || 300;
  
  // Use accent color from tokens when available, fallback to blue
  var accentHex = getToken('color.accent.$value', null);
  var accentColor = accentHex ? resolveColor(accentHex) : resolveColor(params.color || 'blue');
  
  // Tokens-driven values
  var borderRadius = parseInt(getToken('border-radius.md', '8'));
  var paddingH = parseInt(getToken('spacing.md', '16'));
  var paddingV = parseInt(getToken('spacing.sm', '8'));
  var fontSize = parseInt(getToken('typography.size.sm', '14'));
  var buttonH = fontSize + paddingV * 2;
  var buttonW = size + paddingH * 2;
  
  // Figma-compatible font: prefer typography.figma.* for Figma, fallback to typography.font-family.*
  var fontFamilyRaw = getToken('typography.figma.ui', null) || getToken('typography.font-family.ui', 'Inter');
  var fontFamily = fontFamilyRaw.split(',')[0].replace(/['"]/g, '').trim();
  
  var fillsAccent = [{ type: "SOLID", color: cleanColorObj(accentColor), opacity: 1 }];
  var fillsWhite = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }];
  
  return [
    {
      command: "createRectangle",
      payload: {
        name: "Button",
        x: x, y: y,
        width: buttonW,
        height: buttonH,
        cornerRadius: borderRadius,
        fills: fillsAccent,
        effects: getShadowTokens('low'),
        strokes: []
      }
    },
    {
      command: "createText",
      payload: {
        name: "Label",
        x: x + paddingH,
        y: y + paddingV,
        characters: label.toUpperCase(),
        fontSize: fontSize,
        fontName: { family: fontFamily, style: 'Regular' },
        fills: fillsWhite,
        letterSpacing: { value: 0.08, unit: 'PERCENT' }
      }
    }
  ];
};

// ── ORCHESTRATOR ──
async function orchestrate(shapeName, params) {
  var builder = builders[shapeName];
  if (!builder) throw new Error("Unknown shape: " + shapeName);

  // Step 0: Consult NotebookLM for design advice
  var advice = await getDesignAdvice(shapeName, params.color, params.shadow ? 'shadow' : null);
  if (advice) {
    console.log("  📖 Design advice from NotebookLM:");
    console.log("     " + advice.substring(0, 300) + "...");
  } else {
    console.log("  📖 Using built-in proportions.");
  }

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

          // Shadow (from tokens)
          var shadowEffects = getShadowTokens(params.shadowLevel || 'medium');
          effectCmds.push(sendCommand("updateNode", {
            id: finalId,
            effects: shadowEffects
          }));

          await Promise.all(effectCmds);
          console.log("  ✓ Effects applied");

          console.log("\n✅ Done! Shape created in Figma.");
          
          // Step 4: Critique & Refine (automatic)
          await wait(500);
          try {
            var critic = spawn('node', [
              path.join(__dirname, 'design_critic.js'),
              '--id', finalId,
              '--type', (params.shape === 'button' ? 'button' : 'icon')
            ].concat(process.env.DESIGN_PROJECT ? ['--project', process.env.DESIGN_PROJECT] : []), {
              stdio: 'inherit'
            });
            await new Promise(function(resolve) { critic.on('exit', resolve); });
          } catch(e) {
            console.log("  ℹ️  Critique skipped: " + e.message);
          }
          
          return { status: 'ok', id: finalId };
        }
      }
    } catch(e) {
      console.log("  ✗ " + e.message);
      return { status: 'error', error: e.message };
    }
  } else if (shapeIds.length === 1) {
    console.log("\n✅ Single shape created at id=" + shapeIds[0]);
    
    // Critique & Refine
    await wait(500);
    try {
      var critic = spawn('node', [
        path.join(__dirname, 'design_critic.js'),
        '--id', shapeIds[0],
        '--type', (params.shape === 'button' ? 'button' : 'icon')
      ].concat(process.env.DESIGN_PROJECT ? ['--project', process.env.DESIGN_PROJECT] : []), {
        stdio: 'inherit'
      });
      await new Promise(function(resolve) { critic.on('exit', resolve); });
    } catch(e) {
      console.log("  ℹ️  Critique skipped: " + e.message);
    }
    
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
  
  // Shadow level
  if (text.includes('alta ombr') || text.includes('high shadow')) params.shadowLevel = 'high';
  else if (params.shadow) params.shadowLevel = 'medium';
  else params.shadowLevel = 'low';
  
  // Button label
  if (params.shape === 'button') {
    var labelMatch = text.match(/"([^"]+)"/) || text.match(/'([^']+)'/);
    if (!labelMatch) {
      // Try to extract label after 'button'/'bottone'
      var afterBtn = text.split(/bottone|button|pulsante/)[1];
      if (afterBtn) {
        labelMatch = afterBtn.match(/\s*"?([a-zA-Z0-9\s]+)"?/);
      }
    }
    if (labelMatch) params.label = labelMatch[1].trim().substring(0, 20);
  }

  return params;
}

// ── CONSULT NOTEBOOKLM BEFORE DESIGN ──
// Writes a query file that OpenClaw/Craw picks up via heartbeat
// and answers via the NotebookLM MCP tool.
// The answer is written back for the next run to consume.

var cachedDesignAdvice = null;
var NOTEBOOKLM_QUERY_DIR = '/tmp/craw_figma_notebooklm/';

function getDesignAdvice(shapeName, color, style) {
  return new Promise(function(resolve) {
    if (cachedDesignAdvice) {
      console.log("  📖 Using cached advice.");
      resolve(cachedDesignAdvice);
      return;
    }
    
    // Check if a previous answer file exists
    try {
      var answerFile = NOTEBOOKLM_QUERY_DIR + 'answer.json';
      if (fs.existsSync(answerFile)) {
        var answer = JSON.parse(fs.readFileSync(answerFile, 'utf-8'));
        if (answer.advice) {
          cachedDesignAdvice = answer.advice;
          console.log("  📖 Using previous NotebookLM advice.");
          resolve(cachedDesignAdvice);
          return;
        }
      }
    } catch(e) {}
    
    var category = 'proportions';
    var question = '';
    
    if (shapeName === 'heart') {
      category = 'shape_heart';
      question = 'Quali sono le proporzioni ideali per un cuore in icon design? ' +
        'Un cuore iconico ha rapporto larghezza/altezza intorno a 0.85? ' +
        'Le curve devono essere lisce con lobi arrotondati. Cosa dice Refactoring UI?';
    } else if (shapeName === 'star') {
      category = 'shape_star';
      question = 'Quali proporzioni usa Refactoring UI per le icone a stella? ' +
        'Un rapporto innerRadius ottimale per stelle a 5 punte è 0.38 o 0.4?';
    } else if (shapeName === 'button') {
      category = 'ui_button';
      question = 'Secondo Refactoring UI e Material Design 3, quali sono le proporzioni ' +
        'e lo stile ideali per un bottone UI? Corner radius, padding, ombre, gradiente. ' +
        'Per un colore ' + (color || 'blu') + ', che gradiente secondario scegliere?';
    }
    
    if (question) {
      try {
        if (!fs.existsSync(NOTEBOOKLM_QUERY_DIR)) {
          fs.mkdirSync(NOTEBOOKLM_QUERY_DIR, { recursive: true });
        }
        fs.writeFileSync(NOTEBOOKLM_QUERY_DIR + 'query.json', JSON.stringify({
          question: question,
          category: category,
          shape: shapeName,
          color: color,
          style: style || null,
          timestamp: Date.now()
        }, null, 2));
        console.log('  📝 NotebookLM: domanda salvata in ' + NOTEBOOKLM_QUERY_DIR + 'query.json');
        console.log('     Craw risponderà nel prossimo ciclo.');
      } catch(e) {
        console.log('  ⚠️  Cannot write query: ' + e.message);
      }
    }
    
    resolve(null);
  });
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
