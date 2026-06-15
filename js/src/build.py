#!/usr/bin/env python3
"""Validate all module JSON files and assemble js/data.js. Reports any structural errors."""
import json, os, sys, re

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(SRC), "data.js")
SLUGS = ["arithmetic","fractions","percentages","exponents","algebra","linear",
         "inequalities","wordproblems","geometry","coordinate","statistics","probability"]

errors = []
def err(ctx, msg): errors.append(f"[{ctx}] {msg}")

def check_question(ctx, q):
    qid = q.get("id","<no id>")
    c = f"{ctx}:{qid}"
    for k in ("id","diff","type","answer","explain"):
        if k not in q: err(c, f"missing key '{k}'")
    if q.get("diff") not in ("easy","medium","hard"): err(c, f"bad diff {q.get('diff')!r}")
    t = q.get("type")
    if t not in ("mc","qc","ne","ms"): err(c, f"bad type {t!r}"); return
    ans = q.get("answer")
    ch = q.get("choices", [])
    if t == "mc":
        if len(ch) < 2: err(c, f"mc needs >=2 choices, has {len(ch)}")
        if not isinstance(ans, int) or not (0 <= ans < len(ch)): err(c, f"mc answer {ans} out of range 0..{len(ch)-1}")
    elif t == "qc":
        if not isinstance(ans, int) or not (0 <= ans <= 3): err(c, f"qc answer {ans} not in 0..3")
        if not (q.get("qa","").strip() and q.get("qb","").strip()): err(c, "qc missing qa/qb")
    elif t == "ne":
        if not isinstance(ans, (int,float)): err(c, f"ne answer not numeric: {ans!r}")
    elif t == "ms":
        if not isinstance(ans, list) or not ans: err(c, f"ms answer must be non-empty list, got {ans!r}")
        else:
            for i in ans:
                if not isinstance(i,int) or not (0 <= i < len(ch)): err(c, f"ms index {i} out of range 0..{len(ch)-1}")
            if len(set(ans)) != len(ans): err(c, "ms answer has duplicate indices")

def _norm(s):
    return re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", str(s))).lower()
def sig(q):
    """A normalized signature of a question's visible content, for duplicate detection."""
    return "|".join([_norm(q.get("q","")), _norm(q.get("info","")), _norm(q.get("qa","")),
                     _norm(q.get("qb","")), _norm("".join(map(str, q.get("choices", []))))])

modules = []
ids = {}
for slug in SLUGS:
    path = os.path.join(SRC, slug + ".json")
    try:
        with open(path, encoding="utf-8") as f:
            m = json.load(f)
    except Exception as e:
        err(slug, f"JSON parse failed: {e}"); continue
    if m.get("slug") != slug: err(slug, f"slug mismatch: {m.get('slug')!r}")
    qs = m.get("questions", [])
    diffs = {"easy":0,"medium":0,"hard":0}
    for q in qs:
        check_question(slug, q)
        diffs[q.get("diff","?")] = diffs.get(q.get("diff","?"),0)+1
        qid = q.get("id")
        if qid in ids: err(slug, f"duplicate question id {qid} (also in {ids[qid]})")
        ids[qid] = slug
    if len(qs) < 10: err(slug, f"only {len(qs)} questions")
    if len(m.get("examples", [])) < 3: err(slug, f"only {len(m.get('examples',[]))} examples")

    # self-test bank — a SEPARATE set of fresh questions (not the practice set)
    st_path = os.path.join(SRC, slug + ".selftest.json")
    st = []
    if not os.path.exists(st_path):
        err(slug, "missing self-test bank file (.selftest.json)")
    else:
        try:
            with open(st_path, encoding="utf-8") as f:
                st = json.load(f)
        except Exception as e:
            err(slug + "/selftest", f"JSON parse failed: {e}"); st = []
        st_diffs = {"easy":0,"medium":0,"hard":0}
        for q in st:
            check_question(slug + "/selftest", q)
            st_diffs[q.get("diff","?")] = st_diffs.get(q.get("diff","?"),0)+1
            qid = q.get("id")
            if qid in ids: err(slug + "/selftest", f"duplicate question id {qid} (also in {ids[qid]})")
            ids[qid] = slug + "/selftest"
        if len(st) < 8: err(slug + "/selftest", f"only {len(st)} self-test questions")
        # self-test questions must NOT reuse a practice question (same stem/quantities/choices)
        practice_sigs = {sig(q) for q in qs}
        for q in st:
            if sig(q) in practice_sigs:
                err(slug + "/selftest", f"{q.get('id')} duplicates a practice question")
    m["selftest"] = st

    modules.append(m)
    print(f"  {slug:14s} {len(qs):2d} q  (E{diffs['easy']} M{diffs['medium']} H{diffs['hard']})  {len(m.get('examples',[]))} ex   +{len(st):2d} self-test")

# master test
mt = []
try:
    with open(os.path.join(SRC,"mastertest.json"), encoding="utf-8") as f:
        mt = json.load(f)
    for q in mt:
        check_question("master", q)
        if "m" not in q: err("master", f"{q.get('id')} missing module tag 'm'")
        elif q["m"] not in SLUGS: err("master", f"{q.get('id')} bad module tag {q['m']!r}")
    print(f"  master-test    {len(mt)} q")
except Exception as e:
    err("master", f"JSON parse failed: {e}")

modules.sort(key=lambda m: m.get("order", 999))

print("\n" + ("="*50))
if errors:
    print(f"FAILED — {len(errors)} problem(s):")
    for e in errors: print("  ✗ " + e)
    sys.exit(1)

practice_q = sum(len(m["questions"]) for m in modules)
selftest_q = sum(len(m.get("selftest", [])) for m in modules)
total_q = practice_q + selftest_q + len(mt)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("/* Auto-generated by js/src/build.py — do not edit by hand. */\n")
    f.write("window.MODULES = " + json.dumps(modules, ensure_ascii=False) + ";\n")
    f.write("window.MASTER_TEST = " + json.dumps(mt, ensure_ascii=False) + ";\n")
print(f"OK — {len(modules)} modules, {practice_q} practice + {selftest_q} self-test + {len(mt)} master = {total_q} total questions. Wrote {OUT}")
