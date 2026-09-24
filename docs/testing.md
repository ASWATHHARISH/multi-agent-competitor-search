# Validation and test guide

The tests below distinguish offline repository checks from an execution inside the user's n8n workspace. You.com and Gemini credentials are intentionally not available in the development environment. A successful offline test does **not** establish that cloud import, provider calls, or the review form have run successfully.

## Offline checks

Use Node.js 18 or newer in the repository directory:

```sh
npm run build
npm run validate
npm test
```

Inspect the output and exit status of each command. Validation should cover JSON syntax, real node types/versions, unique IDs/names, existing connection endpoints, expression references, reachable required nodes, model/parser connections, credential omissions, bounded retry/revision paths, and final-output approval gating. Logic tests should exercise source filtering, strict output validation, state preservation, conservative fallbacks, and loop bounds.

These checks operate on exported JSON and local functions. They cannot prove n8n's runtime node compatibility, paired-item behavior, a provider's response shape, or browser form behavior. Complete the manual cases below before using the production form.

## Completed offline validation (2026-09-24)

- npm run build: passed; generated the actual 138-node export.
- npm run validate: passed; 144 main connections, 21 model/parser connections, 47 expressions, 72 Code-node bodies, and 28 named-node references checked. No missing required node, unknown cycle, credential payload, or approval bypass was found.
- npm test: passed, 36 tests. This includes five simulations that execute the exported Code nodes and expressions with mocked providers/native scheduling: local competitor failure plus pricing recovery and revision/approval, empty discovery, revision exhaustion, approval timeout, and invalid input.
- node scripts/check-node-contracts.js: passed all 138 native n8n parameter checks against pinned released descriptors. See [node-contracts.md](node-contracts.md) for optional reproduction dependencies and scope.
- git diff --check: passed.

These are actual local results. No authenticated You.com/Gemini request, live Cloud import, or browser form execution was performed. Those manual acceptance cases remain pending below.

## Manual setup

1. Import `workflow/competitor-research-agent.json` into n8n and leave it inactive for testing.
2. Confirm the built-in MCP Client node loads (`@n8n/n8n-nodes-langchain.mcpClient`, version 1.1). The exported You.com nodes use the official `https://api.you.com/mcp` endpoint, HTTP Streamable transport, OAuth2, and the `you-search` tool. No community-node package installation is required.
3. Select the existing You.com MCP OAuth2 credential on all 12 `You.com:` nodes: six primary searches and their six explicit retry copies. Select the existing Google Gemini API credential on all seven `Gemini:` model subnodes: Orchestrator, Discovery, Query Planner, Extractor, Validator, Synthesis, and Revision. See `docs/node-map.md` for the exact inventory. If the default `models/gemini-2.5-flash` model is unavailable, select an available text-capable Gemini model on each of the seven subnodes and record that selection with the test results.
4. Run the workflow from the Form Trigger's test URL. Use the browser form to continue into human review.
5. Inspect the execution data and rendered review form for every case. Input field keys are `target_company`, `target_product`, `market_context`, `geography`, and `notes`; human review returns `Decision` and `Feedback`. Record execution ID, date, n8n version, model selection, observed behavior, and pass/fail. Do not save secrets in fixtures or logs committed to the repository.

For fault injection, use a **duplicate inactive test workflow**. Temporarily replace or pin the relevant provider/model response, preserving the expected item/envelope shape, or temporarily configure just that test node to fail. n8n only uses pinned data in supported manual/test executions, not production executions. Remove all pins and restore the original nodes before activation. A deliberately disabled node is not necessarily equivalent to an error response; verify the actual downstream item.

## Required cases

### 1. Happy path

**Input:** Company name `Perplexity AI`; Product / category `AI search / answer engine`; Market context `consumer and professional AI-powered web search`; Geography blank.

**Expected behavior:** The orchestrator generates a discovery query. You.com supplies fresh evidence. Discovery chooses three competitors when supported, or fewer with a stated gap. Each selected competitor receives four research searches, extraction, validation, and any justified bounded retry. Synthesis reaches the review form.

