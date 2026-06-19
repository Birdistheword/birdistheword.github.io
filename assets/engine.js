/* ============================================================
   Bird is the Word — shared game engine
   Plain global script (no modules) so it works both on
   GitHub Pages and when a file is opened directly (file://).
   Load it before use: <script src="../assets/engine.js"></script>
   then call memoryGame("#game", {...}).

   memoryGame(selector, options)
   ------------------------------
   A flip-card memory (concentration) game.

   options = {
     pairs:  [ ["Vorderseite", "Rückseite"], ... ]   // required
     columns:      number   // optional, default auto by pair count
     starThresholds: { three: n, two: n }  // optional, by mistakes
     messages: { three, two, one }         // optional end texts
   }
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

function memoryGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("memoryGame: no element for", selector); return; }

  const pairs = options.pairs || [];
  const pairCount = pairs.length;

  // Defaults scale with the size of the game.
  const starThresholds = options.starThresholds || {
    three: Math.floor(pairCount * 0.4),
    two:   Math.floor(pairCount * 0.9),
  };
  const messages = options.messages || {
    three: "Perfekt! 🌟 Du bist ein Memory-Profi!",
    two:   "Super gemacht! 👍 Fast perfekt!",
    one:   "Geschafft! 🙂 Übung macht den Meister.",
  };

  // ---- State ----
  let first = null, second = null, lock = false;
  let mistakes = 0, matched = 0;
  let seconds = 0, timerId = null, started = false;

  // ---- Build DOM shell ----
  root.classList.add("mem");
  root.innerHTML = `
    <div class="mem-stats">
      <span class="mem-stat">⏱ <b data-time>0:00</b></span>
      <span class="mem-stat">❌ <b data-mistakes>0</b></span>
      <span class="mem-stat">✅ <b data-found>0</b>/${pairCount}</span>
      <button class="btn btn-ghost mem-reset" type="button">Nochmal</button>
    </div>
    <div class="mem-board" data-board></div>
    <div class="mem-overlay" data-overlay hidden>
      <div class="mem-result">
        <div class="mem-stars" data-stars></div>
        <h2 data-result-title></h2>
        <p data-result-detail></p>
        <button class="btn btn-primary mem-again" type="button">Noch einmal spielen</button>
      </div>
    </div>`;

  const board      = root.querySelector("[data-board]");
  const timeEl     = root.querySelector("[data-time]");
  const mistakesEl = root.querySelector("[data-mistakes]");
  const foundEl    = root.querySelector("[data-found]");
  const overlay    = root.querySelector("[data-overlay]");

  if (options.columns) board.style.setProperty("--mem-cols", options.columns);

  // ---- Timer ----
  function startTimer() {
    if (started) return;
    started = true;
    timerId = setInterval(() => { seconds++; timeEl.textContent = fmtTime(seconds); }, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  // ---- Cards ----
  function makeDeck() {
    const cards = pairs.flatMap(([front, back], i) => {
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
    second = card;
    lock = true;

    if (first.dataset.id === second.dataset.id) {
      // match
      setTimeout(() => {
        first.classList.add("matched");
        second.classList.add("matched");
        matched++;
        foundEl.textContent = matched;
        resetTurn();
        if (matched === pairCount) finish();
      }, 450);
    } else {
      // miss
      mistakes++;
      mistakesEl.textContent = mistakes;
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
    if (m <= starThresholds.two)   return 2;
    return 1;
  }

  function finish() {
    stopTimer();
    const stars = starsFor(mistakes);
    const starEl = root.querySelector("[data-stars]");
    starEl.innerHTML =
      "★".repeat(stars) + "<span class='mem-star-empty'>" + "★".repeat(3 - stars) + "</span>";

    root.querySelector("[data-result-title]").textContent =
      stars === 3 ? messages.three : stars === 2 ? messages.two : messages.one;
    root.querySelector("[data-result-detail]").textContent =
      `Zeit: ${fmtTime(seconds)} · Fehler: ${mistakes}`;
    overlay.hidden = false;
  }

  function restart() {
    stopTimer();
    first = second = null; lock = false;
    mistakes = 0; matched = 0; seconds = 0; started = false;
    timeEl.textContent = "0:00";
    mistakesEl.textContent = "0";
    foundEl.textContent = "0";
    overlay.hidden = true;
    render();
  }

  root.querySelector(".mem-reset").addEventListener("click", restart);
  root.querySelector(".mem-again").addEventListener("click", restart);

  render();
}

/* ============================================================
   Shared result overlay (quiz / sort)
   ============================================================ */
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
   quizGame(selector, options)
   options = {
     questions: [ { q, options:[...], answer:<index>, explain? } ],
     shuffle?: true,   // shuffle question order (default true)
     messages?: { three, two, one }
   }
   ============================================================ */
function quizGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("quizGame: no element for", selector); return; }
  const messages = options.messages || {
    three: "Ausgezeichnet! 🌟 Fast alles richtig!",
    two:   "Gut gemacht! 👍",
    one:   "Weiter üben! 💪",
  };
  const totalQ = options.questions.length;
  let questions = [], idx = 0, score = 0, answered = false;

  root.classList.add("quiz");
  root.innerHTML = `
    <div class="quiz-bar">
      <span>Frage <b data-q>1</b> / ${totalQ}</span>
      <span>✅ <b data-score>0</b></span>
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
    if (i === item.answer) {
      btn.classList.add("correct");
      score++; scoreEl.textContent = score;
    } else {
      btn.classList.add("wrong");
      optsEl.children[item.answer].classList.add("correct");
    }
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

  function start() {
    questions = options.shuffle === false ? options.questions.slice() : shuffle(options.questions);
    idx = 0; score = 0; scoreEl.textContent = "0";
    root.querySelector("[data-overlay]").hidden = true;
    render();
  }
  root.querySelector("[data-again]").addEventListener("click", start);
  start();
}

/* ============================================================
   sortGame(selector, options)  — put each item in the right bucket
   options = {
     buckets: [ { label } , ... ],            // order = index
     items:   [ { text, bucket:<index>, explain? }, ... ],
     shuffle?: true,
     messages?: { three, two, one }
   }
   ============================================================ */
function sortGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("sortGame: no element for", selector); return; }
  const buckets = options.buckets;
  const messages = options.messages || {
    three: "Perfekt sortiert! 🌟",
    two:   "Gut gemacht! 👍",
    one:   "Weiter üben! 💪",
  };
  const totalI = options.items.length;
  let items = [], idx = 0, score = 0, answered = false;

  root.classList.add("sort");
  root.innerHTML = `
    <div class="quiz-bar">
      <span><b data-q>1</b> / ${totalI}</span>
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
    if (i === item.bucket) {
      btn.classList.add("correct");
      score++; scoreEl.textContent = score;
    } else {
      btn.classList.add("wrong");
      bucketsEl.children[item.bucket].classList.add("correct");
    }
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

  function start() {
    items = options.shuffle === false ? options.items.slice() : shuffle(options.items);
    idx = 0; score = 0; scoreEl.textContent = "0";
    root.querySelector("[data-overlay]").hidden = true;
    render();
  }
  root.querySelector("[data-again]").addEventListener("click", start);
  start();
}

/* ============================================================
   flashcardGame(selector, options)  — study cards, flip front/back
   options = {
     cards: [ { front, back }, ... ],
     shuffle?: true
   }
   ============================================================ */
function flashcardGame(selector, options) {
  const root = document.querySelector(selector);
  if (!root) { console.error("flashcardGame: no element for", selector); return; }
  let cards = options.shuffle === false ? options.cards.slice() : shuffle(options.cards);
  let idx = 0;

  root.classList.add("flash");
  root.innerHTML = `
    <div class="flash-card" data-card>
      <div class="flash-inner">
        <div class="flash-face flash-front" data-front></div>
        <div class="flash-face flash-back" data-back></div>
      </div>
    </div>
    <p class="flash-hint">Klicke die Karte zum Umdrehen</p>
    <div class="flash-controls">
      <button class="btn btn-ghost" data-prev>← Zurück</button>
      <span class="flash-progress"><b data-i>1</b> / ${cards.length}</span>
      <button class="btn btn-ghost" data-next>Weiter →</button>
    </div>
    <div class="flash-tools">
      <button class="btn btn-ghost" data-shuffle>🔀 Mischen</button>
    </div>`;

  const cardEl = root.querySelector("[data-card]");
  const frontEl = root.querySelector("[data-front]");
  const backEl = root.querySelector("[data-back]");
  const iEl = root.querySelector("[data-i]");

  function render() {
    cardEl.classList.remove("flipped");
    frontEl.textContent = cards[idx].front;
    backEl.textContent = cards[idx].back;
    iEl.textContent = idx + 1;
  }
  function go(delta) {
    idx = (idx + delta + cards.length) % cards.length;
    render();
  }

  cardEl.addEventListener("click", () => cardEl.classList.toggle("flipped"));
  root.querySelector("[data-prev]").addEventListener("click", () => go(-1));
  root.querySelector("[data-next]").addEventListener("click", () => go(1));
  root.querySelector("[data-shuffle]").addEventListener("click", () => {
    cards = shuffle(cards); idx = 0; render();
  });

  render();
}
