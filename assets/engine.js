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
   A word bank of draggable chips + ONE sentence with a gap at a
   time. Drag the correct word into the gap → instant feedback →
   "Weiter" for the next sentence. Mouse AND touch (phones/tablets).
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

  let currentSet = 0, items = [], idx = 0, score = 0, answered = false;
  let dragWord = null;

  root.classList.add("dd");
  root.innerHTML = `
    ${setBarHTML(sets.length)}
    <div class="quiz-bar">
      <span>Satz <b data-q>1</b> / <span data-total>0</span></span>
      <span>Punkte <b data-score>0</b></span>
    </div>
    <div class="dd-bank" data-bank></div>
    <p class="dd-hint">Zieh das richtige Wort in die Lücke.</p>
    <div class="card">
      <div class="dd-row" data-row></div>
      <div class="hint" data-explain hidden></div>
      <button class="btn btn-primary" data-next hidden>Weiter →</button>
    </div>
    ${gameOverlayHTML()}`;

  const bank = root.querySelector("[data-bank]");
  const rowEl = root.querySelector("[data-row]");
  const explainEl = root.querySelector("[data-explain]");
  const nextBtn = root.querySelector("[data-next]");
  const qNum = root.querySelector("[data-q]");
  const totalEl = root.querySelector("[data-total]");
  const scoreEl = root.querySelector("[data-score]");

  // floating ghost element for touch dragging
  const ghost = document.createElement("div");
  ghost.className = "dd-ghost";
  ghost.hidden = true;
  document.body.appendChild(ghost);

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
        if (answered) { e.preventDefault(); return; }
        dragWord = w;
        chip.classList.add("dragging");
        e.dataTransfer.effectAllowed = "copy";
      });
      chip.addEventListener("dragend", () => { dragWord = null; chip.classList.remove("dragging"); });
      chip.addEventListener("touchstart", e => {
        if (answered) return;
        dragWord = w;
        chip.classList.add("dragging");
        showGhost(w, e.touches[0]);
        e.preventDefault();
      }, { passive: false });
      bank.appendChild(chip);
    });
  }

  function render() {
    const item = items[idx];
    answered = false;
    qNum.textContent = idx + 1;
    explainEl.hidden = true;
    nextBtn.hidden = true;

    rowEl.innerHTML = "";
    const parts = item.sentence.split("____");
    const before = document.createElement("span");
    before.textContent = parts[0];
    const gap = document.createElement("span");
    gap.className = "dd-gap";
    gap.dataset.gap = "1";
    const after = document.createElement("span");
    after.textContent = parts.slice(1).join("____");
    rowEl.append(before, gap, after);
    wireGap(gap);
  }

  function wireGap(gap) {
    gap.addEventListener("dragover", e => { if (!answered) { e.preventDefault(); gap.classList.add("over"); } });
    gap.addEventListener("dragleave", () => gap.classList.remove("over"));
    gap.addEventListener("drop", e => {
      e.preventDefault(); gap.classList.remove("over");
      if (!answered && dragWord) evaluate(gap, dragWord);
    });
  }

  function evaluate(gap, word) {
    answered = true;
    const item = items[idx];
    gap.textContent = word;
    gap.classList.add("filled");
    const ok = word === item.answer;
    if (ok) {
      gap.classList.add("correct");
      score++; scoreEl.textContent = score;
      if (item.explain) { explainEl.textContent = "Richtig. " + item.explain; explainEl.hidden = false; }
    } else {
      gap.classList.add("wrong");
      explainEl.innerHTML = `Richtig ist: <b>${item.answer}</b>` + (item.explain ? " — " + item.explain : "");
      explainEl.hidden = false;
    }
    nextBtn.hidden = false;
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
    const gap = gapUnder(t);
    rowEl.querySelectorAll(".dd-gap").forEach(g => g.classList.remove("over"));
    if (gap && !answered) gap.classList.add("over");
    e.preventDefault();
  }
  function onTouchEnd(e) {
    if (!dragWord) return;
    ghost.hidden = true;
    bank.querySelectorAll(".dd-chip").forEach(c => c.classList.remove("dragging"));
    const gap = gapUnder(e.changedTouches[0]);
    if (gap && !answered) evaluate(gap, dragWord);
    rowEl.querySelectorAll(".dd-gap").forEach(g => g.classList.remove("over"));
    dragWord = null;
  }
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd);

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
    items = shuffleMaybe(sets[i]);
    idx = 0; score = 0; scoreEl.textContent = "0";
    answered = false;
    totalEl.textContent = items.length;
    updateSetLabel(root, i);
    root.querySelector("[data-overlay]").hidden = true;
    renderBank();
    render();
  }

  root.querySelector("[data-again]").addEventListener("click", () => loadSet(currentSet));
  wireSetBar(root, sets.length, loadSet, () => currentSet);
  loadSet(0);
}

