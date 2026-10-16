import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root='/Users/eric/projects/Learning English  Singapore';
const base=root+'/research/2026-09-10-learning';
const out=root+'/outputs/learning-pains-report-02';
const sources=JSON.parse(await fs.readFile(base+'/evidence.json','utf8'));
const data=JSON.parse(await fs.readFile(base+'/report-content.json','utf8'));
const searches=JSON.parse(await fs.readFile(base+'/search-queries.json','utf8'));
const queries=searches.flatMap(s=>s.q.map((q,i)=>[s.id,i+1,typeof q==='string'?q:q.q,typeof q==='string'?'':(q.domains||[]).join(', '),new Date('2026-09-10T00:00:00Z')]));
const wb=Workbook.create(),font='Helvetica Neue';
const summary=wb.worksheets.add('研究说明'),themes=wb.worksheets.add('学习痛点'),evidence=wb.worksheets.add('证据与边界'),catalog=wb.worksheets.add('Sources'),qsheet=wb.worksheets.add('检索记录');
function table(sheet,title,note,headers,rows,widths,name,height=120){
 const end=rows.length+4; sheet.showGridLines=false;
 sheet.getRangeByIndexes(0,0,end,headers.length).format.font={name:font,size:11,color:'#222222'};
 sheet.getRange('A1').values=[[title]];sheet.getRange('A1').format.font={name:font,size:15,bold:true,color:'#222222'};
 sheet.getRange('B2').values=[[note]];sheet.getRange('B2').format.font={name:font,size:10,italic:true,color:'#555555'};
 sheet.getRangeByIndexes(3,0,1,headers.length).values=[headers];
 if(rows.length)sheet.getRangeByIndexes(4,0,rows.length,headers.length).values=rows;
 const rg=sheet.getRangeByIndexes(3,0,rows.length+1,headers.length);
 rg.format.wrapText=true;rg.format.verticalAlignment='top';
 const t=sheet.tables.add(rg,true,name);t.style='TableStyleLight1';t.showFilterButton=true;
 const head=sheet.getRangeByIndexes(3,0,1,headers.length);head.format.fill='#E9E9E9';head.format.font={name:font,size:11,bold:true,color:'#222222'};head.format.rowHeight=30;
 rows.forEach((row,ri)=>{
   const lines=row.map((value,ci)=>{
     if(value===null || value instanceof Date || typeof value==='number')return 1;
     return String(value).split('\n').reduce((total,line)=>total+Math.max(1,Math.ceil([...line].reduce((n,ch)=>n+(ch.charCodeAt(0)>255?2:1),0)/(widths[ci]*0.9))),0);
   });
   const rr=sheet.getRangeByIndexes(4+ri,0,1,headers.length);
   rr.format.rowHeight=Math.max(36,Math.max(...lines)*15+12);
   rr.format.fill=ri%2===0?'#F5F5F5':'#FFFFFF';
 });
 widths.forEach((w,i)=>sheet.getRangeByIndexes(0,i,end,1).format.columnWidth=w);
 sheet.getRange('A1').format.rowHeight=28;sheet.getRange('A2').format.rowHeight=24;sheet.getRange('A3').format.rowHeight=9;
 sheet.freezePanes.freezeRows(4);sheet.freezePanes.freezeColumns(1);return end;
}
const cend=table(catalog,'来源目录','日期未显示年份时保留原样；复用、复核、新增与直接输入分开记录。',
 ['编号','平台','原文标题','署名','核实绝对日期','日期说明','访问程度','证据用途','资料批次','同人或重复组','原始URL','原文定位'],
 sources.map(e=>[e.id,e.platform,e.title,e.author||'',e.date?new Date(e.date+'T00:00:00Z'):null,e.date_note,e.access,e.use,e.batch,e.event_group,e.url||'本轮用户直接陈述，无公开链接',e.locator]),
 [11,21,47,25,17,40,17,17,21,20,70,44],'SourcesTable');
catalog.getRange('E5:E'+cend).setNumberFormat('yyyy-mm-dd');
catalog.getRange('K5:K'+cend).format.font={name:font,size:10,color:'#315D82'};
const eend=table(evidence,'证据与边界','每条保留具体观察及不能推断的内容；材料条数不是受访人数。',
 ['编号','证据用途','人群及地区','英语起点','具体观察','主题','解释边界','原始URL','原文短摘','译文'],
 sources.map(e=>[e.id,e.use,e.population+'\n地区：'+e.scope,e.proficiency,e.finding,e.themes.join(', '),e.limitation,e.url||'本轮直接输入',e.quote||'',e.translation||'']),
 [11,17,48,40,64,19,76,70,47,47],'EvidenceTable');
evidence.getRange('H5:H'+eend).format.font={name:font,size:10,color:'#315D82'};
table(themes,'英语学习痛点','次序沿学习过程排列；不代表发生率或商业价值排名。',
 ['编号','问题','纳入定义','解释边界','证据范围','例证编号','下一步验证问题','原文URL'],
 data.painDefinitions.map(e=>[e.id,e.name,e.definition,e.exclude,e.confidence,e.refs.join(', '),e.question,e.refs.map(id=>sources.find(s=>s.id===id).url).join('\n')]),
 [11,29,48,51,43,32,49,75],'ThemesTable');
const qend=table(qsheet,'检索记录','公开网络检索与小红书站内检索；检索次数不是样本量。',
 ['检索组','组内序号','检索式','域名限制或站内平台','执行日期'],queries,[27,14,91,42,18],'QueriesTable');
