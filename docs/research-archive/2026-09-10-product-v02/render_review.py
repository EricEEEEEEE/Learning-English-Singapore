from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image,ImageDraw
BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[1]
OUT=BASE/'visual-review'
OUT.mkdir(exist_ok=True)
doc=pdfium.PdfDocument(str(ROOT/'output/pdf/singapore-english-product-spec-v02.pdf'))
thumbs=[]
for i in range(len(doc)):
    page=doc[i]
    thumb=page.render(scale=.43).to_pil().convert('RGB')
    thumbs.append(thumb)
    page.close()
for start in range(0,len(thumbs),12):
    sheet=Image.new('RGB',(4*274,3*390),'#d9e1e1');d=ImageDraw.Draw(sheet)
    for j,im in enumerate(thumbs[start:start+12]):
        x=(j%4)*274+9;y=(j//4)*390+24
        sheet.paste(im,(x,y));d.text((x,y-17),str(start+j+1),fill='black')
    sheet.save(OUT/f'contact-{start+1:02d}.png')
for i in [0,10,11,12,13,17,18,19,20,21,len(doc)-1]:
    if i<len(doc):doc[i].render(scale=1.5).to_pil().save(OUT/f'page-{i+1:02d}.png')
print({'pages':len(doc),'contact_sheets':(len(doc)+11)//12,'dir':str(OUT)})
