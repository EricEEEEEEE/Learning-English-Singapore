import json, re, html, pathlib, math
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph, Table, TableStyle, Spacer, Frame, KeepTogether
from pypdf import PdfReader

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
data = json.loads((BASE / 'report-content.json').read_text())
sources = {r['id']: r for r in json.loads((BASE / 'evidence.json').read_text())}
refs = list(dict.fromkeys(re.findall(r'\[\[([A-Z]{1,3}\d{3})\]\]', json.dumps(data['pages'], ensure_ascii=False))))
numbers = {v:i+1 for i,v in enumerate(refs)}
pdfmetrics.registerFont(TTFont('CN', '/System/Library/Fonts/STHeiti Light.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('CN-Bold', '/System/Library/Fonts/STHeiti Medium.ttc', subfontIndex=0))
pdfmetrics.registerFontFamily('CN', normal='CN', bold='CN-Bold', italic='CN', boldItalic='CN-Bold')
styles = {
 'title': ParagraphStyle('title', fontName='CN-Bold', fontSize=22, leading=29, spaceAfter=15, wordWrap='CJK'),
 'page': ParagraphStyle('page', fontName='CN-Bold', fontSize=17, leading=23, spaceAfter=13, wordWrap='CJK'),
 'h': ParagraphStyle('h', fontName='CN-Bold', fontSize=11.5, leading=17, spaceBefore=7, spaceAfter=6, keepWithNext=True, wordWrap='CJK'),
 'p': ParagraphStyle('p', fontName='CN', fontSize=10.7, leading=16.2, spaceAfter=8, wordWrap='CJK'),
 'cell': ParagraphStyle('cell', fontName='CN', fontSize=9.1, leading=13.5, wordWrap='CJK'),
 'th': ParagraphStyle('th', fontName='CN-Bold', fontSize=9.1, leading=13.5, wordWrap='CJK'),
 'note': ParagraphStyle('note', fontName='CN', fontSize=7.5, leading=10.4, textColor=HexColor('#444444'), wordWrap='CJK'),
 'source': ParagraphStyle('source', fontName='CN', fontSize=9, leading=13.5, spaceAfter=10, wordWrap='CJK'),
}

def norm(t):
    return t.replace('\u2011','-').replace('\u2013','-').replace('\u2014','-').replace('\x02','')

def markup(t):
    t = html.escape(norm(t))
    def citation(m):
        sid = m.group(1)
        return '<super><link href="' + html.escape(sources[sid]['url'], quote=True) + '" color="#333333">[' + str(numbers[sid]) + ']</link></super>'
    return re.sub(r'\[\[([A-Z]{1,3}\d{3})\]\]', citation, t)

def paragraph(t, style='p'):
    return Paragraph(markup(t), styles[style])

def title_short(r):
    names = {
      'E007':'MRT柜台交流旅行记录','E009':'在新三个月的实习记录','E079':'越南学生两次留学语言适应',
      'E002':'Singlish slipping through. Offensive?','E010':'NUS留学记6','E004':'移居一年后的英语使用',
      'E044':'Singlish、身份与情境切换','E056':'出差前的本地听力准备','E078':'Andrea Mae校友采访',
      'E048':'UBC赴NUS交换生采访','E011':'餐厅与购物沟通旅行记录','E076':'游客反复请求重复是否失礼',
      'E003':'在新工作者的AI耳机推广自述','E016':'An Expat on Being an Insider-Outsider',
      'E045':'菲律宾Cruz家庭迁居经历','E021':'来年前的Singlish学习工具提问','E020':'舞台介绍如何使用Singlish',
      'E067':'Conflicts between world Englishes','E005':'Foreign workers与英语经验访谈',
      'E039':'Erni的工作经历回顾','E068':'孟加拉国建筑工民族志','E012':'外籍工人医疗照护医生调查',
      'E047':'外籍工人医疗及保险信息调查','E042':'外籍工人法律程序与语言障碍',
      'E043':'HealthServe同伴支持报道','E014':'International Graduate Students’ English Language Needs',
      'E008':'NiSC两名交换生采访','E017':'新来者寻找同事口语听力材料','E037':'Cours d’anglais sur place',
      'E033':'法国迁居者寻找英语伙伴','E041':'HOME Academy Graduation 2024','E070':'Expat Insider 2025',
      'E026':'美国移居者一年后的正面经历','E023':'澳大利亚回复者对口音的看法'
    }
    return names.get(r['id'], r['title'][:65])

def note_text(sid):
    r=sources[sid]
    when=r['date'] or r['date_note'].split('；')[0]
    if len(when)>26: when='日期说明见来源表'
    return f'{numbers[sid]}. {r["platform"]}，<link href="{html.escape(r["url"],quote=True)}">{html.escape(norm(title_short(r)))}</link>，{html.escape(norm(when))}。'

pdf_path=OUT/'singapore-english-learning-pains-report-02.pdf'
c=canvas.Canvas(str(pdf_path), pagesize=A4, pageCompression=1)
c.setTitle(data['title'])
c.setAuthor('')
W,H=A4
left=43; right=43; width=W-left-right
schedule=[]

def page_number(n):
    c.setFont('CN',8); c.setFillColor(HexColor('#666666'))
    c.drawRightString(W-right,19,str(n))

md=['# '+data['title'],'']
for ix, pg in enumerate(data['pages']):
    if ix: md.extend(['## '+pg['title'],''])
    page_refs=list(dict.fromkeys(re.findall(r'\[\[([A-Z]{1,3}\d{3})\]\]',json.dumps(pg,ensure_ascii=False))))
    notes=[Paragraph(note_text(sid),styles['note']) for sid in page_refs]
    note_heights=[n.wrap(width,1000)[1] for n in notes]
    nh=sum(note_heights)+len(notes)*2
    body_bottom=43+nh+(12 if notes else 0)
    story=[paragraph(pg['title'],'title' if ix==0 else 'page')]
    for b in pg['blocks']:
        if b['type'] in ('p','h'):
            story.append(paragraph(b['text'], b['type']))
            prefix='### ' if b['type']=='h' else ''
            mt=re.sub(r'\[\[([A-Z]{1,3}\d{3})\]\]',lambda m:'[^'+str(numbers[m.group(1)])+']',b['text'])
            md.extend([prefix+mt,''])
        else:
            cells=[[paragraph(x,'th') for x in b['headers']]]+[[paragraph(x,'cell') for x in row] for row in b['rows']]
            tab=Table(cells,colWidths=[width*w for w in b['widths']],hAlign='LEFT')
            tab.setStyle(TableStyle([
             ('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),HexColor('#EDEDED')),
             ('LINEBELOW',(0,0),(-1,0),.6,HexColor('#AAAAAA')),
             ('LINEBELOW',(0,1),(-1,-1),.25,HexColor('#DDDDDD')),
             ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
             ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7)]))
            story.extend([tab,Spacer(1,10)])
            md.append('| '+' | '.join(b['headers'])+' |')
            md.append('| '+' | '.join(['---']*len(b['headers']))+' |')
            md.extend('| '+' | '.join(re.sub(r'\[\[([A-Z]{1,3}\d{3})\]\]',lambda m:'[^'+str(numbers[m.group(1)])+']',cell) for cell in row)+' |' for row in b['rows'])
            md.append('')
    frame=Frame(left,body_bottom,width,H-43-body_bottom,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
    frame.addFromList(story,c)
    if story:
        raise RuntimeError(f'Page {ix+1} overflow: {len(story)} remaining; first={getattr(story[0],"text",type(story[0]).__name__)[:100]}')
    y=43+nh
    for note,hh in zip(notes,note_heights):
        y-=hh; note.drawOn(c,left,y);y-=2
    page_number(ix+1)
    schedule.append({'page':ix+1,'title':pg['title'],'footnotes':len(notes)})
    c.showPage()

source_story=[paragraph('来源','page'),paragraph(f'以下为正文引用来源，编号与页下注释一致。完整{len(sources)}项来源、访问程度、英语起点、主题编码及排除说明见配套证据台账。资料核查截至2026年9月10日；原帖时间未显示年份时不作补定。','p')]
md.extend(['## 来源',''])
for sid in refs:
    r=sources[sid]
    when=(r['date']+'；' if r['date'] else '')+r['date_note']
    author=r.get('author','')
    by=('，'+author) if author and author!=r['platform'] else ''
    txt=f'<b>{numbers[sid]}. [{sid}] {html.escape(r["platform"]+by)}</b>。<link href="{html.escape(r["url"],quote=True)}">{html.escape(norm(r["title"]))}</link>。{html.escape(norm(when))}。访问：{r["access"]}；用途：{r["use"]}。定位：{html.escape(norm(r["locator"] or "见来源正文"))}。'
    source_story.append(Paragraph(txt,styles['source']))
    md.extend([f'[^{numbers[sid]}]: [{sid}] {r["platform"]}。[{r["title"]}]({r["url"]})。{when}。访问：{r["access"]}；用途：{r["use"]}。定位：{r["locator"] or "见来源正文"}。',''])
page=len(data['pages'])+1
while source_story:
    before=len(source_story)
    f=Frame(left,43,width,H-86,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
    f.addFromList(source_story,c)
    if len(source_story)==before: raise RuntimeError('Source page did not progress')
    page_number(page);schedule.append({'page':page,'title':'来源'});c.showPage();page+=1
c.save()
(BASE/'REPORT.md').write_text('\n'.join(md))
reader=PdfReader(pdf_path)
texts=[page.extract_text() for page in reader.pages]
assert len(texts)==len(schedule)
assert all(len(t)>100 for t in texts)
assert not any(x in '\n'.join(texts) for x in ['[[E','turn131','cite'])
links=sum(len(p.get('/Annots',[])) for p in reader.pages)
qa={'pages':len(texts),'cited_sources':len(refs),'source_records':len(sources),'links':links,'schedule':schedule,'text_lengths':[len(t) for t in texts]}
(BASE/'report-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2))
print(json.dumps(qa,ensure_ascii=False))
