'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// OFFLINE GRAPH SIMULATION ONLY: actual exported Code-node JavaScript and expressions
// run in VM contexts. Gemini, MCP, browser interaction, and n8n scheduling are mocked.
// This does not claim live n8n import, credential, model, or form-browser validation.
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '../workflow/competitor-research-agent.json'), 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));
const item = json => ({ json: copy(json) });
const DISCOVERY = 'https://discovery.example.test/alternatives';
const HEALTHY = 'Recoverable Rival';
const BROKEN = 'Failed Rival';
const NOW = '2026-09-24T09:00:00.000Z';
const nodeByName = new Map(workflow.nodes.map(node => [node.name, node]));
const scripts = new Map();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return Date.parse(NOW); }
}

function simulate({ zero = false, decisions = [{ Decision: 'Approve' }], input = {} } = {}) {
  const history = new Map(), counts = new Map(), calls = [], pages = [], completions = [];
  const mergeBuffers = new Map(), loops = new Map();
  const queue = [{ name: 'N01 Research Request', items: [item({ target_company: 'Fixture Target', target_product: 'answer engine', ...input })], port: 0 }];
  let steps = 0, decisionIndex = 0;
  const latest = name => {
    const outputs = history.get(name)?.at(-1);
    assert.ok(outputs, `Expression references node before execution: ${name}`);
    return outputs[0] || [];
  };
  function context(items, name) {
    return {
      $input: { first: () => copy(items[0]), all: () => copy(items) },
      $json: copy(items[0]?.json || {}),
      $runIndex: history.get(name)?.length || 0,
      $: target => ({ first: () => copy(latest(target)[0]), all: () => copy(latest(target)) }),
      Date: FixedDate,
    };
  }
  function evaluate(expression, items, name) {
    assert.match(expression, /^=\{\{[\s\S]*\}\}$/);
    return new vm.Script('(' + expression.slice(3, -2).trim() + ')').runInNewContext(context(items, name), { timeout: 1000 });
  }
  function model(node, state) {
    const stage = state.llm.stage, isRepair = node.name.startsWith('Repair JSON:');
    calls.push({ kind: 'model', node: node.name, stage, competitor: state.competitor?.name, retry_count: state.retry_count, revision_count: state.revision_count, input: copy(state.llm.input), repair: isRepair });
    if (stage === 'extractor' && state.competitor.name === BROKEN) {
      return isRepair ? { error: 'Synthetic schema repair failure' } : { text: '{broken-json-from-Failed-Rival' };
    }
    if (stage === 'planner' && state.competitor.name === HEALTHY && !isRepair) return { text: 'Synthetic malformed planner completion' };
    let value;
    if (stage === 'orchestrator') value = { target_company: state.target_company, discovery_query: 'Fixture Target direct alternatives', research_dimensions: ['pricing', 'core_features', 'target_users', 'positioning', 'differentiators', 'recent_news'] };
    if (stage === 'discovery') value = { competitors: zero ? [] : [HEALTHY, BROKEN].map(name => ({ name, reason: 'Synthetic source describes direct competition.', evidence_urls: [DISCOVERY] })) };
    if (stage === 'planner') value = { competitor_name: state.competitor.name, queries: Object.fromEntries(['official', 'pricing', 'positioning', 'news'].map(dimension => [dimension, state.competitor.name + ' ' + dimension])) };
    if (stage === 'extractor') {
      const pricing = state.evidence.find(e => e.url.endsWith('/pricing'));
      const source = 'https://healthy.example.test/official';
      value = {
        competitor_name: state.competitor.name, official_site: source,
        pricing: pricing ? { summary: 'Fixture plan costs 12 units.', verified: true, source_urls: [pricing.url] } : { summary: 'Pricing not verified', verified: false, source_urls: [] },
        core_features: [{ claim: 'Fixture search feature.', source_urls: [source] }],
        target_users: [{ claim: 'Fixture professional audience.', source_urls: ['https://healthy.example.test/positioning'] }],
        positioning: { summary: 'Fixture research positioning.', source_urls: ['https://healthy.example.test/positioning'] },
        differentiators: [{ claim: 'Fixture feature difference.', source_urls: [source] }],
        recent_news: [{ summary: 'Fixture product release.', date: '2026-09-01', source_urls: ['https://healthy.example.test/news'] }],
        missing_fields: pricing ? [] : ['pricing'], all_source_urls: state.evidence.map(e => e.url),
      };
    }
    if (stage === 'validator') value = { validation_status: state.profile.missing_fields.length ? 'retry' : 'pass', unsupported_claims: [], conflicts: [], missing_important_fields: state.profile.missing_fields, retry_needed: state.profile.missing_fields.length > 0, retry_query: state.competitor.name + ' official pricing plans' };
    if (stage === 'synthesis' || stage === 'revision') {
      const marker = stage === 'revision' ? `REVISION-${state.revision_count}: ${state.feedback}` : 'INITIAL-DRAFT';
      value = { report_markdown: fixtureReport(state, marker) };
    }
    assert.ok(value, 'Unmocked stage ' + stage);
    return isRepair ? { output: value } : { text: JSON.stringify(value) };
  }
  function mcp(node, state, items) {
    const args = evaluate(node.parameters.jsonInput, items, node.name);
    assert.equal(typeof args.query, 'string');
    assert.ok(args.query.length <= 400);
    assert.equal(args.count, 6);
    const isDiscovery = node.name.startsWith('You.com: Discovery');
    const dimension = isDiscovery ? 'discovery' : node.name.includes('Targeted Retry') ? 'retry' : node.name.includes('Official Features') ? 'official' : node.name.includes('Pricing') ? 'pricing' : node.name.includes('Positioning') ? 'positioning' : 'news';
    calls.push({ kind: 'search', node: node.name, competitor: state.competitor?.name, retry_count: state.retry_count, dimension, query: args.query, transport: node.name.endsWith(' - transport retry') });
    if (zero && isDiscovery) return { content: [{ type: 'text', text: JSON.stringify({ results: { web: [], news: [] } }) }] };
    if (state.competitor?.name === BROKEN) return { isError: true, content: [{ type: 'text', text: 'Synthetic local tool outage' }] };
    if (dimension === 'pricing') return { content: [{ type: 'text', text: '{"results":{"web":[]}}' }] };
    const url = isDiscovery ? DISCOVERY : 'https://healthy.example.test/' + (dimension === 'retry' ? 'pricing' : dimension);
    return { content: [{ type: 'text', text: JSON.stringify({ results: { web: [{ url, title: 'Synthetic fixture only', snippets: ['Supplied synthetic facts for ' + dimension], published_at: '2026-09-01' }] } }) }] };
  }
  while (queue.length) {
    assert.ok(++steps <= 650, 'Graph exceeded bounded simulation step budget');
    const event = queue.shift(), node = nodeByName.get(event.name);
    assert.ok(node, 'Connection points to missing node ' + event.name);
    const { items } = event, state = items[0]?.json;
    let outputs;
    if (node.type === 'n8n-nodes-base.formTrigger') outputs = [items];
    else if (node.type === 'n8n-nodes-base.code') {
      if (!scripts.has(node.name)) scripts.set(node.name, new vm.Script('(function(){\n' + node.parameters.jsCode + '\n})()', { filename: node.name }));
      outputs = [copy(scripts.get(node.name).runInNewContext(context(items, node.name), { timeout: 1000 }))];
    } else if (node.type === 'n8n-nodes-base.if') {
      const condition = node.parameters.conditions.conditions[0];
      assert.equal(condition.operator.type, 'boolean');
      assert.equal(condition.operator.operation, 'true');
      const result = evaluate(condition.leftValue, items, node.name);
      assert.equal(typeof result, 'boolean', 'IF expression should resolve to boolean');
      outputs = result ? [items, []] : [[], items];
    } else if (node.type === '@n8n/n8n-nodes-langchain.chainLlm') {
      const text = evaluate(node.parameters.text, items, node.name);
      assert.equal(typeof text, 'string');
      assert.ok(text.length > 10);
      outputs = [[item(model(node, state))]];
    } else if (node.type === '@n8n/n8n-nodes-langchain.mcpClient') outputs = [[item(mcp(node, state, items))]];
    else if (node.type === 'n8n-nodes-base.splitOut') {
      assert.equal(node.parameters.include, 'allOtherFields');
      outputs = [items.flatMap(source => source.json[node.parameters.fieldToSplitOut].map(value => {
        const json = copy(source.json); delete json[node.parameters.fieldToSplitOut];
        json[node.parameters.options.destinationFieldName] = value; return item(json);
      }))];
    } else if (node.type === 'n8n-nodes-base.splitInBatches') {
      assert.equal(node.parameters.batchSize, 1);
      assert.equal(node.parameters.options.reset, false);
      let loop = loops.get(node.name);
      if (!loop) { loop = { remaining: copy(items), processed: [] }; loops.set(node.name, loop); }
      else loop.processed.push(...copy(items));
      outputs = loop.remaining.length ? [[], [loop.remaining.shift()]] : [loop.processed, []];
    } else if (node.type === 'n8n-nodes-base.merge') {
      assert.equal(node.parameters.mode, 'append');
      let ports = mergeBuffers.get(node.name);
      if (!ports) { ports = Array.from({ length: node.parameters.numberInputs }, () => []); mergeBuffers.set(node.name, ports); }
      ports[event.port].push(copy(items));
      if (ports.some(port => !port.length)) continue;
      outputs = [ports.flatMap(port => port.shift())];
    } else if (node.type === 'n8n-nodes-base.aggregate') {
      assert.equal(node.parameters.aggregate, 'aggregateAllItemData');
      outputs = [[item({ [node.parameters.destinationFieldName]: items.map(i => i.json) })]];
    } else if (node.type === 'n8n-nodes-base.form') {
      assert.equal(node.parameters.limitWaitTime, true);
      if (node.parameters.operation === 'page') {
        const fields = JSON.parse(evaluate(node.parameters.jsonOutput, items, node.name));
        assert.ok(fields.some(field => field.fieldName === 'Decision' && field.requiredField));
        pages.push({ state: copy(state), fields });
        const decision = decisions[decisionIndex++];
        assert.notEqual(decision, undefined, 'Unexpected additional human approval visit');
        // A wait timeout resumes saved input rather than submitting a Decision.
        outputs = decision === 'timeout' ? [items] : [[item({ ...decision, submittedAt: NOW, formMode: 'test' })]];
      } else {
        assert.equal(node.parameters.operation, 'completion');
        const html = evaluate(node.parameters.responseText, items, node.name);
        completions.push({ node: node.name, state: copy(state), html });
        outputs = [items];
      }
    } else assert.fail('Unexpected reachable main node type: ' + node.type);
    assert.ok(Array.isArray(outputs));
    counts.set(node.name, (counts.get(node.name) || 0) + 1);
    history.set(node.name, [...(history.get(node.name) || []), copy(outputs)]);
    outputs.forEach((branch, index) => {
      if (!branch.length) return;
      for (const connection of workflow.connections[node.name]?.main?.[index] || []) queue.push({ name: connection.node, port: connection.index, items: copy(branch) });
    });
  }
  for (const ports of mergeBuffers.values()) assert.ok(ports.every(port => port.length === 0), 'Unconsumed merge branch');
  assert.equal(completions.length, 1, 'Exactly one terminal form should display');
  return { state: completions[0].state, completion: completions[0], counts, calls, pages, history, steps };
}

