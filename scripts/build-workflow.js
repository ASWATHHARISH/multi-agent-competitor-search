'use strict';
const fs = require('node:fs'), path = require('node:path'), {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const schemas = require('../workflow/lib/schemas');
const runtime = fs.readFileSync(path.join(root,'workflow/lib/runtime.js'),'utf8').replace(/^'use strict';\s*/, '').replace(/module\.exports = [\s\S]*$/, '');
const promptFile = fs.readFileSync(path.join(root,'prompts/agent-prompts.md'),'utf8').replace(/\r\n/g,'\n');
const section = heading => { const text=promptFile.split('## '+heading+'\n')[1]; if(!text) throw Error('Missing prompt '+heading); return text.split('\n## ')[0].trim(); };
const prompts = {
orchestrator:section('Orchestrator / Research Planner'), discovery:section('Competitor Discovery Agent'), planner:section('Research Query Planner'), extractor:section('Structured Research Extractor'),
validator:section('Evidence Validator')+'\nAudit format: every unsupported_claims or conflicts item MUST be a string starting with a schema field path and colon, such as pricing: conflicting prices at URL1 and URL2, or core_features[0]: claim not supported. Include conflicting source URLs in the explanation. Use *: if the whole profile is unreliable. Never mark pass while unresolved issues remain.',
synthesis:section('Final Synthesis Agent')+'\nReturn Markdown inside JSON with the single field report_markdown. Preserve all listed evidence gaps and conflicts including both source URLs. Cite every material factual paragraph and table row. Unknown pricing must explicitly say Pricing not verified.',
revision:section('Revision Agent')+'\nReturn Markdown inside JSON with the single field report_markdown. Keep all ten required headings, every listed evidence gap/conflict and their URLs. Cite every material factual paragraph/table row. Human feedback is not new research evidence.'
};
const nodes=[], connections={}, map=[];
const id=name=>{const h=createHash('sha256').update(name).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);};
function add(name,type,typeVersion,parameters,x,y,purpose,inputs='Execution state',outputs='Execution state',credential='None',extra={}){
nodes.push({parameters,id:id(name),name,type,typeVersion,position:[x,y],...extra});
map.push({name,purpose,inputs,outputs,credential,error:extra.onError==='continueRegularOutput'?'Continue to explicit inspection/fallback; no implicit retry':'Stop on unexpected configuration/programming error'});
return name;
}
function edge(from,to,output=0,input=0,type='main'){
connections[from]||={};connections[from][type]||=[];
while(connections[from][type].length<=output)connections[from][type].push([]);
connections[from][type][output].push({node:to,type,index:input});
}
function code(name,body,x,y,purpose,inputs,outputs){return add(name,'n8n-nodes-base.code',2,{mode:'runOnceForAllItems',jsCode:runtime+'\n'+body},x,y,purpose,inputs,outputs);}
function condition(name,expression,x,y,purpose){
return add(name,'n8n-nodes-base.if',2.2,{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:id(name+':condition'),leftValue:'={{ '+expression+' }}',rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},x,y,purpose,expression,'true output 0 / false output 1');
}
function stage(label,role,x,y){
const prep=code('Prepare: '+label,'return [{json:prepare($input.first().json, '+JSON.stringify(role)+', '+JSON.stringify(prompts[role])+', '+JSON.stringify(schemas[role])+')}];',x,y,'Preserve state and compose '+label+' prompt');
const raw=add('Agent: '+label,'@n8n/n8n-nodes-langchain.chainLlm',1.7,{promptType:'define',text:'={{ $json.llm_prompt }}',hasOutputParser:false,batching:{batchSize:1}},x+240,y,'Gemini '+label+' role; retain raw completion','Scoped role prompt','Raw JSON text or error','Via Gemini subnode',{onError:'continueRegularOutput'});
const parsed=code('Parse: '+label,'return [{json:readModel($('+JSON.stringify(prep)+').first().json,$input.first().json)}];',x+480,y,'Strict JSON/schema validation; preserve raw response');
const valid=condition('Valid JSON: '+label+'?','$json.llm.ok === true',x+720,y,'Accept valid output or make one repair attempt');
const repair=add('Repair JSON: '+label,'@n8n/n8n-nodes-langchain.chainLlm',1.7,{promptType:'define',text:'={{ $json.llm.repair_prompt }}',hasOutputParser:true,batching:{batchSize:1}},x+720,y+220,'Exactly one format repair without research','Raw completion + schema + error','Repaired object or error','Via Gemini subnode',{onError:'continueRegularOutput'});
const parser=add('Schema: '+label,'@n8n/n8n-nodes-langchain.outputParserStructured',1.3,{schemaType:'manual',inputSchema:JSON.stringify(schemas[role],null,2),autoFix:false},x+930,y+430,'Native structured parser for repair attempt');
const model=add('Gemini: '+label,'@n8n/n8n-nodes-langchain.lmChatGoogleGemini',1,{modelName:'models/gemini-2.5-flash',options:{temperature:0.1,maxOutputTokens:['synthesis','revision'].includes(role)?12000:8192}},x+300,y+410,'Static Google Gemini model for role and repair','Prompt','Completion','Google Gemini (googlePalmApi)');
const capture=code('Capture repair: '+label,'return [{json:readModel($('+JSON.stringify(parsed)+').first().json,$input.first().json,true)}];',x+1000,y+220,'Retain original raw response if repair also fails');
const end=code('State: '+label,'return [{json:finish($input.first().json)}];',x+1240,y,'Apply validated role output or safe local fallback');
edge(prep,raw);edge(raw,parsed);edge(parsed,valid);edge(valid,end);edge(valid,repair,1);edge(repair,capture);edge(capture,end);
edge(model,raw,0,0,'ai_languageModel');edge(model,repair,0,0,'ai_languageModel');edge(parser,repair,0,0,'ai_outputParser');
return {start:prep,end};
}
function search(label,dimension,query,x,y,discovery=false){
const prep=code('Query: '+label,'const s=clone($input.first().json);s.active_query=searchQuery('+query+');return [{json:s}];',x,y,'Cap You.com query at 400 characters / 50 words');
const params={serverTransport:'httpStreamable',endpointUrl:'https://api.you.com/mcp',authentication:'mcpOAuth2Api',tool:{__rl:true,mode:'id',value:'you-search'},inputMode:'json',jsonInput:'={{ {query:$json.active_query,count:6} }}',options:{timeout:60000}};
const tool=(name,tx,ty)=>add(name,'@n8n/n8n-nodes-langchain.mcpClient',1.1,params,tx,ty,'Official You.com Search the web and news using existing OAuth integration','active_query','Web/news evidence or error','Existing MCP OAuth2 (mcpOAuth2Api)',{onError:'continueRegularOutput',alwaysOutputData:true});
const first=tool('You.com: '+label,x+220,y);
const collect=code('Evidence: '+label,'const s=$('+JSON.stringify(prep)+').first().json;return [{json:captureSearch(s,$input.all().map(i=>i.json),'+JSON.stringify(dimension)+',s.active_query,new Date().toISOString())}];',x+440,y,'Normalize MCP evidence, preserving source URL/snippet/date');
const retry=condition('Retry tool: '+label+'?',discovery?'$json.search_result.tool_failed || $json.search_result.empty':'$json.search_result.tool_failed',x+660,y,discovery?'One rewritten discovery retry on empty/failure':'One transport retry on failure');
const retryPrep=code('Retry query: '+label,discovery?'const s=clone($input.first().json);s.active_query=searchQuery(s.target_company+" alternatives "+s.target_product+" "+s.geography);return [{json:s}];':'return [{json:clone($input.first().json)}];',x+660,y+200,discovery?'Rewrite discovery query once':'Preserve failed query for one transport retry');
const second=tool('You.com: '+label+' - transport retry',x+880,y+200);
const retryResult=code('Retry evidence: '+label,'const s=$('+JSON.stringify(retryPrep)+').first().json;return [{json:captureSearch(s,$input.all().map(i=>i.json),'+JSON.stringify(dimension)+',s.active_query,new Date().toISOString(),1)}];',x+1100,y+200,'Capture terminal retry result; no retry back edge');
const end=code('Search result: '+label,'return [{json:clone($input.first().json)}];',x+1330,y,'Always emit one state item including empty or failed search');
edge(prep,first);edge(first,collect);edge(collect,retry);edge(retry,retryPrep);edge(retry,end,1);edge(retryPrep,second);edge(second,retryResult);edge(retryResult,end);return {start:prep,end};
}
const trigger=add('N01 Research Request','n8n-nodes-base.formTrigger',2.4,{formTitle:'Competitor Research Request',formDescription:'Research evidence-backed competitors and review the draft before approval.',formFields:{values:[
{fieldLabel:'Company name',fieldName:'target_company',fieldType:'text',requiredField:true},
{fieldLabel:'Product / category',fieldName:'target_product',fieldType:'text'},
{fieldLabel:'Market context',fieldName:'market_context',fieldType:'textarea'},
{fieldLabel:'Geography',fieldName:'geography',fieldType:'text'},
{fieldLabel:'Notes',fieldName:'notes',fieldType:'textarea'}
]},options:{path:'competitor-research',buttonLabel:'Start research'}},0,0,'Native request form','Company/product/market/geography/notes','Submitted request','None',{webhookId:id('research-form')});
const norm=code('N02 Normalize Input','return [{json:normalize($input.first().json,new Date().toISOString())}];',240,0,'Clean request; initialize bounded execution state');
const validInput=condition('Input is researchable?','$json.input_valid === true',480,0,'Reject blank or one-character target');
const plan=stage('Orchestrator','orchestrator',720,0);
const discoverySearch=search('Discovery','discovery','s.research_plan.discovery_query',2200,0,true);
const discoveryEvidence=code('N04 Preserve Discovery Evidence','return [{json:attachDiscovery($input.first().json)}];',3760,0,'Retain discovery sources separately');
const discovery=stage('Discovery','discovery',4000,0);
const have=condition('Verified competitors found?','$json.competitors.length > 0',5500,0,'Explicit zero-result path');
const split=add('N06 Split Competitors','n8n-nodes-base.splitOut',1,{fieldToSplitOut:'competitors',include:'allOtherFields',options:{destinationFieldName:'competitor'}},5740,0,'One item per verified competitor','competitors[]','competitor');
const loop=add('N06 Loop Competitors','n8n-nodes-base.splitInBatches',3,{batchSize:1,options:{reset:false}},5980,0,'Serial competitors avoid subnode first-item ambiguity','Competitor items / completed records','0: done; 1: next competitor');
const init=code('N06 Initialize Competitor','return [{json:initializeCompetitor($input.first().json)}];',0,950,'Reset evidence retry budget for each competitor');
const queries=stage('Query Planner','planner',250,950);
const branches=[
search('Official Features','official','s.queries.official',1800,850),
search('Pricing','pricing','s.queries.pricing',1800,1450),
search('Positioning','positioning','s.queries.positioning',1800,2050),
search('Recent News','news','s.queries.news',1800,2650)];
const merge=add('N09 Merge Four Search Branches','n8n-nodes-base.merge',3.2,{mode:'append',numberInputs:4},3450,1450,'Wait for every branch including local failures','Four result states','Four result states');
const evidence=code('N09 Combine Research Evidence','return [{json:mergeEvidence($input.all().map(i=>i.json))}];',3700,1450,'Combine sources; reject mixed competitor identity');
const extractor=stage('Extractor','extractor',3950,1450);
const validator=stage('Validator','validator',5450,1450);
const retry=condition('N12 Evidence Retry Needed?','$json.validation.retry_needed === true && $json.retry_count < $json.max_retry',6940,1450,'One targeted evidence retry maximum');
const inc=code('N13 Increment Evidence Retry','return [{json:incrementRetry($input.first().json)}];',7200,1760,'Consume budget before search');
const retrySearch=search('Targeted Retry','retry','s.retry_query',7480,1760);
const append=code('N14 Append Retry Evidence','return [{json:attachRetry($input.first().json)}];',9050,1760,'Append evidence and repeat extraction/audit once');
const record=code('N15 Validated Competitor Record','return [{json:validatedRecord($input.first().json)}];',7200,1450,'Withhold unsupported/conflicting fields; retain gaps and audit evidence','Profile/audit/evidence','Safe competitor record');
const agg=add('N16 Aggregate Competitors','n8n-nodes-base.aggregate',1,{aggregate:'aggregateAllItemData',destinationFieldName:'records',options:{}},6300,-450,'Collect only completed competitor records','Records','records[]');
const scope=code('N16 Restore Research Scope','return [{json:aggregate($("State: Discovery").first().json,$input.first().json.records)}];',6560,-450,'Restore scope and discovery gaps');
const empty=code('N16 No Verified Competitors','return [{json:aggregate($input.first().json,[])}];',5980,-700,'Avoid dead end on empty competitor split');
const synthesis=stage('Synthesis','synthesis',0,3600);
const review=code('N18 Prepare Approval','return [{json:approvalView($input.first().json)}];',1550,3600,'Preserve latest draft and escape HTML');
const wait={limitWaitTime:true,limitType:'afterTimeInterval',resumeAmount:24,resumeUnit:'hours'};
const form=add('N18 Human Approval Form','n8n-nodes-base.form',2.4,{operation:'page',defineForm:'json',jsonOutput:'={{ JSON.stringify([{fieldType:"html",html:$json.review_html},{fieldLabel:"Decision",fieldName:"Decision",fieldType:"dropdown",fieldOptions:{values:[{option:"Approve"},{option:"Request revision"}]},requiredField:true},{fieldLabel:"Feedback",fieldName:"Feedback",fieldType:"textarea"}]) }}',...wait,options:{formTitle:'Review competitor briefing',buttonLabel:'Submit decision'}},1800,3600,'Native wait/resume approval form; expires unapproved','Escaped draft','Decision / Feedback','None',{webhookId:id('approval-form')});
const decision=code('N18 Capture Human Decision','return [{json:approval($("N18 Prepare Approval").first().json,$input.first().json)}];',2050,3600,'Restore trusted latest state after form replaces input');
const approved=condition('N19 Explicitly Approved?','$json.approval_status === "approved"',2300,3600,'Only explicit approval reaches final report');
const budget=condition('N19 Revision Budget Available?','$json.approval_status === "revision_requested" && $json.revision_count < $json.max_revisions',2550,3900,'At most three revisions, never automatic approval');
const revInc=code('N20 Increment Revision Count','return [{json:beginRevision($input.first().json)}];',2800,3900,'Increment revision count before model call');
const revision=stage('Revision','revision',3050,3900);
const output=code('N21 Approved Markdown Output','return [{json:approvedOutput($input.first().json)}];',2550,3600,'Guard approval; emit final report_markdown','Approved draft','report_markdown + audit state');
const finalForm=add('N21 Display Approved Report','n8n-nodes-base.form',2.4,{operation:'completion',respondWith:'showText',responseText:'={{ $json.final_html }}',...wait,options:{}},2800,3600,'Display approved Markdown in original form','Approved Markdown','Completed form');
const stopped=code('Unapproved Outcome','const s=clone($input.first().json);s.approval_status="not_approved";delete s.report_markdown;s.final_html="<h2>No report was approved</h2><p>The input was invalid, the form expired, or the revision limit was reached. The execution retains any draft and diagnostics. Start a new request to continue.</p>";return [{json:s}];',4750,4350,'Terminal unapproved result for invalid input/timeout/exhausted revisions');
const stoppedForm=add('Display Unapproved Outcome','n8n-nodes-base.form',2.4,{operation:'completion',respondWith:'showText',responseText:'={{ $json.final_html }}',...wait,options:{}},5030,4350,'End form without approved output');
edge(trigger,norm);edge(norm,validInput);edge(validInput,plan.start);edge(validInput,stopped,1);
edge(plan.end,discoverySearch.start);edge(discoverySearch.end,discoveryEvidence);edge(discoveryEvidence,discovery.start);edge(discovery.end,have);
edge(have,split);edge(have,empty,1);edge(split,loop);edge(loop,agg,0);edge(loop,init,1);edge(init,queries.start);
branches.forEach((b,i)=>{edge(queries.end,b.start);edge(b.end,merge,0,i);});
edge(merge,evidence);edge(evidence,extractor.start);edge(extractor.end,validator.start);edge(validator.end,retry);
edge(retry,inc);edge(retry,record,1);edge(inc,retrySearch.start);edge(retrySearch.end,append);edge(append,extractor.start);edge(record,loop);
edge(agg,scope);edge(scope,synthesis.start);edge(empty,synthesis.start);edge(synthesis.end,review);edge(review,form);edge(form,decision);edge(decision,approved);
edge(approved,output);edge(approved,budget,1);edge(budget,revInc);edge(budget,stopped,1);edge(revInc,revision.start);edge(revision.end,review);edge(output,finalForm);edge(stopped,stoppedForm);
const workflow={name:'Multi-Agent Competitor Research - You.com + Gemini',nodes,pinData:{},connections,active:false,settings:{executionOrder:'v1',saveManualExecutions:true,saveDataErrorExecution:'all',saveDataSuccessExecution:'all'},tags:[]};
fs.writeFileSync(path.join(root,'workflow/competitor-research-agent.json'),JSON.stringify(workflow,null,2)+'\n');
const cell=value=>value.replace(/\|/g,'\\|').replace(/\n/g,' ');
const table=map.map((n,i)=>'| '+[i+1,...['name','purpose','inputs','outputs','credential','error'].map(k=>cell(n[k]))].join(' | ')+' |').join('\n');
fs.writeFileSync(path.join(root,'docs/node-map.md'),'# Node map\n\nGenerated by npm run build; names exactly match the workflow. Agent roles use Basic LLM Chains with Google Gemini subnodes. References use the latest saved state of a single-item stage; competitors run serially.\n\n| # | Exact n8n node name | Purpose | Key inputs | Key outputs | Credential required | Error behavior |\n|---|---|---|---|---|---|---|\n'+table+'\n\nOnly three back edges exist: completed record to competitor loop (up to three items), targeted retry to extraction (once per competitor), revision to approval (at most three). Tool retries and JSON repairs are forward-only. Every form wait expires after 24 hours; missing approval ends unapproved.\n');
console.log('Built '+nodes.length+' nodes.');
