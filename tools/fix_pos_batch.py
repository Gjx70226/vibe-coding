# 给词库里 pos 为空的功能词补上词性（词典体小写，和 adj. 保持一致）
# 用法：python tools/fix_pos_batch.py
import re, io, sys

P = "words.js"
MAP = {
    947: "adj",      # near   近的；亲近的
    1070: "pron",    # that   那个；那样
    1086: "prep",    # under  在…下面
    1124: "conj",    # although 虽然；尽管
    1128: "adv",     # around 大约；在周围
    1130: "conj",    # because 因为
    1131: "prep",    # before 在…以前
    1132: "prep",    # behind 在…后面
    1133: "prep",    # below  在…下面
    1134: "prep",    # beside 在…旁边
    1135: "adv",     # besides 此外；而且
    1136: "prep",    # between 在…之间
    1137: "prep",    # beyond 超出
    1146: "prep",    # during 在…期间
    1199: "prep",    # since  自从
    1206: "adv",     # there  在那里
    1208: "conj",    # though 虽然
    1216: "prep",    # toward 向
    1221: "adv",     # up     向上
    1222: "prep",    # upon   在…之上
    1228: "adv",     # where  在哪里
    1229: "conj",    # whether 是否
    1230: "conj",    # while  当…时候
    1231: "prep",    # within 在…里面
    1232: "prep",    # without 没有
}

src = io.open(P, encoding="utf-8").read()
lines = src.split("\n")
n = 0
for ln, pos in MAP.items():
    i = ln - 1
    if i >= len(lines):
        print("!! 行号超界：%d" % ln)
        sys.exit(1)
    old = lines[i]
    if 'pos: ""' not in old:
        print("!! 第 %d 行没有空词性，跳过：%s" % (ln, old[:50]))
        continue
    lines[i] = old.replace('pos: ""', 'pos: "%s"' % pos)
    n += 1

io.open(P, "w", encoding="utf-8", newline="").write("\n".join(lines))
print("已补 %d 个词性" % n)