qsheet.getRange('E5:E'+qend).setNumberFormat('yyyy-mm-dd');
qsheet.getRange('B5:B'+qend).setNumberFormat('0');
summary.showGridLines=false;
summary.getRange('A1:D36').format.font={name:font,size:11,color:'#222222'};
[36,17,84,64].forEach((w,i)=>summary.getRangeByIndexes(0,i,36,1).format.columnWidth=w);
summary.getRange('A1').values=[['英语学习痛点报告 02']];summary.getRange('A1').format.font={name:font,size:15,bold:true};
summary.getRange('A2').values=[['2026-09-10；公开资料定性研究；不估计人口比例或因果效应。']];
summary.getRange('A2').format.font={name:font,size:10,italic:true,color:'#555555'};
summary.getRange('A4:C4').values=[['证据口径','数量','含义']];
summary.getRange('A5:C14').values=[
 ['全部记录',null,'含主证据、反例、补充、背景、排除、重复及个人需求。'],
 ['主证据',null,'有可定位的具体观察；并不表示都来自新加坡或零基础者。'],
 ['反例',null,'保留现有学习方式有帮助或偏好不同的经历。'],
 ['补充线索',null,'身份、语种、访问或商业关联存在限制，解释权重较低。'],
 ['背景',null,'官方能力及不宜直接外推的研究。'],
 ['排除',null,'缺正文、视频未转录、儿童或无独立经历等原因。'],
 ['复核重复',null,'LX004与首份X015同一笔记，不增加独立支持。'],
 ['第一方需求',null,'U001只代表用户本人；产品身份和失败会话尚待明确。'],
 ['本轮新增记录',null,'包括排除与背景；不是新增受访人数。'],
 ['检索式',null,'网络检索及小红书站内检索，完整保留实际用语。']];
summary.getRange('B5:B14').formulas=[
 ["=COUNTA('Sources'!$A$5:$A$"+cend+")"],
 ...['主证据','反例','补充线索','背景','排除','复核重复','第一方需求'].map(v=>["=COUNTIF('Sources'!$H$5:$H$"+cend+',"'+v+'")']),
 ["=COUNTIF('Sources'!$I$5:$I$"+cend+',"本轮新增")'],
 ["=COUNTA('检索记录'!$C$5:$C$"+qend+")"]];
summary.getRange('B5:B14').setNumberFormat('#,##0');
summary.getRange('A17:C17').values=[['使用规则','处理','含义']];
summary.getRange('A18:C23').values=[
 ['人群身份','原文说明','平台语言、IP、商店地区及昵称不推断国籍或族裔。'],
 ['严格零基础','尚未测评','会少量词、会读但不会听说、自选A0分别记录。'],
 ['证据时间','版本独立','评论只反映当时体验；不当成当前所有版本的缺陷。'],
 ['研究人数','不累加','大学生、儿童、陪读母亲与公开用户不是同一抽样框。'],
 ['平台覆盖','深度不均','小红书与App评论较扎实；知乎、豆瓣、视频平台及低数字使用者不足。'],
 ['后续用途','讨论及验证','尚未批准定位、功能清单或实现计划。']];
summary.getRange('A26:C26').values=[['用户直接输入','已确认','尚待明确']];
summary.getRange('A27:C31').values=[
 ['学习目标','生活工作中的听与说','不把读写作为本人学习目标；不外推所有用户。'],
 ['学习偏好','低基础、低社交压力、灵活时间、自选情境','具体失败会话、可用时间和起点尚未测评。'],
 ['Duolingo、VOA Learning English','用户曾使用','实际栏目、版本、套餐、使用时长未知。'],
 ['摩打、澳洲Learning English网站','仅确认用户提供的名称/描述','摩打商店身份及澳洲网址待确认，不猜测产品。'],
 ['AI原因解释','用户感觉过于局限','未专门训练的因果说法未经证实。']];
summary.getRange('A4:C31').format.wrapText=true;summary.getRange('A4:C31').format.verticalAlignment='top';summary.getRange('A4:C31').format.rowHeight=44;
for(const row of [4,17,26]){summary.getRange('A'+row+':C'+row).format.fill='#E9E9E9';summary.getRange('A'+row+':C'+row).format.font={name:font,size:11,bold:true};summary.getRange('A'+row).format.rowHeight=30;}
for(const row of [3,15,16,24,25])summary.getRange('A'+row).format.rowHeight=12;
summary.getRange('A1').format.rowHeight=30;summary.getRange('A2').format.rowHeight=26;
await fs.mkdir(out,{recursive:true});
const views=[['研究说明','A1:C14','summary'],['研究说明','A17:C31','scope'],['学习痛点','A1:G7','themes'],['证据与边界','A1:G8','evidence'],['证据与边界','A40:G44','app-evidence'],['Sources','A1:J8','sources'],['Sources','K4:L8','locators'],['检索记录','A1:E9','queries'],['证据与边界','I27:J36','quotes']];
for(const [sheetName,range,name] of views){const blob=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(out+'/'+name+'-preview.png',new Uint8Array(await blob.arrayBuffer()));}
const counts=await wb.inspect({kind:'table',range:'研究说明!A4:C14',include:'values,formulas',tableMaxRows:12,tableMaxCols:3,maxChars:3500});
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'formula error scan',maxChars:2000});
await fs.writeFile(base+'/workbook-qa.json',JSON.stringify({records:sources.length,queryCount:queries.length,counts:counts.ndjson,errors:errors.ndjson},null,2));
console.log(counts.ndjson);console.log(errors.ndjson);
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(out+'/singapore-english-learning-evidence-02.xlsx');
console.log(JSON.stringify({records:sources.length,queries:queries.length,output:out+'/singapore-english-learning-evidence-02.xlsx'}));
