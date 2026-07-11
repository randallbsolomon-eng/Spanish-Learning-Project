// Español a Mano — voice-based Spanish travel practice
// Vanilla JS, no build step. Data lives in data.js (THEMES, SCENARIOS).

const view = document.getElementById("view");
const pageTitle = document.getElementById("pageTitle");
const backBtn = document.getElementById("backBtn");
const toastEl = document.getElementById("toast");

// ---------- tiny router ----------
const navStack = [];
let current = null; // { title, render }

function navigate(title, render, { push = true } = {}) {
  stopAll();
  if (push && current) navStack.push(current);
  current = { title, render };
  pageTitle.textContent = title;
  backBtn.hidden = navStack.length === 0;
  render();
}

backBtn.addEventListener("click", () => {
  const prev = navStack.pop();
  if (!prev) return;
  stopAll();
  current = prev;
  pageTitle.textContent = prev.title;
  backBtn.hidden = navStack.length === 0;
  prev.render();
});

function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.hidden = true), ms);
}

// ---------- text matching ----------
function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,…]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(transcript, accepted) {
  const t = normalize(transcript);
  return accepted.some((a) => t.includes(normalize(a)));
}

function matchesVocab(transcript, esField) {
  const alts = esField.split("/").map((s) => s.trim());
  const t = normalize(transcript);
  return alts.some((alt) => t.includes(normalize(alt)));
}

// ---------- speech synthesis ----------
let spanishVoice = null;
function loadVoices() {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  spanishVoice =
    voices.find((v) => v.lang === "es-ES") ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("es")) ||
    null;
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text, onEnd) {
  if (!("speechSynthesis" in window)) {
    onEnd && onEnd();
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES";
  if (spanishVoice) u.voice = spanishVoice;
  u.rate = 0.92;
  u.onend = () => onEnd && onEnd();
  u.onerror = () => onEnd && onEnd();
  speechSynthesis.speak(u);
}

// ---------- speech recognition ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let listening = false;

function stopAll() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (recognizer) {
    try {
      recognizer.stop();
    } catch (e) {}
  }
  listening = false;
}

function listenOnce(onResult, onError) {
  if (!SR) {
    onError("unsupported");
    return;
  }
  if (recognizer) {
    try {
      recognizer.stop();
    } catch (e) {}
  }
  recognizer = new SR();
  recognizer.lang = "es-ES";
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  let handled = false;
  recognizer.onresult = (e) => {
    handled = true;
    onResult(e.results[0][0].transcript);
  };
  recognizer.onerror = (e) => {
    handled = true;
    onError(e.error);
  };
  recognizer.onend = () => {
    listening = false;
    if (!handled) onError("no-speech");
  };
  listening = true;
  recognizer.start();
}

// ---------- Home ----------
function renderHome() {
  view.innerHTML = `
    <div class="card-grid">
      <button class="card" id="goVocab">
        <span class="emoji">📚</span>
        <span>
          <div class="card-title">Vocabulary</div>
          <div class="card-sub">Listen &amp; repeat by theme</div>
        </span>
      </button>
      <button class="card" id="goScenarios">
        <span class="emoji">💬</span>
        <span>
          <div class="card-title">Conversation Practice</div>
          <div class="card-sub">Two-way voice dialogues</div>
        </span>
      </button>
    </div>
  `;
  document.getElementById("goVocab").onclick = () =>
    navigate("Vocabulary", renderThemeList);
  document.getElementById("goScenarios").onclick = () =>
    navigate("Conversations", renderScenarioList);
}

// ---------- Vocabulary theme list ----------
function renderThemeList() {
  view.innerHTML = `<div class="card-grid">${THEMES.map(
    (t) => `
    <button class="card" data-theme="${t.id}">
      <span class="emoji">🗂️</span>
      <span>
        <div class="card-title">${t.title}</div>
        <div class="card-sub">${t.items.length} phrases</div>
      </span>
    </button>`
  ).join("")}</div>`;

  view.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.onclick = () => {
      const theme = THEMES.find((t) => t.id === btn.dataset.theme);
      navigate(theme.title, () => renderVocabPractice(theme));
    };
  });
}

function renderVocabPractice(theme) {
  let i = 0;
  let attempts = 0;

  function draw() {
    const item = theme.items[i];
    view.innerHTML = `
      <div class="vocab-card">
        <div class="vocab-es">${item.es}</div>
        <div class="vocab-pron">${item.pron}</div>
        <div class="vocab-en" id="enReveal" hidden>${item.en}</div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="showEn">Show English</button>
          <button class="btn btn-secondary" id="listenBtn">🔊 Listen</button>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="speakBtn">🎤 Practice Speaking</button>
        </div>
        <div class="vocab-progress">${i + 1} / ${theme.items.length}</div>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="prevBtn" ${i === 0 ? "disabled" : ""}>&larr; Prev</button>
        <button class="btn btn-primary" id="nextBtn">Next &rarr;</button>
      </div>
    `;

    document.getElementById("showEn").onclick = () => {
      document.getElementById("enReveal").hidden = false;
    };
    document.getElementById("listenBtn").onclick = () => speak(item.es);
    document.getElementById("prevBtn").onclick = () => {
      i = Math.max(0, i - 1);
      draw();
    };
    document.getElementById("nextBtn").onclick = () => {
      i = (i + 1) % theme.items.length;
      draw();
    };
    document.getElementById("speakBtn").onclick = () => {
      const btn = document.getElementById("speakBtn");
      btn.classList.add("listening");
      btn.textContent = "🎤 Listening…";
      listenOnce(
        (transcript) => {
          btn.classList.remove("listening");
          btn.textContent = "🎤 Practice Speaking";
          if (matchesVocab(transcript, item.es)) {
            toast("✅ ¡Correcto! Heard: “" + transcript + "”");
          } else {
            toast("💡 Heard: “" + transcript + "” — try again");
          }
        },
        (err) => {
          btn.classList.remove("listening");
          btn.textContent = "🎤 Practice Speaking";
          if (err === "unsupported") {
            toast("Speech recognition isn't supported in this browser.");
          } else {
            toast("Didn't catch that — try again.");
          }
        }
      );
    };
  }

  draw();
}

