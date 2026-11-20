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
const DEF = () => ({ profile: null, foods: [], exs: [], days: {} });
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
// Mifflin-St Jeor
function bmr(k) { const p = S.profile, w = weightOn(k); return 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161); }
function totals(k) {
  const d = getDay(k), t = { k: 0, p: 0, c: 0, f: 0 };
  for (const m of d.meals) { t.k += m.k; t.p += m.p; t.c += m.c; t.f += m.f; }
  t.ex = d.work.reduce((a, w) => a + w.kcal, 0);
  if (!S.profile) return t;
  const w = weightOn(k);
  t.bmr = bmr(k);
  t.base = t.bmr * S.profile.act;          // basal + vida diaria (sin entreno)
  t.out = t.base + t.ex;                    // gasto total del día
  t.goal = t.out + GOALS[S.profile.goal].adj; // lo que deberías comer
  t.tP = S.profile.prot * w;
  t.tF = 0.8 * w;
  t.tC = Math.max(0, (t.goal - t.tP * 4 - t.tF * 9) / 4);
  t.bal = t.k - t.out;
  return t;
}
const cleanSets = () => ui.sets.map(s => ({ kg: num(s.kg), reps: Math.round(num(s.reps)) })).filter(s => s.reps > 0);
const exMinutes = (t, sets, manual) => num(manual) > 0 ? num(manual) : (t === 'f' ? sets.length * 3 : 0);
const exKcal = (met, min, k) => met * weightOn(k) * min / 60;
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
  foodQ: '', food: null, grams: '', meal: defaultMeal(), newFood: false, nfName: '',
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

