'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../workflow/lib/runtime');
const schemas = require('../workflow/lib/schemas');

// These are synthetic fixtures. They exercise control/evidence logic, not live research.
const NOW = '2026-09-24T09:00:00.000Z';
const PRODUCT = 'https://example.test/product';
const PRICING = 'https://example.test/pricing';
const DISCOVERY = 'https://example.test/alternatives';
function scope() {
  return R.normalize({ target_company: 'Example Target', target_product: 'answer engine', market_context: 'web research' }, NOW);
}
function competitor(name = 'Example Rival') {
  return { name, reason: 'The supplied discovery evidence describes direct product overlap.', evidence_urls: [DISCOVERY] };
}
function evidence(url = PRODUCT, dimension = 'official') {
  return { url, title: 'Synthetic fixture', snippet: 'Synthetic evidence for assertions in unit tests only.', dimension, query: 'fixture', retrieved_at: NOW, published_at: '' };
}
function profile() {
  return {
    competitor_name: 'Example Rival', official_site: PRODUCT,
    pricing: { summary: 'Synthetic plan costs 10 units.', verified: true, source_urls: [PRICING] },
    core_features: [{ claim: 'Synthetic feature', source_urls: [PRODUCT] }],
    target_users: [{ claim: 'Synthetic audience', source_urls: [PRODUCT] }],
    positioning: { summary: 'Synthetic positioning', source_urls: [PRODUCT] },
    differentiators: [{ claim: 'Synthetic differentiator', source_urls: [PRODUCT] }],
    recent_news: [{ summary: 'Synthetic release', date: '2026-09-01', source_urls: [PRODUCT] }],
    missing_fields: [], all_source_urls: [PRODUCT, PRICING],
  };
}
function validation(overrides = {}) {
  return { validation_status: 'pass', unsupported_claims: [], conflicts: [], missing_important_fields: [], retry_needed: false, retry_query: '', ...overrides };
}
function research(name) {
  return { ...R.initializeCompetitor({ ...scope(), competitor: competitor(name) }), profile: profile(), evidence: [evidence(), evidence(PRICING, 'pricing')], validator_ok: true, validation: validation() };
}
function runStage(state, stage, value) {
  return R.finish(R.readModel(R.prepare(state, stage, 'Synthetic test role. Use supplied evidence only.', schemas[stage]), { text: JSON.stringify(value) }));
}
function reportState() {
  return R.aggregate(scope(), [R.validatedRecord(research())]);
}

test('normalization overrides client-supplied budgets and state', () => {
  const s = R.normalize({ 'Company name': '  Example Target  ', retry_count: 99, max_retry: 999, approval_status: 'approved', revision_count: 99 }, NOW);
  assert.equal(s.target_company, 'Example Target');
  assert.equal(s.retry_count, 0);
  assert.equal(s.max_retry, 1);
  assert.equal(s.revision_count, 0);
  assert.equal(s.approval_status, 'pending');
  assert.equal(s.input_valid, true);
  assert.equal(R.normalize({ target_company: ' ' }, NOW).input_valid, false);
});

test('competitor initialization isolates retries and mutable state', () => {
  const original = scope();
  const a = R.initializeCompetitor({ ...original, competitor: competitor('Rival A') });
  const b = R.initializeCompetitor({ ...original, competitor: competitor('Rival B') });
  a.evidence.push(evidence()); a.errors.push({ error: 'local' }); a.gaps.push('local'); a.retry_count = 1;
  assert.deepEqual(b.evidence, []);
  assert.deepEqual(b.errors, []);
  assert.deepEqual(b.gaps, []);
  assert.equal(b.retry_count, 0);
  assert.deepEqual(original.errors, []);
});

test('evidence retry increment is immutable and permits exactly one attempt', () => {
  const s = research(); s.validation.retry_query = 'narrower pricing query';
  const retried = R.incrementRetry(s);
  assert.equal(s.retry_count, 0);
  assert.equal(retried.retry_count, 1);
  assert.equal(retried.retry_query, 'narrower pricing query');
  assert.throws(() => R.incrementRetry(retried), /budget exhausted/);
});