**Pass criteria:** The report contains every required section from `prompts/agent-prompts.md`; every material factual profile claim has a usable retrieved URL; no unverified competitor is invented; state stays with the correct competitor. The draft is visibly unapproved until a human submits Approve. Record runtime and provider usage rather than assuming the “few minutes” goal was met. Model output limits are 12,000 tokens for synthesis/revision and 8,192 for the other stages; repairs and repeated research/revision stages add calls.

### 2. Missing pricing

**Input:** Demo input with one competitor's pricing search replaced by a successful empty result, and all other supplied evidence for that competitor lacking pricing. Keep that competitor's targeted retry empty for pricing too.

**Expected behavior:** The workflow uses `Pricing not verified`, with `verified: false`; it may make its one targeted evidence retry when warranted. Other verified fields and competitors remain available.

**Pass criteria:** No fabricated plan, price, currency, or billing period appears. The missing pricing is present in the profile's gaps and the final briefing. The competitor's evidence retry count never exceeds one.

### 3. Weak search and targeted retry

**Input:** Demo input with weak/empty evidence for an important field. Supply a valid validator result with `retry_needed: true` and a specific `retry_query`. Make the targeted retry return evidence for the missing field.

**Expected behavior:** Only that competitor enters the targeted retry path. The counter increments before the search. The retry evidence is appended to the original evidence, then extraction and validation repeat.

**Pass criteria:** Exactly one targeted evidence retry executes for that competitor. Earlier sources remain available. A second validator request for retry does not cause a second evidence retry. The next competitor starts with a fresh retry counter of zero. Separate transport retries, if any, use the explicit bounded tool-error path.

### 4. One competitor fails

**Input:** Demo input with two or three evidenced competitors. For one competitor only, inject You.com error outputs or repeated model/schema failures; leave the remaining competitors' responses valid.

**Expected behavior:** Safe local error handling creates an incomplete competitor record with diagnostics/gaps, then returns control to the loop. Other competitors continue.

**Pass criteria:** The execution reaches synthesis and human review. The failed competitor is reported with its limitation, and successful competitors retain their own evidence. There is no accidental association of one competitor's profile with another competitor's sources.

### 5. Malformed model output

**Input:** In the test copy, supply truncated JSON, valid JSON with a wrong schema/type, and non-JSON text at a structured model stage. Repeat with a malformed strict-repair response. Exercise the query-planner, extractor, and validator stages independently.

**Expected behavior:** Schema failure triggers one strict repair attempt. A repaired valid response continues normally. A second failure preserves the raw failed response and an error diagnostic and uses the stage's documented safe fallback.

**Pass criteria:** There is no unbounded parser/repair loop, no silently accepted wrong-type output, and no unsupported facts introduced by fallback. Failed planning creates focused deterministic queries; failed extraction or audit produces a conservative incomplete profile. The next competitor and human review still run.

### 6. Human revision

**Input:** On the draft review form choose `Request revision`, with feedback `Make the executive summary shorter and keep the evidence gaps explicit.`

**Expected behavior:** Gemini revises using only the validated evidence, then the new draft appears on the review form. Approval remains false.

**Pass criteria:** The feedback is retained in execution state; the requested edit is visible; source URLs and evidence gaps remain; no new research/unsupported facts are added; the final approved-output branch has not run. If the revision model fails, the previous draft remains available and the failure is explicit.

### 7. Final approval

**Input:** Submit `Approve` on the first review form and, in a separate execution, after one successful revision.

**Expected behavior:** Only an explicit valid approval opens the approved final-output path and returns the currently reviewed Markdown report in `report_markdown`.

**Pass criteria:** The final report matches the approved draft, approval state is explicit, and no email/post/external write occurs. The review and completion pages display plain Markdown in escaped text blocks without interpreting model/retrieved HTML as active content. Copy the report from the page and verify that it matches `N21 Approved Markdown Output` → `report_markdown`. A missing or unrecognized decision cannot finalize the report.

## Additional boundary and evidence checks

### 8. No verified competitors

**Input:** Empty discovery evidence or a discovery output whose candidate URLs are absent from the actual retrieved results. Keep discovery's one rewritten-query retry empty too.

**Expected behavior:** Unverifiable candidates are rejected. The workflow produces an insufficient-evidence draft without entering an empty-item dead end and presents it for review.

