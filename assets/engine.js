/* ============================================================
   Bird is the Word — shared game engine
   Plain global script (no modules) so it works both on
   GitHub Pages and when a file is opened directly (file://).
   Load it before use: <script src="../assets/engine.js"></script>

   Every game supports MULTIPLE SETS ("Aufgaben-Sets").
   Pass either a single dataset (pairs/questions/items/cards)
   OR `sets: [ <dataset>, <dataset>, ... ]` for several runs.
   When more than one set exists, two buttons appear:
     • "Nächste Aufgaben →"   – load the next set
     • "🎲 Zufällige Aufgaben" – load a random set
   ============================================================ */

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---- Set controls (shared) ---- */
function setBarHTML(n) {
  if (!n || n <= 1) return "";
  return `
    <div class="set-bar">
      <span class="set-label">Aufgaben-Set <b data-set>1</b> / ${n}</span>
      <button class="btn btn-ghost btn-sm" data-set-next>Nächste Aufgaben →</button>
      <button class="btn btn-ghost btn-sm" data-set-rand>Zufällige Aufgaben</button>
    </div>`;
}
function wireSetBar(root, n, loadSet, getCurrent) {
  const next = root.querySelector("[data-set-next]");
  if (!next) return;
  next.addEventListener("click", () => loadSet((getCurrent() + 1) % n));
  root.querySelector("[data-set-rand]").addEventListener("click", () => {
    let r; do { r = Math.floor(Math.random() * n); } while (n > 1 && r === getCurrent());
    loadSet(r);
  });
}
function updateSetLabel(root, i) {
  const el = root.querySelector("[data-set]");
  if (el) el.textContent = i + 1;
}

/* ---- Shared result overlay (quiz / sort) ---- */
function gameOverlayHTML() {
  return `
    <div class="game-overlay" data-overlay hidden>
      <div class="game-result">
        <div class="game-stars" data-stars></div>
        <h2 data-result-title></h2>
        <p data-result-detail></p>
        <button class="btn btn-primary" data-again>Noch einmal</button>
      </div>
    </div>`;
}
function showGameOverlay(root, stars, title, detail) {
  root.querySelector("[data-stars]").innerHTML =
    "★".repeat(stars) + "<span class='mem-star-empty'>" + "★".repeat(3 - stars) + "</span>";
  root.querySelector("[data-result-title]").textContent = title;
  root.querySelector("[data-result-detail]").textContent = detail;
  root.querySelector("[data-overlay]").hidden = false;
}
function starsByRatio(correct, total) {
  if (total === 0) return 3;
  const r = correct / total;
  if (r >= 0.9) return 3;
  if (r >= 0.6) return 2;
  return 1;
}

/* ============================================================
   memoryGame(selector, options)
   options = {
     pairs: [ ["Vorderseite","Rückseite"], ... ]   // single set
     // OR
     sets:  [ [ ...pairs ], [ ...pairs ], ... ]     // several sets
     columns?: number,
     starThresholds?: { three, two },
     messages?: { three, two, one }
   }
   ============================================================ */
function memoryGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("memoryGame: no element for", selector); return; }

  const sets = options.sets ? options.sets : [options.pairs || []];
  const messages = options.messages || {
    three: "Perfekt! Du bist ein Memory-Profi.",
    two:   "Super gemacht! Fast perfekt.",
    one:   "Geschafft! Übung macht den Meister.",
  };

  let currentSet = 0, activePairs = [], pairCount = 0, starThresholds = {};
  let first = null, second = null, lock = false;
  let mistakes = 0, matched = 0, seconds = 0, timerId = null, started = false;

  root.classList.add("mem");
  root.innerHTML = `
    ${setBarHTML(sets.length)}
    <div class="mem-stats">
      <span class="mem-stat">Zeit <b data-time>0:00</b></span>
      <span class="mem-stat">Fehler <b data-mistakes>0</b></span>
      <span class="mem-stat">Gefunden <b data-found>0</b>/<span data-total>0</span></span>
      <button class="btn btn-ghost mem-reset" type="button">Nochmal</button>
    </div>
    <div class="mem-board" data-board></div>
    ${gameOverlayHTML()}`;

  const board = root.querySelector("[data-board]");
  const timeEl = root.querySelector("[data-time]");
  const mistakesEl = root.querySelector("[data-mistakes]");
  const foundEl = root.querySelector("[data-found]");
  const totalEl = root.querySelector("[data-total]");
  if (options.columns) board.style.setProperty("--mem-cols", options.columns);

  function startTimer() {
    if (started) return;
    started = true;
    timerId = setInterval(() => { seconds++; timeEl.textContent = fmtTime(seconds); }, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  function makeDeck() {
    const cards = activePairs.flatMap(([front, back], i) => {
      const id = "p" + i;
      return [
        { id, text: front, role: "term" },
        { id, text: back,  role: "def" },
      ];
    });
    return shuffle(cards);
  }

  function render() {
    board.innerHTML = "";
    makeDeck().forEach(c => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "mem-card " + (c.role === "term" ? "mem-term" : "mem-def");
      card.dataset.id = c.id;
      card.innerHTML = `
        <span class="mem-card-inner">
          <span class="mem-face mem-back">?</span>
          <span class="mem-face mem-front">${c.text}</span>
        </span>`;
      card.addEventListener("click", () => onClick(card));
      board.appendChild(card);
    });
  }

  function onClick(card) {
    if (lock) return;
    if (card.classList.contains("revealed") || card.classList.contains("matched")) return;
    startTimer();
    card.classList.add("revealed");
    if (!first) { first = card; return; }
    second = card; lock = true;
    if (first.dataset.id === second.dataset.id) {
      setTimeout(() => {
        first.classList.add("matched");
        second.classList.add("matched");
        matched++; foundEl.textContent = matched;
        resetTurn();
        if (matched === pairCount) finish();
      }, 450);
    } else {
      mistakes++; mistakesEl.textContent = mistakes;
      setTimeout(() => {
        first.classList.remove("revealed");
        second.classList.remove("revealed");
        resetTurn();
      }, 900);
    }
  }
  function resetTurn() { first = null; second = null; lock = false; }

  function starsFor(m) {
    if (m <= starThresholds.three) return 3;
    if (m <= starThresholds.two) return 2;
    return 1;
  }
  function finish() {
    stopTimer();
    const stars = starsFor(mistakes);
    showGameOverlay(root, stars,
      stars === 3 ? messages.three : stars === 2 ? messages.two : messages.one,
      `Zeit: ${fmtTime(seconds)} · Fehler: ${mistakes}`);
  }

  function restart() {
    stopTimer();
    first = second = null; lock = false;
    mistakes = 0; matched = 0; seconds = 0; started = false;
    timeEl.textContent = "0:00"; mistakesEl.textContent = "0"; foundEl.textContent = "0";
    root.querySelector("[data-overlay]").hidden = true;
    render();
  }

  function loadSet(i) {
    currentSet = i;
    activePairs = sets[i];
    pairCount = activePairs.length;
    starThresholds = options.starThresholds || {
      three: Math.floor(pairCount * 0.4),
      two:   Math.floor(pairCount * 0.9),
    };
    totalEl.textContent = pairCount;
    updateSetLabel(root, i);
    restart();
  }

  root.querySelector(".mem-reset").addEventListener("click", restart);
  root.querySelector("[data-again]").addEventListener("click", restart);
  wireSetBar(root, sets.length, loadSet, () => currentSet);
  loadSet(0);
}

/* ============================================================
   quizGame(selector, options)
   options = {
     questions: [ { q, options:[...], answer:<index>, explain? } ]  // single set
     // OR  sets: [ [ ...questions ], ... ]
     shuffle?: true, messages?: { three, two, one }
   }
   ============================================================ */
function quizGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("quizGame: no element for", selector); return; }
  const sets = options.sets ? options.sets : [options.questions || []];
  const messages = options.messages || {
    three: "Ausgezeichnet! Fast alles richtig.",
    two:   "Gut gemacht!",
    one:   "Weiter üben!",
  };

  let currentSet = 0, questions = [], idx = 0, score = 0, answered = false;

  root.classList.add("quiz");
  root.innerHTML = `
    ${setBarHTML(sets.length)}
    <div class="quiz-bar">
      <span>Frage <b data-q>1</b> / <span data-total>0</span></span>
      <span>Punkte <b data-score>0</b></span>
    </div>
    <div class="card">
      <h2 data-question></h2>
      <div data-options></div>
      <div class="hint" data-explain hidden></div>
      <button class="btn btn-primary" data-next hidden>Weiter →</button>
    </div>
    ${gameOverlayHTML()}`;

  const qEl = root.querySelector("[data-question]");
  const optsEl = root.querySelector("[data-options]");
  const explainEl = root.querySelector("[data-explain]");
  const nextBtn = root.querySelector("[data-next]");
  const qNum = root.querySelector("[data-q]");
  const totalEl = root.querySelector("[data-total]");
  const scoreEl = root.querySelector("[data-score]");

  function render() {
    const item = questions[idx];
    answered = false;
    qNum.textContent = idx + 1;
    qEl.textContent = item.q;
    explainEl.hidden = true;
    nextBtn.hidden = true;
    optsEl.innerHTML = "";
    item.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "option";
      b.textContent = opt;
      b.addEventListener("click", () => choose(b, i, item));
      optsEl.appendChild(b);
    });
  }
  function choose(btn, i, item) {
    if (answered) return;
    answered = true;
    if (i === item.answer) { btn.classList.add("correct"); score++; scoreEl.textContent = score; }
    else { btn.classList.add("wrong"); optsEl.children[item.answer].classList.add("correct"); }
    [...optsEl.children].forEach(c => (c.disabled = true));
    if (item.explain) { explainEl.textContent = item.explain; explainEl.hidden = false; }
    nextBtn.hidden = false;
  }
  nextBtn.addEventListener("click", () => {
    if (idx < questions.length - 1) { idx++; render(); }
    else {
      const stars = starsByRatio(score, questions.length);
      showGameOverlay(root, stars,
        stars === 3 ? messages.three : stars === 2 ? messages.two : messages.one,
        `Richtig: ${score} / ${questions.length}`);
    }
  });

  function loadSet(i) {
    currentSet = i;
    questions = options.shuffle === false ? sets[i].slice() : shuffle(sets[i]);
    idx = 0; score = 0; scoreEl.textContent = "0";
    totalEl.textContent = questions.length;
    updateSetLabel(root, i);
    root.querySelector("[data-overlay]").hidden = true;
    render();
  }
  root.querySelector("[data-again]").addEventListener("click", () => loadSet(currentSet));
  wireSetBar(root, sets.length, loadSet, () => currentSet);
  loadSet(0);
}

/* ============================================================
   sortGame(selector, options)
   options = {
     buckets: [ { label }, ... ],
     items: [ { text, bucket:<index>, explain? } ]   // single set
     // OR sets: [ [ ...items ], ... ]
     shuffle?: true, messages?: { three, two, one }
   }
   ============================================================ */
function sortGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("sortGame: no element for", selector); return; }
  const buckets = options.buckets;
  const sets = options.sets ? options.sets : [options.items || []];
  const messages = options.messages || {
    three: "Perfekt sortiert!",
    two:   "Gut gemacht!",
    one:   "Weiter üben!",
  };

  let currentSet = 0, items = [], idx = 0, score = 0, answered = false;

  root.classList.add("sort");
  root.innerHTML = `
    ${setBarHTML(sets.length)}
    <div class="quiz-bar">
      <span><b data-q>1</b> / <span data-total>0</span></span>
      <span>✅ <b data-score>0</b></span>
    </div>
    <div class="card">
      <div class="sort-item" data-item></div>
      <div class="sort-buckets" data-buckets></div>
      <div class="hint" data-feedback hidden></div>
      <button class="btn btn-primary" data-next hidden>Weiter →</button>
    </div>
    ${gameOverlayHTML()}`;

  const itemEl = root.querySelector("[data-item]");
  const bucketsEl = root.querySelector("[data-buckets]");
  const feedbackEl = root.querySelector("[data-feedback]");
  const nextBtn = root.querySelector("[data-next]");
  const qNum = root.querySelector("[data-q]");
  const totalEl = root.querySelector("[data-total]");
  const scoreEl = root.querySelector("[data-score]");

  function render() {
    const item = items[idx];
    answered = false;
    qNum.textContent = idx + 1;
    itemEl.textContent = item.text;
    feedbackEl.hidden = true;
    nextBtn.hidden = true;
    bucketsEl.innerHTML = "";
    buckets.forEach((b, i) => {
      const btn = document.createElement("button");
      btn.className = "option sort-bucket";
      btn.textContent = b.label;
      btn.addEventListener("click", () => choose(btn, i, item));
      bucketsEl.appendChild(btn);
    });
  }
  function choose(btn, i, item) {
    if (answered) return;
    answered = true;
    if (i === item.bucket) { btn.classList.add("correct"); score++; scoreEl.textContent = score; }
    else { btn.classList.add("wrong"); bucketsEl.children[item.bucket].classList.add("correct"); }
    [...bucketsEl.children].forEach(c => (c.disabled = true));
    if (item.explain) { feedbackEl.textContent = item.explain; feedbackEl.hidden = false; }
    nextBtn.hidden = false;
  }
  nextBtn.addEventListener("click", () => {
    if (idx < items.length - 1) { idx++; render(); }
    else {
      const stars = starsByRatio(score, items.length);
      showGameOverlay(root, stars,
        stars === 3 ? messages.three : stars === 2 ? messages.two : messages.one,
        `Richtig: ${score} / ${items.length}`);
    }
  });

  function loadSet(i) {
    currentSet = i;
    items = options.shuffle === false ? sets[i].slice() : shuffle(sets[i]);
    idx = 0; score = 0; scoreEl.textContent = "0";
    totalEl.textContent = items.length;
    updateSetLabel(root, i);
    root.querySelector("[data-overlay]").hidden = true;
    render();
  }
  root.querySelector("[data-again]").addEventListener("click", () => loadSet(currentSet));
  wireSetBar(root, sets.length, loadSet, () => currentSet);
  loadSet(0);
}

/* ============================================================
   flashcardGame(selector, options)
   options = {
     cards: [ { front, back }, ... ]     // single set
     // OR sets: [ [ ...cards ], ... ]
     shuffle?: true
   }
   ============================================================ */
function flashcardGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("flashcardGame: no element for", selector); return; }
  const sets = options.sets ? options.sets : [options.cards || []];

  let currentSet = 0, cards = [], idx = 0;

  root.classList.add("flash");
  root.innerHTML = `
    ${setBarHTML(sets.length)}
    <div class="flash-card" data-card>
      <div class="flash-inner">
        <div class="flash-face flash-front" data-front></div>
        <div class="flash-face flash-back" data-back></div>
      </div>
    </div>
    <p class="flash-hint">Klicke die Karte zum Umdrehen</p>
    <div class="flash-controls">
      <button class="btn btn-ghost" data-prev>← Zurück</button>
      <span class="flash-progress"><b data-i>1</b> / <span data-total>0</span></span>
      <button class="btn btn-ghost" data-next>Weiter →</button>
    </div>
    <div class="flash-tools">
      <button class="btn btn-ghost" data-shuffle>Mischen</button>
    </div>`;

  const cardEl = root.querySelector("[data-card]");
  const frontEl = root.querySelector("[data-front]");
  const backEl = root.querySelector("[data-back]");
  const iEl = root.querySelector("[data-i]");
  const totalEl = root.querySelector("[data-total]");

  function render() {
    cardEl.classList.remove("flipped");
    frontEl.textContent = cards[idx].front;
    backEl.textContent = cards[idx].back;
    iEl.textContent = idx + 1;
  }
  function go(delta) { idx = (idx + delta + cards.length) % cards.length; render(); }

  cardEl.addEventListener("click", () => cardEl.classList.toggle("flipped"));
  root.querySelector("[data-prev]").addEventListener("click", () => go(-1));
  root.querySelector("[data-next]").addEventListener("click", () => go(1));
  root.querySelector("[data-shuffle]").addEventListener("click", () => { cards = shuffle(cards); idx = 0; render(); });

  function loadSet(i) {
    currentSet = i;
    cards = options.shuffle === false ? sets[i].slice() : shuffle(sets[i]);
    idx = 0;
    totalEl.textContent = cards.length;
    updateSetLabel(root, i);
    render();
  }
  wireSetBar(root, sets.length, loadSet, () => currentSet);
  loadSet(0);
}

