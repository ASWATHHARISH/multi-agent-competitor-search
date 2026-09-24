# Week 3 Architecture — n8n Multi-Agent Competitor Research

## One-liner
This agent helps founders, product teams, consultants, and analysts turn a company name into a sourced competitor-intelligence briefing by discovering three direct competitors, researching fresh web/news evidence, validating claims, and handing the draft to a human for approval before finalization.

## Why this architecture
The Week 3 brief requires an agentic system rather than a one-shot LLM call: it must decide what happens next, call tools, retain state, recover from tool failures, and include human handoff. Project 3A specifically calls for competitor discovery, fresh web/news research, structured extraction, and an orchestrator.

## V1 stack
- n8n Cloud
- You.com Web Access & AI / Web Search + News
- Google Gemini chat model
- GitHub for versioned workflow/docs
- n8n native Form / Wait / IF / Loop / Aggregate nodes for control flow

No vector database, RAG store, Neo4j, Mem0, or external database is required for V1.

## User input
Required:
- target_company

Optional:
- target_product
- market_context
- geography
- notes

## End-to-end node map

### N01 — Form Trigger: Research Request
Public/demo input surface.

Fields:
- Company name (required)
- Product / category (optional)
- Market context (optional)
- Geography (optional)

Output becomes the workflow state.

### N02 — Edit Fields: Normalize Input
Create a clean state object:

```json
{
  "target_company": "",
  "target_product": "",
  "market_context": "",
  "geography": "",
  "retry_count": 0,
  "max_retry": 1
}
```

### N03 — AI Agent: Orchestrator / Research Planner
Model: Google Gemini.

Responsibilities:
- validate the request
- create a concise research plan
- build one discovery query
- define what must be verified
- never choose competitors from memory without search evidence

Structured output:

```json
{
  "target_company": "",
  "discovery_query": "",
  "research_dimensions": [
    "pricing",
    "core_features",
    "target_users",
    "positioning",
    "differentiators",
    "recent_news"
  ]
}
```

### N04 — You.com: Competitor Discovery Search
Operation: Search the web and news.

Query comes from N03.

Goal:
Retrieve fresh results about direct competitors / alternatives to the target company.

### N05 — AI Agent: Competitor Discovery Agent
Model: Gemini.

Input:
- target company
- search results from N04

Responsibilities:
- choose exactly three direct competitors
- justify each using retrieved evidence
- return supporting URLs
- avoid selecting a company merely because it is famous

Output:

```json
{
  "competitors": [
    {
      "name": "",
      "reason": "",
      "evidence_urls": []
    }
  ]
}
```

Exactly 3 competitors are required when enough evidence exists. If fewer can be verified, continue with the verified set and flag the gap.

### N06 — Split Out: Competitors
Turn the competitors array into one n8n item per competitor.

From this point, research runs once per competitor.

### N07 — AI Agent: Research Query Planner
Model: Gemini.

Creates focused search queries for:
- official product / features
- pricing / plans
- positioning / target users
- recent news

Output example:

```json
{
  "competitor_name": "",
  "queries": {
    "official": "",
    "pricing": "",
    "positioning": "",
    "news": ""
  }
}
```

### N08A — You.com: Official / Feature Search
Search official site / product evidence.

### N08B — You.com: Pricing Search
Search current pricing / plan evidence.

### N08C — You.com: Positioning Search
Search market positioning / target-user evidence.

### N08D — You.com: Recent News Search
Search recent web/news developments.

Where possible:
- prioritize the competitor's own domain for product/pricing facts
- use current reputable sources for news

### N09 — Merge: Research Evidence
Combine the four search result streams for the current competitor.

Preserve URLs and snippets. Do not flatten away source provenance.

### N10 — AI Agent: Structured Research Extractor
Model: Gemini.

Convert evidence into:

```json
{
  "competitor_name": "",
  "official_site": "",
  "pricing": {
    "summary": "",
    "verified": false,
    "source_urls": []
  },
  "core_features": [
    {
      "claim": "",
      "source_urls": []
    }
  ],
  "target_users": [
    {
      "claim": "",
      "source_urls": []
    }
  ],
  "positioning": {
    "summary": "",
    "source_urls": []
  },
  "differentiators": [
    {
      "claim": "",
      "source_urls": []
    }
  ],
  "recent_news": [
    {
      "summary": "",
      "date": "",
      "source_urls": []
    }
  ],
  "missing_fields": [],
  "all_source_urls": []
}
```

Rules:
- do not invent data
- if pricing is unavailable, use `Pricing not verified`
- keep source URLs beside the claims they support

### N11 — AI Agent: Evidence Validator
Model: Gemini.

Audit N10 against N08/N09 evidence.

Output:

```json
{
  "validation_status": "pass",
  "unsupported_claims": [],
  "conflicts": [],
  "missing_important_fields": [],
  "retry_needed": false,
  "retry_query": ""
}
```

Allowed statuses:
- pass
- partial
- retry

### N12 — IF: Retry Needed?
Condition:
`retry_needed == true AND retry_count < max_retry`

NO:
continue to N15.

YES:
continue to N13.

### N13 — Edit Fields: Increment Retry Count
Increment retry_count by 1.

### N14 — You.com: Targeted Retry Search
Run the validator-generated retry query.

Feed new evidence back into the extractor/validator path exactly once.

No infinite loops.

### N15 — Merge: Validated Competitor Record
Combine the structured profile and validation result.

If a competitor is only partially verified, retain it with explicit evidence gaps rather than crashing the whole workflow.

### N16 — Aggregate: All Competitors
After the split/loop completes, collect all competitor records into one array.

### N17 — AI Agent: Final Synthesis Agent
Model: Gemini.

Create a Markdown competitor-intelligence briefing containing:

1. Research scope
2. Executive summary
3. Comparison table
4. Pricing comparison
5. Core feature comparison
6. Positioning / target audience
7. Key differentiators
8. Recent developments
9. Evidence gaps / unresolved conflicts
10. Sources

Rules:
- only use validated evidence
- distinguish facts from uncertainty
- never hide missing data
- every material factual section should preserve source URLs

### N18 — Human-in-the-Loop Approval
Preferred implementation:
n8n Wait / Form approval step.

Show the draft and ask:
- Approve
- Request revision
- Feedback text

This is the mandatory human handoff before the final write/export action.

### N19 — IF: Approved?
YES -> N21.
NO -> N20.

### N20 — AI Agent: Revision Agent
Model: Gemini.

Revise only according to the human feedback while preserving evidence constraints.

Return to N18 for another approval.

### N21 — Final Output
Return the approved Markdown report as the final workflow output.

For V1 do not auto-send email, post externally, or write to a third-party system. The approved report itself is sufficient for the demo.

## Failure handling

### You.com tool failure
- allow one retry
- if still failing, continue with partial data
- mark the affected competitor / field as incomplete

### Empty search result
- generate one narrower/rewritten search query
- retry once
- if still empty, mark unavailable

### One competitor research path fails
Do not terminate the entire run. Continue with the other competitors and surface the failed competitor in `evidence gaps`.

### LLM returns malformed JSON
Use structured output parsing where supported. If parsing fails:
1. retry once with a strict repair prompt
2. if still invalid, route to an error output with the raw model response

### Conflicting sources
Never silently choose one. Preserve the conflict, show both sources, and flag it in the final report.

### Hallucination protection
A claim without evidence must be removed or marked unverified.

## State
State lives inside the current n8n execution for V1.

Track:
- original user input
- research plan
- discovered competitors
- current competitor
- retry count
- search evidence
- structured profile
- validation result
- final report
- human approval status / feedback

Persistent cross-session memory is intentionally excluded from V1 because Project 3A does not require it and it would add unnecessary complexity.

## Demo test case
Use:

```text
Company: Perplexity AI
Product/category: AI search / answer engine
Market context: consumer and professional AI-powered web search
```

Success criteria:
- returns 2–3 evidence-backed competitors
- produces a sourced comparison briefing
- survives at least one missing/weak field without crashing
- exposes human approval before finalization
- completes in a few minutes