**Pass criteria:** No made-up competitors appear; no research calls run for nonexistent competitors; synthesis/review are reachable; approval remains a human choice. Discovery retries no more than once.

### 9. Evidence URL and conflict protection

**Input:** An extracted profile containing one invented citation URL, one uncited claim, and conflicting prices supported by two retrieved URLs. Supply validator findings that identify the affected profile field paths.

**Expected behavior:** URLs outside the actual evidence are discarded; unsupported/conflicting factual claims are removed from the supported profile. The conflict remains visible with its retrieved audit-source URLs, even after its factual profile field is removed. The Evidence Gaps / Conflicts and Sources sections are restored from workflow state after synthesis/revision. An ambiguous/unparseable audit suppresses the factual profile conservatively.

**Pass criteria:** No unsupported claim survives as verified; both conflict sources remain available in the gaps/conflicts discussion; valid claims in unaffected fields survive a correctly targeted validator finding; the affected field is withheld conservatively as a whole. Merely attaching a valid URL to an unsupported claim does not bypass the validator.

### 10. Revision limit

**Input:** Request revision at every review step, including after the third revision.

**Expected behavior:** At most three revision cycles occur, each with at most one malformed-output repair attempt. The next request exits with an unapproved draft and a revision-limit explanation.

**Pass criteria:** The workflow terminates; the approved final-output node never executes; the draft remains clearly unapproved. A separate execution can still approve after its third revision.

### 11. Synthesis and revision failure

**Input:** Inject a model error, unusable output, or invalid citation into synthesis; separately inject a revision failure after submitting feedback.

**Expected behavior:** Synthesis uses its deterministic sourced fallback. Revision preserves the prior valid draft when no safe replacement is available. Human approval remains required.

**Pass criteria:** Required sections, evidence gaps, and retained URLs are present in the fallback; neither failure automatically approves the draft; diagnostic information identifies the failure.

### 12. Search transport error

**Input:** In one research branch, supply a transport/tool error for its first You.com call, then a valid response for its explicit retry copy. Repeat with errors for both attempts. Test discovery's error/empty retry separately.

**Expected behavior:** The error branch performs one explicit retry; a second failure becomes local diagnostic data. Discovery may rewrite the query once on error/empty results. An empty successful research result is handled by the competitor's shared evidence-retry budget, not an unbounded branch retry.

**Pass criteria:** No transport retry loops back indefinitely. A failed branch still supplies a normalized item to the evidence merge, so the other branches can complete. All `You.com:` retry copies have the same bound credential as the original node. Every generated query respects the workflow's 400-character/50-word cap.

### 13. Review wait timeout

**Input:** Start a test execution and leave the approval page unsubmitted beyond its configured 24-hour wait limit; a separate test copy may use a shorter timeout to exercise the path promptly.

**Expected behavior:** The configured wait expires according to n8n's form/runtime behavior. No explicit approval has been supplied.

**Pass criteria:** No approved report is emitted. Record the actual expiry behavior and user-visible message, and restore the 24-hour setting in the test copy before any demo.

### 14. Production form smoke test

**Input:** After removing test pins and restoring the original provider nodes, activate/publish the workflow and submit the demo through the Form Trigger's Production URL.

**Expected behavior:** A new production execution processes the request, renders review, accepts revision/approval, and returns final output just as the manual test does.

**Pass criteria:** The workflow runs without the editor waiting for a test trigger, the review continuation works in the browser, and the final approved report is available in the execution. Record any n8n workspace authentication, retention, or execution-limit behavior that affects the intended demo.

## Results record

The repository's illustrative report is **not** a test result. Credentialed You.com/Gemini calls, n8n import/runtime compatibility, and browser review/approval require manual execution in the user's workspace. Record actual results using a table such as this:

| Date / execution ID | Case | Environment / versions | Observed result | Pass/fail / follow-up |
| --- | --- | --- | --- | --- |
| Not executed | Credentialed manual cases above | User's n8n Cloud workspace | Credentials unavailable in development environment | Pending user execution |

Use offline command output or CI logs as evidence for local checks; do not turn an expected behavior or an illustrative example into a claimed successful run.
