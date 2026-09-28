/* Shelfwise — a ProductsPilot bonus by Misan Morrison.
 * Fully static: every calculation below runs in the browser, and all data
 * lives in this browser's localStorage. No accounts, no server, no API. */

const GATE_HASH = "950d563ab62d7228293cdf83fc09ce5bfb8a6b61bde5a5b2d0ddd062e6b8e4ed";
const KEY = "shelfwise_";

/* ================================================================== data */

const DEFAULT_FEES = {
  etsy: { txPct: 6.5, procPct: 3, procFixed: 0.25, listing: 0.2, offsitePct: 15 },
  gumroad: { pct: 10, fixed: 0.5 },
  own: { pct: 2.9, fixed: 0.3 },
  custom: { name: "Other platform", pct: 0, fixed: 0, listing: 0 },
};
const OFFSITE_CAP = 100; // Etsy caps the Offsite Ads fee at $100 per order

const PLATFORM_KEYS = ["etsy", "gumroad", "own", "custom"];

// ProductsPilot's eight front-end categories, plus the KDP upgrade and a catch-all.
const PP_CATEGORIES = [
  "Wall Art", "Planners", "Digital Planners", "Templates",
  "Invitations", "Kids & Education", "PDF Reports & Guides", "Craft Files",
];
const ALL_CATEGORIES = [...PP_CATEGORIES, "Low-Content Books (KDP)", "Other"];

// Price bands exactly as the ProductsPilot sales page lists them; piece ranges
// from the partner page's per-category descriptions.
const PRICE_BANDS = {
  wallart: { label: "Wall Art Packs", low: 8, high: 25, pieces: [12, 20], pp: "Wall Art" },
  planners: { label: "Printable Planners", low: 5, high: 15, pieces: [15, 40], pp: "Planners" },
  svg: { label: "SVG Cut File Bundles", low: 3, high: 12, pieces: [10, 20], pp: "Craft Files" },
  clipart: { label: "Clipart Collections", low: 5, high: 20, pieces: [10, 20], pp: "Craft Files" },
  kdp: { label: "KDP Book Interiors", low: 3, high: 12, pieces: [50, 120], pp: null },
  budget: { label: "Budget & Finance Templates", low: 4, high: 12, pieces: [10, 20], pp: "Templates" },
  teacher: { label: "Teacher & Education Resources", low: 5, high: 18, pieces: [15, 30], pp: "Kids & Education" },
  seasonal: { label: "Seasonal & Holiday Products", low: 6, high: 20, pieces: [10, 20], pp: null },
  custom: { label: "Custom band (invitations, PDF guides…)", low: 6, high: 20, pieces: [6, 20], pp: null },
};

const EXTRA_WEIGHTS = { sizes: 0.3, tabs: 0.25, bleed: 0.15, guide: 0.15, license: 0.15 };
const EXTRA_LABELS = {
  sizes: "every paper/print size", tabs: "working hyperlinked tabs", bleed: "bleed & trim marks",
  guide: "a sizing/printing guide", license: "a commercial-use licence",
};
const COMPETITION_SCORE = { low: 1, medium: 0.6, high: 0.25 };
const STAGE_SCORE = { new: 0.2, some: 0.6, established: 1 };
const PRICE_WEIGHTS = { pieces: 0.3, extras: 0.25, competition: 0.25, stage: 0.2 };

