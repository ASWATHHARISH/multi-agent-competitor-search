# Verified n8n node contracts

Checked on **2026-09-24** against the published packages **`n8n-nodes-base@2.15.1`** and **`@n8n/n8n-nodes-langchain@2.40.3`**. The links below pin the package versions inspected; they do not track a changing development branch. The workflow deliberately selects supported node versions, which need not be each package's newest default.

The same definitions are available as released JSON catalogs: [core node descriptions](https://unpkg.com/n8n-nodes-base@2.15.1/dist/types/nodes.json) and [AI node descriptions](https://unpkg.com/@n8n/n8n-nodes-langchain@2.40.3/dist/types/nodes.json). Both catalogs were inspected to cross-check names, supported versions, and property names without installing or starting a full n8n server.
This is source-level compatibility evidence. The user reported that the original export imported into n8n Cloud but test-webhook registration failed because the workflow was too large despite empty pinned data. The smaller export has not been imported or executed here, and these checks do not establish saved-credential access or authenticated You.com/Gemini success. Follow [testing.md](testing.md) for the Cloud acceptance checks.

## Node types and versions

| Exported `type` | `typeVersion` | Verified contract / pinned released source |
| --- | --- | --- |
| `@n8n/n8n-nodes-langchain.mcpClient` | `1.1` | Native standalone [MCP Client](https://unpkg.com/@n8n/n8n-nodes-langchain@2.40.3/dist/nodes/mcp/McpClient/McpClient.node.js). Main input/output. Version 1.1 turns MCP `isError` results into errors. |
| `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` | `1` | [Google Gemini Chat Model](https://unpkg.com/@n8n/n8n-nodes-langchain@2.40.3/dist/nodes/llms/LmChatGoogleGemini/LmChatGoogleGemini.node.js). Supplies `ai_languageModel`; credential type `googlePalmApi`; model parameter `modelName`. |
| `@n8n/n8n-nodes-langchain.chainLlm` | `1.7` | [Basic LLM Chain](https://unpkg.com/@n8n/n8n-nodes-langchain@2.40.3/dist/nodes/chains/ChainLLM/ChainLlm.node.js). Main execution node connected to a Gemini model; supports an `ai_outputParser` input. |
| `@n8n/n8n-nodes-langchain.outputParserStructured` | `1.3` | [Structured Output Parser](https://unpkg.com/@n8n/n8n-nodes-langchain@2.40.3/dist/nodes/output_parser/OutputParserStructured/OutputParserStructured.node.js). Supplies `ai_outputParser`; supports `schemaType`, `inputSchema`, `autoFix`, and a custom retry prompt. |
| `n8n-nodes-base.formTrigger` | `2.4` | [Version registration](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Form/FormTrigger.node.js) and [V2 implementation](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Form/v2/FormTriggerV2.node.js). No main input; one main output. |
| `n8n-nodes-base.form` | `2.4` | [Form implementation](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Form/Form.node.js). Native execution wait/resume with a Form Trigger ancestor; `page` and `completion` operations. |
| `n8n-nodes-base.splitInBatches` | `3` | [Loop Over Items V3](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/SplitInBatches/v3/SplitInBatchesV3.node.js). Output **0 = done**, output **1 = loop**; `batchSize`, `options.reset`. |
| `n8n-nodes-base.merge` | `3.2` | [Version registration](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Merge/Merge.node.js) and [V3 description](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Merge/v3/actions/versionDescription.js). Append mode uses `numberInputs`. |
| `n8n-nodes-base.splitOut` | `1` | [Split Out](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Transform/SplitOut/SplitOut.node.js). `fieldToSplitOut`, `include`, `options.destinationFieldName`. |
| `n8n-nodes-base.aggregate` | `1` | [Aggregate](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Transform/Aggregate/Aggregate.node.js). `aggregate: "aggregateAllItemData"`, `destinationFieldName`, `include: "allFields"` combine items into one array. |
| `n8n-nodes-base.code` | `2` | [Code](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Code/Code.node.js). JavaScript `jsCode`; `mode: "runOnceForAllItems"` or `"runOnceForEachItem"`. |
| `n8n-nodes-base.set` | `3.4` | Native [Edit Fields](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Set/v2/SetV2.node.js). `mode: "manual"`, `assignments.assignments`, and `includeOtherFields: true` add the normalized query while preserving the execution state. |
| `n8n-nodes-base.if` | `2.2` | [If V2](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/If/V2/IfV2.node.js). `conditions` filter object, filter options version **2**; output **0 = true**, output **1 = false**. |

## You.com OAuth integration

The official [You.com MCP registry manifest](https://github.com/youdotcom-oss/mcp/blob/main/server.json) names the server **You.com Web Access & AI** and points to `https://api.you.com/mcp`. Its [MCP documentation](https://you.com/docs/build-with-agents/mcp-server) describes OAuth support. The workflow uses that service through n8n's native MCP Client, preserving the existing OAuth-based architecture.

This differs from the separately published You.com community node, whose credential is API-key based. Do not replace the OAuth credential with a made-up credential type or put tokens in workflow JSON. Select the existing **MCP OAuth2** credential on the You.com nodes after import. Its internal credential key is `mcpOAuth2Api`, as defined in the [released MCP credential descriptions](https://unpkg.com/@n8n/n8n-nodes-langchain@2.40.3/dist/nodes/mcp/shared/descriptions.js).

Minimal native MCP parameters:

```json
{
  "serverTransport": "httpStreamable",
  "endpointUrl": "https://api.you.com/mcp",
  "authentication": "mcpOAuth2Api",
  "tool": { "__rl": true, "mode": "id", "value": "you-search" },
  "inputMode": "json",
  "jsonInput": "={{ { query: $json.query, count: 6 } }}",
  "options": { "timeout": 60000 }
}
```

On the verification date, read-only MCP `initialize` and `tools/list` requests to the official public metadata endpoint `https://api.you.com/mcp?profile=free` returned server version **4.0.2** and the `you-search` tool schema. **No `tools/call` search was executed, and no user credential was accessed.** The production workflow uses the authenticated endpoint above; the free metadata endpoint is not a replacement for the configured credential.

The retrieved tool schema accepts required string `query` and integer `count` from 1 to 100. Query guidance specifies at most 50 words / 400 characters after inline-filter mapping. Optional `freshness` accepts named periods or a date range. The export should normalize whitespace, enforce the query length/word limits, and keep the count bounded before calling the tool. Geography can be included in query text.

The current tool schema also offers `extraction` (`none`, `highlights`, `full_page`), `offset`, `safesearch`, `exclude_domains`, and `crawl_timeout`. Country/language/include/boost-domain fields are host metadata in this MCP schema, so they must not be assumed to work as ordinary search-tool arguments. Minimal query/count arguments avoid that incompatibility.

### Search output normalization

The server describes an object containing `results.web`, `results.news`, and `metadata`. Web records may contain `url`, `title`, `description`, `snippets`, `page_age`, and `contents.highlights` / `contents.markdown` / `contents.html`. News records contain URL/title/description/date and may contain extracted content. A missing result array is not evidence of a successful search.

n8n's MCP Client returns the server's structured object under **`structuredContent`**. It also retains text content under **`content`**, parsing each text value as JSON when possible. Normalization must therefore:

1. Prefer `structuredContent.results` when present.
2. Otherwise inspect text content blocks, accepting either an already parsed object or JSON text.
3. Preserve URL, title, description/snippets/highlights, date, and search purpose together.
4. Treat an error object, malformed payload, or no usable URL-bearing results as a local search gap.

The node can return `{ "error": { "message": "..." } }` on continued tool failure; a connection failure can throw before its per-item catch. Neither output should be mistaken for research evidence. The original workflow state must be restored from a preserved execution item after every search.

## Form and routing details

Form Trigger 2.4 uses `formFields.values`. Every input needs a stable **`fieldName`** in addition to its visible `fieldLabel`; use the stable name in normalization code. It supports `responseMode: "lastNode"` and `"onReceived"`. Form page title/description are under **`options.formTitle`** and **`options.formDescription`**. Field and response definitions are in the [released shared form description](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Form/common.descriptions.js).

Form custom HTML supports `{{ ... }}` interpolation through the [form parser](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Form/utils/utils.js). Its `html` property is not a normal expression field: do not prepend `=` to inline HTML interpolation. Escape model-generated text before displaying it as HTML. `options.formDescription` is a normal expression-capable field. On submission, the form returns its response fields; preserve and recover the report state separately.

A final Form uses `operation: "completion"`. `respondWith: "showText"` reads `responseText`; `respondWith: "text"` reads `completionTitle`/`completionMessage`. It must be the last reachable Form on that branch. An approval page waits natively; no external webhook receiver or additional service is needed.

Merge append mode uses numeric `numberInputs`, including **4** for the four research streams ([released helper](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Merge/v3/helpers/descriptions.js), [append operation](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Merge/v3/actions/mode/append.js)). Each branch should produce a result-or-error item, allowing evidence assembly to account for all four purposes.

The first-attempt result and terminal transport-retry result are mutually exclusive. Both connect directly to the same research-purpose input on the four-input Merge. The [published `n8n-core@2.16.0` execution engine](https://unpkg.com/n8n-core@2.16.0/dist/execution-engine/workflow-execute.js) fills waiting data by input index, not by every incoming connection. With the exported `executionOrder: "v1"`, an empty IF output does not schedule its downstream node. Each selected endpoint emits one state item, so these connections preserve the four-purpose join without redundant pass-through Code nodes. This is a source inspection, not a full n8n engine execution test.

Query preparation uses Edit Fields 3.4 rather than a Code node. Each `assignments.assignments` entry has `id`, `name: "active_query"`, `type: "string"`, and an expression `value`. `includeOtherFields: true` selects the default `include: "all"`; the [released Set helpers](https://unpkg.com/n8n-nodes-base@2.15.1/dist/nodes/Set/v2/helpers/utils.js) deep-copy the input JSON, overlay the query, and create `pairedItem: { item: itemIndex }`. All research state therefore survives these scalar assignments, including evidence and retry counters.

Loop Over Items `options.reset` must remain false for the competitor loop. Returning the processed competitor item to the loop advances its saved batch and eventually emits all processed records on `done`. The evidence retry uses a separate bounded counter; it must not reset the competitor loop.

## What standalone validation can establish

`scripts/check-node-contracts.js` checked **all 127 generated nodes** against those released catalogs. It used the official **`n8n-workflow@2.16.0`** `NodeHelpers.getNodeParameters` and `NodeHelpers.getNodeParametersIssues` helpers, after validating each exact type/version. All 127 native parameter checks passed, including all seven Edit Fields nodes. Additional checks found no unknown parameter names, missing Form 2.4 field names, missing Form Trigger ancestors, or Forms reachable after a completion Form. The approval JSON expression was evaluated with a synthetic draft to inspect its resulting field definitions. This was an offline parameter/graph check, not a browser form submission.

The two intentionally unbound credential types were `googlePalmApi` and `mcpOAuth2Api`. Credentials were not injected, inspected, or tested.

To reproduce after `npm run build`, run:

```sh
npm install --prefix .tmp/contracts --ignore-scripts --no-audit --no-fund n8n-workflow@2.16.0
node scripts/check-node-contracts.js
```

The check downloads the two pinned public catalogs and caches them in ignored `.tmp/contracts/`. Add `--refresh` to fetch them again. The result is written to `.tmp/contracts/last-check.json`. The package installation is isolated from the repository's runtime dependencies and starts no service. Use a current Node.js release for the optional helper check; the original check also completed on the available Node 18 runtime despite dependency engine warnings. The ordinary build and deterministic tests do not require these helper dependencies.

The official `n8n-workflow` package also exposes a `Workflow` representation. Its constructor requires a node-type resolver and can silently skip unknown types. Constructing it with stub descriptors would therefore **not** establish that a file imports successfully in n8n Cloud. Even the real-descriptor parameter checks above cannot verify credential access, expression item-linking during execution, node lifecycle behavior, or browser redirects.

No full n8n runtime or extra project service is required by this repository. Its offline checks establish JSON structure and deterministic control-flow behavior. The credential binding, Cloud import, Gemini model availability, and browser approval/revision checks remain the explicit manual acceptance steps in [testing.md](testing.md).
