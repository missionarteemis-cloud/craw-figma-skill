---
name: craw-figma
description: Full bidirectional Figma integration — read files via REST API, create/modify/delete layers via local WebSocket connector + Figma plugin. Audit accessibility, extract design tokens, export assets. Write operations appear in real time on Figma Desktop.
---

# Craw Figma Skill

Complete Figma control for AI agents: **read** via REST API, **write** via a local plugin. Change design layers, extract design tokens, audit accessibility, export assets.

## Architecture

```
Craw ──→ figma_client.mjs (REST API) ──────→ Figma cloud    (read: file, styles, export)
     ──→ figma_send.js    (WebSocket) ──→ figma_connector.js ──→ Figma Plugin → Figma Desktop
     ──→ style_auditor.mjs              (design system analysis, CSS tokens)
     ──→ accessibility_checker.mjs      (WCAG AA/AAA, contrast, touch targets)
```

## Requirements

- **Figma Personal Access Token** → for REST API (read). Get it: Figma → Settings → Account → Personal Access Tokens
- **Figma Desktop** → required for write operations
- **Node.js 18+**

## Quick Start

### 1. Set up your token

```bash
export FIGMA_ACCESS_TOKEN="figd_your_token_here"
```

### 2. Read a Figma file

```bash
node scripts/figma_client.mjs get-file <file-key>
# Example: node scripts/figma_client.mjs get-file "ABC123xyz" --depth 4
```

Get a file key from: `https://www.figma.com/design/<FILE_KEY>/...`

### 3. Install the Figma Plugin (one-time, for write access)

1. Clone/download the skill repository
2. Open **Figma Desktop** → **Plugins** → **Development** → **Import plugin from manifest...**
3. Select `plugin/manifest.json` from this skill's directory
4. The plugin "Craw Figma Connector" is now installed

### 4. Start the connector + run the plugin

```bash
# Terminal 1: Start the local WebSocket server
node scripts/figma_connector.js
# → Listening on ws://localhost:9199
```

In Figma Desktop:
- Right-click canvas → **Plugins** → **Craw Figma Connector**
- The panel shows **Connected to Craw** when the WebSocket connects

### 5. Send write commands

```bash
# Create a rectangle
node scripts/figma_send.js createRectangle \
  --payload '{"x":100,"y":100,"width":400,"height":300,"fillColor":{"r":0.14,"g":0.49,"b":1},"cornerRadius":12,"name":"Hero Card"}'

# Get current selection
node scripts/figma_send.js getSelection
```

## Available Commands

### Write (Plugin — real-time in Figma Desktop)

| Command | Payload (JSON) | Description |
|---------|---------------|-------------|
| `createRectangle` | `{x, y, width, height, fillColor?, cornerRadius?, name?}` | New rectangle |
| `createFrame` | `{x, y, width, height, fillColor?, name?}` | New frame/artboard |
| `createEllipse` | `{x, y, width, height, fillColor?, name?}` | New ellipse |
| `createText` | `{x, y, characters, fontSize?, fontName?, fillColor?, name?}` | New text layer |
| `selectNode` | `{id}` | Select + zoom into node |
| `updateNode` | `{id, x?, y?, resize?{width,height}, fillColor?, name?}` | Modify existing node |
| `deleteNode` | `{id}` | Remove node |
| `setFillColor` | `{id, color{r,g,b}, opacity?}` | Set fill color |
| `groupSelection` | `{}` | Group selected nodes |
| `getSelection` | `{}` | List selected nodes |
| `getPageInfo` | `{}` | Current page info |

### Read (REST API)

| Action | Args | Description |
|--------|------|-------------|
| `get-file` | `<key> [--depth N]` | Full file document tree |
| `get-file-nodes` | `<key> <id>...` | Specific nodes by ID |
| `get-styles` | `<key>` | Published styles (color, text, effects) |
| `get-components` | `<key>` | Published components |
| `get-versions` | `<key>` | Version history |
| `render-images` | `<key> <id> [--format png\|svg\|pdf] [--scale N]` | Export as images |
| `get-image-fills` | `<key>` | Image fill URLs used in file |
| `get-metadata` | `<key>` | Lightweight file info |
| `me` | — | Current user info |

### Analysis

| Action | Args | Description |
|--------|------|-------------|
| `style_auditor.mjs` | `<key> [--brand-colors "#HEX,#HEX"] [--generate-css]` | Analyze colors, fonts, consistency, CSS tokens |
| `accessibility_checker.mjs` | `<key> [--level AA\|AAA] [--format json\|report]` | WCAG contrast, touch targets, font sizes |

## Color Format

Figma uses RGB in 0–1 range:
```json
{"r": 0.14, "g": 0.49, "b": 1}     // #247DFF (blue)
{"r": 1, "g": 0.42, "b": 0.21}      // #FF6B35 (orange)
{"r": 1, "g": 1, "b": 1}            // #FFFFFF (white)
```

## Auto-setup for AI Agents

When a user installs this skill, the AI agent should:
1. Check if `FIGMA_ACCESS_TOKEN` is set — if not, instruct the user to generate one and export it
2. For write operations, check if the Figma plugin is installed — if not:
   - Guide the user through importing `plugin/manifest.json` in Figma Desktop
   - Suggest running `node scripts/figma_connector.js` separately
   - Offer to run `figma_connector.js` if the agent has shell access
3. Test connectivity with `figma_client.mjs me` before proceeding

## Tips

- Keep `figma_connector.js` running while working with write commands
- The plugin auto-reconnects if the connector restarts (3s retry)
- Commands sent while the plugin is offline are queued and sent on reconnect
- Health check: `http://localhost:9200` shows status and pending queue
- Use `--generate-css` to extract Figma styles as CSS custom properties

## Files

```
skills/craw-figma/
├── SKILL.md
├── scripts/
│   ├── figma_client.mjs          — Figma REST API client (read)
│   ├── figma_connector.js        — Local WebSocket server (run this)
│   ├── figma_send.js             — Send commands to Figma plugin
│   ├── style_auditor.mjs         — Design system analysis
│   └── accessibility_checker.mjs — WCAG compliance
├── plugin/
│   ├── manifest.json             — Figma plugin manifest
│   ├── code.ts                   — Plugin code (TypeScript)
│   └── ui.html                   — Plugin panel UI
└── references/
    ├── figma-api-reference.md    — REST API docs
    └── design-patterns.md        — UI patterns & best practices
```
