#!/usr/bin/env node
/**
 * Auto Layout Module — Intelligent layout system for Figma shapes
 *
 * Defines a modular spacing system based on multiples of 8.
 * Can apply Auto Layout to existing frames or create new ones.
 *
 * Refactoring UI principles:
 * - Start with abundant space, then reduce if needed
 * - Modular spacing system (8, 16, 24, 32, 40, 64, 80)
 * - Alignment: MIN (start), MAX (end), CENTER
 * - Sizing: FIXED, HUG, FILL
 *
 * Usage:
 *   node auto_layout.js create <name> [options]
 *   node auto_layout.js apply <frameId> [options]
 *
 * Options JSON:
 *   {
 *     "direction": "HORIZONTAL" | "VERTICAL",
 *     "padding": 24,           // uniform padding
 *     "paddingTop": 24,        // per-side override
 *     "paddingRight": 24,
 *     "paddingBottom": 24,
 *     "paddingLeft": 24,
 *     "itemSpacing": 16,       // gap between items
 *     "alignment": "MIN",      // MIN | MAX | CENTER | SPACE_BETWEEN
 *     "crossAlignment": "MIN", // MIN | MAX | CENTER | STRETCH
 *     "sizing": "HUG",         // HUG | FILL | FIXED
 *     "cornerRadius": 12,
 *     "fillColor": {r,g,b}
 *   }
 */

var http = require('http');
var CONNECTOR = process.env.FIGMA_CONNECTOR || 'http://localhost:9199';

// ── Spacing System (multiples of 8) ──
var SPACING = {
  xxs:  4,
  xs:   8,
  sm:   12,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  40,
  xxxl: 64,
  huge: 80,
  // Semantic aliases
  tight:   8,
  compact: 16,
  comfortable: 24,
  relaxed: 32,
  generous: 40,
  abundant: 64,
};

// ── Figma Auto Layout constants ──
var LAYOUT_MODE = {
  HORIZONTAL: 'HORIZONTAL',
  VERTICAL: 'VERTICAL',
  NONE: 'NONE',
};

var SIZING_MODE = {
  FIXED: 'FIXED',
  HUG: 'HUG',
  FILL: 'FILL',
};

var ALIGN_ITEMS = {
  MIN: 'MIN',
  MAX: 'MAX',
  CENTER: 'CENTER',
  STRETCH: 'STRETCH',
  SPACE_BETWEEN: 'SPACE_BETWEEN',
};

// ── Helper ──

function sendCommand(command, payload) {
  return new Promise(function(resolve, reject) {
    var msgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var body = JSON.stringify({ id: msgId, command: command, payload: payload });
    var opts = {
      hostname: 'localhost', port: 9199, path: '/send-command',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    var req = http.request(opts, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); } catch(e) { resolve({ status: 'ok', data: { raw: data } }); }
      });
    });
    req.on('error', function(err) { reject(err); });
    req.write(body);
    req.end();
  });
}

// ── Public API ──

/**
 * Build a payload for creating a new Frame with Auto Layout.
 *
 * @param {string} name - Frame name
 * @param {Object} options
 * @param {string} options.direction - 'HORIZONTAL' | 'VERTICAL' | 'NONE'
 * @param {number|Object} options.padding - Uniform padding or {top,right,bottom,left}
 * @param {number} options.itemSpacing - Gap between children
 * @param {string} options.alignment - Main axis alignment
 * @param {string} options.crossAlignment - Cross axis alignment
 * @param {string} options.sizing - 'HUG' | 'FILL' | 'FIXED'
 * @param {number} options.width - Frame width (for FIXED)
 * @param {number} options.height - Frame height (for FIXED)
 * @param {number} options.cornerRadius
 * @param {Object} options.fillColor
 * @returns {Object} figma_send.js command payload
 */
