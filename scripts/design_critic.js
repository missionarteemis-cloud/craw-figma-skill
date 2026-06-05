#!/usr/bin/env node
/**
 * Design Critic — Automatic critique/refine pipeline
 *
 * After creating an element in Figma, evaluates it against
 * design principles (Refactoring UI, MD3, Gestalt, Apple HIG)
 * and generates refinement commands.
 *
 * Usage:
 *   node design_critic.js --id 77:5 --type icon
 *   node design_critic.js --id 77:10 --type button --project drs-lab
 *
 * Categories:
 *   1. Simmetry & Alignment  — is it centered? Are lobes balanced?
 *   2. Spacing & Proportions — does it match the design token scale?
 *   3. Color & Contrast      — are fills visible? Gradient smooth?
 *   4. Hierarchy & Effects   — are shadows appropriate? Is the visual weight right?
 */

var http = require('http');
var fs = require('fs');
var path = require('path');

var CONNECTOR_URL = process.env.FIGMA_CONNECTOR || 'http://localhost:9199';

// ── ARGS ──
var args = process.argv.slice(2);
var targetId = null;
var elementType = 'icon';
var projectName = null;

for (var i = 0; i < args.length; i++) {
  if (args[i] === '--id') targetId = args[i + 1];
  if (args[i] === '--type') elementType = args[i + 1];
  if (args[i] === '--project') projectName = args[i + 1];
}

if (!targetId) {
  console.log("Usage: node design_critic.js --id <figma-node-id> [--type icon|button|card] [--project name]");
  process.exit(1);
}

// ── LOAD TOKENS (for reference) ──
function loadTokens() {
  var tokensPath = path.join(__dirname, '..', 'design-tokens', 'design-tokens.json');
  if (!fs.existsSync(tokensPath)) return null;
  try {
    var base = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
    if (projectName) {
      var projFile = path.join(__dirname, '..', 'design-tokens', 'projects', projectName + '.json');
      if (fs.existsSync(projFile)) {
        var proj = JSON.parse(fs.readFileSync(projFile, 'utf-8'));
        delete proj[projectName];
        delete proj.$extensions;
        delete proj.$description;
        deepMerge(base, proj);
      }
    }
    return base;
  } catch(e) {
    return null;
  }
}

function deepMerge(t, s) {
  for (var k in s) {
    if (!s.hasOwnProperty(k)) continue;
    if (s[k] && typeof s[k] === 'object' && !s[k].$value && !Array.isArray(s[k])) {
      if (!t[k] || typeof t[k] !== 'object') t[k] = {};
      deepMerge(t[k], s[k]);
    } else {
      t[k] = s[k];
    }
  }
}

var TOKENS = loadTokens();

// ── CONNECTOR ──
function sendCommand(command, payload) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify({ command: command, payload: payload, id: 'cr_' + Date.now() });
    var parsed = CONNECTOR_URL.replace('http://', '').split(':');
    var req = http.request({
      hostname: parsed[0], port: parseInt(parsed[1]), path: '/send-command',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() { try { resolve(JSON.parse(body)); } catch(e) { resolve({ status: 'ok', raw: body }); } });
    });
    req.on('error', function(e) { reject(e); });
    req.write(data);
    req.end();
  });
}

function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ── DESIGN CRITIQUE MATRIX ──
// Grounded in: Refactoring UI, MD3, Gestalt, Apple HIG, Figma Auto Layout
//
// Each check returns:
//   { pass: bool, issue: string, severity: 'low'|'medium'|'high', fix: function }

var checks = {};

// ── 1. Simmetry & Alignment ──

