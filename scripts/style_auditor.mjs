#!/usr/bin/env node

/**
 * style_auditor.mjs — Figma design system consistency analyzer.
 *
 * Analizza colori, tipografia, spaziature e consistenza del design system
 * di un file Figma. Genera un report strutturato.
 *
 * Uso:
 *   node style_auditor.mjs <file-key> [--depth N]
 *   node style_auditor.mjs <file-key> --brand-colors "#247DFF,#FF6B35,#000000"
 *   node styles_auditor.mjs <file-key> --generate-css
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

// Colori esadecimali → RGB Figma
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return { r, g, b };
}

function rgbToHex(c) {
  const r = Math.round(c.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(c.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(c.b * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

// Luminosità relativa per contrasto
function luminance({ r, g, b }) {
  const l = v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function contrastLevel(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-Large";
  return "FAIL";
}

// Walk tree raccogliendo info
function walkTree(node, depth = 0, maxDepth = 5, colors = new Set(), fonts = new Set()) {
  if (depth > maxDepth) return;
  // Raccogli fill colors
  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.type === "SOLID" && fill.color) {
        colors.add(rgbToHex(fill.color));
      }
    }
  }
  // Raccogli stroke colors
  if (node.strokes) {
    for (const stroke of node.strokes) {
      if (stroke.type === "SOLID" && stroke.color) {
        colors.add(rgbToHex(stroke.color));
      }
    }
  }
  // Raccogli font info
  if (node.style) {
    if (node.style.fontFamily) fonts.add(node.style.fontFamily);
    if (node.style.fontPostScriptName) fonts.add(node.style.fontPostScriptName);
    if (node.style.fontSize) fonts.add(`${node.style.fontFamily || "?"} ${node.style.fontSize}px`);
  }
  if (node.children) node.children.forEach(c => walkTree(c, depth + 1, maxDepth, colors, fonts));
  return { colors: [...colors], fonts: [...fonts] };
}

async function main() {
  const fileKey = process.argv[3];
  if (!fileKey) throw new Error("file-key required");

  const data = await apiGet(`/files/${fileKey}`);
  const { colors, fonts } = walkTree(data.document);

  // Ottieni anche gli stili pubblicati
  let styles = { colors: [], text: [], effects: [] };
  try {
    const stylesData = await apiGet(`/files/${fileKey}/styles`);
    styles = stylesData.meta?.styles || stylesData;
  } catch {}

  // Report
  const report = {
    file: data.name,
    lastModified: data.lastModified,
    colors: {
      total: colors.length,
      unique: colors,
      palette: colors.sort(),
    },
    fonts: {
      total: fonts.length,
      families: [...new Set(fonts.map(f => f.split(" ")[0]))],
      details: fonts,
    },
    styles: styles,
    consistency: {
      colorCount: colors.length,
      fontCount: new Set(fonts.map(f => f.split(" ")[0])).size,
    },
  };

  // Brand color check
  const bcIdx = process.argv.indexOf("--brand-colors");
  if (bcIdx !== -1 && process.argv[bcIdx + 1]) {
    const brandColors = process.argv[bcIdx + 1].split(",").map(h => hexToRgb(h.trim()));
    const missing = brandColors.filter(bc => {
      const hex = rgbToHex(bc);
      return !colors.some(c => c === hex);
    });
    const present = brandColors.filter(bc => {
      const hex = rgbToHex(bc);
      return colors.some(c => c === hex);
    });
    report.brandCompliance = {
      brandColorsTotal: brandColors.length,
      found: present.length,
      missing: missing.length,
      missingColors: missing.map(rgbToHex),
    };
  }

  // WCAG contrast check (pairwise su tutti i colori)
  report.accessibility = {
    pairs: [],
    warnings: [],
  };
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const c1 = hexToRgb(colors[i]);
      const c2 = hexToRgb(colors[j]);
      const ratio = contrastRatio(c1, c2);
      const level = contrastLevel(ratio);
      if (level === "FAIL" || level === "AA-Large") {
        report.accessibility.pairs.push({
          c1: colors[i], c2: colors[j],
          ratio: ratio.toFixed(2),
          level,
        });
      }
    }
  }
  if (report.accessibility.pairs.length > 5) {
    report.accessibility.warnings.push(`Found ${report.accessibility.pairs.length} low-contrast pairs — consider reviewing`); // eslint-disable-line
    report.accessibility.pairs = report.accessibility.pairs.slice(0, 5);
    report.accessibility.pairs.push({ note: `...${report.accessibility.pairs.length} more pairs` });
  }

  // CSS token export
  const cssIdx = process.argv.indexOf("--generate-css");
  if (cssIdx !== -1) {
    report.cssTokens = `:root {\n` +
      colors.map((c, i) => `  --figma-color-${i + 1}: ${c};`).join("\n") + "\n" +
      `  --figma-font-primary: "${[...new Set(fonts.map(f => f.split(" ")[0]))][0] || "Inter"}";\n` +
      `}\n`;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error("Error:", err.message); process.exit(1); });
