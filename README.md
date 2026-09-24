# Multi-Agent Competitor Research Agent

Week 3 Agentic AI project: a multi-agent competitor intelligence workflow built in **n8n**.

## Goal
Given a target company or product, the system discovers the top competitors, researches each one using fresh web and news data, extracts structured competitive intelligence, validates evidence, and produces a reviewable briefing.

## Planned workflow
1. User input / trigger
2. Orchestrator
3. Competitor Discovery Agent
4. Research loop for each competitor
5. Structured Extraction Agent
6. Evidence Validation Agent
7. Analysis / Synthesis Agent
8. Human approval
9. Final report / export

## Core integrations
- n8n
- You.com Web Search / Web Access
- Google Gemini
- GitHub

## Reliability requirements
- retry search failures
- rewrite weak/empty queries
- continue if one competitor fails
- never invent missing pricing or facts
- flag unsupported claims
- require human review before any final write/export action

## Repository structure
```text
.
├── docs/
│   └── architecture.md
├── prompts/
│   └── agent-prompts.md
├── sample_outputs/
│   └── README.md
├── screenshots/
│   └── .gitkeep
├── workflow/
│   └── README.md
├── .env.example
└── README.md
```

The exported n8n workflow will be added under `workflow/` once the build is complete.
