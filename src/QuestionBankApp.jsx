import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import {
  Plus, Trash2, Pencil, Printer, Download, Upload, Search, X, ChevronUp,
  ChevronDown, Image as ImageIcon, Copy, Check, FileText, Settings as SettingsIcon,
  BookOpen, ClipboardList, Shuffle, AlertTriangle, Dice5, Eye, Link2,
  Send, ShieldCheck, Clock, RefreshCw, Inbox, ExternalLink
} from "lucide-react";
import { GITHUB_OWNER, GITHUB_REPO, SUBMISSION_LABEL, ADMIN_PASSPHRASE } from "./config";

/* ============================================================
   Question Bank — a teacher's filing cabinet for test questions
   Aesthetic: index cards, manila folder tabs, red marking pen.
   ============================================================ */

const INK = "#22262e";
const INK_SOFT = "#5c6470";
const PAPER = "#fbfaf6";
const CARD = "#fffdf8";
const MANILA = "#ecdcae";
const MANILA_DEEP = "#d9c489";
const RULE_BLUE = "#a8bdd6";
const PEN_RED = "#c2342b";
const CHALK_GREEN = "#3e7c4f";
const LINE = "#e3ded2";

const TYPE_META = {
  mc:      { label: "Multiple choice", short: "MC" },
  numeric: { label: "Numeric response", short: "NR" },
  tf:      { label: "True / False", short: "T/F" },
  matching:{ label: "Matching", short: "MATCH" },
  written: { label: "Written response", short: "WR" },
};
const TYPE_ORDER = ["mc", "numeric", "tf", "matching", "written"];
const DIFFS = ["easy", "medium", "hard"];
const STATUSES = [
  { id: "polished", label: "Polished" },
  { id: "revise",   label: "Needs revision" },
  { id: "retired",  label: "Retired" },
];

const SECTION_TEXT = {
  mc:      "Choose the best answer for each question and record it in the space provided.",
  numeric: "Calculate each answer and record it in the space provided. Show your work where space allows.",
  tf:      "Write T (true) or F (false) in the blank beside each statement.",
  matching:"Match each item on the left with the best choice on the right. Write the letter in the blank. Each choice may be used once.",
  written: "Answer each question in full sentences in the space provided.",
};

const SYMBOLS = ["²","³","°","π","Δ","θ","λ","Ω","μ","±","×","÷","·","≤","≥","≠","≈","→","√","¼","½","¾","α","β"];

/* ---------------- storage helpers ----------------
   Persist to the host's window.storage when present (e.g. the original
   sandbox), otherwise to localStorage so a deployed static site keeps the
   bank between visits. An in-memory map is the last-resort fallback. */
const hasWinStorage = typeof window !== "undefined" && !!window.storage;
const hasLocal = (() => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "__qb_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
})();
const hasStorage = hasWinStorage || hasLocal;
const memStore = new Map();

async function rawGet(key) {
  if (hasWinStorage) {
    try { const r = await window.storage.get(key, false); return r ? r.value : null; }
    catch (e) { return null; }
  }
  if (hasLocal) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  return memStore.has(key) ? memStore.get(key) : null;
}
async function rawSet(key, value) {
  if (hasWinStorage) {
    try { const r = await window.storage.set(key, value, false); return !!r; }
    catch (e) { return false; }
  }
  if (hasLocal) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  memStore.set(key, value); return true;
}
async function rawDel(key) {
  if (hasWinStorage) { try { await window.storage.delete(key, false); return true; } catch (e) { return false; } }
  if (hasLocal) { try { window.localStorage.removeItem(key); return true; } catch (e) { return false; } }
  memStore.delete(key); return true;
}
async function jGet(key) {
  const v = await rawGet(key);
  if (v == null) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}
async function jSet(key, obj) { return rawSet(key, JSON.stringify(obj)); }

/* ---------------- small utils ---------------- */
const uid = (p) => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleSeeded(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const todayISO = () => new Date().toISOString().slice(0, 10);
function niceDate(iso) {
  if (!iso) return "never";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (e) { return iso; }
}
function monthsAgo(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24 * 30.4);
}

/* Render light markup: ^{...} superscript, _{...} subscript, \n line breaks */
function renderRich(text) {
  const parts = String(text || "").split(/(\^\{[^}]*\}|_\{[^}]*\})/g);
  const out = [];
  parts.forEach((p, i) => {
    if (!p) return;
    if (p.startsWith("^{")) { out.push(<sup key={i}>{p.slice(2, -1)}</sup>); return; }
    if (p.startsWith("_{")) { out.push(<sub key={i}>{p.slice(2, -1)}</sub>); return; }
    const lines = p.split("\n");
    lines.forEach((ln, j) => {
      out.push(<React.Fragment key={i + "-" + j}>{ln}</React.Fragment>);
      if (j < lines.length - 1) out.push(<br key={i + "-br-" + j} />);
    });
  });
  return out;
}

// Normalize a table to a rectangular {headers, rows, caption} or null if empty.
function sanitizeTable(t) {
  if (!t || typeof t !== "object") return null;
  let headers = Array.isArray(t.headers) ? t.headers.map(h => String(h ?? "")) : [];
  let rows = Array.isArray(t.rows) ? t.rows.map(r => (Array.isArray(r) ? r.map(c => String(c ?? "")) : [])) : [];
  const cols = Math.max(headers.length, ...rows.map(r => r.length), 0);
  if (cols === 0) return null;
  headers = Array.from({ length: cols }, (_, i) => headers[i] ?? "");
  rows = rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
  const hasContent = headers.some(h => h.trim()) || rows.some(r => r.some(c => c.trim()));
  if (!hasContent) return null;
  return { headers, rows, caption: String(t.caption || "") };
}

