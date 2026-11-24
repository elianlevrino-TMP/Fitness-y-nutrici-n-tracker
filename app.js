'use strict';
/* ================= Utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = n => Math.round(n || 0);
const r1 = n => Math.round((n || 0) * 10) / 10;
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmt = n => r0(n).toLocaleString('es');

const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => iso(new Date());
const addDays = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const shortDate = k => new Date(k + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' });
const dayLabel = k => {
  if (k === today()) return 'Hoy';
  if (k === addDays(today(), -1)) return 'Ayer';
  return new Date(k + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
};

/* ================= Constantes ================= */
const APP_V = 12; // subirla junto con CACHE en sw.js en cada publicación
const MEALS = [['des', 'Desayuno'], ['alm', 'Almuerzo'], ['mer', 'Merienda'], ['cen', 'Cena'], ['snk', 'Snack']];
const ACTS = [
  [1.2, 'Sedentario (oficina, casi no camino)'],
  [1.375, 'Ligero (camino algo, de pie a ratos)'],
  [1.55, 'Moderado (trabajo activo, muchos pasos)'],
  [1.725, 'Muy activo (trabajo físico)'],
];
const GOALS = { cut: { l: 'Perder grasa', adj: -400 }, maint: { l: 'Mantener peso', adj: 0 }, bulk: { l: 'Ganar músculo', adj: 300 } };

