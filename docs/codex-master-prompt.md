# Codex Master Prompt — Build the Week 3 n8n Project

You are implementing an existing repository for my Week 3 Agentic AI project.

Repository: `ASWATHHARISH/multi-agent-competitor-search`

## Objective
Build a complete, importable n8n workflow for a **Multi-Agent Competitor Research / Market Research Agent**.

The workflow must demonstrate genuine agentic behavior: multi-step control flow, tool use, state across the run, failure recovery, evidence validation, and human-in-the-loop approval. It must not be a single LLM call.

## Existing services already configured by the user in n8n Cloud
- You.com Web Access & AI credential via OAuth. The user has already tested **Search the web and news** successfully.
- Google Gemini API credential. The user has already saved the API key in n8n.
- Do not ask the user to paste credentials into source code.
- Do not commit secrets.

## Required implementation
Use the detailed specification in:
- `docs/architecture.md`
- `prompts/agent-prompts.md`

Treat those files as authoritative.

### Main path
1. n8n Form Trigger receives target company plus optional product/category, market context, geography.
2. Normalize input/state.
3. Gemini Orchestrator/Research Planner returns structured JSON.
4. You.com search performs competitor discovery.
5. Gemini Competitor Discovery Agent chooses up to 3 evidence-backed direct competitors.
6. Split competitors into individual items.
7. Gemini Research Query Planner creates focused queries.
8. For each competitor run You.com searches for:
   - official/features
   - pricing
   - positioning/target users
   - recent news
9. Merge research evidence while preserving source URLs/snippets.
10. Gemini Structured Research Extractor returns the specified JSON schema.
11. Gemini Evidence Validator audits claims against retrieved evidence.
12. If retry is needed and retry_count < 1, perform exactly one targeted You.com retry and validate again.
13. Continue gracefully when a competitor or field remains incomplete.
14. Aggregate all competitor profiles.
15. Gemini Final Synthesis Agent produces a sourced Markdown briefing.
16. Add a human-in-the-loop approval step using native n8n functionality available in current n8n Cloud. Prefer a Wait/Form approval pattern.
17. If revision is requested, pass human feedback to a Revision Agent and return to approval.
18. If approved, return the final Markdown report.

## Critical engineering constraints
- No infinite loops.
- Maximum one evidence retry per competitor.
- Keep failures local: one competitor failure must not terminate the whole run.
- Configure appropriate n8n error behavior/continue-on-fail only where it is safe.
- Prefer standard built-in n8n nodes and nodes already available in n8n Cloud.
- Use the installed You.com integration, not an invented API implementation.
- Use Google Gemini Chat Model nodes for LLM stages.
- Use structured JSON outputs / parsers where n8n supports them.
- Avoid unnecessary services: no Pinecone, Supabase, Neo4j, Mem0, external database, or RAG store.
- Do not add Docker, a backend server, or a separate frontend. The n8n form is enough for V1.
- Do not require credentials inside the exported JSON.
- If n8n credential IDs cannot be portable, leave the nodes configured so the user only needs to re-select the existing credential after import. Document exactly which nodes require this.
- Do not fabricate node types. Use node types that exist in current n8n.
- If a preferred HITL node pattern is not available, use the closest standard n8n Wait/Form/Webhook-based approval approach and document the choice.

## Output schema expectations
Preserve the schemas from `docs/architecture.md` and `prompts/agent-prompts.md`.

## Files you must create/update

### 1. workflow/competitor-research-agent.json
A valid importable n8n workflow export.

### 2. README.md
Update it with:
- what the project does
- architecture summary
- prerequisites
- exact import/setup steps
- how to bind the You.com and Gemini credentials after import
- how to test
- how to activate the form
- failure handling
- human approval flow
- sample demo input
- limitations
- repo structure

### 3. docs/node-map.md
Create a table:
- node number
- exact n8n node name
- purpose
- key inputs
- key outputs
- credential required
- error behavior

### 4. docs/testing.md
Include at minimum:
- happy path test
- missing pricing test
- weak search / retry test
- one-competitor failure test
- malformed model output test
- human revision test
- final approval test

For each: input, expected behavior, pass criteria.

### 5. sample_outputs/perplexity-analysis.md
If the workflow cannot be executed from your environment because credentials are intentionally unavailable, create a clearly labelled **illustrative expected-output template**, not fabricated live research. Do not pretend it came from a real execution.

### 6. prompts/agent-prompts.md
Keep the current prompts unless a small implementation-specific adjustment is necessary. Any changes must preserve evidence-grounding rules.

## Validation before finishing
Before saying the build is complete:
1. Validate that the n8n JSON is syntactically valid JSON.
2. Inspect all connections and verify there are no orphaned required nodes.
3. Check expression references for likely broken node names/fields.
4. Confirm no secrets are committed.
5. Confirm the workflow includes a retry path and HITL path.
6. Confirm each material factual output is designed to retain source URLs.
7. Confirm the workflow cannot loop forever.
8. Provide a concise list of any manual actions the user must take after import.

## Do not
- ask me to redesign the architecture
- switch to LangGraph
- add extra infrastructure
- hardcode credentials
- claim to have run You.com/Gemini if you could not access those credentials
- silently remove evidence validation or human approval to make the workflow easier
- copy a cohort solution/template

## Test input
Use this as the default demo case:

Company: Perplexity AI
Product/category: AI search / answer engine
Market context: consumer and professional AI-powered web search

## Working style
Implement the project, inspect your own changes, fix obvious problems, and keep the solution as simple as possible while still satisfying all requirements. Do not stop after generating scaffolding; produce the actual workflow JSON and documentation.