test('malformed model text survives one failed repair in the error record', () => {
  const raw = '{"discovery_query": invalid';
  const prepared = R.prepare(scope(), 'orchestrator', 'Do not invent facts.', schemas.orchestrator);
  const rejected = R.readModel(prepared, { text: raw });
  assert.equal(rejected.llm.ok, false);
  assert.equal(rejected.llm.raw_model_response, raw);
  assert.match(rejected.llm.repair_prompt, /Do not research, invent facts or URLs/);
  const failed = R.readModel(rejected, { error: 'Model output does not fit required format' }, true);
  const finished = R.finish(failed);
  assert.equal(finished.errors.length, 1);
  assert.equal(finished.errors[0].raw_model_response, raw);
  assert.equal(finished.errors[0].repair_count, 1);
  assert.match(finished.errors[0].repaired_response, /required format/);
  assert.match(finished.research_plan.discovery_query, /Example Target/);
});

test('native parser output wrapper is accepted on the single repair', () => {
  const prepared = R.prepare(scope(), 'orchestrator', 'Test role.', schemas.orchestrator);
  const failed = R.readModel(prepared, { text: 'broken' });
  const repaired = R.readModel(failed, { output: { target_company: 'Example Target', discovery_query: 'Example Target alternatives', research_dimensions: R.DIMENSIONS } }, true);
  assert.equal(repaired.llm.ok, true);
  assert.equal(repaired.llm.raw_model_response, 'broken');
  assert.equal(repaired.llm.repair_count, 1);
  assert.deepEqual(R.finish(repaired).research_plan.research_dimensions, R.DIMENSIONS);
});

test('strict schema catches unexpected fields, nulls, booleans as strings and invalid status', () => {
  assert.match(R.schemaErrors({ ...validation(), retry_needed: 'false' }, schemas.validator).join(';'), /expected boolean/);
  assert.match(R.schemaErrors({ ...validation(), arbitrary: 'instruction' }, schemas.validator).join(';'), /unexpected field/);
  assert.match(R.schemaErrors({ ...validation(), validation_status: 'approved' }, schemas.validator).join(';'), /invalid enum/);
  assert.match(R.schemaErrors(null, schemas.extractor).join(';'), /expected object/);
  assert.match(R.schemaErrors({ competitors: Array(4).fill(competitor()) }, schemas.discovery).join(';'), /too many items/);
});

test('search adapter unwraps MCP text and preserves URL, snippet, date and query', () => {
  const raw = { content: [{ type: 'text', text: JSON.stringify({ results: { web: [{ url: PRODUCT, title: 'A product', snippets: ['first', 'second'], page_age: '2026-09-01' }] } }) }] };
  const found = R.normalizeSearch(raw, 'official', 'focused query', NOW);
  assert.equal(found.evidence.length, 1);
  assert.equal(found.evidence[0].url, PRODUCT);
  assert.equal(found.evidence[0].snippet, 'first\nsecond');
  assert.equal(found.evidence[0].published_at, '2026-09-01');
  assert.equal(found.evidence[0].query, 'focused query');
  assert.equal(found.evidence[0].retrieved_at, NOW);
});

test('search adapter refuses snippets without a usable URL and URLs without evidence', () => {
  const found = R.normalizeSearch([{ url: 'javascript:alert(1)', snippet: 'bad' }, { url: PRODUCT }, { snippet: 'No provenance' }, { url: 'https://example.test/<script>', snippet: 'bad' }], 'official', 'query', NOW);
  assert.equal(found.empty, true);
  assert.deepEqual(found.evidence, []);
});