// Render a data table. variant "screen" (default) or "print".
function DataTable({ table, variant }) {
  const t = sanitizeTable(table);
  if (!t) return null;
  const headerHasContent = t.headers.some(h => h.trim());
  if (variant === "print") {
    return (
      <div className="ex-tablewrap">
        {t.caption ? <div className="ex-table-cap">{renderRich(t.caption)}</div> : null}
        <table className="ex-table">
          {headerHasContent && (
            <thead><tr>{t.headers.map((h, i) => <th key={i}>{renderRich(h)}</th>)}</tr></thead>
          )}
          <tbody>
            {t.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderRich(c)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto", margin: "6px 0" }}>
      {t.caption ? <div style={{ fontSize: "0.8rem", fontStyle: "italic", color: INK_SOFT, marginBottom: 3 }}>{renderRich(t.caption)}</div> : null}
      <table className="qb-table">
        {headerHasContent && (
          <thead><tr>{t.headers.map((h, i) => <th key={i}>{renderRich(h)}</th>)}</tr></thead>
        )}
        <tbody>
          {t.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderRich(c)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

// Compact grid editor for a question/stimulus table.
function TableEditor({ table, onChange }) {
  const t = table && table.headers ? table : null;
  const start = () => onChange({ headers: ["Column 1", "Column 2"], rows: [["", ""], ["", ""]], caption: "" });
  if (!t) {
    return (
      <button className="qb-btn" type="button" onClick={start}><Plus size={14} /> Add a table</button>
    );
  }
  const cols = t.headers.length;
  const setHeader = (i, v) => { const h = [...t.headers]; h[i] = v; onChange({ ...t, headers: h }); };
  const setCell = (ri, ci, v) => { const rows = t.rows.map(r => [...r]); rows[ri][ci] = v; onChange({ ...t, rows }); };
  const addCol = () => onChange({ ...t, headers: [...t.headers, "Column " + (cols + 1)], rows: t.rows.map(r => [...r, ""]) });
  const delCol = (ci) => { if (cols <= 1) return; onChange({ ...t, headers: t.headers.filter((_, i) => i !== ci), rows: t.rows.map(r => r.filter((_, i) => i !== ci)) }); };
  const addRow = () => onChange({ ...t, rows: [...t.rows, Array(cols).fill("")] });
  const delRow = (ri) => onChange({ ...t, rows: t.rows.filter((_, i) => i !== ri) });
  return (
    <div className="rounded p-2" style={{ border: `1.5px solid ${LINE}`, background: "#fff" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {t.headers.map((h, ci) => (
                <th key={ci} style={{ padding: 2 }}>
                  <div className="flex items-center gap-1">
                    <input className="qb-input" style={{ fontWeight: 700, minWidth: 90, padding: "4px 6px" }} value={h} onChange={e => setHeader(ci, e.target.value)} placeholder={"Header " + (ci + 1)} />
                    <button className="qb-btn qb-btn-ghost" type="button" style={{ padding: 3 }} aria-label="Delete column" onClick={() => delCol(ci)}><X size={12} /></button>
                  </div>
                </th>
              ))}
              <th style={{ padding: 2 }}>
                <button className="qb-btn qb-btn-ghost" type="button" aria-label="Add column" onClick={addCol}><Plus size={14} /></button>
              </th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} style={{ padding: 2 }}>
                    <input className="qb-input" style={{ minWidth: 90, padding: "4px 6px" }} value={c} onChange={e => setCell(ri, ci, e.target.value)} />
                  </td>
                ))}
                <td style={{ padding: 2 }}>
                  <button className="qb-btn qb-btn-ghost" type="button" style={{ padding: 3 }} aria-label="Delete row" onClick={() => delRow(ri)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button className="qb-btn qb-btn-ghost" type="button" onClick={addRow}><Plus size={14} /> Row</button>
        <input className="qb-input" style={{ flex: 1, minWidth: 160 }} value={t.caption || ""} onChange={e => onChange({ ...t, caption: e.target.value })} placeholder="Table caption (optional)" />
        <button className="qb-btn qb-btn-red" type="button" onClick={() => onChange(null)}><Trash2 size={14} /> Remove table</button>
      </div>
      <p className="text-xs mt-1" style={{ color: INK_SOFT }}>Leave the header row blank for a plain grid. You can use ^{ } and _{ } in cells too.</p>
    </div>
  );
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.width);
      if (file.type === "image/png" && file.size < 200000 && scale === 1) {
        const r = new FileReader();
        r.onload = () => { URL.revokeObjectURL(url); resolve(r.result); };
        r.onerror = () => { URL.revokeObjectURL(url); reject(new Error("read failed")); };
        r.readAsDataURL(file);
        return;
      }
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const out = c.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
}

/* ---------------- blank question factory ---------------- */
function blankQuestion(defaults = {}) {
  return {
    id: uid("q"),
    type: "mc",
    text: "",
    imageId: null,
    imageCaption: "",
    imageNote: "",
    groupId: null,
    table: null,            // optional { headers:[...], rows:[[...]], caption:"" }
    course: defaults.course || "",
    unit: "",
    tags: [],
    difficulty: "medium",
    points: 1,
    outcome: "",
    source: "",
    status: "polished",
    notes: "",
    lastUsed: null,
    createdAt: todayISO(),
    mc: { options: ["", "", "", ""], correct: 0 },
    num: { answer: "", units: "", tolerance: "" },
    wr: { lines: 6, rubric: "" },
    match: { pairs: [{ left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" }] },
    tf: { answer: true },
  };
}

/* ---------------- sample questions ---------------- */
function sampleQuestions() {
  const mk = (over) => ({ ...blankQuestion(), ...over, id: uid("q"), createdAt: todayISO(), source: "Sample" });
  return [
    mk({ type: "mc", course: "Science 9", unit: "Electricity", difficulty: "easy", points: 1,
      text: "Which component in a circuit is designed to resist the flow of electric current?",
      mc: { options: ["Switch", "Resistor", "Ammeter", "Battery"], correct: 1 },
      tags: ["circuits"], outcome: "SC9-E2" }),
    mk({ type: "numeric", course: "Science 9", unit: "Electricity", difficulty: "medium", points: 2,
      text: "A 120 V source is connected across a 60 Ω resistor. Calculate the current in the circuit.",
      num: { answer: "2", units: "A", tolerance: "0.1" }, tags: ["ohms law"] }),
    mk({ type: "written", course: "Science 9", unit: "Electricity", difficulty: "medium", points: 3,
      text: "Describe the energy transformations that occur in a battery-powered flashlight, from chemical energy to the light you see.",
      wr: { lines: 6, rubric: "Chemical → electrical (1), electrical → radiant/light (1), mentions thermal loss or correct sequence (1)" } }),
    mk({ type: "tf", course: "Math 10C", unit: "Linear functions", difficulty: "easy", points: 1,
      text: "The slope of a vertical line is 0.",
      tf: { answer: false }, notes: "Common misconception — slope is undefined." }),
    mk({ type: "mc", course: "Math 10C", unit: "Exponents", difficulty: "medium", points: 1,
      text: "Simplify: (2x^{3})^{2}",
      mc: { options: ["2x^{6}", "4x^{5}", "4x^{6}", "2x^{5}"], correct: 2 } }),
    mk({ type: "numeric", course: "Math 10C", unit: "Trigonometry", difficulty: "medium", points: 2,
      text: "A right triangle has legs of 5 cm and 12 cm. Determine the length of the hypotenuse.",
      num: { answer: "13", units: "cm", tolerance: "" },
      imageNote: "Right triangle with legs labelled 5 cm and 12 cm, right angle marked" }),
    mk({ type: "matching", course: "Science 9", unit: "Electricity", difficulty: "easy", points: 4,
      text: "Match each quantity with its SI unit.",
      match: { pairs: [
        { left: "Current", right: "Ampere" },
        { left: "Voltage", right: "Volt" },
        { left: "Resistance", right: "Ohm" },
        { left: "Power", right: "Watt" },
      ] } }),
    mk({ type: "mc", course: "Math 10C", unit: "Linear functions", difficulty: "hard", points: 1, status: "revise",
      text: "A line passes through (2, 5) and (4, 9). Which equation represents this line?",
      mc: { options: ["y = 2x + 1", "y = 2x − 1", "y = x + 3", "y = 4x − 3"], correct: 0 },
      notes: "Distractor D is too obviously wrong — rewrite." }),
  ];
}

/* ---------------- import prompt (the contract for Claude) ---------------- */
const IMPORT_PROMPT = `You are converting an old test into JSON for my question-bank app. Extract EVERY question (and its answer, if a key is included) into a single JSON array. Output ONLY the raw JSON array — no prose, no markdown fences, no trailing commas.

Each question object:
{
  "type": "mc" | "numeric" | "written" | "matching" | "tf",
  "question": "Text. Use ^{...} for superscripts and _{...} for subscripts (x^{2}, H_{2}O). Use \\n for line breaks. Strip the original question number.",
  "course": "e.g. Science 9",
  "unit": "e.g. Electricity",
  "topic": "optional, comma,separated,tags",
  "difficulty": "easy" | "medium" | "hard",
  "outcome": "curriculum outcome code only if printed",
  "source": "teacher / year / filename if known",
  "notes": "flag typos, ambiguity, or a suspect key here",
  "imageNote": "if the question relies on a diagram, describe it briefly",
  "table": { "headers": ["Col 1","Col 2"], "rows": [["a","b"]], "caption": "" } — ONLY for genuine data/reference tables; omit otherwise,
  "status": "revise" — include ONLY if the question has a problem to fix; otherwise omit
}

Type-specific fields:
- mc: "options": ["...", "..."] in original printed order (letter labels stripped), plus "answerIndex": 0-based index of the correct option (key says "B" → 1)
- numeric: "answer": "2.5", optional "units": "m/s", optional "tolerance": "0.1"
- written: "lines": suggested answer lines (default 6), "rubric": expected answer or notes
- matching: "pairs": [{"left": "term", "right": "its CORRECT match"}, ...] — true pairings reconstructed from the key, never the shuffled order as printed
- tf: "answerTF": true or false

Rules: one object per question — never skip or merge; if a shared stimulus covers several questions ("Use the following to answer 5–7"), copy it into each question so every question stands alone; split multi-part questions if the parts stand alone, otherwise keep one "written" question with parts separated by \\n; for "which row" answer-matrix questions (stem with blanks ___(i)___ / ___(ii)___ and a Row A–D table), do NOT use "A"–"D" as options or dump the rows into the stem — put each row's content into its own option (e.g. ["(i) mirrors; (ii) reflect", ...]) and set answerIndex to the correct row (keep letter/number options only when they label parts of a diagram); put genuine data/reference tables in the structured "table" field (or "groupTable" if shared) instead of flattening them into the question text; never invent answers — if no key exists, omit the answer field and say so in "notes"; if a question fits no type, use "written" and explain in "notes".`;

/* ---------------- external → internal mapping ---------------- */
function mapImported(raw) {
  if (raw && typeof raw === "object" && raw.text !== undefined && raw.mc !== undefined) {
    return { q: { ...blankQuestion(), ...raw, id: uid("q") }, imageData: null, group: null, internal: true };
  }
  const q = blankQuestion();
  q.type = ["mc", "numeric", "written", "matching", "tf"].includes(raw.type) ? raw.type : "written";
  q.text = String(raw.question || raw.text || "").trim();
  q.points = 1;
  q.course = String(raw.course || "").trim();
  q.unit = String(raw.unit || "").trim();
  q.tags = String(raw.topic || raw.tags || "").split(",").map(s => s.trim()).filter(Boolean);
  q.difficulty = DIFFS.includes(raw.difficulty) ? raw.difficulty : "medium";
  q.outcome = String(raw.outcome || "").trim();
  q.source = String(raw.source || "").trim();
  q.notes = String(raw.notes || "").trim();
  q.imageNote = String(raw.imageNote || "").trim();
  q.table = sanitizeTable(raw.table);
  if (["polished", "revise", "retired"].includes(raw.status)) q.status = raw.status;
  if (q.type === "mc") {
    const opts = Array.isArray(raw.options) ? raw.options.map(String) : ["", ""];
    q.mc = { options: opts.length >= 2 ? opts : ["", ""], correct: Number.isInteger(raw.answerIndex) ? raw.answerIndex : 0 };
    if (q.mc.correct < 0 || q.mc.correct >= q.mc.options.length) q.mc.correct = 0;
  }
  if (q.type === "numeric") q.num = { answer: String(raw.answer ?? ""), units: String(raw.units || ""), tolerance: String(raw.tolerance ?? "") };
  if (q.type === "written") q.wr = { lines: Number(raw.lines) > 0 ? Number(raw.lines) : 6, rubric: String(raw.rubric || "") };
  if (q.type === "matching") {
    const pairs = Array.isArray(raw.pairs) ? raw.pairs.map(p => ({ left: String(p.left || ""), right: String(p.right || "") })) : [];
    q.match = { pairs: pairs.length ? pairs : [{ left: "", right: "" }] };
  }
  if (q.type === "tf") q.tf = { answer: raw.answerTF === undefined ? raw.answer !== false : !!raw.answerTF };
  const gk = raw.groupKey != null ? String(raw.groupKey).trim() : "";
  const group = gk ? {
    key: gk,
    label: String(raw.groupLabel || "").trim(),
    text: String(raw.groupText || "").trim(),
    imageNote: String(raw.groupImageNote || "").trim(),
    imageData: (typeof raw.groupImageData === "string" && raw.groupImageData.startsWith("data:image")) ? raw.groupImageData : null,
    table: sanitizeTable(raw.groupTable),
  } : null;
  return { q, imageData: typeof raw.imageData === "string" && raw.imageData.startsWith("data:image") ? raw.imageData : null, group };
}

/* ---------------- question suggestions (GitHub-issue submissions) ----------------
   A suggestion carries the question in the same internal shape the bank uses, so
   approving it is just an upsert, and the JSON embedded in the GitHub issue
   re-imports cleanly through the existing Import flow. */
function questionAnswerLine(q) {
  if (!q) return "";
  if (q.type === "mc") return "Proposed answer: " + (q.mc.options[q.mc.correct] || "—");
  if (q.type === "numeric") return "Proposed answer: " + (q.num.answer || "—") + (q.num.units ? " " + q.num.units : "");
  if (q.type === "tf") return "Proposed answer: " + (q.tf.answer ? "True" : "False");
  if (q.type === "matching") return q.match.pairs.length + " pairs";
  if (q.type === "written") return "Written response";
  return "";
}

function buildSubmissionIssueUrl(q, submitter) {
  const stem = String(q.text || "").replace(/\s+/g, " ").trim().slice(0, 70);
  const title = "[Question submission] " + (stem || "New question");
  const body = [
    "**Submitted by:** " + (submitter || "anonymous"),
    "",
    "**Type:** " + (TYPE_META[q.type] ? TYPE_META[q.type].label : q.type) +
      "  ·  **Course:** " + (q.course || "—") +
      "  ·  **Unit:** " + (q.unit || "—") +
      "  ·  **Difficulty:** " + q.difficulty,
    "",
    "> " + String(q.text || "").replace(/\n/g, "\n> "),
    "",
    questionAnswerLine(q),
    "",
    "<details><summary>Question JSON — a maintainer imports this to approve</summary>",
    "",
    "```json",
    JSON.stringify([q], null, 2),
    "```",
    "",
    "</details>",
    "",
    "_Sent from the Question Bank “Suggest a question” form._",
  ].join("\n");
  const params = new URLSearchParams({ title, body, labels: SUBMISSION_LABEL });
  return "https://github.com/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/issues/new?" + params.toString();
}

/* ---------------- published-bank seed ----------------
   On a fresh visit the bank is empty; load what the maintainer has published so
   everyone starts with the shared set. Prefer a full backup (public/seed-bank.json
   — questions + question-sets + diagrams) and fall back to a questions-only
   public/seed-questions.json. IDs are preserved so re-syncing never duplicates. */
async function loadSeedBank() {
  const empty = { questions: [], groups: {}, images: {} };
  const base = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
  const grab = async (name) => {
    try { const r = await fetch(base + name, { cache: "no-store" }); return r.ok ? await r.json() : null; }
    catch (e) { return null; }
  };
  const data = (await grab("seed-bank.json")) || (await grab("seed-questions.json"));
  if (!data) return empty;
  const arr = Array.isArray(data) ? data : (Array.isArray(data.questions) ? data.questions : null);
  if (!arr) return empty;
  const questions = arr
    .filter(raw => raw && raw.text)
    .map(raw => ({ ...blankQuestion(), ...raw, id: raw.id || uid("q"), createdAt: raw.createdAt || todayISO(), lastUsed: null }));
  const groups = (!Array.isArray(data) && data.groups && typeof data.groups === "object" && !Array.isArray(data.groups)) ? data.groups : {};
  const images = (!Array.isArray(data) && data.images && typeof data.images === "object") ? data.images : {};
  return { questions, groups, images };
}

/* ---------------- print CSS (shared with HTML download) ---------------- */
const PRINT_CSS = `
  .exam-doc { font-family: 'Times New Roman', Times, serif; color: #000; background: #fff;
    max-width: 7.6in; margin: 0 auto; padding: 0.35in 0.45in; font-size: 12pt; line-height: 1.45; }
  .exam-doc * { box-sizing: border-box; }
  .ex-head { border-bottom: 2.5px solid #000; padding-bottom: 8px; margin-bottom: 6px; }
  .ex-course { font-size: 10pt; letter-spacing: 0.18em; text-transform: uppercase; }
  .ex-title { font-size: 17pt; font-weight: bold; margin: 2px 0; }
  .ex-meta-row { display: flex; justify-content: space-between; gap: 16px; font-size: 11pt; margin-top: 10px; flex-wrap: wrap; }
  .ex-blank { display: inline-block; border-bottom: 1px solid #000; min-width: 2.1in; }
  .ex-blank-sm { display: inline-block; border-bottom: 1px solid #000; min-width: 1.1in; }
  .ex-instr { font-size: 10.5pt; font-style: italic; margin: 8px 0 4px; }
  .ex-sec { margin-top: 18px; }
  .ex-sec-h { font-weight: bold; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 4px; font-size: 12.5pt; }
  .ex-sec-i { font-size: 10.5pt; font-style: italic; margin-bottom: 8px; }
  .ex-q { margin: 12px 0; break-inside: avoid; page-break-inside: avoid; }
  .ex-stim { border: 1.5px solid #000; padding: 8px 12px; margin: 10px 0 8px; background: #fafafa; break-inside: avoid; }
  .ex-tablewrap { margin: 8px 0 8px 34px; break-inside: avoid; }
  .ex-table { border-collapse: collapse; font-size: 10.5pt; }
  .ex-table th, .ex-table td { border: 1px solid #000; padding: 3px 8px; text-align: left; vertical-align: top; }
  .ex-table th { font-weight: bold; }
  .ex-table-cap { font-size: 10pt; font-style: italic; margin-bottom: 3px; }
  .ex-stim .ex-tablewrap { margin-left: 0; }
  .ex-stim-h { font-weight: bold; font-size: 10.5pt; margin-bottom: 4px; }
  .ex-stim-body { font-size: 11pt; }
  .ex-q-row { display: flex; gap: 8px; }
  .ex-q-num { font-weight: bold; min-width: 26px; }
  .ex-marks { font-size: 9.5pt; white-space: nowrap; }
  .ex-opts { margin: 6px 0 0 34px; }
  .ex-opt { margin: 2.5px 0; display: flex; gap: 8px; }
  .ex-opt-letter { font-weight: bold; min-width: 20px; }
  .ex-img { margin: 8px 0 4px 34px; }
  .ex-img img { max-width: 4.6in; max-height: 3.4in; border: 1px solid #999; }
  .ex-img-cap { font-size: 9.5pt; font-style: italic; }
  .ex-imgnote { margin: 6px 0 0 34px; border: 1px dashed #777; padding: 8px 10px; font-size: 10pt; font-style: italic; color: #333; }
  .ex-lines { margin: 8px 0 0 34px; }
  .ex-line { border-bottom: 1px solid #444; height: 26pt; }
  .ex-ansline { margin: 8px 0 0 34px; font-size: 11.5pt; }
  .ex-tf-blank { display: inline-block; border-bottom: 1px solid #000; min-width: 0.45in; margin-right: 8px; }
  .ex-match { display: flex; gap: 36px; margin: 8px 0 0 34px; flex-wrap: wrap; }
  .ex-match-col { min-width: 2in; }
  .ex-match-item { margin: 4px 0; }
  .ex-key-h { font-weight: bold; font-size: 14pt; border-bottom: 2.5px solid #000; padding-bottom: 4px; margin-bottom: 10px; }
  .ex-keymap { border: 1px solid #000; padding: 6px 9px; margin: 0 0 12px; break-inside: avoid; }
  .ex-keymap-h { font-weight: bold; font-size: 10pt; margin-bottom: 3px; }
  .ex-keymap-body { font-size: 10pt; line-height: 1.5; font-variant-numeric: tabular-nums; }
  .ex-keymap-pair { display: inline-block; margin-right: 24px; margin-bottom: 6px; }
  .ex-key-item { margin: 6px 0; break-inside: avoid; }
  .ex-key-num { font-weight: bold; }
  .ex-rubric { font-size: 10.5pt; font-style: italic; margin-left: 26px; }
  .ex-end { text-align: center; font-size: 10pt; letter-spacing: 0.2em; margin-top: 28px; }
  sup { font-size: 0.72em; } sub { font-size: 0.72em; }
  @page { margin: 0.6in; }
`;

/* ---------------- document builder ---------------- */
function buildDoc(test, questionsById, groups, version) {
  const qs = test.questionIds.map(id => questionsById[id]).filter(Boolean);
  const missing = test.questionIds.length - qs.length;
  const rngBase = (test.seed || 1) + (version === "B" ? 7919 : 0);

  // Merge adjacent members of the same group into indivisible units
  const units = [];
  qs.forEach(q => {
    const last = units[units.length - 1];
    if (q.groupId && last && last.groupId === q.groupId) last.members.push(q);
    else units.push({ groupId: q.groupId || null, members: [q] });
  });

  const sections = [];
  let num = 0;
  let partIdx = 0;
  const partLetter = () => String.fromCharCode(65 + partIdx++);
  TYPE_ORDER.forEach(type => {
    let secUnits = units.filter(u => u.members[0].type === type);
    if (!secUnits.length) return;
    if (version === "B" && test.shuffleOrder) {
      secUnits = shuffleSeeded(secUnits, mulberry32(rngBase + TYPE_ORDER.indexOf(type) * 101));
    }
    const items = [];
    secUnits.forEach(u => {
      const firstIdx = items.length;
      u.members.forEach(q => {
        num += 1;
        const item = { num, q };
        if (q.type === "mc") {
          let order = q.mc.options.map((_, i) => i);
          if (test.shuffleMC) order = shuffleSeeded(order, mulberry32(rngBase + num * 31));
          item.mcOrder = order;
        }
        if (q.type === "matching") {
          const rights = q.match.pairs.map((p, i) => ({ text: p.right, pairIndex: i }));
          item.rightOrder = shuffleSeeded(rights, mulberry32(rngBase + num * 53));
        }
        items.push(item);
      });
      if (u.groupId && groups[u.groupId]) {
        items[firstIdx].stim = { ...groups[u.groupId], from: items[firstIdx].num, to: num };
      }
    });
    sections.push({ type, letter: partLetter(), items });
  });
  return { sections, missing, count: qs.length };
}

/* ---------------- page optimizer ---------------- */
const PAPER_SIZES = {
  letter: { label: 'Letter (8.5 × 11")', w: 8.5, h: 11 },
  legal:  { label: 'Legal (8.5 × 14")',  w: 8.5, h: 14 },
  a4:     { label: "A4 (210 × 297 mm)",  w: 8.27, h: 11.69 },
};

// Group an item list into indivisible blocks (a set's members travel together).
function blocksOf(items) {
  const blocks = [];
  items.forEach(item => {
    const gid = item.q.groupId || null;
    const last = blocks[blocks.length - 1];
    if (gid && last && last.gid === gid) last.items.push(item);
    else blocks.push({ gid, items: [item] });
  });
  return blocks;
}

// Renumber items sequentially across sections and recompute each set's stimulus span.
function renumberSections(sections) {
  let num = 0;
  sections.forEach(sec => {
    let i = 0;
    while (i < sec.items.length) {
      const item = sec.items[i];
      const gid = item.q.groupId;
      if (gid && item.stim) {
        const start = num + 1;
        let j = i;
        while (j < sec.items.length && sec.items[j].q.groupId === gid) { num++; sec.items[j].num = num; j++; }
        item.stim = { ...item.stim, from: start, to: num };
        i = j;
      } else {
        num++; item.num = num; i++;
      }
    }
  });
  return sections;
}

// Pack blocks into pages. reorder=true → reflow to minimize pages; false → natural order (baseline).
// Returns { sections, pages }.
function packPages(baseDoc, heights, pageH, spacingPx, reorder) {
  const H = (k) => heights[k] || 0;
  const blockHeight = (b) => b.items.reduce((s, it) => s + H("q-" + it.q.id) + spacingPx, 0);
  let used = 0, pages = 1;
  const newSections = [];
  for (const sec of baseDoc.sections) {
    const headH = H("h-" + sec.type) + H("i-" + sec.type) + 4;
    const blocks = blocksOf(sec.items).map(b => ({ ...b, h: blockHeight(b) }));
    const minH = blocks.length ? Math.min(...blocks.map(b => b.h)) : 0;
    if (used > 0 && used + headH + minH > pageH) { pages++; used = 0; }
    used += headH;
    const remaining = [...blocks];
    const ordered = [];
    while (remaining.length) {
      const space = pageH - used;
      let pick;
      if (reorder) {
        pick = -1; let best = -1;
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i].h <= space && remaining[i].h > best) { best = remaining[i].h; pick = i; }
        }
        if (pick === -1) { pages++; used = 0; pick = remaining.reduce((mi, b, i, a) => (b.h < a[mi].h ? i : mi), 0); }
      } else {
        if (remaining[0].h > space && used > 0) { pages++; used = 0; }
        pick = 0;
      }
      const b = remaining.splice(pick, 1)[0];
      ordered.push(b);
      used += b.h;
    }
    newSections.push({ ...sec, items: ordered.flatMap(b => b.items.map(it => ({ ...it }))) });
  }
  return { sections: renumberSections(newSections), pages };
}

function optimizeDoc(baseDoc, heights, pageH, sp) {
  const r = packPages(baseDoc, heights, pageH, sp, true);
  return { ...baseDoc, sections: r.sections, pages: r.pages };
}
function baselinePages(baseDoc, heights, pageH, sp) {
  return packPages(baseDoc, heights, pageH, sp, false).pages;
}

// Deterministic height estimate (px) used as a fallback when DOM measurement isn't available yet.
function estimateHeights(baseDoc, widthPx, fontPt) {
  const fpx = fontPt * (96 / 72);
  const lh = fpx * 1.5;
  const cpl = Math.max(20, Math.floor(widthPx / (fpx * 0.52)));
  const lines = (txt) => String(txt || "").split("\n").reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / cpl)), 0);
  const map = {};
  baseDoc.sections.forEach(sec => {
    map["h-" + sec.type] = lh * 1.4;
    map["i-" + sec.type] = lh * 1.2;
    sec.items.forEach(item => {
      const q = item.q;
      let h = lh * lines(q.text) + 10;
      if (q.type === "mc") h += (q.mc && q.mc.options ? q.mc.options.length : 4) * lh;
      else if (q.type === "tf") h += lh;
      else if (q.type === "numeric") h += lh * 1.4;
      else if (q.type === "matching") h += (q.match && q.match.pairs ? q.match.pairs.length : 3) * lh;
      else if (q.type === "written") h += (q.wr && q.wr.lines ? q.wr.lines : 6) * lh * 1.5 + 10;
      if (q.table) h += (((q.table.rows && q.table.rows.length) || 0) + 1) * lh * 1.4 + (q.table.caption ? lh : 0);
      if (q.imageId) h += 250; else if (q.imageNote) h += 46;
      if (item.stim) {
        const g = item.stim;
        h += 18 + lh * lines(g.text || "");
        if (g.table) h += (((g.table.rows && g.table.rows.length) || 0) + 1) * lh * 1.4;
        if (g.imageId) h += 250; else if (g.imageNote) h += 46;
      }
      map["q-" + q.id] = h;
    });
  });
  return map;
}

/* ============================================================ */