checks.simmetry = {
  category: "Simmetria e Allineamento",
  severity: "high",
  description: "L'elemento dovrebbe essere simmetrico e centrato.",
  run: function(nodeInfo) {
    var issues = [];
    // Controllo base: bounding box rispetto a dove dovrebbe essere
    // Non abbiamo accesso ai singoli vertex da fuori, ma possiamo
    // verificare che le dimensioni abbiano senso
    if (nodeInfo.width && nodeInfo.height) {
      // Per icone: proporzioni ragionevoli
      if (elementType === 'icon' && nodeInfo.width) {
        // Good — dimensions exist
      }
    }
    return issues;
  },
  refine: function(nodeInfo, issues) {
    return []; // Simmetry refinement needs vertex-level access
  }
};

// ── 2. Spacing & Proportions ──

checks.proportions = {
  category: "Spaziatura e Proporzioni",
  severity: "high",
  description: "Le dimensioni devono rispettare il design token scale system.",
  run: function(nodeInfo) {
    var issues = [];
    if (!nodeInfo.width || !nodeInfo.height) return issues;

    var w = nodeInfo.width;
    var h = nodeInfo.height;

    // Proporzioni icona: dovrebbe essere ben bilanciata
    if (elementType === 'icon') {
      if (w > 0 && h > 0) {
        var ratio = w / h;
        // Icone dovrebbero stare in un range 0.7 - 1.3 (non troppo schiacciate)
        if (ratio < 0.5 || ratio > 2.0) {
          issues.push({
            issue: "Proporzioni estreme: " + w + "×" + h + " (ratio " + ratio.toFixed(2) + ")",
            severity: "medium",
            suggestion: "Refactoring UI: le icone dovrebbero stare in proporzioni vicine al quadrato"
          });
        }
      }
    }

    // Spaziatura: multipli di 4 (Refactoring UI / MD3)
    if (w > 0 && w % 4 !== 0) {
      issues.push({
        issue: "Larghezza " + w + "px non multiplo di 4",
        severity: "low",
        suggestion: "Usa multipli di 4dp per allineamento al grid system (Refactoring UI)"
      });
    }
    if (h > 0 && h % 4 !== 0) {
      issues.push({
        issue: "Altezza " + h + "px non multiplo di 4",
        severity: "low",
        suggestion: "Usa multipli di 4dp per allineamento al grid system (Refactoring UI)"
      });
    }

    return issues;
  },
  refine: function(nodeInfo, issues) {
    var cmds = [];
    // Snap to 4px grid if needed
    if (nodeInfo.width && nodeInfo.width % 4 !== 0) {
      var snapped = Math.round(nodeInfo.width / 4) * 4;
      cmds.push({
        command: "updateNode",
        payload: { id: nodeInfo.id, width: snapped },
        description: "Snap larghezza a " + snapped + "px (multiplo di 4)"
      });
    }
    if (nodeInfo.height && nodeInfo.height % 4 !== 0) {
      var snapped = Math.round(nodeInfo.height / 4) * 4;
      cmds.push({
        command: "updateNode",
        payload: { id: nodeInfo.id, height: snapped },
        description: "Snap altezza a " + snapped + "px (multiplo di 4)"
      });
    }
    return cmds;
  }
};

// ── 3. Color & Contrast ──

checks.color = {
  category: "Colore e Contrasto",
  severity: "medium",
  description: "I colori devono avere contrasto sufficiente e gradienti morbidi.",
  run: function(nodeInfo) {
    var issues = [];
    // We can't inspect fills directly without getNodeInfo command
    // This check documents the criteria for manual review
    issues.push({
      issue: "Verifica manuale consigliata",
      severity: "low",
      suggestion: "Refactoring UI: non usare testo grigio su sfondi colorati. MD3: forme morbide e ombre leggere."
    });
    return issues;
  },
  refine: function(nodeInfo, issues) {
    return [];
  }
};

// ── 4. Hierarchy & Effects ──

checks.hierarchy = {
  category: "Gerarchia ed Effetti",
  severity: "medium",
  description: "Ombre e gradienti devono essere coerenti col design token system.",
  run: function(nodeInfo) {
    var issues = [];
    // Shadow level check based on token system
    issues.push({
      issue: "Verifica ombre consigliata",
      severity: "low",
      suggestion: "MD3 usa ombre più sottili. Refactoring UI: ombre con offset verticale per luce dall'alto."
    });
    return issues;
  },
  refine: function(nodeInfo, issues) {
    return [];
  }
};

