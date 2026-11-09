#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the single-file index.html (app + embedded vocabulary)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB = os.path.join(ROOT, 'vocab_clean.json')
SENSES = os.path.join(ROOT, 'vocab_senses.json')
TEMPLATE = os.path.join(ROOT, 'src', 'app.html')
OUT = os.path.join(ROOT, 'index.html')

with open(VOCAB, encoding='utf-8') as f:
    vocab = json.load(f)
with open(SENSES, encoding='utf-8') as f:
    senses = {s['id']: s for s in json.load(f)}

# 词性合并表（前端不用重复推断）
rows = []
for v in vocab:
    gs = senses.get(v['id'], {}).get('groups', [])

    # 同一 concept 的义项合并成一条（n.奔跑 / vi.奔跑 视作同一意思）
    by_concept = []
    for g in gs:
        cid = g.get('concept') or ''
        hit = None
        for u in by_concept:
            if cid and u.get('concept') == cid:
                hit = u
                break
        if hit:
            if g['text'] not in hit['text']:
                hit['terms'].append(g['text'])
                hit['text'] = '，'.join(dict.fromkeys(hit['terms']))
        else:
            by_concept.append({'pos': g['pos'], 'text': g['text'],
                               'terms': [g['text']], 'tag': g['tag'],
                               'concept': cid})

    rows.append({
        'w': v['word'],
        's': v['short'],
        'g': [{'p': g['pos'], 't': g['text'], 'k': g['tag'], 'c': g.get('concept', '')} for g in by_concept],
    })

payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
payload = payload.replace('</', '<\\/')

with open(TEMPLATE, encoding='utf-8') as f:
    html = f.read()

html = html.replace('__VOCAB_DATA__', payload)
html = html.replace('__VOCAB_COUNT__', str(len(rows)))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

print('wrote', OUT, len(html), 'bytes,', len(rows), 'words')
