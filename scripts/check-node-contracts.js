'use strict';

// Released descriptor checks only: this does not start n8n or call You.com/Gemini.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const cache = path.join(root, '.tmp', 'contracts');
const releases = [
  { package: 'n8n-nodes-base', version: '2.15.1', file: 'base-descriptions.json' },
  { package: '@n8n/n8n-nodes-langchain', version: '2.40.3', file: 'langchain-descriptions.json' },
];
const helperVersion = '2.16.0';
const refresh = process.argv.includes('--refresh');

function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'competitor-research-contract-check/1.0' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 5) return reject(new Error('Too many descriptor redirects'));
        return resolve(download(new URL(response.headers.location, url).href, redirects + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Descriptor download returned HTTP ${response.statusCode}: ${url}`));
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    req.setTimeout(30000, () => req.destroy(new Error(`Descriptor download timed out: ${url}`)));
    req.on('error', reject);
  });
}

function unknownParameters(properties, values, label, problems) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return;
  for (const [key, value] of Object.entries(values)) {
    const definitions = properties.filter((property) => property.name === key);
    if (!definitions.length) { problems.push(`${label}.${key}: unknown parameter`); continue; }
    const collection = definitions.find((property) => property.type === 'collection');
    if (collection) unknownParameters(collection.options || [], value, `${label}.${key}`, problems);
    const fixed = definitions.find((property) => property.type === 'fixedCollection');
    if (fixed && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [group, entries] of Object.entries(value)) {
        const definition = (fixed.options || []).find((option) => option.name === group);
        if (!definition) { problems.push(`${label}.${key}.${group}: unknown collection`); continue; }
        (Array.isArray(entries) ? entries : [entries]).forEach((entry, index) => {
          unknownParameters(definition.values || [], entry, `${label}.${key}.${group}[${index}]`, problems);
        });
      }
    }
  }
}

function walkConnections(workflow, start, backwards = false) {
  const next = new Map(workflow.nodes.map((node) => [node.name, []]));
  for (const [name, links] of Object.entries(workflow.connections)) {
    for (const outputs of links.main || []) for (const link of outputs || []) {
      const from = backwards ? link.node : name, to = backwards ? name : link.node;
      if (next.has(from)) next.get(from).push(to);
    }
  }
  const visited = new Set([start]), queue = [...(next.get(start) || [])];
  while (queue.length) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    queue.push(...(next.get(name) || []));
  }
  visited.delete(start);
  return visited;
}

function validateForms(workflow, problems) {
  const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
  for (const node of workflow.nodes.filter((n) => ['n8n-nodes-base.form', 'n8n-nodes-base.formTrigger'].includes(n.type))) {
    let fields = node.parameters.formFields?.values || [];
    if (node.parameters.defineForm === 'json') {
      try {
        const expression = node.parameters.jsonOutput;
        const raw = expression.startsWith('={{')
          ? vm.runInNewContext(`(${expression.slice(3, -2).trim()})`, { $json: { review_html: '<p>Fixture draft</p>' } }, { timeout: 1000 })
          : expression;
        fields = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(fields)) throw new Error('Form fields must be an array');
      } catch (error) { problems.push(`${node.name}: form JSON fixture failed: ${error.message}`); continue; }
    }
    fields.forEach((field, index) => {
      if (field.fieldType !== 'html' && node.typeVersion === 2.4 && !field.fieldName) problems.push(`${node.name}: form field ${index} lacks fieldName`);
      if (!['html', 'hiddenField'].includes(field.fieldType) && !field.fieldLabel) problems.push(`${node.name}: form field ${index} lacks fieldLabel`);
    });
    if (node.type === 'n8n-nodes-base.form') {
      if (![...walkConnections(workflow, node.name, true)].some((name) => byName.get(name)?.type === 'n8n-nodes-base.formTrigger')) problems.push(`${node.name}: no Form Trigger ancestor`);
      if (node.parameters.operation === 'completion' && [...walkConnections(workflow, node.name)].some((name) => byName.get(name)?.type === 'n8n-nodes-base.form')) problems.push(`${node.name}: another Form is reachable after a completion`);
    }
  }
}

async function main() {
  fs.mkdirSync(cache, { recursive: true });
  const helperPath = path.join(cache, 'node_modules', 'n8n-workflow');
  if (!fs.existsSync(path.join(helperPath, 'package.json'))) throw new Error(`Install the isolated check dependency first: npm install --prefix .tmp/contracts --ignore-scripts --no-audit --no-fund n8n-workflow@${helperVersion}`);
  const installedVersion = JSON.parse(fs.readFileSync(path.join(helperPath, 'package.json'), 'utf8')).version;
  if (installedVersion !== helperVersion) throw new Error(`Expected n8n-workflow@${helperVersion}, found ${installedVersion}`);
  const { NodeHelpers } = require(helperPath);
  const catalogs = await Promise.all(releases.map(async (release) => {
    const filename = path.join(cache, release.file);
    const url = `https://unpkg.com/${release.package}@${release.version}/dist/types/nodes.json`;
    if (refresh || !fs.existsSync(filename)) {
      const text = await download(url);
      if (!Array.isArray(JSON.parse(text))) throw new Error(`Invalid descriptor catalog: ${url}`);
      fs.writeFileSync(filename, text);
    }
    return { ...release, url, descriptions: JSON.parse(fs.readFileSync(filename, 'utf8')) };
  }));
  const workflow = JSON.parse(fs.readFileSync(path.join(root, 'workflow', 'competitor-research-agent.json'), 'utf8'));
  const problems = [], missingCredentials = new Set();
  let nativeChecks = 0;
  for (const node of workflow.nodes) {
    const catalog = catalogs.find((entry) => node.type.startsWith(`${entry.package}.`));
    const name = catalog && node.type.slice(catalog.package.length + 1);
    const description = catalog?.descriptions.find((entry) => entry.name === name && [entry.version].flat().includes(node.typeVersion));
    if (!description) { problems.push(`${node.name}: unknown released type/version ${node.type}@${node.typeVersion}`); continue; }
    unknownParameters(description.properties || [], node.parameters, node.name, problems);
    try {
      const parameters = NodeHelpers.getNodeParameters(description.properties, node.parameters, true, false, node, description);
      const normalized = { ...node, parameters };
      const issues = NodeHelpers.getNodeParametersIssues(description.properties, normalized, description);
      if (issues) problems.push(`${node.name}: ${JSON.stringify(issues)}`);
      nativeChecks++;
      for (const credential of description.credentials || []) {
        if (NodeHelpers.displayParameter(parameters, credential, node, description) && !node.credentials?.[credential.name]) missingCredentials.add(credential.name);
      }
    } catch (error) { problems.push(`${node.name}: native parameter validation failed: ${error.message}`); }
  }
  validateForms(workflow, problems);
  const result = {
    checkedAt: new Date().toISOString(),
    scope: 'Pinned released node descriptions and native parameter helpers; no live import or authenticated execution',
    workflowNodes: workflow.nodes.length, nativeParameterChecks: nativeChecks,
    nodePackages: catalogs.map(({ package: name, version, url }) => ({ name, version, url })),
    helperPackage: { name: 'n8n-workflow', version: helperVersion },
    manualCredentialBindings: [...missingCredentials].sort(),
    problems,
  };
  fs.writeFileSync(path.join(cache, 'last-check.json'), JSON.stringify(result, null, 2) + '\n');
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else console.log(`Passed released node contracts for ${workflow.nodes.length} nodes (${nativeChecks} native parameter checks). Manual credential bindings: ${[...missingCredentials].sort().join(', ')}. This is not a live n8n import test.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