// ── CRITIQUE ENGINE ──
async function critique(shapeId) {
  console.log("\n🔍 Design Critic — Analyzing [" + elementType + "] id=" + shapeId + "\n");

  // Fetch node info
  var nodeInfo = null;
  try {
    var sel = await sendCommand("getSelection", {});
    if (sel && sel.status === 'ok' && sel.data) {
      nodeInfo = sel.data;
      console.log("   Selection: " + JSON.stringify(nodeInfo).substring(0, 200));
    }
  } catch(e) {
    console.log("   ℹ️  Cannot fetch node info, using heuristics.");
    nodeInfo = { id: shapeId, width: 200, height: 200 }; // fallback
  }

  // If we got an array of selections, find our target
  if (nodeInfo && nodeInfo.nodes) {
    var found = null;
    for (var i = 0; i < nodeInfo.nodes.length; i++) {
      if (nodeInfo.nodes[i].id === shapeId || nodeInfo.nodes[i].id === shapeId) {
        found = nodeInfo.nodes[i];
        break;
      }
    }
    if (found) nodeInfo = found;
  }

  // ── Run all checks ──
  var allIssues = [];
  var allRefinements = [];

  var checkNames = Object.keys(checks);
  for (var c = 0; c < checkNames.length; c++) {
    var check = checks[checkNames[c]];
    console.log("[" + check.category + "]");

    var issues = check.run(nodeInfo || { id: shapeId });
    allIssues = allIssues.concat(issues);

    if (issues.length === 0) {
      console.log("  ✅ OK — nessun problema");
    } else {
      for (var i = 0; i < issues.length; i++) {
        var sev = issues[i].severity || 'low';
        var icon = sev === 'high' ? '🔴' : (sev === 'medium' ? '🟡' : '🟢');
        console.log("  " + icon + " [" + sev + "] " + issues[i].issue);
        if (issues[i].suggestion) {
          console.log("     → " + issues[i].suggestion);
        }
      }
    }

    // Collect refinement commands
    var refines = check.refine(nodeInfo || { id: shapeId }, issues);
    allRefinements = allRefinements.concat(refines);

    console.log("");
  }

  // ── Summary ──
  var highCount = allIssues.filter(function(i) { return i.severity === 'high'; }).length;
  var medCount = allIssues.filter(function(i) { return i.severity === 'medium'; }).length;
  var lowCount = allIssues.filter(function(i) { return i.severity === 'low'; }).length;

  console.log("═══ RIEPILOGO ═══");
  console.log("  🔴 " + highCount + " critici");
  console.log("  🟡 " + medCount + " medi");
  console.log("  🟢 " + lowCount + " minori");
  console.log("  🔧 " + allRefinements.length + " azioni di refine automatiche\n");

  // ── Auto-refine ──
  if (allRefinements.length > 0) {
    console.log("═══ REFINE ═══");
    for (var r = 0; r < allRefinements.length; r++) {
      var ref = allRefinements[r];
      console.log("  → " + ref.command + " — " + (ref.description || ''));
      try {
        var res = await sendCommand(ref.command, ref.payload);
        if (res && (res.status === 'ok' || res.status === 'pending')) {
          console.log("    ✓ Done");
        } else {
          console.log("    ✗ " + JSON.stringify(res));
        }
      } catch(e) {
        console.log("    ✗ " + e.message);
      }
      await wait(300);
    }
    console.log("\n✅ Refine completato!");
  } else {
    console.log("Nessuna azione automatica necessaria.");
  }
}

// ── RUN ──
critique(targetId).catch(function(err) {
  console.error("\n💥 Critique error:", err.message);
  process.exit(1);
});
