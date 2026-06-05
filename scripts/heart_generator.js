#!/usr/bin/env node
/**
 * Heart Generator v2 — Figma VectorNetwork with correct API
 *
 * Figma VectorNetwork structure:
 *  - vertices: [{x, y}]
 *  - segments: [{start, end, tangentStart?, tangentEnd?}]
 *  - regions: [{windingRule, loops: [[segmentIndexes]]}]
 *
 * Tangents are RELATIVE to the endpoint vertex.
 */

var http = require('http');
var CONNECTOR = process.env.FIGMA_CONNECTOR || 'http://localhost:9199';

var SIZE = 200;
var S = SIZE / 100; // scale factor from base 100px to target size

function sendCommand(command, payload) {
  return new Promise(function(resolve, reject) {
    var msgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var body = JSON.stringify({ id: msgId, command: command, payload: payload });

    var options = {
      hostname: 'localhost',
      port: 9199,
      path: '/send-command',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };

    var req = http.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ status: 'ok', data: { raw: data } }); }
      });
    });

    req.on('error', function(err) { reject(err); });
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function main() {
  console.log('❤️  Heart Gen v2 — Figma VectorNetwork\n');

  // ── Heart shape: standard SVG path ──
  // Base coords at 100px viewBox:
  // M 50,18  C 35,0  0,15  0,42  C 0,65  25,82  50,98  C 75,82  100,65  100,42  C 100,15  65,0  50,18  Z
  //
  // In Figma VectorNetwork, tangents are RELATIVE offsets from the endpoint.
  // For a cubic bezier: "C cx1,cy1 cx2,cy2 x,y"
  //   - tangentEnd on segment (vertex i → i+1) is the handle at the END vertex
  //   - tangentStart on segment (vertex i → i+1) is the handle at the START vertex
  //
  // Break the heart into 4 cubic curves + close:

  var x = [50*S, 0*S, 50*S, 100*S, 50*S]; // Vertex x coords
  var y = [18*S, 42*S, 98*S, 42*S, 18*S]; // Vertex y coords

  // Segment 0: vertex 0 → 1  (C 35,0  0,15  0,42)
  //   Start handle (at vertex 0): relative offset (35-50=-15, 0-18=-18)
  //   End handle (at vertex 1): relative offset (0-0=0, 15-42=-27)
  //   Wait — in Figma the tangent is the control point POSITION relative to endpoint.
  //   Actually: tangentStart/End = {dx, dy} where the handle POINT is vertex + tangent.
  //   For C cx1,cy1 and endpoint at x,y: the tangent at start is cx1 - v0.x, cy1 - v0.y
  //   For endpoint at x_end,y_end with cx2,cy2: the tangent at end is cx2 - x_end, cy2 - y_end

  // Segment 0: v0(50,18) → v1(0,42), controls (35,0) and (0,15)
  //   tangentStart = handle from v0: (35-50, 0-18) = (-15, -18)
  //   tangentEnd = handle to v1: (0-0, 15-42) = (0, -27)
  var seg0_tS = {x: (35-50)*S, y: (0-18)*S};   // (-15S, -18S)
  var seg0_tE = {x: (0-0)*S, y: (15-42)*S};     // (0, -27S)

  // Segment 1: v1(0,42) → v2(50,98), controls (0,65) and (25,82)
  var seg1_tS = {x: (0-0)*S, y: (65-42)*S};     // (0, 23S)
  var seg1_tE = {x: (25-50)*S, y: (82-98)*S};   // (-25S, -16S)

  // Segment 2: v2(50,98) → v3(100,42), controls (75,82) and (100,65)
  var seg2_tS = {x: (75-50)*S, y: (82-98)*S};   // (25S, -16S)
  var seg2_tE = {x: (100-100)*S, y: (65-42)*S}; // (0, 23S)

  // Segment 3: v3(100,42) → v4(50,18), controls (100,15) and (65,0)
  var seg3_tS = {x: (100-100)*S, y: (15-42)*S}; // (0, -27S)
  var seg3_tE = {x: (65-50)*S, y: (0-18)*S};   // (15S, -18S)

  // Segment 4: v4(50,18) → v0(50,18) — close path with no tangents (straight)
  // Actually: no close needed, the last segment back to v0 completes the loop

  var vertices = x.map(function(xi, i) {
    return { x: xi, y: y[i] };
  });

  var segments = [
    { start: 0, end: 1, tangentStart: seg0_tS, tangentEnd: seg0_tE },
    { start: 1, end: 2, tangentStart: seg1_tS, tangentEnd: seg1_tE },
    { start: 2, end: 3, tangentStart: seg2_tS, tangentEnd: seg2_tE },
    { start: 3, end: 4, tangentStart: seg3_tS, tangentEnd: seg3_tE },
    // Close back to start — straight line (zero tangents = straight)
    { start: 4, end: 0 }
  ];

  var regions = [{ windingRule: "EVENODD", loops: [[0, 1, 2, 3, 4]] }];

  console.log('Vertices:', JSON.stringify(vertices));
  console.log('Segments count:', segments.length);

  // Position on canvas
  var cx = 50 * S;
  var cy = 50 * S;

  console.log('\nSending to Figma...');

  var result = await sendCommand('createVector', {
    name: '❤️ Heart v2',
    x: cx,
    y: cy,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0.12, b: 0.22 }, opacity: 1 }],
    strokes: [],
    vertices: vertices,
    segments: segments,
    regions: regions,
    closed: true
  });

  if (result && result.status === 'ok' && result.data && result.data.id) {
    console.log('✅ Created heart at id=' + result.data.id);

    // Gradient
    await sleep(300);
    await sendCommand('setGradient', {
      id: result.data.id,
      gradientType: 'LINEAR',
      stops: [
        { position: 0, color: { r: 1, g: 0.25, b: 0.35, a: 1 } },
        { position: 1, color: { r: 0.85, g: 0, b: 0.1, a: 1 } }
      ],
      transform: [[1, 0, 0], [0, 1, 0]]
    });
    console.log('  ✓ Gradient applied');

    // Shadow
    await sleep(300);
    await sendCommand('updateNode', {
      id: result.data.id,
      effects: [
        { type: 'DROP_SHADOW', blendMode: 'NORMAL', color: { r: 0, g: 0, b: 0, a: 0.3 }, offset: { x: 0, y: 6 }, radius: 16, visible: true }
      ]
    });
    console.log('  ✓ Shadow applied');
    console.log('\n🎉 Heart created! Check Figma.');
  } else {
    console.log('❌ Error:', JSON.stringify(result));
  }
}

main().catch(function(err) {
  console.error('Fatal:', err.message);
  process.exit(1);
});
