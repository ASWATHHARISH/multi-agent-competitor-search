# Multi-Agent Competitor Research Agent

An importable n8n workflow that turns a company or product into a sourced competitor briefing. You.com supplies web/news evidence; Google Gemini plans the work, identifies up to three direct competitors, extracts structured profiles, validates claims, and drafts the report. A human must approve the draft before the workflow returns an approved Markdown report.

The implementation follows [the existing architecture](docs/architecture.md) and [agent prompts](prompts/agent-prompts.md). All state lives in the current n8n execution. There is no separate application, database, or hosting requirement.

## Workflow

```text
Research request form
  → Normalize input → Gemini orchestrator
  → You.com competitor discovery → Gemini competitor selection
  → Split competitors → Loop over competitors, one at a time
      → Gemini query planner
      → You.com official/features + pricing + positioning + news searches
      → Merge evidence → Gemini extractor → Gemini evidence validator
      → If needed: one targeted You.com retry → extract and validate again
      → Remove unsupported claims and retain evidence gaps
  → Aggregate profiles → Gemini synthesis
  → Human review form
      → Approve → final Markdown report
      → Request revision → Gemini revision → human review again
```

The named agents use Basic LLM Chain nodes connected to native Google Gemini Chat Model nodes. The workflow provides the tool calls, state, branching, and bounded loops. JSON stages use strict schema validation and one repair attempt with a Structured Output Parser.

See [the exact node map](docs/node-map.md) for node names, inputs, outputs, credentials, and error behavior.

## Prerequisites

- An n8n Cloud workspace with Form Trigger, Form, Code, Merge, Split Out, Loop Over Items, Aggregate, Basic LLM Chain, Structured Output Parser, and Google Gemini Chat Model nodes.
- The native n8n MCP Client node (`@n8n/n8n-nodes-langchain.mcpClient`, version 1.1) and access to the official You.com MCP integration. No community-node installation is required.
- The existing You.com MCP OAuth2 credential and Google Gemini API credential in n8n. Credentials remain in n8n; the export contains no credential IDs or API keys.
- Access to the configured Gemini model, `models/gemini-2.5-flash`, or a model selected in the Gemini Chat Model nodes that supports the same structured-output workflow.
- Node.js 18 or newer only if you want to regenerate or validate the repository artifacts locally. Node.js is not needed to import the JSON into n8n Cloud.

**You.com configuration:** the `You.com:` nodes use the official `https://api.you.com/mcp` endpoint with HTTP Streamable transport, MCP OAuth2 authentication (`mcpOAuth2Api`), and the `you-search` tool (“Search the web and news”). Tool input is JSON with `query` and `count: 6`. The workflow uses the existing You.com integration through n8n's native MCP Client; it does not introduce a replacement service or store credentials in source files.

## Export size and build strategy