export default function QuestionBankApp() {
  const [loaded, setLoaded] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [groups, setGroups] = useState({});
  const [settings, setSettings] = useState({ teacher: "", school: "", courses: [] });
  const [tests, setTests] = useState([]);
  const [tab, setTab] = useState("bank");
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(null);      // question draft or null
  const [importOpen, setImportOpen] = useState(false);
  const [printJob, setPrintJob] = useState(null);    // { test } or null
  const [editTest, setEditTest] = useState(null);    // saved test loaded for editing, or null
  const [submissions, setSubmissions] = useState([]); // suggested questions: pending / approved / rejected
  const [suggesting, setSuggesting] = useState(null); // { draft, submitter } while composing a suggestion, or null
  const [admin, setAdmin] = useState(false);          // moderation queue unlocked?
  const imageCache = useRef({});
  const toastTimer = useRef(null);

  const say = useCallback((msg, tone = "ok") => {
    setToast({ msg, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  /* ---- load ---- */
  useEffect(() => {
    (async () => {
      const [qs, st, ts, gr, subs] = await Promise.all([jGet("bank:questions"), jGet("bank:settings"), jGet("bank:tests"), jGet("bank:groups"), jGet("bank:submissions")]);
      if (qs && Array.isArray(qs)) {
        setQuestions(qs);
      } else {
        // First visit: seed everyone from the maintainer's published bank,
        // restoring its question-sets and diagrams (not just the question text).
        const seed = await loadSeedBank();
        if (seed.questions.length) {
          for (const imgId of Object.keys(seed.images)) await rawSet("img:" + imgId, seed.images[imgId]);
          setQuestions(seed.questions); await jSet("bank:questions", seed.questions);
          if (Object.keys(seed.groups).length) { setGroups(seed.groups); await jSet("bank:groups", seed.groups); }
        }
      }
      if (st) setSettings({ teacher: "", school: "", courses: [], ...st });
      if (ts && Array.isArray(ts)) setTests(ts);
      if (gr && typeof gr === "object" && !Array.isArray(gr)) setGroups(gr);
      if (subs && Array.isArray(subs)) setSubmissions(subs);
      // Unlock the moderation queue automatically when opened with ?admin=1.
      try {
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("admin") === "1") setAdmin(true);
      } catch (e) { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  /* ---- persistence ---- */
  const saveQuestions = useCallback(async (next) => {
    setQuestions(next);
    const ok = await jSet("bank:questions", next);
    if (!ok) say("Couldn't save to storage — your latest change may not persist.", "warn");
  }, [say]);
  const saveSettings = useCallback(async (next) => {
    setSettings(next);
    await jSet("bank:settings", next);
  }, []);
  const saveTests = useCallback(async (next) => {
    setTests(next);
    await jSet("bank:tests", next);
  }, []);
  const saveGroups = useCallback(async (next) => {
    setGroups(next);
    await jSet("bank:groups", next);
  }, []);
  const saveSubmissions = useCallback(async (next) => {
    setSubmissions(next);
    await jSet("bank:submissions", next);
  }, []);

  /* ---- images ---- */
  const getImage = useCallback(async (id) => {
    if (!id) return null;
    if (imageCache.current[id]) return imageCache.current[id];
    const v = await rawGet("img:" + id);
    if (v) imageCache.current[id] = v;
    return v;
  }, []);
  const putImage = useCallback(async (dataUrl) => {
    const id = uid("img");
    const ok = await rawSet("img:" + id, dataUrl);
    if (!ok) { say("Image too large or storage failed — try a smaller image.", "warn"); return null; }
    imageCache.current[id] = dataUrl;
    return id;
  }, [say]);

  const questionsById = useMemo(() => {
    const m = {};
    questions.forEach(q => { m[q.id] = q; });
    return m;
  }, [questions]);

  const courseOptions = useMemo(() => {
    const s = new Set(settings.courses);
    questions.forEach(q => q.course && s.add(q.course));
    return [...s].sort();
  }, [questions, settings.courses]);

  /* ---- CRUD ---- */
  const upsertQuestion = useCallback((q) => {
    const exists = questions.some(x => x.id === q.id);
    const next = exists ? questions.map(x => (x.id === q.id ? q : x)) : [q, ...questions];
    saveQuestions(next);
    if (q.course && !settings.courses.includes(q.course)) {
      saveSettings({ ...settings, courses: [...settings.courses, q.course].sort() });
    }
    say(exists ? "Question updated" : "Question filed");
  }, [questions, saveQuestions, settings, saveSettings, say]);

  const deleteQuestion = useCallback((id) => {
    const q = questionsById[id];
    if (q && q.imageId) rawDel("img:" + q.imageId);
    saveQuestions(questions.filter(x => x.id !== id));
    say("Question deleted");
  }, [questions, questionsById, saveQuestions, say]);

  const duplicateQuestion = useCallback((id) => {
    const q = questionsById[id];
    if (!q) return;
    const copy = { ...JSON.parse(JSON.stringify(q)), id: uid("q"), createdAt: todayISO(), lastUsed: null, source: q.source || "" };
    saveQuestions([copy, ...questions]);
    say("Duplicated — edit the copy");
  }, [questions, questionsById, saveQuestions, say]);

  const loadSamples = useCallback(() => {
    const s = sampleQuestions();
    saveQuestions([...s, ...questions]);
    const cs = new Set([...settings.courses, "Science 9", "Math 10C"]);
    saveSettings({ ...settings, courses: [...cs].sort() });
    say("8 sample questions filed — delete them anytime");
  }, [questions, saveQuestions, settings, saveSettings, say]);

  /* ---- question suggestions & moderation ---- */
  const submitQuestion = useCallback((q, submitter) => {
    const sub = {
      id: uid("sub"),
      submittedAt: new Date().toISOString(),
      submitter: (submitter || "").trim(),
      status: "pending",
      question: q,
    };
    saveSubmissions([sub, ...submissions]);
    try { window.open(buildSubmissionIssueUrl(q, sub.submitter), "_blank", "noopener,noreferrer"); } catch (e) { /* popup blocked */ }
    say("Thanks! Your suggestion was sent for approval.");
  }, [submissions, saveSubmissions, say]);

  const approveSubmission = useCallback((id) => {
    const sub = submissions.find(s => s.id === id);
    if (!sub) return;
    upsertQuestion({ ...blankQuestion(), ...sub.question, id: uid("q"), createdAt: todayISO(), lastUsed: null, status: "polished" });
    saveSubmissions(submissions.map(s => (s.id === id ? { ...s, status: "approved" } : s)));
  }, [submissions, upsertQuestion, saveSubmissions]);

  const rejectSubmission = useCallback((id) => {
    saveSubmissions(submissions.map(s => (s.id === id ? { ...s, status: "rejected" } : s)));
    say("Suggestion rejected");
  }, [submissions, saveSubmissions, say]);

  const clearReviewedSubmissions = useCallback(() => {
    saveSubmissions(submissions.filter(s => s.status === "pending"));
    say("Cleared reviewed suggestions");
  }, [submissions, saveSubmissions, say]);

  const unlockAdmin = useCallback((pass) => {
    if (pass === ADMIN_PASSPHRASE) { setAdmin(true); say("Moderation unlocked"); return true; }
    say("That passphrase didn't match.", "warn");
    return false;
  }, [say]);

  const syncPublished = useCallback(async () => {
    const seed = await loadSeedBank();
    if (!seed.questions.length) { say("No published questions found.", "warn"); return; }
    const have = new Set(questions.map(q => q.id));
    const add = seed.questions.filter(q => !have.has(q.id));
    if (!add.length) { say("Already up to date with the published bank."); return; }
    // Bring along the diagrams and question-sets the new questions rely on.
    const neededGroups = [...new Set(add.map(q => q.groupId).filter(Boolean))];
    const nextGroups = { ...groups };
    neededGroups.forEach(gid => { if (seed.groups[gid] && !nextGroups[gid]) nextGroups[gid] = seed.groups[gid]; });
    for (const q of add) if (q.imageId && seed.images[q.imageId]) await rawSet("img:" + q.imageId, seed.images[q.imageId]);
    for (const gid of neededGroups) { const g = seed.groups[gid]; if (g && g.imageId && seed.images[g.imageId]) await rawSet("img:" + g.imageId, seed.images[g.imageId]); }
    if (Object.keys(nextGroups).length !== Object.keys(groups).length) saveGroups(nextGroups);
    saveQuestions([...add, ...questions]);
    say(`Added ${add.length} newly published question${add.length === 1 ? "" : "s"}`);
  }, [questions, groups, saveQuestions, saveGroups, say]);

  // Export the whole bank as a full backup named seed-bank.json — commit it to
  // public/ to publish these questions (with their diagrams and question-sets)
  // to every visitor.
  const exportSeed = useCallback(async () => {
    const clean = questions.map(q => { const c = JSON.parse(JSON.stringify(q)); delete c.lastUsed; return c; });
    const usedGroupIds = [...new Set(questions.map(q => q.groupId).filter(Boolean))];
    const groupsSubset = {};
    usedGroupIds.forEach(gid => { if (groups[gid]) groupsSubset[gid] = groups[gid]; });
    const images = {};
    for (const q of questions) if (q.imageId) { const d = await getImage(q.imageId); if (d) images[q.imageId] = d; }
    for (const gid of usedGroupIds) { const gImg = groups[gid] && groups[gid].imageId; if (gImg) { const d = await getImage(gImg); if (d) images[gImg] = d; } }
    const payload = {
      app: "question-bank", version: 1, exportedAt: new Date().toISOString(),
      settings: { courses: [...new Set(questions.map(q => q.course).filter(Boolean))] },
      questions: clean, groups: groupsSubset, images,
    };
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "seed-bank.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`Exported ${clean.length} question${clean.length === 1 ? "" : "s"} as seed-bank.json`);
  }, [questions, groups, getImage, say]);

  /* ---- import / export ---- */
  const doImport = useCallback(async (text) => {
    let data;
    try {
      data = JSON.parse(text.trim());
    } catch (e) {
      say("That isn't valid JSON — check for stray text around the array.", "warn");
      return false;
    }
    const isBackup = !Array.isArray(data) && data && data.app === "question-bank";
    const arr = Array.isArray(data) ? data : (Array.isArray(data.questions) ? data.questions : null);
    if (!arr) { say("Expected a JSON array of questions.", "warn"); return false; }
    const importedImages = (!Array.isArray(data) && data.images && typeof data.images === "object") ? data.images : {};
    const importedGroups = (isBackup && data.groups && typeof data.groups === "object") ? data.groups : {};

    // Restore group records from a full backup (fresh ids; re-attach stimulus images)
    const groupIdRemap = {};
    const groupRecords = {};         // groupId -> record (restored + AI-keyed)
    for (const oldGid of Object.keys(importedGroups)) {
      const g = importedGroups[oldGid] || {};
      const ng = {
        id: uid("grp"),
        label: g.label || "", text: g.text || "",
        imageNote: g.imageNote || "", imageCaption: g.imageCaption || "",
        imageId: null, table: g.table || null,
      };
      if (g.imageId && importedImages[g.imageId]) {
        const nid = await putImage(importedImages[g.imageId]);
        if (nid) ng.imageId = nid;
      }
      groupIdRemap[oldGid] = ng.id;
      groupRecords[ng.id] = ng;
    }

    const added = [];
    const qIdRemap = {};             // old question id -> new id (lets saved tests reconnect)
    const newGroups = {};            // AI groupKey -> groupId
    for (const raw of arr) {
      try {
        const mapped = mapImported(raw);
        const q = mapped.q || mapped;
        if (raw && raw.id) qIdRemap[raw.id] = q.id;
        if (q.groupId) q.groupId = groupIdRemap[q.groupId] || null;
        if (mapped.imageData) {
          const imgId = await putImage(mapped.imageData);
          if (imgId) q.imageId = imgId;
        } else if (q.imageId && importedImages[q.imageId]) {
          const newId = await putImage(importedImages[q.imageId]);
          q.imageId = newId;
        } else if (q.imageId && !importedImages[q.imageId]) {
          q.imageId = null;
        }
        // Attach to a shared-stimulus group when groupKey is present
        if (mapped.group && mapped.group.key) {
          const gk = mapped.group.key;
          if (!newGroups[gk]) {
            const gid = uid("grp");
            newGroups[gk] = gid;
            let stimImageId = null;
            if (mapped.group.imageData && String(mapped.group.imageData).startsWith("data:image")) {
              stimImageId = await putImage(mapped.group.imageData);
            }
            groupRecords[gid] = {
              id: gid,
              label: mapped.group.label || "",
              text: mapped.group.text || "",
              imageNote: mapped.group.imageNote || "",
              imageId: stimImageId,
              table: mapped.group.table || null,
            };
          }
          q.groupId = newGroups[gk];
        }
        if (q.text) added.push(q);
      } catch (e) { /* skip bad row */ }
    }
    if (!added.length) { say("No usable questions found in that JSON.", "warn"); return false; }
    saveQuestions([...added, ...questions]);
    if (Object.keys(groupRecords).length) saveGroups({ ...groups, ...groupRecords });

    // Restore saved tests from a full backup, reconnecting them to the re-imported questions
    let restoredTests = 0;
    if (isBackup && Array.isArray(data.tests)) {
      const restored = data.tests.map(t => {
        const ids = (t.questionIds || []).map(oid => qIdRemap[oid]).filter(Boolean);
        if (!ids.length) return null;
        return { ...t, id: uid("t"), questionIds: ids };
      }).filter(Boolean);
      restoredTests = restored.length;
      if (restored.length) saveTests([...restored, ...tests]);
    }

    // Merge settings: union courses; adopt teacher/school only if currently blank
    const bs = (isBackup && data.settings) || {};
    const cs = new Set([...(settings.courses || []), ...(bs.courses || [])]);
    added.forEach(q => q.course && cs.add(q.course));
    saveSettings({
      ...settings,
      teacher: settings.teacher || bs.teacher || "",
      school: settings.school || bs.school || "",
      courses: [...cs].sort(),
    });

    say(`Filed ${added.length} question${added.length === 1 ? "" : "s"}${restoredTests ? ` · restored ${restoredTests} saved test${restoredTests === 1 ? "" : "s"}` : ""}`);
    return true;
  }, [questions, saveQuestions, settings, saveSettings, groups, saveGroups, tests, saveTests, putImage, say]);

  const doExport = useCallback(async (opts = {}) => {
    const all = opts.all !== false;            // default: full backup
    const filter = opts.filter || null;
    const match = (q) => !filter ||
      ((filter.course === "all" || q.course === filter.course) &&
       (filter.unit === "all" || q.unit === filter.unit) &&
       (filter.type === "all" || q.type === filter.type) &&
       (filter.difficulty === "all" || q.difficulty === filter.difficulty) &&
       (filter.status === "all" || q.status === filter.status));
    const qs = all ? questions : questions.filter(match);
    if (!qs.length) { say("No questions match that selection.", "warn"); return; }
    const usedGroupIds = [...new Set(qs.map(q => q.groupId).filter(Boolean))];
    const groupsSubset = all ? groups : Object.fromEntries(usedGroupIds.filter(g => groups[g]).map(g => [g, groups[g]]));
    const images = {};
    for (const q of qs) {
      if (q.imageId) { const d = await getImage(q.imageId); if (d) images[q.imageId] = d; }
    }
    for (const gid of Object.keys(groupsSubset)) {
      const gImg = groupsSubset[gid] && groupsSubset[gid].imageId;
      if (gImg) { const d = await getImage(gImg); if (d) images[gImg] = d; }
    }
    const payload = {
      app: "question-bank", version: 1, exportedAt: new Date().toISOString(),
      settings: all ? settings : { courses: [...new Set(qs.map(q => q.course).filter(Boolean))] },
      questions: qs, groups: groupsSubset, images,
    };
    if (all) payload.tests = tests;   // only the full backup carries saved tests
    const slug = (s) => String(s || "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
    let name = "question-bank-backup";
    if (!all) {
      const parts = [filter.course, filter.unit, filter.type, filter.difficulty, filter.status]
        .filter(v => v && v !== "all").map(slug);
      name = "question-bank" + (parts.length ? "-" + parts.join("-") : "-selection");
    }
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + "-" + todayISO() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(all
      ? `Full backup downloaded — ${qs.length} question${qs.length === 1 ? "" : "s"} + ${tests.length} test${tests.length === 1 ? "" : "s"}`
      : `Exported ${qs.length} question${qs.length === 1 ? "" : "s"}`);
  }, [questions, settings, tests, groups, getImage, say]);

  // Export a single saved test bundled with the actual questions it uses (order preserved),
  // their question-set records, and any diagrams. Re-imports as a complete, self-contained test.
  const exportTest = useCallback(async (test) => {
    const qs = test.questionIds.map(id => questionsById[id]).filter(Boolean);
    const usedGroupIds = [...new Set(qs.map(q => q.groupId).filter(Boolean))];
    const groupsSubset = {};
    usedGroupIds.forEach(gid => { if (groups[gid]) groupsSubset[gid] = groups[gid]; });
    const images = {};
    for (const q of qs) {
      if (q.imageId) { const d = await getImage(q.imageId); if (d) images[q.imageId] = d; }
    }
    for (const gid of usedGroupIds) {
      const gImg = groups[gid] && groups[gid].imageId;
      if (gImg) { const d = await getImage(gImg); if (d) images[gImg] = d; }
    }
    const payload = {
      app: "question-bank", version: 1, kind: "test", exportedAt: new Date().toISOString(),
      settings: { courses: [...new Set(qs.map(q => q.course).filter(Boolean))] },
      questions: qs, groups: groupsSubset, tests: [test], images,
    };
    const safe = (test.title || "test").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "test";
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "test-" + safe + "-" + todayISO() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`Exported "${test.title}" with ${qs.length} question${qs.length === 1 ? "" : "s"}`);
  }, [questionsById, groups, getImage, say]);

  const wipeAll = useCallback(async () => {
    for (const q of questions) if (q.imageId) await rawDel("img:" + q.imageId);
    for (const gid of Object.keys(groups)) if (groups[gid] && groups[gid].imageId) await rawDel("img:" + groups[gid].imageId);
    await rawDel("bank:questions"); await rawDel("bank:tests"); await rawDel("bank:groups");
    setQuestions([]); setTests([]); setGroups({});
    say("All questions and tests deleted");
  }, [questions, groups, say]);

  /* ---- finalize a test ---- */
  const finalizeTest = useCallback((test) => {
    const stamped = questions.map(q => test.questionIds.includes(q.id) ? { ...q, lastUsed: todayISO() } : q);
    saveQuestions(stamped);
    const rec = { ...test, id: test.id || uid("t"), createdAt: test.createdAt || todayISO() };
    const nextTests = tests.some(t => t.id === rec.id) ? tests.map(t => t.id === rec.id ? rec : t) : [rec, ...tests];
    saveTests(nextTests);
    setEditTest(null);
    setPrintJob({ test: rec });
    say("Test saved — last-used dates stamped");
  }, [questions, saveQuestions, tests, saveTests, say]);

  /* ============================ render ============================ */
  if (printJob) {
    return (
      <PrintView
        test={printJob.test}
        questionsById={questionsById}
        groups={groups}
        settings={settings}
        getImage={getImage}
        onClose={() => setPrintJob(null)}
      />
    );
  }

  return (
    <div className="min-h-screen" style={{ background: PAPER, color: INK, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <StyleBlock />
      {!hasStorage && (
        <div className="px-4 py-2 text-sm flex items-center gap-2 no-print" style={{ background: "#fdf0d8", borderBottom: `1px solid ${MANILA_DEEP}` }}>
          <AlertTriangle size={15} style={{ color: PEN_RED }} />
          Storage isn't available here — changes will vanish when you leave. Export a backup before closing.
        </div>
      )}

      {/* Header */}
      <header className="px-4 pt-5 pb-0 md:px-8 w-full mx-auto" style={{ maxWidth: 1500 }}>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="qb-stamp" style={{ color: INK_SOFT }}>The filing cabinet · v2.1</div>
            <h1 className="qb-display" style={{ color: INK }}>Question Bank</h1>
          </div>
          <div className="qb-stamp pb-2 text-right" style={{ color: INK_SOFT }}>
            {questions.length} question{questions.length === 1 ? "" : "s"} on file
            {tests.length > 0 ? ` · ${tests.length} test${tests.length === 1 ? "" : "s"}` : ""}
          </div>
        </div>

        {/* Folder tabs */}
        <nav className="flex gap-1 mt-4 flex-wrap" aria-label="Sections">
          {[
            { id: "bank", label: "Bank", icon: BookOpen },
            { id: "build", label: "Build a test", icon: ClipboardList },
            { id: "tests", label: "Saved tests", icon: FileText },
            { id: "suggest", label: "Suggest a question", icon: Send },
            { id: "settings", label: "Settings", icon: SettingsIcon },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={"folder-tab " + (tab === t.id ? "folder-tab-on" : "")}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-4 md:px-8 pb-16 pt-5 w-full mx-auto" style={{ borderTop: `2px solid ${MANILA_DEEP}`, maxWidth: 1500 }}>
        {!loaded ? (
          <div className="py-16 text-center qb-stamp" style={{ color: INK_SOFT }}>Opening the cabinet…</div>
        ) : tab === "bank" ? (
          <BankTab
            questions={questions}
            groups={groups}
            courseOptions={courseOptions}
            onNew={() => setEditing(blankQuestion({ course: courseOptions[0] || "" }))}
            onEdit={(q) => setEditing(JSON.parse(JSON.stringify(q)))}
            onDelete={deleteQuestion}
            onDuplicate={duplicateQuestion}
            onImport={() => setImportOpen(true)}
            onExport={doExport}
            onSamples={loadSamples}
            getImage={getImage}
          />
        ) : tab === "build" ? (
          <BuildTab
            questions={questions}
            groups={groups}
            courseOptions={courseOptions}
            settings={settings}
            onFinalize={finalizeTest}
            editTest={editTest}
            onClearEdit={() => setEditTest(null)}
            getImage={getImage}
            say={say}
          />
        ) : tab === "tests" ? (
          <TestsTab
            tests={tests}
            questionsById={questionsById}
            onOpen={(t) => setPrintJob({ test: t })}
            onEdit={(t) => { setEditTest(t); setTab("build"); say("Loaded \u201c" + t.title + "\u201d for editing"); }}
            onExportTest={exportTest}
            onDelete={(id) => { saveTests(tests.filter(t => t.id !== id)); say("Test deleted"); }}
          />
        ) : tab === "suggest" ? (
          <SuggestTab
            courseOptions={courseOptions}
            submissions={submissions}
            onCompose={(submitter) => setSuggesting({ draft: blankQuestion({ course: courseOptions[0] || "" }), submitter })}
          />
        ) : (
          <SettingsTab
            settings={settings}
            onSave={saveSettings}
            onWipe={wipeAll}
            questionsCount={questions.length}
            submissions={submissions}
            admin={admin}
            onUnlock={unlockAdmin}
            onApprove={approveSubmission}
            onReject={rejectSubmission}
            onClearReviewed={clearReviewedSubmissions}
            onImport={doImport}
            onSyncPublished={syncPublished}
            onExportSeed={exportSeed}
          />
        )}
      </main>

      {editing && (
        <EditorModal
          draft={editing}
          courseOptions={courseOptions}
          onCancel={() => setEditing(null)}
          onSave={(q) => { upsertQuestion(q); setEditing(null); }}
          getImage={getImage}
          putImage={putImage}
          say={say}
        />
      )}
      {suggesting && (
        <EditorModal
          mode="suggest"
          draft={suggesting.draft}
          courseOptions={courseOptions}
          onCancel={() => setSuggesting(null)}
          onSave={(q) => { submitQuestion(q, suggesting.submitter); setSuggesting(null); }}
          getImage={getImage}
          putImage={putImage}
          say={say}
        />
      )}
      {importOpen && (
        <ImportModal onClose={() => setImportOpen(false)} onImport={doImport} say={say} />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 px-4 py-2 rounded shadow-lg text-sm z-50"
          style={{ transform: "translateX(-50%)", background: toast.tone === "warn" ? PEN_RED : INK, color: "#fff" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------------- style block ---------------- */
function StyleBlock() {
  return (
    <style>{`
      .qb-display { font-family: 'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;
        font-size: 1.9rem; line-height: 1.1; letter-spacing: -0.01em; font-weight: 700; }
      .qb-serif { font-family: 'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif; }
      .qb-stamp { font-family: ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;
        font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.12em; }
      .folder-tab { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px 10px;
        font-size: 0.84rem; font-weight: 600; color: ${INK_SOFT}; background: ${MANILA};
        border: 2px solid ${MANILA_DEEP}; border-bottom: none; border-radius: 9px 9px 0 0;
        position: relative; top: 2px; white-space: nowrap; cursor: pointer; }
      .folder-tab:hover { background: #f2e6c2; }
      .folder-tab-on { background: ${PAPER}; color: ${INK}; top: 2px; padding-bottom: 12px;
        box-shadow: 0 -2px 4px rgba(0,0,0,0.04); }
      .index-card { background: ${CARD}; border: 1px solid ${LINE}; border-radius: 4px;
        box-shadow: 0 1px 2px rgba(40,35,20,0.07); position: relative; overflow: hidden; overflow-wrap: break-word; }
      .modal-card, .qb-serif { overflow-wrap: break-word; }
      .index-card::before { content: ""; position: absolute; left: 0; right: 0; top: 38px;
        border-top: 1.5px solid ${PEN_RED}; opacity: 0.55; }
      .index-card.no-rule::before { display: none; }
      .index-card:hover { box-shadow: 0 3px 8px rgba(40,35,20,0.12); }
      .marks-badge { display: inline-flex; align-items: center; justify-content: center;
        min-width: 34px; height: 34px; padding: 0 6px; border: 2px solid ${PEN_RED}; color: ${PEN_RED};
        border-radius: 999px; font-weight: 700; font-size: 0.8rem; transform: rotate(-4deg);
        font-family: 'Iowan Old Style',Palatino,Georgia,serif; background: ${CARD}; }
      .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px;
        font-size: 0.7rem; font-weight: 600; border: 1px solid ${LINE}; background: #fff; color: ${INK_SOFT}; }
      .qb-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 6px;
        font-size: 0.84rem; font-weight: 600; border: 1.5px solid ${INK}; background: #fff; color: ${INK}; cursor: pointer; }
      .qb-btn:hover { background: #f1ede2; }
      .qb-btn-primary { background: ${INK}; color: #fff; }
      .qb-btn-primary:hover { background: #3a4150; }
      .qb-btn-red { border-color: ${PEN_RED}; color: ${PEN_RED}; }
      .qb-btn-red:hover { background: #fbeae8; }
      .qb-btn-ghost { border-color: transparent; background: transparent; color: ${INK_SOFT}; padding: 6px 8px; }
      .qb-btn-ghost:hover { background: #efeadb; color: ${INK}; }
      .qb-input, .qb-select, .qb-textarea { width: 100%; padding: 7px 10px; border: 1.5px solid ${LINE};
        border-radius: 6px; background: #fff; font-size: 0.88rem; color: ${INK}; }
      .qb-input:focus, .qb-select:focus, .qb-textarea:focus, .folder-tab:focus-visible, .qb-btn:focus-visible {
        outline: 2px solid ${RULE_BLUE}; outline-offset: 1px; }
      .qb-label { display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.08em; color: ${INK_SOFT}; margin-bottom: 4px; }
      .sym-btn { min-width: 28px; height: 28px; border: 1px solid ${LINE}; border-radius: 4px; background: #fff;
        font-size: 0.9rem; cursor: pointer; }
      .sym-btn:hover { background: #eef2f8; border-color: ${RULE_BLUE}; }
      .qb-table { border-collapse: collapse; font-size: 0.82rem; }
      .qb-table th, .qb-table td { border: 1px solid ${MANILA_DEEP}; padding: 4px 8px; text-align: left; vertical-align: top; }
      .qb-table th { background: ${MANILA}; font-weight: 700; }
      .modal-backdrop { position: fixed; inset: 0; background: rgba(30,28,22,0.45); z-index: 40;
        display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 24px 12px; }
      .modal-card { background: ${PAPER}; border-radius: 10px; width: 100%; max-width: 760px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
      @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      @media print { .no-print { display: none !important; } }
      ${PRINT_CSS}
    `}</style>
  );
}

/* ---------------- shared bits ---------------- */
function StatusChip({ status }) {
  const map = {
    polished: { label: "Polished", color: CHALK_GREEN, bg: "#eaf3ec" },
    revise: { label: "Needs revision", color: "#9a6a00", bg: "#fbf3da" },
    retired: { label: "Retired", color: INK_SOFT, bg: "#eeeeea" },
  };
  const m = map[status] || map.polished;
  return <span className="chip" style={{ color: m.color, background: m.bg, borderColor: "transparent" }}>{m.label}</span>;
}

function QuestionAnswerSummary({ q }) {
  if (q.type === "mc") {
    const correct = q.mc.options[q.mc.correct];
    return <span>Key: <b>{String.fromCharCode(65 + q.mc.correct)}</b> — {renderRich(correct)}</span>;
  }
  if (q.type === "numeric") return <span>Key: <b>{q.num.answer || "—"}</b>{q.num.tolerance ? ` ± ${q.num.tolerance}` : ""} {q.num.units}</span>;
  if (q.type === "tf") return <span>Key: <b>{q.tf.answer ? "True" : "False"}</b></span>;
  if (q.type === "matching") return <span>{q.match.pairs.length} pairs</span>;
  if (q.type === "written") return <span>{q.wr.rubric ? <>Rubric: {renderRich(q.wr.rubric)}</> : "No rubric yet"}</span>;
  return null;
}

function LazyThumb({ imageId, getImage }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    getImage(imageId).then(d => { if (alive) setSrc(d); });
    return () => { alive = false; };
  }, [imageId, getImage]);
  if (!src) return <div className="flex items-center justify-center rounded" style={{ width: 84, height: 60, background: "#eef0f3", color: INK_SOFT }}><ImageIcon size={18} /></div>;
  return <img src={src} alt="Question diagram" className="rounded border" style={{ width: 84, height: 60, objectFit: "cover", borderColor: LINE }} />;
}

function StimImage({ imageId, getImage }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    getImage(imageId).then(d => { if (alive) setSrc(d); });
    return () => { alive = false; };
  }, [imageId, getImage]);
  if (!src) return <div className="text-xs italic" style={{ color: INK_SOFT }}>loading diagram…</div>;
  return <img src={src} alt="Shared stimulus diagram" className="rounded border block" style={{ maxWidth: "100%", maxHeight: 240, borderColor: RULE_BLUE }} />;
}

/* Shared rich preview of a question: shared stimulus, diagram, options/answer, notes. */
function QuestionDetail({ q, grp, getImage }) {
  const g = q.groupId && grp ? grp[q.groupId] : null;
  return (
    <div className="text-sm" style={{ color: INK_SOFT }}>
      {g && (g.text || g.imageNote || g.table || g.imageId) && (
        <div className="mb-2 p-2 rounded" style={{ background: "#eef4fb", border: `1px solid ${RULE_BLUE}` }}>
          <span style={{ color: "#2a5d8f", fontWeight: 600 }}>Shared stimulus: </span>
          {g.text}
          {g.imageId ? (
            <div className="mt-2"><StimImage imageId={g.imageId} getImage={getImage} /></div>
          ) : (g.imageNote ? <span className="italic"> [{g.imageNote}]</span> : null)}
          {g.table ? <DataTable table={g.table} /> : null}
        </div>
      )}
      {q.imageId && <div className="mb-2"><StimImage imageId={q.imageId} getImage={getImage} /></div>}
      {q.type === "mc" && (
        <ol className="mt-1 grid gap-1">
          {q.mc.options.map((o, i) => (
            <li key={i} style={{ color: i === q.mc.correct ? CHALK_GREEN : INK_SOFT, fontWeight: i === q.mc.correct ? 700 : 400 }}>
              {String.fromCharCode(65 + i)}. {renderRich(o)} {i === q.mc.correct ? "✓" : ""}
            </li>
          ))}
        </ol>
      )}
      {q.type === "matching" && (
        <ol className="mt-1 grid gap-1">
          {q.match.pairs.map((p, i) => <li key={i}>{renderRich(p.left)} → {renderRich(p.right)}</li>)}
        </ol>
      )}
      <div className="mt-2"><QuestionAnswerSummary q={q} /></div>
      {q.notes && <div className="mt-1" style={{ color: "#9a6a00" }}>Note: {q.notes}</div>}
      {q.imageNote && !q.imageId && <div className="mt-1 italic">Diagram: {q.imageNote}</div>}
    </div>
  );
}

/* ---------------- Bank tab ---------------- */
function BankTab({ questions, groups, courseOptions, onNew, onEdit, onDelete, onDuplicate, onImport, onExport, onSamples, getImage }) {
  const grp = groups || {};
  const [f, setF] = useState({ q: "", course: "all", unit: "all", type: "all", difficulty: "all", status: "active" });
  const [confirmDel, setConfirmDel] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [backupOpen, setBackupOpen] = useState(false);

  const unitOptions = useMemo(() => {
    const s = new Set();
    questions.forEach(q => { if ((f.course === "all" || q.course === f.course) && q.unit) s.add(q.unit); });
    return [...s].sort();
  }, [questions, f.course]);

  const filtered = useMemo(() => {
    const text = f.q.trim().toLowerCase();
    return questions.filter(q => {
      if (f.course !== "all" && q.course !== f.course) return false;
      if (f.unit !== "all" && q.unit !== f.unit) return false;
      if (f.type !== "all" && q.type !== f.type) return false;
      if (f.difficulty !== "all" && q.difficulty !== f.difficulty) return false;
      if (f.status === "active" && q.status === "retired") return false;
      if (f.status !== "active" && f.status !== "all" && q.status !== f.status) return false;
      if (text) {
        const hay = (q.text + " " + q.tags.join(" ") + " " + q.unit + " " + q.course + " " + q.source + " " + q.notes + " " + q.outcome).toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
  }, [questions, f]);

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button className="qb-btn qb-btn-primary" onClick={onNew}><Plus size={15} /> New question</button>
        <button className="qb-btn" onClick={onImport}><Upload size={15} /> Import</button>
        <button className="qb-btn" onClick={() => setBackupOpen(true)}><Download size={15} /> Back up</button>
        <div className="flex-1" />
        <div className="relative" style={{ minWidth: 200 }}>
          <Search size={14} className="absolute" style={{ left: 9, top: 10, color: INK_SOFT }} />
          <input className="qb-input" style={{ paddingLeft: 28 }} placeholder="Search questions…" value={f.q}
            onChange={e => setF({ ...f, q: e.target.value })} aria-label="Search questions" />
        </div>
      </div>

      {/* filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        <select className="qb-select" value={f.course} onChange={e => setF({ ...f, course: e.target.value, unit: "all" })} aria-label="Filter by course">
          <option value="all">All courses</option>
          {courseOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="qb-select" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} aria-label="Filter by unit">
          <option value="all">All units</option>
          {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select className="qb-select" value={f.type} onChange={e => setF({ ...f, type: e.target.value })} aria-label="Filter by type">
          <option value="all">All types</option>
          {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
        <select className="qb-select" value={f.difficulty} onChange={e => setF({ ...f, difficulty: e.target.value })} aria-label="Filter by difficulty">
          <option value="all">Any difficulty</option>
          {DIFFS.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
        </select>
        <select className="qb-select" value={f.status} onChange={e => setF({ ...f, status: e.target.value })} aria-label="Filter by status">
          <option value="active">Active (not retired)</option>
          <option value="revise">Needs revision</option>
          <option value="polished">Polished</option>
          <option value="retired">Retired</option>
          <option value="all">Everything</option>
        </select>
      </div>

      {questions.length === 0 ? (
        <div className="index-card no-rule p-8 text-center max-w-xl mx-auto mt-6">
          <div className="qb-stamp mb-2" style={{ color: INK_SOFT }}>Empty cabinet</div>
          <p className="qb-serif text-lg mb-1">No questions on file yet.</p>
          <p className="text-sm mb-5" style={{ color: INK_SOFT }}>
            Write your first question, load a few samples to see how cards work, or import questions Claude extracted from an old test.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button className="qb-btn qb-btn-primary" onClick={onNew}><Plus size={15} /> Write a question</button>
            <button className="qb-btn" onClick={onSamples}>Load samples</button>
            <button className="qb-btn" onClick={onImport}><Upload size={15} /> Import</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: INK_SOFT }}>Nothing matches those filters.</div>
      ) : (
        <div className="grid gap-3">
          <div className="qb-stamp" style={{ color: INK_SOFT }}>{filtered.length} shown</div>
          {filtered.map(q => (
            <div key={q.id} className="index-card p-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap pb-2" style={{ minHeight: 30 }}>
                    <span className="qb-stamp" style={{ color: PEN_RED }}>{TYPE_META[q.type].short}</span>
                    {q.groupId && <span className="chip" style={{ color: "#2a5d8f", background: "#e8f0f9", borderColor: "transparent" }}><Link2 size={11} /> set</span>}
                    <span className="chip">{q.course || "No course"}{q.unit ? " · " + q.unit : ""}</span>
                    <span className="chip">{q.difficulty}</span>
                    <StatusChip status={q.status} />
                    {q.imageNote && !q.imageId && <span className="chip" style={{ color: "#9a6a00", background: "#fbf3da", borderColor: "transparent" }}><ImageIcon size={11} /> diagram needed</span>}
                  </div>
                  <div className="qb-serif" style={{ fontSize: "0.97rem", lineHeight: 1.45 }}>
                    {renderRich(q.text)}
                  </div>
                  {q.table && <DataTable table={q.table} />}
                  {expanded[q.id] && (
                    <div className="mt-2">
                      <QuestionDetail q={q} grp={grp} getImage={getImage} />
                    </div>
                  )}
                  <div className="qb-stamp mt-2 flex gap-3 flex-wrap" style={{ color: "#9aa1ab" }}>
                    {q.source && <span>src: {q.source}</span>}
                    {q.outcome && <span>outcome: {q.outcome}</span>}
                    <span>used: {niceDate(q.lastUsed)}</span>
                  </div>
                </div>
                {q.imageId && (
                  <div className="flex flex-col items-end gap-2 shrink-0" style={{ position: "relative", zIndex: 1 }}>
                    <LazyThumb imageId={q.imageId} getImage={getImage} />
                  </div>
                )}
              </div>
              <div className="flex gap-1 mt-2 pt-2 flex-wrap" style={{ borderTop: `1px solid ${LINE}` }}>
                <button className="qb-btn qb-btn-ghost" onClick={() => setExpanded(e => ({ ...e, [q.id]: !e[q.id] }))}>
                  <Eye size={14} /> {expanded[q.id] ? "Hide answer" : "Answer"}
                </button>
                <button className="qb-btn qb-btn-ghost" onClick={() => onEdit(q)}><Pencil size={14} /> Edit</button>
                <button className="qb-btn qb-btn-ghost" onClick={() => onDuplicate(q.id)}><Copy size={14} /> Duplicate</button>
                <div className="flex-1" />
                {confirmDel === q.id ? (
                  <>
                    <span className="text-xs self-center" style={{ color: PEN_RED }}>Delete for good?</span>
                    <button className="qb-btn qb-btn-red" onClick={() => { onDelete(q.id); setConfirmDel(null); }}>Yes, delete</button>
                    <button className="qb-btn qb-btn-ghost" onClick={() => setConfirmDel(null)}>Keep</button>
                  </>
                ) : (
                  <button className="qb-btn qb-btn-ghost" onClick={() => setConfirmDel(q.id)} style={{ color: PEN_RED }}>
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {backupOpen && (
        <BackupModal questions={questions} courseOptions={courseOptions} onExport={onExport} onClose={() => setBackupOpen(false)} />
      )}
    </div>
  );
}

/* ---------------- Editor modal ---------------- */
function EditorModal({ draft, courseOptions, onCancel, onSave, getImage, putImage, say, mode = "file" }) {
  const suggest = mode === "suggest";
  const [q, setQ] = useState(draft);
  const [imgPreview, setImgPreview] = useState(null);
  const [busyImg, setBusyImg] = useState(false);
  const textRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    if (q.imageId) getImage(q.imageId).then(d => { if (alive) setImgPreview(d); });
    else setImgPreview(null);
    return () => { alive = false; };
  }, [q.imageId, getImage]);

  const set = (patch) => setQ(prev => ({ ...prev, ...patch }));

  const insertAtCursor = (snippet, cursorBack = 0) => {
    const el = textRef.current;
    if (!el) { set({ text: q.text + snippet }); return; }
    const s = el.selectionStart ?? q.text.length;
    const e = el.selectionEnd ?? q.text.length;
    const next = q.text.slice(0, s) + snippet + q.text.slice(e);
    set({ text: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = s + snippet.length - cursorBack;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleImageFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setBusyImg(true);
    try {
      const dataUrl = await compressImage(file);
      if (dataUrl.length > 4500000) { say("That image is still too large after compression.", "warn"); setBusyImg(false); return; }
      const id = await putImage(dataUrl);
      if (id) set({ imageId: id, imageNote: "" });
    } catch (e) {
      say("Couldn't read that image.", "warn");
    }
    setBusyImg(false);
  };

  const onPaste = (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) { e.preventDefault(); handleImageFile(f); return; }
      }
    }
  };

  const valid = q.text.trim().length > 0 &&
    (q.type !== "mc" || q.mc.options.filter(o => o.trim()).length >= 2) &&
    (q.type !== "matching" || q.match.pairs.filter(p => p.left.trim() && p.right.trim()).length >= 2);

  const save = () => {
    const clean = { ...q };
    clean.text = q.text.trim();
    clean.course = q.course.trim();
    clean.unit = q.unit.trim();
    clean.tags = (Array.isArray(q.tags) ? q.tags.join(",") : String(q.tags || "")).split(",").map(s => s.trim()).filter(Boolean);
    if (clean.type === "mc") {
      const opts = clean.mc.options.map(o => o.trim());
      const keep = opts.map((o, i) => ({ o, i })).filter(x => x.o);
      const newCorrect = keep.findIndex(x => x.i === clean.mc.correct);
      clean.mc = { options: keep.map(x => x.o), correct: newCorrect >= 0 ? newCorrect : 0 };
    }
    if (clean.type === "matching") {
      clean.match = { pairs: clean.match.pairs.filter(p => p.left.trim() && p.right.trim()).map(p => ({ left: p.left.trim(), right: p.right.trim() })) };
    }
    clean.points = 1;
    clean.table = sanitizeTable(clean.table);
    onSave(clean);
  };

  return (
    <div className="modal-backdrop no-print" onPaste={onPaste}>
      <div className="modal-card">
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `2px solid ${MANILA_DEEP}`, background: MANILA, borderRadius: "10px 10px 0 0" }}>
          <div className="qb-stamp" style={{ color: INK }}>{suggest ? "Suggest a question" : (draft.text ? "Edit question" : "New question")}</div>
          <button className="qb-btn qb-btn-ghost" onClick={onCancel} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="p-5 grid gap-4">
          {/* type + difficulty + status */}
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1" style={{ minWidth: 180 }}>
              <label className="qb-label">Type</label>
              <select className="qb-select" value={q.type} onChange={e => set({ type: e.target.value })}>
                {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </select>
            </div>
            <div style={{ width: 150 }}>
              <label className="qb-label">Difficulty</label>
              <select className="qb-select" value={q.difficulty} onChange={e => set({ difficulty: e.target.value })}>
                {DIFFS.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
              </select>
            </div>
            {!suggest && (
              <div style={{ width: 170 }}>
                <label className="qb-label">Status</label>
                <select className="qb-select" value={q.status} onChange={e => set({ status: e.target.value })}>
                  {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* question text */}
          <div>
            <label className="qb-label">Question</label>
            <div className="flex gap-1 flex-wrap mb-1">
              <button className="sym-btn" title="Insert superscript" onClick={() => insertAtCursor("^{}", 1)} style={{ minWidth: 36 }}>x²</button>
              <button className="sym-btn" title="Insert subscript" onClick={() => insertAtCursor("_{}", 1)} style={{ minWidth: 36 }}>x₂</button>
              {SYMBOLS.map(s => <button key={s} className="sym-btn" onClick={() => insertAtCursor(s)}>{s}</button>)}
            </div>
            <textarea ref={textRef} className="qb-textarea" rows={3} value={q.text}
              onChange={e => set({ text: e.target.value })}
              placeholder="Type the question. Use ^{ } and _{ } for super/subscripts — e.g. x^{2}, H_{2}O." />
            {/\^\{|_\{/.test(q.text) && (
              <div className="mt-1 text-sm qb-serif p-2 rounded" style={{ background: "#fff", border: `1px dashed ${RULE_BLUE}` }}>
                Preview: {renderRich(q.text)}
              </div>
            )}
          </div>

          {/* image */}
          <div>
            <label className="qb-label">Diagram / image</label>
            {imgPreview ? (
              <div className="flex items-start gap-3 flex-wrap">
                <img src={imgPreview} alt="Question diagram" className="rounded border" style={{ maxWidth: 260, maxHeight: 180, borderColor: LINE }} />
                <div className="grid gap-2" style={{ minWidth: 200, flex: 1 }}>
                  <input className="qb-input" placeholder="Caption (optional)" value={q.imageCaption} onChange={e => set({ imageCaption: e.target.value })} />
                  <button className="qb-btn qb-btn-red" onClick={() => { rawDel("img:" + q.imageId); set({ imageId: null, imageCaption: "" }); }}>
                    <Trash2 size={14} /> Remove image
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {!suggest && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <button className="qb-btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={busyImg}>
                      <ImageIcon size={15} /> {busyImg ? "Adding…" : "Add image"}
                    </button>
                    <span className="text-xs" style={{ color: INK_SOFT }}>or paste a screenshot anywhere in this window (great for snipping diagrams from old PDFs)</span>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageFile(e.target.files && e.target.files[0])} />
                  </div>
                )}
                <input className="qb-input" placeholder='No image yet? Describe the diagram needed, e.g. "circuit with two resistors in series"' value={q.imageNote} onChange={e => set({ imageNote: e.target.value })} />
              </div>
            )}
          </div>

          {/* data table */}
          <div>
            <label className="qb-label">Data table (optional)</label>
            <TableEditor table={q.table} onChange={(tbl) => set({ table: tbl })} />
          </div>

          {/* type-specific */}
          {q.type === "mc" && (
            <div>
              <label className="qb-label">Options — pick the correct one</label>
              <div className="grid gap-2">
                {q.mc.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="mc-correct" checked={q.mc.correct === i} onChange={() => set({ mc: { ...q.mc, correct: i } })} aria-label={"Mark option " + String.fromCharCode(65 + i) + " correct"} />
                    <span className="qb-stamp" style={{ width: 16 }}>{String.fromCharCode(65 + i)}</span>
                    <input className="qb-input" value={o} onChange={e => {
                      const opts = [...q.mc.options]; opts[i] = e.target.value; set({ mc: { ...q.mc, options: opts } });
                    }} placeholder={"Option " + String.fromCharCode(65 + i)} />
                    {q.mc.options.length > 2 && (
                      <button className="qb-btn qb-btn-ghost" aria-label="Remove option" onClick={() => {
                        const opts = q.mc.options.filter((_, j) => j !== i);
                        let c = q.mc.correct; if (c === i) c = 0; else if (c > i) c -= 1;
                        set({ mc: { options: opts, correct: c } });
                      }}><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              {q.mc.options.length < 6 && (
                <button className="qb-btn qb-btn-ghost mt-2" onClick={() => set({ mc: { ...q.mc, options: [...q.mc.options, ""] } })}>
                  <Plus size={14} /> Add option
                </button>
              )}
            </div>
          )}

          {q.type === "numeric" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="qb-label">Answer</label>
                <input className="qb-input" value={q.num.answer} onChange={e => set({ num: { ...q.num, answer: e.target.value } })} placeholder="e.g. 2.5" />
              </div>
              <div>
                <label className="qb-label">Units (optional)</label>
                <input className="qb-input" value={q.num.units} onChange={e => set({ num: { ...q.num, units: e.target.value } })} placeholder="e.g. m/s" />
              </div>
              <div>
                <label className="qb-label">Tolerance ± (optional)</label>
                <input className="qb-input" value={q.num.tolerance} onChange={e => set({ num: { ...q.num, tolerance: e.target.value } })} placeholder="e.g. 0.1" />
              </div>
            </div>
          )}

          {q.type === "tf" && (
            <div>
              <label className="qb-label">Correct answer</label>
              <div className="flex gap-3">
                {[true, false].map(v => (
                  <label key={String(v)} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="tf" checked={q.tf.answer === v} onChange={() => set({ tf: { answer: v } })} />
                    {v ? "True" : "False"}
                  </label>
                ))}
              </div>
            </div>
          )}

          {q.type === "matching" && (
            <div>
              <label className="qb-label">Pairs (left item → correct match)</label>
              <div className="grid gap-2">
                {q.match.pairs.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className="qb-input" value={p.left} placeholder="Left item" onChange={e => {
                      const pairs = [...q.match.pairs]; pairs[i] = { ...pairs[i], left: e.target.value }; set({ match: { pairs } });
                    }} />
                    <span style={{ color: INK_SOFT }}>→</span>
                    <input className="qb-input" value={p.right} placeholder="Its match" onChange={e => {
                      const pairs = [...q.match.pairs]; pairs[i] = { ...pairs[i], right: e.target.value }; set({ match: { pairs } });
                    }} />
                    {q.match.pairs.length > 2 && (
                      <button className="qb-btn qb-btn-ghost" aria-label="Remove pair" onClick={() => set({ match: { pairs: q.match.pairs.filter((_, j) => j !== i) } })}><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button className="qb-btn qb-btn-ghost mt-2" onClick={() => set({ match: { pairs: [...q.match.pairs, { left: "", right: "" }] } })}>
                <Plus size={14} /> Add pair
              </button>
              <p className="text-xs mt-1" style={{ color: INK_SOFT }}>The right column is shuffled automatically on the printed test.</p>
            </div>
          )}

          {q.type === "written" && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <label className="qb-label">Answer lines</label>
                <input className="qb-input" type="number" min="0" max="30" value={q.wr.lines} onChange={e => set({ wr: { ...q.wr, lines: Number(e.target.value) } })} />
              </div>
              <div className="md:col-span-3">
                <label className="qb-label">Rubric / expected answer (shows on the key)</label>
                <textarea className="qb-textarea" rows={2} value={q.wr.rubric} onChange={e => set({ wr: { ...q.wr, rubric: e.target.value } })} />
              </div>
            </div>
          )}

          {/* metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2" style={{ borderTop: `1px dashed ${LINE}` }}>
            <div>
              <label className="qb-label">Course</label>
              <input className="qb-input" list="course-list" value={q.course} onChange={e => set({ course: e.target.value })} placeholder="e.g. Science 9" />
              <datalist id="course-list">{courseOptions.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="qb-label">Unit / topic</label>
              <input className="qb-input" value={q.unit} onChange={e => set({ unit: e.target.value })} placeholder="e.g. Electricity" />
            </div>
            {!suggest && (
              <div>
                <label className="qb-label">Outcome (optional)</label>
                <input className="qb-input" value={q.outcome} onChange={e => set({ outcome: e.target.value })} placeholder="e.g. SC9-E2" />
              </div>
            )}
            {!suggest && (
              <div>
                <label className="qb-label">Source</label>
                <input className="qb-input" value={q.source} onChange={e => set({ source: e.target.value })} placeholder="e.g. J. Peterson 2019" />
              </div>
            )}
            <div className="col-span-2">
              <label className="qb-label">Tags (comma separated)</label>
              <input className="qb-input" value={Array.isArray(q.tags) ? q.tags.join(", ") : q.tags} onChange={e => set({ tags: e.target.value })} placeholder="ohms law, circuits" />
            </div>
            {!suggest ? (
              <div className="col-span-2">
                <label className="qb-label">Notes to self</label>
                <input className="qb-input" value={q.notes} onChange={e => set({ notes: e.target.value })} placeholder='e.g. "distractor C too obvious — rewrite"' />
              </div>
            ) : (
              <div className="col-span-2 text-xs" style={{ color: INK_SOFT, alignSelf: "center" }}>
                Submitting opens a pre-filled GitHub issue for a maintainer to review. Nothing is published until it's approved.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
          <button className="qb-btn" onClick={onCancel}>Cancel</button>
          <button className="qb-btn qb-btn-primary" onClick={save} disabled={!valid} style={{ opacity: valid ? 1 : 0.45 }}>
            {suggest ? <><Send size={15} /> Submit for approval</> : <><Check size={15} /> File this question</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Import modal ---------------- */
function BackupModal({ questions, courseOptions, onClose, onExport }) {
  const [filter, setFilter] = useState({ course: "all", unit: "all", type: "all", difficulty: "all", status: "all" });
  const units = useMemo(() => {
    const s = new Set();
    questions.forEach(q => { if ((filter.course === "all" || q.course === filter.course) && q.unit) s.add(q.unit); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [questions, filter.course]);
  const matchCount = useMemo(() => questions.filter(q =>
    (filter.course === "all" || q.course === filter.course) &&
    (filter.unit === "all" || q.unit === filter.unit) &&
    (filter.type === "all" || q.type === filter.type) &&
    (filter.difficulty === "all" || q.difficulty === filter.difficulty) &&
    (filter.status === "all" || q.status === filter.status)
  ).length, [questions, filter]);
  const setK = (k, v) => setFilter(f => ({ ...f, [k]: v, ...(k === "course" ? { unit: "all" } : {}) }));
  const doFull = () => { onExport({ all: true }); onClose(); };
  const doSelected = () => { if (matchCount) { onExport({ all: false, filter }); onClose(); } };

  return (
    <div className="modal-backdrop no-print">
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `2px solid ${MANILA_DEEP}`, background: MANILA, borderRadius: "10px 10px 0 0" }}>
          <div className="qb-stamp" style={{ color: INK }}>Back up questions</div>
          <button className="qb-btn qb-btn-ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-5 grid gap-4">
          <div className="index-card p-4">
            <div className="qb-stamp mb-1" style={{ color: PEN_RED }}>The safe choice</div>
            <p className="text-sm" style={{ color: INK }}>
              Download <b>everything</b> — all {questions.length} question{questions.length === 1 ? "" : "s"}, diagrams, question sets, saved tests, and settings — in one file. This is the full restore point; keep a recent copy in your folder.
            </p>
            <button className="qb-btn qb-btn-primary mt-3" onClick={doFull}>
              <Download size={15} /> Download everything
            </button>
          </div>

          <div className="flex items-center gap-3" style={{ color: INK_SOFT }}>
            <div style={{ flex: 1, height: 1, background: LINE }} />
            <span className="qb-stamp">or export a selection</span>
            <div style={{ flex: 1, height: 1, background: LINE }} />
          </div>

          <div className="grid gap-2">
            <p className="text-xs" style={{ color: INK_SOFT }}>Pick which questions to export (great for sharing a unit with a colleague). Saved tests aren't included in a selection.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="qb-label">Course</label>
                <select className="qb-select" value={filter.course} onChange={e => setK("course", e.target.value)}>
                  <option value="all">All courses</option>
                  {courseOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="qb-label">Unit</label>
                <select className="qb-select" value={filter.unit} onChange={e => setK("unit", e.target.value)}>
                  <option value="all">All units</option>
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="qb-label">Type</label>
                <select className="qb-select" value={filter.type} onChange={e => setK("type", e.target.value)}>
                  <option value="all">All types</option>
                  {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                </select>
              </div>
              <div>
                <label className="qb-label">Difficulty</label>
                <select className="qb-select" value={filter.difficulty} onChange={e => setK("difficulty", e.target.value)}>
                  <option value="all">Any difficulty</option>
                  {DIFFS.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="qb-label">Status</label>
                <select className="qb-select" value={filter.status} onChange={e => setK("status", e.target.value)}>
                  <option value="all">Any status</option>
                  <option value="polished">Polished</option>
                  <option value="revise">Needs revision</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
              <span className="text-sm" style={{ color: matchCount ? CHALK_GREEN : PEN_RED }}>
                {matchCount} question{matchCount === 1 ? "" : "s"} match
              </span>
              <button className="qb-btn" onClick={doSelected} disabled={!matchCount} style={{ opacity: matchCount ? 1 : 0.45 }}>
                <Download size={15} /> Download selected
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose, onImport, say }) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      say("Couldn't access the clipboard — the prompt is shown below, copy it manually.", "warn");
    }
  };

  const onFile = (f) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ""));
    r.readAsText(f);
  };

  return (
    <div className="modal-backdrop no-print">
      <div className="modal-card">
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `2px solid ${MANILA_DEEP}`, background: MANILA, borderRadius: "10px 10px 0 0" }}>
          <div className="qb-stamp" style={{ color: INK }}>Import questions</div>
          <button className="qb-btn qb-btn-ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-5 grid gap-4">
          <div className="index-card p-4">
            <div className="qb-stamp mb-1" style={{ color: PEN_RED }}>The fast way to digitize old tests</div>
            <ol className="text-sm grid gap-1 mt-2" style={{ color: INK }}>
              <li>1. Copy the conversion prompt below.</li>
              <li>2. Start a Claude chat, attach an old test (Word, PDF, or a photo), and paste the prompt.</li>
              <li>3. Paste the JSON Claude returns into the box here and import.</li>
            </ol>
            <button className="qb-btn mt-3" onClick={copyPrompt}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy conversion prompt"}
            </button>
            <p className="text-xs mt-2" style={{ color: INK_SOFT }}>
              Importing a full backup file restores everything — questions, diagrams, question sets, and saved tests.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="qb-label" style={{ marginBottom: 0 }}>Paste JSON (or a full backup file)</label>
              <button className="qb-btn qb-btn-ghost" onClick={() => fileRef.current && fileRef.current.click()}>
                <Upload size={14} /> Choose file
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json,.txt" className="hidden" onChange={e => onFile(e.target.files && e.target.files[0])} />
            </div>
            <textarea className="qb-textarea" rows={8} value={text} onChange={e => setText(e.target.value)}
              placeholder='[ { "type": "mc", "question": "…", "options": ["…"], "answerIndex": 0, … } ]' style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: "0.78rem" }} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
          <button className="qb-btn" onClick={onClose}>Cancel</button>
          <button className="qb-btn qb-btn-primary" disabled={!text.trim()} style={{ opacity: text.trim() ? 1 : 0.45 }}
            onClick={async () => { const ok = await onImport(text); if (ok) onClose(); }}>
            <Upload size={15} /> Import
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Build tab ---------------- */
function BuildTab({ questions, groups, courseOptions, settings, onFinalize, editTest, onClearEdit, getImage, say }) {
  const [f, setF] = useState({ q: "", course: "all", unit: "all", type: "all", difficulty: "all", freshOnly: false });
  const [selected, setSelected] = useState([]);
  const [peek, setPeek] = useState(null);          // question id currently expanded for preview
  const togglePeek = (id) => setPeek(p => (p === id ? null : id));
  const [carry, setCarry] = useState(null); // { id, seed, createdAt } when editing an existing test
  const [meta, setMeta] = useState({
    title: "Unit Test", courseLabel: "", teacher: settings.teacher || "", dateLabel: "",
    instructions: "", twoVersions: false, shuffleMC: true, shuffleOrder: true,
    layoutMode: "standard", paper: "letter",
  });

  // Load a saved test for editing when one is handed in.
  useEffect(() => {
    if (!editTest) return;
    const ids = (editTest.questionIds || []).filter(id => questions.some(q => q.id === id));
    setSelected(ids);
    const dropped = (editTest.questionIds || []).length - ids.length;
    if (dropped > 0) say(`${dropped} question${dropped === 1 ? "" : "s"} no longer in the bank — dropped from this test.`, "warn");
    const layoutMode = editTest.optimize
      ? (editTest.twoVersions ? "opt-ab" : "opt-a")
      : (editTest.twoVersions ? "ab" : "standard");
    setMeta({
      title: editTest.title || "Test",
      courseLabel: editTest.courseLabel || "",
      teacher: editTest.teacher || settings.teacher || "",
      dateLabel: editTest.dateLabel || "",
      instructions: editTest.instructions || "",
      twoVersions: !!editTest.twoVersions,
      shuffleMC: editTest.shuffleMC !== false,
      shuffleOrder: editTest.shuffleOrder !== false,
      layoutMode,
      paper: editTest.paper || "letter",
    });
    setCarry({ id: editTest.id, seed: editTest.seed, createdAt: editTest.createdAt });
  }, [editTest]);

  const clearEdit = () => {
    setCarry(null);
    setSelected([]);
    setMeta(m => ({ ...m, title: "Unit Test", instructions: "", dateLabel: "" }));
    if (onClearEdit) onClearEdit();
  };
  const [randomN, setRandomN] = useState(5);

  useEffect(() => { setMeta(m => ({ ...m, teacher: m.teacher || settings.teacher || "" })); }, [settings.teacher]);

  const unitOptions = useMemo(() => {
    const s = new Set();
    questions.forEach(q => { if ((f.course === "all" || q.course === f.course) && q.unit) s.add(q.unit); });
    return [...s].sort();
  }, [questions, f.course]);

  const pool = useMemo(() => {
    const text = f.q.trim().toLowerCase();
    return questions.filter(q => {
      if (q.status === "retired") return false;
      if (selected.includes(q.id)) return false;
      if (f.course !== "all" && q.course !== f.course) return false;
      if (f.unit !== "all" && q.unit !== f.unit) return false;
      if (f.type !== "all" && q.type !== f.type) return false;
      if (f.difficulty !== "all" && q.difficulty !== f.difficulty) return false;
      if (f.freshOnly && monthsAgo(q.lastUsed) < 6) return false;
      if (text) {
        const hay = (q.text + " " + q.tags.join(" ") + " " + q.unit + " " + q.course).toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
  }, [questions, f, selected]);

  const selQs = selected.map(id => questions.find(q => q.id === id)).filter(Boolean);
  const grp = groups || {};
  const qById = useMemo(() => { const m = {}; questions.forEach(q => m[q.id] = q); return m; }, [questions]);
  const membersOf = useCallback((gid) => questions.filter(q => q.groupId === gid).map(q => q.id), [questions]);

  // Add a question; if it belongs to a set, add the whole set contiguously at the end.
  const addQuestion = useCallback((q) => {
    if (q.groupId) {
      const members = membersOf(q.groupId);
      const without = selected.filter(id => !members.includes(id));
      setSelected([...without, ...members]);
    } else if (!selected.includes(q.id)) {
      setSelected([...selected, q.id]);
    }
  }, [selected, membersOf]);

  // Collapse grouped questions in the pool to one representative card per set.
  const poolDisplay = useMemo(() => {
    const seen = new Set();
    return pool.filter(q => {
      if (!q.groupId) return true;
      if (seen.has(q.groupId)) return false;
      seen.add(q.groupId); return true;
    });
  }, [pool]);

  // Build display blocks: consecutive same-group ids = one locked block.
  const blocks = useMemo(() => {
    const out = [];
    selected.forEach(id => {
      const q = qById[id]; if (!q) return;
      const last = out[out.length - 1];
      if (q.groupId && last && last.groupId === q.groupId) last.ids.push(id);
      else out.push({ groupId: q.groupId || null, ids: [id] });
    });
    return out;
  }, [selected, qById]);

  const moveBlock = (bi, dir) => {
    const j = bi + dir;
    if (j < 0 || j >= blocks.length) return;
    const arr = [...blocks];
    [arr[bi], arr[j]] = [arr[j], arr[bi]];
    setSelected(arr.flatMap(b => b.ids));
  };
  const removeBlock = (b) => setSelected(selected.filter(id => !b.ids.includes(id)));

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected];
    [next[i], next[j]] = [next[j], next[i]];
    setSelected(next);
  };

  const addRandom = () => {
    const n = Math.min(Number(randomN) || 0, poolDisplay.length);
    if (!n) { say("Nothing in the pool to draw from.", "warn"); return; }
    const rng = mulberry32(Date.now() % 100000);
    const picks = shuffleSeeded(poolDisplay, rng).slice(0, n);
    let next = [...selected];
    picks.forEach(q => {
      if (q.groupId) {
        const members = membersOf(q.groupId);
        next = [...next.filter(id => !members.includes(id)), ...members];
      } else if (!next.includes(q.id)) next.push(q.id);
    });
    setSelected(next);
  };

  const finalize = () => {
    if (!selected.length) { say("Pick at least one question first.", "warn"); return; }
    onFinalize({
      ...meta,
      title: meta.title.trim() || "Test",
      courseLabel: meta.courseLabel.trim() || (f.course !== "all" ? f.course : ""),
      dateLabel: meta.dateLabel.trim(),
      optimize: meta.layoutMode === "opt-a" || meta.layoutMode === "opt-ab",
      paper: meta.paper || "letter",
      questionIds: selected,
      id: carry ? carry.id : undefined,
      createdAt: carry ? carry.createdAt : undefined,
      seed: carry && carry.seed ? carry.seed : Math.floor(Math.random() * 1e9) + 1,
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* pool */}
      <div className="flex flex-col min-h-0">
        <div className="qb-stamp mb-2" style={{ color: INK_SOFT }}>Question pool — {poolDisplay.length} available</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select className="qb-select" value={f.course} onChange={e => setF({ ...f, course: e.target.value, unit: "all" })} aria-label="Pool course filter">
            <option value="all">All courses</option>
            {courseOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="qb-select" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} aria-label="Pool unit filter">
            <option value="all">All units</option>
            {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className="qb-select" value={f.type} onChange={e => setF({ ...f, type: e.target.value })} aria-label="Pool type filter">
            <option value="all">All types</option>
            {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
          </select>
          <select className="qb-select" value={f.difficulty} onChange={e => setF({ ...f, difficulty: e.target.value })} aria-label="Pool difficulty filter">
            <option value="all">Any difficulty</option>
            {DIFFS.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <input className="qb-input" style={{ maxWidth: 220 }} placeholder="Search pool…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} aria-label="Search pool" />
          <label className="flex items-center gap-1 text-sm" style={{ color: INK_SOFT }}>
            <input type="checkbox" checked={f.freshOnly} onChange={e => setF({ ...f, freshOnly: e.target.checked })} />
            Hide used in last 6 months
          </label>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <button className="qb-btn" onClick={addRandom}><Dice5 size={15} /> Add</button>
          <input className="qb-input" type="number" min="1" style={{ width: 70 }} value={randomN} onChange={e => setRandomN(e.target.value)} aria-label="How many random questions" />
          <span className="text-sm" style={{ color: INK_SOFT }}>random from this pool</span>
        </div>
        <div className="grid gap-2 min-h-0" style={{ flex: 1, minHeight: 420, overflowY: "auto", paddingRight: 4, alignContent: "start", gridAutoRows: "max-content" }}>
          {poolDisplay.length === 0 ? (
            <div className="text-sm py-6 text-center" style={{ color: INK_SOFT }}>Pool is empty — loosen the filters or add questions in the Bank.</div>
          ) : poolDisplay.map(q => {
            const setSize = q.groupId ? membersOf(q.groupId).length : 0;
            return (
            <div key={q.id} className="index-card p-3 pt-2 flex items-start gap-2" style={q.groupId ? { borderLeft: `3px solid ${RULE_BLUE}` } : null}>
              <div className="flex-1 min-w-0">
                <div className="flex gap-2 items-center flex-wrap" style={{ minHeight: 26, paddingBottom: 10 }}>
                  <span className="qb-stamp" style={{ color: PEN_RED }}>{TYPE_META[q.type].short}</span>
                  {q.groupId && <span className="chip" style={{ color: "#2a5d8f", background: "#e8f0f9", borderColor: "transparent" }}><Link2 size={11} /> set of {setSize}</span>}
                  <span className="chip">{q.unit || q.course}</span>
                  <span className="chip">{q.difficulty}</span>
                  {q.status === "revise" && <StatusChip status="revise" />}
                  <span className="qb-stamp" style={{ color: "#9aa1ab" }}>used {niceDate(q.lastUsed)}</span>
                </div>
                {q.groupId && grp[q.groupId] && grp[q.groupId].text && (
                  <div className="text-xs italic mb-1" style={{ color: INK_SOFT }}>Shared: {grp[q.groupId].text.slice(0, 90)}{grp[q.groupId].text.length > 90 ? "…" : ""}</div>
                )}
                <div className="text-sm qb-serif flex items-start gap-1" style={{ lineHeight: 1.4, cursor: "pointer" }} onClick={() => togglePeek(q.id)} role="button" title={peek === q.id ? "Hide preview" : "Click to preview"}>
                  <ChevronDown size={15} className="shrink-0" style={{ color: "#9aa1ab", marginTop: 2, transform: peek === q.id ? "none" : "rotate(-90deg)", transition: "transform 0.12s" }} />
                  <span className="min-w-0">{renderRich(q.text)}</span>
                </div>
                {peek === q.id && (
                  <div className="mt-2 pl-1">
                    <QuestionDetail q={q} grp={grp} getImage={getImage} />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button className="qb-btn qb-btn-ghost" onClick={() => addQuestion(q)} aria-label={q.groupId ? "Add this set to test" : "Add to test"}><Plus size={16} /></button>
              </div>
            </div>
          );})}
        </div>
      </div>

      {/* the test being built */}
      <div>
        <div className="qb-stamp mb-2" style={{ color: INK_SOFT }}>{carry ? "Editing saved test" : "This test"} — {selQs.length} question{selQs.length === 1 ? "" : "s"}</div>
        {carry && (
          <div className="flex items-center gap-2 mb-2 p-2 rounded flex-wrap" style={{ background: "#eef4fb", border: `1px solid ${RULE_BLUE}` }}>
            <Pencil size={14} style={{ color: "#2a5d8f" }} />
            <span className="text-sm" style={{ color: "#2a5d8f" }}>Editing <b>{meta.title}</b> — saving will update this test.</span>
            <div className="flex-1" />
            <button className="qb-btn qb-btn-ghost" onClick={clearEdit}>Start a new test instead</button>
          </div>
        )}
        <div className="index-card p-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="qb-label">Test title</label>
              <input className="qb-input" value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} />
            </div>
            <div>
              <label className="qb-label">Course line</label>
              <input className="qb-input" value={meta.courseLabel} placeholder={f.course !== "all" ? f.course : "e.g. Science 9"} onChange={e => setMeta({ ...meta, courseLabel: e.target.value })} />
            </div>
            <div>
              <label className="qb-label">Date line</label>
              <input className="qb-input" value={meta.dateLabel} placeholder="e.g. June 12, 2026 (blank = students fill in)" onChange={e => setMeta({ ...meta, dateLabel: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="qb-label">Instructions (optional, shown under the header)</label>
              <input className="qb-input" value={meta.instructions} placeholder="e.g. Calculators permitted. Answer all questions." onChange={e => setMeta({ ...meta, instructions: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2 pt-1">
            <div className="flex gap-3 flex-wrap items-center text-sm" style={{ color: INK }}>
              <label className="qb-label" style={{ marginBottom: 0 }}>Versions &amp; layout</label>
              <select className="qb-select" style={{ width: "auto" }} value={meta.layoutMode}
                onChange={e => {
                  const v = e.target.value;
                  setMeta({ ...meta, layoutMode: v, twoVersions: v === "ab" || v === "opt-ab" });
                }} aria-label="Versions and layout">
                <option value="standard">Single version (A)</option>
                <option value="ab">Two versions (A &amp; B)</option>
                <option value="opt-a">Optimized length — Version A</option>
                <option value="opt-ab">Optimized length — Versions A &amp; B</option>
              </select>
              <label className="qb-label" style={{ marginBottom: 0 }}>Paper</label>
              <select className="qb-select" style={{ width: "auto" }} value={meta.paper} onChange={e => setMeta({ ...meta, paper: e.target.value })} aria-label="Paper size">
                {Object.keys(PAPER_SIZES).map(k => <option key={k} value={k}>{PAPER_SIZES[k].label}</option>)}
              </select>
            </div>
            {(meta.layoutMode === "opt-a" || meta.layoutMode === "opt-ab") && (
              <p className="text-xs" style={{ color: CHALK_GREEN }}>
                Questions will be reordered within each part to pack the fewest pages (sets stay together). You'll see the page count in the print preview.
              </p>
            )}
            <div className="flex gap-4 flex-wrap text-sm" style={{ color: INK }}>
              <label className="flex items-center gap-1"><input type="checkbox" checked={meta.shuffleMC} onChange={e => setMeta({ ...meta, shuffleMC: e.target.checked })} /> Shuffle MC answer order</label>
              {meta.layoutMode === "ab" && (
                <label className="flex items-center gap-1"><input type="checkbox" checked={meta.shuffleOrder} onChange={e => setMeta({ ...meta, shuffleOrder: e.target.checked })} /> B reorders questions</label>
              )}
            </div>
          </div>

          <div className="grid gap-2 pt-2" style={{ borderTop: `1px dashed ${LINE}` }}>
            {blocks.length === 0 ? (
              <div className="text-sm py-4 text-center" style={{ color: INK_SOFT }}>Add questions from the pool — they'll be grouped by type and numbered automatically. Question sets stay locked together.</div>
            ) : blocks.map((b, bi) => {
              const bqs = b.ids.map(id => qById[id]).filter(Boolean);
              const controls = (
                <div className="flex items-center gap-1 shrink-0">
                  <button className="qb-btn qb-btn-ghost" onClick={() => moveBlock(bi, -1)} aria-label="Move up"><ChevronUp size={16} /></button>
                  <button className="qb-btn qb-btn-ghost" onClick={() => moveBlock(bi, 1)} aria-label="Move down"><ChevronDown size={16} /></button>
                  <button className="qb-btn qb-btn-ghost" style={{ color: PEN_RED }} onClick={() => removeBlock(b)} aria-label="Remove"><X size={16} /></button>
                </div>
              );
              if (b.groupId) {
                return (
                  <div key={b.groupId} className="rounded p-2 min-w-0" style={{ background: "#eef4fb", border: `1.5px solid ${RULE_BLUE}` }}>
                    <div className="flex items-center gap-2 mb-1 min-w-0">
                      <span className="chip shrink-0" style={{ color: "#2a5d8f", background: "#fff", borderColor: RULE_BLUE }}><Link2 size={11} /> Set ({bqs.length})</span>
                      <span className="text-xs flex-1 min-w-0 truncate italic" style={{ color: INK_SOFT }}>{grp[b.groupId] && grp[b.groupId].text ? grp[b.groupId].text : "shared stimulus"}</span>
                      {controls}
                    </div>
                    {bqs.map(q => (
                      <div key={q.id}>
                        <div className="flex items-center gap-2 px-2 py-1 min-w-0" style={{ cursor: "pointer" }} onClick={() => togglePeek(q.id)} role="button" title={peek === q.id ? "Hide preview" : "Click to preview"}>
                          <span className="qb-stamp shrink-0" style={{ color: PEN_RED, width: 38 }}>{TYPE_META[q.type].short}</span>
                          <span className={"text-sm flex-1 min-w-0 qb-serif " + (peek === q.id ? "" : "truncate")}>{q.text.replace(/\^\{|\}_\{|\}|_\{/g, "")}</span>
                          <ChevronDown size={14} className="shrink-0" style={{ color: "#9aa1ab", transform: peek === q.id ? "none" : "rotate(-90deg)", transition: "transform 0.12s" }} />
                        </div>
                        {peek === q.id && (
                          <div className="px-2 pb-2"><QuestionDetail q={q} grp={grp} getImage={getImage} /></div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
              const q = bqs[0];
              return (
                <div key={q.id} className="rounded min-w-0" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
                  <div className="flex items-center gap-2 p-2 min-w-0">
                    <span className="qb-stamp shrink-0" style={{ color: PEN_RED, width: 38 }}>{TYPE_META[q.type].short}</span>
                    <span className={"text-sm flex-1 min-w-0 qb-serif " + (peek === q.id ? "" : "truncate")} style={{ cursor: "pointer" }} onClick={() => togglePeek(q.id)} role="button" title={peek === q.id ? "Hide preview" : "Click to preview"}>{q.text.replace(/\^\{|\}_\{|\}|_\{/g, "")}</span>
                    {controls}
                  </div>
                  {peek === q.id && (
                    <div className="px-2 pb-2" style={{ borderTop: `1px solid ${LINE}` }}>
                      <div className="pt-2"><QuestionDetail q={q} grp={grp} getImage={getImage} /></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button className="qb-btn qb-btn-primary justify-center" onClick={finalize} disabled={!selQs.length} style={{ opacity: selQs.length ? 1 : 0.45 }}>
            <Printer size={15} /> {carry ? "Update test" : "Preview"} &amp; print
          </button>
          <p className="text-xs" style={{ color: INK_SOFT }}>
            Finalizing saves the test and stamps each question's last-used date, so next time you can filter for fresh ones.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Saved tests tab ---------------- */
function TestsTab({ tests, questionsById, onOpen, onEdit, onExportTest, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(null);
  if (!tests.length) {
    return <div className="text-center py-12 text-sm" style={{ color: INK_SOFT }}>No saved tests yet — build one and it'll be filed here for reprinting.</div>;
  }
  return (
    <div className="grid gap-3 max-w-2xl">
      {tests.map(t => {
        const live = t.questionIds.filter(id => questionsById[id]).length;
        return (
          <div key={t.id} className="index-card no-rule p-3 pt-2 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0" style={{ paddingTop: 6 }}>
              <div className="qb-serif font-bold">{t.title}</div>
              <div className="qb-stamp mt-1" style={{ color: INK_SOFT }}>
                {t.courseLabel || "—"} · {live}/{t.questionIds.length} questions · made {niceDate(t.createdAt)}{t.twoVersions ? " · A/B" : ""}{t.optimize ? " · optimized" : ""}
              </div>
            </div>
            <button className="qb-btn" onClick={() => onEdit(t)}><Pencil size={14} /> Edit</button>
            <button className="qb-btn" onClick={() => onOpen(t)}><Printer size={15} /> Open</button>
            <button className="qb-btn" onClick={() => onExportTest(t)} title="Download this test with its questions"><Download size={14} /> Export</button>
            {confirmDel === t.id ? (
              <>
                <button className="qb-btn qb-btn-red" onClick={() => { onDelete(t.id); setConfirmDel(null); }}>Delete</button>
                <button className="qb-btn qb-btn-ghost" onClick={() => setConfirmDel(null)}>Keep</button>
              </>
            ) : (
              <button className="qb-btn qb-btn-ghost" style={{ color: PEN_RED }} onClick={() => setConfirmDel(t.id)} aria-label="Delete test"><Trash2 size={15} /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Settings tab ---------------- */
function SettingsTab({ settings, onSave, onWipe, questionsCount, submissions, admin, onUnlock, onApprove, onReject, onClearReviewed, onImport, onSyncPublished, onExportSeed }) {
  const [local, setLocal] = useState(settings);
  const [newCourse, setNewCourse] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  useEffect(() => setLocal(settings), [settings]);

  return (
    <div className="max-w-xl grid gap-5">
      <div className="index-card p-4 grid gap-3">
        <div className="qb-stamp" style={{ color: PEN_RED, marginTop: 2 }}>Defaults</div>
        <div>
          <label className="qb-label">Teacher name (appears on test headers)</label>
          <input className="qb-input" value={local.teacher} onChange={e => setLocal({ ...local, teacher: e.target.value })} placeholder="e.g. Ms. Nguyen" />
        </div>
        <div>
          <label className="qb-label">School (optional)</label>
          <input className="qb-input" value={local.school} onChange={e => setLocal({ ...local, school: e.target.value })} placeholder="e.g. Bowness High School" />
        </div>
        <div>
          <label className="qb-label">Courses</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {local.courses.map(c => (
              <span key={c} className="chip">{c}
                <button onClick={() => setLocal({ ...local, courses: local.courses.filter(x => x !== c) })} aria-label={"Remove " + c} style={{ color: PEN_RED, marginLeft: 2 }}>×</button>
              </span>
            ))}
            {!local.courses.length && <span className="text-xs" style={{ color: INK_SOFT }}>Courses are also added automatically when you file questions.</span>}
          </div>
          <div className="flex gap-2">
            <input className="qb-input" value={newCourse} onChange={e => setNewCourse(e.target.value)} placeholder="Add a course" />
            <button className="qb-btn" onClick={() => {
              const c = newCourse.trim();
              if (c && !local.courses.includes(c)) setLocal({ ...local, courses: [...local.courses, c].sort() });
              setNewCourse("");
            }}><Plus size={15} /></button>
          </div>
        </div>
        <button className="qb-btn qb-btn-primary" onClick={() => onSave(local)} style={{ justifySelf: "start" }}><Check size={15} /> Save settings</button>
      </div>

      <div className="index-card p-4 grid gap-2">
        <div className="qb-stamp" style={{ color: PEN_RED, marginTop: 2 }}>Housekeeping</div>
        <p className="text-sm" style={{ color: INK_SOFT }}>
          Your bank lives in this browser's saved storage on this computer. <b>Back up</b> on the Bank tab exports <b>everything</b> — questions, diagrams, question sets, saved tests, and settings — into one file. Re-importing that file restores it all, so keep a recent copy in your folder.
        </p>
        {confirmWipe ? (
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm" style={{ color: PEN_RED }}>Permanently delete all {questionsCount} questions and every saved test?</span>
            <button className="qb-btn qb-btn-red" onClick={() => { onWipe(); setConfirmWipe(false); }}>Yes, empty the cabinet</button>
            <button className="qb-btn qb-btn-ghost" onClick={() => setConfirmWipe(false)}>Cancel</button>
          </div>
        ) : (
          <button className="qb-btn qb-btn-red" style={{ justifySelf: "start" }} onClick={() => setConfirmWipe(true)}>
            <Trash2 size={15} /> Delete all data
          </button>
        )}
      </div>

      {/* Published bank */}
      <div className="index-card p-4 grid gap-2">
        <div className="qb-stamp" style={{ color: PEN_RED, marginTop: 2 }}>Published bank</div>
        <p className="text-sm" style={{ color: INK_SOFT }}>
          New visitors start from the published bank in <code>public/seed-bank.json</code> (questions, diagrams, and question-sets). Pull in anything newly published, or export your current bank to that file and commit it to publish to everyone.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button className="qb-btn" onClick={onSyncPublished}><RefreshCw size={15} /> Sync published questions</button>
          <button className="qb-btn" onClick={onExportSeed}><Download size={15} /> Export seed-bank.json</button>
        </div>
      </div>

      {/* Moderation queue */}
      <ModerationPanel
        submissions={submissions}
        admin={admin}
        onUnlock={onUnlock}
        onApprove={onApprove}
        onReject={onReject}
        onClearReviewed={onClearReviewed}
        onImport={onImport}
      />
    </div>
  );
}

/* ---------------- Print view ---------------- */
/* Hidden layer that renders every test item at the printable width and reports pixel heights. */
function MeasureLayer({ doc, images, widthPx, fontPt, onMeasured }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current; if (!root) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const map = {};
      root.querySelectorAll("[data-mid]").forEach(el => { map[el.getAttribute("data-mid")] = el.getBoundingClientRect().height; });
      onMeasured(map);
    };
    const imgs = Array.from(root.querySelectorAll("img"));
    if (imgs.length === 0) { measure(); return () => { cancelled = true; }; }
    let pending = imgs.length;
    const done = () => { pending -= 1; if (pending <= 0) measure(); };
    imgs.forEach(img => { if (img.complete) done(); else { img.addEventListener("load", done); img.addEventListener("error", done); } });
    const fallback = setTimeout(measure, 700);
    return () => { cancelled = true; clearTimeout(fallback); };
  }, [doc, widthPx, fontPt, images, onMeasured]);

  return (
    <div ref={ref} aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, width: widthPx, opacity: 0, pointerEvents: "none" }}>
      <div className="exam-doc" style={{ width: widthPx, maxWidth: "none", padding: 0, fontSize: fontPt + "pt" }}>
        {doc.sections.map(sec => (
          <div key={sec.type}>
            <div data-mid={"h-" + sec.type} className="ex-sec-h">Part {sec.letter} — {TYPE_META[sec.type].label}</div>
            <div data-mid={"i-" + sec.type} className="ex-sec-i">{SECTION_TEXT[sec.type]}</div>
            {sec.items.map(item => (
              <div data-mid={"q-" + item.q.id} key={item.q.id}>
                <TestItem item={item} images={images} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintView({ test, questionsById, groups, settings, getImage, onClose }) {
  const [docMode, setDocMode] = useState("A-test"); // A-test | A-key | B-test | B-key
  const [images, setImages] = useState({});
  const [ready, setReady] = useState(false);
  const [margin, setMargin] = useState(0.75);   // inches
  const [fontPt, setFontPt] = useState(12);      // base font size pt
  const [spacing, setSpacing] = useState(12);    // px between questions
  const [paper, setPaper] = useState(test.paper && PAPER_SIZES[test.paper] ? test.paper : "letter");
  const [heights, setHeights] = useState(null);
  const docRef = useRef(null);
  const grp = groups || {};
  const [opt, setOpt] = useState(!!test.optimize);
  const optimize = opt;
  const paperSize = PAPER_SIZES[paper] || PAPER_SIZES.letter;
  const printableWidthPx = Math.max(120, (paperSize.w - 2 * margin) * 96);
  const pageContentPx = Math.max(200, (paperSize.h - 2 * margin) * 96 - 18); // small safety margin

  useEffect(() => {
    (async () => {
      const qImgs = test.questionIds.map(id => questionsById[id]).filter(Boolean).map(q => q.imageId).filter(Boolean);
      const usedGroupIds = new Set(test.questionIds.map(id => questionsById[id]).filter(Boolean).map(q => q.groupId).filter(Boolean));
      const gImgs = [...usedGroupIds].map(gid => grp[gid] && grp[gid].imageId).filter(Boolean);
      const ids = [...new Set([...qImgs, ...gImgs])];
      const out = {};
      for (const id of ids) {
        const d = await getImage(id);
        if (d) out[id] = d;
      }
      setImages(out);
      setReady(true);
    })();
  }, [test, questionsById, grp, getImage]);

  const version = docMode.startsWith("B") ? "B" : "A";
  const isKey = docMode.endsWith("key");
  const baseDoc = useMemo(() => buildDoc(test, questionsById, grp, version), [test, questionsById, grp, version]);

  const onMeasured = useCallback((m) => setHeights(m), []);
  // Estimated heights are always available; measured heights refine them when ready.
  const estHeights = useMemo(() => (optimize ? estimateHeights(baseDoc, printableWidthPx, fontPt) : null), [optimize, baseDoc, printableWidthPx, fontPt]);
  const effHeights = optimize ? (heights || estHeights) : null;

  const optBundle = useMemo(() => {
    if (!optimize || !effHeights) return null;
    const optd = optimizeDoc(baseDoc, effHeights, pageContentPx, spacing);
    const stdPages = baselinePages(baseDoc, effHeights, pageContentPx, spacing);
    const optPages = optd.pages;
    const savedPages = Math.max(0, stdPages - optPages);
    const pct = stdPages > 0 ? Math.round((savedPages / stdPages) * 100) : 0;
    return { doc: optd, stdPages, optPages, savedPages, pct };
  }, [optimize, effHeights, baseDoc, pageContentPx, spacing]);

  const doc = optimize && optBundle ? optBundle.doc : baseDoc;
  const usingEstimate = optimize && !heights;

  // For the Version B answer key, map each question to its number in the primary (Version A) key.
  const primaryMap = useMemo(() => {
    if (!(test.twoVersions && isKey && version === "B")) return null;
    const aBase = buildDoc(test, questionsById, grp, "A");
    const aDoc = (optimize && effHeights) ? optimizeDoc(aBase, effHeights, pageContentPx, spacing) : aBase;
    const m = {};
    aDoc.sections.forEach(sec => sec.items.forEach(it => { m[it.q.id] = it.num; }));
    return m;
  }, [test, questionsById, grp, isKey, version, optimize, effHeights, pageContentPx, spacing]);

  const downloadHTML = () => {
    const inner = docRef.current ? docRef.current.innerHTML : "";
    const layoutCss = `@page{size:${paperSize.w}in ${paperSize.h}in;margin:${margin}in;}` +
      `.exam-doc{max-width:none;width:100%;padding:0;font-size:${fontPt}pt;}` +
      `.exam-doc .ex-q{margin:${spacing}px 0;}`;
    const html = "<!doctype html><html><head><meta charset='utf-8'><title>" +
      (test.title + (test.twoVersions ? " " + version : "") + (isKey ? " — Key" : "")).replace(/</g, "") +
      "</title><style>body{margin:0;background:#fff;}" + PRINT_CSS + layoutCss + "</style></head><body>" + inner + "</body></html>";
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (test.title || "test").toLowerCase().replace(/[^a-z0-9]+/g, "-") + (test.twoVersions ? "-" + version.toLowerCase() : "") + (isKey ? "-key" : "") + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div className="min-h-screen print-shell" style={{ background: "#5b5e66" }}>
      <StyleBlock />
      <style>{`
        .exam-doc { max-width: none; width: 100%; padding: 0; font-size: ${fontPt}pt; }
        .exam-doc .ex-q { margin: ${spacing}px 0; }
        .print-page { padding: ${margin}in; }
        @media print {
          html, body { background: #fff !important; }
          .print-shell { background: #fff !important; min-height: 0 !important; }
          .print-page-wrap { padding: 0 !important; }
          .print-page { box-shadow: none !important; max-width: none !important; width: auto !important; margin: 0 !important; padding: 0 !important; }
          @page { size: ${paperSize.w}in ${paperSize.h}in; margin: ${margin}in; }
        }
      `}</style>
      <div className="no-print sticky top-0 z-30 flex items-center gap-2 px-4 py-2 flex-wrap" style={{ background: INK, color: "#fff" }}>
        <button className="qb-btn" style={{ background: "transparent", color: "#fff", borderColor: "#8b9099" }} onClick={onClose}>
          <X size={15} /> Back
        </button>
        <select className="qb-select" style={{ width: "auto", background: "#fff" }} value={docMode} onChange={e => setDocMode(e.target.value)} aria-label="Choose document">
          <option value="A-test">{test.twoVersions ? "Version A — test" : "Test"}</option>
          <option value="A-key">{test.twoVersions ? "Version A — answer key" : "Answer key"}</option>
          {test.twoVersions && <option value="B-test">Version B — test</option>}
          {test.twoVersions && <option value="B-key">Version B — answer key</option>}
        </select>
        <label className="flex items-center gap-1 text-xs" style={{ color: "#c7cbd2" }}>
          <input type="checkbox" checked={opt} onChange={e => setOpt(e.target.checked)} /> Optimize layout
        </label>
        <label className="flex items-center gap-1 text-xs" style={{ color: "#c7cbd2" }}>Paper
          <select className="qb-select" style={{ width: "auto", background: "#fff" }} value={paper} onChange={e => setPaper(e.target.value)} aria-label="Paper size">
            {Object.keys(PAPER_SIZES).map(k => <option key={k} value={k}>{PAPER_SIZES[k].label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs" style={{ color: "#c7cbd2" }}>Margins
          <select className="qb-select" style={{ width: "auto", background: "#fff" }} value={margin} onChange={e => setMargin(Number(e.target.value))} aria-label="Page margins">
            <option value={0.5}>Narrow (0.5")</option>
            <option value={0.75}>Normal (0.75")</option>
            <option value={1}>Wide (1")</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs" style={{ color: "#c7cbd2" }}>Text
          <select className="qb-select" style={{ width: "auto", background: "#fff" }} value={fontPt} onChange={e => setFontPt(Number(e.target.value))} aria-label="Text size">
            <option value={11}>Compact</option>
            <option value={12}>Normal</option>
            <option value={13}>Large</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs" style={{ color: "#c7cbd2" }}>Spacing
          <select className="qb-select" style={{ width: "auto", background: "#fff" }} value={spacing} onChange={e => setSpacing(Number(e.target.value))} aria-label="Question spacing">
            <option value={8}>Tight</option>
            <option value={12}>Normal</option>
            <option value={18}>Roomy</option>
          </select>
        </label>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: "#c7cbd2" }}>
          {doc.count} question{doc.count === 1 ? "" : "s"}
          {optimize && optBundle ? (
            <span style={{ color: optBundle.savedPages > 0 ? "#7fd99a" : "#c7cbd2" }}>
              {" · "}{optBundle.stdPages} → {optBundle.optPages} pages
              {optBundle.savedPages > 0 ? ` · saved ${optBundle.savedPages} (${optBundle.pct}%)` : " · already tight"}
              {usingEstimate ? " · refining…" : ""}
            </span>
          ) : ""}
          {doc.missing ? ` · ${doc.missing} missing` : ""}
        </span>
        <button className="qb-btn" style={{ background: "transparent", color: "#fff", borderColor: "#8b9099" }} onClick={downloadHTML}>
          <Download size={15} /> HTML
        </button>
        <button className="qb-btn" style={{ background: PEN_RED, color: "#fff", borderColor: PEN_RED }} onClick={() => window.print()}>
          <Printer size={15} /> Print
        </button>
      </div>

      {optimize && ready && (
        <MeasureLayer doc={baseDoc} images={images} widthPx={printableWidthPx} fontPt={fontPt} onMeasured={onMeasured} />
      )}

      <div className="py-6 px-2 print-page-wrap">
        <div className="mx-auto shadow-xl print-page" style={{ background: "#fff", width: paperSize.w + "in", maxWidth: "100%" }}>
          {!ready ? (
            <div className="py-20 text-center qb-stamp" style={{ color: INK_SOFT }}>Loading images…</div>
          ) : (
            <div ref={docRef}>
              <ExamDocument test={test} doc={doc} settings={settings} images={images} version={version} isKey={isKey} primaryMap={primaryMap} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExamDocument({ test, doc, settings, images, version, isKey, primaryMap }) {
  // Build the "key map" for a Version B key: each B question number → its primary (Version A) number.
  let keyMap = null;
  if (isKey && primaryMap) {
    const pairs = [];
    let differs = false;
    doc.sections.forEach(sec => sec.items.forEach(it => {
      const a = primaryMap[it.q.id];
      if (a != null) { pairs.push({ b: it.num, a }); if (a !== it.num) differs = true; }
    }));
    keyMap = { pairs, differs };
  }
  return (
    <div className="exam-doc">
      {isKey ? (
        <div className="ex-key-h">
          ANSWER KEY — {test.title}{test.twoVersions ? " (Version " + version + ")" : ""}
        </div>
      ) : (
        <div className="ex-head">
          <div className="ex-course">
            {(test.courseLabel || "").toUpperCase()}{settings.school ? " · " + settings.school.toUpperCase() : ""}
          </div>
          <div className="ex-title">
            {test.title}{test.twoVersions ? "  —  Version " + version : ""}
          </div>
          <div className="ex-meta-row">
            <span>Name: <span className="ex-blank">&nbsp;</span></span>
            <span>Date: {test.dateLabel ? test.dateLabel : <span className="ex-blank-sm">&nbsp;</span>}</span>
            {test.teacher ? <span>Teacher: {test.teacher}</span> : null}
          </div>
          {test.instructions ? <div className="ex-instr">{test.instructions}</div> : null}
        </div>
      )}

      {keyMap && (
        <div className="ex-keymap">
          <div className="ex-keymap-h">Key map — Version B question → primary (Version A) number{keyMap.differs ? " (bold = changed position)" : ""}</div>
          {keyMap.differs ? (
            <div className="ex-keymap-body">
              {keyMap.pairs.map((p, i) => (
                <span key={i} className="ex-keymap-pair" style={{ fontWeight: p.a !== p.b ? 700 : 400 }}>{p.b} → A{p.a}</span>
              ))}
            </div>
          ) : (
            <div className="ex-keymap-body">Version B is in the same question order as Version A (only the multiple-choice option letters differ).</div>
          )}
        </div>
      )}

      {doc.sections.map(sec => (
        <div className="ex-sec" key={sec.type}>
          <div className="ex-sec-h">
            Part {sec.letter} — {TYPE_META[sec.type].label}
          </div>
          {!isKey && <div className="ex-sec-i">{SECTION_TEXT[sec.type]}</div>}
          {sec.items.map(item => (
            isKey ? <KeyItem key={item.num} item={item} /> : <TestItem key={item.num} item={item} images={images} />
          ))}
        </div>
      ))}
      <div className="ex-end">— {isKey ? "END OF KEY" : "END OF TEST"} —</div>
    </div>
  );
}

function TestItem({ item, images }) {
  const q = item.q;
  const stim = item.stim;
  return (
    <div className="ex-q">
      {stim && (
        <div className="ex-stim">
          <div className="ex-stim-h">
            {stim.label ? stim.label + " — " : ""}Use the following information to answer questions {stim.from}{stim.to > stim.from ? "–" + stim.to : ""}.
          </div>
          {stim.text ? <div className="ex-stim-body">{renderRich(stim.text)}</div> : null}
          {stim.table ? <DataTable table={stim.table} variant="print" /> : null}
          {stim.imageId && images[stim.imageId] ? (
            <div className="ex-img" style={{ marginLeft: 0 }}><img src={images[stim.imageId]} alt="Stimulus" /></div>
          ) : (!stim.imageId && stim.imageNote ? (
            <div className="ex-imgnote" style={{ marginLeft: 0 }}>[ Diagram to insert: {stim.imageNote} ]</div>
          ) : null)}
        </div>
      )}
      <div className="ex-q-row">
        <span className="ex-q-num">{q.type === "tf" ? <><span className="ex-tf-blank">&nbsp;</span>{item.num}.</> : item.num + "."}</span>
        <span style={{ flex: 1 }}>{renderRich(q.text)}</span>
      </div>

      {q.imageId && images[q.imageId] && (
        <div className="ex-img">
          <img src={images[q.imageId]} alt={q.imageCaption || "Diagram"} />
          {q.imageCaption ? <div className="ex-img-cap">{q.imageCaption}</div> : null}
        </div>
      )}
      {!q.imageId && q.imageNote && (
        <div className="ex-imgnote">[ Diagram to insert: {q.imageNote} ]</div>
      )}

      {q.table ? <DataTable table={q.table} variant="print" /> : null}

      {q.type === "mc" && (
        <div className="ex-opts">
          {item.mcOrder.map((origIdx, i) => (
            <div className="ex-opt" key={i}>
              <span className="ex-opt-letter">{String.fromCharCode(65 + i)}.</span>
              <span>{renderRich(q.mc.options[origIdx])}</span>
            </div>
          ))}
        </div>
      )}

      {q.type === "numeric" && (
        <div className="ex-ansline">Answer: <span className="ex-blank-sm">&nbsp;</span> {q.num.units}</div>
      )}

      {q.type === "matching" && (
        <div className="ex-match">
          <div className="ex-match-col">
            {q.match.pairs.map((p, i) => (
              <div className="ex-match-item" key={i}><span className="ex-tf-blank">&nbsp;</span>{i + 1}. {renderRich(p.left)}</div>
            ))}
          </div>
          <div className="ex-match-col">
            {item.rightOrder.map((r, i) => (
              <div className="ex-match-item" key={i}><b>{String.fromCharCode(65 + i)}.</b> {renderRich(r.text)}</div>
            ))}
          </div>
        </div>
      )}

      {q.type === "written" && q.wr.lines > 0 && (
        <div className="ex-lines">
          {Array.from({ length: q.wr.lines }).map((_, i) => <div className="ex-line" key={i} />)}
        </div>
      )}
    </div>
  );
}

function KeyItem({ item }) {
  const q = item.q;
  return (
    <div className="ex-key-item">
      <span className="ex-key-num">{item.num}.</span>{" "}
      {q.type === "mc" && (() => {
        const printed = item.mcOrder.indexOf(q.mc.correct);
        return <span><b>{String.fromCharCode(65 + printed)}</b> — {renderRich(q.mc.options[q.mc.correct])}</span>;
      })()}
      {q.type === "numeric" && (
        <span><b>{q.num.answer}</b>{q.num.tolerance ? " ± " + q.num.tolerance : ""} {q.num.units}</span>
      )}
      {q.type === "tf" && <span><b>{q.tf.answer ? "TRUE" : "FALSE"}</b></span>}
      {q.type === "matching" && (
        <span>{q.match.pairs.map((p, i) => {
          const printed = item.rightOrder.findIndex(r => r.pairIndex === i);
          return <span key={i}>{i + 1} → <b>{String.fromCharCode(65 + printed)}</b>{i < q.match.pairs.length - 1 ? ",  " : ""}</span>;
        })}</span>
      )}
      {q.type === "written" && (
        <span>
          <i>Written response</i>
          {q.wr.rubric ? <div className="ex-rubric">{renderRich(q.wr.rubric)}</div> : null}
        </span>
      )}
    </div>
  );
}

/* ---------------- Suggest tab (public submission form) ---------------- */
function SuggestTab({ courseOptions, submissions, onCompose }) {
  const [submitter, setSubmitter] = useState("");
  const mine = submissions || [];
  const statusChip = (s) => {
    const map = {
      pending: { label: "Pending review", color: "#9a6a00", bg: "#fbf3da" },
      approved: { label: "Approved", color: CHALK_GREEN, bg: "#eaf3ec" },
      rejected: { label: "Not accepted", color: PEN_RED, bg: "#fbeae8" },
    };
    const m = map[s] || map.pending;
    return <span className="chip" style={{ color: m.color, background: m.bg, borderColor: "transparent" }}>{m.label}</span>;
  };
  return (
    <div className="max-w-2xl grid gap-5">
      <div className="index-card p-5 grid gap-3">
        <div className="qb-stamp" style={{ color: PEN_RED }}>Suggest a question</div>
        <p className="qb-serif" style={{ fontSize: "1.05rem" }}>
          Got a good question? Send it in — a maintainer reviews every suggestion before it joins the bank.
        </p>
        <ol className="text-sm grid gap-1" style={{ color: INK_SOFT }}>
          <li>1. Add your name (optional) so the maintainer knows who to thank.</li>
          <li>2. Write your question in the same editor the bank uses.</li>
          <li>3. Submitting opens a pre-filled GitHub issue — press <b>Submit new issue</b> there to send it.</li>
        </ol>
        <div>
          <label className="qb-label">Your name (optional)</label>
          <input className="qb-input" value={submitter} onChange={e => setSubmitter(e.target.value)} placeholder="e.g. Ms. Nguyen" style={{ maxWidth: 320 }} />
        </div>
        <button className="qb-btn qb-btn-primary" style={{ justifySelf: "start" }} onClick={() => onCompose(submitter)}>
          <Plus size={15} /> Compose a question
        </button>
        <p className="text-xs flex items-center gap-1" style={{ color: INK_SOFT }}>
          <ExternalLink size={12} /> Submitting opens github.com in a new tab; a free GitHub account is needed to file the issue.
        </p>
      </div>

      <div className="index-card p-4 grid gap-2">
        <div className="qb-stamp" style={{ color: PEN_RED }}>
          Your suggestions <span style={{ color: INK_SOFT }}>· saved on this device</span>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm" style={{ color: INK_SOFT }}>You haven't suggested anything yet.</p>
        ) : (
          <div className="grid gap-2">
            {mine.map(s => (
              <div key={s.id} className="flex items-start gap-2 p-2 rounded" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
                <span className="qb-stamp" style={{ color: PEN_RED, minWidth: 42 }}>{TYPE_META[s.question.type] ? TYPE_META[s.question.type].short : "?"}</span>
                <div className="flex-1 min-w-0">
                  <div className="qb-serif" style={{ fontSize: "0.92rem" }}>{renderRich(s.question.text)}</div>
                  <div className="qb-stamp mt-1" style={{ color: "#9aa1ab" }}>{niceDate((s.submittedAt || "").slice(0, 10))}</div>
                </div>
                {statusChip(s.status)}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs" style={{ color: INK_SOFT }}>
          Approvals happen on the maintainer's computer, so the status here may stay “Pending review” even after yours is accepted.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Moderation panel (maintainer review queue) ---------------- */
function ModerationPanel({ submissions, admin, onUnlock, onApprove, onReject, onClearReviewed, onImport }) {
  const [pass, setPass] = useState("");
  const [reviewText, setReviewText] = useState("");
  const subs = submissions || [];
  const pending = subs.filter(s => s.status === "pending");
  const reviewed = subs.filter(s => s.status !== "pending");

  if (!admin) {
    return (
      <div className="index-card p-4 grid gap-2">
        <div className="qb-stamp" style={{ color: PEN_RED }}>
          <ShieldCheck size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />Moderation
        </div>
        <p className="text-sm" style={{ color: INK_SOFT }}>
          Review submitted questions here. Enter the moderation passphrase to unlock{pending.length ? ` (${pending.length} waiting on this device)` : ""}.
        </p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (onUnlock(pass)) setPass(""); }}>
          <input className="qb-input" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Moderation passphrase" style={{ maxWidth: 260 }} />
          <button className="qb-btn qb-btn-primary" type="submit"><ShieldCheck size={15} /> Unlock</button>
        </form>
      </div>
    );
  }

  return (
    <div className="index-card p-4 grid gap-3">
      <div className="qb-stamp" style={{ color: PEN_RED }}>
        <ShieldCheck size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />Moderation
      </div>

      <div className="grid gap-2">
        <div className="text-sm" style={{ color: INK }}>
          <Clock size={14} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />{pending.length} pending on this device
        </div>
        {pending.length === 0 ? (
          <p className="text-sm" style={{ color: INK_SOFT }}>
            <Inbox size={14} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />
            No local pending suggestions. Submissions from other people arrive as GitHub issues — paste one below to approve it.
          </p>
        ) : pending.map(s => (
          <div key={s.id} className="p-3 rounded grid gap-2" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="qb-stamp" style={{ color: PEN_RED }}>{TYPE_META[s.question.type] ? TYPE_META[s.question.type].label : s.question.type}</span>
              {s.question.course && <span className="chip">{s.question.course}{s.question.unit ? " · " + s.question.unit : ""}</span>}
              {s.submitter && <span className="text-xs" style={{ color: INK_SOFT }}>from {s.submitter}</span>}
            </div>
            <div className="qb-serif" style={{ fontSize: "0.95rem" }}>{renderRich(s.question.text)}</div>
            <div className="text-sm" style={{ color: INK_SOFT }}>{questionAnswerLine(s.question)}</div>
            <div className="flex gap-2">
              <button className="qb-btn qb-btn-primary" onClick={() => onApprove(s.id)}><Check size={15} /> Approve → bank</button>
              <button className="qb-btn qb-btn-red" onClick={() => onReject(s.id)}><X size={15} /> Reject</button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 pt-2" style={{ borderTop: `1px dashed ${LINE}` }}>
        <label className="qb-label">Approve from a GitHub issue</label>
        <p className="text-xs" style={{ color: INK_SOFT }}>Paste the JSON block from a submission issue to add it straight to the bank.</p>
        <textarea className="qb-textarea" rows={4} value={reviewText} onChange={e => setReviewText(e.target.value)}
          placeholder='[ { "type": "mc", "text": "…", "mc": { "options": ["…"], "correct": 0 } } ]'
          style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: "0.78rem" }} />
        <button className="qb-btn qb-btn-primary" style={{ justifySelf: "start", opacity: reviewText.trim() ? 1 : 0.45 }} disabled={!reviewText.trim()}
          onClick={async () => { const ok = await onImport(reviewText); if (ok) setReviewText(""); }}>
          <Check size={15} /> Approve pasted question(s)
        </button>
      </div>

      {reviewed.length > 0 && (
        <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px dashed ${LINE}` }}>
          <span className="text-xs" style={{ color: INK_SOFT }}>{reviewed.length} already reviewed</span>
          <button className="qb-btn qb-btn-ghost" onClick={onClearReviewed}><Trash2 size={14} /> Clear reviewed</button>
        </div>
      )}
    </div>
  );
}
