"""Render the canonical product specification; no model calls or network access."""
from pathlib import Path
import re, html, json, hashlib
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, CondPageBreak, Flowable
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
OUT=ROOT/'output/pdf/singapore-english-product-spec-01.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'spec.md'
text=SOURCE.read_text()
pdfmetrics.registerFont(TTFont('CN','/System/Library/Fonts/STHeiti Light.ttc',subfontIndex=0))
pdfmetrics.registerFont(TTFont('CNB','/System/Library/Fonts/STHeiti Medium.ttc',subfontIndex=0))
pdfmetrics.registerFontFamily('CN',normal='CN',bold='CNB',italic='CN',boldItalic='CNB')
INK=colors.HexColor('#15383F'); TEAL=colors.HexColor('#157B80'); MUTED=colors.HexColor('#58696B')
W,H=A4; WIDTH=W-88
styles={
 'cover':ParagraphStyle('cover',fontName='CNB',fontSize=27,leading=38,textColor=INK,spaceAfter=22,wordWrap='CJK'),
 'title':ParagraphStyle('title',fontName='CNB',fontSize=19,leading=28,textColor=INK,spaceBefore=12,spaceAfter=17,keepWithNext=True,wordWrap='CJK'),
 'h':ParagraphStyle('h',fontName='CNB',fontSize=12,leading=19,textColor=INK,spaceBefore=13,spaceAfter=8,keepWithNext=True,wordWrap='CJK'),
 'p':ParagraphStyle('p',fontName='CN',fontSize=10.2,leading=16.0,textColor=INK,spaceAfter=8,wordWrap='CJK',allowWidows=0,allowOrphans=0),
 'small':ParagraphStyle('small',fontName='CN',fontSize=8.4,leading=13,textColor=MUTED,spaceAfter=8,wordWrap='CJK'),
 'cell':ParagraphStyle('cell',fontName='CN',fontSize=8.6,leading=13.2,textColor=INK,wordWrap='CJK'),
 'th':ParagraphStyle('th',fontName='CNB',fontSize=8.7,leading=13.3,textColor=INK,wordWrap='CJK'),
}

def markup(s):
 s=s.replace('\u2011','-').replace('\u2013','-').replace('\u2014','-')
 held=[]
 def link(m):
  label,url=m.groups()
  held.append('<link href="'+html.escape(url,quote=True)+'" color="#157B80">'+html.escape(label)+'</link>')
  return f'ZZLINK{len(held)-1}ZZ'
 s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,s)
 s=html.escape(s)
 s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
 s=re.sub(r'`([^`]+)`',r'\1',s)
 for i,v in enumerate(held):s=s.replace(f'ZZLINK{i}ZZ',v)
 return s.replace('&lt;br/&gt;','<br/>')

def P(s,style='p'):return Paragraph(markup(s),styles[style])

class Architecture(Flowable):
 def __init__(self):Flowable.__init__(self);self.width=WIDTH;self.height=184
 def draw(self):
  c=self.canv
  c.setFont('CNB',10);c.setFillColor(INK);c.drawString(0,171,'同一场景，两个模式，共用角色与学习目标')
  rows=[(111,['目标与水平','场景 / 脚本校验','声音 + 画面','保存示范课件']),
        (36,['同角色练习','实时语音回应','嘴型 + 受控动作','教练 / 进度'])]
  bw=(WIDTH-36)/4
  for y,labels in rows:
   for j,label in enumerate(labels):
    x=j*(bw+12);c.setFillColor(colors.HexColor('#EDF5F4'));c.setStrokeColor(colors.HexColor('#AED0CF'))
    c.roundRect(x,y,bw,36,5,stroke=1,fill=1)
    c.setFillColor(INK);c.setFont('CN',8.4);c.drawCentredString(x+bw/2,y+14,label)
    if j<3:
     c.setStrokeColor(TEAL);c.line(x+bw+2,y+18,x+bw+10,y+18)
     c.line(x+bw+7,y+21,x+bw+10,y+18);c.line(x+bw+7,y+15,x+bw+10,y+18)
  c.setFillColor(MUTED);c.setFont('CN',8.5)
  c.drawString(0,90,'生成阶段：OpenAI 内容、图像、语音与动画时间轴组合')
  c.drawString(0,15,'互动阶段：WebRTC + 服务端状态控制；重复示范无需重新生成')

class Doc(SimpleDocTemplate):
 def beforeDocument(self):self.heading_pages=[]
 def afterFlowable(self,f):
  if isinstance(f,Paragraph) and hasattr(f,'bookmark'):
   label=f.getPlainText();key=f.bookmark
   self.canv.bookmarkPage(key);self.canv.addOutlineEntry(label,key,0,False)
   self.notify('TOCEntry',(0,label,self.page,key))
   self.heading_pages.append({'title':label,'page':self.page})