The generated workflow is **227,372 bytes** (about 227 KB), reduced from 1,870,027 bytes. The original export imported successfully according to the user, but n8n refused test-webhook registration with a workflow-size error even though pinned data was empty. The user subsequently reported that the compact export imports and reaches Human Approval, but its first live run returned zero competitors after model failures. Live research acceptance is still failing; see the [debugging status](docs/testing.md#live-debugging-follow-up-2026-09-24).

Each Code node includes only its required helpers and their explicit dependencies. Agent preparation/finalization helpers are split by role; a search node does not carry report-rendering or unrelated agent logic. Seven simple query assignments use native Edit Fields nodes, and eleven copy-only nodes were removed. The export keeps readable JavaScript, all research/error/approval behavior, and all twelve You.com/seven Gemini credential bindings. It omits pinData entirely. Build, validation, and regression tests enforce a **500,000-byte ceiling**.

## Import and configure

1. Download [workflow/competitor-research-agent.json](workflow/competitor-research-agent.json).
2. In n8n, create a workflow and choose **Import from File** from the workflow menu. Select the JSON. Leave the imported workflow inactive until the first test succeeds.
3. Check that all nodes load as recognized nodes. The nodes labelled `You.com:` are built-in MCP Client nodes. Confirm the endpoint, transport, OAuth2 authentication, and `you-search` tool match the configuration above. If the workspace does not recognize a built-in node/version, check n8n availability before running the workflow.
4. Select the existing You.com MCP OAuth2 credential on **all 12 `You.com:` nodes**: `Discovery`, `Official Features`, `Pricing`, `Positioning`, `Recent News`, and `Targeted Retry`, plus each matching ` - transport retry` node. Every full node name starts with `You.com: `. Credential selection does not automatically propagate between nodes; [docs/node-map.md](docs/node-map.md) lists the exact names.
5. Select the existing Google Gemini API credential on all seven model subnodes: `Gemini: Orchestrator`, `Gemini: Discovery`, `Gemini: Query Planner`, `Gemini: Extractor`, `Gemini: Validator`, `Gemini: Synthesis`, and `Gemini: Revision`. Each model serves its primary and repair chain. If `models/gemini-2.5-flash` is unavailable, use the model selector to choose an available text-capable Gemini model in each of these seven subnodes, then repeat the manual tests. Keep the existing stored credential; no key belongs in the JSON or source files.
6. Save the workflow. Inspect the Form Trigger's test URL and start a test execution. Submit the demo input below through that URL.
7. Keep the form open while research runs. Review the resulting draft, choose **Approve** or **Request revision**, and submit optional feedback. After approval, copy the plain Markdown from the completion page, or open `N21 Approved Markdown Output` in the execution and copy its `report_markdown` JSON field.
8. Complete the relevant checks in [docs/testing.md](docs/testing.md), particularly the retry, revision, and approval tests. Fix missing node/credential configuration before activating the workflow.

No `.env` file or source-code credential replacement is required. The `.env.example` file is explanatory only; this workflow uses n8n's credential store.

## Demo input

| Form field | Value |
| --- | --- |
| Company name | Perplexity AI |
| Product / category | AI search / answer engine |
| Market context | consumer and professional AI-powered web search |
| Geography | Leave blank, or enter the market you want researched |
| Notes | Optional scope clarification |

The competitor list is derived from retrieved evidence at execution time. Three competitors are selected when evidence supports them; fewer competitors and explicit gaps are preferable to invented selections.

## Activate the form

After the test execution and credential checks, save and activate/publish the workflow using the control available in your n8n version. Open the Form Trigger and copy its **Production URL**. Submit production requests through that URL; the Test URL only listens during a test execution. Use the form itself as the V1 input and review surface.

## Human approval

The native n8n Form page displays plain Markdown in an escaped text block (`<pre>`), preserving the literal source URLs for review/copying. It offers **Approve** or **Request revision**, with a feedback field. Each review wait has a 24-hour limit; the workflow never treats an expired wait as approval. A revision uses the existing validated evidence and returns to the same review step. It does not launch new research or add facts from model memory.

There are at most three revision cycles, each with at most one malformed-output repair attempt. A fourth request for revision ends the execution with an unapproved draft and an explanation; it never converts a revision request into approval. Reaching an error path or receiving an invalid decision also must not produce an approved report. The approved Markdown is returned as `report_markdown` in the final-output node and displayed on the form completion page. It is not sent to email or another external service.

## Evidence and failure handling

- Every selected competitor must have a supporting URL from the discovery search. Claims retain their source URLs and are checked against retrieved evidence.
- Research evidence preserves source snippets and URLs. The four search branches are combined for each competitor without mixing profiles across competitors.
- Unsupported or conflicting claims are removed from the supported profile; gaps and conflicts retain their retrieved audit-source URLs. The workflow preserves the Evidence Gaps / Conflicts and Sources sections after synthesis and revision, even if the model omits them. If a validator response cannot be safely interpreted, the workflow conservatively suppresses that profile's factual claims.
- Missing pricing is rendered as **Pricing not verified**. It is not inferred from memory or hidden.
- Discovery receives at most one rewritten-query retry on empty/error results. Each research search has one explicit transport-error retry; an empty successful result proceeds to evidence validation. Generated queries are capped at 400 characters and 50 words.
- A competitor can take at most one targeted evidence retry. New evidence is merged with the existing evidence, then the extractor and validator run again. Exhausting the retry produces a partial record rather than an endless loop.
- Search/tool failures and malformed model output become local diagnostics. A structured-output failure receives one strict repair attempt; an unrepaired response remains available as raw diagnostic output with an explicit fallback/gap.
- A failed query planner uses deterministic queries. An unrepaired extractor/validator yields a conservative incomplete profile. Failed synthesis uses a sourced deterministic report; failed revision preserves the prior draft for human review.
- No verified competitors produces an explicit insufficient-evidence draft that still goes through human review.

## Local checks and manual testing

From the repository directory:

```sh
npm run build
npm run validate
npm test
```

The compact implementation passed 41 offline tests and all 127 native node-parameter checks; the recorded results are in [docs/testing.md](docs/testing.md). These commands regenerate and inspect the workflow and exercise the offline control/evidence logic. They do not call You.com or Gemini, import into your workspace, or execute an n8n form. The [test guide](docs/testing.md) separates offline checks from the required manual credentialed checks. No live research run or cloud import is claimed by the illustrative sample.

## Limitations

- This repository cannot verify the user's saved n8n credentials, installed node availability, model quota, or provider authorization. These must be checked after import.
- Search snippets can be incomplete, stale, or contradictory. A source link alone does not prove a claim; Gemini validation and human review remain necessary.
- The model can fail to follow instructions. Source allow-lists, schema checks, conservative fallback behavior, and human approval reduce that risk but are not a proof of factual accuracy.
- Human review is part of the same n8n form execution. This V1 does not add a separate reviewer account or external approval service.
- Execution state is not durable cross-session memory. n8n execution retention and workspace access settings govern stored inputs, evidence, and diagnostics.
- Provider latency, limits, repairs, and human revisions determine completion time and usage. Synthesis/revision allow up to 12,000 output tokens per model call; other stages allow 8,192. These are ceilings, not guaranteed usage. The demo's “few minutes” goal and provider cost require a credentialed run to measure.

## Repository structure

```text
docs/
  architecture.md             Authoritative architecture
  codex-master-prompt.md       Implementation requirements
  node-map.md                  Exact exported node inventory
  node-contracts.md            Pinned native n8n compatibility checks
  testing.md                   Offline and credentialed test guide
prompts/
  agent-prompts.md             Grounded agent instructions
sample_outputs/
  perplexity-analysis.md       Illustrative expected-output template
workflow/
  competitor-research-agent.json  Importable n8n workflow
  lib/                        Embedded schemas and runtime functions
  README.md                   Workflow artifact notes
scripts/
  build-workflow.js            Reproducible export generation
  bundle-runtime.js            Per-node helper dependency linker
  validate-workflow.js         Static workflow checks
  check-node-contracts.js      Optional released-node parameter checks
tests/
  runtime.test.js              Offline behavior tests
  workflow-scenarios.test.js   Exported graph simulations with mocked services
  workflow-size.test.js        Payload size and selective-bundling regressions
package.json                  Local commands; no runtime dependencies
```

The repository also includes the local generation/validation/test tooling used by the package scripts. [sample_outputs/perplexity-analysis.md](sample_outputs/perplexity-analysis.md) is explicitly an illustrative template, not a live competitive analysis.