function fixtureReport(state, marker) {
  const records = state.records || [];
  const sourceUrls = [...new Set(records.flatMap(record => [...record.competitor.evidence_urls, ...record.profile.all_source_urls]))];
  const citations = sourceUrls.map(url => '[fixture](<' + url + '>)').join(' ');
  return '# Competitive Intelligence Brief\n\n' + [
    ['Research Scope', 'Synthetic test of Fixture Target only.'],
    ['Executive Summary', marker + '\n' + sourceUrls.map(url => `[fixture](<${url}>)`).join(' ')],
    ['Competitor Comparison', (records.map(record => record.competitor.name).join(', ') || 'No verified competitors.') + '\n' + citations],
    ['Pricing', (records.map(record => record.profile.pricing.summary).join('\n') || 'Pricing not verified') + '\n' + citations],
    ['Core Features', 'Use only supplied fixture evidence. ' + citations],
    ['Positioning and Target Audience', 'Use only supplied fixture evidence. ' + citations],
    ['Key Differentiators', 'Use only supplied fixture evidence. ' + citations],
    ['Recent Developments', 'Use only supplied fixture evidence. ' + citations],
    // Deliberately incomplete model audit sections: the runtime must restore gaps.
    ['Evidence Gaps / Conflicts', 'The model has omitted the detailed audit gaps.'],
    ['Sources', sourceUrls.map(url => `[fixture](<${url}>)`).join('\n') || 'No sources.'],
  ].map(([heading, body]) => '## ' + heading + '\n' + body).join('\n\n');
}