/* ============================================================
   dragDropGame(selector, options)
   A word bank of draggable chips + sentences with gaps.
   Drag the correct word into each gap, then press "Prüfen".
   Works with mouse AND touch (phones/tablets).
   options = {
     words: [ "mich", "dich", ... ],            // shared chip bank
     items: [ { sentence, answer, explain? } ]  // single set
     // OR sets: [ [ ...items ], ... ]
     // Mark the gap in each sentence with ____ (four underscores)
     shuffle?: true,         // shuffle sentence order + chip order (default true)
     messages?: { three, two, one }
   }
   ============================================================ */
function dragDropGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("dragDropGame: no element for", selector); return; }
  const words = options.words || [];
  const sets = options.sets ? options.sets : [options.items || []];
  const messages = options.messages || {
    three: "Perfekt! Alles richtig.",
    two:   "Gut gemacht!",
    one:   "Weiter üben!",
  };
  const shuffleMaybe = arr => (options.shuffle === false ? arr.slice() : shuffle(arr));

  let currentSet = 0, items = [], filled = [], checked = false;
  let seconds = 0, timerId = null, started = false;
  let dragWord = null;

  root.classList.add("dd");
  root.innerHTML = `
    ${setBarHTML(sets.length)}
    <div class="dd-stats">
      <span class="mem-stat">Zeit <b data-time>0:00</b></span>
      <span class="mem-stat">Gefüllt <b data-solved>0</b>/<span data-total>0</span></span>
      <button class="btn btn-ghost mem-reset" type="button" data-reset>Nochmal</button>
    </div>
    <div class="dd-bank" data-bank></div>
    <p class="dd-hint">Zieh das richtige Wort in die Lücke. Tippe eine gefüllte Lücke an, um sie zu leeren.</p>
    <div class="dd-sentences" data-sentences></div>
    <div class="dd-actions">
      <button class="btn btn-primary" data-check>Prüfen</button>
    </div>
    ${gameOverlayHTML()}`;

  const bank = root.querySelector("[data-bank]");
  const sentencesEl = root.querySelector("[data-sentences]");
  const timeEl = root.querySelector("[data-time]");
  const solvedEl = root.querySelector("[data-solved]");
  const totalEl = root.querySelector("[data-total]");
  const checkBtn = root.querySelector("[data-check]");

  // floating ghost element for touch dragging
  const ghost = document.createElement("div");
  ghost.className = "dd-ghost";
  ghost.hidden = true;
  document.body.appendChild(ghost);

  function startTimer() {
    if (started) return;
    started = true;
    timerId = setInterval(() => { seconds++; timeEl.textContent = fmtTime(seconds); }, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  function updateSolved() {
    solvedEl.textContent = filled.filter(w => w).length;
  }

  function renderBank() {
    bank.innerHTML = "";
    shuffleMaybe(words).forEach(w => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "dd-chip";
      chip.textContent = w;
      chip.dataset.word = w;
      chip.draggable = true;
      chip.addEventListener("dragstart", e => {
        if (checked) { e.preventDefault(); return; }
        dragWord = w;
        chip.classList.add("dragging");
        e.dataTransfer.effectAllowed = "copy";
      });
      chip.addEventListener("dragend", () => { dragWord = null; chip.classList.remove("dragging"); });
      chip.addEventListener("touchstart", e => {
        if (checked) return;
        dragWord = w;
        chip.classList.add("dragging");
        showGhost(w, e.touches[0]);
        e.preventDefault();
      }, { passive: false });
      bank.appendChild(chip);
    });
  }

  function renderSentences() {
    sentencesEl.innerHTML = "";
    items.forEach((item, i) => {
      const wrap = document.createElement("div");
      wrap.className = "dd-item";

      const row = document.createElement("div");
      row.className = "dd-row";
      const parts = item.sentence.split("____");
      const before = document.createElement("span");
      before.textContent = parts[0];
      const gap = document.createElement("span");
      gap.className = "dd-gap";
      gap.dataset.gap = i;
      const after = document.createElement("span");
      after.textContent = parts.slice(1).join("____");
      row.append(before, gap, after);

      const expl = document.createElement("div");
      expl.className = "dd-expl hint";
      expl.dataset.expl = i;
      expl.hidden = true;

      wrap.append(row, expl);
      sentencesEl.appendChild(wrap);

      setGapText(gap, i);
      wireGap(gap, i);
    });
  }

  function setGapText(gap, i) {
    if (filled[i]) { gap.textContent = filled[i]; gap.classList.add("filled"); }
    else { gap.textContent = ""; gap.classList.remove("filled"); }
  }

  function wireGap(gap, i) {
    gap.addEventListener("dragover", e => { if (!checked) { e.preventDefault(); gap.classList.add("over"); } });
    gap.addEventListener("dragleave", () => gap.classList.remove("over"));
    gap.addEventListener("drop", e => {
      e.preventDefault(); gap.classList.remove("over");
      if (!checked && dragWord) dropInto(i, dragWord);
    });
    gap.addEventListener("click", () => {
      if (checked || !filled[i]) return;
      filled[i] = null; setGapText(gap, i); updateSolved();
    });
  }

  function dropInto(i, word) {
    startTimer();
    filled[i] = word;
    setGapText(sentencesEl.querySelector(`[data-gap="${i}"]`), i);
    updateSolved();
  }

  // ---- touch drag helpers ----
  function showGhost(w, t) { ghost.textContent = w; ghost.hidden = false; moveGhost(t); }
  function moveGhost(t) {
    ghost.style.left = (t.clientX - ghost.offsetWidth / 2) + "px";
    ghost.style.top = (t.clientY - ghost.offsetHeight - 14) + "px";
  }
  function gapUnder(t) {
    const el = document.elementFromPoint(t.clientX, t.clientY);
    return el && el.closest ? el.closest(".dd-gap") : null;
  }
  function onTouchMove(e) {
    if (!dragWord) return;
    const t = e.touches[0];
    moveGhost(t);
    sentencesEl.querySelectorAll(".dd-gap").forEach(g => g.classList.remove("over"));
    const gap = gapUnder(t);
    if (gap && !checked) gap.classList.add("over");
    e.preventDefault();
  }
  function onTouchEnd(e) {
    if (!dragWord) return;
    ghost.hidden = true;
    bank.querySelectorAll(".dd-chip").forEach(c => c.classList.remove("dragging"));
    const gap = gapUnder(e.changedTouches[0]);
    if (gap && !checked) dropInto(parseInt(gap.dataset.gap, 10), dragWord);
    sentencesEl.querySelectorAll(".dd-gap").forEach(g => g.classList.remove("over"));
    dragWord = null;
  }
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd);

  function check() {
    stopTimer();
    checked = true;
    let correct = 0;
    items.forEach((item, i) => {
      const gap = sentencesEl.querySelector(`[data-gap="${i}"]`);
      const expl = sentencesEl.querySelector(`[data-expl="${i}"]`);
      const ok = filled[i] === item.answer;
      if (ok) { correct++; gap.classList.add("correct"); }
      else {
        gap.classList.add("wrong");
        gap.textContent = filled[i] || "—";
        expl.innerHTML = `Richtig: <b>${item.answer}</b>` + (item.explain ? " — " + item.explain : "");
        expl.hidden = false;
      }
    });
    checkBtn.disabled = true;
    const stars = starsByRatio(correct, items.length);
    showGameOverlay(root, stars,
      stars === 3 ? messages.three : stars === 2 ? messages.two : messages.one,
      `Richtig: ${correct} / ${items.length} · Fehler: ${items.length - correct}`);
  }

  function reset() {
    stopTimer();
    seconds = 0; started = false; checked = false;
    timeEl.textContent = "0:00";
    filled = items.map(() => null);
    checkBtn.disabled = false;
    root.querySelector("[data-overlay]").hidden = true;
    renderBank();
    renderSentences();
    updateSolved();
  }

  function loadSet(i) {
    currentSet = i;
    items = shuffleMaybe(sets[i]);
    totalEl.textContent = items.length;
    updateSetLabel(root, i);
    reset();
  }

  checkBtn.addEventListener("click", check);
  root.querySelector("[data-reset]").addEventListener("click", reset);
  root.querySelector("[data-again]").addEventListener("click", reset);
  wireSetBar(root, sets.length, loadSet, () => currentSet);
  loadSet(0);
}