function createAutoLayoutFrame(name, options) {
  options = options || {};
  var padding = resolvePadding(options.padding);

  return {
    command: 'createFrame',
    payload: {
      x: options.x || 100,
      y: options.y || 100,
      width: options.width || 400,
      height: options.height || 400,
      fillColor: options.fillColor || { r: 0.04, g: 0.06, b: 0.09 }, // #0A0F18
      name: name || 'Auto Layout Frame',
      cornerRadius: options.cornerRadius || 12,
      // Auto Layout properties that the plugin must set
      layoutMode: LAYOUT_MODE[options.direction] || LAYOUT_MODE.VERTICAL,
      primaryAxisSizingMode: SIZING_MODE[options.sizing] || SIZING_MODE.HUG,
      counterAxisSizingMode: SIZING_MODE[options.crossSizing] || SIZING_MODE.HUG,
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      itemSpacing: options.itemSpacing != null ? options.itemSpacing : SPACING.md,
      primaryAxisAlignItems: ALIGN_ITEMS[options.alignment] || ALIGN_ITEMS.MIN,
      counterAxisAlignItems: ALIGN_ITEMS[options.crossAlignment] || ALIGN_ITEMS.MIN,
    },
  };
}

/**
 * Build a payload for applying Auto Layout to an existing frame.
 *
 * @param {string} frameId - Existing frame node ID
 * @param {Object} options - Same options as createAutoLayoutFrame
 * @returns {Object} figma_send.js command payload
 */
function applyAutoLayout(frameId, options) {
  options = options || {};
  var padding = resolvePadding(options.padding);

  return {
    command: 'updateNode',
    payload: {
      id: frameId,
      // Auto Layout properties
      layoutMode: LAYOUT_MODE[options.direction] || LAYOUT_MODE.VERTICAL,
      primaryAxisSizingMode: SIZING_MODE[options.sizing] || SIZING_MODE.HUG,
      counterAxisSizingMode: SIZING_MODE[options.crossSizing] || SIZING_MODE.HUG,
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      itemSpacing: options.itemSpacing != null ? options.itemSpacing : SPACING.md,
      primaryAxisAlignItems: ALIGN_ITEMS[options.alignment] || ALIGN_ITEMS.MIN,
      counterAxisAlignItems: ALIGN_ITEMS[options.crossAlignment] || ALIGN_ITEMS.MIN,
    },
  };
}

/**
 * Resolve padding from various formats.
 */
function resolvePadding(padding) {
  if (padding == null) {
    return { top: SPACING.lg, right: SPACING.lg, bottom: SPACING.lg, left: SPACING.lg };
  }
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  // Object format
  return {
    top: padding.top != null ? padding.top : SPACING.lg,
    right: padding.right != null ? padding.right : SPACING.lg,
    bottom: padding.bottom != null ? padding.bottom : SPACING.lg,
    left: padding.left != null ? padding.left : SPACING.lg,
  };
}

/**
 * Create a card component with proper Auto Layout.
 * Quick builder for common UI patterns.
 */
function createCard(options) {
  options = options || {};
  return createAutoLayoutFrame(options.name || 'Card', {
    x: options.x || 100,
    y: options.y || 100,
    width: options.width || 320,
    height: options.height || 400,
    direction: 'VERTICAL',
    padding: options.padding || SPACING.lg,
    itemSpacing: options.itemSpacing || SPACING.md,
    alignment: 'MIN',
    crossAlignment: 'STRETCH',
    sizing: 'FIXED',
    cornerRadius: options.cornerRadius || 16,
    fillColor: options.fillColor || { r: 0.09, g: 0.13, b: 0.20 }, // surface #172233
  });
}

/**
 * Create a row (HORIZONTAL) with items.
 */
function createRow(options) {
  options = options || {};
  return createAutoLayoutFrame(options.name || 'Row', {
    x: options.x || 100,
    y: options.y || 100,
    direction: 'HORIZONTAL',
    padding: options.padding || SPACING.sm,
    itemSpacing: options.itemSpacing || SPACING.sm,
    alignment: 'MIN',
    crossAlignment: 'CENTER',
    sizing: 'HUG',
    cornerRadius: options.cornerRadius || 0,
    fillColor: options.fillColor || null,
  });
}

