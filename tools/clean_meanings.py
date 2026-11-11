#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清洗中文释义：去掉夹带的英文（避免泄露答案）与人名/地名注释。

只改 vocab_clean.json 的 meaning / short 两个字段；义项拆分仍由
split_senses.py 从 meaning 重新生成。
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'vocab_clean.json')

POS = r'(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|interj|aux|abbr)\.'
BR_LATIN = re.compile(r'[（(][^（）()]*[A-Za-z][^（）()]*[）)]')


def strip_name_tail(s):
    """从「含英文的括注」删到下一个词性标记或结尾（这段通常是姓名注释）。"""
    guard = 0
    while True:
        m = BR_LATIN.search(s)
        if not m or guard > 4:
            break
        guard += 1
        rest = s[m.end():]
        nxt = re.search(POS, rest)
        end = m.end() + (nxt.start() if nxt else len(rest))
        s = s[:m.start()] + s[end:]
    return s


def clean(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    # 1) 含英文的括注：连同紧随其后的姓名尾巴一起删
    s = strip_name_tail(s)
    # 2) 剩余含英文的括注
    s = BR_LATIN.sub('', s)
    # 3) 「人名 / 地名」注释段
    s = re.sub(r'[；;，,、]?\s*人\s*名\s*[；;、，,]?[^；;。]{0,40}', '', s)
    s = re.sub(r'[；;，,、]?\s*地\s*名\s*[；;、，,]?[^；;。]{0,40}', '', s)
    # 4) 夹在括号里的“人名/地名”
    s = re.sub(r'[（(][^（）()]*(?:人名|地名)[^（）()]*[）)]', '', s)
    # 5) 残留的英文单词（先把词性标记保护起来，避免 vt./adj. 被误删）
    s = re.sub(POS, lambda m: '\u0001' + m.group(0) + '\u0001', s)
    s = re.sub(r'(?<![\u0001A-Za-z])[A-Za-z]{2,}(?![A-Za-z\u0001])', '', s)
    s = s.replace('\u0001', '')
    # 6) 光秃秃的词性标记（后面没有内容）
    for _ in range(3):
        s = re.sub(POS + r'\s*(?=[；;，,、]|$)', '', s)
    # 7) 收尾：多余标点、空括号
    s = re.sub(r'[（(]\s*[）)]', '', s)
    s = re.sub(r'[；;，,、]\s*(?=[；;，,、]|$)', '', s)
    s = re.sub(r'\s*[，,]?\s*(' + POS + r')', r' \1', s)
    s = re.sub(r'\s+', ' ', s).strip(' ，,、；;')
    s = re.sub(r'^[；;，,、\s]+', '', s)
    return s


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    changed = 0
    for e in data:
        old_m, old_s = e['meaning'], e['short']
        e['meaning'] = clean(old_m)
        e['short'] = clean(old_s) or e['meaning']
        if e['meaning'] != old_m or e['short'] != old_s:
            changed += 1
    json.dump(data, open(SRC, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('changed', changed, 'of', len(data))

    left = [e for e in data if re.search(r'[A-Za-z]{2,}', re.sub(POS, '', e['short']))]
    print('still has latin in short:', len(left))
    for e in left[:8]:
        print('  ', e['word'], '|', e['short'])
    for w in ('heaven', 'wall', 'sun', 'planet', 'their', 'key'):
        for e in data:
            if e['word'].lower() == w:
                print('==', w, '|', e['short'])


if __name__ == '__main__':
    main()
