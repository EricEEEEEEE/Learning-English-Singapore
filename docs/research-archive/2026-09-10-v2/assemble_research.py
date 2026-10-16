import json, pathlib, collections
BASE=pathlib.Path(__file__).resolve().parent
OLD=BASE.parent/'2026-09-10'
old=json.loads((OLD/'evidence.json').read_text())
new=json.loads((BASE/'new-chinese-sources.json').read_text())+json.loads((BASE/'xiaohongshu-evidence.json').read_text())
for e in old:
    e['batch']='首轮跨国资料'
    e['proficiency']='详见人群及限制；未统一测评'
    e['identity_basis']='首轮来源原有描述，不据平台语言推断国籍'
    e['author']=e.get('author',e['platform'])
all_e=old+new
assert len({e['id'] for e in all_e})==len(all_e)
(BASE/'evidence.json').write_text(json.dumps(all_e,ensure_ascii=False,indent=2))
searches=json.loads((OLD/'search-queries.json').read_text())+json.loads((BASE/'new-searches.json').read_text())
for i,q in enumerate(['新加坡 陪读 英语','新加坡 不会英语','新加坡 英语 零基础','新加坡 陪读妈妈 学英语','新加坡 父母 不会英语','新加坡 零基础 英语 求助','新加坡 英语 一点不会'],1):
    searches.append({'id':f'XHS0{i}','q':[{'q':q,'domains':['xiaohongshu.com'],'method':'站内可见界面检索'}]})
(BASE/'search-queries.json').write_text(json.dumps(searches,ensure_ascii=False,indent=2))
platforms=collections.defaultdict(lambda:collections.Counter())
for e in all_e:
    p=platforms[e['platform']];p['total']+=1;p['body']+=e['access']=='正文';p['main_counter']+=e['use'] in ['主证据','反例'];p['supplement']+=e['use']=='补充线索'
def stats(a):
    return {'total':len(a),'access':dict(collections.Counter(e['access'] for e in a)),'use':dict(collections.Counter(e['use'] for e in a))}
summary={'all':stats(all_e),'old':stats(old),'new':stats(new),'platforms':dict(platforms),'query_groups':len(searches),'queries':sum(len(s['q']) if isinstance(s['q'],list) else 1 for s in searches)}
(BASE/'counts.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False))
