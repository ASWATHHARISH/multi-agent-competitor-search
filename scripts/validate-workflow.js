 'use strict';
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const root=path.resolve(__dirname,'..');
 function validate(w){
 const errors=[],check=(ok,msg)=>{if(!ok)errors.push(msg);},names=new Map(w.nodes.map(n=>[n.name,n])),ids=new Set(w.nodes.map(n=>n.id));
 check(names.size===w.nodes.length,'Duplicate names');check(ids.size===w.nodes.length,'Duplicate IDs');
 check(w.active===false,'Must import inactive');check(w.settings.executionOrder==='v1','v1 execution order required');
 const types={'n8n-nodes-base.formTrigger':2.4,'n8n-nodes-base.code':2,'n8n-nodes-base.if':2.2,'n8n-nodes-base.form':2.4,'n8n-nodes-base.splitOut':1,'n8n-nodes-base.splitInBatches':3,'n8n-nodes-base.merge':3.2,'n8n-nodes-base.aggregate':1,'@n8n/n8n-nodes-langchain.chainLlm':1.7,'@n8n/n8n-nodes-langchain.lmChatGoogleGemini':1,'@n8n/n8n-nodes-langchain.outputParserStructured':1.3,'@n8n/n8n-nodes-langchain.mcpClient':1.1};
 const main=[],ai=[];
 for(const [from,kinds] of Object.entries(w.connections)){
 check(names.has(from),'Unknown source '+from);
 for(const [type,outputs] of Object.entries(kinds)){
 check(['main','ai_languageModel','ai_outputParser'].includes(type),'Unknown connection kind '+type);
 outputs.forEach((targets,out)=>targets.forEach(e=>{
 check(names.has(e.node),'Unknown target '+e.node);check(e.type===type,'Connection kind mismatch '+from);
 const edge={from,to:e.node,out,input:e.index,type};(type==='main'?main:ai).push(edge);
 check(Number.isInteger(e.index)&&e.index>=0,'Invalid input '+e.node);
 if(type==='main'){
 check(out<(['n8n-nodes-base.if','n8n-nodes-base.splitInBatches'].includes(names.get(from)?.type)?2:1),'Invalid output '+from);
 check(e.index<(names.get(e.node)?.type==='n8n-nodes-base.merge'?names.get(e.node).parameters.numberInputs:1),'Invalid input index '+e.node);
 }
 }));
 }}
 const serialized=JSON.stringify(w.nodes);
 check(!/"credentials"\s*:/.test(serialized),'Portable export must omit credential IDs');
 check(!/(?:AIza[0-9A-Za-z_-]{25,}|sk-[0-9A-Za-z]{24,}|gh[pousr]_[0-9A-Za-z]{20,})/.test(serialized),'Possible embedded secret');
 let expressions=0,codeNodes=0,nodeReferences=0;
 function inspect(value,where){
 if(typeof value==='string'){
 for(const m of value.matchAll(/\$\(\s*(['"])([^'"]+)\1\s*\)/g)){nodeReferences++;check(names.has(m[2]),where+': broken ref '+m[2]);}
 if(value.startsWith('={{')&&value.endsWith('}}')){expressions++;try{new Function('$json','$','$input','return ('+value.slice(3,-2)+');');}catch(e){errors.push(where+': expression '+e.message);}}
 }else if(Array.isArray(value))value.forEach((v,i)=>inspect(v,where+'['+i+']'));
 else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>inspect(v,where+'.'+k));
 }
 for(const n of w.nodes){
 check(types[n.type]===n.typeVersion,'Unknown node type/version '+n.name);inspect(n.parameters,n.name);
 if(n.type==='n8n-nodes-base.code'){codeNodes++;try{new vm.Script('(function(){'+n.parameters.jsCode+'\n})');}catch(e){errors.push(n.name+': code syntax '+e.message);}}
 if(n.type.endsWith('.chainLlm')){
 check(n.onError==='continueRegularOutput',n.name+': local error handling missing');
 check(n.parameters.batching.batchSize===1,n.name+': batch must be one');
 check(ai.filter(e=>e.to===n.name&&e.type==='ai_languageModel').length===1,n.name+': model wiring');
 check(ai.filter(e=>e.to===n.name&&e.type==='ai_outputParser').length===(n.parameters.hasOutputParser?1:0),n.name+': parser wiring');
 }
 if(n.type.endsWith('.mcpClient')){
 const p=n.parameters;check(p.endpointUrl==='https://api.you.com/mcp'&&p.authentication==='mcpOAuth2Api',n.name+': OAuth endpoint');
 check(p.serverTransport==='httpStreamable'&&p.tool.value==='you-search'&&p.tool.mode==='id',n.name+': tool contract');
 check(n.onError==='continueRegularOutput'&&n.alwaysOutputData===true,n.name+': search failure continuation');
 check(!n.retryOnFail,n.name+': hidden retries forbidden');
 }
 if(n.type.endsWith('.outputParserStructured')){try{check(JSON.parse(n.parameters.inputSchema).type==='object',n.name+': schema');}catch(e){errors.push(n.name+': invalid schema');}check(n.parameters.autoFix===false,n.name+': extra repair forbidden');}
 }
 const starts=w.nodes.filter(n=>n.type==='n8n-nodes-base.formTrigger');check(starts.length===1,'One request trigger required');
 const reachable=new Set();function visit(name){if(reachable.has(name))return;reachable.add(name);main.filter(e=>e.from===name).forEach(e=>visit(e.to));}if(starts.length)visit(starts[0].name);
 for(const n of w.nodes)check(reachable.has(n.name)||ai.some(e=>e.from===n.name&&reachable.has(e.to)),'Orphan node '+n.name);
 const backs=new Set(['N15 Validated Competitor Record->N06 Loop Competitors','N14 Append Retry Evidence->Prepare: Extractor','State: Revision->N18 Prepare Approval']);
 for(const key of backs)check(main.some(e=>e.from+'->'+e.to===key),'Missing bounded path '+key);
 const colors=new Map();function dag(name){if(colors.get(name)===1){errors.push('Unrecognized cycle '+name);return;}if(colors.get(name)===2)return;colors.set(name,1);for(const e of main.filter(e=>e.from===name&&!backs.has(e.from+'->'+e.to)))dag(e.to);colors.set(name,2);}if(starts.length)dag(starts[0].name);
 const linked=(a,b,o=0)=>main.some(e=>e.from===a&&e.to===b&&e.out===o);
 check(linked('N06 Loop Competitors','N16 Aggregate Competitors',0),'Loop done output must aggregate');
 check(linked('N06 Loop Competitors','N06 Initialize Competitor',1),'Loop output must research');
 check(names.get('N06 Loop Competitors')?.parameters.batchSize===1&&names.get('N06 Loop Competitors')?.parameters.options.reset===false,'Loop state must be serial without reset');
 check(main.filter(e=>e.to==='N09 Merge Four Search Branches').map(e=>e.input).sort().join(',')==='0,1,2,3','Merge needs all four search inputs');
 check(linked('N19 Explicitly Approved?','N21 Approved Markdown Output')&&main.filter(e=>e.to==='N21 Approved Markdown Output').length===1,'Approval bypass');
 check(linked('N19 Revision Budget Available?','Unapproved Outcome',1),'Exhausted revision terminal missing');
 check(names.get('N12 Evidence Retry Needed?')?.parameters.conditions.conditions[0].leftValue.includes('$json.retry_count < $json.max_retry'),'Evidence budget guard missing');
 for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.form')){
 check(n.parameters.limitWaitTime===true&&n.parameters.resumeAmount===24&&n.parameters.resumeUnit==='hours',n.name+': finite wait required');
 if(n.parameters.operation==='completion')check(!main.some(e=>e.from===n.name),n.name+': final form must terminate');
 }
 const map=fs.readFileSync(path.join(root,'docs/node-map.md'),'utf8');for(const n of w.nodes)check(map.includes('| '+n.name+' |'),'Node map missing '+n.name);
 return {errors,counts:{nodes:w.nodes.length,mainConnections:main.length,aiConnections:ai.length,expressions,codeNodes,nodeReferences}};
 }
 if(require.main===module){const result=validate(JSON.parse(fs.readFileSync(path.join(root,'workflow/competitor-research-agent.json'),'utf8')));console.log(JSON.stringify(result,null,2));process.exitCode=result.errors.length?1:0;}
 module.exports={validate};