/* ============================================================
   fillGame(selector, options)
   Type-in-the-blank. One sentence at a time, ONE OR MORE gaps
   (mark each gap with ____ ). A reference word bank can be shown
   on top. "Prüfen" checks every blank, reveals the correct form
   for any miss, then "Weiter →". Compare is trimmed + case-insensitive.
   options = {
     bank?: [ "backen", ... ],   // STATIC reference chips (shown for every set)
     bankLabel?: "Verben im Infinitiv",
     bankGap?: <index>,          // DYNAMIC bank: per set, built from each item's
                                 //   `bankWord`. The chip for an item turns green
                                 //   ("used") on "Weiter" once gap[bankGap] is correct.
     items: [ { sentence, answers:[ ...one per gap... ], bankWord?, explain? } ]  // single set
     // OR sets: [ [ ...items ], ... ]
     shuffle?: true,             // shuffle sentence order (default true)
     messages?: { three, two, one }
   }
   ============================================================ */
function fillGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("fillGame: no element for", selector); return; }
  const sets = options.sets ? options.sets : [options.items || []];
  const messages = options.messages || {
    three: "Ausgezeichnet! Fast alles richtig.",
    two:   "Gut gemacht!",
    one:   "Weiter üben!",
  };
  const norm = s => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

  let currentSet = 0, items = [], idx = 0, score = 0, answered = false;

  root.classList.add("fill");
  root.innerHTML = `
    ${setBarHTML(sets.length)}
    <div class="quiz-bar">
      <span>Satz <b data-q>1</b> / <span data-total>0</span></span>
      <span>Punkte <b data-score>0</b></span>
    </div>
    ${(options.bank || options.bankGap != null) ? `
      <div class="fill-bank">
        <span class="fill-bank-label">${options.bankLabel || "Wortbank"}</span>
        <div class="fill-bank-words" data-bank></div>
      </div>` : ""}
    <div class="card">
      <div class="fill-row" data-row></div>
      <div class="hint" data-explain hidden></div>
      <div class="fill-actions">
        <button class="btn btn-primary" data-check>Prüfen</button>
        <button class="btn btn-primary" data-next hidden>Weiter →</button>
      </div>
    </div>
    ${gameOverlayHTML()}`;

  const bankEl = root.querySelector("[data-bank]");
  if (options.bank && bankEl) {
    bankEl.innerHTML = options.bank.map(w => `<span class="fill-word">${w}</span>`).join("");
  }
  const rowEl = root.querySelector("[data-row]");
  const explainEl = root.querySelector("[data-explain]");
  const checkBtn = root.querySelector("[data-check]");
  const nextBtn = root.querySelector("[data-next]");
  const qNum = root.querySelector("[data-q]");
  const totalEl = root.querySelector("[data-total]");
  const scoreEl = root.querySelector("[data-score]");

  function render() {
    const item = items[idx];
    answered = false;
    qNum.textContent = idx + 1;
    explainEl.hidden = true;
    nextBtn.hidden = true;
    checkBtn.hidden = false;
    rowEl.innerHTML = "";
    const parts = item.sentence.split("____");
    parts.forEach((part, i) => {
      rowEl.appendChild(document.createTextNode(part));
      if (i < parts.length - 1) {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "fill-input";
        inp.dataset.gap = i;
        inp.autocomplete = "off";
        inp.autocapitalize = "off";
        inp.spellcheck = false;
        inp.setAttribute("lang", "de");
        inp.addEventListener("keydown", e => { if (e.key === "Enter") check(); });
        rowEl.appendChild(inp);
      }
    });
    const first = rowEl.querySelector(".fill-input");
    if (first) first.focus();
  }

  function check() {
    if (answered) return;
    const item = items[idx];
    const inputs = [...rowEl.querySelectorAll(".fill-input")];
    let allOk = true;
    inputs.forEach((inp, i) => {
      const ok = norm(inp.value) === norm(item.answers[i]);
      inp.disabled = true;
      inp.classList.add(ok ? "correct" : "wrong");
      if (!ok) {
        allOk = false;
        const sol = document.createElement("span");
        sol.className = "fill-sol";
        sol.textContent = item.answers[i];
        inp.after(sol);
      }
    });
    answered = true;
    if (allOk) { score++; scoreEl.textContent = score; }
    explainEl.innerHTML = (allOk ? "Richtig. " : "") + (item.explain || "");
    explainEl.hidden = false;
    checkBtn.hidden = true;
    nextBtn.hidden = false;
  }

  function markUsed() {
    // Mark the sentence's CORRECT verb as used, whether or not the
    // learner typed it right — so the bank shows what has been covered.
    if (options.bankGap == null || !bankEl) return;
    const w = items[idx].bankWord;
    if (!w) return;
    const chip = bankEl.querySelector(`.fill-word[data-word="${CSS.escape(w)}"]`);
    if (chip) chip.classList.add("used");
  }

  checkBtn.addEventListener("click", check);
  nextBtn.addEventListener("click", () => {
    markUsed();
    if (idx < items.length - 1) { idx++; render(); }
    else {
      const stars = starsByRatio(score, items.length);
      showGameOverlay(root, stars,
        stars === 3 ? messages.three : stars === 2 ? messages.two : messages.one,
        `Richtig: ${score} / ${items.length}`);
    }
  });

  function buildBank() {
    if (options.bankGap == null || !bankEl) return;
    const uniq = [];
    items.forEach(it => { if (it.bankWord && !uniq.includes(it.bankWord)) uniq.push(it.bankWord); });
    uniq.sort((a, b) => a.localeCompare(b, "de"));
    bankEl.innerHTML = uniq.map(w => `<span class="fill-word" data-word="${w}">${w}</span>`).join("");
  }

  function loadSet(i) {
    currentSet = i;
    items = options.shuffle === false ? sets[i].slice() : shuffle(sets[i]);
    idx = 0; score = 0; scoreEl.textContent = "0";
    totalEl.textContent = items.length;
    updateSetLabel(root, i);
    buildBank();
    root.querySelector("[data-overlay]").hidden = true;
    render();
  }
  root.querySelector("[data-again]").addEventListener("click", () => loadSet(currentSet));
  wireSetBar(root, sets.length, loadSet, () => currentSet);
  loadSet(0);
}

