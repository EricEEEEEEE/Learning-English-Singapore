import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root='/Users/eric/projects/Learning English  Singapore';
const base=root+'/research/2026-09-10-v2';
const out=root+'/outputs/learning-english-research-v2';
const sources=JSON.parse(await fs.readFile(base+'/evidence.json','utf8'));
const data=JSON.parse(await fs.readFile(base+'/report-content.json','utf8'));
const searches=JSON.parse(await fs.readFile(base+'/search-queries.json','utf8'));
const queries=searches.flatMap(s=>(Array.isArray(s.q)?s.q:[s.q]).map((q,i)=>[s.id,i+1,typeof q==='string'?q:q.q,typeof q==='string'?'':(q.domains||[]).join(', '),new Date('2026-09-10T00:00:00Z')]));
const selected=sources.filter(e=>['主证据','反例','补充线索'].includes(e.use));
const newRecords=sources.filter(e=>e.batch==='华语及零基础补充');
const priority=['X036','X019','X027','X025','X012','X031','X004','X034','X038','C004','C011','C019','C025'];
newRecords.sort((a,b)=>(priority.includes(a.id)?priority.indexOf(a.id):100)-(priority.includes(b.id)?priority.indexOf(b.id):100)||a.id.localeCompare(b.id));
const wb=Workbook.create(), font='Helvetica Neue';
const summary=wb.worksheets.add('研究说明'), chinese=wb.worksheets.add('华语与零基础'), themes=wb.worksheets.add('综合痛点'), evidence=wb.worksheets.add('事件证据'), catalog=wb.worksheets.add('Sources'), qsheet=wb.worksheets.add('检索记录');
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
const cend=table(catalog,'综合来源目录','151项入口全部保留；具体日期、访问程度、用途和同人重复分别记录。',
 ['编号','平台／发布方','原文标题','作者／署名','核实日期','日期与事件时间','可访问程度','证据用途','材料类型','原始URL','原文定位','同人／重复组','限制与不能推断的内容','资料批次'],
 sources.map(e=>[e.id,e.platform,e.title,e.author||e.platform,e.date?new Date(e.date+'T00:00:00Z'):null,e.date_note,e.access,e.use,e.kind,e.url,e.locator,e.event_group,e.limitation,e.batch]),
 [11,23,48,25,15,43,17,17,26,68,40,28,60,24],'AllSources',128);
catalog.getRange('E5:E'+cend).setNumberFormat('yyyy-mm-dd');
catalog.getRange('J5:J'+cend).format.font={name:font,size:10,color:'#315D82'};
const xend=table(chinese,'华语与零基础补充资料','65项新增材料；包含反例、背景和排除项。中文平台不等于中国国籍。',
 ['编号','平台／发布方','证据用途','人群及身份依据','英语起点','具体观察','限制与不能推断的内容','原始URL'],
 newRecords.map(e=>[e.id,e.platform,e.use,e.population,e.proficiency,e.finding,e.limitation,e.url]),
 [11,22,16,41,35,65,70,68],'ChineseNewSources',140);
chinese.getRange('H5:H'+xend).format.font={name:font,size:10,color:'#315D82'};
const eend=table(evidence,'综合事件证据','96项主证据、反例和补充线索；条目数不等于独立事件或用户数。',
 ['编号','证据用途','人群／研究样本','英语能力说明','场景','可核对的观察','主题编码','原文短摘录','限制与解释边界','原始URL'],
 selected.map(e=>[e.id,e.use,e.population,e.proficiency,e.scene||'见观察',e.finding,e.themes.join(', '),e.quote||'未摘录',e.limitation,e.url]),
 [11,17,43,37,30,60,18,33,66,68],'AllEvidence',136);
evidence.getRange('J5:J'+eend).format.font={name:font,size:10,color:'#315D82'};
const refs={P0:['X036','X019'],P1:['X018','E009'],P2:['X025','E007'],P3:['X012','E004'],P4:['X028','E016'],P5:['E002','E067'],P6:['C025','E012'],P7:['X009','E014'],P8:['X004','X034'],P10:['X027','C007'],P9:['X038','C013'],C1:['X017','E026'],C2:['X015','X024']};
table(themes,'综合痛点定义','十类核心痛点；P9、C1、C2是辅助标签。允许同一事件包含多个主题。',
 ['编码','问题／标签','纳入定义','排除及解释边界','例证编号','对应原始URL'],
 data.painDefinitions.map(e=>[e.id,e.name,e.definition,e.exclude,refs[e.id].join(', '),refs[e.id].map(id=>sources.find(s=>s.id===id).url).join('\n')]),
 [11,28,52,61,22,82],'PainDefinitions',110);
