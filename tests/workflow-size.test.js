'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = require('../workflow/lib/runtime');
const dependencies = require('../workflow/lib/runtime-dependencies.json');
const { bundleRuntime, helperNames } = require('../scripts/bundle-runtime');

const filename = path.join(__dirname, '../workflow/competitor-research-agent.json');
const exported = fs.readFileSync(filename);
const workflow = JSON.parse(exported.toString('utf8'));
const node = name => {
  const found = workflow.nodes.find(candidate => candidate.name === name);
  assert.ok(found, 'Missing node: ' + name);
  return found;
};

test('workflow export stays below 500 KB without pinned data', () => {
  assert.ok(exported.byteLength < 500_000, 'Workflow is ' + exported.byteLength + ' bytes; expected less than 500,000');
  assert.equal(Object.hasOwn(workflow, 'pinData'), false);
  assert.equal(workflow.active, false);
});

test('runtime linker rejects unknown helpers and deduplicates dependency closures', () => {
  assert.throws(() => bundleRuntime('unknownHelper', 'return [];'), /Unknown runtime helper/);
  assert.deepEqual(Object.keys(dependencies).sort(), Object.keys(runtime).sort(), 'Every exported helper has an explicit dependency declaration');
  for (const name of Object.keys(runtime)) assert.ok(helperNames(name).includes(name));
  const names = helperNames(['captureSearch', 'captureSearch']);
  assert.equal(names.length, new Set(names).size);
  assert.ok(names.includes('captureSearch'));
  assert.ok(names.includes('normalizeSearch'));
  assert.ok(names.includes('clone'));
  assert.equal(names.includes('readModel'), false);
  assert.equal(names.includes('renderReport'), false);
  const code = bundleRuntime('normalize', 'return normalize($json, "fixture");');
  assert.match(code, /function normalize\(/);
  assert.match(code, /function str\(/);
  assert.doesNotMatch(code, /function (?:prepare|readModel|normalizeSearch|renderReport)\(/);
});

test('exported Code nodes embed only relevant helper families', () => {
  for (const current of workflow.nodes.filter(candidate => candidate.type === 'n8n-nodes-base.code')) {
    assert.match(current.parameters.jsCode, /^\/\/ Included helpers:/, current.name);
    assert.doesNotMatch(current.parameters.jsCode, /function finish\(/, current.name + ' contains the generic all-role dispatcher');
    assert.doesNotMatch(current.parameters.jsCode, /function prepare\(/, current.name + ' contains the generic all-role prompt builder');
  }
  for (const current of workflow.nodes.filter(candidate => /^(?:Parse:|Capture repair:)/.test(candidate.name))) {
    assert.match(current.parameters.jsCode, /function schemaErrors\(/);
    assert.doesNotMatch(current.parameters.jsCode, /function (?:renderReport|normalizeSearch|groundProfile)\(/);
  }
  for (const current of workflow.nodes.filter(candidate => /^(?:Evidence:|Retry evidence:)/.test(candidate.name))) {
    assert.match(current.parameters.jsCode, /function normalizeSearch\(/);
    assert.doesNotMatch(current.parameters.jsCode, /function (?:readModel|renderReport)\(/);
  }
  assert.doesNotMatch(node('State: Orchestrator').parameters.jsCode, /function (?:renderReport|groundProfile|normalizeSearch)\(/);
  assert.doesNotMatch(node('State: Synthesis').parameters.jsCode, /function (?:normalizeSearch|readModel)\(/);
});

test('simple search query preparation uses native Edit Fields preserving state', () => {
  const queries = workflow.nodes.filter(candidate => candidate.name.startsWith('Query: ') || candidate.name === 'Retry query: Discovery');
  assert.equal(queries.length, 7);
  for (const current of queries) {
    assert.equal(current.type, 'n8n-nodes-base.set');
    assert.equal(current.typeVersion, 3.4);
    assert.equal(current.parameters.includeOtherFields, true);
    assert.deepEqual(current.parameters.assignments.assignments.map(assignment => assignment.name), ['active_query']);
  }
  // Execute the actual native assignment expression against the former helper contract.
  const assignment = node('Query: Official Features').parameters.assignments.assignments[0].value;
  for (const value of [undefined, null, 7, '', '  alpha  beta\\n gamma  ', 'word '.repeat(100), 'x'.repeat(600)]) {
    const actual = vm.runInNewContext('('+assignment.slice(3,-2)+')', { $json: { queries: { official: value } } });
    assert.equal(actual, runtime.searchQuery(value));
  }
  assert.equal(workflow.nodes.some(candidate => candidate.name.startsWith('Search result: ')), false);
});