/* ================= Datos (guardados en el teléfono) ================= */
const KEY = 'fitlog-v1';
const DEF = () => ({ profile: null, foods: [], exs: [], combos: [], days: {} });
let S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); return d && typeof d === 'object' ? Object.assign(DEF(), d) : DEF(); }
  catch (e) { return DEF(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ No se pudo guardar'); }
  Sync.schedule();
}
function getDay(k) { const d = S.days[k]; return { meals: d?.meals || [], work: d?.work || [], weight: d?.weight || 0 }; }
function dayW(k) { const d = (S.days[k] ||= {}); d.meals ||= []; d.work ||= []; return d; }

const allFoods = () => S.foods.concat(FOODS);
const foodById = id => { id = FOOD_ALIAS[id] || id; return allFoods().find(f => f.id === id); };
const allExs = () => S.exs.concat(EXS);
const exByName = n => allExs().find(e => norm(e.n) === norm(n));
const macro = (f, g) => ({ k: f.k * g / 100, p: f.p * g / 100, c: f.c * g / 100, f: f.f * g / 100 });

const POP = new Set(Object.values(FOOD_ALIAS)); // alimentos más comunes (los de la primera versión)
// Sinónimos de otros países → nombre usado en la base (así "fresas" encuentra "Frutillas")
const SYN = {
  fresa: 'frutilla', fresas: 'frutilla', platano: 'banana', platanos: 'banana', frijol: 'poroto', frijoles: 'poroto',
  judias: 'poroto', alubias: 'alubia', aguacate: 'palta', boniato: 'batata', camote: 'batata', patata: 'papa', patatas: 'papa',
  elote: 'choclo', maiz: 'maiz', calabacin: 'zucchini', zapallito: 'zapallito', pina: 'anana', melocoton: 'durazno',
  guisantes: 'arveja', chicharos: 'arveja', ejotes: 'chaucha', vainitas: 'chaucha', pimiento: 'morron', pimenton: 'pimenton',
  jitomate: 'tomate', setas: 'hongo', champinon: 'champinon', tocino: 'panceta', bacon: 'panceta', beicon: 'panceta',
  molida: 'picada', gambas: 'langostino', camaron: 'camaron', nata: 'crema', zumo: 'jugo', toronja: 'pomelo',
  cacahuate: 'mani', cacahuete: 'mani', palomitas: 'pochoclo', refresco: 'gaseosa', soda: 'soda', galleta: 'galleta',
  mantequilla: 'manteca', requeson: 'ricota', frutos: 'frutos',
};
function search(list, q, lim = 8) {
  const ws = norm(q).split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const hit = (n, w) => n.includes(w) || (SYN[w] && n.includes(SYN[w]));
  // Puntaje (menor = mejor): palabra completa al principio > palabra suelta > dentro de otra palabra ("repollo")
  const pos = (n, w) => {
    for (const t of [w, SYN[w]]) {
      if (!t) continue;
      const m = n.match(new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      if (m) return m.index;
      const i = n.indexOf(t); if (i >= 0) return 100 + i;
    }
    return 200;
  };
  const bonus = x => (String(x.id).startsWith('c:') ? 30 : 0) + (POP.has(x.id) ? 20 : 0); // tuyos y comunes primero
  return list.filter(x => { const n = norm(x.n); return ws.every(w => hit(n, w)); })
    .map(x => { const n = norm(x.n); return [ws.reduce((s, w) => s + pos(n, w), 0) + n.length / 100 - bonus(x), x]; })
    .sort((a, b) => a[0] - b[0]).slice(0, lim).map(a => a[1]);
}
const sortedDays = () => Object.keys(S.days).sort().reverse();
function recentFoods() {
  const out = [], seen = new Set();
  for (const k of sortedDays()) for (const m of [...(S.days[k].meals || [])].reverse()) {
    const f = foodById(m.fid);
    if (!f || seen.has(f.id)) continue; seen.add(f.id); out.push(f);
    if (out.length >= 8) return out;
  }
  return out;
}
function recentExs() {
  const out = [];
  for (const k of sortedDays()) for (const w of S.days[k].work || []) {
    if (!out.some(n => norm(n) === norm(w.n))) out.push(w.n);
    if (out.length >= 8) return out;
  }
  return out;
}

/* ================= Cálculos ================= */
function weightOn(k) {
  let w = 0, bk = '';
  for (const [d, v] of Object.entries(S.days)) if (v.weight && d <= k && d > bk) { bk = d; w = v.weight; }
  return w || S.profile?.weight || 70;
}
// Metabolismo basal: Mifflin-St Jeor (1990), la ecuación más precisa en la revisión de Frankenfield et al. 2005
function bmr(k) { const p = S.profile, w = weightOn(k); return 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161); }
// Grasa corporal estimada por IMC, edad y sexo: Deurenberg et al. 1991 (Br J Nutr), error típico ±4 puntos
function bodyFatKg(k) {
  const p = S.profile, w = weightOn(k), bmi = w / (p.height / 100) ** 2;
  return w * clamp(1.2 * bmi + 0.23 * p.age - 10.8 * (p.sex === 'm' ? 1 : 0) - 5.4, 5, 60) / 100;
}
// Energía de 1 kg de cambio de peso (no siempre 7700): parte es grasa (39,5 MJ/kg ≈ 9441 kcal) y parte
// masa magra (7,6 MJ/kg ≈ 1816 kcal) — Hall, Lancet 2011. La proporción depende de tu grasa corporal
// (ecuación de Forbes: ΔMagra/ΔPeso = 10,4 / (10,4 + kg de grasa)) — Hall, Br J Nutr 2007.
function kcalPerKg(k) {
  const fm = Math.max(bodyFatKg(k), 5), fat = fm / (10.4 + fm);
  return fat * 9441 + (1 - fat) * 1816;
}
// Gasto de un entreno: solo lo que suma POR ENCIMA del reposo (MET − 1), escalado a tu basal real y con
// +15% por el consumo posterior (EPOC). Fórmula de las Dietary Reference Intakes (IOM 2005):
// ΔPAL = (MET − 1) × (1,15 / 0,9) × minutos / 1440  →  kcal = ΔPAL × basal
const exKcal = (met, min, k) => Math.max(0, met - 1) * (1.15 / 0.9) * (min / 1440) * bmr(k);
const wKcal = (w, k) => (S.profile && w.met && w.min ? exKcal(w.met, w.min, k) : w.kcal || 0);
function totals(k) {
  const d = getDay(k), t = { k: 0, p: 0, c: 0, f: 0 };
  for (const m of d.meals) { t.k += m.k; t.p += m.p; t.c += m.c; t.f += m.f; }
  t.ex = d.work.reduce((a, w) => a + wKcal(w, k), 0);
  if (!S.profile) return t;
  const w = weightOn(k);
  t.bmr = bmr(k);
  t.adj = S.profile.adj || 0;               // corrección según tu peso real (ajuste automático)
  t.base = t.bmr * S.profile.act + t.adj;   // basal + vida diaria (sin entreno)
  t.out = t.base + t.ex;                    // gasto total del día
  t.goal = t.out + GOALS[S.profile.goal].adj; // lo que deberías comer
  t.tP = S.profile.prot * w;                // 1,6–2,2 g/kg (Morton et al. 2018, Br J Sports Med)
  t.tF = t.goal * 0.25 / 9;                 // 25% de las calorías (rango aceptable 20–35%, IOM 2005)
  t.tC = Math.max(0, (t.goal - t.tP * 4 - t.tF * 9) / 4);
  t.bal = t.k - t.out;
  return t;
}
/* ---------- Ajuste automático según tu peso real ----------
   Con 3 semanas de datos: gasto real = lo que comiste en promedio − (cambio de peso × energía por kg).
   Es el "método de balance de ingesta" validado con agua doblemente marcada (de Jonge et al. 2007, CALERIE),
   con el cambio de reservas estimado por la tendencia del peso y kcalPerKg() en lugar de DXA.
   Se compara con lo que estima la fórmula (basal × actividad + entrenos) y la diferencia es la corrección.
   Solo se usan días "completos" (comiste al menos la mitad de tu objetivo) y la tendencia del peso
   por regresión lineal, para que el agua o un día suelto no muevan el resultado. */
const ADJ = { days: 21, minDays: 10, minWeigh: 4, minSpan: 14, minDiff: 100, step: 250, max: 600 };
const dayNum = k => Math.round(new Date(k + 'T12:00:00').getTime() / 864e5);
const round10 = n => Math.round(n / 10) * 10;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function adaptive() {
  if (!S.profile) return null;
  const end = today(), start = addDays(end, -(ADJ.days - 1)), cur = S.profile.adj || 0;
  const ws = [], used = [];
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const d = S.days[k]; if (!d) continue;
    if (d.weight) ws.push({ x: dayNum(k), y: d.weight });
    if (k < end && d.meals?.length) { // hoy no cuenta: el día no terminó
      const t = totals(k);
      if (t.k >= t.goal * 0.5) used.push({ eat: t.k, model: t.out - cur });
    }
  }
  const span = ws.length > 1 ? ws[ws.length - 1].x - ws[0].x : 0;
  const st = { cur, days: used.length, weigh: ws.length, span };
  if (used.length < ADJ.minDays || ws.length < ADJ.minWeigh || span < ADJ.minSpan) return { ...st, ok: false };
  // pendiente del peso (kg por día) por mínimos cuadrados
  const mx = ws.reduce((a, p) => a + p.x, 0) / ws.length, my = ws.reduce((a, p) => a + p.y, 0) / ws.length;
  const slope = ws.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / ws.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const eat = used.reduce((a, d) => a + d.eat, 0) / used.length, model = used.reduce((a, d) => a + d.model, 0) / used.length;
  const rho = kcalPerKg(end), real = eat - slope * rho;
  const target = clamp(round10(real - model), -ADJ.max, ADJ.max);
  const next = clamp(cur + clamp(target - cur, -ADJ.step, ADJ.step), -ADJ.max, ADJ.max);
  // después de aplicar un ajuste se espera una semana antes de proponer otro (cambios de a poco)
  const wait = S.profile.adjAt && S.profile.adjAt > addDays(end, -7) ? addDays(S.profile.adjAt, 7) : '';
  return { ...st, ok: true, eat, model: model + cur, real, rho, week: slope * 7, target, next, wait, propose: !wait && Math.abs(target - cur) >= ADJ.minDiff };
}
const fmtKg = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(r1(n))).replace('.', ',')} kg`;
const signK = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

const cleanSets = () => ui.sets.map(s => ({ kg: num(s.kg), reps: Math.round(num(s.reps)) })).filter(s => s.reps > 0);
const exMinutes = (t, sets, manual) => num(manual) > 0 ? num(manual) : (t === 'f' ? sets.length * 3 : 0);
const volume = sets => (sets || []).reduce((a, s) => a + s.kg * s.reps, 0);
const e1rm = s => s.reps === 1 ? s.kg : s.kg * (1 + s.reps / 30); // Epley
const setsTxt = w => w.t === 'f'
  ? (w.sets || []).map(s => s.kg ? `${r1(s.kg)}×${s.reps}` : `${s.reps} reps`).join(' · ')
  : `${r0(w.min)} min`;
function lastSession(name, before) {
  for (const k of sortedDays()) {
    if (k >= before) continue;
    const ws = (S.days[k].work || []).filter(w => norm(w.n) === norm(name));
    if (ws.length) return { k, w: ws[ws.length - 1] };
  }
  return null;
}

/* ================= Estado de la interfaz ================= */
function defaultMeal() { const h = new Date().getHours(); return h < 11 ? 'des' : h < 16 ? 'alm' : h < 20 ? 'mer' : 'cen'; }
const ui = {
  tab: S.profile ? 'hoy' : 'perfil', date: today(),
  foodQ: '', food: null, grams: '', meal: defaultMeal(), newFood: false, nf: null,
  exQ: '', exSel: null, sets: [], minutes: '', editId: null, progEx: '',
};

/* ================= Vistas ================= */
function bar(label, v, target, cls) {
  const pct = target > 0 ? Math.min(100, v / target * 100) : 0;
  return `<div class="bar ${cls}"><div class="barh"><span>${label}</span><span><b>${r0(v)}</b> / ${r0(target)} g</span></div>
    <div class="trk"><div style="width:${pct}%"></div></div></div>`;
}

function vHoy() {
  const t = totals(ui.date), d = getDay(ui.date);
  const rem = t.goal - t.k, over = rem < 0;
  const C = 2 * Math.PI * 52, pct = t.goal > 0 ? Math.min(1, t.k / t.goal) : 0;
  const balTxt = t.bal <= 0 ? `Déficit de <b>${fmt(-t.bal)}</b> kcal` : `Superávit de <b>${fmt(t.bal)}</b> kcal`;
  const sets = d.work.reduce((a, w) => a + (w.sets?.length || 0), 0);
  const vol = d.work.reduce((a, w) => a + volume(w.sets), 0);
  return `
  <section class="card hero">
    <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" class="rt"/>
      <circle cx="60" cy="60" r="52" class="rv ${over ? 'over' : ''}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="60" class="big">${fmt(Math.abs(rem))}</text>
      <text x="60" y="78" class="sm">${over ? 'kcal de más' : 'kcal restantes'}</text>
    </svg>
    <div class="kv">
      <div><span>Comido</span><b>${fmt(t.k)}</b></div>
      <div><span>Gasto total</span><b class="o">${fmt(t.out)}</b></div>
      <div><span>Objetivo</span><b>${fmt(t.goal)}</b></div>
    </div>
  </section>
  <section class="card">
    <p class="bal">${balTxt}</p>
    <div class="split">
      <div><span>Basal + día a día</span><b>${fmt(t.base)}</b></div>
      <div><span>Entrenamiento</span><b class="o">+${fmt(t.ex)}</b></div>
      <div><span>Meta: ${GOALS[S.profile.goal].l}</span><b>${GOALS[S.profile.goal].adj > 0 ? '+' : ''}${GOALS[S.profile.goal].adj}</b></div>
    </div>
  </section>
  ${ui.date === today() ? adjCard(false) : ''}
  <section class="card">
    <h3>Macros</h3>
    ${bar('Proteína', t.p, t.tP, 'p')}${bar('Carbohidratos', t.c, t.tC, 'c')}${bar('Grasas', t.f, t.tF, 'f')}
  </section>
  ${mealsCard('Comidas')}
  <section class="card">
    <div class="cardh"><h3>Entrenamiento</h3><button class="link" data-a="tab" data-t="entreno">${d.work.length ? 'Ver' : 'Registrar'}</button></div>
    ${d.work.length
      ? `<p class="mute">${d.work.length} ejercicios · ${sets} series · ${fmt(vol)} kg de volumen · <b class="o">${fmt(t.ex)} kcal</b></p>
         <p class="small">${d.work.map(w => esc(w.n)).join(' · ')}</p>`
      : '<p class="mute">Día de descanso (o aún sin registrar).</p>'}
  </section>
  <section class="card">
    <div class="cardh"><h3>Peso corporal</h3>
      <label class="inl"><input id="wt" type="number" inputmode="decimal" step="0.1" min="0" value="${d.weight || ''}" placeholder="${r1(weightOn(ui.date))}"> kg</label>
    </div>
    <p class="small mute">Pésate en ayunas. Se usa para recalcular tu gasto y tus macros.</p>
  </section>`;
}

// Tarjeta del ajuste automático: en Progreso siempre (full); en Hoy solo cuando hay una propuesta
function adjCard(full) {
  const a = adaptive(); if (!a) return '';
  const g = GOALS[S.profile.goal], exp = g.adj * 7 / kcalPerKg(today()), cur = a.cur;
  const reset = full && cur ? `<button class="link" data-a="adjreset">Quitar el ajuste actual (${signK(cur)} kcal/día)</button>` : '';
  if (!a.ok) {
    if (!full) return '';
    return `<section class="card"><h3>Ajuste según tu peso real</h3>
      <p class="small mute">Con 2 o 3 semanas de datos, la app compara lo que comiste con cómo cambió tu peso. Si la fórmula se equivoca con tu gasto, te propone corregirlo.</p>
      <div class="split">
        <div><span>Días completos</span><b>${Math.min(a.days, ADJ.minDays)} / ${ADJ.minDays}</b></div>
        <div><span>Pesajes</span><b>${Math.min(a.weigh, ADJ.minWeigh)} / ${ADJ.minWeigh}</b></div>
        <div><span>Días entre el primero y el último</span><b>${Math.min(a.span, ADJ.minSpan)} / ${ADJ.minSpan}</b></div>
      </div>
      <p class="small mute">Para llegar: pésate en ayunas 2 o 3 veces por semana y registra todo lo que comes (un día cuenta como completo si comiste al menos la mitad de tu objetivo).</p>
      ${reset}</section>`;
  }
  if (!full && (!a.propose || (S.profile.adjSkip && S.profile.adjSkip > addDays(today(), -7)))) return '';
  const rest = totals(today()).base + g.adj, delta = a.next - cur;
  return `<section class="card adj">
    <h3>Ajuste según tu peso real</h3>
    <p class="small">Últimas 3 semanas: comiste en promedio <b>${fmt(a.eat)} kcal/día</b> y tu peso cambió <b>${fmtKg(a.week)} por semana</b> (lo esperado para tu objetivo: ${fmtKg(exp)}).</p>
    <div class="split">
      <div><span>Gasto según la fórmula</span><b>${fmt(a.model)}</b></div>
      <div><span>Gasto real estimado</span><b class="o">${fmt(a.real)}</b></div>
    </div>
    <p class="small mute">En tu caso, 1 kg de peso equivale a unas ${fmt(a.rho)} kcal (según tu grasa corporal estimada).</p>
    ${a.propose ? `<p class="small">Parece que gastas <b>${delta > 0 ? 'más' : 'menos'}</b> de lo que calcula la fórmula. Propuesta: corregir tu gasto <b>${signK(delta)} kcal/día</b>${a.next !== a.target ? ' (de a poco; en una semana se revisa de nuevo)' : ''}.
        En un día sin entreno, tu objetivo pasaría de <b>${fmt(rest)}</b> a <b>${fmt(rest + delta)}</b> kcal.</p>
      <div class="grid2"><button class="btn" data-a="adjskip">Ahora no</button><button class="btn pri" data-a="adjapply" data-v="${a.next}">Aplicar</button></div>`
    : a.wait ? `<p class="small mute">Ajuste actual: <b>${signK(cur)} kcal/día</b>. Se revisa de nuevo el ${shortDate(a.wait)}, con datos de esta semana.</p>`
    : `<p class="small mute">✓ Tu objetivo está bien calibrado con tus datos reales${cur ? ` (ajuste actual: ${signK(cur)} kcal/día)` : ''}.</p>`}
    ${reset}
  </section>`;
}

/* ---------- Comida ---------- */
// Comidas guardadas ("Mi desayuno"): las de la comida abierta primero; con búsqueda, las que coinciden por nombre
function comboList(q) {
  const k = ui.mealOpen || ui.meal;
  const cs = (S.combos || []).filter(c => !q || norm(c.n).includes(norm(q)))
    .sort((a, b) => (b.meal === k) - (a.meal === k));
  if (!cs.length) return '';
  return `<p class="lbl">Comidas guardadas</p><div class="list">${cs.map(c => `<button class="item" data-a="addcombo" data-id="${c.id}">
      <span class="grow"><b>${esc(c.n)}</b><small class="ell">${esc(c.items.map(i => i.n).join(', '))}</small></span>
      <small>${fmt(comboSum(c).k)} kcal ＋</small></button>`).join('')}</div>`;
}
function foodSug() {
  if (ui.food || ui.newFood) return '';
  const q = ui.foodQ.trim();
  if (!q) {
    const rec = recentFoods();
    return comboList('') + (rec.length
      ? `<p class="lbl">Recientes</p><div class="chips">${rec.map(f => `<button class="chip" data-a="pickfood" data-id="${esc(f.id)}">${esc(f.n)}</button>`).join('')}</div>`
      : `<p class="hint">Busca entre ${FOODS.length} alimentos con valores oficiales del USDA, o crea los tuyos con los datos de la etiqueta.</p>`)
      + '<div class="links"><button class="link" data-a="newfood">+ Alimento nuevo (con foto de la etiqueta)</button><button class="link" data-a="newrec">+ Crear receta casera</button></div>';
  }
  if (/^\d{8,14}$/.test(q)) return `<button class="btn wide" data-a="lookup" data-c="${q}">Buscar el código ${q}</button>`;
  const res = search(allFoods(), q, 15);
  return comboList(q) + (res.length ? `<div class="list">${res.map(f => `<button class="item" data-a="pickfood" data-id="${esc(f.id)}">
      <span>${f.r ? '🍳 ' : ''}${esc(f.n)}</span><small>${f.k} kcal · P ${f.p} g /100 g</small></button>`).join('')}</div>` : '<p class="hint">Sin resultados.</p>')
    + `<div class="links"><button class="link" data-a="newfood">+ Crear alimento “${esc(q)}”</button><button class="link" data-a="newrec">+ Receta “${esc(q)}”</button></div>`;
}
// Cantidad: modo 'u' (unidades: huevo, banana…), 'ml' (líquidos) o 'g' (gramos). "q" es lo que se escribe en el campo.
const fmtN = n => String(r1(n)).replace('.', ',');
const niceN = v => String(v >= 10 ? r0(v) : r1(v)); // redondeo al convertir entre modos
const unitWord = (f, n) => f?.r?.por ? (n === 1 ? 'porción' : 'porciones') : (n === 1 ? 'unidad' : 'unidades');
const fixMode = (f, mode) => mode === 'u' && f?.u ? 'u' : mode === 'ml' && f?.ml ? 'ml' : 'g';
const defMode = f => f?.u ? 'u' : f?.ml ? 'ml' : 'g';
const factor = (f, mode) => ({ u: f?.u, ml: f?.ml }[fixMode(f, mode)] || 1); // gramos por unidad / por ml
const qtyG = (f, q, mode) => num(q) * factor(f, mode);
const defQty = f => ({ u: '1', ml: f.k >= 250 || /vinagre|aceto|salsa|jarabe|miel|jugo de lim/i.test(f.n) ? '15' : '200', g: '100' }[defMode(f)]);
const amtLabel = (f, mode) => ({ u: f?.r?.por ? 'Porciones' : 'Unidades', ml: 'Mililitros (ml)', g: 'Gramos' }[fixMode(f, mode)]);
function amtChips(f, mode, act, tog) {
  mode = fixMode(f, mode);
  const spoon = f?.ml && (f.k >= 250 || /vinagre|aceto|salsa|jarabe|miel|jugo de lim/i.test(f.n)); // aceites, miel, aderezos: cucharadas
  const chips = {
    u: (f?.u < 15 ? [1, 2, 4, 6] : [0.5, 1, 2, 3]).map(n => [n, n === 0.5 ? '½' : n]), // cosas chicas (galletitas): más unidades
    ml: spoon ? [[5, '1 cdita (5 ml)'], [15, '1 cda (15 ml)'], [30, '2 cdas (30 ml)']] : [[100, '100 ml'], [200, '1 vaso (200 ml)'], [250, '250 ml'], [500, '500 ml']],
    g: [50, 100, 150, 200].map(g => [g, `${g} g`]),
  }[mode];
  const other = [
    f?.u && mode !== 'u' && ['u', `Por ${f.r?.por ? 'porción' : 'unidad'} (${f.u} g)`],
    f?.ml && mode !== 'ml' && ['ml', 'En mililitros'],
    mode !== 'g' && ['g', 'En gramos'],
  ].filter(Boolean);
  return `<div class="chips">${chips.map(([v, l]) => `<button class="chip" data-a="${act}" data-g="${v}">${l}</button>`).join('')}
    ${other.map(([m, l]) => `<button class="chip alt" data-a="${tog}" data-m="${m}">${l}</button>`).join('')}</div>`;
}
// Texto de cantidad de un ítem registrado: "2 unidades · 100 g", "250 ml · 258 g" o "150 g"
const qtyTxt = m => m.un ? `${fmtN(m.un)} ${unitWord(foodById(m.fid), m.un)} · ${r0(m.g)} g`
  : m.vol ? `${fmtN(m.vol)} ml · ${r0(m.g)} g` : `${r0(m.g)} g`;
// Guarda en el ítem cómo se cargó (unidades o ml) además de los gramos
function setQty(it, mode, q) { delete it.un; delete it.vol; if (mode === 'u') it.un = r1(num(q)); else if (mode === 'ml') it.vol = r1(num(q)); return it; }
const itemMode = (m, f) => m.un && f?.u ? 'u' : m.vol && f?.ml ? 'ml' : 'g';
function prevHtml(x, g, showG) {
  return `<div class="prev"><b>${fmt(x.k)} kcal</b>${showG ? `<span>${r0(g)} g</span>` : ''}<span class="p">P ${r1(x.p)}</span><span class="c">C ${r1(x.c)}</span><span class="f">G ${r1(x.f)}</span></div>`;
}
function foodPrev() {
  const f = ui.food && foodById(ui.food); if (!f) return '';
  const mode = fixMode(f, ui.qMode), g = qtyG(f, ui.grams, mode);
  return prevHtml(macro(f, g), g, mode !== 'g');
}
function foodForm() {
  const f = ui.food && foodById(ui.food); if (!f) return '';
  return `<div class="sel">
    <div class="selh"><b>${esc(f.n)}</b><button class="x" data-a="cancelfood" aria-label="Cancelar">✕</button></div>
    <small class="mute">Por 100 g: ${f.k} kcal · P ${f.p} · C ${f.c} · G ${f.f}${f.fb ? ` · Fibra ${f.fb}` : ''}${f.u ? ` · 1 unidad ≈ ${f.u} g` : ''}${f.ml && f.ml !== 1 ? ` · 1 ml = ${String(f.ml).replace('.', ',')} g` : ''}</small>
    <small class="src">${f.fdc ? `Fuente: USDA FoodData Central · ficha nº ${f.fdc}`
      : f.off ? `Fuente: Open Food Facts · código ${esc(f.bc)} (datos de la etiqueta)`
      : f.r ? `Receta propia · ${f.r.items.length} ingredientes${f.r.por ? ` · 1 porción ≈ ${f.u} g` : ''} · <button class="link" data-a="editrec" data-id="${esc(f.id)}">Editar receta</button>`
      : 'Alimento propio (creado por ti)'}</small>
    <div class="grid2">
      <label>${amtLabel(f, ui.qMode)}<input id="fg" type="number" inputmode="decimal" min="0" step="any" value="${esc(ui.grams)}"></label>
      <label>Comida<select id="fm">${MEALS.map(([k, l]) => `<option value="${k}"${k === ui.meal ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    ${amtChips(f, ui.qMode, 'grams', 'unitmode')}
    <div id="fprev">${foodPrev()}</div>
    <button class="btn pri wide" data-a="addfood">Añadir</button>
  </div>`;
}
function newFoodForm() {
  if (!ui.newFood) return '';
  const v = ui.nf || {}, val = x => x || x === 0 ? esc(x) : '';
  const head = v.off
    ? `<small class="src">Datos de <b>Open Food Facts</b> · código ${esc(v.bc)}. Son los de la etiqueta, cargados por usuarios: compáralos con tu paquete antes de guardar.</small>`
    : v.bc && !v.ai ? `<small class="src">Código ${esc(v.bc)}: este producto no está en Open Food Facts. Copia los valores de la etiqueta (o sácale una foto) y la próxima vez que lo escanees aparecerá solo.</small>` : '';
  const conv = v.ai && !/^100 (g|ml)$/.test(v.ai.base) ? ` La etiqueta daba los valores por ${esc(v.ai.base)}: ya están pasados a 100.` : '';
  const ai = v.ai ? `<small class="src ai">📷 Valores leídos por IA de tu foto.${conv}${v.ai.unit ? ` Según la etiqueta, ${esc(v.ai.unit)}.` : ''} Revísalos contra el paquete antes de guardar.${v.ai.notes ? ` Ojo: ${esc(v.ai.notes)}` : ''}</small>` : '';
  const photo = ui.nfBusy ? '<p class="hint">⏳ Leyendo la etiqueta… (unos segundos)</p>'
    : `<label class="btn wide photo">📷 ${v.ai ? 'Probar con otra foto' : 'Completar con una foto de la etiqueta'}<input id="nf-photo" type="file" accept="image/*" hidden></label>`;
  return `<div class="sel">
    <div class="selh"><b>Nuevo alimento</b><button class="x" data-a="closenew" aria-label="Cancelar">✕</button></div>
    ${head}${photo}${ai}
    <small class="mute">Valores <b>por 100 g</b> (míralos en la etiqueta). Si dejas las kcal vacías, se calculan solas.</small>
    <label>Nombre<input id="nf-n" value="${esc(v.n || '')}" autocomplete="off"></label>
    <div class="grid4">
      <label>Proteína<input id="nf-p" type="number" inputmode="decimal" step="any" min="0" value="${val(v.p)}"></label>
      <label>Carbos<input id="nf-c" type="number" inputmode="decimal" step="any" min="0" value="${val(v.c)}"></label>
      <label>Grasas<input id="nf-f" type="number" inputmode="decimal" step="any" min="0" value="${val(v.f)}"></label>
      <label>Kcal<input id="nf-k" type="number" inputmode="decimal" step="any" min="0" placeholder="auto" value="${val(v.k)}"></label>
    </div>
    <label>Gramos por unidad o porción (opcional)<input id="nf-u" type="number" inputmode="decimal" step="any" min="0" placeholder="ej. 1 barra = 40" value="${val(v.u)}"></label>
    <label class="chk"><input id="nf-l" type="checkbox"${v.liq ? ' checked' : ''}> Es un líquido: lo cargo en ml (la etiqueta dice “por 100 ml”)</label>
    <button class="btn pri wide" data-a="savefood">Guardar alimento</button>
  </div>`;
}
const mealName = k => (MEALS.find(x => x[0] === k) || MEALS[0])[1];
const mealSum = it => it.reduce((t, m) => ({ k: t.k + m.k, p: t.p + m.p, c: t.c + m.c, f: t.f + m.f }), { k: 0, p: 0, c: 0, f: 0 });
// Macros de un ítem ya registrado con otros gramos (si el alimento ya no existe, proporcional)
function rescale(m, g) {
  const f = foodById(m.fid);
  if (f) return macro(f, g);
  const x = m.g > 0 ? g / m.g : 0;
  return { k: m.k * x, p: m.p * x, c: m.c * x, f: m.f * x };
}
// Listado del día: una fila por comida; al tocarla se abre con todo lo que tiene
function mealsCard(title) {
  const d = getDay(ui.date);
  return `<section class="card"><div class="cardh"><h3>${title}</h3>${d.meals.length ? `<span class="mute">${fmt(mealSum(d.meals).k)} kcal</span>` : ''}</div>
    ${MEALS.map(([k, l]) => {
      const it = d.meals.filter(m => m.meal === k);
      return `<button class="mrow" data-a="openmeal" data-m="${k}">
        <div class="grow"><b>${l}</b><small>${it.length ? esc(it.map(m => m.n).join(', ')) : 'Sin registrar'}</small></div>
        <span class="kc">${it.length ? fmt(mealSum(it).k) : ''}</span><span class="chev">${it.length ? '›' : '+'}</span></button>`;
    }).join('')}
  </section>`;
}
function vComida() {
  if (ui.mealOpen) return vMeal();
  const d = getDay(ui.date), t = mealSum(d.meals);
  const prev = !d.meals.length && getDay(addDays(ui.date, -1)).meals.length;
  return mealsCard('Comidas del día')
    + (d.meals.length ? `<section class="card tot"><span>Total del día</span><b>${fmt(t.k)} kcal</b><small>P ${r0(t.p)} g · C ${r0(t.c)} g · G ${r0(t.f)} g</small></section>` : '')
    + (prev ? '<section class="card"><p class="hint">Aún no hay comidas este día.</p><button class="btn wide" data-a="copyprev">Copiar comidas del día anterior</button></section>' : '');
}
function editPrev() {
  const m = getDay(ui.date).meals.find(x => x.id === ui.editMeal); if (!m) return '';
  const f = foodById(m.fid), mode = fixMode(f, ui.eMode), g = qtyG(f, ui.eGrams, mode);
  return prevHtml(rescale(m, g), g, mode !== 'g');
}
function mealEdit(m) {
  const f = foodById(m.fid);
  return `<div class="sel">
    <div class="selh"><b>${esc(m.n)}</b><button class="x" data-a="canceledit" aria-label="Cancelar">✕</button></div>
    ${f?.fdc ? `<small class="src">Fuente: USDA FoodData Central · ficha nº ${f.fdc}</small>` : ''}
    <div class="grid2">
      <label>${amtLabel(f, ui.eMode)}<input id="eg" type="number" inputmode="decimal" min="0" step="any" value="${esc(ui.eGrams)}"></label>
      <label>Comida<select id="em">${MEALS.map(([k, l]) => `<option value="${k}"${k === m.meal ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    ${amtChips(f, ui.eMode, 'egrams', 'eunitmode')}
    <div id="eprevm">${editPrev()}</div>
    <div class="grid2"><button class="btn danger" data-a="delmeal" data-id="${m.id}">Borrar</button><button class="btn pri" data-a="saveedit">Guardar</button></div>
  </div>`;
}
// Una comida abierta: sus alimentos (tocar uno para cambiarlo) y el buscador para sumar más
function vMeal() {
  const k = ui.mealOpen, l = mealName(k);
  const it = getDay(ui.date).meals.filter(m => m.meal === k), s = mealSum(it);
  return `<section class="card">
    <button class="link" data-a="closemeal">‹ Comidas del día</button>
    <div class="cardh"><h2>${l}</h2><b>${fmt(s.k)} kcal</b></div>
    <p class="small mute">Proteína ${r0(s.p)} g · Carbohidratos ${r0(s.c)} g · Grasas ${r0(s.f)} g</p>
    ${it.length ? it.map(m => ui.editMeal === m.id ? mealEdit(m) : `<button class="mrow" data-a="editmeal" data-id="${m.id}">
        <div class="grow"><b>${esc(m.n)}</b><small>${qtyTxt(m)} · P ${r0(m.p)} · C ${r0(m.c)} · G ${r0(m.f)}</small></div>
        <span class="kc">${fmt(m.k)}</span><span class="chev">✎</span></button>`).join('')
      : '<p class="hint">Todavía no agregaste nada a esta comida.</p>'}
    ${!it.length || ui.editMeal ? '' : ui.saveCombo ? `<div class="sel">
        <label>Nombre para guardarla<input id="cn" value="${esc(comboDefName(k))}" autocomplete="off"></label>
        <small class="mute">Después la agregas entera con un toque, en cualquier día.</small>
        <div class="grid2"><button class="btn" data-a="cancelcombo">Cancelar</button><button class="btn pri" data-a="savecombo">Guardar</button></div>
      </div>` : '<button class="link" data-a="askcombo">☆ Guardar esta comida para repetirla</button>'}
  </section>
  <section class="card">
    <h3>Añadir a ${l}</h3>
    ${ui.food || ui.newFood ? '' : `<div class="srow"><input id="fq" class="search" type="search" placeholder="Buscar: pollo, arroz, huevo…" value="${esc(ui.foodQ)}" autocomplete="off">
      <button class="btn scanb" data-a="scan" aria-label="Escanear código de barras">${SCAN_ICO}</button></div>`}
    <div id="fsug">${foodSug()}</div>
    ${foodForm()}${newFoodForm()}
  </section>`;
}

/* ---------- Comidas guardadas y recetas ---------- */
// Macros actuales de un ítem guardado (si el alimento ya no existe, usa lo que se guardó)
function itemMacro(i) { const f = foodById(i.fid); return f ? macro(f, i.g) : { k: i.k || 0, p: i.p || 0, c: i.c || 0, f: i.f || 0 }; }
const comboSum = c => mealSum(c.items.map(itemMacro));
function comboDefName(k) {
  const base = 'Mi ' + mealName(k).toLowerCase(), used = new Set((S.combos || []).map(c => norm(c.n)));
  if (!used.has(norm(base))) return base;
  for (let n = 2; ; n++) if (!used.has(norm(`${base} ${n}`))) return `${base} ${n}`;
}
// Receta: suma de ingredientes → valores por 100 g del plato terminado
function recCalc(r) {
  const t = { k: 0, p: 0, c: 0, f: 0, fb: 0, g: 0 };
  for (const it of r.items) {
    const f = foodById(it.fid), g = ingG(it); if (!f || g <= 0) continue;
    t.k += f.k * g / 100; t.p += f.p * g / 100; t.c += f.c * g / 100; t.f += f.f * g / 100; t.fb += (f.fb || 0) * g / 100; t.g += g;
  }
  const w = num(r.w) > 0 ? num(r.w) : t.g, por = Math.max(0, Math.round(num(r.por))), x = w > 0 ? 100 / w : 0;
  return { t, w, por, u: por > 0 ? r0(w / por) : 0, per: { k: r0(t.k * x), p: r1(t.p * x), c: r1(t.c * x), f: r1(t.f * x), fb: r1(t.fb * x) } };
}
function recSug() {
  const r = ui.rec, q = r.q.trim(); if (!q) return '';
  const res = search(allFoods().filter(f => f.id !== r.id), q, 8);
  return res.length ? `<div class="list">${res.map(f => `<button class="item" data-a="addri" data-id="${esc(f.id)}">
      <span>${f.r ? '🍳 ' : ''}${esc(f.n)}</span><small>${f.k} kcal /100 g</small></button>`).join('')}</div>`
    : '<p class="hint">Sin resultados. Si no está, créalo primero como alimento (con los datos de la etiqueta).</p>';
}
function recPrev() {
  const c = recCalc(ui.rec);
  if (!c.t.g) return '';
  return `<div class="split rsum">
    <div><span>Plato entero</span><b>${fmt(c.t.k)} kcal</b><small>${fmt(c.w)} g</small></div>
    <div><span>Por 100 g</span><b>${c.per.k} kcal</b><small>P ${c.per.p} · C ${c.per.c} · G ${c.per.f}</small></div>
    ${c.u ? `<div><span>Por porción</span><b>${fmt(c.t.k / c.por)} kcal</b><small>${c.u} g</small></div>` : ''}
  </div>`;
}
// Ingrediente: en unidades (it.un, ej. huevos), en ml (it.vol, ej. leche) o en gramos (it.g)
const ingMode = it => { const f = foodById(it.fid); return it.un != null && f?.u ? 'u' : it.vol != null && f?.ml ? 'ml' : 'g'; };
const ingQ = it => ({ u: it.un, ml: it.vol, g: it.g }[ingMode(it)]);
const ingG = it => qtyG(foodById(it.fid), ingQ(it), ingMode(it));
const ingKcal = it => { const f = foodById(it.fid); if (!f) return ''; const g = ingG(it); return `${fmt(f.k * g / 100)} kcal${ingMode(it) !== 'g' ? ` · ${r0(g)} g` : ''}`; };
function vRecipe() {
  const r = ui.rec;
  return `<section class="card">
    <button class="link" data-a="closerec">‹ Volver</button>
    <h2>${r.id ? 'Editar receta' : 'Nueva receta'}</h2>
    <p class="small mute">Arma un plato casero con sus ingredientes: la app suma todo, calcula los valores por 100 g y lo guarda como un alimento más para usarlo cualquier día.</p>
    <label>Nombre<input id="rn" value="${esc(r.n)}" placeholder="ej. Milanesas de carne al horno" autocomplete="off"></label>
    <p class="lbl">Ingredientes</p>
    <p class="small mute">Elige cada ingrediente en el estado en que lo pesas (crudo o cocido).</p>
    ${r.items.length ? r.items.map((it, i) => { const f = foodById(it.fid); return `<div class="row">
        <div class="grow"><b>${esc(f ? f.n : '(alimento borrado)')}</b><small id="ri${i}">${ingKcal(it)}</small></div>
        <label class="inl"><input type="number" inputmode="decimal" min="0" step="any" data-ri="${i}" value="${esc(ingQ(it))}"> ${ingMode(it)}</label>
        <button class="x" data-a="delri" data-i="${i}" aria-label="Quitar ingrediente">✕</button></div>`; }).join('')
      : '<p class="hint">Todavía no hay ingredientes. Búscalos abajo.</p>'}
    <input id="rq" class="search" type="search" placeholder="Añadir ingrediente: carne, huevo, pan rallado…" value="${esc(r.q)}" autocomplete="off">
    <div id="rsug">${recSug()}</div>
  </section>
  <section class="card">
    <h3>Cuánto rinde</h3>
    <div class="grid2">
      <label>Peso final (g)<input id="rw" type="number" inputmode="decimal" min="0" step="any" value="${esc(r.w)}" placeholder="suma de ingredientes"></label>
      <label>Porciones<input id="rp" type="number" inputmode="numeric" min="0" step="1" value="${esc(r.por)}" placeholder="opcional"></label>
    </div>
    <p class="small mute">Si pesas el plato ya cocinado, escríbelo: al cocinar se pierde o se absorbe agua y eso cambia los valores por 100 g. Si lo dejas vacío, se usa la suma de los ingredientes.</p>
    <div id="rprev">${recPrev()}</div>
    <button class="btn pri wide" data-a="saverec">Guardar receta</button>
    ${r.id ? '<button class="btn danger wide" data-a="delrec">Borrar receta</button>' : ''}
  </section>`;
}

/* ---------- Escáner de código de barras + Open Food Facts ---------- */
const SCAN_ICO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M16 8v8"/></svg>';
const BC_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
// Dígito verificador de EAN/UPC (evita buscar números mal tipeados)
function validBarcode(c) {
  if (!/^\d{8,14}$/.test(c)) return false;
  const d = c.split('').map(Number), chk = d.pop();
  const s = d.reverse().reduce((a, n, i) => a + n * (i % 2 ? 1 : 3), 0);
  return (10 - s % 10) % 10 === chk;
}
// Lector: el del navegador si existe (Android/Chrome); si no (iPhone), uno libre que se descarga solo esa vez
async function getDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const ok = await BarcodeDetector.getSupportedFormats(), fm = BC_FORMATS.filter(f => ok.includes(f));
      if (fm.length) return new BarcodeDetector({ formats: fm });
    } catch (e) { /* usar el alternativo */ }
  }
  const m = await import('https://cdn.jsdelivr.net/npm/barcode-detector@3.0.8/dist/es/ponyfill.js');
  return new m.BarcodeDetector({ formats: BC_FORMATS });
}
const Scan = { on: false, stream: null, t: 0 };
async function openScan() {
  closeScan();
  const el = document.createElement('div');
  el.id = 'scan'; el.className = 'scan';
  el.innerHTML = `<div class="scanv"><video playsinline muted></video><div class="frame"></div></div>
    <p class="scanmsg" id="scanmsg">Abriendo la cámara…</p>
    <div class="srow"><input id="scode" class="search" type="text" inputmode="numeric" placeholder="o escribe el número" autocomplete="off">
      <button class="btn pri" data-a="scanmanual">Buscar</button></div>
    <button class="btn wide" data-a="scanclose">Cancelar</button>`;
  document.body.appendChild(el);
  Scan.on = true;
  const msg = t => { const m = $('#scanmsg'); if (m) m.textContent = t; };
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam');
    const [stream, det] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
      getDetector(),
    ]);
    if (!Scan.on) return stream.getTracks().forEach(t => t.stop());
    Scan.stream = stream;
    const v = $('#scan video'); v.srcObject = stream; await v.play();
    msg('Apunta al código de barras del paquete');
    const loop = async () => {
      if (!Scan.on) return;
      try {
        const r = await det.detect(v), c = r.find(x => validBarcode(x.rawValue));
        if (c) { navigator.vibrate?.(60); closeScan(); return lookupCode(c.rawValue); }
      } catch (e) { /* cuadro sin código */ }
      Scan.t = setTimeout(loop, 180);
    };
    loop();
  } catch (e) {
    msg(e.name === 'NotAllowedError' ? 'No hay permiso para usar la cámara. Puedes escribir el número del código.' : 'No se pudo abrir la cámara. Puedes escribir el número del código.');
    focus('#scode');
  }
}
function closeScan() {
  Scan.on = false; clearTimeout(Scan.t);
  Scan.stream?.getTracks().forEach(t => t.stop()); Scan.stream = null;
  $('#scan')?.remove();
}
// Busca primero en tus alimentos (funciona sin internet) y si no, en Open Food Facts
async function lookupCode(code) {
  code = String(code).replace(/\D/g, '');
  if (!validBarcode(code)) return toast('Ese número no parece un código de barras válido');
  const mine = S.foods.find(f => f.bc === code);
  if (mine) return ACT.pickfood({ dataset: { id: mine.id } });
  const form = nf => { Object.assign(ui, { newFood: true, food: null, foodQ: '', nf }); render(); focus(nf.k ? '#nf-n' : '#nf-p'); };
  toast('Buscando el producto…');
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name_es,product_name,generic_name_es,brands,quantity,serving_quantity,nutriments`, { signal: ctl.signal });
    clearTimeout(to);
    const d = r.ok ? await r.json() : null, p = d?.status === 1 && d.product;
    if (!p) { toast('No está en Open Food Facts'); return form({ bc: code }); }
    const nu = p.nutriments || {}, g = k => nu[k + '_100g'] ?? '';
    const name = (p.product_name_es || p.product_name || p.generic_name_es || '').trim(), brand = (p.brands || '').split(',')[0].trim();
    const kc = nu['energy-kcal_100g'] ?? (nu['energy_100g'] ? nu['energy_100g'] / 4.184 : '');
    const liq = /\d\s*(ml|cl|l|lt|litros?)\b/i.test(p.quantity || ''); // el paquete viene en ml o litros
    form({
      bc: code, off: true, n: name && brand && !norm(name).includes(norm(brand)) ? `${name} (${brand})` : (name || brand),
      k: kc === '' ? '' : r0(kc), p: g('proteins') === '' ? '' : r1(g('proteins')), c: g('carbohydrates') === '' ? '' : r1(g('carbohydrates')),
      f: g('fat') === '' ? '' : r1(g('fat')), fb: g('fiber') === '' ? 0 : r1(g('fiber')), liq, u: !liq && num(p.serving_quantity) > 0 ? r0(num(p.serving_quantity)) : '',
    });
    toast(kc === '' ? 'Encontrado, pero faltan valores: complétalos con la etiqueta' : '✓ Producto encontrado');
  } catch (e) {
    toast('Sin conexión: carga los valores de la etiqueta');
    form({ bc: code });
  }
}