/**
 * Create a column (VERTICAL) with items.
 */
function createColumn(options) {
  options = options || {};
  return createAutoLayoutFrame(options.name || 'Column', {
    x: options.x || 100,
    y: options.y || 100,
    direction: 'VERTICAL',
    padding: options.padding || SPACING.sm,
    itemSpacing: options.itemSpacing || SPACING.sm,
    alignment: 'MIN',
    crossAlignment: 'STRETCH',
    sizing: 'HUG',
    cornerRadius: options.cornerRadius || 0,
    fillColor: options.fillColor || null,
  });
}

/**
 * Create a button with HORIZONTAL auto layout and padding.
 */
function createButton(options) {
  options = options || {};
  return createAutoLayoutFrame(options.name || 'Button', {
    x: options.x || 100,
    y: options.y || 100,
    width: options.width || 120,
    direction: 'HORIZONTAL',
    padding: { top: 12, right: 24, bottom: 12, left: 24 },
    itemSpacing: 8,
    alignment: 'CENTER',
    crossAlignment: 'CENTER',
    sizing: 'HUG',
    cornerRadius: options.cornerRadius || 8,
    fillColor: options.fillColor || { r: 0.14, g: 0.49, b: 1.00 }, // accent #247DFF
  });
}

// ── CLI ──

function main() {
  var command = process.argv[2] || 'help';

  switch (command) {
    case 'create':
      var name = process.argv[3] || 'Auto Layout Frame';
      var opts = {};
      if (process.argv[4]) {
        try { opts = JSON.parse(process.argv[4]); } catch(e) { /* ignore */ }
      }
      var payload = createAutoLayoutFrame(name, opts);
      console.log(JSON.stringify(payload, null, 2));
      break;

    case 'card':
      var opts = {};
      if (process.argv[3]) {
        try { opts = JSON.parse(process.argv[3]); } catch(e) { /* ignore */ }
      }
      console.log(JSON.stringify(createCard(opts), null, 2));
      break;

    case 'row':
    case 'column':
    case 'button':
      var opts = {};
      if (process.argv[3]) {
        try { opts = JSON.parse(process.argv[3]); } catch(e) { /* ignore */ }
      }
      var fn = command === 'row' ? createRow : (command === 'column' ? createColumn : createButton);
      console.log(JSON.stringify(fn(opts), null, 2));
      break;

    default:
      console.log('\nAuto Layout Module — Figma Auto Layout generator\n');
      console.log('Usage:');
      console.log('  node auto_layout.js create <name> [optionsJSON]');
      console.log('  node auto_layout.js card [optionsJSON]');
      console.log('  node auto_layout.js row [optionsJSON]');
      console.log('  node auto_layout.js column [optionsJSON]');
      console.log('  node auto_layout.js button [optionsJSON]\n');
      console.log('Spacing constants:');
      console.log('  xxs:4, xs:8, sm:12, md:16, lg:24, xl:32, xxl:40, xxxl:64, huge:80');
      console.log('  Semantic: tight, compact, comfortable, relaxed, generous, abundant\n');
      console.log('Options JSON:');
      console.log('  {"direction":"VERTICAL","padding":24,"itemSpacing":16,');
      console.log('   "alignment":"CENTER","crossAlignment":"MIN",');
      console.log('   "sizing":"HUG","cornerRadius":12}');
      break;
  }
}

if (require.main === module) { main(); }

// ── Exports for design_engine.js ──
module.exports = {
  SPACING: SPACING,
  LAYOUT_MODE: LAYOUT_MODE,
  SIZING_MODE: SIZING_MODE,
  ALIGN_ITEMS: ALIGN_ITEMS,
  createAutoLayoutFrame: createAutoLayoutFrame,
  applyAutoLayout: applyAutoLayout,
  createCard: createCard,
  createRow: createRow,
  createColumn: createColumn,
  createButton: createButton,
};
