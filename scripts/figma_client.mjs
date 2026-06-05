#!/usr/bin/env node

/**
 * figma_client.mjs — Figma REST API client (read-only).
 *
 * Uso:
 *   node figma_client.mjs get-file <file-key>
 *   node figma_client.mjs get-file-nodes <file-key> <node-id> [node-id...]
 *   node figma_client.mjs get-styles <file-key>
 *   node figma_client.mjs get-components <file-key>
 *   node figma_client.mjs get-versions <file-key>
 *   node figma_client.mjs render-images <file-key> <node-id> [--format png|svg|pdf] [--scale 2]
 *   node figma_client.mjs get-image-fills <file-key>
 *   node figma_client.mjs get-metadata <file-key>
 *   node figma_client.mjs list-project-files <project-id>
 *   node figma_client.mjs list-team-projects <team-id>
 *   node figma_client.mjs me
 *
 * Opzioni globali:
 *   --token <figma-token>            (default: $FIGMA_ACCESS_TOKEN)
 *   --depth <number>                 (nested child walk depth, default: 3)
 */

const token = (() => {
  const idx = process.argv.indexOf("--token");
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.FIGMA_ACCESS_TOKEN;
})();

if (!token) {
  console.error("ERROR: No FIGMA_ACCESS_TOKEN set. Use --token or FIGMA_ACCESS_TOKEN env.");
  process.exit(1);
}

const API = "https://api.figma.com/v1";
const headers = { "X-Figma-Token": token };

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function walkTree(node, depth, maxDepth) {
  if (depth > maxDepth) return { name: node.name, type: node.type, truncated: true };
  const bbox = node.absoluteBoundingBox
    ? { x: Math.round(node.absoluteBoundingBox.x), y: Math.round(node.absoluteBoundingBox.y),
        w: Math.round(node.absoluteBoundingBox.width), h: Math.round(node.absoluteBoundingBox.height) }
    : undefined;
  const children = node.children ? node.children.map(c => walkTree(c, depth + 1, maxDepth)) : undefined;
  return { name: node.name, type: node.type, id: node.id, bbox, children };
}

// ── Actions ──────────────────────────────────────────────────────────

async function main() {
  const action = process.argv[2];

  if (!action || action === "--help") {
    console.log("Usage: node figma_client.mjs <action> [args...]");
    console.log("Actions:");  // eslint-disable-line
    console.log("  get-file <file-key> [--depth N]");
    console.log("  get-file-nodes <file-key> <node-id>...");
    console.log("  get-styles <file-key>");
    console.log("  get-components <file-key>");
    console.log("  get-versions <file-key>");
    console.log("  render-images <file-key> <node-id> [--format png|svg|pdf] [--scale 2]");
    console.log("  get-image-fills <file-key>");
    console.log("  get-metadata <file-key>");
    console.log("  me");
    return;
  }

  switch (action) {

    case "get-file": {
      const fileKey = process.argv[3];
      if (!fileKey) throw new Error("file-key required");
      const depthIdx = process.argv.indexOf("--depth");
      const depth = depthIdx !== -1 ? parseInt(process.argv[depthIdx + 1], 10) : 3;
      const data = await apiGet(`/files/${fileKey}`);
      const result = {
        name: data.name,
        lastModified: data.lastModified,
        thumbnailUrl: data.thumbnailUrl,
        document: walkTree(data.document, 0, depth),
        componentCount: Object.keys(data.components || {}).length,
        styleCount: Object.keys(data.styles || {}).length,
      };
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "get-file-nodes": {
      const fileKey = process.argv[3];
      const nodeIds = process.argv.slice(4);
      if (!fileKey || nodeIds.length === 0) throw new Error("file-key and at least one node-id required");
      const data = await apiGet(`/files/${fileKey}/nodes?ids=${nodeIds.join(",")}`);
      const result = {};
      for (const [id, node] of Object.entries(data.nodes || {})) {
        result[id] = node ? walkTree(node.document, 0, 3) : null;
      }
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "get-styles": {
      const fileKey = process.argv[3];
      if (!fileKey) throw new Error("file-key required");
      const data = await apiGet(`/files/${fileKey}/styles`);
      console.log(JSON.stringify(data.meta?.styles || data, null, 2));
      break;
    }

    case "get-components": {
      const fileKey = process.argv[3];
      if (!fileKey) throw new Error("file-key required");
      const data = await apiGet(`/files/${fileKey}/components`);
      console.log(JSON.stringify(data.meta?.components || data, null, 2));
      break;
    }

    case "get-versions": {
      const fileKey = process.argv[3];
      if (!fileKey) throw new Error("file-key required");
      const data = await apiGet(`/files/${fileKey}/versions`);
      console.log(JSON.stringify(data.versions, null, 2));
      break;
    }

    case "render-images": {
      const fileKey = process.argv[3];
      const nodeId = process.argv[4];
      const fmtIdx = process.argv.indexOf("--format");
      const scaleIdx = process.argv.indexOf("--scale");
      const format = fmtIdx !== -1 ? process.argv[fmtIdx + 1] : "png";
      const scale = scaleIdx !== -1 ? parseInt(process.argv[scaleIdx + 1], 10) : 1;
      if (!fileKey || !nodeId) throw new Error("file-key and node-id required");
      const data = await apiGet(`/images/${fileKey}?ids=${nodeId}&format=${format}&scale=${scale}`);
      console.log(JSON.stringify(data.images, null, 2));
      break;
    }

    case "get-image-fills": {
      const fileKey = process.argv[3];
      if (!fileKey) throw new Error("file-key required");
      const data = await apiGet(`/files/${fileKey}/images`);
      console.log(JSON.stringify(data.meta?.images || data, null, 2));
      break;
    }

    case "get-metadata": {
      const fileKey = process.argv[3];
      if (!fileKey) throw new Error("file-key required");
      const data = await apiGet(`/files/${fileKey}/meta`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "me": {
      const data = await apiGet("/me");
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

main().catch(err => { console.error("Error:", err.message); process.exit(1); });
