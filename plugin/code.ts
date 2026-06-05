/// <reference types="@figma/plugin-typings" />

/**
 * Craw Figma Connector — Plugin Code
 *
 * Si connette via WebSocket a un connettore locale (ws://localhost:9199)
 * e ascolta comandi da Craw (via skill). Ogni comando viene eseguito
 * sull'API di Figma.
 */

declare const WebSocket: {
  new(url: string): WebSocket;
  OPEN: number;
  CONNECTING: number;
};
interface WebSocket {
  readyState: number;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  send(data: string): void;
  close(): void;
}

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
const WS_URL = "ws://localhost:9199";

function postUI(type: string, data: Record<string, unknown> = {}) {
  const msg: Record<string, unknown> = { type: type };
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      msg[key] = data[key];
    }
  }
  figma.ui.postMessage(msg);
}

type CommandHandler = (payload: any) => Promise<unknown>;

function hasFills(node: BaseNode): node is SceneNode & { fills: Paint[] } {
  return "fills" in node;
}

function hasResize(node: BaseNode): node is SceneNode & { resize(w: number, h: number): void } {
  return "resize" in node;
}

function hasPosition(node: BaseNode): node is SceneNode & { x: number; y: number } {
  return "x" in node && "y" in node;
}

// ── Comandi disponibili ────────────────────────────────────────────

