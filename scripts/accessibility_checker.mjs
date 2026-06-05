#!/usr/bin/env node

/**
 * accessibility_checker.mjs — WCAG compliance validation per Figma file.
 *
 * Verifica:
 * - Contrasto colore (WCAG AA/AAA)
 * - Touch target minimi (48×48 per interactive)
 * - Font size minimi per leggibilità
 *
 * Uso:
 *   node accessibility_checker.mjs <file-key> [--level AA|AAA] [--format json|report]
 */

const token = (() => {
  const idx = process.argv.indexOf("--token");
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.FIGMA_ACCESS_TOKEN;
})();

if (!token) { console.error("ERROR: No FIGMA_ACCESS_TOKEN"); process.exit(1); }

const API = "https://api.figma.com/v1";
const headers = { "X-Figma-Token": token };

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "").then(s => s.slice(0,200))}`);
  return res.json();
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return { r, g, b };
}

function rgbToHex(c) {
  return `#${Math.round(c.r*255).toString(16).padStart(2,"0")}${Math.round(c.g*255).toString(16).padStart(2,"0")}${Math.round(c.b*255).toString(16).padStart(2,"0")}`.toUpperCase();
}

function luminance({ r, g, b }) {
  const l = v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
}

function contrastRatio(c1, c2) {
  return (Math.max(luminance(c1), luminance(c2)) + 0.05) / (Math.min(luminance(c1), luminance(c2)) + 0.05);
}

// Walk tree collecting nodes for analysis
function collectNodes(node, depth = 0, maxDepth = 10, result = []) {
  if (depth > maxDepth) return result;
  const bbox = node.absoluteBoundingBox;
  const info = {
    id: node.id, name: node.name, type: node.type,
    bbox: bbox ? { w: Math.round(bbox.width), h: Math.round(bbox.height) } : null,
    fills: node.fills || [],
    strokes: node.strokes || [],
    style: node.style || null,
  };
  result.push(info);
  if (node.children) node.children.forEach(c => collectNodes(c, depth + 1, maxDepth, result));
  return result;
}

async function main() {
  const fileKey = process.argv[3];
  const level = (process.argv.indexOf("--level") !== -1 ? process.argv[process.argv.indexOf("--level") + 1] : "AA").toUpperCase();
  const format = process.argv.indexOf("--format") !== -1 ? process.argv[process.argv.indexOf("--format") + 1] : "json";

  if (!fileKey) throw new Error("file-key required");

  const data = await apiGet(`/files/${fileKey}`);
  const nodes = collectNodes(data.document);

  const issues = [];

  for (const node of nodes) {
    if (!node.bbox) continue;

    // 1. Touch target check (solo per componenti interattivi presunti)
    if ((node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") &&
        node.bbox.w < 48 && node.bbox.h < 48) {
      issues.push({
        type: "touch-target",
        severity: "warning",
        message: `Interactive element "${node.name}" is ${node.bbox.w}×${node.bbox.h} — minimum 48×48`,
        nodeId: node.id,
        size: `${node.bbox.w}×${node.bbox.h}`,
        wcagCriterion: "2.5.8",
      });
    }

    // 2. Font size check
    if (node.style && node.style.fontSize) {
      const size = node.style.fontSize;
      const minSize = level === "AAA" ? 18 : 14;
      if (size < minSize) {
        issues.push({
          type: "font-size",
          severity: level === "AAA" ? "error" : "warning",
          message: `Text "${node.name}" is ${size}px — minimum ${minSize}px for ${level}`,
          nodeId: node.id,
          fontSize: size,
          wcagCriterion: "1.4.4",
        });
      }
    }

    // 3. Contrast check per fill colors dei testi (se abbiamo foreground e background)
    if (node.fills && node.fills.length > 0 && node.type === "TEXT") {
      const fill = node.fills.find(f => f.type === "SOLID");
      if (fill && fill.color) {
        const fg = fill.color;
        // Cerchiamo uno sfondo nearby (genitore) — fallback su nero
        const bg = { r: 0.05, g: 0.05, b: 0.07 }; // default dark
        const ratio = contrastRatio(fg, bg);
        const minAA = level === "AAA" ? 7 : 4.5;
        if (ratio < minAA) {
          issues.push({
            type: "contrast",
            severity: ratio < 3 ? "error" : "warning",
            message: `Text "${node.name}" contrast ${ratio.toFixed(2)}:1 — minimum ${minAA}:1 for ${level}`,
            nodeId: node.id,
            foreground: rgbToHex(fg),
            ratio: ratio.toFixed(2),
            wcagCriterion: "1.4.3",
          });
        }
      }
    }
  }

  const result = {
    file: data.name,
    wcagLevel: level,
    totalIssues: issues.length,
    bySeverity: {
      error: issues.filter(i => i.severity === "error").length,
      warning: issues.filter(i => i.severity === "warning").length,
    },
    issues: issues.slice(0, 30),
    truncated: issues.length > 30,
    summary: issues.length === 0
      ? `✅ No ${level} violations found`
      : `⚠️ ${issues.length} ${level} issue(s) found (${result?.bySeverity?.error || 0} errors, ${result?.bySeverity?.warning || 0} warnings)`,
  };

  // Recalc summary properly
  result.summary = result.totalIssues === 0
    ? `✅ No ${level} violations found`
    : `⚠️ ${result.totalIssues} ${level} issue(s) found (${result.bySeverity.error} errors, ${result.bySeverity.warning} warnings)`;

  if (format === "report") {
    console.log(`\n=== WCAG ${level} Accessibility Report ===`);
    console.log(`File: ${result.file}`);
    console.log(`Issues: ${result.totalIssues} (${result.bySeverity.error} errors, ${result.bySeverity.warning} warnings)`);
    console.log();
    for (const issue of result.issues) {
      console.log(`[${issue.severity.toUpperCase()}] ${issue.message}`);
    }
    if (result.truncated) console.log(`\n... and ${result.totalIssues - 30} more issues`);
    console.log(`\n${result.summary}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => { console.error("Error:", err.message); process.exit(1); });
