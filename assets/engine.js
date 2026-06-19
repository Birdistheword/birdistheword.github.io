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
