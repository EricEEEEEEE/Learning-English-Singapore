from pathlib import Path
import json,re,hashlib
from pypdf import PdfReader
BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[1]
doc=(ROOT/'spec.md').read_text()
sources=json.loads((BASE/'sources.json').read_text())
qa=json.loads((BASE/'document-qa.json').read_text())
pq=json.loads((BASE/'pdf-qa.json').read_text())
digest=hashlib.sha256(doc.encode()).hexdigest()
assert digest==pq['spec_sha256']==qa['spec_sha256']
ids=[x['id'] for x in sources]
assert len(ids)==len(set(ids))==73
assert sorted(set(re.findall(r'^\| (U\d{2}) \|',doc,re.M)))==[f'U{i:02d}' for i in range(1,41)]
assert len(re.findall(r'^\| U\d{2} \|',doc,re.M))==40
assert len(re.findall(r'^### 7\.[4-9] 样例 [A-F]',doc,re.M))==6
assert len(set(re.findall(r'\bS(\d{2})\b',doc)))==36
assert 'listening_band=null' in doc and 'placement_status=unknown' in doc
assert 'Singlish' not in doc and 'P95 ≤90' not in doc
assert 'replace_audio_tail' in doc or '音频尾部' in doc
table_width=None
for line in doc.splitlines():
    if line.startswith('|'):
        width=len(line.split('|'))-2
        if table_width is None:table_width=width
        assert width==table_width,(line,width,table_width)
    else:table_width=None
pdf=ROOT/'output/pdf/singapore-english-product-spec-v02.pdf'
reader=PdfReader(pdf)
urls=[]
for p in reader.pages:
    for ann in p.get('/Annots',[]):
        a=ann.get_object().get('/A',{})
        if a.get('/URI'):urls.append(str(a['/URI']))
source_urls={x['url'] for x in sources}
assert source_urls<=set(urls),source_urls-set(urls)
texts=[p.extract_text() or '' for p in reader.pages]
assert len(texts)==42 and all(len(t)>75 for t in texts)
assert not any(x in '\n'.join(texts) for x in ['ZZLINK','cite','v0.1 |'])
qa.update({'review':'independent review passed for validation-design stage; final nonblocking field clarification checked locally','tables_consistent':True,'requirements_unique':40,'new_source_count':34,'worked_example_count':6,'scenario_seed_count':36,'canonical_term_scan':'pass','pdf_matches_spec':True,'paid_api_tests':False,'app_implemented':False,'checked_at':'2026-09-10'})
pq.update({'visual_review':'passed: all 42 pages in contact sheets; enlarged placement, silence, comparison, architecture and latency pages','external_annotations':len(urls),'unique_external_urls':len(set(urls)),'all_source_urls_present':True,'pdf_sha256':hashlib.sha256(pdf.read_bytes()).hexdigest()})
(BASE/'document-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2))
(BASE/'pdf-qa.json').write_text(json.dumps(pq,ensure_ascii=False,indent=2))
print(json.dumps({'doc_qa':qa,'pdf_pages':len(texts),'external_annotations':len(urls),'unique_external_urls':len(set(urls))},ensure_ascii=False))
