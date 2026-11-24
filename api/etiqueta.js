'use strict';
/* =====================================================================
   FitLog · Leer una etiqueta nutricional con IA (función de Vercel)
   POST /api/etiqueta  { image: "data:image/jpeg;base64,..." }
   Cabecera: Authorization: Bearer <token de la sesión de FitLog>

   - Solo responde a usuarios con sesión iniciada en FitLog (se verifica con Supabase, solo lectura).
   - La clave de OpenAI NO está en el código: se lee de la variable de entorno OPENAI_API_KEY,
     que se configura en Vercel → Settings → Environment Variables.
   - Opcional: OPENAI_MODEL para cambiar el modelo sin tocar el código.
   - A OpenAI solo se envía la foto de la etiqueta.
   ===================================================================== */

// Valores PÚBLICOS (los mismos de config.js): sirven para preguntar a Supabase quién es el usuario.
const SUPABASE_URL = 'https://vgmoufotbsftulnwxbyx.supabase.co';
const SUPABASE_KEY = 'sb_publishable__WyL0NnLgDO2LLRuI34UKg_2Qrg7D47';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const MAX_IMAGE = 3_000_000;          // ~2 MB de foto en base64
const LIMIT = 40, WINDOW = 3600_000;  // máx. 40 lecturas por hora por usuario (en esta instancia)
const used = new Map();

const PROMPT = `Eres un lector de tablas de información nutricional de alimentos envasados (sobre todo de Argentina y Latinoamérica).
Lee la tabla de la foto y devuelve los valores tal como están impresos, sin hacer cuentas.
Columnas:
- Si hay una columna "Cant. por 100 g" o "por 100 ml", usa esa (basis_amount = 100), aunque también haya "por porción".
- Si solo hay valores por porción (ej. "Por 30 g", "Cant. por porción" con "Porción 200 ml"), usa esa columna: basis_amount = tamaño de la porción (30, 200…).
- basis_unit = "ml" si la base está en ml (leches, yogures bebibles, jugos, bebidas, aceites); si no, "g".
- La columna "% VD" a veces está corrida una fila: ignórala por completo.
Valores:
- energy_kcal: el "Valor energético" en kcal (ej. "42 kcal/177 kJ" → 42). Solo si no hay kcal, pon null y completa energy_kj.
- carbs_g = "Carbohidratos" totales (no los azúcares). fat_g = "Grasas totales". protein_g = "Proteínas". fiber_g = "Fibra alimentaria".
- Los números pueden usar coma decimal ("5,2 g" → 5.2).
- Si la nota al pie dice "No aporta cantidades significativas de …" un nutriente (ej. fibra alimentaria o grasas), ese valor es 0.
- Si un valor no figura en ninguna parte o no se lee, pon null. No inventes valores.
Porción:
- serving_amount/serving_unit: el tamaño de la porción declarada (ej. "Porción: 30 g (4 unidades)" → 30, "g"; "Porción 200 ml (1 vaso)" → 200, "ml"). Si no figura: null y "".
- serving_units: cuántas unidades contables trae esa porción si lo dice (ej. "4 unidades" → 4, "2 galletitas" → 2, "1 barra" → 1). Medidas caseras como "1 vaso", "1 taza" o "1 cucharada" NO son unidades: null. Si no lo dice: null.
Nombre:
- product_name: nombre corto del producto en español, con la marca entre paréntesis si se ve (ej. "Galletas de arroz (Grandiet)").
  Si el nombre no aparece, descríbelo en pocas palabras a partir de los ingredientes y el fabricante visibles (ej. "Leche descremada con proteínas (La Serenísima)"). Si no hay pistas, cadena vacía.
Otros:
- is_liquid = true si es una bebida o un líquido que se mide en ml.
- readable = false si la foto no muestra una tabla nutricional legible.
- notes: una frase corta en español solo si algo es dudoso (ej. "la columna por 100 ml está cortada"); si no, cadena vacía.`;

const num = { type: ['number', 'null'] };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'product_name', 'is_liquid', 'basis_amount', 'basis_unit', 'energy_kcal', 'energy_kj',
    'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'serving_amount', 'serving_unit', 'serving_units', 'notes'],
  properties: {
    readable: { type: 'boolean' },
    product_name: { type: 'string' },
    is_liquid: { type: 'boolean' },
    basis_amount: num,
    basis_unit: { type: 'string', enum: ['g', 'ml'] },
    energy_kcal: num, energy_kj: num, protein_g: num, carbs_g: num, fat_g: num, fiber_g: num,
    serving_amount: num,
    serving_unit: { type: 'string', enum: ['g', 'ml', ''] }, // '' = no figura
    serving_units: num,
    notes: { type: 'string' },
  },
};