const qend=table(qsheet,'检索记录','62组、183条检索式；包括7组小红书站内查询。次数不是样本量。',
 ['检索组','组内序号','检索式','限定域名／站内平台','执行日期'],queries,[30,14,90,39,17],'AllQueries',52);
qsheet.getRange('E5:E'+qend).setNumberFormat('yyyy-mm-dd');
qsheet.getRange('B5:B'+qend).setNumberFormat('0');
summary.showGridLines=false;
summary.getRange('A1:D38').format.font={name:font,size:11,color:'#222222'};
[34,19,79,81].forEach((w,i)=>summary.getRangeByIndexes(0,i,38,1).format.columnWidth=w);
summary.getRange('A1').values=[['新加坡英语综合痛点研究']];summary.getRange('A1').format.font={name:font,size:15,bold:true};
summary.getRange('A2').values=[['公开资料阶段；2026-09-10核查；未新增访谈或代表性抽样。']];
summary.getRange('A2').format.font={name:font,size:10,italic:true,color:'#555555'};
summary.getRange('A4:C4').values=[['来源口径','数量','含义']];
summary.getRange('A5:C12').values=[
 ['全部来源入口',null,'首轮86项与补充65项合并，包含重复、背景和排除项。'],
 ['可核对相关文字',null,'小红书包含文字说明和已展开评论；不等于全部视频、图片或评论已读。'],
 ['痛点主证据',null,'有具体自述、采访或原始研究支持；仍需看个案限制。'],
 ['专门反例',null,'顺利办事、适应或现有支持有效，防止过度泛化。'],
 ['补充线索',null,'含索引、商业关联和不完整材料，不与主证据等权。'],
 ['新增资料入口',null,'华语及零基础重点补充，保留比较组和排除项。'],
 ['小红书笔记',null,'七组站内搜索后逐条核读文字；不能换算为40名零基础用户。'],
 ['记录检索式',null,'目的性搜索记录，不是抽样统计。']
];
summary.getRange('B5:B12').formulas=[
 ["=COUNTA('Sources'!$A$5:$A$"+cend+")"],
 ["=COUNTIF('Sources'!$G$5:$G$"+cend+',"正文")'],
 ["=COUNTIF('Sources'!$H$5:$H$"+cend+',"主证据")'],
 ["=COUNTIF('Sources'!$H$5:$H$"+cend+',"反例")'],
 ["=COUNTIF('Sources'!$H$5:$H$"+cend+',"补充线索")'],
 ["=COUNTIF('Sources'!$N$5:$N$"+cend+',"华语及零基础补充")'],
 ["=COUNTIF('Sources'!$B$5:$B$"+cend+',"小红书")'],
 ["=COUNTA('检索记录'!$C$5:$C$"+qend+")"]
];
summary.getRange('B5:B12').setNumberFormat('#,##0');
summary.getRange('A15:D15').values=[['人口与客源口径','数值','分母与限制','原始来源']];
summary.getRange('A16:D20').values=[
 ['2025国际访客入境（百万人次）',16.9,'2025全年，国际访客入境人次；不是不同个人数。',sources.find(e=>e.id==='C002').url],
 ['中国大陆来源（百万人次）',3.1,'2025全年，中国大陆来源市场；不是所有华人。',sources.find(e=>e.id==='C002').url],
 ['大陆来源人次占比',null,'由已取整的310万／1690万相除，仅为约数，不能换算成常住新来者构成。',sources.find(e=>e.id==='C002').url],
 ['华族占公民比例',0.755,'2025年6月；分母为新加坡公民，不是游客或中国国籍申请者。',sources.find(e=>e.id==='C003').url],
 ['中国籍获批PR／公民份额',null,'未公布对应国籍分项；不能按公民种族存量推出获批流量比例。',sources.find(e=>e.id==='C003').url]
];
summary.getRange('B18').formulas=[['=B17/B16']];
summary.getRange('B16:B17').setNumberFormat('0.0');
summary.getRange('B18:B19').setNumberFormat('0.0%');
summary.getRange('A23:C23').values=[['解释边界','处理方式','使用要求']];
summary.getRange('A24:C29').values=[
 ['研究权重','不作人口加权','优先补充华语家庭与成人基础，但不把它们写成全部来新者的70%。'],
 ['严格零基础','需要任务核查','自报零基础、只会单词、不会开口和考试基础分别记录；没有统一测评。'],
 ['身份','以原文为限','不从IP、昵称、简繁字体或英语水平推断族裔和国籍。'],
 ['同人重复','不重复计独立验证','C005与C007同一创办人；X004作者又见于X034评论，论文镜像也去重。'],
 ['平台覆盖','仍有缺口','小红书深度已补足，知乎、豆瓣、视频完整内容及低数字使用人群仍薄弱。'],
 ['产品定位','尚未决定','先验证反复任务、后果与现有方法缺口；询价不代表付费，学英语不等于学Singlish。']
];
summary.getRange('A32:C32').values=[['证据时间与后果','核查重点','示例']];
summary.getRange('A33:C36').values=[
 ['目标和成绩','保持时间线','X019雅思7分是未来目标；E079雅思8分在新学习六年之后。'],
 ['比例','保持分母','E012的394／427是医生调查，不能写成外籍工人听不懂英语的比例。'],
 ['家庭成员','不换主体','C016及X007等主要讲孩子，不能归给零基础母亲。'],
 ['平台帖子','区分担忧与发生','X038保留旅行前后同人反馈；X027的14条是通知数量，不是失败次数。']
];
summary.getRange('A4:D36').format.wrapText=true;summary.getRange('A4:D36').format.verticalAlignment='top';summary.getRange('A4:D36').format.rowHeight=40;
for(const row of [4,15,23,32]){summary.getRange('A'+row+':D'+row).format.fill='#E9E9E9';summary.getRange('A'+row+':D'+row).format.font={name:font,size:11,bold:true};summary.getRange('A'+row).format.rowHeight=30;}
for(const row of [3,13,14,21,22,30,31])summary.getRange('A'+row).format.rowHeight=12;
summary.getRange('A1').format.rowHeight=30;summary.getRange('A2').format.rowHeight=25;
summary.getRange('D16:D20').format.font={name:font,size:10,color:'#315D82'};
await fs.mkdir(out,{recursive:true});
const views=[['研究说明','A1:C12','summary'],['研究说明','A15:D20','denominators'],['华语与零基础','A1:F8','chinese'],['华语与零基础','G4:H8','chinese-limits'],['综合痛点','A1:E8','themes'],['事件证据','A1:G8','evidence'],['Sources','A1:I8','sources'],['Sources','J4:N8','sources-limits'],['检索记录','A1:E9','queries']];
for(const [sheetName,range,name] of views){const blob=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(out+'/'+name+'-preview.png',new Uint8Array(await blob.arrayBuffer()));}
const counts=await wb.inspect({kind:'table',range:'研究说明!A4:C12',include:'values,formulas',tableMaxRows:10,tableMaxCols:3,maxChars:4000});
const ratios=await wb.inspect({kind:'table',range:'研究说明!A15:C20',include:'values,formulas',tableMaxRows:7,tableMaxCols:3,maxChars:2500});
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'formula error scan',maxChars:1500});
await fs.writeFile(base+'/workbook-qa.json',JSON.stringify({sourceCount:sources.length,evidenceCount:selected.length,newCount:newRecords.length,queryCount:queries.length,counts:counts.ndjson,ratios:ratios.ndjson,errors:errors.ndjson},null,2));
console.log(counts.ndjson);console.log(ratios.ndjson);console.log(errors.ndjson);
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(out+'/singapore-english-integrated-evidence.xlsx');
console.log(JSON.stringify({output:out+'/singapore-english-integrated-evidence.xlsx',sourceCount:sources.length,evidenceCount:selected.length,newCount:newRecords.length,queryCount:queries.length}));

