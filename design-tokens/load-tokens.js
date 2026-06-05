#!/usr/bin/env node
/**
 * Design Tokens Loader
 * 
 * Loads the base design system + optional project overrides.
 * Output: flat dictionary of resolved tokens.
 * 
 * Usage:
 *   node load-tokens.js                        # base only
 *   node load-tokens.js --project drs-lab      # base + DR's Lab overrides
 *   node load-tokens.js --project based-planet  # base + Based Planet
 */

var fs = require('fs');
var path = require('path');

var BASE_DIR = path.dirname(require.main.filename);
var TOKENS_FILE = path.join(BASE_DIR, 'design-tokens.json');

function flatKeys(obj, prefix) {
  var result = {};
  prefix = prefix || '';
  for (var key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    var v = obj[key];
    var fullKey = prefix + key;
    if (v && typeof v === 'object' && !v.$value && !v.$type && !Array.isArray(v)) {
      var nested = flatKeys(v, fullKey + '.');
      for (var nk in nested) result[nk] = nested[nk];
    } else {
      result[fullKey] = v;
    }
  }
  return result;
}

function load() {
  var args = process.argv.slice(2);
  var projectIdx = args.indexOf('--project');
  var projectName = projectIdx !== -1 ? args[projectIdx + 1] : null;

  // Load base
  var base = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));

  // If project specified, load and merge overrides
  var projectOverrides = {};
  if (projectName) {
    var projectFile = path.join(BASE_DIR, 'projects', projectName + '.json');
    if (!fs.existsSync(projectFile)) {
      console.error('❌ Project "' + projectName + '" not found at ' + projectFile);
      console.error('   Available: ' + fs.readdirSync(path.join(BASE_DIR, 'projects')).join(', '));
      process.exit(1);
    }
    projectOverrides = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
    delete projectOverrides[projectName]; // Remove wrapper object
    delete projectOverrides.$extensions;
    delete projectOverrides.$description;
    console.log('📦 Loaded base + project: ' + projectName);
  } else {
    console.log('📦 Loaded base design system');
  }

  // Deep merge: project overrides win over base
  function deepMerge(target, source) {
    for (var key in source) {
      if (!source.hasOwnProperty(key)) continue;
      if (source[key] && typeof source[key] === 'object' && !source[key].$value && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  deepMerge(base, projectOverrides);

  // Flatten for easy access
  var flat = flatKeys(base);
  console.log('   Tokens: ' + Object.keys(flat).length);

  if (args.indexOf('--json') !== -1) {
    console.log(JSON.stringify(flat, null, 2));
  }

  return flat;
}

// Run
load();