test('search failures remain local and preserve their attempt and competitor', () => {
  const s = research();
  const failed = R.captureSearch(s, { isError: true, content: [{ type: 'text', text: 'synthetic upstream failure' }] }, 'pricing', 'query', NOW, 1);
  assert.equal(failed.search_result.empty, true);
  assert.equal(failed.search_result.tool_failed, true);
  assert.equal(failed.errors[0].competitor, 'Example Rival');
  assert.equal(failed.errors[0].attempt, 1);
  assert.deepEqual(s.errors, []);
});

test('four-way merge rejects cross-competitor mixing and retains empty-field gaps', () => {
  const branches = ['official', 'pricing', 'positioning', 'news'].map((dimension) => R.captureSearch(research(), dimension === 'pricing' ? [] : [{ url: PRODUCT, snippet: dimension }], dimension, 'query', NOW));
  const merged = R.mergeEvidence(branches);
  assert.equal(merged.evidence.length, 3);
  assert.match(merged.gaps.join(';'), /pricing: no usable evidence/);
  assert.throws(() => R.mergeEvidence(branches.slice(0, 3)), /four research/);
  branches[3].competitor.name = 'Other rival';
  assert.throws(() => R.mergeEvidence(branches), /Cross-competitor/);
});

test('discovery allows only unique non-target names with retrieved supporting URLs', () => {
  const s = { ...scope(), discovery_evidence: [evidence(DISCOVERY)] };
  const result = runStage(s, 'discovery', { competitors: [competitor(), { ...competitor('EXAMPLE RIVAL') }, { ...competitor('Unsupported Rival'), evidence_urls: ['https://invented.test/source'] }] });
  assert.deepEqual(result.competitors.map((c) => c.name), ['Example Rival']);
  assert.match(result.gaps.join(';'), /Only 1 competitors/);
  const target = runStage(s, 'discovery', { competitors: [competitor('Example Target')] });
  assert.deepEqual(target.competitors, []);
});

test('zero verified competitors yields an honest report without invented competitor facts', () => {
  const s = runStage({ ...scope(), discovery_evidence: [] }, 'discovery', { competitors: [] });
  const aggregated = R.aggregate(s, []);
  const markdown = R.renderReport(aggregated);
  assert.match(markdown, /0 evidence-backed competitor/);
  assert.match(markdown, /No usable source evidence was retrieved/);
  assert.match(markdown, /Only 0 competitors/);
  assert.deepEqual(R.checkReport(markdown, []), []);
});

test('grounding removes forged sources and downgrades unsupported pricing', () => {
  const p = profile();
  p.official_site = 'https://invented.test';
  p.pricing.source_urls = ['https://invented.test/pricing'];
  p.core_features.push({ claim: 'Invented feature', source_urls: ['https://invented.test/feature'] });
  p.all_source_urls.push('https://invented.test');
  const grounded = R.groundProfile(p, [evidence()], 'Correct Rival Name');
  assert.equal(grounded.competitor_name, 'Correct Rival Name');
  assert.equal(grounded.official_site, '');
  assert.equal(grounded.pricing.summary, 'Pricing not verified');
  assert.equal(grounded.pricing.verified, false);
  assert.deepEqual(grounded.pricing.source_urls, []);
  assert.equal(grounded.core_features.length, 1);
  assert.deepEqual(grounded.all_source_urls, [PRODUCT]);
  assert.ok(grounded.missing_fields.includes('pricing'));
});

test('missing pricing forces one targeted retry and then a partial record', () => {
  const s = research(); s.profile = R.groundProfile(profile(), [evidence()], 'Example Rival'); s.evidence = [evidence()];
  const first = runStage(s, 'validator', validation());
  assert.equal(first.validation.retry_needed, true);
  assert.match(first.validation.retry_query, /pricing/);
  const second = runStage(R.incrementRetry(first), 'validator', validation({ validation_status: 'retry', retry_needed: true }));
  assert.equal(second.validation.retry_needed, false);
  assert.equal(second.validation.validation_status, 'partial');
  assert.equal(R.validatedRecord(second).profile.pricing.summary, 'Pricing not verified');
});

