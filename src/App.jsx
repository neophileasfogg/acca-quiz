import React, { useEffect, useMemo, useRef, useState } from "react";
import QUESTIONS from './data/banque_qcm_fusion_300_precis.json';

/**
 * ACC-A - Entraînement QCM (UI/UX améliorée + barre de filtres horizontale + sources)
 *
 * Nouveautés
 * - Barre de filtres horizontale en haut (Chapitre, Niveau, Mode, Minuterie, Tirage, Nb questions)
 * - Trois vues claires : Accueil, Quiz, Résultats
 * - Navigation de questions (numéros) à droite en Quiz
 * - Feedback immédiat (mode Entraînement) + affichage des SOURCES de la réponse correcte
 * - Export CSV inclut désormais une colonne "sources" (séparées par " || ")
 * - Import JSON accepte un champ optionnel "sources" (array de strings)
 *
 * Données : QCM uniquement, filtrables par Chapitre + Niveau
 */

// ---------- Types ----------
/**
 * @typedef {Object} McqQuestion
 * @property {string} id
 * @property {"mcq"} type
 * @property {string} chapitre
 * @property {"débutant"|"intermédiaire"|"avancé"} niveau
 * @property {string} question
 * @property {string[]} choices
 * @property {number} answerIndex
 * @property {string} [explanation]
 * @property {string[]} [sources]  // ex: ["Miltenberger — chap. Renforcement, p. 123", "BACB TL5 — B-03"]
 */

// ---------- Banque par défaut (extraits) ----------
const DEFAULT_BANK = /** @type {McqQuestion[]} */ ([
  {
    id: "q_renf_1",
    type: "mcq",
    chapitre: "Renforcement",
    niveau: "débutant",
    question: "Lequel illustre un renforcement positif ?",
    choices: [
      "Retirer une corvée après un bon comportement",
      "Donner une friandise après une réponse correcte",
      "Ignorer un comportement pour qu'il diminue",
      "Ajouter une punition après un comportement"
    ],
    answerIndex: 1,
    explanation: "Renforcement positif = ajout d'un stimulus agréable contingent au comportement.",
    sources: ["Miltenberger — Renforcement (principes)"]
  },
  {
    id: "q_ext_1",
    type: "mcq",
    chapitre: "Extinction",
    niveau: "intermédiaire",
    question: "Quel phénomène est typique au début d'une procédure d'extinction ?",
    choices: ["Diminution immédiate stable", "Extinction burst", "Généralisation immédiate", "Disparition définitive"],
    answerIndex: 1,
    explanation: "Augmentation transitoire de la fréquence ou intensité au début de l'extinction.",
    sources: ["Miltenberger — Extinction (phénomènes associés)"]
  },
  {
    id: "q_prog_1",
    type: "mcq",
    chapitre: "Programmes de renforcement",
    niveau: "avancé",
    question: "Quel programme est le plus résistant à l'extinction ?",
    choices: ["CRF", "FR", "VR", "FI"],
    answerIndex: 2,
    explanation: "Les programmes VR sont les plus résistants à l'extinction.",
    sources: ["Miltenberger — Programmes de renforcement"]
  },
  {
    id: "q_mes_1",
    type: "mcq",
    chapitre: "Mesure",
    niveau: "débutant",
    question: "Laquelle est une dimension temporelle du comportement ?",
    choices: ["Fréquence", "Durée", "Topographie", "Intensité"],
    answerIndex: 1,
    explanation: "La durée mesure le temps pendant lequel le comportement se produit.",
    sources: ["Miltenberger — Mesure et enregistrement"]
  },
]);

// ---------- Utils ----------
const ls = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function cls(...parts) { return parts.filter(Boolean).join(" "); }