/* ============================================================
   orderGame(selector, options)
   Tap-to-build word order. A bank of word tiles (shuffled, may
   include WRONG-form distractors). Tap a tile to drop it onto the
   answer line in order; tap a placed tile to send it back. "Prüfen"
   compares the assembled sentence to `answer` (extra unused tiles
   are ignored, so distractors are allowed). Mouse + touch friendly
   (plain clicks, no dragging needed).
   options = {
     items: [ { prompt?, tiles:[ ... ], answer:"…", end?:".", explain? } ]
     // OR sets: [ [ ...items ], ... ]
     // `end` is fixed trailing punctuation shown after the line and
     //  NOT part of the tiles. `answer` is the sentence without it.
     shuffle?: true,            // shuffle item order (default true; tiles always shuffled)
     messages?: { three, two, one }
   }
   ============================================================ */
function orderGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("orderGame: no element for", selector); return; }
  const sets = options.sets ? options.sets : [options.items || []];
  const messages = options.messages || {
    three: "Perfekt gebaut!",
    two:   "Gut gemacht!",
    one:   "Weiter üben!",
  };
  const norm = s => (s || "").trim().replace(/\s+/g, " ");

  let currentSet = 0, items = [], idx = 0, score = 0, answered = false;
  let placed = [], available = [];

  root.classList.add("order");
  root.innerHTML = `
    ${setBarHTML(sets.length)}
    <div class="quiz-bar">
      <span>Aufgabe <b data-q>1</b> / <span data-total>0</span></span>
      <span>Punkte <b data-score>0</b></span>
    </div>
    <div class="card">
      <div class="order-prompt" data-prompt></div>
      <div class="order-line" data-line></div>
      <div class="order-bank" data-bank></div>
      <div class="hint" data-explain hidden></div>
      <div class="order-actions">
        <button class="btn btn-ghost btn-sm" data-clear>Zurücksetzen</button>
        <button class="btn btn-primary" data-check>Prüfen</button>
        <button class="btn btn-primary" data-next hidden>Weiter →</button>
      </div>
    </div>
    ${gameOverlayHTML()}`;

  const promptEl = root.querySelector("[data-prompt]");
  const lineEl = root.querySelector("[data-line]");
  const bankEl = root.querySelector("[data-bank]");
  const explainEl = root.querySelector("[data-explain]");
  const clearBtn = root.querySelector("[data-clear]");
  const checkBtn = root.querySelector("[data-check]");
  const nextBtn = root.querySelector("[data-next]");
  const qNum = root.querySelector("[data-q]");
  const totalEl = root.querySelector("[data-total]");
  const scoreEl = root.querySelector("[data-score]");

  function draw() {
    const item = items[idx];
    lineEl.innerHTML = "";
    if (placed.length === 0) {
      const ph = document.createElement("span");
      ph.className = "order-placeholder";
      ph.textContent = "Tippe die Wörter der Reihe nach an …";
      lineEl.appendChild(ph);
    } else {
      placed.forEach(tile => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "order-tile in-line";
        b.textContent = tile.text;
        if (!answered) b.addEventListener("click", () => unplace(tile));
        lineEl.appendChild(b);
      });
    }
    if (item.end) {
      const e = document.createElement("span");
      e.className = "order-line-end";
      e.textContent = item.end;
      lineEl.appendChild(e);
    }
    bankEl.innerHTML = "";
    available.forEach(tile => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "order-tile";
      b.textContent = tile.text;
      if (!answered) b.addEventListener("click", () => place(tile));
      bankEl.appendChild(b);
    });
  }
  function place(tile)   { available = available.filter(t => t !== tile); placed.push(tile); draw(); }
  function unplace(tile) { placed = placed.filter(t => t !== tile); available.push(tile); draw(); }

  function render() {
    const item = items[idx];
    answered = false;
    qNum.textContent = idx + 1;
    promptEl.innerHTML = item.prompt || "";
    promptEl.hidden = !item.prompt;
    explainEl.hidden = true;
    nextBtn.hidden = true;
    checkBtn.hidden = false;
    clearBtn.hidden = false;
    lineEl.className = "order-line";
    placed = [];
    available = shuffle(item.tiles.map((t, i) => ({ text: t, id: i })));
    draw();
  }

  function check() {
    if (answered || placed.length === 0) return;
    const item = items[idx];
    const ok = norm(placed.map(t => t.text).join(" ")) === norm(item.answer);
    answered = true;
    lineEl.classList.add(ok ? "correct" : "wrong");
    if (ok) {
      score++; scoreEl.textContent = score;
      explainEl.innerHTML = "Richtig. " + (item.explain || "");
    } else {
      explainEl.innerHTML = `Richtig ist: <b>${item.answer}${item.end || ""}</b>`
        + (item.explain ? " — " + item.explain : "");
    }
    explainEl.hidden = false;
    checkBtn.hidden = true;
    clearBtn.hidden = true;
    nextBtn.hidden = false;
    draw();
  }

  clearBtn.addEventListener("click", () => {
    if (answered) return;
    available = available.concat(placed);
    placed = [];
    draw();
  });
  checkBtn.addEventListener("click", check);
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
