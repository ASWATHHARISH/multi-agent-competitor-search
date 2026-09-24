# Importable n8n workflow

Import [`competitor-research-agent.json`](competitor-research-agent.json) through n8n's **Import from File** menu, then bind the existing You.com MCP OAuth2 credential to all 12 `You.com:` nodes and the Google Gemini API credential to all seven `Gemini:` model subnodes. The export intentionally omits credential IDs and secrets.

The You.com nodes are native n8n MCP Client nodes configured for the official You.com MCP endpoint and `you-search` tool. No additional service or community-node installation is required.

See [the root README](../README.md) for exact setup, credential selection, test/production form use, and human approval. [The node map](../docs/node-map.md) lists every node and its credential/error behavior. [The test guide](../docs/testing.md) describes the checks that require the user's n8n workspace.

Regenerate the export with `npm run build`, check it with `npm run validate`, and run offline logic tests with `npm test` from the repository root. Keep the generator and committed JSON synchronized. Offline validation is not a credentialed n8n execution. After explicit human approval, copy the plain Markdown from the completion page or `N21 Approved Markdown Output` → `report_markdown` in the execution JSON.

## Compact export

The current export is 227,372 bytes with 127 nodes (previously 1,870,027 bytes and 138 nodes). Each Code node includes only its declared helper dependency closure from lib/runtime-dependencies.json. Generic all-role dispatchers are not exported. Seven simple query transformations use native Edit Fields; eleven no-op copy nodes have been removed. Empty pinData is omitted. Rebuild and validation reject exports at or above 500,000 bytes. No external runtime, sub-workflow import, or extra service is required.
