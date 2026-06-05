---
name: craw-figma
description: Read, analyze, and design inside Figma. Read files via REST API; create and modify layers via a local WebSocket connector + Figma plugin. Full bidirectional control — extract design tokens, export assets, create shapes, text, frames, and manipulate layers in real time.
---

# Craw Figma Skill

Bidirectional Figma integration: read via REST API, write via a local plugin connector.

## Architecture

```
Craw ──→ figma_client.mjs (REST API) ──→ Figma cloud (read-only)
     ──→ figma_send.js    (WebSocket) ──→ figma_connector.js ↔ Figma Plugin → Figma Desktop (read + write)
```

## Requirements

- **Figma Personal Access Token** → for REST API (read)
- **Figma Desktop** + **Craw Figma Connector plugin** → for write/design operations
- **Node.js 18+** (for WebSocket scripts)

## Quick Start

### 1. Set up your token

```bash
export FIGMA_ACCESS_TOKEN="figd_your_token_here"
# or add to your .env:
echo 'FIGMA_ACCESS_TOKEN="figd_your_token"' >> .env
```

### 2. Read a Figma file

```bash
node scripts/figma_client.mjs get-file <file-key>
node scripts/figma_client.mjs get-file "abc123" --depth 4
```

Get a file key from any Figma share URL:
`https://www.figma.com/design/<FILE_KEY>/...`

### 3. Install the plugin & connector (for write access)

#### Install the Figma Plugin

1. Open Figma Desktop → **Plugins** → **Development** → **Import plugin from manifest...**
2. Select `plugin/manifest.json` from this skill directory
3. The plugin "Craw Figma Connector" now appears in your plugins

#### Start the local connector

```bash
node scripts/figma_connector.js
# → Listening on ws://localhost:9199
# → HTTP health check on :9200
```

#### Run the plugin

4. In Figma Desktop: right-click canvas → **Plugins** → **Craw Figma Connector**
5. A panel opens showing **Connected to Craw** when the WebSocket connects

### 4. Send commands

```bash
# List current selection
node scripts/figma_send.js getSelection

# Create a rectangle
node scripts/figma_send.js createRectangle \
  --payload '{"x":100,"y":100,"width":400,"height":300,"fillColor":{"r":0.14,"g":0.49,"b":1},"cornerRadius":12,"name":"Hero Card"}'

# Create a frame
node scripts/figma_send.js createFrame \
  --payload '{"x":50,"y":50,"width":1440,"height":900,"name":"Desktop Canvas","fillColor":{"r":0.04,"g":0.04,"b":0.09}}'

# Add text
node scripts/figma_send.js createText \
  --payload '{"x":200,"y":200,"characters":"GET IN TOUCH","fontName":{"family":"Inter","style":"Bold"},"fontSize":64,"fillColor":{"r":1,"g":1,"b":1}}'

# Update a node
node scripts/figma_send.js updateNode \
  --payload '{"id":"1234:5678","x":300,"y":150,"name":"Updated Layer"}'

# Delete a node
node scripts/figma_send.js deleteNode \
  --payload '{"id":"1234:5678"}'

# Change fill color
node scripts/figma_send.js setFillColor \
  --payload '{"id":"1234:5678","color":{"r":0.14,"g":0.49,"b":1},"opacity":0.85}'

# Group selection
node scripts/figma_send.js groupSelection
```

## Available Commands (Write)

| Command | Description |
|---------|-------------|
| `createRectangle` | Create a rectangle with position, size, fill, corner radius |
| `createFrame` | Create a frame (canvas/artboard) |
| `createEllipse` | Create an ellipse/circle |
| `createText` | Create a text layer with font, size, content |
| `selectNode` | Select a node by ID and zoom into it |
| `updateNode` | Move, resize, or rename a node |
| `deleteNode` | Remove a node |
| `getSelection` | List selected nodes with position/size |
| `getPageInfo` | Get current page name, id, child count |
| `setFillColor` | Set fill color on any node |
| `groupSelection` | Group selected nodes into a frame group |

## Available Actions (Read — Figma REST API)

| Action | Description |
|--------|-------------|
| `get-file` | Get complete file document tree |
| `get-file-nodes` | Get specific nodes by ID |
| `get-styles` | List published styles (colors, text, effects) |
| `get-components` | List published components |
| `get-versions` | List file version history |
| `render-images` | Get temporary image URLs for nodes |
| `get-image-fills` | Get image fill URLs used in file |
| `get-metadata` | Get lightweight file metadata |
| `me` | Get current user info |

## Design Token Extraction

```bash
# Extract all colors and typography
node scripts/figma_client.mjs get-styles <file-key>

# Export frame as PNG @2x
node scripts/figma_client.mjs render-images <file-key> <node-id> --format png --scale 2
```

## Tips & Workflow

- Keep the connector (`figma_connector.js`) running in a terminal
- The plugin auto-reconnects if the connector restarts
- Pending commands are queued if the plugin is offline and sent when it reconnects
- For batches: send multiple `figma_send.js` calls sequentially

## Files

```
scripts/figma_connector.js    — Local WebSocket server (run this)
scripts/figma_send.js         — Send commands to Figma plugin
scripts/figma_client.mjs      — Read Figma via REST API
plugin/manifest.json          — Figma plugin manifest
plugin/code.ts                — Plugin main code
plugin/ui.html                — Plugin panel UI
```
