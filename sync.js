'use strict';
/* =====================================================================
   Sincronización con Supabase, sin librerías externas (solo fetch).
   Los datos se guardan PRIMERO en el teléfono (funciona sin internet);
   esto los copia a tu cuenta y trae los cambios de tus otros dispositivos.
   Solo se envían los días que cambiaron, para gastar pocos datos.
   ===================================================================== */
const Sync = (() => {
  const AKEY = 'fitlog-auth', MKEY = 'fitlog-sync';
  const H = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  const emptyMeta = () => ({ uid: '', hashes: {}, set: '', last: '' });
  let auth = read(AKEY);              // { access_token, refresh_token, expires_at, user: { id, email } }
  let meta = read(MKEY) || emptyMeta(); // qué versión de cada día está ya en la nube
  let timer = null, busy = false, again = false, refreshing = null;
  const st = { state: 'idle', msg: '', at: 0 };
  const api = { onChange: () => {}, onStatus: () => {} };

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio */ } }
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h.toString(36) + ':' + s.length; };
  const settingsStr = () => JSON.stringify({ profile: S.profile, foods: S.foods, exs: S.exs });
  const redirect = () => location.origin + location.pathname;
  function setStatus(state, msg = '') { st.state = state; st.msg = msg; if (state === 'ok') st.at = Date.now(); api.onStatus(); }

  /* ---------- Errores en español ---------- */
  function errMsg(j, status) {
    const m = (j && (j.msg || j.message || j.error_description || j.error)) || '';
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos';
    if (/Email not confirmed/i.test(m)) return 'Primero confirma tu correo (revisa tu bandeja de entrada)';
    if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta: usa «Entrar»';
    if (/Password should/i.test(m)) return 'La contraseña es demasiado corta o débil';
    if (/valid email|invalid format/i.test(m)) return 'El correo no es válido';
    if (status === 429 || /rate limit/i.test(m)) return 'Demasiados intentos: espera unos minutos';
    return m || `Error del servidor (${status})`;
  }

  /* ---------- Llamadas al servidor ---------- */
  async function authCall(path, body) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(errMsg(j, r.status)), { auth: true });
    return j;
  }
  async function call(path, opt = {}, retry = true) {
    if (auth && auth.expires_at - 60 < Date.now() / 1000) await refresh();
    const r = await fetch(SUPABASE_URL + path, {
      ...opt, headers: { ...H, ...(auth ? { Authorization: 'Bearer ' + auth.access_token } : {}), ...(opt.headers || {}) },
    });
    if (r.status === 401 && auth && retry) { await refresh(); return call(path, opt, false); }
    const txt = await r.text();
    const j = txt ? JSON.parse(txt) : null;
    if (!r.ok) throw new Error(errMsg(j, r.status));
    return j;
  }
  function refresh() {
    return refreshing ||= (async () => {
      try { setSession(await authCall('token?grant_type=refresh_token', { refresh_token: auth.refresh_token })); }
      catch (e) { if (e.auth) signOutLocal(); throw e; } // sesión inválida → cerrar; sin red → reintentar luego
      finally { refreshing = null; }
    })();
  }
  function setSession(j) {
    auth = {
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      user: { id: j.user.id, email: j.user.email },
    };
    write(AKEY, auth);
    if (meta.uid !== auth.user.id) { meta = emptyMeta(); meta.uid = auth.user.id; write(MKEY, meta); }
  }
  function signOutLocal() { auth = null; meta = emptyMeta(); write(AKEY, null); write(MKEY, null); setStatus('idle'); }

  /* ---------- Unir cambios de dos dispositivos ---------- */
  const unionBy = (a = [], b = [], key) => { const m = new Map(); for (const i of b) m.set(key(i), i); for (const i of a) m.set(key(i), i); return [...m.values()]; };
  const mergeDay = (l, r) => ({ ...r, ...l, meals: unionBy(l.meals, r.meals, i => i.id), work: unionBy(l.work, r.work, i => i.id), weight: l.weight || r.weight || undefined });

  /* ---------- Traer de la nube ---------- */
  async function pull() {
    let changed = false;
    // Margen de 2 min para no perder filas guardadas justo durante la última sincronización
    const since = meta.last ? new Date(Date.parse(meta.last) - 120000).toISOString() : '';
    const rows = await call('/rest/v1/days?select=day,data,updated_at&order=updated_at.asc' + (since ? '&updated_at=gte.' + encodeURIComponent(since) : ''));
    for (const r of rows) {
      if (!meta.last || Date.parse(r.updated_at) > Date.parse(meta.last)) meta.last = r.updated_at;
      const k = r.day, loc = S.days[k], rs = JSON.stringify(r.data), ls = loc ? JSON.stringify(loc) : '';
      if (ls !== rs) {
        const dirty = loc && hash(ls) !== meta.hashes[k]; // cambiado aquí y aún no subido
        S.days[k] = dirty ? mergeDay(loc, r.data) : r.data;
        changed = true;
      }
      meta.hashes[k] = hash(rs);
    }
    const [row] = await call('/rest/v1/settings?select=data');
    if (row) {
      const rs = JSON.stringify(row.data), ls = settingsStr();
      if (ls !== rs) {
        const d = row.data, dirty = S.profile && hash(ls) !== meta.set;
        S.profile = dirty ? S.profile : (d.profile || S.profile);
        S.foods = dirty ? unionBy(S.foods, d.foods, f => f.id) : (d.foods || []);
        S.exs = dirty ? unionBy(S.exs, d.exs, e => e.n) : (d.exs || []);
        changed = true;
      }
      meta.set = hash(rs);
    }
    return changed;
  }

  /* ---------- Subir a la nube (solo lo que cambió) ---------- */
  const upsert = (table, conflict, body) => call(`/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body),
  });
  async function push() {
    const rows = [];
    for (const [k, d] of Object.entries(S.days)) {
      const s = JSON.stringify(d), h = hash(s);
      if (h !== meta.hashes[k]) rows.push({ k, h, row: { user_id: auth.user.id, day: k, data: d } });
    }
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await upsert('days', 'user_id,day', chunk.map(x => x.row));
      for (const x of chunk) meta.hashes[x.k] = x.h;
      write(MKEY, meta);
    }
    const s = settingsStr(), h = hash(s);
    if (h !== meta.set && S.profile) { await upsert('settings', 'user_id', { user_id: auth.user.id, data: JSON.parse(s) }); meta.set = h; }
  }

  async function sync() {
    if (!auth) return;
    if (busy) { again = true; return; }
    if (!navigator.onLine) return setStatus('offline');
    busy = true; setStatus('syncing');
    try {
      const changed = await pull();
      if (changed) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin espacio */ } }
      await push();
      write(MKEY, meta);
      setStatus('ok');
      if (changed) api.onChange();
    } catch (e) {
      setStatus(e instanceof TypeError ? 'offline' : 'error', e.message);
    } finally {
      busy = false;
      if (again) { again = false; schedule(500); }
    }
  }
  function schedule(ms = 2500) { if (!auth) return; clearTimeout(timer); timer = setTimeout(sync, ms); }

  /* ---------- Vuelta desde el correo (confirmar cuenta / cambiar contraseña) ---------- */
  async function handleRedirect() {
    const h = location.hash;
    if (!/access_token|error_description/.test(h)) return null;
    const p = new URLSearchParams(h.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    if (p.get('error_description')) return { error: p.get('error_description').replace(/\+/g, ' ') };
    const tok = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: +p.get('expires_at') || 0, expires_in: +p.get('expires_in') || 3600 };
    auth = { ...tok, expires_at: tok.expires_at || Math.floor(Date.now() / 1000) + tok.expires_in, user: null };
    const user = await call('/auth/v1/user');
    setSession({ ...tok, user });
    return { type: p.get('type') };
  }

  /* ---------- API pública ---------- */
  Object.assign(api, {
    status: () => ({ logged: !!auth, email: auth?.user?.email || '', ...st }),
    schedule, sync,
    async signIn(email, password) {
      setSession(await authCall('token?grant_type=password', { email, password }));
      await sync();
    },
    async signUp(email, password) {
      const j = await authCall('signup?redirect_to=' + encodeURIComponent(redirect()), { email, password });
      if (j.access_token) { setSession(j); await sync(); return 'in'; }
      return 'confirm';
    },
    recover: email => authCall('recover?redirect_to=' + encodeURIComponent(redirect()), { email }),
    updatePassword: password => call('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password }) }),
    async signOut() {
      if (navigator.onLine) { try { await sync(); await call('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* igual se cierra */ } }
      signOutLocal();
    },
    pending() { // ¿hay cambios sin subir?
      if (!auth) return false;
      if (S.profile && hash(settingsStr()) !== meta.set) return true;
      return Object.entries(S.days).some(([k, d]) => hash(JSON.stringify(d)) !== meta.hashes[k]);
    },
    async init() {
      let res = null;
      try { res = await handleRedirect(); } catch (e) { res = { error: e.message }; }
      window.addEventListener('online', () => schedule(300));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - st.at > 30000) schedule(300);
      });
      if (auth) sync();
      return res;
    },
  });
  return api;
})();