/* ---------- Comida ---------- */
function foodSug() {
  if (ui.food || ui.newFood) return '';
  const q = ui.foodQ.trim();
  if (!q) {
    const rec = recentFoods();
    return rec.length
      ? `<p class="lbl">Recientes</p><div class="chips">${rec.map(f => `<button class="chip" data-a="pickfood" data-id="${esc(f.id)}">${esc(f.n)}</button>`).join('')}</div>`
      : `<p class="hint">Busca entre ${FOODS.length} alimentos con valores oficiales del USDA, o crea los tuyos con los datos de la etiqueta.</p>`;
  }
  const res = search(allFoods(), q, 15);
  return (res.length ? `<div class="list">${res.map(f => `<button class="item" data-a="pickfood" data-id="${esc(f.id)}">
      <span>${esc(f.n)}</span><small>${f.k} kcal · P ${f.p} g /100 g</small></button>`).join('')}</div>` : '<p class="hint">Sin resultados.</p>')
    + `<button class="link" data-a="newfood">+ Crear “${esc(q)}”</button>`;
}
function foodPrev() {
  const f = ui.food && foodById(ui.food); if (!f) return '';
  const m = macro(f, num(ui.grams));
  return `<div class="prev"><b>${fmt(m.k)} kcal</b><span class="p">P ${r1(m.p)}</span><span class="c">C ${r1(m.c)}</span><span class="f">G ${r1(m.f)}</span></div>`;
}
function foodForm() {
  const f = ui.food && foodById(ui.food); if (!f) return '';
  return `<div class="sel">
    <div class="selh"><b>${esc(f.n)}</b><button class="x" data-a="cancelfood" aria-label="Cancelar">✕</button></div>
    <small class="mute">Por 100 g: ${f.k} kcal · P ${f.p} · C ${f.c} · G ${f.f}${f.fb ? ` · Fibra ${f.fb}` : ''}${f.u ? ` · 1 unidad ≈ ${f.u} g` : ''}</small>
    <small class="src">${f.fdc ? `Fuente: USDA FoodData Central · ficha nº ${f.fdc}` : 'Alimento propio (creado por ti)'}</small>
    <div class="grid2">
      <label>Gramos<input id="fg" type="number" inputmode="decimal" min="0" step="any" value="${esc(ui.grams)}"></label>
      <label>Comida<select id="fm">${MEALS.map(([k, l]) => `<option value="${k}"${k === ui.meal ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="chips">${f.u ? [1, 2, 3].map(n => `<button class="chip" data-a="grams" data-g="${n * f.u}">${n} u</button>`).join('') : ''}${[50, 100, 150, 200].map(g => `<button class="chip" data-a="grams" data-g="${g}">${g} g</button>`).join('')}</div>
    <div id="fprev">${foodPrev()}</div>
    <button class="btn pri wide" data-a="addfood">Añadir</button>
  </div>`;
}
function newFoodForm() {
  if (!ui.newFood) return '';
  return `<div class="sel">
    <div class="selh"><b>Nuevo alimento</b><button class="x" data-a="closenew" aria-label="Cancelar">✕</button></div>
    <small class="mute">Valores <b>por 100 g</b> (míralos en la etiqueta). Si dejas las kcal vacías, se calculan solas.</small>
    <label>Nombre<input id="nf-n" value="${esc(ui.nfName)}" autocomplete="off"></label>
    <div class="grid4">
      <label>Proteína<input id="nf-p" type="number" inputmode="decimal" step="any" min="0"></label>
      <label>Carbos<input id="nf-c" type="number" inputmode="decimal" step="any" min="0"></label>
      <label>Grasas<input id="nf-f" type="number" inputmode="decimal" step="any" min="0"></label>
      <label>Kcal<input id="nf-k" type="number" inputmode="decimal" step="any" min="0" placeholder="auto"></label>
    </div>
    <label>Gramos por unidad (opcional)<input id="nf-u" type="number" inputmode="decimal" step="any" min="0" placeholder="ej. 1 barra = 40"></label>
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
  const x = rescale(m, num(ui.eGrams));
  return `<div class="prev"><b>${fmt(x.k)} kcal</b><span class="p">P ${r1(x.p)}</span><span class="c">C ${r1(x.c)}</span><span class="f">G ${r1(x.f)}</span></div>`;
}
function mealEdit(m) {
  const f = foodById(m.fid);
  return `<div class="sel">
    <div class="selh"><b>${esc(m.n)}</b><button class="x" data-a="canceledit" aria-label="Cancelar">✕</button></div>
    ${f?.fdc ? `<small class="src">Fuente: USDA FoodData Central · ficha nº ${f.fdc}</small>` : ''}
    <div class="grid2">
      <label>Gramos<input id="eg" type="number" inputmode="decimal" min="0" step="any" value="${esc(ui.eGrams)}"></label>
      <label>Comida<select id="em">${MEALS.map(([k, l]) => `<option value="${k}"${k === m.meal ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="chips">${f?.u ? [1, 2, 3].map(n => `<button class="chip" data-a="egrams" data-g="${n * f.u}">${n} u</button>`).join('') : ''}${[50, 100, 150, 200].map(g => `<button class="chip" data-a="egrams" data-g="${g}">${g} g</button>`).join('')}</div>
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
        <div class="grow"><b>${esc(m.n)}</b><small>${r0(m.g)} g · P ${r0(m.p)} · C ${r0(m.c)} · G ${r0(m.f)}</small></div>
        <span class="kc">${fmt(m.k)}</span><span class="chev">✎</span></button>`).join('')
      : '<p class="hint">Todavía no agregaste nada a esta comida.</p>'}
  </section>
  <section class="card">
    <h3>Añadir a ${l}</h3>
    ${ui.food || ui.newFood ? '' : `<input id="fq" class="search" type="search" placeholder="Buscar: pollo, arroz, huevo…" value="${esc(ui.foodQ)}" autocomplete="off">`}
    <div id="fsug">${foodSug()}</div>
    ${foodForm()}${newFoodForm()}
  </section>`;
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
  const tk = d.work.reduce((a, w) => a + w.kcal, 0);
  return `<section class="card"><div class="cardh"><h3>Sesión</h3><span class="o">${fmt(tk)} kcal</span></div>
    ${d.work.map(w => `<div class="row"><div class="grow"><b>${esc(w.n)}</b><small>${esc(setsTxt(w))}${w.t === 'f' ? ` · ${fmt(volume(w.sets))} kg` : ''}</small></div>
      <span class="kc o">${fmt(w.kcal)}</span>
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
  <section class="card"><h3>Últimos 7 días</h3>
    <div class="split">
      <div><span>Comido / día</span><b>${fmt(avg(d => d.in))}</b></div>
      <div><span>Gasto / día</span><b class="o">${fmt(avg(d => d.out))}</b></div>
      <div><span>Proteína / día</span><b>${r0(avg(d => d.p))} g</b></div>
      <div><span>Entrenos</span><b>${l7.filter(d => d.tr).length}</b></div>
    </div>
    ${logged.length ? `<p class="small mute">Balance medio: <b>${fmt(avg(d => d.in - d.out))}</b> kcal/día ≈ ${r1(avg(d => d.in - d.out) * 7 / 7700)} kg/semana</p>` : '<p class="hint">Registra comidas para ver tus promedios.</p>'}
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
      <div><span>Comer (día descanso)</span><b>${fmt(t.base + GOALS[p.goal].adj)}</b></div></div>`;
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
  <section class="card"><h3>Mis alimentos</h3>
    ${S.foods.length ? S.foods.map(f => `<div class="row"><div class="grow"><b>${esc(f.n)}</b><small>${f.k} kcal · P ${f.p} · C ${f.c} · G ${f.f} /100 g</small></div>
      <button class="x" data-a="delfood" data-id="${esc(f.id)}" aria-label="Borrar">✕</button></div>`).join('') : '<p class="hint">Los alimentos que crees aparecerán aquí.</p>'}
  </section>
  <section class="card"><h3>Copia de seguridad</h3>
    <p class="small mute">Tus datos ya están guardados en tu cuenta. Si quieres, también puedes descargar una copia en un archivo.</p>
    <div class="grid2"><button class="btn" data-a="export">Exportar</button>
      <label class="btn">Importar<input id="imp" type="file" accept="application/json,.json" hidden></label></div>
  </section>` : ''}`;
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
  $('#view').innerHTML = VIEWS[ui.tab]();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === ui.tab));
}
let tt;
function toast(m) { const el = $('#toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 1900); }
const focus = (id, sel) => { const el = $(id); if (el) { el.focus(); if (sel) el.select?.(); } };

/* ================= Acciones ================= */
const ACT = {
  tab: el => { ui.tab = el.dataset.t; ui.mealOpen = null; ui.editMeal = null; render(); scrollTo(0, 0); },
  day: el => { ui.date = addDays(ui.date, +el.dataset.n); ui.editId = null; ui.exSel = null; ui.editMeal = null; render(); },

  // Comidas: abrir una, editar sus alimentos
  openmeal: el => {
    Object.assign(ui, { tab: 'comida', mealOpen: el.dataset.m, meal: el.dataset.m, food: null, newFood: false, foodQ: '', editMeal: null });
    render(); scrollTo(0, 0);
  },
  closemeal: () => { Object.assign(ui, { mealOpen: null, editMeal: null, food: null, newFood: false }); render(); scrollTo(0, 0); },
  editmeal: el => {
    const m = getDay(ui.date).meals.find(x => x.id === el.dataset.id); if (!m) return;
    ui.editMeal = m.id; ui.eGrams = String(m.g); ui.food = null; render(); focus('#eg', true);
  },
  canceledit: () => { ui.editMeal = null; render(); },
  egrams: el => { ui.eGrams = el.dataset.g; $('#eg').value = ui.eGrams; $('#eprevm').innerHTML = editPrev(); },
  saveedit: () => {
    const m = dayW(ui.date).meals.find(x => x.id === ui.editMeal), g = num(ui.eGrams);
    if (!m) return;
    if (g <= 0) return toast('Indica los gramos');
    const x = rescale(m, g), to = $('#em').value, moved = to !== m.meal;
    Object.assign(m, { g, meal: to, k: r1(x.k), p: r1(x.p), c: r1(x.c), f: r1(x.f) });
    save(); ui.editMeal = null;
    toast(moved ? `✓ Movido a ${mealName(to)}` : `✓ ${m.n} · ${fmt(m.k)} kcal`); render();
  },
  pick: () => { const i = $('#dpick'); try { i.showPicker(); } catch (e) { i.click(); } },

  pickfood: el => {
    const f = foodById(el.dataset.id); if (!f) return;
    ui.food = f.id; ui.grams = String(f.u || 100); ui.foodQ = ''; render(); focus('#fg', true);
  },
  grams: el => { ui.grams = el.dataset.g; $('#fg').value = ui.grams; $('#fprev').innerHTML = foodPrev(); },
  cancelfood: () => { ui.food = null; render(); },
  addfood: () => {
    const f = foodById(ui.food), g = num(ui.grams);
    if (!f || g <= 0) return toast('Indica los gramos');
    const m = macro(f, g);
    dayW(ui.date).meals.push({ id: uid(), meal: ui.meal, fid: f.id, n: f.n, g, k: r1(m.k), p: r1(m.p), c: r1(m.c), f: r1(m.f) });
    save(); ui.food = null; toast(`✓ ${f.n} · ${fmt(m.k)} kcal`); render();
  },
  newfood: () => { ui.newFood = true; ui.nfName = ui.foodQ.trim(); ui.foodQ = ''; render(); focus(ui.nfName ? '#nf-p' : '#nf-n'); },
  closenew: () => { ui.newFood = false; render(); },
  savefood: () => {
    const n = $('#nf-n').value.trim(), p = num($('#nf-p').value), c = num($('#nf-c').value), f = num($('#nf-f').value);
    const k = num($('#nf-k').value) || r0(p * 4 + c * 4 + f * 9), u = num($('#nf-u').value);
    if (!n) return toast('Ponle un nombre');
    if (k <= 0) return toast('Faltan los valores nutricionales');
    const food = { id: 'c:' + uid(), n, k, p, c, f, u };
    S.foods.unshift(food); save(); ui.newFood = false;
    ACT.pickfood({ dataset: { id: food.id } });
  },
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

  saveprof: () => {
    const p = {
      sex: $('#pf-sex').value, age: num($('#pf-age').value), height: num($('#pf-h').value), weight: num($('#pf-w').value),
      act: num($('#pf-act').value), goal: $('#pf-goal').value, prot: num($('#pf-prot').value),
    };
    if (p.age < 10 || p.height < 100 || p.weight < 30) return toast('Revisa edad, altura y peso');
    const first = !S.profile;
    S.profile = p; dayW(today()).weight = p.weight; save();
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
  else if (t.id === 'emin') { ui.minutes = t.value; $('#eprev').innerHTML = exPrev(); }
  else if (t.dataset.set !== undefined) { ui.sets[+t.dataset.set][t.dataset.k] = t.value; $('#eprev').innerHTML = exPrev(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fm') ui.meal = t.value;
  else if (t.id === 'dpick' && t.value) { ui.date = t.value; render(); }
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
  else if (id === 'fq') { const b = $('#fsug [data-a="pickfood"]'); if (b) b.click(); }
  else if (id === 'eq') { const b = $('#esug [data-a="pickex"], #esug [data-a="newex"]'); if (b) b.click(); }
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
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
