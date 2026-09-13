const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const ts=require('../../../node_modules/typescript');
const target=path.resolve('tmp/t06-domain-review'); fs.mkdirSync(target,{recursive:true});
for(const name of ['practice','scenario','scenario-content']) fs.writeFileSync(`${target}/${name}.js`,ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);
const scenario=require(`${target}/scenario.js`), flow=require(`${target}/practice.js`);
const context={content_band:'L2',speed:'natural',support:'minimal',listening_status:'unknown',speaking_status:'unobserved'};
let scenes=scenario.applyScenarioEvent(scenario.createScenarioSession(context),{type:'choose-start',kind:'school'});
scenes=scenario.applyScenarioEvent(scenes,{type:'confirm'});
for(const part of ['dialogue','media','check']) {const v=scenes.versions.at(-1);scenes=scenario.applyScenarioEvent(scenes,{type:'demo-step',version_id:v.id,request_id:v.request_id,part,outcome:'ready'});}
const version=scenes.versions.at(-1), initial=flow.createPracticeSession(version), results=[];
const act=(s,type,rest={})=>flow.applyPracticeEvent(s,{type,...rest});
const end=(s,at)=>{const match={utterance_id:s.current_utterance.id,goal_revision:s.goal_revision,source:'simulation'}; return act(act(s,'playback-started',{...match,at:at-10}),'playback-ended',{...match,at});};
function check(name,run){try{run();results.push({name,result:'pass'});}catch(e){results.push({name,result:'fail',message:e.message});}}
check('full confirmed content and support preferences retained without assessment',()=>{assert.deepEqual(initial.learning_context,context);const restored=flow.readPracticeSession(JSON.stringify(initial),version);assert.deepEqual(restored.learning_context,context);assert.equal(restored.eligible_for_assessment,false);});
check('ask and repeat meanings produce distinct effects; repeat replays preceding question',()=>{let s=act(act(initial,'enter-practice'),'allow-playback'); const question=s.current_utterance.text;s=end(s,1000);s=act(s,'tick',{at:7000});s=end(s,8000);s=act(s,'tick',{at:14000});const before=structuredClone(s);const ask=act(s,'choose-meaning',{choice_id:'ask'}),again=act(s,'choose-meaning',{choice_id:'again'});assert.notEqual(ask.current_utterance.text,again.current_utterance.text);assert.equal(again.current_utterance.text,question);assert.equal(again.current_utterance.role_id,initial.roles[0].id);assert.deepEqual(s,before);});
check('late failure after terminal playback end leaves waiting intact',()=>{let s=end(act(act(initial,'enter-practice'),'allow-playback'),1000);const before=structuredClone(s);s=act(s,'playback-failed',{utterance_id:s.current_utterance.id,goal_revision:s.goal_revision});assert.deepEqual(s,before);});
const suffix=process.argv.includes('--red')?'red':'green';fs.writeFileSync(`docs/evidence/t06/domain-review-${suffix}.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));process.exitCode=results.every(r=>r.result==='pass')?0:1;