test('offline exported graph: local failure, pricing recovery, schema repair, revision and approval', () => {
  const result = simulate({ decisions: [{ Decision: 'Request revision', Feedback: 'Make the executive summary clearer.' }, { Decision: 'Approve', draft_markdown: 'forged client replacement' }] });
  assert.equal(result.state.approval_status, 'approved');
  assert.equal(result.state.revision_count, 1);
  assert.equal(result.state.records.length, 2);
  const healthy = result.state.records.find(record => record.competitor.name === HEALTHY);
  const broken = result.state.records.find(record => record.competitor.name === BROKEN);
  assert.equal(healthy.retry_count, 1);
  assert.equal(healthy.profile.pricing.verified, true);
  assert.equal(healthy.validation.validation_status, 'pass');
  assert.ok(healthy.audit_evidence.every(row => row.url.startsWith('https://healthy.example.test/')));
  assert.equal(broken.retry_count, 1);
  assert.equal(broken.validation.validation_status, 'partial');
  assert.deepEqual(broken.profile.all_source_urls, []);
  assert.deepEqual(broken.audit_evidence, []);
  const errors = broken.errors.filter(error => error.stage === 'extractor');
  assert.equal(errors.length, 2);
  assert.ok(errors.every(error => error.raw_model_response === '{broken-json-from-Failed-Rival' && error.repair_count === 1 && error.repaired_response.includes('Synthetic schema repair failure')));
  assert.equal(result.counts.get('Repair JSON: Query Planner'), 1);
  assert.equal(result.counts.get('Repair JSON: Extractor'), 2);
  assert.equal(result.counts.get('N13 Increment Evidence Retry'), 2);
  assert.equal(result.counts.get('N06 Loop Competitors'), 3);
  assert.equal(result.counts.get('N09 Merge Four Search Branches'), 2);
  assert.equal(result.pages.length, 2);
  assert.match(result.pages[0].state.draft_markdown, /INITIAL-DRAFT/);
  assert.match(result.pages[1].state.draft_markdown, /REVISION-1: Make the executive summary clearer/);
  assert.equal(result.state.report_markdown, result.pages[1].state.draft_markdown);
  assert.doesNotMatch(result.state.report_markdown, /forged client replacement/);
  assert.match(result.state.report_markdown, /Failed Rival: pricing: unavailable or not verified/);
  assert.match(result.state.report_markdown, /https:\/\/healthy\.example\.test\/pricing/);
  assert.equal(result.completion.node, 'N21 Display Approved Report');
  const searches = result.calls.filter(call => call.kind === 'search');
  assert.equal(searches.filter(call => call.competitor === HEALTHY && call.dimension === 'retry').length, 1);
  assert.equal(searches.filter(call => call.competitor === BROKEN && call.dimension === 'retry').length, 2);
  assert.ok(searches.every(call => call.retry_count <= 1));
  assert.ok(result.steps < 300);
});