async function whoIs(token) {
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u.id : null;
}

function allow(uid) {
  const now = Date.now(), list = (used.get(uid) || []).filter(t => now - t < WINDOW);
  if (list.length >= LIMIT) return false;
  list.push(now); used.set(uid, list);
  return true;
}

async function askOpenAI(image, withReasoning) {
  const body = {
    model: MODEL,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: PROMPT },
        { type: 'input_image', image_url: image, detail: 'high' },
      ],
    }],
    text: { format: { type: 'json_schema', name: 'etiqueta_nutricional', strict: true, schema: SCHEMA } },
    max_output_tokens: 3000,
    store: false,
  };
  if (withReasoning) body.reasoning = { effort: 'low' };
  return fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Texto JSON de la respuesta (formato REST de la Responses API)
function outputText(j) {
  for (const item of j.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'refusal') throw Object.assign(new Error('La IA no quiso leer esta imagen.'), { code: 422 });
      if (part.type === 'output_text') return part.text;
    }
  }
  throw new Error('Respuesta vacía de la IA.');
}

const r1 = n => Math.round(n * 10) / 10;

module.exports = async (req, res) => {
  const send = (code, obj) => res.status(code).json(obj);
  try {
    if (req.method !== 'POST') return send(405, { error: 'Método no permitido' });
    if (!process.env.OPENAI_API_KEY) return send(503, { error: 'Falta configurar la clave de OpenAI en Vercel (OPENAI_API_KEY).' });

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uid = await whoIs(token);
    if (!uid) return send(401, { error: 'Inicia sesión en FitLog para usar esta función.' });
    if (!allow(uid)) return send(429, { error: 'Demasiadas fotos seguidas. Prueba de nuevo en un rato.' });

    const image = req.body && req.body.image;
    if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) return send(400, { error: 'Falta la foto.' });
    if (image.length > MAX_IMAGE) return send(413, { error: 'La foto es demasiado grande.' });

    let r = await askOpenAI(image, true);
    if (r.status === 400) { // algunos modelos no aceptan "reasoning": reintentar sin él
      const t = await r.text();
      if (/reasoning/i.test(t)) r = await askOpenAI(image, false);
      else { console.error('OpenAI 400', t.slice(0, 500)); return send(502, { error: 'La IA no pudo procesar la foto.' }); }
    }
    if (!r.ok) {
      const t = await r.text();
      console.error('OpenAI', r.status, t.slice(0, 500));
      if (r.status === 401) return send(503, { error: 'La clave de OpenAI configurada en Vercel no es válida.' });
      if (r.status === 429) return send(503, { error: 'OpenAI rechazó el pedido: puede que no haya saldo o que se haya alcanzado el límite.' });
      return send(502, { error: 'La IA no respondió bien. Prueba de nuevo.' });
    }
    const j = await r.json();
    if (j.status === 'incomplete') return send(502, { error: 'La IA no terminó de leer la etiqueta. Prueba de nuevo.' });
    const d = JSON.parse(outputText(j));

    if (!d.readable) return send(422, { error: 'No se ve una tabla nutricional clara. Saca la foto más cerca y con buena luz.' });
    const base = d.basis_amount > 0 ? d.basis_amount : 100, x = 100 / base;
    const kcal = d.energy_kcal != null ? d.energy_kcal : d.energy_kj != null ? d.energy_kj / 4.184 : null;
    const val = v => (v == null ? null : r1(v * x));
    const liq = d.is_liquid || d.basis_unit === 'ml';
    // Peso de 1 unidad: "Porción 30 g (4 unidades)" → 7,5 g; sin unidades contables, la porción entera
    const sv = d.serving_unit === 'g' && d.serving_amount > 0 ? d.serving_amount : 0, units = d.serving_units > 0 ? d.serving_units : 0;
    const u = !liq && sv ? r1(units ? sv / units : sv) : null;
    return send(200, {
      n: (d.product_name || '').trim(),
      k: kcal == null ? null : Math.round(kcal * x),
      p: val(d.protein_g), c: val(d.carbs_g), f: val(d.fat_g), fb: val(d.fiber_g),
      liq, u,
      unit: u ? (units ? `porción ${sv} g = ${units} unidades → 1 unidad ≈ ${String(u).replace('.', ',')} g` : `1 porción = ${sv} g`) : '',
      base: `${base} ${d.basis_unit}`,
      notes: d.notes || '',
      usage: j.usage || null,
    });
  } catch (e) {
    console.error(e);
    return send(e.code || 500, { error: e.code ? e.message : 'Error al leer la etiqueta.' });
  }
};
