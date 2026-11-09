#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""找出「同一词内被拆成了两个选项、但其实意思相同」的可疑词对。

用法：
    python tools/check_clusters.py            # 列出前 60 组可疑
    python tools/check_clusters.py key shake  # 只看指定词
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SENSES = os.path.join(ROOT, 'vocab_senses.json')

PAREN = re.compile(r'[（(][^）)]*[）)]|\[[^\]]*\]')
# 同义候选：后缀「的 / 地 / 了」不影响词义
SUFFIX = re.compile(r'[的地得了]+$')
# 高频同义字对（用于打分，不直接决定合并）
SYN_CHARS = [
    ('怀疑', '疑心'), ('嫌疑', '疑心'), ('摇动', '震动'), ('摇动', '动摇'),
    ('好奇', '求知'), ('混合', '混淆'), ('混合', '混和'), ('攀登', '爬'),
    ('关键', '要害'), ('解答', '答案'), ('调子', '基调'), ('光', '日光'),
    ('寻', '找'), ('买', '购'), ('卖', '售'), ('说', '讲'), ('看', '瞧'),
    ('想', '思'), ('做', '干'), ('美', '漂亮'), ('快', '迅速'), ('大', '巨大'),
]


def norm(t):
    t = PAREN.sub('', t)
    t = t.strip()
    t = SUFFIX.sub('', t)
    return t


def char_overlap(a, b):
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0
    return len(sa & sb) / min(len(sa), len(sb))


def main(argv):
    data = json.load(open(SENSES, encoding='utf-8'))
    only = set(w.lower() for w in argv[1:])

    suspects = []
    for e in data:
        if only and e['word'].lower() not in only:
            continue
        groups = [g for g in e['groups'] if g['tag'] != 'specific']
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                a, b = norm(groups[i]['text']), norm(groups[j]['text'])
                if not a or not b:
                    continue
                score = 0.0
                reasons = []
                if a == b:
                    score = 1.0
                    reasons.append('完全相同')
                elif a in b or b in a:
                    score = 0.9
                    reasons.append('包含关系')
                else:
                    ov = char_overlap(a, b)
                    if ov >= 0.5:
                        score = ov
                        reasons.append('字面重合 %.0f%%' % (ov * 100))
                    for x, y in SYN_CHARS:
                        if (x in a and y in b) or (y in a and x in b):
                            score = max(score, 0.85)
                            reasons.append('同义字对 %s/%s' % (x, y))
                if score >= 0.5:
                    suspects.append((score, e['word'], groups[i]['text'], groups[j]['text'], ','.join(reasons)))

    suspects.sort(reverse=True)
    print('可疑词对：%d 组' % len(suspects))
    for s in suspects[:80]:
        print('  %.2f  %-14s %-14s | %-14s | %s' % s)


if __name__ == '__main__':
    main(sys.argv)
