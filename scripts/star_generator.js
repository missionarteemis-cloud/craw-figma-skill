#!/usr/bin/env node
/**
 * Super Star Generator — Super Mario-style star with eyes
 * Uses Figma VectorNetwork with correct tangent API
 */

var http = require('http');
var CONNECTOR = process.env.FIGMA_CONNECTOR || 'http://localhost:9199';

var SIZE = 200;
var CX = 100; // Center X of star (in star-local coords)
var CY = 105; // Center Y (slightly shifted down for Mario proportions)
var OUTER_R = 90; // Outer radius (pointy bits)
var INNER_R = 48; // Inner radius (valleys) — 0.53 ratio = chunky Mario style

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

async function createStar() {
  console.log('⭐  Super Star Generator\n');

  // 10 vertices: 5 outer (points) + 5 inner (valleys)
  // Star points at: top, top-right, bottom-right, bottom-left, top-left
  var numPoints = 5;
  var vertices = [];
  var segments = [];

  for (var i = 0; i < numPoints * 2; i++) {
    var angle = (Math.PI * i) / numPoints - Math.PI / 2; // Start from top ( -PI/2 )
    var r = (i % 2 === 0) ? OUTER_R : INNER_R;
    var x = CX + r * Math.cos(angle);
    var y = CY + r * Math.sin(angle);
    vertices.push({ x: x, y: y });
  }

  // Connect vertices in order: 0→1→2→3→4→5→6→7→8→9→0
  for (var j = 0; j < vertices.length; j++) {
    segments.push({ start: j, end: (j + 1) % vertices.length });
  }

  // Regions for fill
  var loop = [];
  for (var k = 0; k < segments.length; k++) loop.push(k);
  var regions = [{ windingRule: "EVENODD", loops: [loop] }];

  console.log('Vertices:', vertices.length);
  console.log('Segments:', segments.length);

  // Position the star on canvas
  var starX = 100;
  var starY = 100;

  // ── Create star body ──
  console.log('Creating star body...');
  var result = await sendCommand('createVector', {
    name: '⭐ Star Body',
    x: starX,
    y: starY,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0.85, b: 0.1 }, opacity: 1 }],
    strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 0 } }],
    vertices: vertices,
    segments: segments,
    regions: regions,
    closed: true
  });

  if (!result || result.status !== 'ok' || !result.data || !result.data.id) {
    console.log('❌ Star body failed:', JSON.stringify(result));
    return;
  }

  var starId = result.data.id;
  console.log('✅ Star body at id=' + starId);

  // ── Style star ──
  await sleep(300);
  await sendCommand('setGradient', {
    id: starId,
    gradientType: 'RADIAL',
    stops: [
      { position: 0, color: { r: 1, g: 0.95, b: 0.4, a: 1 } },
      { position: 1, color: { r: 1, g: 0.75, b: 0.05, a: 1 } }
    ],
    transform: [[1, 0, 0], [0, 1, 0]]
  });
  console.log('  ✓ Gradient applied');

  await sleep(300);
  await sendCommand('updateNode', {
    id: starId,
    effects: [
      { type: 'DROP_SHADOW', blendMode: 'NORMAL', color: { r: 0, g: 0, b: 0, a: 0.35 }, offset: { x: 0, y: 6 }, radius: 14, visible: true }
    ]
  });
  console.log('  ✓ Shadow applied');

  // ── Eyes ──
  // Two white circles with black pupils
  var eyeSize = 24;
  var eyeY = CY - 10;
  var eyeOffsetX = 28;

  // Left eye
  await sleep(400);
  var eyeL = await sendCommand('createEllipse', {
    name: 'Eye L',
    x: starX + CX - eyeOffsetX - eyeSize / 2,
    y: starY + eyeY - eyeSize / 2,
    width: eyeSize,
    height: eyeSize,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
    strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 0.12 }, opacity: 1 }],
    strokeWeight: 1.5
  });

  if (eyeL && eyeL.status === 'ok' && eyeL.data && eyeL.data.id) {
    console.log('  ✓ Left eye at id=' + eyeL.data.id);

    // Left pupil
    await sleep(200);
    var pupilL = await sendCommand('createEllipse', {
      name: 'Pupil L',
      x: starX + CX - eyeOffsetX - 4,
      y: starY + eyeY - 4,
      width: 8,
      height: 8,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }]
    });
    if (pupilL && pupilL.status === 'ok') console.log('    ✓ Pupil L');
  }

  // Right eye
  await sleep(300);
  var eyeR = await sendCommand('createEllipse', {
    name: 'Eye R',
    x: starX + CX + eyeOffsetX - eyeSize / 2,
    y: starY + eyeY - eyeSize / 2,
    width: eyeSize,
    height: eyeSize,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
    strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 0.12 }, opacity: 1 }],
    strokeWeight: 1.5
  });

  if (eyeR && eyeR.status === 'ok' && eyeR.data && eyeR.data.id) {
    console.log('  ✓ Right eye at id=' + eyeR.data.id);

    // Right pupil
    await sleep(200);
    var pupilR = await sendCommand('createEllipse', {
      name: 'Pupil R',
      x: starX + CX + eyeOffsetX - 4,
      y: starY + eyeY - 4,
      width: 8,
      height: 8,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }]
    });
    if (pupilR && pupilR.status === 'ok') console.log('    ✓ Pupil R');
  }

  console.log('\n🎉 Super Star created! Check Figma.');
}

createStar().catch(function(err) {
  console.error('Fatal:', err.message);
  process.exit(1);
});