test('offline exported graph: empty discovery is retried once and bypasses competitor loop', () => {
  const result = simulate({ zero: true });
  assert.equal(result.state.approval_status, 'approved');
  assert.deepEqual(result.state.records, []);
  assert.equal(result.counts.get('You.com: Discovery'), 1);
  assert.equal(result.counts.get('You.com: Discovery - transport retry'), 1);
  assert.equal(result.counts.get('N16 No Verified Competitors'), 1);
  assert.equal(result.counts.get('N06 Loop Competitors'), undefined);
  assert.equal(result.calls.filter(call => call.kind === 'search').length, 2);
  assert.match(result.state.report_markdown, /Only 0 competitors/);
  assert.match(result.state.report_markdown, /No usable source evidence was retrieved/);
});

test('offline exported graph: repeated human revisions stop unapproved at the budget', () => {
  const result = simulate({ zero: true, decisions: Array.from({ length: 4 }, () => ({ Decision: 'Request revision', Feedback: 'Clarify wording.' })) });
  assert.equal(result.state.approval_status, 'not_approved');
  assert.equal(result.state.revision_count, 3);
  assert.equal(result.counts.get('Agent: Revision'), 3);
  assert.equal(result.pages.length, 4);
  assert.equal(result.completion.node, 'Display Unapproved Outcome');
  assert.equal(result.counts.get('N21 Approved Markdown Output'), undefined);
  assert.equal(Object.hasOwn(result.state, 'report_markdown'), false);
  assert.match(result.state.draft_markdown, /REVISION-3:/);
});

test('offline exported graph: approval timeout after revision cannot reuse a stale decision', () => {
  const result = simulate({ zero: true, decisions: [{ Decision: 'Request revision', Feedback: 'Make it clearer.' }, 'timeout'] });
  assert.equal(result.state.revision_count, 1);
  assert.equal(result.state.approval_status, 'not_approved');
  assert.equal(result.state.human_approval.decision, '');
  assert.equal(result.counts.get('Agent: Revision'), 1);
  assert.equal(result.counts.get('N21 Approved Markdown Output'), undefined);
  assert.equal(Object.hasOwn(result.state, 'report_markdown'), false);
});

test('offline exported graph: invalid input goes directly to unapproved completion', () => {
  const result = simulate({ input: { target_company: ' ' }, decisions: [] });
  assert.equal(result.state.input_valid, false);
  assert.equal(result.state.approval_status, 'not_approved');
  assert.equal(result.calls.length, 0);
  assert.equal(result.pages.length, 0);
  assert.equal(result.completion.node, 'Display Unapproved Outcome');
});
