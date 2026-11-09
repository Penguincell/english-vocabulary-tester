#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从原始 PDF 重新生成 vocab_clean.json。

依赖：pypdfium2（仅此一步需要，普通使用网站不需要）
用法：
    pip install pypdfium2
    python tools/extract_vocab.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(os.path.dirname(ROOT), '四六级',
                   '02.大学英语四级词汇完整带音标-可打印-可编辑-乱序版.pdf')
OUT = os.path.join(ROOT, 'vocab_clean.json')

if not os.path.exists(PDF):
    sys.exit('找不到源 PDF：' + PDF)

import pypdfium2 as pdfium  # noqa: E402

# ---------- 1. 抽取文本 ----------
doc = pdfium.PdfDocument(PDF)
pages = []
for i in range(len(doc)):
    tp = doc[i].get_textpage()
    pages.append(tp.get_text_range(0, tp.count_chars()))
full = '\n'.join(pages).replace('\r\n', '\n')
print('pdf pages:', len(pages))

# ---------- 2. 切分词条 ----------
entry_re = re.compile(r'^(\d{1,4})\s+([A-Za-z][A-Za-z\-\.\'’]*)\s*(.*)$')
entries = []
cur = None
for line in full.split('\n'):
    s = line.strip()
    if not s or s.startswith('序号'):
        continue
    m = entry_re.match(s)
    if m and 1 <= int(m.group(1)) <= 5000:
        if cur:
            entries.append(cur)
        cur = {'idx': int(m.group(1)), 'word': m.group(2), 'rest': m.group(3)}
        continue
    if cur is not None:
        cur['rest'] += ' ' + s
if cur:
    entries.append(cur)
print('raw entries:', len(entries))

POS_ALT = 'n|v|vt|vi|adj|adv|prep|conj|pron|num|art|interj|aux|abbr|pl'


def parse_rest(rest):
    rest = rest.strip()
    m = re.match(r'^/([^/]*)/\s*(.*)$', rest)
    if m:
        return m.group(1), m.group(2).strip()
    return '', rest


def clean_meaning(m):
    m = re.sub(r'\s+', ' ', m).strip()
    prev = None
    while prev != m:
        prev = m
        m = re.sub(r'[（(][^（）()]{0,40}?[）)]',
                   lambda mm: '' if re.search(r'人名|地名', mm.group(0)) else mm.group(0), m)
        m = re.sub(r'人\s*名[；;、，,]?[^；;。]{0,40}', '', m)
        m = re.sub(r'地名[；;、，,]?[^；;。]{0,40}', '', m)
        m = re.sub(r'[；;，,]?\s*(?:[（(][A-Za-z][^（）()]{0,30}[）)])+\s*[（(]?[^；;]{0,12}[）)]?\s*$', '', m)
    m = re.sub(r'\s*/\s*$', '', m)
    m = re.sub(r'\s+', ' ', m).strip(' ，,、；;')
    m = re.sub(r'[（(]\s*[）)]', '', m)
    return m.strip()


def senses_of(m):
    s = re.sub(r'(?<![A-Za-z])(' + POS_ALT + r')\.', r'\n\1.', m)
    out = []
    for chunk in s.split('\n'):
        chunk = chunk.strip()
        if not chunk:
            continue
        pm = re.match(r'^(' + POS_ALT + r')\.\s*(.*)$', chunk)
        pos, txt = (pm.group(1) + '.', pm.group(2)) if pm else ('', chunk)
        for bit in re.split(r'[；;]', txt):
            bit = bit.strip(' ，,、。')
            if not bit:
                continue
            sub = re.split(r'(?<![A-Za-z])(' + POS_ALT + r')\.\s*', bit)
            if len(sub) > 1:
                first = sub[0].strip(' ，,、')
                if first:
                    out.append({'pos': pos, 'text': first})
                for i in range(1, len(sub), 2):
                    t = sub[i + 1].strip(' ，,、') if i + 1 < len(sub) else ''
                    if t:
                        out.append({'pos': sub[i] + '.', 'text': t})
            else:
                out.append({'pos': pos, 'text': bit})
    return out


def make_short(entry):
    ss = entry['senses'][:4]
    groups = {}
    seen = set()
    for s in ss:
        txt = s['text'].replace(',', '，')
        if txt in seen:
            continue
        seen.add(txt)
        groups.setdefault(s['pos'], []).append(txt)
    parts = []
    for pos, texts in groups.items():
        seg = '，'.join(dict.fromkeys(texts))
        parts.append(('%s %s' % (pos, seg)) if pos else seg)
    out = '；'.join(parts)
    if len(out) <= 34:
        return out
    parts2 = []
    for pos, texts in groups.items():
        parts2.append(('%s %s' % (pos, texts[0])) if pos else texts[0])
    out2 = '；'.join(parts2)
    if len(out2) <= 34:
        return out2
    first = parts2[0]
    if '，' in first:
        cut = first.rfind('，', 0, 32)
        if cut > 0:
            first = first[:cut]
    return first[:34]


# ---------- 3. 清洗 + 去重 ----------
clean = []
for e in entries:
    ph, meaning = parse_rest(e['rest'])
    meaning = clean_meaning(meaning)
    senses = senses_of(meaning)
    if not senses:
        continue
    seen_txt = set()
    uniq = []
    for s in senses:
        if s['text'] in seen_txt:
            continue
        seen_txt.add(s['text'])
        uniq.append(s)
    clean.append({'word': e['word'], 'meaning': meaning, 'senses': uniq})

seen_word = set()
dedup = []
for d in clean:
    k = d['word'].lower()
    if k in seen_word:
        continue
    seen_word.add(k)
    dedup.append(d)

# ---------- 4. 输出 ----------
out = []
for i, d in enumerate(dedup, 1):
    out.append({
        'id': i,
        'word': d['word'],
        'meaning': d['meaning'],
        'short': make_short(d),
        'senses': d['senses'][:6],
    })

json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print('wrote', OUT, len(out), 'entries')
