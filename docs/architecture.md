# Architecture

## One-line agent definition
This agent helps product teams, founders, consultants, and analysts research a company and its competitive landscape by autonomously discovering competitors, gathering fresh web/news evidence, extracting structured facts, validating claims, and producing a concise competitor briefing for human review.

## Control flow
```text
User Input
   |
   v
Orchestrator
   |
   v
Competitor Discovery Agent
   |
   v
Top 3 Competitors
   |
   v
Research Loop
   |----> Web Search / News Search
   |----> Page Content Extraction when needed
   v
Structured Extraction Agent
   |
   v
Evidence Validation Agent
   |
   +---- weak / missing evidence ----> targeted retry / rewritten query
   |
   v
Analysis & Synthesis Agent
   |
   v
Human Review / Approval
   |
   v
Final Competitive Intelligence Brief
```

## Failure handling
- Search tool error: retry with limited attempts.
- Empty result set: rewrite the query once and retry.
- One competitor fails: continue with the remaining competitors and mark the failed section incomplete.
- Pricing cannot be verified: output `Pricing not verified`.
- Conflicting sources: preserve the conflict and cite both sources rather than guessing.
- Unsupported factual claim: reject or label it as unverified.
- Final export/write action: require human approval.

## State retained during a run
- target company
- optional market / product context
- discovered competitors
- research status per competitor
- source URLs
- extracted structured fields
- validation status
- retry counts
- approval status
- final briefing

Persistent cross-session memory is not required for V1.