test('all searches failing still yields a local partial record after one retry', () => {
  const branches = ['official', 'pricing', 'positioning', 'news'].map((dimension) => R.captureSearch(research(), { error: 'synthetic outage' }, dimension, 'query', NOW));
  let s = R.mergeEvidence(branches);
  s = runStage(s, 'extractor', R.emptyProfile('Example Rival'));
  s = runStage(s, 'validator', validation());
  assert.equal(s.validation.retry_needed, true);
  s = R.incrementRetry(s);
  s = R.attachRetry(R.captureSearch(s, [], 'targeted_retry', s.retry_query, NOW));
  s = runStage(s, 'validator', validation({ validation_status: 'retry', retry_needed: true }));
  const record = R.validatedRecord(s);
  assert.equal(record.retry_count, 1);
  assert.equal(record.validation.retry_needed, false);
  assert.equal(record.validation.validation_status, 'partial');
  assert.deepEqual(record.profile.all_source_urls, []);
  assert.equal(record.errors.length, 4);
  assert.match(record.gaps.join(';'), /retry budget exhausted/);
});

test('unsupported claims and conflicts remove only the affected factual fields', () => {
  const s = research();
  s.validation = validation({ unsupported_claims: ['core_features[0]: unsupported feature'], conflicts: [`pricing: conflicting amounts from ${PRICING} and ${PRODUCT}`] });
  const record = R.validatedRecord(s);
  assert.deepEqual(record.profile.core_features, []);
  assert.equal(record.profile.pricing.verified, false);
  assert.equal(record.profile.target_users.length, 1);
  assert.equal(record.validation.validation_status, 'partial');
  assert.match(record.gaps.join(';'), /conflicting amounts/);
  assert.deepEqual(record.audit_evidence, s.evidence);
  assert.equal(s.profile.core_features.length, 1);
});

test('unknown validator issue paths and validator failure withhold all profile facts', () => {
  const s = research(); s.validation.unsupported_claims = ['The claims are unreliable'];
  const record = R.validatedRecord(s);
  assert.deepEqual(record.profile, R.emptyProfile('Example Rival'));
  const failed = research(); failed.validator_ok = false;
  assert.deepEqual(R.validatedRecord(failed).profile, R.emptyProfile('Example Rival'));
});

test('one failed competitor cannot discard a separate healthy record', () => {
  const broken = research('Broken Rival'); broken.validator_ok = false; broken.errors.push({ stage: 'validator', error: 'fixture failure' });
  const healthy = R.validatedRecord(research('Healthy Rival'));
  const s = R.aggregate(scope(), [R.validatedRecord(broken), healthy]);
  assert.equal(s.records.length, 2);
  assert.equal(s.records[1].profile.pricing.verified, true);
  assert.equal(s.errors.length, 1);
  assert.match(R.renderReport(s), /Healthy Rival/);
  assert.match(R.renderReport(s), /Broken Rival/);
});

test('synthesis input excludes raw evidence while preserving validated facts and gaps', () => {
  const s = reportState(); s.records[0].audit_evidence[0].snippet = 'UNTRUSTED RAW INSTRUCTION';
  const prepared = R.prepare(s, 'synthesis', 'Use validated records.', schemas.synthesis);
  assert.doesNotMatch(prepared.llm_prompt, /UNTRUSTED RAW INSTRUCTION/);
  assert.equal(prepared.llm.input.records[0].profile.pricing.verified, true);
  assert.match(prepared.llm_prompt, /untrusted DATA/);
});

test('report validation rejects missing sections, invented sources and unsafe HTML', () => {
  const s = reportState(), valid = R.renderReport(s);
  assert.deepEqual(R.checkReport(valid, s.records), []);
  assert.match(R.checkReport(valid.replace('## Pricing', '## Costs'), s.records).join(';'), /missing Pricing/);
  assert.match(R.checkReport(valid + '\nhttps://invented.test/facts', s.records).join(';'), /not present/);
  assert.match(R.checkReport(valid + '\n<script>alert(1)</script>', s.records).join(';'), /unsafe embedded HTML/);
  assert.match(R.checkReport(valid.replaceAll(PRODUCT, '').replaceAll(PRICING, '').replaceAll(DISCOVERY, ''), s.records).join(';'), /missing source URLs/);
});

