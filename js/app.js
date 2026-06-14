/* ===== GRE Quant Mastery — engine =====
   Data comes from js/data.js (window.MODULES, window.MASTER_TEST).
   All progress is stored locally in the browser (localStorage); nothing is sent anywhere.
*/
(function () {
  "use strict";

  // ---------- constants ----------
  var STORE_KEY = "greq_v1";
  var QC_CHOICES = [
    "Quantity A is greater",
    "Quantity B is greater",
    "The two quantities are equal",
    "The relationship cannot be determined from the information given"
  ];
  var TYPE_LABEL = { mc: "Multiple choice", qc: "Quantitative comparison", ne: "Numeric entry", ms: "Multiple answer" };
  var PASS = { easyAcc: 0.70, medAcc: 0.60, minEasy: 3, minMed: 3 };
  var SRS_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16 };
  var DAY = 86400000;

  // ---------- data ----------
  var MODULES = (window.MODULES || []).slice().sort(function (a, b) { return a.order - b.order; });
  var MASTER = window.MASTER_TEST || [];
  var bySlug = {}, allQ = {};
  MODULES.forEach(function (m) {
    bySlug[m.slug] = m;
    (m.questions || []).forEach(function (q) { q.m = m.slug; allQ[q.id] = q; });
  });
  MASTER.forEach(function (q) { allQ[q.id] = q; });

  // ---------- state ----------
  function blank() { return { attempts: {}, errors: [], testHistory: [] }; }
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  var state = Object.assign(blank(), load());
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }
  function reset() { state = blank(); save(); }
  function now() { return Date.now(); }

  function record(qid, correct) {
    var a = state.attempts[qid] || { box: 1, seen: 0, correct: 0, wrong: 0 };
    a.seen++;
    if (correct) { a.correct++; a.box = Math.min(5, a.box + 1); }
    else { a.wrong++; a.box = 1; }
    a.last = now();
    a.lastCorrect = !!correct;
    state.attempts[qid] = a;
    save();
  }

  // ---------- stats / gating ----------
  function moduleStats(slug) {
    var m = bySlug[slug]; if (!m) return null;
    var r = { easy: { c: 0, t: 0 }, medium: { c: 0, t: 0 }, hard: { c: 0, t: 0 },
      attempted: 0, total: (m.questions || []).length, correct: 0 };
    (m.questions || []).forEach(function (q) {
      var a = state.attempts[q.id];
      if (a && a.seen > 0) {
        r.attempted++;
        r[q.diff].t++;
        if (a.lastCorrect) { r[q.diff].c++; r.correct++; }
      }
    });
    r.easyAcc = r.easy.t ? r.easy.c / r.easy.t : 0;
    r.medAcc = r.medium.t ? r.medium.c / r.medium.t : 0;
    r.acc = r.attempted ? r.correct / r.attempted : 0;
    return r;
  }
  function gatePass(slug) {
    var s = moduleStats(slug); if (!s) return false;
    return s.easy.t >= PASS.minEasy && s.easyAcc >= PASS.easyAcc &&
           s.medium.t >= PASS.minMed && s.medAcc >= PASS.medAcc;
  }
  function prevModule(m) { return MODULES.filter(function (x) { return x.order === m.order - 1; })[0] || null; }
  function nextModule(m) { return MODULES.filter(function (x) { return x.order === m.order + 1; })[0] || null; }
  function isUnlocked(slug) {
    var m = bySlug[slug]; if (!m) return false;
    if (m.order <= MODULES[0].order) return true;
    var p = prevModule(m);
    return p ? gatePass(p.slug) : true;
  }
  function overallProgress() {
    var done = MODULES.filter(function (m) { return gatePass(m.slug); }).length;
    return MODULES.length ? done / MODULES.length : 0;
  }

  // ---------- spaced repetition + missed ----------
  function dueQuestions() {
    return Object.keys(state.attempts).filter(function (qid) {
      if (!allQ[qid]) return false;
      var a = state.attempts[qid];
      return now() >= (a.last || 0) + (SRS_DAYS[a.box] || 0) * DAY;
    });
  }
  function missedQuestions() {
    return Object.keys(state.attempts).filter(function (qid) {
      return allQ[qid] && state.attempts[qid].lastCorrect === false;
    });
  }
  function weakTopics() {
    return MODULES.map(function (m) { return { m: m, s: moduleStats(m.slug) }; })
      .filter(function (x) { return x.s.attempted > 0; })
      .sort(function (a, b) { return a.s.acc - b.s.acc; });
  }

  // ---------- error log ----------
  function addError(note, module) {
    if (!note || !note.trim()) return;
    state.errors.push({ id: "e" + now() + "-" + Math.random().toString(36).slice(2, 6),
      note: note.trim(), module: module || "", date: now() });
    save();
  }
  function delError(id) { state.errors = state.errors.filter(function (e) { return e.id !== id; }); save(); }

  // ---------- DOM helper ----------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null) continue;
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    if (children != null) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function fmtDate(ts) { var d = new Date(ts); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

  // ---------- question rendering ----------
  function diffBadge(d) { return el("span", { class: "diff-badge diff-" + d, text: d }); }

  function choiceList(choices, uid, kind) {
    var ul = el("ul", { class: "choices" });
    choices.forEach(function (c, i) {
      var li = el("li", {});
      li.dataset.idx = i;
      var lab = el("label", {});
      lab.appendChild(el("input", { type: kind, name: uid, value: i }));
      lab.appendChild(el("span", { class: "ltr", text: String.fromCharCode(65 + i) }));
      lab.appendChild(el("span", { class: "ctext", html: c }));
      li.appendChild(lab);
      ul.appendChild(li);
    });
    return ul;
  }

  function buildQuestion(q, idx, mode) {
    var uid = q.id + "-" + Math.random().toString(36).slice(2, 7);
    var node = el("div", { class: "q" });
    node.dataset.qid = q.id; node.dataset.diff = q.diff;
    var head = el("div", { class: "q-head" });
    if (idx != null) head.appendChild(el("span", { class: "qn", text: "Q" + idx }));
    head.appendChild(diffBadge(q.diff));
    head.appendChild(el("span", { class: "type-badge", text: TYPE_LABEL[q.type] || q.type }));
    node.appendChild(head);

    if (q.info && q.info.trim()) node.appendChild(el("div", { class: "info", html: q.info }));
    if (q.q && q.q.trim()) node.appendChild(el("div", { class: "stem", html: q.q }));

    if (q.type === "qc") {
      var grid = el("div", { class: "qc-quantities" });
      grid.appendChild(el("div", { class: "qbox" }, [el("div", { class: "lbl", text: "Quantity A" }), el("div", { class: "val", html: q.qa })]));
      grid.appendChild(el("div", { class: "qbox" }, [el("div", { class: "lbl", text: "Quantity B" }), el("div", { class: "val", html: q.qb })]));
      node.appendChild(grid);
      node.appendChild(choiceList(QC_CHOICES, uid, "radio"));
    } else if (q.type === "mc") {
      node.appendChild(choiceList(q.choices, uid, "radio"));
    } else if (q.type === "ms") {
      node.appendChild(el("div", { class: "small muted", text: "Select all that apply." }));
      node.appendChild(choiceList(q.choices, uid, "checkbox"));
    } else if (q.type === "ne") {
      node.appendChild(el("div", {}, [el("input", { class: "ne-input", type: "text", inputmode: "decimal", placeholder: "Enter answer", autocomplete: "off" })]));
    }

    var sol = el("details", { class: "sol" });
    sol.appendChild(el("summary", { text: "Show solution" }));
    sol.appendChild(el("div", { class: "sol-body", html: q.explain }));
    if (mode === "quiz") sol.classList.add("hidden"); // hidden until the test is submitted

    if (mode === "practice") {
      var act = el("div", { class: "q-actions" });
      var verdict = el("span", { class: "verdict" });
      var btn = el("button", { class: "btn sm", type: "button", text: "Check answer" });
      btn.addEventListener("click", function () {
        var resp = getResponse(node, q);
        if (resp == null) { verdict.className = "verdict"; verdict.textContent = "Select or enter an answer first."; return; }
        var correct = gradeQuestion(node, q, true);
        if (!node._recorded) { record(q.id, correct); node._recorded = true; }
        verdict.className = "verdict " + (correct ? "ok" : "no");
        verdict.textContent = correct ? "Correct ✓" : "Incorrect ✗";
        sol.open = true;
      });
      act.appendChild(btn); act.appendChild(verdict);
      node.appendChild(act);
    }
    node.appendChild(sol);
    node._q = q;
    return node;
  }

  function getResponse(node, q) {
    if (q.type === "ne") { var v = ($(".ne-input", node).value || "").trim(); return v === "" ? null : v; }
    if (q.type === "ms") {
      var p = Array.prototype.map.call(node.querySelectorAll(".choices input:checked"), function (i) { return +i.value; });
      return p.length ? p : null;
    }
    var sel = $(".choices input:checked", node);
    return sel ? +sel.value : null;
  }
  function parseNum(v) {
    if (typeof v !== "string") return v;
    v = v.replace(/\s+/g, "").replace(/,/g, "");
    var f = v.match(/^([-+]?\d*\.?\d+)\/([-+]?\d*\.?\d+)$/);
    if (f) { var d = parseFloat(f[2]); return d === 0 ? NaN : parseFloat(f[1]) / d; }
    return Number(v);
  }
  function isCorrect(q, resp) {
    if (resp == null) return false;
    if (q.type === "ne") { var n = parseNum(resp); if (isNaN(n)) return false; return Math.abs(n - q.answer) <= (q.tol || 0) + 1e-9; }
    if (q.type === "ms") {
      var a = q.answer.slice().sort(function (x, y) { return x - y; });
      var r = resp.slice().sort(function (x, y) { return x - y; });
      return a.length === r.length && a.every(function (x, i) { return x === r[i]; });
    }
    return resp === q.answer;
  }
  function gradeQuestion(node, q, reveal) {
    var resp = getResponse(node, q);
    var correct = isCorrect(q, resp);
    node.querySelectorAll("input").forEach(function (i) { i.disabled = true; });
    if (q.type === "ne") {
      if (reveal) {
        var wrap = $(".ne-input", node).parentNode;
        if (!$(".ne-ans", wrap)) wrap.appendChild(el("span", { class: "ne-ans small muted", text: "   Correct answer: " + q.answer }));
        $(".ne-input", node).classList.add(correct ? "" : "");
      }
    } else {
      var ans = q.type === "ms" ? q.answer : [q.answer];
      node.querySelectorAll(".choices li").forEach(function (li) {
        var idx = +li.dataset.idx, picked = $("input", li).checked;
        if (ans.indexOf(idx) >= 0) li.classList.add("correct");
        else if (picked) li.classList.add("wrong");
        if (picked) li.classList.add("picked");
      });
    }
    if (reveal) { var sol = $("details.sol", node); if (sol) { sol.classList.remove("hidden"); sol.open = true; } }
    node._graded = true;
    return correct;
  }

  function sample(arr, n) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n);
  }

  // ---------- quiz runner ----------
  function runQuiz(container, questions, opts) {
    opts = opts || {};
    container.innerHTML = "";
    var finished = false, timer = null, remaining = opts.seconds || 0;
    var nodes = [];

    var bar = el("div", { class: "quiz-bar" });
    bar.appendChild(el("strong", { text: opts.title || "Quiz" }));
    var timerEl = null;
    if (opts.timed) { timerEl = el("span", { class: "timer" }); bar.appendChild(timerEl); }
    bar.appendChild(el("span", { class: "small muted", text: questions.length + " questions" }));
    container.appendChild(bar);

    var list = el("div", {});
    questions.forEach(function (q, i) { var n = buildQuestion(q, i + 1, "quiz"); nodes.push({ q: q, n: n }); list.appendChild(n); });
    container.appendChild(list);

    var submitBtn = el("button", { class: "btn", type: "button", text: "Submit & see score" });
    var result = el("div", {});
    container.appendChild(el("div", { class: "btn-row" }, [submitBtn]));
    container.appendChild(result);

    function finish() {
      if (finished) return; finished = true;
      if (timer) clearInterval(timer);
      var correct = 0;
      nodes.forEach(function (o) { var ok = gradeQuestion(o.n, o.q, true); record(o.q.id, ok); if (ok) correct++; });
      submitBtn.disabled = true;
      if (timerEl) timerEl.textContent = " ⏱ done";
      var res = { correct: correct, total: questions.length };
      if (opts.scaled) { state.testHistory.push({ date: now(), correct: correct, total: res.total }); save(); }
      renderResult(result, res, opts);
      result.scrollIntoView({ behavior: "smooth", block: "start" });
      if (opts.onFinish) opts.onFinish(res);
    }
    submitBtn.addEventListener("click", function () { if (confirm("Submit and see your score? Answers will be locked.")) finish(); });

    if (opts.timed) {
      var tick = function () {
        var m = Math.floor(remaining / 60), s = remaining % 60;
        timerEl.textContent = " ⏱ " + m + ":" + (s < 10 ? "0" + s : s);
        timerEl.classList.toggle("low", remaining <= 60);
        if (remaining <= 0) { finish(); return; }
        remaining--;
      };
      tick(); timer = setInterval(tick, 1000);
    }
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderResult(container, res, opts) {
    var pct = res.total ? res.correct / res.total : 0;
    container.innerHTML = "";
    var panel = el("div", { class: "panel center" });
    if (opts.scaled) {
      var scaled = Math.round(130 + pct * 40);
      var band = scaled >= 166 ? ["target", "165+ — Target achieved! 🎯"]
        : scaled >= 156 ? ["strong", "Strong (155–165)"]
        : scaled >= 146 ? ["inter", "Intermediate (145–155)"]
        : ["weak", "Weak foundation (130–145)"];
      panel.appendChild(el("div", { class: "score-big", text: "~" + scaled }));
      panel.appendChild(el("div", { class: "small muted", text: "Estimated GRE Quant score (130–170 scale)" }));
      panel.appendChild(el("div", {}, [el("span", { class: "band " + band[0], text: band[1] })]));
      panel.appendChild(el("p", { class: "lead", text: res.correct + " of " + res.total + " correct (" + Math.round(pct * 100) + "%)." }));
    } else {
      panel.appendChild(el("div", { class: "score-big", text: Math.round(pct * 100) + "%" }));
      panel.appendChild(el("p", { class: "lead", text: res.correct + " of " + res.total + " correct." }));
    }
    panel.appendChild(el("p", { class: "small muted", text: "Scroll up to review every question — correct answers are highlighted in green and full solutions are revealed. Missed questions are added to your Review queue." }));
    container.appendChild(panel);
  }

  // ---------- page: HOME ----------
  function initHome() {
    if (!MODULES.length) return;
    var prog = overallProgress();
    var att = 0, cor = 0;
    Object.keys(state.attempts).forEach(function (qid) { if (allQ[qid]) { att++; if (state.attempts[qid].lastCorrect) cor++; } });
    var due = dueQuestions().length;
    var completed = MODULES.filter(function (m) { return gatePass(m.slug); }).length;

    var of = $("#overall-fill"); if (of) of.style.width = Math.round(prog * 100) + "%";
    var op = $("#overall-pct"); if (op) op.textContent = Math.round(prog * 100) + "%";

    var kpi = $("#kpis");
    if (kpi) {
      kpi.innerHTML = "";
      [[completed + " / " + MODULES.length, "Modules mastered"],
       [att, "Questions attempted"],
       [att ? Math.round(cor / att * 100) + "%" : "—", "Overall accuracy"],
       [due, "Reviews due"]].forEach(function (k) {
        kpi.appendChild(el("div", { class: "kpi" }, [el("div", { class: "big", text: String(k[0]) }), el("div", { class: "lbl", text: k[1] })]));
      });
    }

    var cont = $("#continue-btn");
    if (cont) {
      var nextStudy = MODULES.filter(function (m) { return isUnlocked(m.slug) && !gatePass(m.slug); })[0];
      if (nextStudy) { cont.setAttribute("href", "module.html?m=" + nextStudy.slug); cont.textContent = (att ? "Continue: " : "Start: ") + nextStudy.title + " →"; }
      else { cont.setAttribute("href", "test.html"); cont.textContent = "All modules mastered — take the Master Test →"; }
    }

    var grid = $("#module-grid");
    if (grid) {
      grid.innerHTML = "";
      MODULES.forEach(function (m) {
        var unlocked = isUnlocked(m.slug), done = gatePass(m.slug), s = moduleStats(m.slug);
        var card = el("div", { class: "card module" + (unlocked ? "" : " locked") });
        card.appendChild(el("span", { class: "order-pill", text: "MODULE " + m.order }));
        if (!unlocked) card.appendChild(el("span", { class: "lock-badge", text: "🔒" }));
        else if (done) card.appendChild(el("span", { class: "lock-badge", text: "✅" }));
        card.appendChild(el("div", { class: "ico", text: m.icon || "📘" }));
        card.appendChild(el("h3", { text: m.title }));
        card.appendChild(el("div", { class: "blurb", text: m.blurb || "" }));
        var foot = el("div", { class: "mod-foot" });
        if (!unlocked) {
          var pv = prevModule(m);
          foot.appendChild(el("span", { class: "muted", text: "Locked — finish " + (pv ? pv.title : "the previous module") }));
        } else {
          var barWrap = el("div", { class: "bar " + (done ? "good" : ""), style: "flex:1;margin-right:10px" });
          barWrap.appendChild(el("span", { style: "width:" + Math.round((s.attempted ? s.acc : 0) * 100) + "%" }));
          foot.appendChild(barWrap);
          foot.appendChild(el("span", { text: done ? "Mastered" : (s.attempted ? Math.round(s.acc * 100) + "%" : "New") }));
        }
        card.appendChild(foot);
        if (unlocked) card.addEventListener("click", function () { location.href = "module.html?m=" + m.slug; });
        grid.appendChild(card);
      });
    }

    var weak = $("#weak-list");
    if (weak) {
      var wt = weakTopics();
      weak.innerHTML = "";
      if (!wt.length) weak.appendChild(el("p", { class: "muted", text: "Attempt some practice questions and your weakest topics will surface here." }));
      else wt.slice(0, 6).forEach(function (x) {
        var acc = x.s.acc, cls = acc < 0.6 ? "low" : acc < 0.8 ? "mid" : "hi";
        var row = el("div", { class: "wt " + cls });
        row.appendChild(el("a", { class: "name", href: "module.html?m=" + x.m.slug, text: x.m.icon + " " + x.m.title }));
        var b = el("div", { class: "bar thin" }); b.appendChild(el("span", { style: "width:" + Math.round(acc * 100) + "%" }));
        row.appendChild(b);
        row.appendChild(el("span", { class: "pct", text: Math.round(acc * 100) + "%" }));
        weak.appendChild(row);
      });
    }

    var dn = $("#due-note");
    if (dn) dn.innerHTML = due ? ("You have <strong>" + due + "</strong> question(s) due for spaced review. <a href='review.html'>Go to Review →</a>")
      : "No reviews due right now. Practice questions to build your review deck.";
  }

  // ---------- page: MODULE ----------
  function initModule() {
    var slug = new URLSearchParams(location.search).get("m");
    var m = bySlug[slug];
    var root = $("#module-root");
    if (!m) { if (root) root.innerHTML = "<div class='panel'>Module not found. <a href='index.html'>Return home</a>.</div>"; return; }
    document.title = m.title + " — GRE Quant Mastery";

    var hd = $("#module-header");
    if (hd) {
      hd.innerHTML = "";
      hd.appendChild(el("h1", { html: (m.icon || "") + " " + m.title }));
      hd.appendChild(el("p", { class: "lead", text: m.blurb || "" }));
    }

    renderGate(m);

    // theory
    var th = $("#theory-box");
    if (th) {
      th.innerHTML = "";
      th.appendChild(el("div", { html: m.theory || "" }));
      if (m.whatEtsTests) th.appendChild(el("div", { class: "callout ets" }, [el("h4", { text: "🎯 What ETS tests most" }), el("div", { html: m.whatEtsTests })]));
      if (m.tips && m.tips.length) th.appendChild(calloutList("tip", "⚡ GRE shortcuts & mental-math tips", m.tips));
      if (m.traps && m.traps.length) th.appendChild(calloutList("trap", "⚠️ Common traps to avoid", m.traps));
    }

    // examples
    var ex = $("#examples-box");
    if (ex) {
      ex.innerHTML = "";
      (m.examples || []).forEach(function (e, i) {
        var d = el("details", { class: "ex" });
        d.appendChild(el("summary", { html: "Worked Example " + (i + 1) }));
        var body = el("div", { class: "ex-body" });
        body.appendChild(el("div", { html: e.q }));
        body.appendChild(el("div", { html: e.steps }));
        if (e.shortcut && e.shortcut.trim()) body.appendChild(el("div", { class: "shortcut", html: "<strong>GRE shortcut:</strong> " + e.shortcut }));
        d.appendChild(body);
        ex.appendChild(d);
      });
    }

    // practice
    var tb = $("#practice-toolbar"), pl = $("#practice-list");
    if (tb && pl) {
      tb.innerHTML = ""; pl.innerHTML = "";
      var qs = m.questions || [];
      qs.forEach(function (q, i) { pl.appendChild(buildQuestion(q, i + 1, "practice")); });
      ["all", "easy", "medium", "hard"].forEach(function (d) {
        var chip = el("span", { class: "chip" + (d === "all" ? " active" : ""), text: d === "all" ? "All" : d[0].toUpperCase() + d.slice(1) });
        chip.addEventListener("click", function () {
          tb.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          pl.querySelectorAll(".q").forEach(function (qn) { qn.classList.toggle("hidden", d !== "all" && qn.dataset.diff !== d); });
        });
        tb.appendChild(chip);
      });
    }

    // self-test
    var st = $("#selftest-box");
    if (st) {
      st.innerHTML = "";
      var qz = el("div", {});
      var n = Math.min(10, (m.questions || []).length);
      var startBtn = el("button", { class: "btn", type: "button", text: "▶ Start timed self-test (" + n + " questions, " + Math.round(n * 1.5) + " min)" });
      startBtn.addEventListener("click", function () {
        startBtn.disabled = true;
        runQuiz(qz, sample(m.questions, n), { title: m.title + " — Self-Test", timed: true, seconds: n * 90,
          onFinish: function () { renderGate(m); renderModuleNav(m); } });
      });
      st.appendChild(el("p", { class: "muted", text: "A timed mix of this module's questions. Your results feed your progress, weak-topic dashboard, and spaced-repetition deck." }));
      st.appendChild(startBtn);
      st.appendChild(qz);
    }

    // module error log
    renderModuleErrors(slug);

    // nav
    renderModuleNav(m);
  }

  function renderGate(m) {
    var gate = $("#gate-box"); if (!gate) return;
    var slug = m.slug, unlocked = isUnlocked(slug), s = moduleStats(slug);
    gate.innerHTML = "";
    if (!unlocked) {
      var pv = prevModule(m);
      var g = el("div", { class: "gate" });
      g.appendChild(el("p", {}, [el("strong", { text: "🔒 This module is locked. " }),
        "Reach the mastery bar in " + (pv ? "“" + pv.title + "”" : "the previous module") + " to unlock it. You can still study the material below."]));
      if (pv) g.appendChild(el("a", { class: "btn sm", href: "module.html?m=" + pv.slug, text: "← Go to " + pv.title }));
      gate.appendChild(g);
    } else {
      var done = gatePass(slug);
      var g2 = el("div", { class: "gate " + (done ? "pass" : "") });
      g2.appendChild(el("p", {}, [el("strong", { text: done ? "✅ Module mastered — the next module is unlocked." : "Mastery goals for this module:" })]));
      g2.appendChild(reqRow("Easy accuracy ≥ 70%", s.easyAcc >= PASS.easyAcc && s.easy.t >= PASS.minEasy,
        (s.easy.t ? Math.round(s.easyAcc * 100) + "%" : "0%") + " over " + s.easy.t + " attempted"));
      g2.appendChild(reqRow("Medium accuracy ≥ 60%", s.medAcc >= PASS.medAcc && s.medium.t >= PASS.minMed,
        (s.medium.t ? Math.round(s.medAcc * 100) + "%" : "0%") + " over " + s.medium.t + " attempted"));
      gate.appendChild(g2);
    }
  }
  function reqRow(label, met, detail) {
    return el("div", { class: "req" }, [
      el("span", {}, [(met ? "✓ " : "○ "), label]),
      el("span", { class: met ? "met" : "unmet", text: detail })
    ]);
  }
  function calloutList(kind, title, items) {
    var c = el("div", { class: "callout " + kind });
    c.appendChild(el("h4", { text: title }));
    var ul = el("ul", {});
    items.forEach(function (t) { ul.appendChild(el("li", { html: t })); });
    c.appendChild(ul);
    return c;
  }
  function renderModuleErrors(slug) {
    var box = $("#errlog-box"); if (!box) return;
    box.innerHTML = "";
    var ta = el("textarea", { class: "note", placeholder: "Log a mistake or insight from this module — what tripped you up, and the rule to remember…" });
    var btn = el("button", { class: "btn sm", type: "button", text: "Save note" });
    var listWrap = el("div", {});
    function refresh() {
      listWrap.innerHTML = "";
      var items = state.errors.filter(function (e) { return e.module === slug; });
      if (!items.length) { listWrap.appendChild(el("p", { class: "muted small", text: "No notes yet for this module." })); return; }
      items.slice().reverse().forEach(function (e) {
        var item = el("div", { class: "log-item" });
        item.appendChild(el("div", {}, [el("div", { text: e.note }), el("div", { class: "meta", text: fmtDate(e.date) })]));
        var del = el("button", { class: "btn sm gray", type: "button", text: "Delete" });
        del.addEventListener("click", function () { delError(e.id); refresh(); });
        item.appendChild(del);
        listWrap.appendChild(item);
      });
    }
    btn.addEventListener("click", function () { if (ta.value.trim()) { addError(ta.value, slug); ta.value = ""; refresh(); } });
    box.appendChild(ta); box.appendChild(el("div", { class: "btn-row" }, [btn])); box.appendChild(listWrap);
    refresh();
  }
  function renderModuleNav(m) {
    var nav = $("#module-nav"); if (!nav) return;
    nav.innerHTML = "";
    var p = prevModule(m), nx = nextModule(m);
    if (p) nav.appendChild(el("a", { class: "btn ghost", href: "module.html?m=" + p.slug, text: "← " + p.title }));
    else nav.appendChild(el("a", { class: "btn ghost", href: "index.html", text: "← Home" }));
    if (nx) {
      if (gatePass(m.slug)) nav.appendChild(el("a", { class: "btn", href: "module.html?m=" + nx.slug, text: "Next: " + nx.title + " →" }));
      else {
        var b = el("button", { class: "btn", type: "button", disabled: "disabled", text: "🔒 Next: " + nx.title });
        b.title = "Reach 70% easy and 60% medium accuracy to unlock.";
        nav.appendChild(b);
        nav.appendChild(el("span", { class: "small muted", text: "Hit the mastery goals above to unlock the next module." }));
      }
    } else {
      nav.appendChild(el("a", { class: "btn good", href: "test.html", text: "Take the Master Test 🎓" }));
    }
  }

  // ---------- page: TEST ----------
  function initTest() {
    var intro = $("#test-intro"), quiz = $("#test-quiz");
    if (!intro || !quiz) return;
    var startBtn = $("#start-test");
    if (startBtn) startBtn.addEventListener("click", function () {
      intro.classList.add("hidden");
      runQuiz(quiz, MASTER.slice(), { title: "GRE Quant Master Test", timed: true, seconds: MASTER.length * 60, scaled: true });
    });
    var hist = $("#test-history");
    if (hist && state.testHistory.length) {
      hist.innerHTML = "<h3 class='section'>Your previous attempts</h3>";
      state.testHistory.slice().reverse().slice(0, 8).forEach(function (t) {
        var sc = Math.round(130 + (t.correct / t.total) * 40);
        hist.appendChild(el("div", { class: "log-item" }, [
          el("div", { text: "Score ~" + sc + "  (" + t.correct + "/" + t.total + ")" }),
          el("div", { class: "meta", text: fmtDate(t.date) })
        ]));
      });
    }
  }

  // ---------- page: REVIEW ----------
  function initReview() {
    // SRS
    var srs = $("#srs-box");
    if (srs) {
      srs.innerHTML = "";
      var dueIds = dueQuestions();
      var qz = el("div", {});
      if (!dueIds.length) srs.appendChild(el("p", { class: "muted", text: "Nothing due right now. Spaced repetition resurfaces questions you've answered — correct ones return after longer gaps, missed ones come back immediately." }));
      else {
        var b = el("button", { class: "btn", type: "button", text: "▶ Review " + dueIds.length + " due question(s)" });
        b.addEventListener("click", function () {
          b.disabled = true;
          runQuiz(qz, dueIds.map(function (id) { return allQ[id]; }), { title: "Spaced Repetition Review", timed: false, onFinish: function () { setTimeout(initReview, 400); } });
        });
        srs.appendChild(el("p", { class: "muted", text: dueIds.length + " question(s) are scheduled for review today." }));
        srs.appendChild(b);
      }
      srs.appendChild(qz);
    }

    // weak topics
    var weak = $("#weak-box");
    if (weak) {
      weak.innerHTML = "";
      var wt = weakTopics();
      if (!wt.length) weak.appendChild(el("p", { class: "muted", text: "No data yet — attempt practice questions to populate this dashboard." }));
      else wt.forEach(function (x) {
        var acc = x.s.acc, cls = acc < 0.6 ? "low" : acc < 0.8 ? "mid" : "hi";
        var row = el("div", { class: "wt " + cls });
        row.appendChild(el("a", { class: "name", href: "module.html?m=" + x.m.slug, text: x.m.icon + " " + x.m.title }));
        var bb = el("div", { class: "bar thin" }); bb.appendChild(el("span", { style: "width:" + Math.round(acc * 100) + "%" }));
        row.appendChild(bb);
        row.appendChild(el("span", { class: "pct", text: Math.round(acc * 100) + "% (" + x.s.correct + "/" + x.s.attempted + ")" }));
        weak.appendChild(row);
      });
    }

    // missed questions
    var missed = $("#missed-box");
    if (missed) {
      missed.innerHTML = "";
      var ids = missedQuestions();
      var qz2 = el("div", {});
      if (!ids.length) missed.appendChild(el("p", { class: "muted", text: "No missed questions logged. Anything you answer incorrectly lands here for targeted redo." }));
      else {
        var b2 = el("button", { class: "btn", type: "button", text: "▶ Redo " + ids.length + " missed question(s)" });
        b2.addEventListener("click", function () { b2.disabled = true; runQuiz(qz2, sample(ids.map(function (id) { return allQ[id]; }), Math.min(ids.length, 15)), { title: "Mistake Redo", timed: false, onFinish: function () { setTimeout(initReview, 400); } }); });
        var ul = el("ul", {});
        ids.slice(0, 30).forEach(function (id) {
          var q = allQ[id], mod = bySlug[q.m];
          ul.appendChild(el("li", {}, [el("span", { class: "diff-badge diff-" + q.diff, text: q.diff }), " " + (mod ? mod.title : q.m) + " — " + (q.id)]));
        });
        missed.appendChild(b2);
        missed.appendChild(ul);
      }
      missed.appendChild(qz2);
    }

    // global error log
    var elog = $("#errlog-all");
    if (elog) {
      elog.innerHTML = "";
      var ta = el("textarea", { class: "note", placeholder: "Note any mistake, weak area, or strategy reminder…" });
      var sel = el("select", { class: "ne-input", style: "width:auto" });
      sel.appendChild(el("option", { value: "", text: "General" }));
      MODULES.forEach(function (mm) { sel.appendChild(el("option", { value: mm.slug, text: mm.title })); });
      var btn = el("button", { class: "btn sm", type: "button", text: "Save note" });
      var listWrap = el("div", {});
      function refresh() {
        listWrap.innerHTML = "";
        if (!state.errors.length) { listWrap.appendChild(el("p", { class: "muted small", text: "No notes yet." })); return; }
        state.errors.slice().reverse().forEach(function (e) {
          var modName = e.module && bySlug[e.module] ? bySlug[e.module].title : "General";
          var item = el("div", { class: "log-item" });
          item.appendChild(el("div", {}, [el("div", { text: e.note }), el("div", { class: "meta", text: modName + " · " + fmtDate(e.date) })]));
          var del = el("button", { class: "btn sm gray", type: "button", text: "Delete" });
          del.addEventListener("click", function () { delError(e.id); refresh(); });
          item.appendChild(del);
          listWrap.appendChild(item);
        });
      }
      btn.addEventListener("click", function () { if (ta.value.trim()) { addError(ta.value, sel.value); ta.value = ""; refresh(); } });
      elog.appendChild(el("div", { class: "btn-row" }, [sel]));
      elog.appendChild(ta);
      elog.appendChild(el("div", { class: "btn-row" }, [btn]));
      elog.appendChild(listWrap);
      refresh();
    }

    // reset
    var rb = $("#reset-box");
    if (rb) {
      rb.innerHTML = "";
      var btn = el("button", { class: "btn gray", type: "button", text: "Reset all progress" });
      btn.addEventListener("click", function () { if (confirm("Erase ALL progress, stats, review history, and notes? This cannot be undone.")) { reset(); location.reload(); } });
      rb.appendChild(btn);
    }
  }

  // ---------- page: FORMULAS ----------
  function initFormulas() {
    var inp = $("#formula-search");
    if (!inp) return;
    inp.addEventListener("input", function () {
      var q = inp.value.trim().toLowerCase();
      document.querySelectorAll(".formula-section").forEach(function (sec) {
        var any = false;
        sec.querySelectorAll("tbody tr").forEach(function (tr) {
          var show = !q || tr.textContent.toLowerCase().indexOf(q) >= 0;
          tr.classList.toggle("hidden", !show);
          if (show) any = true;
        });
        sec.classList.toggle("hidden", !any);
      });
    });
  }

  // ---------- boot ----------
  window.GRE = { state: state, MODULES: MODULES, reset: reset };
  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.getAttribute("data-page");
    try {
      if (page === "home") initHome();
      else if (page === "module") initModule();
      else if (page === "test") initTest();
      else if (page === "review") initReview();
      else if (page === "formulas") initFormulas();
    } catch (e) {
      var r = $("#module-root") || document.querySelector(".wrap");
      if (r) r.appendChild(el("div", { class: "panel", text: "Something went wrong rendering this page: " + e.message }));
      throw e;
    }
  });
})();
