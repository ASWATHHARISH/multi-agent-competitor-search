'use strict';
const runtime = require('../workflow/lib/runtime');
const dependencies = require('../workflow/lib/runtime-dependencies.json');

// Build-time linking only. n8n receives ordinary self-contained JavaScript:
// no require(), eval(), dynamic loading, workflow-global state, or shared runtime blob.
function helperNames(roots) {
  const ordered = [], visited = new Set();
  function visit(name) {
    if (!Object.hasOwn(runtime, name) || !Object.hasOwn(dependencies, name)) {
      throw new Error('Unknown runtime helper or missing dependency declaration: ' + name);
    }
    if (visited.has(name)) return;
    visited.add(name);
    for (const dependency of dependencies[name]) visit(dependency);
    ordered.push(name);
  }
  for (const root of typeof roots === 'string' ? [roots] : roots) visit(root);
  return ordered;
}

function bundleRuntime(roots, body) {
  const names = helperNames(roots);
  const declarations = names.map(name => {
    const value = runtime[name];
    return typeof value === 'function'
      ? Function.prototype.toString.call(value).replace(/\r\n/g, '\n')
      : 'const ' + name + ' = ' + JSON.stringify(value) + ';';
  });
  return '// Included helpers: ' + names.join(', ') + '\n' + declarations.join('\n') + '\n' + body;
}

module.exports = { bundleRuntime, helperNames };