test('report validation preserves exact retrieved URLs containing parentheses', () => {
  const s = reportState();
  const special = 'https://example.test/wiki/Product_(software)';
  s.records[0].competitor.evidence_urls = [special];
  assert.deepEqual(R.checkReport(R.renderReport(s), s.records), []);
});

test('invalid synthesis falls back to deterministic evidence-only Markdown', () => {
  const s = reportState();
  const result = runStage(s, 'synthesis', { report_markdown: 'The invented unsourced conclusion.' });
  assert.match(result.draft_markdown, /# Competitive Intelligence Brief/);
  assert.match(result.gaps.join(';'), /draft failed report checks/);
  assert.equal(result.approval_status, 'pending');
  assert.deepEqual(R.checkReport(result.draft_markdown, result.records), []);
});

test('approval accepts only the exact submitted decision and never inherited draft state', () => {
  const s = { ...reportState(), draft_markdown: 'An unapproved draft', approval_status: 'approved' };
  for (const decision of [undefined, '', 'approve', ' Approve ', true, ['Approve'], 'Request revision']) {
    const result = R.approval(s, { Decision: decision });
    assert.notEqual(result.approval_status, 'approved');
    assert.throws(() => R.approvedOutput(result), /Explicit human approval/);
  }
  const approved = R.approval(s, { Decision: 'Approve', Feedback: '  accepted  ', draft_markdown: 'client replacement' });
  assert.equal(approved.feedback, 'accepted');
  assert.equal(R.approvedOutput(approved).report_markdown, 'An unapproved draft');
});

test('human revisions consume a finite budget and return to pending approval', () => {
  let s = { ...reportState(), draft_markdown: R.renderReport(reportState()) };
  const cap = s.max_revisions;
  for (let i = 1; i <= cap; i++) {
    s = R.beginRevision(R.approval(s, { Decision: 'Request revision', Feedback: 'Make wording clearer.' }));
    assert.equal(s.revision_count, i);
    s = runStage(s, 'revision', { report_markdown: s.draft_markdown });
    assert.equal(s.approval_status, 'pending');
    assert.throws(() => R.approvedOutput(s), /Explicit human approval/);
  }
  assert.throws(() => R.beginRevision(R.approval(s, { Decision: 'Request revision' })), /budget is exhausted/);
  const approved = R.approval(s, { Decision: 'Approve' });
  assert.equal(R.approvedOutput(approved).report_markdown, s.draft_markdown);
});

test('revision failure keeps previous draft and still requires fresh human approval', () => {
  const s = { ...reportState(), draft_markdown: R.renderReport(reportState()) };
  const revision = R.beginRevision(R.approval(s, { Decision: 'Request revision', Feedback: '' }));
  assert.match(revision.feedback, /preserving all evidence/);
  const result = runStage(revision, 'revision', { report_markdown: 'Too short and unsourced.' });
  assert.equal(result.draft_markdown, s.draft_markdown);
  assert.equal(result.approval_status, 'pending');
});

test('approval and final displays escape model HTML and preserve raw approved Markdown', () => {
  const draft = '<script>alert("x")</script> & \'quoted\' <img src=x onerror=alert(1)>';
  const s = { ...scope(), draft_markdown: draft };
  const view = R.approvalView(s);
  assert.doesNotMatch(view.review_html, /<script>|<img/);
  assert.match(view.review_html, /&lt;script&gt;/);
  assert.match(view.review_html, /&amp; &#39;quoted&#39;/);
  const output = R.approvedOutput(R.approval(s, { Decision: 'Approve' }));
  assert.equal(output.report_markdown, draft);
  assert.doesNotMatch(output.final_html, /<script>|<img/);
});

test('each material factual report section requires its own retrieved source citation', () => {
  const s = reportState();
  const complete = R.renderReport(s);
  assert.deepEqual(R.checkReport(complete, s.records), []);
  for (const heading of ['Executive Summary', 'Competitor Comparison', 'Pricing', 'Core Features', 'Positioning and Target Audience', 'Key Differentiators', 'Recent Developments']) {
    const marker = '## ' + heading + '\n';
    const start = complete.indexOf(marker) + marker.length;
    const next = complete.indexOf('\n## ', start);
    const end = next === -1 ? complete.length : next;
    const uncited = complete.slice(0, start) + 'A material factual claim without a local citation.\n' + complete.slice(end);
    const errors = R.checkReport(uncited, s.records);
    assert.ok(errors.length > 0, 'Missing local citations should reject ' + heading);
    assert.ok(errors.some(error => error.includes(heading)), 'Citation error should identify ' + heading);
  }
});

test('a report cannot silently replace missing pricing with an unsupported confident statement', () => {
  const record = R.validatedRecord(research());
  record.profile.pricing = { summary: 'Pricing not verified', verified: false, source_urls: [] };
  record.profile.missing_fields = ['pricing'];
  const s = R.aggregate(scope(), [record]);
  const valid = R.renderReport(s);
  assert.deepEqual(R.checkReport(valid, s.records), []);
  const misleading = valid.replaceAll('Pricing not verified', 'All pricing is confirmed.');
  assert.ok(R.checkReport(misleading, s.records).length > 0);
});

test('MCP highlights-only search results preserve evidence instead of becoming empty', () => {
  const raw = { structuredContent: { results: { web: [{ url: PRODUCT, title: 'Highlights fixture', contents: { highlights: ['First supplied highlight.', 'Second supplied highlight.'] } }] } } };
  const normalized = R.normalizeSearch(raw, 'official', 'fixture query', NOW);
  assert.equal(normalized.empty, false);
  assert.equal(normalized.evidence[0].url, PRODUCT);
  assert.equal(normalized.evidence[0].snippet, 'First supplied highlight.\nSecond supplied highlight.');
});

test('search queries respect both 400-character and 50-word limits', () => {
  assert.equal(R.searchQuery('x'.repeat(800)).length, 400);
  const words = R.searchQuery(Array(80).fill('word').join(' '));
  assert.equal(words.split(/\s+/).length, 50);
  assert.ok(words.length <= 400);
  assert.equal(R.searchQuery('  alpha   beta\n gamma  '), 'alpha beta gamma');
});

test('conflicting sources survive field pruning and a model cannot erase canonical audit gaps', () => {
  const s = research();
  s.validation.conflicts = ['pricing: conflicting amounts at ' + PRICING + ' and ' + PRODUCT];
  const record = R.validatedRecord(s);
  assert.equal(record.profile.pricing.verified, false);
  assert.deepEqual(record.audit_source_urls.sort(), [PRODUCT, PRICING].sort());
  assert.ok(record.audit_evidence.some(row => row.url === PRICING));
  const aggregated = R.aggregate(scope(), [record]);
  const canonical = R.renderReport(aggregated);
  const start = canonical.indexOf('## Evidence Gaps / Conflicts');
  const candidate = canonical.slice(0, start) + '## Evidence Gaps / Conflicts\nThe model claims there are no gaps.\n\n## Sources\n[source](<' + PRODUCT + '>)';
  const result = runStage(aggregated, 'synthesis', { report_markdown: candidate });
  assert.match(result.draft_markdown, /pricing: conflicting amounts/);
  assert.ok(result.draft_markdown.includes(PRICING));
  assert.ok(result.draft_markdown.includes(PRODUCT));
  assert.doesNotMatch(result.draft_markdown, /The model claims there are no gaps/);
  assert.match(result.draft_markdown, /Pricing not verified/);
});