const commands: Record<string, CommandHandler> = {
  createRectangle: async (p) => {
    const rect = figma.createRectangle();
    rect.x = p.x ?? 0;
    rect.y = p.y ?? 0;
    rect.resize(p.width ?? 200, p.height ?? 100);
    if (p.cornerRadius) rect.cornerRadius = p.cornerRadius;
    if (p.fillColor) rect.fills = [{ type: "SOLID", color: p.fillColor, opacity: p.opacity ?? 1 } as SolidPaint];
    if (p.strokeColor) rect.strokes = [{ type: "SOLID", color: p.strokeColor } as SolidPaint];
    if (p.strokeWeight) rect.strokeWeight = p.strokeWeight;
    if (p.name) rect.name = p.name;
    figma.currentPage.appendChild(rect);
    return { id: rect.id, name: rect.name, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  },

  createFrame: async (p) => {
    const frame = figma.createFrame();
    frame.x = p.x ?? 0;
    frame.y = p.y ?? 0;
    frame.resize(p.width ?? 400, p.height ?? 300);
    if (p.fillColor) frame.fills = [{ type: "SOLID", color: p.fillColor, opacity: p.opacity ?? 0 } as SolidPaint];
    if (p.name) frame.name = p.name;
    figma.currentPage.appendChild(frame);
    return { id: frame.id, name: frame.name };
  },

  createEllipse: async (p) => {
    const ell = figma.createEllipse();
    ell.x = p.x ?? 0;
    ell.y = p.y ?? 0;
    ell.resize(p.width ?? 100, p.height ?? 100);
    if (p.fillColor) ell.fills = [{ type: "SOLID", color: p.fillColor } as SolidPaint];
    if (p.name) ell.name = p.name;
    figma.currentPage.appendChild(ell);
    return { id: ell.id, name: ell.name };
  },

  createText: async (p) => {
    const text = figma.createText();
    text.x = p.x ?? 0;
    text.y = p.y ?? 0;
    if (p.name) text.name = p.name;
    if (p.characters !== undefined) text.characters = p.characters;
    if (p.fontSize) text.fontSize = p.fontSize;
    if (p.fillColor) text.fills = [{ type: "SOLID", color: p.fillColor } as SolidPaint];
    if (p.textAlignHorizontal) text.textAlignHorizontal = p.textAlignHorizontal;
    // Load font first
    const defaultFont: FontName = { family: "Inter", style: "Regular" };
    await figma.loadFontAsync(defaultFont);
    if (p.characters !== undefined) text.characters = p.characters;
    if (p.fontName && typeof p.fontName === "object" && (p.fontName as FontName).family) {
      text.fontName = p.fontName as FontName;
    }
    figma.currentPage.appendChild(text);
    return { id: text.id, name: text.name };
  },

  selectNode: async (p) => {
    if (p.id) {
      const node = figma.getNodeById(p.id);
      if (node && "id" in node) {
        const sn = node as SceneNode;
        figma.currentPage.selection = [sn];
        figma.viewport.scrollAndZoomIntoView([sn]);
        return { found: true };
      }
    }
    return { found: false };
  },

  updateNode: async (p) => {
    const node = figma.getNodeById(p.id) as SceneNode;
    if (!node) throw new Error(`Node not found: ${p.id}`);
    if (p.x !== undefined && hasPosition(node)) node.x = p.x;
    if (p.y !== undefined && hasPosition(node)) node.y = p.y;
    if (p.resize && hasResize(node)) node.resize(p.resize.width, p.resize.height);
    if (p.fillColor && hasFills(node)) node.fills = [{ type: "SOLID", color: p.fillColor } as SolidPaint];
    if (p.name) node.name = p.name;
    return { id: node.id, name: node.name, updated: true };
  },

  deleteNode: async (p) => {
    if (p.id) {
      const node = figma.getNodeById(p.id);
      if (node) { node.remove(); return { deleted: true, id: p.id }; }
    }
    return { deleted: false };
  },

  getSelection: async () => {
    return figma.currentPage.selection.map(n => ({
      id: n.id, name: n.name, type: n.type,
      x: "x" in n ? (n as any).x : undefined,
      y: "y" in n ? (n as any).y : undefined,
      width: "width" in n ? (n as any).width : undefined,
      height: "height" in n ? (n as any).height : undefined,
    }));
  },

  getPageInfo: async () => {
    return {
      name: figma.currentPage.name,
      id: figma.currentPage.id,
      childCount: figma.currentPage.children.length,
    };
  },

  setFillColor: async (p) => {
    const node = figma.getNodeById(p.id) as SceneNode;
    if (!node || !hasFills(node)) throw new Error(`Node not found or no fills: ${p.id}`);
    node.fills = [{ type: "SOLID", color: p.color, opacity: p.opacity ?? 1 } as SolidPaint];
    return { id: node.id, fillSet: true };
  },

  groupSelection: async () => {
    const sel = figma.currentPage.selection;
    if (sel.length < 2) throw new Error("Select at least 2 nodes");
    const group = figma.group(sel, figma.currentPage);
    return { id: group.id, name: group.name };
  },
};

// ── WebSocket connection ────────────────────────────────────────────

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    postUI("status", { connected: false });
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    postUI("status", { connected: true });
    postUI("log", { text: "Connected to Craw connector", level: "" });
  };
  ws.onmessage = async (event) => {
    let msg: { id: string; command: string; payload?: any };
    try {
      msg = JSON.parse(event.data);
    } catch { return; }
    const { id, command, payload = {} } = msg;
    postUI("log", { text: `Exec: ${command}`, level: "cmd" });
    try {
      const handler = commands[command];
      if (!handler) throw new Error(`Unknown command: ${command}`);
      const result = await handler(payload);
      ws?.send(JSON.stringify({ id, status: "ok", result }));
      postUI("log", { text: `Done: ${command}`, level: "done" });
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : String(err);
      ws?.send(JSON.stringify({ id, status: "error", error: msg2 }));
      postUI("log", { text: `Error: ${command} — ${msg2}`, level: "err" });
    }
  };
  ws.onclose = () => {
    postUI("status", { connected: false });
    postUI("log", { text: "Disconnected", level: "err" });
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    postUI("status", { connected: false });
    ws?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000) as unknown as number;
}

// ── Plugin lifecycle ─────────────────────────────────────────────────

figma.showUI(__html__, { width: 280, height: 400 });

figma.skipInvisibleInstanceChildren = true;

figma.ui.onmessage = (msg) => {
  if ((msg as any).type === "ready") {
    connect();
  }
};