def footer(c,d):
 c.saveState();c.setStrokeColor(colors.HexColor('#D7E4E2'));c.line(44,38,W-44,38)
 c.setFillColor(MUTED);c.setFont('CN',7.5)
 c.drawString(44,24,'Learning English in Singapore | 产品规格 v0.1 | 2026-09-10')
 c.drawRightString(W-44,24,str(d.page));c.restoreState()

story=[Spacer(1,53),P('Learning English<br/>in Singapore','cover'),P('产品规格 · 第一份核心文档','title'),
 P('从真实生活任务出发，先看懂，再开口，最后练会变化。'),Spacer(1,19),
 P('面向在新加坡等支持地区生活的成人新来者，明确覆盖华语与非华语零基础学习者。微信 + Google 登录。'),Spacer(1,22),
 P('方向评审稿 v0.1 · 资料核查 2026-09-10','h'),
 P('基于两份痛点报告、39 项技术与工作流来源，包含 30 条诉求对账、功能验收、技术方案及验证闸门。'),Spacer(1,20),
 P('重要决定：OpenAI Sora / Videos API 将于 2026-09-24 关闭。建议以可编程卡通承载视觉场景；该路线调整等待确认。'),
 P('本文件为完整 Markdown 规格的阅读版。文档审查不等于实际 API、登录、口音或学习效果已验证。','small'),PageBreak(),P('阅读导航','title')]
toc=TableOfContents();toc.levelStyles=[ParagraphStyle('toc',fontName='CN',fontSize=9.5,leading=15,leftIndent=0,firstLineIndent=0,spaceBefore=1,textColor=INK,wordWrap='CJK')]
story.extend([toc,PageBreak()])

lines=text.splitlines();i=0;first_section=True
while i<len(lines):
 s=lines[i].strip()
 if not s or s.startswith('# '):i+=1;continue
 if s.startswith('```'):
  block=[];i+=1
  while i<len(lines) and not lines[i].startswith('```'):block.append(lines[i]);i+=1
  story.extend([Architecture(),Spacer(1,8)]);i+=1;continue
 if s.startswith('## '):
  major=bool(re.match(r'## (5\.|7\.|8\.|9\.|10\.|11\.|13\.|16\.|18\.|19\.|附录)',s))
  if not first_section and not isinstance(story[-1],PageBreak):story.append(PageBreak() if major else CondPageBreak(210))
  first_section=False
  label=s[3:];p=P(label,'title');p.bookmark='s'+hashlib.sha1(label.encode()).hexdigest()[:12]
  story.append(p);i+=1;continue
 if s.startswith('### '):story.append(P(s[4:],'h'));i+=1;continue
 if s.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].strip().startswith('|'):
   row=[c.strip() for c in lines[i].strip().strip('|').split('|')]
   if not all(re.fullmatch(r':?-+:?',c) for c in row):rows.append(row)
   i+=1
  n=len(rows[0]);ratios={2:[.28,.72],3:[.21,.38,.41],4:[.16,.29,.30,.25],5:[.11,.25,.24,.20,.20]}.get(n,[1/n]*n)
  # Dialogue sample gives generous space to spoken words.
  if rows[0][0]=='角色':ratios=[.13,.45,.42]
  if rows[0][0]=='U 编号':ratios=[.10,.31,.20,.39]
  cells=[[P(c,'th' if ri==0 else 'cell') for c in r] for ri,r in enumerate(rows)]
  tab=Table(cells,colWidths=[WIDTH*x for x in ratios],repeatRows=1,hAlign='LEFT')
  tab.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#DBEBE8')),
   ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F6F9F8')]),('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#AFC9C5')),
   ('LINEBELOW',(0,1),(-1,-1),.25,colors.HexColor('#DFE7E5')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
   ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
  story.extend([tab,Spacer(1,12)]);continue
 story.append(P(s,'small' if s.startswith('版本：') else 'p'));i+=1

doc=Doc(str(OUT),pagesize=A4,leftMargin=44,rightMargin=44,topMargin=43,bottomMargin=54,
 title='Learning English in Singapore · 产品规格',author='',pageCompression=1)
doc.multiBuild(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(OUT);texts=[p.extract_text() or '' for p in reader.pages]
qa={'pdf':str(OUT),'pages':len(texts),'page_text_lengths':[len(t) for t in texts],
 'links':sum(len(p.get('/Annots',[])) for p in reader.pages),'section_pages':doc.heading_pages,
 'spec_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'visual_review':'pending'}
assert all(len(t)>75 for t in texts)
assert not any(s in '\n'.join(texts) for s in ['ZZLINK','[[T','cite','turn220'])
(BASE/'pdf-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2))
print(json.dumps(qa,ensure_ascii=False))