/* ---------- Foto de la etiqueta → IA (función propia /api/etiqueta) ---------- */
// Guarda lo ya escrito en el formulario para no perderlo al volver a dibujarlo
function grabNf() {
  const g = id => $(id)?.value ?? '';
  if (!$('#nf-n')) return;
  Object.assign(ui.nf ||= {}, { n: g('#nf-n').trim(), p: g('#nf-p'), c: g('#nf-c'), f: g('#nf-f'), k: g('#nf-k'), u: g('#nf-u'), liq: !!$('#nf-l')?.checked });
}
// Achica la foto (máx. 1280 px) para que suba rápido y cueste menos
async function shrinkImage(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo abrir la foto')); i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}
async function readLabel(file) {
  grabNf(); ui.nfBusy = true; render();
  try {
    const image = await shrinkImage(file), token = await Sync.token();
    const r = await fetch('api/etiqueta', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ image }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo leer la etiqueta');
    const v = ui.nf ||= {}, keep = x => (x == null ? '' : x);
    Object.assign(v, {
      n: v.n || j.n || '', k: keep(j.k), p: keep(j.p), c: keep(j.c), f: keep(j.f), fb: j.fb || 0,
      u: j.u || v.u || '', liq: !!j.liq, ai: { base: j.base || '100 g', unit: j.unit || '', notes: j.notes || '' },
    });
    toast(j.k == null ? 'Leída, pero faltan valores: complétalos' : '✓ Etiqueta leída');
  } catch (e) {
    toast(e instanceof TypeError ? 'Sin conexión: leer la foto necesita internet' : e.message);
  } finally { ui.nfBusy = false; render(); }
}

/* ---------- Entreno ---------- */
function exSug() {
  const q = ui.exQ.trim();
  if (!q) {
    const rec = recentExs();
    return rec.length
      ? `<p class="lbl">Recientes</p><div class="chips">${rec.map(n => `<button class="chip" data-a="pickex" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>`
      : '<p class="hint">Busca un ejercicio (press banca, sentadilla, correr…) o escribe uno nuevo.</p>';
  }
  const res = search(allExs(), q);
  const exact = res.some(e => norm(e.n) === norm(q));
  return `${res.length ? `<div class="list">${res.map(e => `<button class="item" data-a="pickex" data-n="${esc(e.n)}"><span>${esc(e.n)}</span><small>${e.t === 'f' ? 'Fuerza' : 'Cardio'}</small></button>`).join('')}</div>` : ''}
    ${exact ? '' : `<div class="chips"><button class="chip" data-a="newex" data-t="f">+ “${esc(q)}” (fuerza)</button><button class="chip" data-a="newex" data-t="c">+ “${esc(q)}” (cardio)</button></div>`}`;
}
function exPrev() {
  const e = ui.exSel; if (!e) return '';
  const sets = cleanSets(), min = exMinutes(e.t, sets, ui.minutes), kc = exKcal(e.m, min, ui.date);
  return `<div class="prev"><b class="o">≈ ${fmt(kc)} kcal</b><span>${r0(min)} min</span>${e.t === 'f' ? `<span>${sets.length} series</span><span>${fmt(volume(sets))} kg vol.</span>` : ''}</div>`;
}
function exForm() {
  const e = ui.exSel; if (!e) return '';
  const last = lastSession(e.n, ui.date), ls = last?.w.sets || [];
  let h = `<div class="sel"><div class="selh"><b>${esc(e.n)}</b><span class="tag">${e.t === 'f' ? 'Fuerza' : 'Cardio'}</span><button class="x" data-a="cancelex" aria-label="Cancelar">✕</button></div>`;
  if (last) h += `<div class="last"><small>Última vez (${shortDate(last.k)}): <b>${esc(setsTxt(last.w))}</b></small>${e.t === 'f' && ls.length ? '<button class="link" data-a="repeat">Repetir</button>' : ''}</div>`;
  if (e.t === 'f') {
    h += `<div class="sets"><div class="setrow hd"><span>#</span><span>Kg</span><span>Reps</span><span></span></div>
      ${ui.sets.map((s, i) => `<div class="setrow"><span class="n">${i + 1}</span>
        <input type="number" inputmode="decimal" step="any" min="0" data-set="${i}" data-k="kg" value="${esc(s.kg)}" placeholder="${ls[i] ? r1(ls[i].kg) : 'kg'}">
        <input type="number" inputmode="numeric" step="1" min="0" data-set="${i}" data-k="reps" value="${esc(s.reps)}" placeholder="${ls[i] ? ls[i].reps : 'reps'}">
        <button class="x" data-a="delset" data-i="${i}" aria-label="Quitar serie">✕</button></div>`).join('')}
    </div><button class="btn wide" data-a="addset">+ Serie</button>`;
  }
  h += `<label>${e.t === 'f' ? 'Duración en minutos (opcional)' : 'Duración en minutos'}<input id="emin" type="number" inputmode="decimal" min="0" step="any" value="${esc(ui.minutes)}" placeholder="${e.t === 'f' ? 'auto: 3 min por serie' : 'ej. 30'}"></label>
    <div id="eprev">${exPrev()}</div>
    <button class="btn pri wide" data-a="saveex">${ui.editId ? 'Guardar cambios' : 'Guardar ejercicio'}</button></div>`;
  return h;
}
function workList() {
  const d = getDay(ui.date);
  if (!d.work.length) return '<section class="card"><p class="hint">Sin entrenamiento registrado este día.</p></section>';
  const tk = d.work.reduce((a, w) => a + wKcal(w, ui.date), 0);
  return `<section class="card"><div class="cardh"><h3>Sesión</h3><span class="o">${fmt(tk)} kcal</span></div>
    ${d.work.map(w => `<div class="row"><div class="grow"><b>${esc(w.n)}</b><small>${esc(setsTxt(w))}${w.t === 'f' ? ` · ${fmt(volume(w.sets))} kg` : ''}</small></div>
      <span class="kc o">${fmt(wKcal(w, ui.date))}</span>
      <button class="x" data-a="editex" data-id="${w.id}" aria-label="Editar">✎</button>
      <button class="x" data-a="delex" data-id="${w.id}" aria-label="Borrar">✕</button></div>`).join('')}
  </section>`;
}
function vEntreno() {
  return `<section class="card"><h3>${ui.editId ? 'Editar ejercicio' : 'Añadir ejercicio'}</h3>
    ${ui.exSel ? exForm() : `<input id="eq" class="search" type="search" placeholder="Buscar ejercicio…" value="${esc(ui.exQ)}" autocomplete="off"><div id="esug">${exSug()}</div>`}
  </section>${workList()}`;
}

/* ---------- Progreso ---------- */
function barChart(data) {
  const W = 320, H = 150, top = 8, bot = 18, max = Math.max(1, ...data.map(d => Math.max(d.in, d.out)));
  const bw = W / data.length, Y = v => (H - top - bot) * v / max;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Consumo y gasto de los últimos 14 días">
    ${data.map((d, i) => { const x = i * bw; return `
      <rect class="bi" x="${x + bw * 0.14}" y="${H - bot - Y(d.in)}" width="${bw * 0.34}" height="${Y(d.in)}" rx="2"><title>${shortDate(d.k)}: comido ${fmt(d.in)}</title></rect>
      <rect class="bo" x="${x + bw * 0.52}" y="${H - bot - Y(d.out)}" width="${bw * 0.34}" height="${Y(d.out)}" rx="2"><title>${shortDate(d.k)}: gasto ${fmt(d.out)}</title></rect>
      ${i % 2 === 1 ? `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${new Date(d.k + 'T12:00:00').getDate()}</text>` : ''}`; }).join('')}
    <line x1="0" x2="${W}" y1="${H - bot}" y2="${H - bot}" class="ax"/></svg>
    <div class="legend"><span class="li"></span>Comido <span class="lo"></span>Gasto</div>`;
}
function lineChart(pts, unit) {
  if (pts.length < 2) return '<p class="hint">Necesitas al menos 2 registros para ver la gráfica.</p>';
  const W = 320, H = 130, px = 10, top = 16, bot = 20, ys = pts.map(p => p.y);
  let mn = Math.min(...ys), mx = Math.max(...ys); if (mn === mx) { mn -= 1; mx += 1; }
  const X = i => px + i / (pts.length - 1) * (W - 2 * px), Y = v => top + (1 - (v - mn) / (mx - mn)) * (H - top - bot);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución">
    <polyline class="ln" points="${pts.map((p, i) => `${X(i)},${Y(p.y)}`).join(' ')}"/>
    ${pts.map((p, i) => `<circle class="dt" cx="${X(i)}" cy="${Y(p.y)}" r="3"><title>${shortDate(p.k)}: ${r1(p.y)} ${unit}</title></circle>`).join('')}
    <text x="${px}" y="${H - 4}" text-anchor="start">${shortDate(pts[0].k)}</text>
    <text x="${W - px}" y="${H - 4}" text-anchor="end">${shortDate(pts[pts.length - 1].k)}</text>
    <text x="${X(pts.length - 1)}" y="${Y(pts[pts.length - 1].y) - 7}" text-anchor="end" class="val">${r1(pts[pts.length - 1].y)} ${unit}</text>
  </svg>`;
}
function vProg() {
  const keys = []; for (let i = 13; i >= 0; i--) keys.push(addDays(today(), -i));
  const data = keys.map(k => { const t = totals(k), d = getDay(k); const has = d.meals.length > 0; return { k, in: t.k, out: has ? t.out : 0, p: t.p, has, tr: d.work.length > 0 }; });
  const l7 = data.slice(-7), logged = l7.filter(d => d.has), avg = f => logged.length ? logged.reduce((a, d) => a + f(d), 0) / logged.length : 0;
  const weights = Object.keys(S.days).sort().filter(k => S.days[k].weight).map(k => ({ k, y: S.days[k].weight }));

  // progreso por ejercicio de fuerza
  const names = []; for (const k of sortedDays()) for (const w of S.days[k].work || []) if (w.t === 'f' && !names.includes(w.n)) names.push(w.n);
  if (!names.includes(ui.progEx)) ui.progEx = names[0] || '';
  const sess = [];
  for (const k of Object.keys(S.days).sort()) for (const w of S.days[k].work || []) {
    if (w.n !== ui.progEx || !w.sets?.length) continue;
    const best = w.sets.reduce((b, s) => (e1rm(s) > e1rm(b) || (e1rm(s) === e1rm(b) && s.reps > b.reps)) ? s : b, w.sets[0]);
    sess.push({ k, best, e: e1rm(best), vol: volume(w.sets), reps: Math.max(...w.sets.map(s => s.reps)) });
  }
  const bw = sess.length && sess.every(s => !s.e);
  return `
  ${adjCard(true)}
  <section class="card"><h3>Últimos 7 días</h3>
    <div class="split">
      <div><span>Comido / día</span><b>${fmt(avg(d => d.in))}</b></div>
      <div><span>Gasto / día</span><b class="o">${fmt(avg(d => d.out))}</b></div>
      <div><span>Proteína / día</span><b>${r0(avg(d => d.p))} g</b></div>
      <div><span>Entrenos</span><b>${l7.filter(d => d.tr).length}</b></div>
    </div>
    ${logged.length ? `<p class="small mute">Balance medio: <b>${fmt(avg(d => d.in - d.out))}</b> kcal/día ≈ ${r1(avg(d => d.in - d.out) * 7 / kcalPerKg(today()))} kg/semana</p>` : '<p class="hint">Registra comidas para ver tus promedios.</p>'}
  </section>
  <section class="card"><h3>Calorías · 14 días</h3>${barChart(data)}</section>
  <section class="card"><h3>Peso corporal</h3>${lineChart(weights, 'kg')}</section>
  <section class="card"><h3>Fuerza por ejercicio</h3>
    ${names.length ? `<select id="pex">${names.map(n => `<option${n === ui.progEx ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${lineChart(sess.map(s => ({ k: s.k, y: bw ? s.reps : s.e })), bw ? 'reps' : 'kg')}
      <p class="small mute">${bw ? 'Máximo de repeticiones por sesión.' : '1RM estimado (fórmula de Epley) con tu mejor serie de cada sesión.'}</p>
      <div class="tbl">${sess.slice(-8).reverse().map(s => `<div><span>${shortDate(s.k)}</span><span>${s.best.kg ? `${r1(s.best.kg)}×${s.best.reps}` : `${s.reps} reps`}</span><span>${bw ? '' : `1RM ${r1(s.e)}`}</span><span class="mute">${fmt(s.vol)} kg</span></div>`).join('')}</div>`
      : '<p class="hint">Registra ejercicios de fuerza para ver tu progreso.</p>'}
  </section>`;
}

/* ---------- Cuenta y sincronización ---------- */
function syncTxt() {
  const s = Sync.status();
  return {
    idle: 'Conectando…',
    syncing: '⏳ Sincronizando…',
    ok: `✅ Sincronizado${s.at ? ' a las ' + new Date(s.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''}`,
    offline: '📴 Sin conexión: se sincroniza al volver internet',
    error: `⚠️ ${esc(s.msg)}`,
  }[s.state];
}
// Pantalla de entrada: lo primero que se ve si no hay sesión iniciada
function vLogin() {
  const up = ui.authMode === 'up', msg = ui.acMsg ? `<p class="note">${esc(ui.acMsg)}</p>` : '';
  return `<div class="auth">
    <img src="icon.svg" alt="" class="logo" width="72" height="72">
    <h1>FitLog</h1>
    <p class="mute">Tu entrenamiento y tu alimentación, en un solo lugar.</p>
    <section class="card">
      <h3>${up ? 'Crear cuenta' : 'Iniciar sesión'}</h3>
      ${msg}
      <label>Correo<input id="ac-e" type="email" inputmode="email" autocomplete="email" value="${esc(ui.acEmail || '')}"></label>
      <label>Contraseña${up ? ' <small class="mute">(mínimo 8 caracteres)</small>' : ''}<input id="ac-p" type="password" autocomplete="${up ? 'new-password' : 'current-password'}"></label>
      <button class="btn pri wide" data-a="${up ? 'signup' : 'login'}">${up ? 'Crear cuenta' : 'Entrar'}</button>
      ${up ? '' : '<button class="link" data-a="forgot">¿Olvidaste tu contraseña?</button>'}
    </section>
    <p class="swap">${up ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'} <button class="link" data-a="authmode">${up ? 'Entrar' : 'Crear una'}</button></p>
  </div>`;
}
// Tarjeta de cuenta dentro de Perfil (con sesión iniciada)
function vCuenta() {
  const s = Sync.status();
  if (ui.recovery) return `<section class="card"><h3>Nueva contraseña</h3>
    <label>Escribe tu nueva contraseña<input id="ac-np" type="password" autocomplete="new-password"></label>
    <button class="btn pri wide" data-a="setpw">Guardar contraseña</button></section>`;
  return `<section class="card"><div class="cardh"><h3>Mi cuenta</h3><button class="link" data-a="logout">Cerrar sesión</button></div>
    <p class="small"><b>${esc(s.email)}</b></p><p class="small" id="syncst">${syncTxt()}</p>
    <button class="btn wide" data-a="syncnow">Sincronizar ahora</button></section>`;
}

/* ---------- Perfil ---------- */
function vPerfil() {
  const p = S.profile || { sex: 'm', age: '', height: '', weight: '', act: 1.375, goal: 'maint', prot: 2 };
  const opt = (v, cur, l) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`;
  let st = '';
  if (S.profile) {
    const t = totals(today());
    st = `<div class="split">
      <div><span>Metabolismo basal</span><b>${fmt(t.bmr)}</b></div>
      <div><span>Gasto sin entrenar</span><b>${fmt(t.base)}</b></div>
      <div><span>Comer (día descanso)</span><b>${fmt(t.base + GOALS[p.goal].adj)}</b></div>
      ${t.adj ? `<div><span>Ajuste por tu peso real</span><b>${signK(t.adj)}</b></div>` : ''}</div>`;
  }
  return `${S.profile || ui.recovery ? vCuenta() : ''}
  <section class="card">
    ${S.profile ? '<h3>Mis datos</h3>' : `<h2>¡Bienvenido! 👋</h2><p class="mute">Completa tus datos para calcular cuánto gastas y cuánto deberías comer cada día.</p>
      <p class="small mute">Sesión: ${esc(Sync.status().email)} · <button class="link" data-a="logout">Salir</button></p>`}
    <div class="grid2">
      <label>Sexo<select id="pf-sex">${opt('m', p.sex, 'Hombre')}${opt('f', p.sex, 'Mujer')}</select></label>
      <label>Edad<input id="pf-age" type="number" inputmode="numeric" min="10" max="100" value="${p.age}"></label>
      <label>Altura (cm)<input id="pf-h" type="number" inputmode="decimal" min="100" max="250" value="${p.height}"></label>
      <label>Peso (kg)<input id="pf-w" type="number" inputmode="decimal" step="0.1" min="30" max="300" value="${S.profile ? r1(weightOn(today())) : ''}"></label>
    </div>
    <label>Actividad diaria <small class="mute">(sin contar el gimnasio: eso se suma aparte)</small>
      <select id="pf-act">${ACTS.map(([v, l]) => opt(v, p.act, l)).join('')}</select></label>
    <label>Objetivo<select id="pf-goal">${Object.entries(GOALS).map(([k, g]) => opt(k, p.goal, `${g.l} (${g.adj > 0 ? '+' : ''}${g.adj} kcal)`)).join('')}</select></label>
    <label>Proteína por kg de peso<select id="pf-prot">${[1.6, 1.8, 2, 2.2].map(v => opt(v, p.prot, `${v} g/kg`)).join('')}</select></label>
    <button class="btn pri wide" data-a="saveprof">${S.profile ? 'Guardar cambios' : 'Empezar'}</button>
    ${st}
  </section>
  ${S.profile ? `
  <section class="card"><div class="cardh"><h3>Mis alimentos y recetas</h3><button class="link" data-a="newrec">+ Receta</button></div>
    ${S.foods.length ? S.foods.map(f => `<div class="row"><div class="grow"><b>${f.r ? '🍳 ' : ''}${esc(f.n)}</b><small>${f.k} kcal · P ${f.p} · C ${f.c} · G ${f.f} /100 g${f.r ? ` · ${f.r.items.length} ingredientes` : ''}</small></div>
      ${f.r ? `<button class="x" data-a="editrec" data-id="${esc(f.id)}" aria-label="Editar receta">✎</button>` : ''}
      <button class="x" data-a="delfood" data-id="${esc(f.id)}" aria-label="Borrar">✕</button></div>`).join('') : '<p class="hint">Los alimentos y recetas que crees aparecerán aquí.</p>'}
  </section>
  <section class="card"><h3>Mis comidas guardadas</h3>
    ${(S.combos || []).length ? S.combos.map(c => `<div class="row"><div class="grow"><b>${esc(c.n)}</b><small class="ell">${fmt(comboSum(c).k)} kcal · ${esc(c.items.map(i => i.n).join(', '))}</small></div>
      <button class="x" data-a="delcombo" data-id="${c.id}" aria-label="Borrar">✕</button></div>`).join('')
      : '<p class="hint">Abre una comida del día (por ejemplo tu desayuno) y toca “Guardar esta comida para repetirla”.</p>'}
  </section>
  <section class="card"><h3>Copia de seguridad</h3>
    <p class="small mute">Tus datos ya están guardados en tu cuenta. Si quieres, también puedes descargar una copia en un archivo.</p>
    <div class="grid2"><button class="btn" data-a="export">Exportar</button>
      <label class="btn">Importar<input id="imp" type="file" accept="application/json,.json" hidden></label></div>
  </section>` : ''}
  <p class="ver">FitLog · versión ${APP_V}</p>`;
}

/* ================= Render ================= */
const VIEWS = { hoy: vHoy, comida: vComida, entreno: vEntreno, progreso: vProg, perfil: vPerfil };
function renderTop() {
  const nav = ['hoy', 'comida', 'entreno'].includes(ui.tab);
  $('#top').innerHTML = nav
    ? `<button class="ico" data-a="day" data-n="-1" aria-label="Día anterior">‹</button>
       <button class="date" data-a="pick">${esc(dayLabel(ui.date))}<input type="date" id="dpick" value="${ui.date}" tabindex="-1" aria-hidden="true"></button>
       <button class="ico" data-a="day" data-n="1" aria-label="Día siguiente">›</button>`
    : `<h1>${ui.tab === 'progreso' ? 'Progreso' : 'Perfil'}</h1>`;
}
function render() {
  const gate = !Sync.status().logged; // sin sesión → solo la pantalla de entrada
  document.body.classList.toggle('gate', gate);
  if (gate) { $('#top').innerHTML = ''; $('#view').innerHTML = vLogin(); return; }
  if (!S.profile) ui.tab = 'perfil';
  renderTop();
  $('#view').innerHTML = ui.rec ? vRecipe() : VIEWS[ui.tab]();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === ui.tab));
}
let tt;
function toast(m) { const el = $('#toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 1900); }
const focus = (id, sel) => { const el = $(id); if (el) { el.focus(); if (sel) el.select?.(); } };

/* ================= Acciones ================= */
const ACT = {
  tab: el => { ui.tab = el.dataset.t; ui.mealOpen = null; ui.editMeal = null; ui.saveCombo = false; ui.rec = null; render(); scrollTo(0, 0); },
  day: el => { ui.date = addDays(ui.date, +el.dataset.n); ui.editId = null; ui.exSel = null; ui.editMeal = null; ui.saveCombo = false; render(); },

  // Comidas: abrir una, editar sus alimentos
  openmeal: el => {
    Object.assign(ui, { tab: 'comida', mealOpen: el.dataset.m, meal: el.dataset.m, food: null, newFood: false, foodQ: '', editMeal: null, saveCombo: false });
    render(); scrollTo(0, 0);
  },
  closemeal: () => { Object.assign(ui, { mealOpen: null, editMeal: null, food: null, newFood: false, saveCombo: false }); render(); scrollTo(0, 0); },

  // Comidas guardadas
  askcombo: () => { ui.saveCombo = true; render(); focus('#cn', true); },
  cancelcombo: () => { ui.saveCombo = false; render(); },
  savecombo: () => {
    const n = $('#cn').value.trim(), k = ui.mealOpen;
    if (!n) return toast('Ponle un nombre');
    const it = getDay(ui.date).meals.filter(m => m.meal === k);
    const c = { id: uid(), n, meal: k, items: it.map(m => ({ fid: m.fid, n: m.n, g: m.g, ...(m.un ? { un: m.un } : {}), ...(m.vol ? { vol: m.vol } : {}), k: m.k, p: m.p, c: m.c, f: m.f })) };
    S.combos ||= [];
    const i = S.combos.findIndex(x => norm(x.n) === norm(n));
    if (i >= 0 && !confirm(`Ya tienes una comida llamada “${S.combos[i].n}”. ¿Reemplazarla?`)) return;
    if (i >= 0) S.combos[i] = { ...c, id: S.combos[i].id }; else S.combos.unshift(c);
    save(); ui.saveCombo = false; toast(`☆ Guardada: ${n}`); render();
  },
  addcombo: el => {
    const c = (S.combos || []).find(x => x.id === el.dataset.id); if (!c) return;
    const meal = ui.mealOpen || ui.meal, d = dayW(ui.date);
    for (const i of c.items) {
      const f = foodById(i.fid), x = itemMacro(i);
      d.meals.push({ id: uid(), meal, fid: i.fid, n: f ? f.n : i.n, g: i.g, ...(i.un ? { un: i.un } : {}), ...(i.vol ? { vol: i.vol } : {}), k: r1(x.k), p: r1(x.p), c: r1(x.c), f: r1(x.f) });
    }
    save(); ui.foodQ = ''; toast(`✓ ${c.n} · ${fmt(comboSum(c).k)} kcal`); render();
  },
  delcombo: el => {
    const c = (S.combos || []).find(x => x.id === el.dataset.id); if (!c) return;
    if (!confirm(`¿Borrar “${c.n}” de tus comidas guardadas? (Lo ya registrado se mantiene)`)) return;
    S.combos = S.combos.filter(x => x.id !== c.id); save(); render();
  },

  // Recetas
  newrec: () => {
    ui.rec = { id: null, n: ui.foodQ.trim(), items: [], w: '', por: '', q: '' };
    ui.foodQ = ''; ui.food = null; ui.newFood = false;
    render(); scrollTo(0, 0); focus(ui.rec.n ? '#rq' : '#rn');
  },
  editrec: el => {
    const f = S.foods.find(x => x.id === el.dataset.id); if (!f?.r) return;
    ui.rec = { id: f.id, n: f.n, items: f.r.items.map(i => ({ fid: i.fid, g: String(i.g), ...(i.un ? { un: String(i.un) } : {}), ...(i.vol ? { vol: String(i.vol) } : {}) })), w: f.r.w ? String(f.r.w) : '', por: f.r.por ? String(f.r.por) : '', q: '' };
    ui.food = null; render(); scrollTo(0, 0);
  },
  closerec: () => { ui.rec = null; render(); scrollTo(0, 0); },
  addri: el => {
    const f = foodById(el.dataset.id); if (!f) return;
    const md = defMode(f), q = defQty(f);
    ui.rec.items.push(md === 'u' ? { fid: f.id, g: String(f.u), un: q } : md === 'ml' ? { fid: f.id, g: String(r1(q * f.ml)), vol: q } : { fid: f.id, g: q });
    ui.rec.q = '';
    render(); focus(`[data-ri="${ui.rec.items.length - 1}"]`, true);
  },
  delri: el => { ui.rec.items.splice(+el.dataset.i, 1); render(); },
  saverec: () => {
    const r = ui.rec, n = r.n.trim();
    if (!n) { toast('Ponle un nombre a la receta'); return focus('#rn'); }
    const items = r.items.filter(i => foodById(i.fid) && ingG(i) > 0)
      .map(i => setQty({ fid: i.fid, g: r1(ingG(i)) }, ingMode(i), ingQ(i)));
    if (!items.length) return toast('Añade al menos un ingrediente con sus gramos');
    const c = recCalc({ ...r, items });
    const food = { id: r.id || 'c:' + uid(), n, ...c.per, u: c.u, r: { items, w: num(r.w) > 0 ? num(r.w) : 0, por: c.por } };
    const i = S.foods.findIndex(f => f.id === food.id);
    if (i >= 0) S.foods[i] = food; else S.foods.unshift(food);
    save(); ui.rec = null;
    toast(`✓ Receta guardada · ${food.k} kcal/100 g`);
    if (ui.tab === 'comida' && ui.mealOpen) { ui.food = food.id; ui.qMode = defMode(food); ui.grams = defQty(food); }
    render(); scrollTo(0, 0);
  },
  delrec: () => {
    if (!confirm('¿Borrar esta receta? (Lo ya registrado se mantiene)')) return;
    S.foods = S.foods.filter(f => f.id !== ui.rec.id); ui.rec = null; save(); render();
  },
  editmeal: el => {
    const m = getDay(ui.date).meals.find(x => x.id === el.dataset.id); if (!m) return;
    const f = foodById(m.fid);
    // como se cargó (unidades / ml); si fue en gramos y son unidades justas (ej. huevos de antes, 100 g) → unidades
    let mode = itemMode(m, f);
    if (mode === 'g' && f?.u && Math.abs(m.g / f.u - Math.round(m.g / f.u)) < 0.01) mode = 'u';
    ui.eMode = mode;
    ui.eGrams = mode === 'u' ? String(m.un || r1(m.g / f.u)) : mode === 'ml' ? String(m.vol) : String(m.g);
    ui.editMeal = m.id; ui.food = null; render(); focus('#eg', true);
  },
  canceledit: () => { ui.editMeal = null; render(); },
  egrams: el => { ui.eGrams = el.dataset.g; $('#eg').value = ui.eGrams; $('#eprevm').innerHTML = editPrev(); },
  saveedit: () => {
    const m = dayW(ui.date).meals.find(x => x.id === ui.editMeal);
    if (!m) return;
    const f = foodById(m.fid), mode = fixMode(f, ui.eMode), g = qtyG(f, ui.eGrams, mode);
    if (g <= 0) return toast('Indica la cantidad');
    const x = rescale(m, g), to = $('#em').value, moved = to !== m.meal;
    Object.assign(m, { g: r1(g), meal: to, k: r1(x.k), p: r1(x.p), c: r1(x.c), f: r1(x.f) });
    setQty(m, mode, ui.eGrams);
    save(); ui.editMeal = null;
    toast(moved ? `✓ Movido a ${mealName(to)}` : `✓ ${m.n} · ${fmt(m.k)} kcal`); render();
  },
  pick: () => { const i = $('#dpick'); try { i.showPicker(); } catch (e) { i.click(); } },

  pickfood: el => {
    const f = foodById(el.dataset.id); if (!f) return;
    ui.food = f.id; ui.qMode = defMode(f); ui.grams = defQty(f); ui.foodQ = ''; render(); focus('#fg', true);
  },
  grams: el => { ui.grams = el.dataset.g; $('#fg').value = ui.grams; $('#fprev').innerHTML = foodPrev(); },
  // Cambiar entre unidades / ml / gramos, convirtiendo lo que ya estaba escrito
  unitmode: el => {
    const f = foodById(ui.food); if (!f) return;
    const from = fixMode(f, ui.qMode), to = fixMode(f, el.dataset.m);
    ui.grams = niceN(qtyG(f, ui.grams, from) / factor(f, to)); ui.qMode = to;
    render(); focus('#fg', true);
  },
  eunitmode: el => {
    const m = getDay(ui.date).meals.find(x => x.id === ui.editMeal), f = m && foodById(m.fid); if (!f) return;
    const from = fixMode(f, ui.eMode), to = fixMode(f, el.dataset.m);
    ui.eGrams = niceN(qtyG(f, ui.eGrams, from) / factor(f, to)); ui.eMode = to;
    render(); focus('#eg', true);
  },
  cancelfood: () => { ui.food = null; render(); },
  addfood: () => {
    const f = foodById(ui.food), mode = fixMode(f, ui.qMode), g = qtyG(f, ui.grams, mode);
    if (!f || g <= 0) return toast('Indica la cantidad');
    const m = macro(f, g), it = setQty({ id: uid(), meal: ui.meal, fid: f.id, n: f.n, g: r1(g), k: r1(m.k), p: r1(m.p), c: r1(m.c), f: r1(m.f) }, mode, ui.grams);
    dayW(ui.date).meals.push(it);
    save(); ui.food = null; toast(`✓ ${f.n} · ${mode === 'g' ? '' : qtyTxt(it).split(' · ')[0] + ' · '}${fmt(m.k)} kcal`); render();
  },
  newfood: () => { ui.newFood = true; ui.nf = { n: ui.foodQ.trim() }; ui.foodQ = ''; render(); focus(ui.nf.n ? '#nf-p' : '#nf-n'); },
  closenew: () => { ui.newFood = false; ui.nf = null; render(); },
  savefood: () => {
    const n = $('#nf-n').value.trim(), p = num($('#nf-p').value), c = num($('#nf-c').value), f = num($('#nf-f').value);
    const k = num($('#nf-k').value) || r0(p * 4 + c * 4 + f * 9), u = num($('#nf-u').value), v = ui.nf || {};
    if (!n) return toast('Ponle un nombre');
    if (k <= 0) return toast('Faltan los valores nutricionales');
    const food = { id: 'c:' + uid(), n, k, p, c, f, u };
    if (v.bc) { food.bc = v.bc; S.foods = S.foods.filter(x => x.bc !== v.bc); } // un solo alimento por código
    if (v.off) food.off = 1;
    if (v.fb) food.fb = v.fb;
    if ($('#nf-l')?.checked) food.ml = 1; // etiqueta por 100 ml: se toma 1 ml ≈ 1 g
    S.foods.unshift(food); save(); ui.newFood = false; ui.nf = null;
    ACT.pickfood({ dataset: { id: food.id } });
  },
  scan: () => openScan(),
  scanclose: () => closeScan(),
  scanmanual: () => { const c = $('#scode').value; closeScan(); lookupCode(c); },
  lookup: el => lookupCode(el.dataset.c),
  delmeal: el => {
    const d = dayW(ui.date), m = d.meals.find(x => x.id === el.dataset.id); if (!m) return;
    d.meals = d.meals.filter(x => x.id !== m.id); ui.editMeal = null; save(); toast(`Borrado: ${m.n}`); render();
  },
  copyprev: () => {
    const prev = getDay(addDays(ui.date, -1)).meals;
    dayW(ui.date).meals.push(...prev.map(m => ({ ...m, id: uid() }))); save(); toast('Comidas copiadas'); render();
  },
  delfood: el => {
    if (!confirm('¿Borrar este alimento de tu lista? (Lo ya registrado se mantiene)')) return;
    S.foods = S.foods.filter(f => f.id !== el.dataset.id); save(); render();
  },

  pickex: el => {
    const e = exByName(el.dataset.n) || { n: el.dataset.n, t: 'f', m: 5 };
    ui.exSel = { n: e.n, t: e.t, m: e.m }; ui.sets = e.t === 'f' ? [{ kg: '', reps: '' }] : []; ui.minutes = ''; ui.exQ = '';
    render(); focus(e.t === 'f' ? '[data-set="0"][data-k="kg"]' : '#emin');
  },
  newex: el => {
    const n = ui.exQ.trim(); if (!n) return;
    const t = el.dataset.t, e = { n, t, m: t === 'f' ? 5 : 7 };
    S.exs.unshift(e); save(); ACT.pickex({ dataset: { n } });
  },
  cancelex: () => { ui.exSel = null; ui.editId = null; render(); },
  addset: () => {
    const l = ui.sets[ui.sets.length - 1];
    ui.sets.push(l ? { ...l } : { kg: '', reps: '' }); render();
    focus(`[data-set="${ui.sets.length - 1}"][data-k="reps"]`, true);
  },
  delset: el => { ui.sets.splice(+el.dataset.i, 1); render(); },
  repeat: () => {
    const last = lastSession(ui.exSel.n, ui.date); if (!last) return;
    ui.sets = last.w.sets.map(s => ({ kg: String(s.kg || ''), reps: String(s.reps) })); render();
  },
  saveex: () => {
    const e = ui.exSel, sets = e.t === 'f' ? cleanSets() : [];
    if (e.t === 'f' && !sets.length) return toast('Añade al menos una serie con repeticiones');
    const min = exMinutes(e.t, sets, ui.minutes);
    if (min <= 0) return toast('Indica la duración');
    const w = { id: ui.editId || uid(), n: e.n, t: e.t, met: e.m, sets, min, mm: num(ui.minutes), kcal: r0(exKcal(e.m, min, ui.date)) };
    const d = dayW(ui.date), i = d.work.findIndex(x => x.id === w.id);
    if (i >= 0) d.work[i] = w; else d.work.push(w);
    save(); toast(`✓ ${e.n} · ${fmt(w.kcal)} kcal`);
    ui.exSel = null; ui.editId = null; render();
  },
  editex: el => {
    const w = getDay(ui.date).work.find(x => x.id === el.dataset.id); if (!w) return;
    ui.exSel = { n: w.n, t: w.t, m: w.met }; ui.editId = w.id; ui.minutes = w.mm ? String(w.mm) : '';
    ui.sets = (w.sets || []).map(s => ({ kg: String(s.kg || ''), reps: String(s.reps) }));
    render(); scrollTo(0, 0);
  },
  delex: el => {
    if (!confirm('¿Borrar este ejercicio?')) return;
    const d = dayW(ui.date); d.work = d.work.filter(w => w.id !== el.dataset.id);
    if (ui.editId === el.dataset.id) { ui.editId = null; ui.exSel = null; }
    save(); render();
  },

  // Ajuste automático según el peso real
  adjapply: el => {
    const v = +el.dataset.v; if (!S.profile || !isFinite(v)) return;
    Object.assign(S.profile, { adj: v, adjAt: today() }); delete S.profile.adjSkip;
    save(); toast(`✓ Ajuste aplicado: ${signK(v)} kcal/día`); render();
  },
  adjskip: () => { S.profile.adjSkip = today(); save(); toast('Te lo vuelvo a proponer en una semana'); render(); },
  adjreset: () => {
    if (!confirm('¿Quitar el ajuste y volver a usar solo la fórmula?')) return;
    S.profile.adj = 0; delete S.profile.adjAt; save(); toast('Ajuste quitado'); render();
  },
  saveprof: () => {
    const p = {
      sex: $('#pf-sex').value, age: num($('#pf-age').value), height: num($('#pf-h').value), weight: num($('#pf-w').value),
      act: num($('#pf-act').value), goal: $('#pf-goal').value, prot: num($('#pf-prot').value),
    };
    if (p.age < 10 || p.height < 100 || p.weight < 30) return toast('Revisa edad, altura y peso');
    const first = !S.profile;
    S.profile = { ...(S.profile || {}), ...p }; dayW(today()).weight = p.weight; save(); // conserva el ajuste automático
    toast(first ? '¡Listo! Empecemos' : 'Datos guardados');
    if (first) ui.tab = 'hoy';
    render();
  },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    a.download = `fitlog-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  // Cuenta
  authmode: () => { ui.acEmail = $('#ac-e').value.trim(); ui.authMode = ui.authMode === 'up' ? 'in' : 'up'; ui.acMsg = ''; render(); },
  login: async el => {
    const e = $('#ac-e').value.trim(), p = $('#ac-p').value;
    if (!e || !p) return toast('Escribe tu correo y contraseña');
    el.disabled = true; el.textContent = 'Entrando…';
    try { await Sync.signIn(e, p); enterApp(); }
    catch (err) { toast(err instanceof TypeError ? 'Sin conexión: la primera vez necesitas internet' : err.message); el.disabled = false; el.textContent = 'Entrar'; }
  },
  signup: async el => {
    const e = $('#ac-e').value.trim(), p = $('#ac-p').value;
    if (!e) return toast('Escribe tu correo');
    if (p.length < 8) return toast('La contraseña debe tener al menos 8 caracteres');
    el.disabled = true;
    try {
      const r = await Sync.signUp(e, p);
      if (r === 'in') return enterApp();
      ui.authMode = 'in'; ui.acEmail = e;
      ui.acMsg = `Te enviamos un correo a ${e}. Ábrelo, toca el enlace para activar tu cuenta y después entra aquí.`;
      render();
    } catch (err) { toast(err instanceof TypeError ? 'Sin conexión' : err.message); el.disabled = false; }
  },
  forgot: async () => {
    const e = $('#ac-e').value.trim();
    if (!e) return toast('Escribe tu correo arriba');
    try { await Sync.recover(e); ui.acMsg = `Si ${e} tiene cuenta, te llegará un correo para cambiar la contraseña.`; render(); }
    catch (err) { toast(err instanceof TypeError ? 'Sin conexión' : err.message); }
  },
  setpw: async () => {
    const p = $('#ac-np').value;
    if (p.length < 8) return toast('Al menos 8 caracteres');
    try { await Sync.updatePassword(p); ui.recovery = false; toast('Contraseña cambiada'); render(); }
    catch (err) { toast(err.message); }
  },
  logout: async () => {
    if (Sync.pending() && !navigator.onLine) {
      if (!confirm('Hay cambios que todavía no se subieron y no hay internet: si cierras sesión ahora se perderán. ¿Cerrar igual?')) return;
    } else if (!confirm('¿Cerrar sesión? Tus datos quedan guardados en tu cuenta.')) return;
    await Sync.signOut();
    S = DEF(); save(); // los datos quedan en la nube; este dispositivo queda limpio
    Object.assign(ui, { tab: 'hoy', authMode: 'in', acMsg: '', recovery: false, hadProfile: false });
    render(); scrollTo(0, 0);
  },
  syncnow: () => Sync.sync(),
};
function enterApp() {
  ui.acMsg = ''; ui.tab = S.profile ? 'hoy' : 'perfil'; ui.hadProfile = !!S.profile;
  render(); scrollTo(0, 0); toast('¡Hola de nuevo!');
}
function afterSync() { if (S.profile && ui.tab === 'perfil' && !ui.hadProfile) ui.tab = 'hoy'; ui.hadProfile = !!S.profile; render(); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && ACT[el.dataset.a]) { e.preventDefault(); ACT[el.dataset.a](el, e); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'fq') { ui.foodQ = t.value; $('#fsug').innerHTML = foodSug(); }
  else if (t.id === 'fg') { ui.grams = t.value; $('#fprev').innerHTML = foodPrev(); }
  else if (t.id === 'eg') { ui.eGrams = t.value; $('#eprevm').innerHTML = editPrev(); }
  else if (t.id === 'eq') { ui.exQ = t.value; $('#esug').innerHTML = exSug(); }
  else if (t.id === 'rn') ui.rec.n = t.value;
  else if (t.id === 'rq') { ui.rec.q = t.value; $('#rsug').innerHTML = recSug(); }
  else if (t.id === 'rw' || t.id === 'rp') { ui.rec[t.id === 'rw' ? 'w' : 'por'] = t.value; $('#rprev').innerHTML = recPrev(); }
  else if (t.dataset.ri !== undefined) {
    const i = +t.dataset.ri, it = ui.rec.items[i]; it[{ u: 'un', ml: 'vol', g: 'g' }[ingMode(it)]] = t.value;
    $('#ri' + i).textContent = ingKcal(ui.rec.items[i]); $('#rprev').innerHTML = recPrev();
  }
  else if (t.id === 'emin') { ui.minutes = t.value; $('#eprev').innerHTML = exPrev(); }
  else if (t.dataset.set !== undefined) { ui.sets[+t.dataset.set][t.dataset.k] = t.value; $('#eprev').innerHTML = exPrev(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fm') ui.meal = t.value;
  else if (t.id === 'dpick' && t.value) { ui.date = t.value; render(); }
  else if (t.id === 'nf-photo' && t.files[0]) readLabel(t.files[0]);
  else if (t.id === 'pex') { ui.progEx = t.value; render(); }
  else if (t.id === 'wt') {
    const w = num(t.value), d = dayW(ui.date);
    if (w > 0) d.weight = r1(w); else delete d.weight;
    save(); toast('Peso guardado'); render();
  } else if (t.id === 'imp' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || typeof d.days !== 'object') throw 0;
        if (!confirm('Esto reemplazará tus datos actuales por los del archivo. ¿Continuar?')) return;
        S = Object.assign(DEF(), d, { owner: S.owner }); save(); toast('Datos importados'); ui.tab = S.profile ? 'hoy' : 'perfil'; render();
      } catch (err) { toast('Archivo no válido'); }
    };
    r.readAsText(t.files[0]);
  }
});
// Enter en los campos = acción principal
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = e.target.id;
  if (id === 'fg') ACT.addfood();
  else if (id === 'eg') ACT.saveedit();
  else if (id === 'ac-p') { const b = $('[data-a="login"], [data-a="signup"]'); ACT[b.dataset.a](b); }
  else if (id === 'fq') { const b = $('#fsug [data-a="pickfood"], #fsug [data-a="lookup"]'); if (b) b.click(); }
  else if (id === 'eq') { const b = $('#esug [data-a="pickex"], #esug [data-a="newex"]'); if (b) b.click(); }
  else if (id === 'rq') { const b = $('#rsug [data-a="addri"]'); if (b) b.click(); }
  else if (id === 'cn') ACT.savecombo();
  else if (id === 'scode') ACT.scanmanual();
});

/* ================= Inicio ================= */
ui.hadProfile = !!S.profile;
Sync.onChange = afterSync;
// Si en este dispositivo había datos de OTRA cuenta, se borran antes de sincronizar (privacidad)
Sync.onLogin = uid => {
  if (S.owner && S.owner !== uid) S = DEF();
  S.owner = uid;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin espacio */ }
};
{ const s0 = Sync.status(); if (s0.logged && !S.owner) Sync.onLogin(s0.uid); } // sesiones abiertas antes de esta versión
Sync.onStatus = () => { const el = $('#syncst'); if (el) el.innerHTML = syncTxt(); };
render();
Sync.init().then(r => {
  if (!r) return;
  if (r.error) return toast('⚠️ ' + r.error);
  if (r.type === 'recovery') { ui.recovery = true; ui.tab = 'perfil'; }
  if (r.type === 'signup') { ui.acMsg = ''; toast('¡Cuenta confirmada!'); }
  afterSync();
});
navigator.storage?.persist?.();
// Actualización automática: al abrir o volver a la app se busca una versión nueva; cuando llega, se recarga sola
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadSW = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadSW || reloading) return;
    reloading = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
