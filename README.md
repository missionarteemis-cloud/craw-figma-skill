# Craw Figma Skill

Bidirectional Figma integration for AI agents. Read and analyze designs via the Figma REST API; create and modify layers in real time via a local WebSocket connector + Figma plugin.

## Features

- **Read** — Extract file structure, components, styles, colors, typography, versions
- **Write** — Create rectangles, frames, ellipses, text layers; move, resize, rename, recolor, delete, group
- **Real-time** — Changes appear instantly in your Figma Desktop
- **Local-first** — No cloud services, no paid subscriptions. Everything runs on your machine
- **Queue-safe** — Commands are queued when the plugin is offline and sent on reconnect

## How it works

```
┌─────────────┐   WebSocket    ┌──────────────────┐   Plugin API   ┌──────────────┐
│  Craw/Agent  │ ─────────────→ │ figma_connector   │ ─────────────→ │  Figma       │
│  (AI)        │ ←───────────── │ (localhost:9199)   │ ←───────────── │  Desktop     │
└─────────────┘                └──────────────────┘                └──────────────┘
     │                                                                │
     │  REST API                                                      │
     └───────────────────────────────────────────────────────────────→ │
                                                                      │
```

## Requirements

- **Figma Desktop** (required for write operations)
- **Node.js 18+**
- **Figma Personal Access Token** (for read operations)
  - Generate at: Figma → Settings → Account → Personal Access Tokens

## Quick Start

### 1. Install

```bash
git clone https://github.com/missionarteemis-cloud/craw-figma-skill.git
cd craw-figma-skill
```

### 2. Set your Figma token

```bash
export FIGMA_ACCESS_TOKEN="figd_your_token_here"
```

### 3. Read a file

```bash
node scripts/figma_client.mjs get-file YOUR_FILE_KEY
```

### 4. Install the Figma Plugin (for write support)

1. Open Figma Desktop → **Plugins** → **Development** → **Import plugin from manifest...**
2. Select `plugin/manifest.json`
3. The plugin "Craw Figma Connector" appears in your plugins list

### 5. Start the connector + plugin

```bash
# Terminal 1: Start the local WebSocket server
node scripts/figma_connector.js

# Figma: Right-click canvas → Plugins → Craw Figma Connector
# The panel should show "Connected to Craw"
```

### 6. Send a command

```bash
node scripts/figma_send.js createRectangle --payload '{"x":100,"y":100,"width":400,"height":300,"fillColor":{"r":0.14,"g":0.49,"b":1},"cornerRadius":12,"name":"Blue Card"}'
```

## All Commands

### Read (REST API)

| Command | Description |
|---------|-------------|
| `get-file <key> [--depth N]` | Full file document tree |
| `get-file-nodes <key> <id>...` | Specific nodes by ID |
| `get-styles <key>` | Published color, text, effect styles |
| `get-components <key>` | Published components |
| `get-versions <key>` | Version history |
| `render-images <key> <id> [--format png|svg|pdf] [--scale N]` | Export as images |
| `get-image-fills <key>` | Image fill URLs |
| `get-metadata <key>` | Lightweight metadata |
| `me` | Current authenticated user |

### Write (Plugin)

| Command | Payload | Description |
|---------|---------|-------------|
| `createRectangle` | `{x, y, width, height, fillColor, cornerRadius, name}` | New rectangle |
| `createFrame` | `{x, y, width, height, fillColor, name}` | New frame/artboard |
| `createEllipse` | `{x, y, width, height, fillColor, name}` | New ellipse |
| `createText` | `{x, y, characters, fontSize, fontName, fillColor, name}` | New text layer |
| `selectNode` | `{id}` | Select + zoom to node |
| `updateNode` | `{id, x?, y?, resize?, fillColor?, name?}` | Modify existing node |
| `deleteNode` | `{id}` | Remove node |
| `getSelection` | — | List selected nodes |
| `getPageInfo` | — | Current page info |
| `setFillColor` | `{id, color, opacity}` | Set fill on any node |
| `groupSelection` | — | Group selected |

## Tips

- Keep `figma_connector.js` running in a terminal while working
- The plugin auto-reconnects if the connector restarts
- Commands sent while the plugin is offline are queued and sent on reconnect
- Health check at `http://localhost:9200`

## Repository

This skill is also available as an OpenClaw skill on [ClawHub](https://clawhub.ai).

## License

MIT