function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function download(filename, text) {
  const a = document.createElement("a");
  a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(text);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- App ----------
export default function App() {
  // Données
  const [bank, setBank] = useState(() => QUESTIONS);

  // Préférences
  const [mode, setMode] = useState(() => ls.get("acca_mode", "entrainement")); // entrainement | examen
  const [randomize, setRandomize] = useState(() => ls.get("acca_rand", true));
  const [timerOn, setTimerOn] = useState(() => ls.get("acca_timer_on", false));
  const [timerMin, setTimerMin] = useState(() => ls.get("acca_timer_min", 20));
  const [chapitre, setChapitre] = useState(() => ls.get("acca_chap", ""));
  const [niveau, setNiveau] = useState(() => ls.get("acca_niv", ""));
  const [count, setCount] = useState(() => ls.get("acca_count", 10));

  // Vues
  const [view, setView] = useState("home"); // home | quiz | results

  // Session
  const [quiz, setQuiz] = useState([]); // liste filtrée
  const [order, setOrder] = useState([]); // indices dans quiz
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // id -> index choisi
  const [startedAt, setStartedAt] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  // Dérivés
  const chapitres = useMemo(() => Array.from(new Set(bank.map(q => q.chapitre))).sort(), [bank]);
  const niveaux = ["débutant", "intermédiaire", "avancé"];

  const filtered = useMemo(() => bank.filter(q => (
    (!chapitre || q.chapitre === chapitre) && (!niveau || q.niveau === niveau)
  )), [bank, chapitre, niveau]);

  // Persist
  useEffect(() => { ls.set("acca_bank", bank); }, [bank]);
  useEffect(() => { ls.set("acca_mode", mode); }, [mode]);
  useEffect(() => { ls.set("acca_rand", randomize); }, [randomize]);
  useEffect(() => { ls.set("acca_timer_on", timerOn); }, [timerOn]);
  useEffect(() => { ls.set("acca_timer_min", timerMin); }, [timerMin]);
  useEffect(() => { ls.set("acca_chap", chapitre); }, [chapitre]);
  useEffect(() => { ls.set("acca_niv", niveau); }, [niveau]);
  useEffect(() => { ls.set("acca_count", count); }, [count]);

  // Minuterie
  useEffect(() => {
    if (view !== "quiz" || !timerOn) return;
    const total = timerMin * 60;
    if (!startedAt) setStartedAt(Date.now());
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (startedAt || Date.now())) / 1000);
      const left = Math.max(0, total - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(id);
        finish();
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, timerOn, timerMin, startedAt]);

  // Raccourcis clavier
  useEffect(() => {
    function onKey(e) {
      if (view !== "quiz") return;
      if (e.key >= "1" && e.key <= "6") {
        const n = Number(e.key) - 1;
        const q = quiz[order[idx]];
        if (!q) return;
        if (q.choices[n] != null) record(q, n);
      }
      if (e.key === "n" || e.key === "N") next();
      if (e.key === "p" || e.key === "P") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, quiz, order, idx]);

  // Actions
  function start() {
    if (!filtered.length) { alert("Aucune question ne correspond aux filtres."); return; }
    const list = randomize ? shuffle(filtered) : [...filtered];
    const slice = list.slice(0, Math.min(count, list.length));
    setQuiz(slice);
    setOrder(slice.map((_, i) => i));
    setAnswers({});
    setIdx(0);
    setStartedAt(Date.now());
    setTimeLeft(timerOn ? timerMin * 60 : 0);
    setView("quiz");
  }

  function finish() {
    const unanswered = quiz.filter(q => answers[q.id] == null).length;
    if (unanswered > 0 && view === "quiz") {
      const ok = confirm(`${unanswered} question(s) sans réponse. Voulez-vous terminer quand même ?`);
      if (!ok) return;
    }
    setView("results");
  }

  function record(q, choiceIdx) { setAnswers(a => ({ ...a, [q.id]: choiceIdx })); }
  function next() { if (idx + 1 < order.length) setIdx(idx + 1); else finish(); }
  function prev() { if (idx > 0) setIdx(idx - 1); }
  function goto(i) { setIdx(i); }

  function restartToHome() {
    setView("home");
    setQuiz([]); setOrder([]); setIdx(0); setAnswers({}); setStartedAt(0); setTimeLeft(0);
  }

  function exportBank() { download("banque_qcm_acca.json", JSON.stringify(bank, null, 2)); }
  function importBankFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("Le JSON doit être un tableau");
        for (const q of data) {
          if (q.type !== "mcq") throw new Error("Toutes les questions doivent être de type 'mcq'");
          if (!Array.isArray(q.choices) || typeof q.answerIndex !== "number") throw new Error("Chaque question doit avoir 'choices' et 'answerIndex'");
          if (q.sources && !Array.isArray(q.sources)) throw new Error("'sources' doit être un tableau de chaînes");
        }
        setBank(data);
        alert("Banque importée avec succès");
      } catch (e) { alert("Erreur d'import: " + e.message); }
    };
    reader.readAsText(file);
  }
  function exportResultsCSV() {
    if (!quiz.length) return;
    const lines = ["id;chapitre;niveau;question;choix;reponse;correct;explication;sources"];
    for (const q of quiz) {
      const ans = answers[q.id];
      const correct = ans === q.answerIndex ? 1 : 0;
      const sources = Array.isArray(q.sources) ? q.sources.join(" || ") : "";
      lines.push([
        q.id,
        '"'+q.chapitre+'"',
        q.niveau,
        '"'+String(q.question).replaceAll('"','""')+'"',
        '"'+q.choices.map(c=>c.replaceAll('"','""')).join(" | ")+'"',
        '"'+(ans != null ? q.choices[ans].replaceAll('"','""') : '')+'"',
        correct,
        '"'+(q.explanation? q.explanation.replaceAll('"','""') : '')+'"',
        '"'+sources.replaceAll('"','""')+'"'
      ].join(";"));
    }
    download("resultats_qcm_acca.csv", lines.join("\n"));
  }

  // Scoring et récap par chapitre
  const score = useMemo(() => {
    if (view !== "results") return null;
    let ok = 0; const byChap = {};
    for (const q of quiz) {
      const good = answers[q.id] === q.answerIndex;
      if (good) ok += 1;
      if (!byChap[q.chapitre]) byChap[q.chapitre] = { ok: 0, total: 0 };
      byChap[q.chapitre].total += 1;
      if (good) byChap[q.chapitre].ok += 1;
    }
    const total = quiz.length;
    const pct = total ? Math.round((ok / total) * 100) : 0;
    return { ok, total, pct, byChap };
  }, [view, quiz, answers]);

  // Composants internes
  function FilterBar() {
    return (
      <div className="filterbar">
        <div className="control">
          <label>Chapitre</label>
          <select value={chapitre} onChange={e=>setChapitre(e.target.value)}>
            <option value="">Tous</option>
            {chapitres.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
  
        <div className="control">
          <label>Niveau</label>
          <select value={niveau} onChange={e=>setNiveau(e.target.value)}>
            <option value="">Tous</option>
            {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
  
        <div className="control">
          <label>Mode</label>
          <select value={mode} onChange={e=>setMode(e.target.value)}>
            <option value="entrainement">Entraînement</option>
            <option value="examen">Examen</option>
          </select>
        </div>
  
        <div className="control small">
          <label>Questions</label>
          <input
            type="number"
            min={1}
            max={bank.length}
            value={count}
            onChange={e=>setCount(Math.max(1, Math.min(bank.length, Number(e.target.value)||1)))}
          />
        </div>
  
        <div className="toggles">
          <label><input type="checkbox" checked={randomize} onChange={e=>setRandomize(e.target.checked)} /> Tirage</label>
          <label><input type="checkbox" checked={timerOn} onChange={e=>setTimerOn(e.target.checked)} /> Minuterie</label>
          {timerOn && (
            <span className="inline">
              <span>Minutes</span>
              <input
                type="number"
                min={1}
                value={timerMin}
                onChange={e=>setTimerMin(Math.max(1, Number(e.target.value)||1))}
              />
            </span>
          )}
        </div>
  
        <button className="primary" onClick={start}>Démarrer</button>
        <span className="muted">Dispo: {filtered.length}</span>
  

      </div>
    );
  }

  function TopBarQuiz() {
    const progress = quiz.length ? Math.round(((idx) / quiz.length) * 100) : 0;
    return (
      <div className="sticky top-0 z-10 mb-3 rounded-2xl border bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Question {Math.min(idx + 1, quiz.length)} / {quiz.length}</div>
          <div className="flex items-center gap-3 text-sm">
            {timerOn && (
              <div className="rounded-xl border px-3 py-1">⏱ {Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,'0')}</div>
            )}
            <div className="rounded-xl border px-3 py-1">Mode: {mode}</div>
          </div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-2 rounded-full bg-gray-400" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }

  function QuestionNavigator() {
    return (
      <aside className="w-full max-w-xs shrink-0 rounded-2xl border p-3 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold">Navigation</h3>
        <div className="grid grid-cols-6 gap-2">
          {order.map((i, n) => {
            const q = quiz[i];
            const a = answers[q.id];
            const status = a == null ? "bg-white" : (a === q.answerIndex ? "bg-green-50" : "bg-yellow-50");
            return (
              <button key={q.id} className={cls("rounded-lg border px-2 py-1 text-xs", status)} onClick={()=>goto(n)}>
                {n+1}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-600">Raccourcis: 1-6 pour répondre, N suivant, P précédent.</p>
      </aside>
    );
  }

  // ---------- Rendu ----------
  if (view === "home") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <FilterBar />
        <div className="rounded-2xl border p-6 shadow-sm">
          <h1 className="mb-2 text-2xl font-bold">ACC-A - Entraînement QCM</h1>
          <p className="mb-4 text-sm text-gray-700">Choisissez vos filtres dans la barre supérieure puis cliquez sur Démarrer. Importez votre banque de questions via le bouton de la barre.</p>
          <ul className="list-disc pl-5 text-sm text-gray-700">
            <li>QCM uniquement, 4 choix minimum</li>
            <li>Mode Entraînement = correction immédiate; Mode Examen = correction à la fin</li>
            <li>Les réponses affichent désormais des <strong>sources</strong> pour justifier la correction</li>
          </ul>
        </div>
      </div>
    );
  }

  if (view === "quiz") {
    const current = quiz[order[idx]];
    const selected = answers[current?.id];
    const showFeedback = mode === "entrainement" && selected != null;

    return (
      <div className="mx-auto max-w-6xl gap-4 p-4 md:flex">
        <div className="flex-1">
          <TopBarQuiz />
          <div className="rounded-2xl border p-4 shadow-sm">
            <div className="mb-2 text-xs text-gray-600">Chapitre: {current.chapitre} · Difficulté: {current.niveau}</div>
            <h2 className="mb-4 text-lg font-semibold">{current.question}</h2>
            <div className="space-y-2">
              {current.choices.map((choiceText, i) => (
                <label key={i} className={cls("flex cursor-pointer items-start gap-2 rounded-xl border p-3", selected === i && "bg-gray-50")}> 
                  <input type="radio" name={current.id} className="mt-1" checked={selected === i} onChange={()=>record(current, i)} />
                  <div className="flex-1">
                    <div className="text-sm">{choiceText}</div>
                    {showFeedback && selected === i && (
                      <div className="mt-1 text-xs text-gray-700">
                        {selected === current.answerIndex ? "Bonne réponse." : "Réponse incorrecte."} {current.explanation}
                        {Array.isArray(current.sources) && current.sources.length > 0 && (
                          <div className="mt-1 text-[11px] text-gray-600">Sources: {current.sources.join("; ")}</div>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="sticky bottom-4 mt-4 flex items-center justify-between gap-2">
            <button className="rounded-xl border px-4 py-2" onClick={prev} disabled={idx === 0}>Précédent</button>
            <div className="flex items-center gap-2">
              <button className="rounded-xl border px-4 py-2" onClick={restartToHome}>Quitter</button>
              <button className="rounded-xl border px-4 py-2" onClick={next}>{idx + 1 < order.length ? "Suivant" : "Terminer"}</button>
            </div>
          </div>
        </div>

        <QuestionNavigator />
      </div>
    );
  }

  if (view === "results") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <FilterBar />
        <div className="rounded-2xl border p-4 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold">Résultats</h2>
          {score && (
            <>
              <div className="text-base">Score global: <strong>{score.pct}%</strong> ({score.ok}/{score.total})</div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                {Object.entries(score.byChap).map(([c,v]) => (
                  <div key={c} className="rounded-xl border p-3 text-sm">
                    <div className="font-medium">{c}</div>
                    <div>{v.ok}/{v.total} correct(s) - {Math.round((v.ok/v.total)*100)}%</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button className="rounded-xl border px-3 py-1" onClick={exportResultsCSV}>Exporter CSV</button>
                <button className="rounded-xl border px-3 py-1" onClick={()=>setView("home")}>Nouvelle session</button>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {quiz.map((q, i) => {
            const ans = answers[q.id];
            const ok = ans === q.answerIndex;
            return (
              <div key={q.id} className="rounded-2xl border p-3">
                <div className="mb-1 text-xs text-gray-600">{q.chapitre} · {q.niveau} · Question {i+1}</div>
                <div className="font-medium">{q.question}</div>
                <div className="text-sm">Votre réponse: <strong>{ans != null ? q.choices[ans] : "—"}</strong> {ok?"✔":"✖"}</div>
                <div className="text-sm">Correction: {q.choices[q.answerIndex]}</div>
                {q.explanation && <div className="text-xs text-gray-700">{q.explanation}</div>}
                {Array.isArray(q.sources) && q.sources.length > 0 && (
                  <div className="text-xs text-gray-600">Sources: {q.sources.join("; ")}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