// Peak buying months per category (1–12) and an evergreen floor.
const CATEGORY_SEASONS = {
  "Wall Art": { peaks: [11, 12], evergreen: 0.5, band: [8, 25] },
  "Planners": { peaks: [12, 1], evergreen: 0.2, band: [5, 15] },
  "Digital Planners": { peaks: [12, 1], evergreen: 0.2, band: [5, 15] },
  "Templates": { peaks: [1, 9], evergreen: 0.4, band: [4, 12] },
  "Invitations": { peaks: [4, 5, 6, 11, 12], evergreen: 0.2, band: null },
  "Kids & Education": { peaks: [8, 9], evergreen: 0.2, band: [5, 18] },
  "PDF Reports & Guides": { peaks: [1], evergreen: 0.3, band: null },
  "Craft Files": { peaks: [10, 11, 12], evergreen: 0.2, band: [3, 12] },
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const EARLY_DAYS = 21;

/* ================================================================== utils */

function load(name, fallback) {
  try {
    const raw = localStorage.getItem(KEY + name);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
function store(name, value) {
  try { localStorage.setItem(KEY + name, JSON.stringify(value)); } catch {}
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function money(x) {
  const v = r2(x);
  const sign = v < 0 ? "-" : "";
  return sign + "$" + Math.abs(v).toFixed(2);
}
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function num(id, fallback = 0) {
  const v = parseFloat(document.getElementById(id).value);
  return Number.isFinite(v) ? v : fallback;
}
function $(id) { return document.getElementById(id); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function todayISO(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoToUTC(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function daysBetween(fromIso, toIso) {
  return Math.round((isoToUTC(toIso) - isoToUTC(fromIso)) / 86400000);
}
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function prevMonthKey(key) {
  let [y, m] = key.split("-").map(Number);
  m -= 1; if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
function lastDayOfMonth(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${key}-${String(d).padStart(2, "0")}`;
}

let toastTimer = null;
function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
}

async function copyText(text) {
  if (!text) { showToast("Nothing to copy yet"); return; }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  showToast("Copied");
}

function formatSavedAt(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ================================================================== shell */

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function initGate() {
  const gate = $("gate"), form = $("gateForm"), input = $("gatePassword"), error = $("gateError");
  if (gate.classList.contains("is-unlocked")) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value.trim());
    if (hash === GATE_HASH) {
      try { localStorage.setItem(KEY + "access", "granted"); } catch {}
      gate.classList.add("is-unlocked");
      error.classList.remove("is-visible");
    } else {
      error.classList.add("is-visible");
      input.value = ""; input.focus();
    }
  });
}

function initTheme() {
  const toggle = $("themeToggle"), root = document.documentElement;
  function effectiveTheme() {
    const attr = root.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  toggle.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY + "theme", next); } catch {}
  });
}

function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      $("panel-" + btn.dataset.tab).classList.add("is-active");
      document.dispatchEvent(new CustomEvent("shelfwise:tab", { detail: btn.dataset.tab }));
    });
  });
}

function initSubtabs() {
  document.querySelectorAll(".subtabs").forEach((bar) => {
    const panel = bar.closest(".panel");
    bar.querySelectorAll(".subtab-btn").forEach((btn) => {
      btn.addEventListener("click", () => showTool(panel, btn.dataset.tool));
    });
  });
}
function showTool(panel, tool) {
  panel.querySelectorAll(".subtab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tool === tool));
  panel.querySelectorAll(".tool").forEach((t) => t.classList.toggle("is-active", t.id === "tool-" + tool));
  document.dispatchEvent(new CustomEvent("shelfwise:tool", { detail: tool }));
}
function goTo(tab, tool) {
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).click();
  if (tool) showTool($("panel-" + tab), tool);
}

/**
 * Save + saved-entries list for one tool (see design system). `confirmOpen`
 * asks before Open for snapshot tools, where Open replaces live data.
 */
function initSaveable({ toolId, listEl, getEntry, applyEntry, max = 50, confirmOpen = null }) {
  const key = `${KEY}saved_${toolId}`;
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } };
  const write = (entries) => {
    try { localStorage.setItem(key, JSON.stringify(entries.slice(0, max))); } catch { showToast("Storage is full"); }
    render();
  };
  function render() {
    const entries = read();
    if (!entries.length) {
      listEl.innerHTML = `<p class="saved-empty">Nothing saved yet — generate something, then press Save.</p>`;
      return;
    }
    listEl.innerHTML = entries.map((e) => `
      <div class="saved-item" data-id="${escapeHtml(e.id)}">
        <div class="saved-item-main">
          <div class="saved-item-name">${escapeHtml(e.name)}</div>
          <div class="saved-item-meta">${escapeHtml(e.meta)} · ${formatSavedAt(e.savedAt)}</div>
        </div>
        <div class="saved-actions">
          <button class="ghost-btn" data-act="open">Open</button>
          <button class="ghost-btn" data-act="delete">Delete</button>
        </div>
      </div>`).join("");
  }
  listEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".saved-item").dataset.id;
    const entry = read().find((e) => e.id === id);
    if (!entry) return;
    if (btn.dataset.act === "open") {
      if (confirmOpen && !window.confirm(confirmOpen)) return;
      applyEntry(entry.payload);
      showToast("Opened");
    } else {
      write(read().filter((e) => e.id !== id));
      showToast("Deleted");
    }
  });
  render();
  return {
    save() {
      const entry = getEntry();
      if (!entry) { showToast("Nothing to save yet"); return; }
      write([{ id: uid(), savedAt: new Date().toISOString(), ...entry }, ...read()]);
      showToast("Saved");
    },
    render,
  };
}

/* ================================================================== fees (shared) */

function getFees() {
  const saved = load("fees", null);
  const f = JSON.parse(JSON.stringify(DEFAULT_FEES));
  if (saved) for (const k of Object.keys(f)) Object.assign(f[k], saved[k] || {});
  return f;
}
function platformName(key, fees = getFees()) {
  return { etsy: "Etsy", gumroad: "Gumroad", own: "Own site", custom: fees.custom.name || "Other platform" }[key] || key;
}

/** Fee engine. Returns the full breakdown for one sale on one platform. */
function computeNet(price, platform, fees = getFees(), offsite = false) {
  const p = Number(price) || 0;
  let listing = 0, pctFee = 0, fixedFee = 0, offsiteFee = 0;
  if (platform === "etsy") {
    const f = fees.etsy;
    listing = f.listing;
    pctFee = p * (f.txPct + f.procPct) / 100;
    fixedFee = f.procFixed;
    if (offsite) offsiteFee = Math.min(p * f.offsitePct / 100, OFFSITE_CAP);
  } else if (platform === "gumroad" || platform === "own") {
    const f = fees[platform];
    pctFee = p * f.pct / 100;
    fixedFee = f.fixed;
  } else {
    const f = fees.custom;
    listing = f.listing;
    pctFee = p * f.pct / 100;
    fixedFee = f.fixed;
  }
  const total = listing + pctFee + fixedFee + offsiteFee;
  const net = p - total;
  return {
    price: r2(p), listing: r2(listing), pctFee: r2(pctFee), fixedFee: r2(fixedFee),
    offsiteFee: r2(offsiteFee), fees: r2(total), net: r2(net), keepPct: p > 0 ? r2(net / p * 100) : 0,
  };
}

function customPlatformActive(fees) {
  const c = fees.custom;
  return c.pct > 0 || c.fixed > 0 || c.listing > 0 || (c.name && c.name !== DEFAULT_FEES.custom.name);
}

/* ================================================================== PRICED: Net-Per-Sale */

function computeNetTable(price, fees, offsite) {
  const rows = [
    { key: "etsy", name: "Etsy", ...computeNet(price, "etsy", fees, false) },
  ];
  if (offsite) rows.push({ key: "etsy-offsite", name: "Etsy — Offsite Ads sale", ...computeNet(price, "etsy", fees, true) });
  rows.push({ key: "gumroad", name: "Gumroad", ...computeNet(price, "gumroad", fees) });
  rows.push({ key: "own", name: "Own site", ...computeNet(price, "own", fees) });
  if (customPlatformActive(fees)) rows.push({ key: "custom", name: fees.custom.name || "Other platform", ...computeNet(price, "custom", fees) });
  const best = rows.reduce((a, b) => (b.net > a.net ? b : a));
  const worst = rows.reduce((a, b) => (b.net < a.net ? b : a));
  // What the "listing + transaction fee only" shortcut would suggest.
  const shortcut = r2(price - fees.etsy.listing - price * fees.etsy.txPct / 100);
  return { rows, best, worst, shortcut };
}

const FEE_FIELDS = {
  feeEtsyTx: ["etsy", "txPct"], feeEtsyProcPct: ["etsy", "procPct"], feeEtsyProcFixed: ["etsy", "procFixed"],
  feeEtsyListing: ["etsy", "listing"], feeEtsyOffsite: ["etsy", "offsitePct"],
  feeGumPct: ["gumroad", "pct"], feeGumFixed: ["gumroad", "fixed"],
  feeOwnPct: ["own", "pct"], feeOwnFixed: ["own", "fixed"],
  feeCustomName: ["custom", "name"], feeCustomPct: ["custom", "pct"], feeCustomFixed: ["custom", "fixed"], feeCustomListing: ["custom", "listing"],
};

function writeFeeFields(fees) {
  for (const [id, [p, k]] of Object.entries(FEE_FIELDS)) $(id).value = fees[p][k];
}
function readFeeFields() {
  const f = JSON.parse(JSON.stringify(DEFAULT_FEES));
  for (const [id, [p, k]] of Object.entries(FEE_FIELDS)) {
    if (k === "name") f[p][k] = $(id).value.trim() || DEFAULT_FEES.custom.name;
    else { const v = parseFloat($(id).value); f[p][k] = Number.isFinite(v) && v >= 0 ? v : 0; }
  }
  return f;
}

let netState = null;

function initNet() {
  const inputs = ["netLabel", "netPrice", "netOffsite"];
  writeFeeFields(getFees());
  const last = load("last_net", null);
  if (last) applyNetInputs(last);

  function applyNetInputs(d) {
    $("netLabel").value = d.label || "";
    $("netPrice").value = d.price ?? 20;
    $("netOffsite").checked = !!d.offsite;
    if (d.fees) { store("fees", d.fees); writeFeeFields(getFees()); }
  }
  function run() {
    const fees = readFeeFields();
    store("fees", fees);
    const price = Math.max(0, num("netPrice", 0));
    const label = $("netLabel").value.trim();
    const offsite = $("netOffsite").checked;
    store("last_net", { label, price, offsite });
    const t = computeNetTable(price, fees, offsite);
    netState = { label, price, offsite, fees, table: t };
    renderNet(netState);
    document.dispatchEvent(new CustomEvent("shelfwise:fees"));
  }
  inputs.forEach((id) => $(id).addEventListener("input", run));
  Object.keys(FEE_FIELDS).forEach((id) => $(id).addEventListener("input", run));
  $("feeReset").addEventListener("click", () => { writeFeeFields(DEFAULT_FEES); run(); showToast("Fees reset"); });

  const saveable = initSaveable({
    toolId: "net", listEl: $("netSavedList"),
    getEntry: () => netState && {
      name: `${netState.label || "Sale"} at ${money(netState.price)}`,
      meta: `Best: ${netState.table.best.name} ${money(netState.table.best.net)}`,
      payload: { label: netState.label, price: netState.price, offsite: netState.offsite, fees: netState.fees },
    },
    applyEntry: (p) => { applyNetInputs(p); run(); },
  });
  $("netSave").addEventListener("click", saveable.save);
  $("netCopy").addEventListener("click", () => copyText(netText(netState)));
  run();
}

function renderNet(s) {
  const t = s.table;
  const etsy = t.rows[0];
  $("netOutput").innerHTML = `
    <div class="big-number">${money(t.best.net)}</div>
    <p class="big-sub">Most you keep from a ${money(s.price)} sale (${escapeHtml(t.best.name)}). Least: ${money(t.worst.net)} (${escapeHtml(t.worst.name)}).</p>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Platform</th><th class="num">Fees</th><th class="num">You keep</th><th class="num">Keep %</th></tr></thead>
      <tbody>${t.rows.map((r) => `<tr${r.key === t.best.key ? ' class="highlight"' : ""}><td>${escapeHtml(r.name)}</td><td class="num">${money(r.fees)}</td><td class="num"><strong>${money(r.net)}</strong></td><td class="num">${r.keepPct.toFixed(1)}%</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="section-title">Etsy fee breakdown</div>
    <table class="data-table">
      <tbody>
        <tr><td>Listing fee</td><td class="num">${money(etsy.listing)}</td></tr>
        <tr><td>Transaction ${s.fees.etsy.txPct}% + processing ${s.fees.etsy.procPct}%</td><td class="num">${money(etsy.pctFee)}</td></tr>
        <tr><td>Processing fixed fee</td><td class="num">${money(etsy.fixedFee)}</td></tr>
        ${s.offsite ? `<tr><td>Offsite Ads ${s.fees.etsy.offsitePct}% (on that sale only)</td><td class="num">${money(t.rows[1].offsiteFee)}</td></tr>` : ""}
      </tbody>
    </table>
    <div class="callout">Counting only the listing and transaction fees, this sale looks like <strong>${money(t.shortcut)}</strong>. Payment processing brings it to <strong>${money(etsy.net)}</strong>${s.offsite ? `, and an Offsite Ads sale leaves <strong>${money(t.rows[1].net)}</strong>` : ""}. Price from the real number.</div>`;
}

function netText(s) {
  if (!s) return "";
  const lines = [`What I keep from a ${money(s.price)} sale${s.label ? ` — ${s.label}` : ""}`];
  s.table.rows.forEach((r) => lines.push(`${r.name}: keep ${money(r.net)} (fees ${money(r.fees)}, ${r.keepPct.toFixed(1)}% kept)`));
  return lines.join("\n");
}

/* ================================================================== PRICED: Price Point Picker */

/** Weighted scorer → a specific price inside the band. */
function computePricePoint({ low, high, pieces, pieceRange, extras, competition, stage }) {
  if (!(high > low)) return { error: "The high end of the band must be above the low end." };
  const [plo, phi] = pieceRange;
  const pieceScore = phi > plo ? clamp((pieces - plo) / (phi - plo), 0, 1) : 1;
  const extrasScore = r2(extras.reduce((s, e) => s + (EXTRA_WEIGHTS[e] || 0), 0));
  const compScore = COMPETITION_SCORE[competition];
  const stageScore = STAGE_SCORE[stage];
  const score = PRICE_WEIGHTS.pieces * pieceScore + PRICE_WEIGHTS.extras * extrasScore
    + PRICE_WEIGHTS.competition * compScore + PRICE_WEIGHTS.stage * stageScore;
  const raw = low + score * (high - low);
  let price = Math.round(raw) - 0.01;
  if (price < low) price = low;
  if (price > high) price = high;
  price = r2(price);
  return {
    price, raw: r2(raw), score: r2(score), pieceScore: r2(pieceScore), extrasScore, compScore, stageScore,
    perPiece: pieces > 0 ? r2(price / pieces) : 0,
    positionPct: Math.round((price - low) / (high - low) * 100),
  };
}

let priceState = null;

function initPrice() {
  const sel = $("priceCategory");
  sel.innerHTML = Object.entries(PRICE_BANDS).map(([k, b]) =>
    `<option value="${k}">${escapeHtml(b.label)}${k === "custom" ? "" : ` ($${b.low}–$${b.high})`}</option>`).join("");

  function setBand(k) {
    const b = PRICE_BANDS[k];
    $("priceBandLow").value = b.low;
    $("priceBandHigh").value = b.high;
    $("pricePiecesHint").textContent = `Typical set for this category: ${b.pieces[0]}–${b.pieces[1]} pieces.`;
  }
  function inputs() {
    return {
      product: $("priceProduct").value.trim(),
      category: sel.value,
      low: num("priceBandLow"), high: num("priceBandHigh"),
      pieces: Math.max(1, Math.round(num("pricePieces", 1))),
      extras: [...document.querySelectorAll(".priceExtra:checked")].map((c) => c.value),
      competition: $("priceCompetition").value,
      stage: $("priceStage").value,
    };
  }
  function applyInputs(d) {
    $("priceProduct").value = d.product || "";
    sel.value = d.category; setBand(d.category);
    $("priceBandLow").value = d.low; $("priceBandHigh").value = d.high;
    $("pricePieces").value = d.pieces;
    document.querySelectorAll(".priceExtra").forEach((c) => { c.checked = d.extras.includes(c.value); });
    $("priceCompetition").value = d.competition;
    $("priceStage").value = d.stage;
  }
  function run() {
    const d = inputs();
    store("last_price", d);
    const res = computePricePoint({ ...d, pieceRange: PRICE_BANDS[d.category].pieces });
    priceState = { inputs: d, res };
    if (!res.error) {
      const pp = PRICE_BANDS[d.category].pp;
      if (pp) { const picked = load("picked_prices", {}); picked[pp] = res.price; store("picked_prices", picked); }
      store("picked_last", res.price);
    }
    renderPrice(priceState);
  }

  const last = load("last_price", null);
  if (last) applyInputs(last); else setBand(sel.value);
  sel.addEventListener("change", () => { setBand(sel.value); run(); });
  ["priceProduct", "priceBandLow", "priceBandHigh", "pricePieces", "priceCompetition", "priceStage"].forEach((id) => $(id).addEventListener("input", run));
  document.querySelectorAll(".priceExtra").forEach((c) => c.addEventListener("change", run));
  document.addEventListener("shelfwise:fees", () => priceState && renderPrice(priceState));

  const saveable = initSaveable({
    toolId: "price", listEl: $("priceSavedList"),
    getEntry: () => priceState && !priceState.res.error && {
      name: `${priceState.inputs.product || PRICE_BANDS[priceState.inputs.category].label} — ${money(priceState.res.price)}`,
      meta: `${PRICE_BANDS[priceState.inputs.category].label}, ${priceState.inputs.pieces} pieces`,
      payload: priceState.inputs,
    },
    applyEntry: (p) => { applyInputs(p); run(); },
  });
  $("priceSave").addEventListener("click", saveable.save);
  $("priceCopy").addEventListener("click", () => copyText(priceText(priceState)));
  $("priceToPayback").addEventListener("click", () => {
    if (!priceState || priceState.res.error) return;
    $("payPrice").value = priceState.res.price;
    $("payPrice").dispatchEvent(new Event("input"));
    goTo("priced", "payback");
    showToast("Price sent to Payback Planner");
  });
  run();
}

function priceReasons(d, res) {
  const band = PRICE_BANDS[d.category];
  const out = [];
  const [plo, phi] = band.pieces;
  out.push(d.pieces >= phi ? `${d.pieces} pieces is a full set for this category (typical ${plo}–${phi}), which supports the top of the band.`
    : d.pieces <= plo ? `${d.pieces} pieces is at the small end for this category (typical ${plo}–${phi}), which holds the price down.`
    : `${d.pieces} pieces sits mid-range for this category (typical ${plo}–${phi}).`);
  out.push(d.extras.length ? `Extras that justify a higher price: ${d.extras.map((e) => EXTRA_LABELS[e]).join(", ")}.` : "No extras ticked. Every size and a printing guide are what buyers pay more for.");
  out.push({ low: "Low competition gives you room to price with confidence.", medium: "Medium competition keeps you near the middle of the band.", high: "A crowded niche pulls the price down. Stand out on the first image, not on being cheapest." }[d.competition]);
  out.push({ new: "As a new shop without reviews, a slightly lower price helps win your first sales. Raise it once reviews arrive.", some: "With some reviews in, buyers trust you enough for a mid-band price.", established: "An established shop with reviews can hold the upper end of the band." }[d.stage]);
  return out;
}

function renderPrice(s) {
  const out = $("priceOutput");
  if (s.res.error) { out.innerHTML = `<p class="output-placeholder">${escapeHtml(s.res.error)}</p>`; return; }
  const d = s.inputs, res = s.res, fees = getFees();
  const etsy = computeNet(res.price, "etsy", fees), gum = computeNet(res.price, "gumroad", fees);
  out.innerHTML = `
    <div class="big-number">${money(res.price)}</div>
    <p class="big-sub">${res.positionPct}% of the way up the ${money(d.low)}–${money(d.high)} band · ${money(res.perPiece)} per piece</p>
    <div class="stat-row">
      <div class="stat"><div class="stat-label">Etsy keeps</div><div class="stat-value">${money(etsy.net)}</div><div class="stat-note">after ${money(etsy.fees)} fees</div></div>
      <div class="stat"><div class="stat-label">Gumroad keeps</div><div class="stat-value">${money(gum.net)}</div><div class="stat-note">after ${money(gum.fees)} fees</div></div>
      <div class="stat"><div class="stat-label">Price score</div><div class="stat-value">${Math.round(res.score * 100)}/100</div><div class="stat-note">weighted from 4 factors</div></div>
    </div>
    <div class="section-title">Why this price</div>
    <ul class="reason-list">${priceReasons(d, res).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;
}

function priceText(s) {
  if (!s || s.res.error) return "";
  const d = s.inputs, res = s.res;
  return [`Price for ${d.product || PRICE_BANDS[d.category].label}: ${money(res.price)}`,
    `Band ${money(d.low)}–${money(d.high)}, ${d.pieces} pieces, ${money(res.perPiece)} per piece`,
    ...priceReasons(d, res).map((r) => `- ${r}`)].join("\n");
}

/* ================================================================== PRICED: Payback Planner */

function computePayback({ invest, price, shares, offsiteShare, perMonth, etsyListing }, fees = getFees()) {
  const sum = shares.etsy + shares.gumroad + shares.own;
  if (!(sum > 0)) return { error: "Enter where your sales happen. The percentages can't all be zero." };
  const w = { etsy: shares.etsy / sum, gumroad: shares.gumroad / sum, own: shares.own / sum };
  const off = clamp(offsiteShare, 0, 100) / 100;
  const netE = computeNet(price, "etsy", fees).net;
  const netEOff = computeNet(price, "etsy", fees, true).net;
  const netG = computeNet(price, "gumroad", fees).net;
  const netO = computeNet(price, "own", fees).net;
  const etsyBlend = netE * (1 - off) + netEOff * off;
  const blended = w.etsy * etsyBlend + w.gumroad * netG + w.own * netO;
  if (!(blended > 0)) return { error: "At this price every sale loses money after fees. Raise the price." };
  const eps = 1e-9;
  const overhead = etsyListing ? r2(perMonth * fees.etsy.listing) : 0;
  const perPlatform = [
    { name: "Etsy", net: netE }, { name: "Etsy — Offsite Ads sale", net: netEOff },
    { name: "Gumroad", net: netG }, { name: "Own site", net: netO },
  ].map((p) => ({ ...p, sales: p.net > 0 ? Math.ceil(invest / p.net - eps) : null }));
  return {
    blended: r2(blended),
    salesToPayback: Math.ceil(invest / blended - eps),
    overhead,
    salesForOverhead: overhead > 0 ? Math.ceil(overhead / blended - eps) : 0,
    salesFirstMonth: Math.ceil((invest + overhead) / blended - eps),
    perPlatform,
    weights: w,
  };
}

let payState = null;

function initPayback() {
  const ids = ["payInvest", "payInvestCustom", "payPrice", "payShareEtsy", "payShareGum", "payShareOwn", "payOffsiteShare", "payPerMonth", "payEtsyListing"];
  function inputs() {
    const sel = $("payInvest").value;
    return {
      investChoice: sel,
      invest: sel === "custom" ? Math.max(0, num("payInvestCustom")) : Number(sel),
      investCustom: num("payInvestCustom"),
      price: Math.max(0, num("payPrice")),
      shares: { etsy: Math.max(0, num("payShareEtsy")), gumroad: Math.max(0, num("payShareGum")), own: Math.max(0, num("payShareOwn")) },
      offsiteShare: num("payOffsiteShare"),
      perMonth: Math.max(0, Math.round(num("payPerMonth"))),
      etsyListing: $("payEtsyListing").checked,
    };
  }
  function applyInputs(d) {
    $("payInvest").value = d.investChoice;
    $("payInvestCustom").value = d.investCustom ?? 100;
    $("payPrice").value = d.price;
    $("payShareEtsy").value = d.shares.etsy; $("payShareGum").value = d.shares.gumroad; $("payShareOwn").value = d.shares.own;
    $("payOffsiteShare").value = d.offsiteShare;
    $("payPerMonth").value = d.perMonth;
    $("payEtsyListing").checked = d.etsyListing;
  }
  function run() {
    const d = inputs();
    $("payInvestCustomWrap").hidden = d.investChoice !== "custom";
    store("last_payback", d);
    payState = { inputs: d, res: computePayback(d) };
    renderPayback(payState);
  }
  const last = load("last_payback", null);
  if (last) applyInputs(last);
  ids.forEach((id) => $(id).addEventListener("input", run));
  $("payEtsyListing").addEventListener("change", run);
  $("payInvest").addEventListener("change", run);
  $("payUsePicker").addEventListener("click", () => {
    const p = load("picked_last", null);
    if (p == null) { showToast("Use the Price Point Picker first"); return; }
    $("payPrice").value = p; run(); showToast("Price filled in");
  });
  document.addEventListener("shelfwise:fees", run);

  const saveable = initSaveable({
    toolId: "payback", listEl: $("paySavedList"),
    getEntry: () => payState && !payState.res.error && {
      name: `${money(payState.inputs.invest)} paid back in ${payState.res.salesToPayback} sales`,
      meta: `at ${money(payState.inputs.price)} average`,
      payload: payState.inputs,
    },
    applyEntry: (p) => { applyInputs(p); run(); },
  });
  $("paySave").addEventListener("click", saveable.save);
  $("payCopy").addEventListener("click", () => copyText(payText(payState)));
  run();
}

function renderPayback(s) {
  const out = $("payOutput");
  if (s.res.error) { out.innerHTML = `<p class="output-placeholder">${escapeHtml(s.res.error)}</p>`; return; }
  const d = s.inputs, r = s.res;
  const yearly = d.investChoice === "230" || d.investChoice === "317";
  out.innerHTML = `
    <div class="big-number">${r.salesToPayback} ${r.salesToPayback === 1 ? "sale" : "sales"}</div>
    <p class="big-sub">to pay back ${money(d.invest)} at a ${money(d.price)} average sale, keeping ${money(r.blended)} per sale across your platform mix.${yearly ? " This plan renews yearly, so it's the same target each year." : ""}</p>
    <div class="stat-row">
      <div class="stat"><div class="stat-label">You keep per sale</div><div class="stat-value">${money(r.blended)}</div><div class="stat-note">blended across platforms</div></div>
      <div class="stat"><div class="stat-label">Monthly listing fees</div><div class="stat-value">${money(r.overhead)}</div><div class="stat-note">${d.etsyListing ? `${d.perMonth} new Etsy listings` : "not listing on Etsy"}</div></div>
      <div class="stat"><div class="stat-label">Sales to cover them</div><div class="stat-value">${r.salesForOverhead}</div><div class="stat-note">each month</div></div>
      <div class="stat"><div class="stat-label">Payback + month 1 fees</div><div class="stat-value">${r.salesFirstMonth}</div><div class="stat-note">sales in total</div></div>
    </div>
    <div class="section-title">If every sale came from one platform</div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Platform</th><th class="num">Keep per sale</th><th class="num">Sales to pay back</th></tr></thead>
      <tbody>${r.perPlatform.map((p) => `<tr><td>${p.name}</td><td class="num">${money(p.net)}</td><td class="num">${p.sales == null ? "never at this price" : p.sales}</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="callout">This counts sales, not income. How fast those sales come depends on your products and traffic, and Shelfwise doesn't guess at that. Log real sales in <strong>Tally</strong> to see how you're tracking.</div>`;
}

function payText(s) {
  if (!s || s.res.error) return "";
  const d = s.inputs, r = s.res;
  return [`Payback plan: ${money(d.invest)} at ${money(d.price)} average sale`,
    `Keep per sale (blended): ${money(r.blended)}`,
    `Sales to pay back: ${r.salesToPayback}`,
    `Monthly Etsy listing fees: ${money(r.overhead)} (${r.salesForOverhead} sales to cover)`,
    `Payback including first month's listing fees: ${r.salesFirstMonth} sales`].join("\n");
}

/* ================================================================== HANDOFF: Queue */

function queueScore(p) {
  const parts = [p.etsy ? 1 : 0, p.gumroad ? 1 : 0, p.link ? 1 : 0];
  if (p.qaDrafted > 0) parts.push(Math.min(p.qaPosted / p.qaDrafted, 1));
  if (p.pitchDrafted > 0) parts.push(Math.min(p.pitchSent / p.pitchDrafted, 1));
  return r2(parts.reduce((a, b) => a + b, 0) / parts.length);
}
function queueStatus(p) {
  if (p.gumroad && !p.etsy) return "stuck";
  return queueScore(p) >= 1 ? "done" : "open";
}
function queueTodo(p) {
  const t = [];
  if (!p.etsy) t.push("Paste the Etsy listing (about 3 minutes)");
  if (!p.gumroad) t.push("Publish on Gumroad");
  if (!p.link) t.push("Add the link to your own site or bio");
  const qa = p.qaDrafted - p.qaPosted;
  if (qa > 0) t.push(`Post ${qa} more Q&A ${qa === 1 ? "answer" : "answers"}`);
  const pitch = p.pitchDrafted - p.pitchSent;
  if (pitch > 0) t.push(`Send ${pitch} more guest-post ${pitch === 1 ? "pitch" : "pitches"}`);
  return t;
}
function buildHandoffList(queue, today = todayISO()) {
  const open = queue.filter((p) => queueStatus(p) !== "done")
    .sort((a, b) => (queueStatus(a) === "stuck" ? -1 : 0) - (queueStatus(b) === "stuck" ? -1 : 0) || a.built.localeCompare(b.built));
  return open.map((p) => ({ name: p.name, days: daysBetween(p.built, today), status: queueStatus(p), todo: queueTodo(p) }));
}

let queueFilter = "all";

function initQueue() {
  $("qBuilt").value = todayISO();
  const render = () => renderQueue();
  $("qAdd").addEventListener("click", () => {
    const name = $("qName").value.trim();
    if (!name) { showToast("Enter a product name"); $("qName").focus(); return; }
    const q = load("queue", []);
    q.unshift({ id: uid(), name, category: $("qCategory").value, built: $("qBuilt").value || todayISO(),
      etsy: false, gumroad: false, link: false, qaDrafted: 0, qaPosted: 0, pitchDrafted: 0, pitchSent: 0 });
    store("queue", q);
    $("qName").value = "";
    render(); refreshProductNames(); showToast("Product added");
  });
  $("qFilter").addEventListener("click", (e) => {
    const b = e.target.closest(".seg-btn"); if (!b) return;
    queueFilter = b.dataset.filter;
    $("qFilter").querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("is-active", x === b));
    render();
  });
  $("qList").addEventListener("change", (e) => {
    const cb = e.target.closest("input[data-step]"); if (!cb) return;
    updateQueueItem(cb.closest(".q-item").dataset.id, (p) => { p[cb.dataset.step] = cb.checked; });
  });
  $("qList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-ctr], button[data-del]"); if (!b) return;
    const id = b.closest(".q-item").dataset.id;
    if (b.dataset.del !== undefined) {
      if (!window.confirm("Remove this product from the queue?")) return;
      store("queue", load("queue", []).filter((p) => p.id !== id)); render(); return;
    }
    updateQueueItem(id, (p) => {
      const k = b.dataset.ctr, delta = Number(b.dataset.delta);
      p[k] = Math.max(0, p[k] + delta);
      // posted/sent can never exceed drafted
      if (k === "qaDrafted") p.qaPosted = Math.min(p.qaPosted, p.qaDrafted);
      if (k === "pitchDrafted") p.pitchSent = Math.min(p.pitchSent, p.pitchDrafted);
      if (k === "qaPosted") p.qaPosted = Math.min(p.qaPosted, p.qaDrafted);
      if (k === "pitchSent") p.pitchSent = Math.min(p.pitchSent, p.pitchDrafted);
    });
  });
  function updateQueueItem(id, fn) {
    const q = load("queue", []);
    const p = q.find((x) => x.id === id); if (!p) return;
    fn(p); store("queue", q); render();
  }
  const saveable = initSaveable({
    toolId: "queue", listEl: $("qSavedList"),
    getEntry: () => {
      const q = load("queue", []);
      if (!q.length) return null;
      const stuck = q.filter((p) => queueStatus(p) === "stuck").length;
      const done = q.filter((p) => queueStatus(p) === "done").length;
      return { name: `Queue snapshot — ${q.length} products`, meta: `${done} done, ${stuck} stuck`, payload: { queue: q } };
    },
    applyEntry: (p) => { store("queue", p.queue); render(); refreshProductNames(); },
    confirmOpen: "Replace your current queue with this snapshot?",
  });
  $("qSave").addEventListener("click", saveable.save);
  $("qCopy").addEventListener("click", () => copyText(handoffText(buildHandoffList(load("queue", [])))));
  render();
}

function counterHtml(label, key, value) {
  return `<div class="q-counter"><span class="ctr-label">${label}</span><span class="ctr">
    <button type="button" data-ctr="${key}" data-delta="-1" aria-label="${label} minus one">−</button>
    <span>${value}</span>
    <button type="button" data-ctr="${key}" data-delta="1" aria-label="${label} plus one">+</button></span></div>`;
}

function renderQueue() {
  const q = load("queue", []);
  const list = q.filter((p) => queueFilter === "all" || queueStatus(p) === queueFilter);
  const statusPill = { stuck: '<span class="pill warn">Stuck: not on Etsy</span>', done: '<span class="pill won">Done</span>', open: '<span class="pill info">Open</span>' };
  const today = todayISO();
  $("qList").innerHTML = !q.length ? `<p class="output-placeholder">No products yet. Add each product you build in ProductsPilot.</p>`
    : !list.length ? `<p class="output-placeholder">Nothing in this view.</p>`
    : list.map((p) => {
      const sc = queueScore(p), st = queueStatus(p);
      return `<div class="q-item" data-id="${escapeHtml(p.id)}">
        <div class="q-top"><div><div class="q-name">${escapeHtml(p.name)}</div>
          <div class="q-meta">${escapeHtml(p.category)} · built ${daysBetween(p.built, today)} days ago</div></div>${statusPill[st]}</div>
        <div class="q-steps">
          <label class="check"><input type="checkbox" data-step="etsy" ${p.etsy ? "checked" : ""}/> Etsy listing pasted</label>
          <label class="check"><input type="checkbox" data-step="gumroad" ${p.gumroad ? "checked" : ""}/> Published on Gumroad</label>
          <label class="check"><input type="checkbox" data-step="link" ${p.link ? "checked" : ""}/> Link on my site / bio</label>
        </div>
        <div class="q-steps mt">
          ${counterHtml("Q&A drafted", "qaDrafted", p.qaDrafted)}${counterHtml("Q&A posted", "qaPosted", p.qaPosted)}
          ${counterHtml("Pitches drafted", "pitchDrafted", p.pitchDrafted)}${counterHtml("Pitches sent", "pitchSent", p.pitchSent)}
        </div>
        <div class="progress"><span style="width:${Math.round(sc * 100)}%"></span></div>
        <div class="q-foot"><span>${Math.round(sc * 100)}% handed off</span><button type="button" class="ghost-btn danger" data-del>Remove</button></div>
      </div>`;
    }).join("");
  const items = buildHandoffList(q);
  $("qOutput").innerHTML = !items.length ? `<p class="output-placeholder">${q.length ? "Everything is handed off. Nice work." : "Your to-do list appears here once you add products."}</p>`
    : `<ul class="reason-list">${items.map((i) => `<li><strong>${escapeHtml(i.name)}</strong>${i.status === "stuck" ? " (stuck)" : ""} — ${escapeHtml(i.todo.join("; "))}</li>`).join("")}</ul>`;
}

function handoffText(items) {
  if (!items.length) return "";
  return ["Today's handoff list", ...items.map((i) => `- ${i.name}${i.status === "stuck" ? " (stuck)" : ""}: ${i.todo.join("; ")}`)].join("\n");
}

/* ================================================================== HANDOFF: Buyer Reply Kit */

const REPLY_CATEGORIES = {
  refund: { label: "Refund request", words: ["refund", "money back", "return", "cancel", "disappointed", "not what i", "chargeback", "dispute", "waste"] },
  download: { label: "Download / ZIP", words: ["download", "zip", "unzip", "extract", "can't open", "cant open", "won't open", "wont open", "can't find", "cant find", "where are", "link", "received nothing", "didn't get", "didnt get"] },
  tablet: { label: "Tablet / hyperlinks", words: ["goodnotes", "notability", "ipad", "tablet", "hyperlink", "tabs", "tab", "stylus", "import"] },
  size: { label: "Sizes", words: ["size", "sizes", "frame", "inch", "inches", "8x10", "11x14", "a4", "letter", "dimension", "dimensions", "fit", "crop", "cropped", "ratio"] },
  print: { label: "Printing", words: ["print", "printer", "printing", "printed", "ink", "paper", "blurry", "pixelated", "quality", "colour", "color", "cut off"] },
  license: { label: "Licence", words: ["commercial", "resell", "sell", "license", "licence", "business", "client", "etsy shop", "my shop"] },
};
const REPLY_PRIORITY = ["refund", "download", "tablet", "size", "print", "license"];

function countHits(text, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9])${esc}(?=$|[^a-z0-9])`, "g");
  return (text.match(re) || []).length > 0 ? 1 : 0;
}

/** Keyword classifier: distinct keyword hits per category; ties broken by REPLY_PRIORITY. */
function classifyMessage(message) {
  const text = " " + String(message || "").toLowerCase().replace(/[’']/g, "'") + " ";
  const scores = {};
  for (const [k, c] of Object.entries(REPLY_CATEGORIES)) scores[k] = c.words.reduce((s, w) => s + countHits(text, w), 0);
  const ranked = REPLY_PRIORITY.filter((k) => scores[k] > 0).sort((a, b) => scores[b] - scores[a] || REPLY_PRIORITY.indexOf(a) - REPLY_PRIORITY.indexOf(b));
  // A refund request is the most urgent thing in any message, so it always leads.
  if (scores.refund > 0 && ranked[0] !== "refund") {
    ranked.splice(ranked.indexOf("refund"), 1);
    ranked.unshift("refund");
  }
  return { primary: ranked[0] || "general", secondary: ranked.slice(1, 3), scores };
}

function replyParagraph(cat, d) {
  const f = new Set(d.formats);
  switch (cat) {
    case "print":
      return "For the best print quality, print from the full-resolution file (not the preview image) on a computer. In the print dialog choose \"Actual size\" or 100% rather than \"Fit to page\", and use the heaviest matte paper your printer takes. Colours can look a little different on paper than on screen. A local print shop usually gives the truest result."
        + (f.has("paper") ? " Make sure you're printing the version that matches your paper: US Letter or A4." : "");
    case "size": {
      const parts = [];
      if (f.has("paper")) parts.push("Your download includes both US Letter (8.5 × 11 in) and A4 (210 × 297 mm) versions, so pick the file that matches your paper.");
      if (f.has("sizes")) parts.push("There is a separate file for each common frame size, and each file name shows its size (for example 8x10 or 11x14). Choose the one that matches your frame and nothing will be cropped.");
      if (!parts.length) parts.push("Each file name shows its size, so please pick the one that matches your paper or frame.");
      return parts.join(" ") + (f.has("zip") ? " There's also a sizing guide inside the ZIP that lists every file." : "");
    }
    case "download":
      return "You can download your files any time. On Etsy, go to You → Purchases and reviews → Download files. On Gumroad, use the link in your receipt email or your Gumroad Library."
        + (f.has("zip") ? " The files come as a ZIP. On a computer, double-click it (Mac) or right-click → Extract All (Windows) to open it. Phones and tablets often can't open ZIP files, so a computer is easiest." : "");
    case "tablet":
      return f.has("links")
        ? "To keep the tabs and links working, import the PDF into GoodNotes, Notability or a similar app as a new document, not as images. In GoodNotes the links only respond in read-only mode, so turn the pen tool off before you tap a tab."
        : "This product is a printable file rather than a hyperlinked digital planner, so it doesn't have clickable tabs. You can still import the PDF into GoodNotes or Notability and write on it.";
    case "license":
      return {
        personal: "This file is for personal use: you're welcome to print it for yourself, your home or a gift, but it can't be resold or shared as a file.",
        small: "Your purchase includes a small-business commercial licence, so you can use the design in products you sell. The digital file itself can't be resold or shared.",
        full: "You're welcome to use this commercially, including in products you sell. The only thing I ask is that the digital files themselves aren't resold or shared as they are.",
      }[d.license];
    case "refund":
      return {
        fix: "I'm sorry it hasn't worked out as expected, and I'd really like to make it right. Could you tell me a bit more about what went wrong? A screenshot helps. Most file problems can be fixed within a day, and if we can't sort it out, I'll arrange a refund.",
        refund: "I'm sorry it wasn't what you were hoping for. I've started a refund for you, and it should appear on your original payment method within a few business days.",
        final: "I'm sorry it hasn't worked out as you'd hoped. Digital downloads can't be returned, so I can't offer a refund, but I'd love to help fix whatever isn't working. Just tell me what went wrong and I'll sort it out.",
      }[d.refund];
    default:
      return "Thanks for your message, I'm happy to help. Could you tell me a little more (and send a screenshot if something looks wrong) so I can point you to exactly the right fix?";
  }
}

function composeReply(d) {
  const cls = classifyMessage(d.message);
  const product = d.product || "your download";
  const shop = d.shop || "my shop";
  const lines = [`Hi ${d.buyer || "there"},`, ""];
  lines.push(cls.primary === "refund" || cls.primary === "general"
    ? `Thank you for getting in touch about ${product}.`
    : `Thank you so much for your order of ${product} from ${shop}!`);
  lines.push("");
  lines.push(replyParagraph(cls.primary, d));
  cls.secondary.forEach((c) => { lines.push(""); lines.push(replyParagraph(c, d)); });
  lines.push("", "If anything else comes up, just reply here and I'll help.", "", "Warmly,", d.signer || shop);
  return { ...cls, text: lines.join("\n") };
}

let replyState = null;

function initReply() {
  const ids = ["rShop", "rSigner", "rBuyer", "rProduct", "rLicense", "rRefund", "rMessage"];
  function inputs() {
    return {
      shop: $("rShop").value.trim(), signer: $("rSigner").value.trim(), buyer: $("rBuyer").value.trim(),
      product: $("rProduct").value.trim(), license: $("rLicense").value, refund: $("rRefund").value,
      formats: [...document.querySelectorAll(".rFormat:checked")].map((c) => c.value),
      message: $("rMessage").value,
    };
  }
  function applyInputs(d) {
    $("rShop").value = d.shop || ""; $("rSigner").value = d.signer || ""; $("rBuyer").value = d.buyer || "";
    $("rProduct").value = d.product || ""; $("rLicense").value = d.license; $("rRefund").value = d.refund;
    document.querySelectorAll(".rFormat").forEach((c) => { c.checked = (d.formats || []).includes(c.value); });
    $("rMessage").value = d.message || "";
  }
  function generate() {
    const d = inputs();
    if (!d.message.trim()) { showToast("Paste the buyer's message first"); $("rMessage").focus(); return; }
    replyState = { inputs: d, res: composeReply(d) };
    store("last_reply_out", replyState);
    renderReply(replyState);
  }
  const last = load("last_reply", null);
  if (last) applyInputs(last);
  const persist = () => store("last_reply", inputs());
  ids.forEach((id) => $(id).addEventListener("input", persist));
  document.querySelectorAll(".rFormat").forEach((c) => c.addEventListener("change", persist));
  const lastOut = load("last_reply_out", null);
  if (lastOut) { replyState = lastOut; renderReply(lastOut); }
  $("rGenerate").addEventListener("click", generate);

  const saveable = initSaveable({
    toolId: "reply", listEl: $("rSavedList"),
    getEntry: () => replyState && {
      name: `${REPLY_CATEGORIES[replyState.res.primary]?.label || "General"} reply${replyState.inputs.buyer ? ` to ${replyState.inputs.buyer}` : ""}`,
      meta: replyState.inputs.product || "Buyer message",
      payload: replyState.inputs,
    },
    applyEntry: (p) => { applyInputs(p); persist(); generate(); },
  });
  $("rSave").addEventListener("click", saveable.save);
  $("rCopy").addEventListener("click", () => copyText(replyState && replyState.res.text));
}

function renderReply(s) {
  const labels = [s.res.primary, ...s.res.secondary].map((k) => REPLY_CATEGORIES[k]?.label || "General question");
  $("rOutput").innerHTML = `
    <div class="chip-row">${labels.map((l, i) => `<span class="pill ${i === 0 ? "info" : "lost"}">${escapeHtml(i === 0 ? "Detected: " + l : "Also: " + l)}</span>`).join("")}</div>
    <pre class="reply-text">${escapeHtml(s.res.text)}</pre>`;
}

/* ================================================================== HANDOFF: Credit Planner */

function seasonInfo(cat, month) {
  const c = CATEGORY_SEASONS[cat];
  const n1 = (month % 12) + 1, n2 = ((month + 1) % 12) + 1;
  let s = 0, tag = null;
  if (c.peaks.includes(n1)) { s = 1; tag = "Peaks next month: build now"; }
  else if (c.peaks.includes(n2)) { s = 0.8; tag = "Peaks in about 6–8 weeks: build now so it indexes in time"; }
  else if (c.peaks.includes(month)) { s = 0.4; tag = "In season now (a little late)"; }
  if (c.evergreen > s) { s = c.evergreen; if (c.evergreen >= 0.4) tag = "Evergreen seller"; }
  return { score: s, tag };
}

/** Weighted allocation of this month's product credits (largest-remainder rounding). */
function planCredits({ month, credits, cats }, picked = {}, fees = getFees()) {
  const enabled = cats.filter((c) => c.enabled);
  if (!enabled.length) return { error: "Tick at least one category you make." };
  if (!(credits >= 1)) return { error: "Enter how many products you'll build this month." };
  const nets = enabled.map((c) => {
    const band = CATEGORY_SEASONS[c.name].band;
    const price = picked[c.name] != null ? picked[c.name] : band ? (band[0] + band[1]) / 2 : null;
    return price == null ? null : computeNet(price, "etsy", fees).net;
  });
  const known = nets.filter((n) => n != null);
  const maxNet = known.length ? Math.max(...known) : 0;
  const maxSales = Math.max(0, ...enabled.map((c) => c.sales || 0));
  const hasResults = maxSales > 0;
  const W = hasResults ? { season: 0.35, results: 0.4, value: 0.25 } : { season: 0.55, results: 0, value: 0.45 };
  const rows = enabled.map((c, i) => {
    const season = seasonInfo(c.name, month);
    const results = hasResults ? (c.sales || 0) / maxSales : 0;
    const value = nets[i] == null || maxNet <= 0 ? 0.5 : Math.max(0, nets[i]) / maxNet;
    const score = W.season * season.score + W.results * results + W.value * value;
    return { name: c.name, sales: c.sales || 0, season: r2(season.score), seasonTag: season.tag, results: r2(results), value: r2(value), net: nets[i], rawScore: score, score: r2(score), idx: i, slots: 0 };
  });
  const n = rows.length;
  const base = credits >= n ? 1 : 0;
  const R = credits - base * n;
  const S = rows.reduce((a, r) => a + r.rawScore, 0);
  const quotas = rows.map((r) => (S > 0 ? R * r.rawScore / S : R / n));
  rows.forEach((r, i) => { r.slots = base + Math.floor(quotas[i] + 1e-9); });
  let left = credits - rows.reduce((a, r) => a + r.slots, 0);
  const order = rows.map((r, i) => i).sort((a, b) => {
    const fa = quotas[a] - Math.floor(quotas[a] + 1e-9), fb = quotas[b] - Math.floor(quotas[b] + 1e-9);
    return fb - fa || rows[b].rawScore - rows[a].rawScore || a - b;
  });
  for (let k = 0; left > 0; k = (k + 1) % n, left--) rows[order[k]].slots += 1;
  rows.forEach((r) => {
    const tags = [];
    if (r.seasonTag) tags.push(r.seasonTag);
    if (hasResults && r.results >= 1) tags.push("Your top seller");
    else if (hasResults && r.results >= 0.5) tags.push("Selling well for you");
    if (r.net != null && maxNet > 0 && r.net >= maxNet - 0.005) tags.push("Highest net per sale");
    if (r.slots === 1 && base === 1 && r.score < 0.3) tags.push("Keeps one test slot");
    r.tags = tags;
  });
  rows.sort((a, b) => b.slots - a.slots || b.score - a.score || a.idx - b.idx);
  return { rows, hasResults, weights: W, credits, month };
}

let creditState = null;

function initCredits() {
  const now = new Date();
  $("cMonth").innerHTML = MONTH_NAMES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  $("cMonth").value = String(now.getMonth() + 1);
  $("cCats").innerHTML = PP_CATEGORIES.map((c) => `
    <div class="cat-row"><label class="check"><input type="checkbox" class="cEnabled" data-cat="${escapeHtml(c)}" checked /> ${escapeHtml(c)}</label>
    <input type="number" class="cSales" data-cat="${escapeHtml(c)}" min="0" step="1" value="0" aria-label="${escapeHtml(c)} sales" /></div>`).join("");

  function inputs() {
    return {
      month: Number($("cMonth").value),
      credits: Math.round(num("cCredits", 15)),
      cats: PP_CATEGORIES.map((c) => ({
        name: c,
        enabled: document.querySelector(`.cEnabled[data-cat="${CSS.escape(c)}"]`).checked,
        sales: Math.max(0, parseFloat(document.querySelector(`.cSales[data-cat="${CSS.escape(c)}"]`).value) || 0),
      })),
    };
  }
  function applyInputs(d) {
    $("cMonth").value = String(d.month);
    $("cCredits").value = d.credits;
    d.cats.forEach((c) => {
      const en = document.querySelector(`.cEnabled[data-cat="${CSS.escape(c.name)}"]`);
      const sa = document.querySelector(`.cSales[data-cat="${CSS.escape(c.name)}"]`);
      if (en) en.checked = c.enabled; if (sa) sa.value = c.sales;
    });
  }
  function plan() {
    const d = inputs();
    store("last_credits", d);
    const res = planCredits(d, load("picked_prices", {}));
    creditState = { inputs: d, res };
    renderCredits(creditState);
  }
  const last = load("last_credits", null);
  if (last) applyInputs(last);
  $("tool-credits").addEventListener("input", () => store("last_credits", inputs()));
  $("cPlan").addEventListener("click", plan);
  $("cPullTally").addEventListener("click", () => {
    const sales = load("sales", []);
    const since = todayISO(new Date(Date.now() - 90 * 86400000));
    const by = {};
    sales.filter((s) => s.date >= since).forEach((s) => { by[s.category] = (by[s.category] || 0) + (s.qty || 1); });
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    if (!total) { showToast("No sales in Tally from the last 90 days"); return; }
    document.querySelectorAll(".cSales").forEach((el) => { el.value = by[el.dataset.cat] || 0; });
    store("last_credits", inputs());
    showToast(`Pulled ${total} sales from Tally`);
  });
  if (last) plan();

  const saveable = initSaveable({
    toolId: "credits", listEl: $("cSavedList"),
    getEntry: () => creditState && !creditState.res.error && {
      name: `${MONTH_NAMES[creditState.inputs.month - 1]} build plan`,
      meta: creditState.res.rows.filter((r) => r.slots).map((r) => `${r.name} ${r.slots}`).slice(0, 3).join(", "),
      payload: creditState.inputs,
    },
    applyEntry: (p) => { applyInputs(p); plan(); },
  });
  $("cSave").addEventListener("click", saveable.save);
  $("cCopy").addEventListener("click", () => copyText(creditText(creditState)));
}

function renderCredits(s) {
  const out = $("cOutput");
  if (s.res.error) { out.innerHTML = `<p class="output-placeholder">${escapeHtml(s.res.error)}</p>`; return; }
  const r = s.res;
  out.innerHTML = `
    <p class="big-sub">${r.credits} products for ${MONTH_NAMES[r.month - 1]}, weighted by upcoming season${r.hasResults ? ", your own sales" : ""} and net per sale${r.hasResults ? "" : ". Add your sales per category to weight toward what already sells for you"}.</p>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Category</th><th class="num">Build</th><th>Weight</th><th>Why</th></tr></thead>
      <tbody>${r.rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td class="num"><strong>${row.slots}</strong></td>
        <td><div class="bar"><span style="width:${Math.round(row.score * 100)}%"></span></div></td>
        <td class="muted">${escapeHtml(row.tags.join(" · ") || "Balanced slot")}</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="callout">Shelfwise doesn't pick niches: that's ProductsPilot's Niche Finder and your 30 Niche Blueprints. It decides how to split your monthly products across categories.</div>`;
}

function creditText(s) {
  if (!s || s.res.error) return "";
  return [`${MONTH_NAMES[s.res.month - 1]} build plan (${s.res.credits} products)`,
    ...s.res.rows.filter((r) => r.slots > 0).map((r) => `- ${r.name}: ${r.slots}${r.tags.length ? ` (${r.tags.join("; ")})` : ""}`)].join("\n");
}

/* ================================================================== TALLY: Sales Log */

function computeSalesSummary(sales, month = "all") {
  const list = month === "all" ? sales : sales.filter((s) => monthKey(s.date) === month);
  const sum = { orders: 0, gross: 0, fees: 0, net: 0, byPlatform: {}, byCategory: {}, byProduct: {} };
  list.forEach((s) => {
    const q = s.qty || 1;
    sum.orders += q; sum.gross += s.price * q; sum.fees += s.fees * q; sum.net += s.net * q;
    for (const [bucket, key] of [["byPlatform", s.platformName || s.platform], ["byCategory", s.category], ["byProduct", s.product]]) {
      const b = sum[bucket][key] || (sum[bucket][key] = { orders: 0, gross: 0, net: 0 });
      b.orders += q; b.gross += s.price * q; b.net += s.net * q;
    }
  });
  sum.gross = r2(sum.gross); sum.fees = r2(sum.fees); sum.net = r2(sum.net);
  for (const bucket of ["byPlatform", "byCategory", "byProduct"]) {
    for (const b of Object.values(sum[bucket])) { b.gross = r2(b.gross); b.net = r2(b.net); }
  }
  const sortBy = (o) => Object.entries(o).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  sum.platforms = sortBy(sum.byPlatform);
  sum.categories = sortBy(sum.byCategory);
  sum.products = sortBy(sum.byProduct);
  sum.avgNet = sum.orders ? r2(sum.net / sum.orders) : 0;
  return sum;
}

function makeSale({ date, product, category, platform, price, qty, offsite }, fees = getFees()) {
  const res = computeNet(price, platform, fees, platform === "etsy" && offsite);
  return { id: uid(), date, product, category, platform, platformName: platformName(platform, fees), price: r2(price), qty, offsite: platform === "etsy" && !!offsite, fees: res.fees, net: res.net };
}

function initSales() {
  $("sDate").value = todayISO();
  $("sAdd").addEventListener("click", () => {
    const product = $("sProduct").value.trim();
    const price = num("sPrice", NaN);
    if (!product) { showToast("Enter the product"); $("sProduct").focus(); return; }
    if (!(price >= 0)) { showToast("Enter the price"); $("sPrice").focus(); return; }
    const sale = makeSale({ date: $("sDate").value || todayISO(), product, category: $("sCategory").value, platform: $("sPlatform").value,
      price, qty: Math.max(1, Math.round(num("sQty", 1))), offsite: $("sOffsite").checked });
    const sales = load("sales", []);
    sales.push(sale);
    sales.sort((a, b) => b.date.localeCompare(a.date));
    store("sales", sales);
    store("last_sale_form", { category: sale.category, platform: sale.platform, price: sale.price });
    $("sQty").value = 1; $("sOffsite").checked = false;
    store("sales_month", monthKey(sale.date));
    renderSales(); refreshProductNames(); showToast(`Logged: you keep ${money(sale.net * sale.qty)}`);
  });
  const lastForm = load("last_sale_form", null);
  if (lastForm) { $("sCategory").value = lastForm.category; $("sPlatform").value = lastForm.platform; $("sPrice").value = lastForm.price; }
  $("sMonth").addEventListener("change", () => { store("sales_month", $("sMonth").value); renderSales(false); });
  $("sTable").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-del]"); if (!b) return;
    if (!window.confirm("Delete this sale?")) return;
    store("sales", load("sales", []).filter((s) => s.id !== b.dataset.del));
    renderSales(); showToast("Sale deleted");
  });
  $("sExport").addEventListener("click", () => {
    const sales = load("sales", []);
    if (!sales.length) { showToast("No sales to export"); return; }
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Date", "Product", "Category", "Platform", "Price", "Qty", "Offsite Ads", "Fees each", "Net each", "Net total"]]
      .concat(sales.map((s) => [s.date, s.product, s.category, s.platformName, s.price.toFixed(2), s.qty, s.offsite ? "yes" : "no", s.fees.toFixed(2), s.net.toFixed(2), (s.net * s.qty).toFixed(2)]));
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `shelfwise-sales-${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    showToast("CSV downloaded");
  });
  const saveable = initSaveable({
    toolId: "sales", listEl: $("sSavedList"),
    getEntry: () => {
      const sales = load("sales", []);
      if (!sales.length) return null;
      const s = computeSalesSummary(sales);
      return { name: `Ledger snapshot — ${sales.length} entries`, meta: `${money(s.net)} net all time`, payload: { sales, month: $("sMonth").value } };
    },
    applyEntry: (p) => { store("sales", p.sales); store("sales_month", p.month); renderSales(); refreshProductNames(); },
    confirmOpen: "Replace your current Sales Log with this snapshot?",
  });
  $("sSave").addEventListener("click", saveable.save);
  $("sCopy").addEventListener("click", () => copyText(salesText(computeSalesSummary(load("sales", []), $("sMonth").value), $("sMonth").value)));
  renderSales();
}

function monthOptions(sales, extraMonths = 0) {
  const set = new Set(sales.map((s) => monthKey(s.date)));
  let k = monthKey(todayISO());
  for (let i = 0; i <= extraMonths; i++) { set.add(k); k = prevMonthKey(k); }
  set.add(monthKey(todayISO()));
  return [...set].sort().reverse();
}

function renderSales(rebuildMonths = true) {
  const sales = load("sales", []);
  if (rebuildMonths) {
    const want = load("sales_month", "all");
    const opts = monthOptions(sales);
    $("sMonth").innerHTML = `<option value="all">All time</option>` + opts.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
    $("sMonth").value = opts.includes(want) || want === "all" ? want : "all";
  }
  const month = $("sMonth").value;
  const s = computeSalesSummary(sales, month);
  const list = month === "all" ? sales : sales.filter((x) => monthKey(x.date) === month);
  if (!sales.length) {
    $("sOutput").innerHTML = `<p class="output-placeholder">Log your first sale on the left. ProductsPilot can't see your marketplace sales, so this is where you keep them.</p>`;
    $("sTable").innerHTML = "";
    return;
  }
  const breakdown = (rows) => `<table class="data-table"><thead><tr><th></th><th class="num">Orders</th><th class="num">Gross</th><th class="num">Net</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${r.orders}</td><td class="num">${money(r.gross)}</td><td class="num"><strong>${money(r.net)}</strong></td></tr>`).join("")}</tbody></table>`;
  $("sOutput").innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="stat-label">Orders</div><div class="stat-value">${s.orders}</div></div>
      <div class="stat"><div class="stat-label">Gross</div><div class="stat-value">${money(s.gross)}</div></div>
      <div class="stat"><div class="stat-label">Fees</div><div class="stat-value">${money(s.fees)}</div></div>
      <div class="stat"><div class="stat-label">You kept</div><div class="stat-value">${money(s.net)}</div><div class="stat-note">${money(s.avgNet)} per order</div></div>
    </div>
    ${s.orders ? `<div class="section-title">By platform</div>${breakdown(s.platforms)}
    <div class="section-title">By category</div>${breakdown(s.categories)}
    <div class="section-title">Top products</div>${breakdown(s.products.slice(0, 5))}` : `<p class="output-placeholder">No sales in this month yet.</p>`}
    <div class="section-title">Entries</div>`;
  $("sTable").innerHTML = list.length ? `<table class="data-table"><thead><tr><th>Date</th><th>Product</th><th>Platform</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Net</th><th></th></tr></thead>
    <tbody>${list.map((x) => `<tr><td>${x.date}</td><td>${escapeHtml(x.product)}</td><td>${escapeHtml(x.platformName)}${x.offsite ? " (Offsite)" : ""}</td><td class="num">${money(x.price)}</td><td class="num">${x.qty}</td><td class="num">${money(x.net * x.qty)}</td>
    <td><button class="ghost-btn danger" data-del="${escapeHtml(x.id)}" aria-label="Delete sale">Delete</button></td></tr>`).join("")}</tbody></table>` : "";
}

function salesText(s, month) {
  if (!s.orders) return "";
  return [`Sales — ${month === "all" ? "all time" : monthLabel(month)}`,
    `Orders: ${s.orders} · Gross: ${money(s.gross)} · Fees: ${money(s.fees)} · Kept: ${money(s.net)}`,
    "By platform:", ...s.platforms.map((p) => `- ${p.name}: ${p.orders} orders, ${money(p.net)} kept`),
    "By category:", ...s.categories.map((p) => `- ${p.name}: ${p.orders} orders, ${money(p.net)} kept`)].join("\n");
}

/* ================================================================== TALLY: Listing Triage */

const VERDICTS = {
  early: { label: "Too early to judge", cls: "lost", action: "New listings need about three weeks to get indexed and tested. Leave it alone and keep adding products." },
  winner: { label: "Winner", cls: "won", action: "Build 2–3 more products in this niche and style, and list this one on every platform you use." },
  visibility: { label: "Visibility problem", cls: "warn", action: "Under 1 view a day, so buyers aren't finding it. Swap the first mockup image, move the main search phrase to the front of the title, and use all 13 Etsy tags." },
  conversion: { label: "Conversion problem", cls: "warn", action: "Plenty of views but no sales. Check the price in Priced → Price Point Picker, make sure the first image shows the whole set, and state the sizes in the first line of the description." },
  promising: { label: "Promising", cls: "info", action: "It's selling. Give it a few more weeks; at 3 sales it becomes a winner to build more of." },
  watching: { label: "Keep watching", cls: "lost", action: "Getting some views but no sales yet. Check again in a week. If it passes 100 views with no sale, it's a conversion problem." },
};

function triageVerdict(l, today = todayISO()) {
  const days = Math.max(0, daysBetween(l.listed, today));
  const views = l.views || 0, sales = l.sales || 0, favs = l.favs || 0;
  let key;
  if (days < EARLY_DAYS) key = "early";
  else if (sales >= 3) key = "winner";
  else if (views / Math.max(days, 1) < 1) key = "visibility";
  else if (views >= 100 && sales === 0) key = "conversion";
  else if (sales >= 1) key = "promising";
  else key = "watching";
  let action = VERDICTS[key].action;
  if (key === "conversion" && views > 0 && favs / views >= 0.05) action += " Lots of favourites: a small price drop or a sale event may tip them over.";
  return { key, label: VERDICTS[key].label, cls: VERDICTS[key].cls, action, days };
}

function initTriage() {
  $("tListed").value = todayISO();
  $("tAdd").addEventListener("click", () => {
    const name = $("tName").value.trim();
    if (!name) { showToast("Enter the listing name"); $("tName").focus(); return; }
    const l = load("listings", []);
    l.push({ id: uid(), name, category: $("tCategory").value, platform: $("tPlatform").value, listed: $("tListed").value || todayISO(),
      views: Math.max(0, Math.round(num("tViews"))), favs: Math.max(0, Math.round(num("tFavs"))), sales: Math.max(0, Math.round(num("tSales"))) });
    store("listings", l);
    $("tName").value = ""; $("tViews").value = 0; $("tFavs").value = 0; $("tSales").value = 0;
    renderTriage(); refreshProductNames(); showToast("Listing added");
  });
  $("tTable").addEventListener("change", (e) => {
    const inp = e.target.closest("input[data-field]"); if (!inp) return;
    const l = load("listings", []);
    const item = l.find((x) => x.id === inp.closest("tr").dataset.id); if (!item) return;
    item[inp.dataset.field] = Math.max(0, Math.round(parseFloat(inp.value) || 0));
    store("listings", l); renderTriage();
  });
  $("tTable").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-del]"); if (!b) return;
    if (!window.confirm("Remove this listing?")) return;
    store("listings", load("listings", []).filter((x) => x.id !== b.dataset.del)); renderTriage();
  });
  $("tCountSales").addEventListener("click", () => {
    const sales = load("sales", []);
    const l = load("listings", []);
    if (!l.length) { showToast("Add a listing first"); return; }
    let matched = 0;
    l.forEach((x) => {
      const n = sales.filter((s) => s.product.trim().toLowerCase() === x.name.trim().toLowerCase() && s.platform === x.platform)
        .reduce((a, s) => a + (s.qty || 1), 0);
      if (n) matched++;
      x.sales = n;
    });
    store("listings", l); renderTriage();
    showToast(`Counted sales for ${matched} of ${l.length} listings`);
  });
  const saveable = initSaveable({
    toolId: "triage", listEl: $("tSavedList"),
    getEntry: () => {
      const l = load("listings", []);
      if (!l.length) return null;
      const counts = triageCounts(l);
      return { name: `Triage snapshot — ${l.length} listings`, meta: `${counts.winner || 0} winners, ${(counts.visibility || 0) + (counts.conversion || 0)} to fix`, payload: { listings: l } };
    },
    applyEntry: (p) => { store("listings", p.listings); renderTriage(); refreshProductNames(); },
    confirmOpen: "Replace your current listings with this snapshot?",
  });
  $("tSave").addEventListener("click", saveable.save);
  $("tCopy").addEventListener("click", () => copyText(triageText(load("listings", []))));
  renderTriage();
}

function triageCounts(listings, today = todayISO()) {
  const c = {};
  listings.forEach((l) => { const k = triageVerdict(l, today).key; c[k] = (c[k] || 0) + 1; });
  return c;
}
const VERDICT_ORDER = ["conversion", "visibility", "winner", "promising", "watching", "early"];

function renderTriage() {
  // Blur a focused table input first: removing it mid-edit fires `change`, which would re-enter this render.
  if ($("tTable").contains(document.activeElement)) document.activeElement.blur();
  const l = load("listings", []);
  const today = todayISO();
  if (!l.length) {
    $("tTable").innerHTML = `<p class="output-placeholder">Add your listings on the left. You'll get a verdict and a next step for each one.</p>`;
    $("tOutput").innerHTML = `<p class="output-placeholder">Your action list appears here.</p>`;
    return;
  }
  const rows = l.map((x) => ({ ...x, v: triageVerdict(x, today) }))
    .sort((a, b) => VERDICT_ORDER.indexOf(a.v.key) - VERDICT_ORDER.indexOf(b.v.key) || a.name.localeCompare(b.name));
  $("tTable").innerHTML = `<table class="data-table"><thead><tr><th>Listing</th><th class="num">Days</th><th class="num">Views</th><th class="num">Favs</th><th class="num">Sales</th><th>Verdict</th><th></th></tr></thead>
    <tbody>${rows.map((x) => `<tr data-id="${escapeHtml(x.id)}"><td><strong>${escapeHtml(x.name)}</strong><div class="muted">${escapeHtml(platformName(x.platform))} · ${escapeHtml(x.category)}</div></td>
    <td class="num">${x.v.days}</td>
    <td class="num"><input type="number" min="0" data-field="views" value="${x.views}" aria-label="Views" /></td>
    <td class="num"><input type="number" min="0" data-field="favs" value="${x.favs}" aria-label="Favourites" /></td>
    <td class="num"><input type="number" min="0" data-field="sales" value="${x.sales}" aria-label="Sales" /></td>
    <td><span class="pill ${x.v.cls}">${x.v.label}</span></td>
    <td><button class="ghost-btn danger" data-del="${escapeHtml(x.id)}">Remove</button></td></tr>`).join("")}</tbody></table>`;
  const counts = triageCounts(l, today);
  const actionable = rows.filter((x) => x.v.key !== "early" && x.v.key !== "watching");
  $("tOutput").innerHTML = `
    <div class="chip-row">${VERDICT_ORDER.filter((k) => counts[k]).map((k) => `<span class="pill ${VERDICTS[k].cls}">${counts[k]} ${VERDICTS[k].label.toLowerCase()}</span>`).join("")}</div>
    ${actionable.length ? `<ul class="reason-list">${actionable.map((x) => `<li><strong>${escapeHtml(x.name)}</strong> (${x.v.label}): ${escapeHtml(x.v.action)}</li>`).join("")}</ul>`
      : `<p class="output-placeholder">Nothing needs action yet. Keep listing, and update views and sales weekly.</p>`}`;
}

function triageText(listings) {
  if (!listings.length) return "";
  const today = todayISO();
  return ["Listing triage", ...listings.map((x) => { const v = triageVerdict(x, today); return `- ${x.name}: ${v.label}. ${v.action}`; })].join("\n");
}

/* ================================================================== TALLY: Monthly Report */

function computeReport({ month, pace }, sales, listings, today = todayISO()) {
  const cur = computeSalesSummary(sales, month);
  const prev = computeSalesSummary(sales, prevMonthKey(month));
  const end = lastDayOfMonth(month);
  const live = listings.filter((l) => l.listed <= end);
  const added = listings.filter((l) => monthKey(l.listed) === month).length;
  const counts = triageCounts(live, today);
  return {
    month, cur, prev,
    // One decimal, rounded once from the raw ratio (rounding to cents first would double-round).
    netChange: prev.net > 0 ? Math.round((cur.net - prev.net) / prev.net * 1000) / 10 : null,
    listingsLive: live.length, added, pace,
    pacePct: pace > 0 ? Math.round(added / pace * 100) : 0,
    counts,
    winners: live.filter((l) => triageVerdict(l, today).key === "winner").map((l) => l.name),
    toFix: live.filter((l) => ["visibility", "conversion"].includes(triageVerdict(l, today).key)).map((l) => ({ name: l.name, label: triageVerdict(l, today).label })),
  };
}

let reportState = null;

function initReport() {
  function fillMonths() {
    const opts = monthOptions(load("sales", []), 11);
    const cur = $("rpMonth").value;
    $("rpMonth").innerHTML = opts.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
    if (opts.includes(cur)) $("rpMonth").value = cur;
  }
  fillMonths();
  document.addEventListener("shelfwise:tool", (e) => { if (e.detail === "report") fillMonths(); });
  function inputs() { return { month: $("rpMonth").value, shop: $("rpShop").value.trim(), pace: Math.max(1, Math.round(num("rpPace", 15))) }; }
  function applyInputs(d) {
    if (![...$("rpMonth").options].some((o) => o.value === d.month)) $("rpMonth").insertAdjacentHTML("beforeend", `<option value="${d.month}">${monthLabel(d.month)}</option>`);
    $("rpMonth").value = d.month; $("rpShop").value = d.shop || ""; $("rpPace").value = d.pace;
  }
  function build() {
    const d = inputs();
    store("last_report", d);
    reportState = { inputs: d, res: computeReport(d, load("sales", []), load("listings", [])), builtOn: todayISO() };
    renderReport(reportState);
  }
  const last = load("last_report", null);
  if (last) applyInputs(last);
  ["rpShop", "rpPace", "rpMonth"].forEach((id) => $(id).addEventListener("input", () => store("last_report", inputs())));
  $("rpBuild").addEventListener("click", build);
  $("rpPrint").addEventListener("click", () => {
    if (!reportState) { showToast("Build the report first"); return; }
    document.body.classList.add("printing-report");
    window.print();
  });
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-report"));

  const saveable = initSaveable({
    toolId: "report", listEl: $("rpSavedList"),
    getEntry: () => reportState && {
      name: `${monthLabel(reportState.inputs.month)} report${reportState.inputs.shop ? ` — ${reportState.inputs.shop}` : ""}`,
      meta: `${money(reportState.res.cur.net)} kept, ${reportState.res.cur.orders} orders`,
      payload: reportState,
    },
    applyEntry: (p) => { applyInputs(p.inputs); reportState = p; renderReport(p); },
  });
  $("rpSave").addEventListener("click", saveable.save);
  $("rpCopy").addEventListener("click", () => copyText(reportText(reportState)));
}

function renderReport(s) {
  const r = s.res, d = s.inputs, c = r.cur;
  const change = r.netChange == null ? (r.prev.orders ? "" : "no sales the month before") : `${r.netChange >= 0 ? "+" : ""}${r.netChange.toFixed(1)}% vs last month`;
  const rows = (list) => list.length ? list.map((x) => `<tr><td>${escapeHtml(x.name)}</td><td class="num">${x.orders}</td><td class="num">${money(x.gross)}</td><td class="num">${money(x.net)}</td></tr>`).join("")
    : `<tr><td colspan="4">No sales this month.</td></tr>`;
  $("rpOutput").innerHTML = `<div class="paper">
    <h2>${escapeHtml(d.shop || "My shop")} — ${monthLabel(d.month)}</h2>
    <p class="paper-sub">Monthly Shelf Report · built ${s.builtOn}</p>
    <div class="kpis">
      <div class="kpi"><div class="kpi-l">Kept</div><div class="kpi-v">${money(c.net)}</div><div class="kpi-n">${escapeHtml(change)}</div></div>
      <div class="kpi"><div class="kpi-l">Gross</div><div class="kpi-v">${money(c.gross)}</div><div class="kpi-n">${money(c.fees)} in fees</div></div>
      <div class="kpi"><div class="kpi-l">Orders</div><div class="kpi-v">${c.orders}</div><div class="kpi-n">${money(c.avgNet)} kept each</div></div>
      <div class="kpi"><div class="kpi-l">Added</div><div class="kpi-v">${r.added} / ${r.pace}</div><div class="kpi-n">${r.pacePct}% of pace · ${r.listingsLive} live</div></div>
    </div>
    <h3>By platform</h3>
    <table><thead><tr><th>Platform</th><th class="num">Orders</th><th class="num">Gross</th><th class="num">Kept</th></tr></thead><tbody>${rows(c.platforms)}</tbody></table>
    <h3>By category</h3>
    <table><thead><tr><th>Category</th><th class="num">Orders</th><th class="num">Gross</th><th class="num">Kept</th></tr></thead><tbody>${rows(c.categories)}</tbody></table>
    <h3>Shelf health</h3>
    <p>${r.listingsLive} listings live by month end. ${VERDICT_ORDER.filter((k) => r.counts[k]).map((k) => `${r.counts[k]} ${VERDICTS[k].label.toLowerCase()}`).join(", ") || "No listings tracked in Listing Triage yet."}.</p>
    ${r.winners.length ? `<p><strong>Winners to build more of:</strong> ${r.winners.map(escapeHtml).join(", ")}</p>` : ""}
    ${r.toFix.length ? `<p><strong>To fix:</strong> ${r.toFix.map((x) => `${escapeHtml(x.name)} (${x.label.toLowerCase()})`).join(", ")}</p>` : ""}
    <p class="foot">Figures come from the sales you logged in Shelfwise. Fees use the rates set in Priced at the time each sale was logged.</p>
  </div>`;
}

function reportText(s) {
  if (!s) return "";
  const r = s.res, c = r.cur;
  return [`${s.inputs.shop || "My shop"} — ${monthLabel(s.inputs.month)} Shelf Report`,
    `Kept: ${money(c.net)}${r.netChange != null ? ` (${r.netChange >= 0 ? "+" : ""}${r.netChange.toFixed(1)}% vs last month)` : ""}`,
    `Gross: ${money(c.gross)} · Fees: ${money(c.fees)} · Orders: ${c.orders}`,
    `Products added: ${r.added} of ${r.pace} (${r.pacePct}%) · Listings live: ${r.listingsLive}`,
    ...(r.winners.length ? [`Winners: ${r.winners.join(", ")}`] : []),
    ...(r.toFix.length ? [`To fix: ${r.toFix.map((x) => `${x.name} (${x.label})`).join(", ")}`] : [])].join("\n");
}

/* ================================================================== shared selects */

function fillSharedSelects() {
  document.querySelectorAll(".category-select").forEach((s) => {
    s.innerHTML = ALL_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  });
  refreshPlatformSelects();
}
function refreshPlatformSelects() {
  const fees = getFees();
  document.querySelectorAll(".platform-select").forEach((s) => {
    const cur = s.value;
    s.innerHTML = PLATFORM_KEYS.map((k) => `<option value="${k}">${escapeHtml(platformName(k, fees))}</option>`).join("");
    if (cur) s.value = cur;
  });
}
function refreshProductNames() {
  const names = new Set([...load("queue", []).map((p) => p.name), ...load("sales", []).map((s) => s.product), ...load("listings", []).map((l) => l.name)]);
  $("productNames").innerHTML = [...names].sort().map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
}

/* ================================================================== boot */

document.addEventListener("DOMContentLoaded", () => {
  initGate();
  initTheme();
  initTabs();
  initSubtabs();
  fillSharedSelects();
  initNet();
  initPrice();
  initPayback();
  initQueue();
  initReply();
  initCredits();
  initSales();
  initTriage();
  initReport();
  refreshProductNames();
  document.addEventListener("shelfwise:fees", refreshPlatformSelects);
  document.addEventListener("shelfwise:tab", (e) => {
    if (e.detail === "tally") { renderSales(); renderTriage(); }
    if (e.detail === "handoff") renderQueue();
  });
});