// ---------- Conversation scenarios ----------
function renderScenarioList() {
  view.innerHTML = `<div class="card-grid">${SCENARIOS.map(
    (s) => `
    <button class="card" data-scenario="${s.id}">
      <span class="emoji">🗣️</span>
      <span>
        <div class="card-title">${s.title}</div>
        <div class="card-sub">${s.lines.length} lines</div>
      </span>
    </button>`
  ).join("")}</div>`;

  view.querySelectorAll("[data-scenario]").forEach((btn) => {
    btn.onclick = () => {
      const scenario = SCENARIOS.find((s) => s.id === btn.dataset.scenario);
      navigate(scenario.title, () => renderConversation(scenario));
    };
  });
}

function renderConversation(scenario) {
  let idx = 0;
  let attempts = 0;

  view.innerHTML = `<div class="chat" id="chat"></div>`;
  const chat = document.getElementById("chat");

  function appendBubble(speaker, text, en) {
    const div = document.createElement("div");
    div.className = `bubble ${speaker}`;
    div.innerHTML = `<div class="es-text">${text}</div>${
      en ? `<div class="en-text">${en}</div>` : ""
    }`;
    chat.appendChild(div);
    div.scrollIntoView({ behavior: "smooth", block: "end" });
    return div;
  }

  function appendFeedback(kind, text) {
    const div = document.createElement("div");
    div.className = `feedback ${kind}`;
    div.textContent = text;
    chat.appendChild(div);
    div.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  function removeMicBar() {
    const bar = document.getElementById("micBar");
    if (bar) bar.remove();
  }

  function showMicBar(hint) {
    removeMicBar();
    const bar = document.createElement("div");
    bar.id = "micBar";
    bar.className = "mic-bar";
    if (SR) {
      bar.innerHTML = `
        <button class="mic-btn" id="micBtn">🎤</button>
        <div class="mic-hint">${hint}</div>
      `;
    } else {
      bar.innerHTML = `
        <div class="mic-hint">Speech recognition isn't supported here — type your reply instead.</div>
        <div class="btn-row">
          <input id="typeInput" placeholder="Escribe tu respuesta…" style="padding:10px;border-radius:10px;border:1px solid var(--border);flex:1;min-width:0;" />
          <button class="btn btn-primary" id="typeSubmit">Send</button>
        </div>
        <div class="mic-hint">${hint}</div>
      `;
    }
    document.body.appendChild(bar);

    if (SR) {
      document.getElementById("micBtn").onclick = onMicTap;
    } else {
      document.getElementById("typeSubmit").onclick = () => {
        const val = document.getElementById("typeInput").value;
        if (val.trim()) handleUserAttempt(val);
      };
    }
  }

  function onMicTap() {
    const btn = document.getElementById("micBtn");
    if (!btn) return;
    btn.classList.add("listening");
    listenOnce(
      (transcript) => {
        btn && btn.classList.remove("listening");
        handleUserAttempt(transcript);
      },
      (err) => {
        btn && btn.classList.remove("listening");
        toast(err === "unsupported" ? "Mic not supported here." : "Didn't catch that — tap and try again.");
      }
    );
  }

  function handleUserAttempt(transcript) {
    const line = scenario.lines[idx];
    if (matchesAny(transcript, line.accepted)) {
      appendBubble("user", transcript);
      appendFeedback("ok", "✅ ¡Correcto!");
      removeMicBar();
      idx++;
      setTimeout(step, 600);
    } else {
      attempts++;
      if (attempts >= 2) {
        appendBubble("user", transcript);
        appendFeedback(
          "retry",
          `💡 ${line.hint} — moving on.`
        );
        removeMicBar();
        idx++;
        attempts = 0;
        setTimeout(step, 900);
      } else {
        appendFeedback("retry", `💡 Heard "${transcript}". ${line.hint} — try again.`);
      }
    }
  }

  function step() {
    if (idx >= scenario.lines.length) {
      removeMicBar();
      appendFeedback("ok", "🎉 Scenario complete! Nice work.");
      const doneBar = document.createElement("div");
      doneBar.className = "mic-bar";
      doneBar.innerHTML = `<button class="btn btn-primary" id="restartBtn">Practice Again</button>`;
      document.body.appendChild(doneBar);
      document.getElementById("restartBtn").onclick = () => {
        doneBar.remove();
        idx = 0;
        attempts = 0;
        chat.innerHTML = "";
        step();
      };
      return;
    }
    const line = scenario.lines[idx];
    if (line.speaker === "app") {
      removeMicBar();
      appendBubble("app", line.text, line.en);
      speak(line.text, () => {
        idx++;
        setTimeout(step, 500);
      });
    } else {
      appendBubble("user", "Tu turno…", null).classList.add("pending");
      showMicBar(line.hint);
    }
  }

  step();
}

// ---------- boot ----------
navigate("Español a Mano", renderHome, { push: false });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
