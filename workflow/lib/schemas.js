'use strict';
const text = { type: 'string' };
const bool = { type: 'boolean' };
const array = (items) => ({ type: 'array', items });
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const urls = array(text);
const claim = object({ claim: text, source_urls: urls });
const summary = object({ summary: text, source_urls: urls });
module.exports = {
  orchestrator: object({ target_company: text, discovery_query: text, research_dimensions: array(text) }),
  discovery: object({ competitors: { ...array(object({ name: text, reason: text, evidence_urls: urls })), maxItems: 3 } }),
  planner: object({ competitor_name: text, queries: object({ official: text, pricing: text, positioning: text, news: text }) }),
  extractor: object({
    competitor_name: text, official_site: text,
    pricing: object({ summary: text, verified: bool, source_urls: urls }),
    core_features: array(claim), target_users: array(claim), positioning: summary,
    differentiators: array(claim), recent_news: array(object({ summary: text, date: text, source_urls: urls })),
    missing_fields: array(text), all_source_urls: urls,
  }),
  validator: object({
    validation_status: { type: 'string', enum: ['pass', 'partial', 'retry'] },
    unsupported_claims: array(text), conflicts: array(text), missing_important_fields: array(text),
    retry_needed: bool, retry_query: text,
  }),
  synthesis: object({ report_markdown: text }),
  revision: object({ report_markdown: text }),
};
