/* Doruk Ciğerim Kasa — çok mağazalı sürüm
 * Veriler Google Firebase (Firestore) üzerinde. İnternet yokken satışlar cihazda bekler, bağlantı gelince gönderilir.
 */
"use strict";
const FB_VERSION = "10.12.2";
const DEFAULT_LOGO = "logo.jpg";

/* ================= YARDIMCILAR ================= */
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = c => (c < 0 ? "-" : "") + (S.settings.cur || "₺") + nf.format(Math.abs(c || 0) / 100);
const num = v => parseFloat(String(v).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const toCents = v => Math.round(num(v) * 100);
const pad = n => String(n).padStart(2, "0");
const dayKey = d => { d = new Date(d); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const dayTR = k => k.split("-").reverse().join(".");
const timeStr = d => { d = new Date(d); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const fullDate = d => new Date(d).toLocaleString("tr-TR");
const ROLE = { owner: "Sahip", manager: "Müdür", cashier: "Kasiyer" };
const key = s => String(s == null || s === "" ? "-" : s).replace(/[.~*/\[\]`]/g, "_").slice(0, 120);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
function toast(m) { const t = $("#toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 2600); }
const openM = id => $(id).classList.add("on"), closeM = id => $(id).classList.remove("on");
function show(id, on) { $(id).classList.toggle("hidden", !on); }
function loadImage(file, w, h, mode, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      let cw = w, ch = h;
      if (mode === "contain") { const s = Math.min(1, w / im.width, h / im.height); cw = Math.round(im.width * s); ch = Math.round(im.height * s); }
      const c = document.createElement("canvas"); c.width = cw; c.height = ch; const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, cw, ch);
      const s = mode === "contain" ? cw / im.width : Math.max(cw / im.width, ch / im.height), dw = im.width * s, dh = im.height * s;
      x.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh); cb(c.toDataURL("image/jpeg", 0.78));
    };
    im.onerror = () => toast("Bu fotoğraf açılamadı"); im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function download(name, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function printHTML(h) { $("#print").innerHTML = h; setTimeout(() => window.print(), 120); }
const authErr = e => {
  const c = (e && e.code) || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "E-posta veya şifre hatalı.";
  if (c.includes("email-already-in-use")) return "Bu e-posta zaten kullanılıyor.";
  if (c.includes("invalid-email")) return "Geçersiz e-posta adresi.";
  if (c.includes("operation-not-allowed")) return "Firebase'de E-posta/Şifre girişi açık değil (Authentication → Sign-in method).";
  if (c.includes("weak-password")) return "Şifre en az 6 karakter olmalı.";
  if (c.includes("network")) return "İnternet bağlantısı yok. İlk giriş için internet gerekir.";
  if (c.includes("too-many")) return "Çok fazla deneme. Biraz bekleyip tekrar deneyin.";
  if (c.includes("permission")) return "Yetki hatası. Firebase güvenlik kuralları yüklendi mi?";
  return (e && e.message) || "Bir hata oluştu.";
};

/* ================= VERİTABANI (Firebase) ================= */
const INC = n => ({ __inc: n });
let DB = null;
async function makeFirebaseDB(cfg) {
  const B = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
  const [AP, A, F] = await Promise.all([import(B + "firebase-app.js"), import(B + "firebase-auth.js"), import(B + "firebase-firestore.js")]);
  const app = AP.initializeApp(cfg);
  const auth = A.getAuth(app);
  let fs;
  try { fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { fs = F.getFirestore(app); }
  const isCol = p => p.split("/").length % 2 === 1;
  const ref = p => isCol(p) ? F.collection(fs, p) : F.doc(fs, p);
  const q = (p, filters = []) => F.query(F.collection(fs, p), ...filters.map(([f, op, v]) => F.where(f, op, v)));
  const conv = v => {
    if (v && typeof v === "object" && v.__inc !== undefined) return F.increment(v.__inc);
    if (v && typeof v === "object" && !Array.isArray(v)) { const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = conv(v[k]); return o; }
    return v;
  };
  const docs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  return {
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null)),
    signIn: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    signUp: (e, p) => A.createUserWithEmailAndPassword(auth, e, p).then(c => ({ uid: c.user.uid, email: c.user.email })),
    signOut: () => A.signOut(auth),
    createAccount: async (e, p) => {
      const sec = AP.initializeApp(cfg, "ikincil-" + Date.now());
      try { const sa = A.getAuth(sec); const c = await A.createUserWithEmailAndPassword(sa, e, p); const id = c.user.uid; await A.signOut(sa); return id; }
      finally { AP.deleteApp(sec).catch(() => { }); }
    },
    get: async p => {
      try { const s = await F.getDoc(ref(p)); return s.exists() ? { id: s.id, ...s.data() } : null; }
      catch (e) { const s = await F.getDocFromCache(ref(p)); return s.exists() ? { id: s.id, ...s.data() } : null; }
    },
    query: async (p, filters) => docs(await F.getDocs(q(p, filters))),
    watch: (p, cb, filters) => F.onSnapshot(isCol(p) ? q(p, filters) : ref(p),
      s => cb(s.docs ? docs(s) : (s.exists() ? { id: s.id, ...s.data() } : null)),
      e => { console.error(p, e); if (String(e.code).includes("permission")) toast("Yetki hatası: " + p); }),
    write: (p, data, merge) => F.setDoc(ref(p), conv(data), merge ? { merge: true } : {}),
    remove: p => F.deleteDoc(ref(p)),
    newId: () => F.doc(F.collection(fs, "x")).id,
  };
}
/* Bekleyen yazma takibi (çevrimdışı göstergesi için) */
let pending = 0;
function track(p) {
  pending++; updSync();
  p.catch(e => { console.error(e); toast("Kaydedilemedi: " + ((e && e.code) || e.message)); }).finally(() => { pending--; updSync(); });
  return p;
}
const dbSet = (p, d, merge) => track(DB.write(p, d, merge));
const dbDel = p => track(DB.remove(p));
function updSync() {
  const on = navigator.onLine, el = $("#sync");
  el.classList.toggle("off", !on || pending > 0);
  $("#syncTxt").textContent = !on ? (pending ? `Çevrimdışı · ${pending} kayıt bekliyor` : "Çevrimdışı") : (pending ? `Gönderiliyor (${pending})` : "Çevrimiçi");
}
window.addEventListener("online", updSync); window.addEventListener("offline", updSync);

/* ================= DURUM ================= */
const S = {
  user: null, acc: null, mode: null, // mode: "owner" | "store"
  settings: defaultSettings(), cats: [], items: [], stores: [], store: null, sid: null, users: [], me: null,
  unsubs: [], view: null, liveDays: {}
};
function defaultSettings() {
  return { name: "Doruk Ciğerim", cur: "₺", tax: 10, taxIncl: true, footer: "Afiyet olsun! Yine bekleriz.", pays: ["Nakit", "Kredi Kartı", "Yemek Kartı"], maxDisc: 10, cashReport: false, cashVoid: false, logo: null };
}
const logo = () => S.settings.logo || DEFAULT_LOGO;
const catOf = id => S.cats.find(c => c.id === id);
const catName = id => (catOf(id) || { name: "(kategorisiz)" }).name;
const itemColor = m => m.color || (catOf(m.catId) || { color: "#f5b41e" }).color;
const storeName = sid => (S.stores.find(s => s.id === sid) || (S.store && S.store.id === sid ? S.store : null) || { name: "?" }).name;
const priceFor = (m, st) => (st && st.prices && st.prices[m.id] != null) ? st.prices[m.id] : m.price;
const hiddenIn = (m, st) => !!(st && st.hidden && st.hidden[m.id]);
const isManager = () => S.mode === "owner" || (S.me && S.me.role === "manager");
function unsubAll() { S.unsubs.forEach(u => { try { u(); } catch (e) { } }); S.unsubs = []; Object.values(S.liveDays).forEach(u => u()); S.liveDays = {}; }

/* ================= ÖRNEK MENÜ ================= */
const SAMPLE_CATS = [["Ciğer", "#8b1e1e"], ["Izgara", "#c2410c"], ["Dürüm & Ekmek Arası", "#b45309"], ["Yan Lezzetler", "#15803d"], ["Sıcak İçecekler", "#78350f"], ["Soğuk İçecekler", "#0369a1"], ["Tatlılar", "#be185d"]];
const SAMPLE = [["Ciğer Şiş (Porsiyon)", 0, 350], ["Yarım Porsiyon Ciğer", 0, 220], ["Ciğer Kavurma", 0, 380], ["Arnavut Ciğeri", 0, 360], ["Pilav Üstü Ciğer", 0, 400],
["Adana Kebap", 1, 380], ["Urfa Kebap", 1, 380], ["Kuzu Şiş", 1, 450], ["Tavuk Şiş", 1, 300], ["Izgara Köfte", 1, 320],
["Ciğer Dürüm", 2, 250], ["Adana Dürüm", 2, 260], ["Tavuk Dürüm", 2, 200], ["Köfte Ekmek", 2, 220],
["Pilav", 3, 80], ["Çoban Salata", 3, 90], ["Acılı Ezme", 3, 70], ["Közlenmiş Biber", 3, 60], ["Patates Kızartması", 3, 90],
["Çay", 4, 20], ["Fincan Çay", 4, 35], ["Türk Kahvesi", 4, 70], ["Nescafe", 4, 60],
["Ayran", 5, 40], ["Şalgam", 5, 45], ["Kola", 5, 60], ["Su", 5, 15], ["Soda", 5, 30], ["Künefe", 6, 180], ["Sütlaç", 6, 120]];
async function seedSample() {
  const ps = [DB.write("settings/main", defaultSettings())];
  SAMPLE_CATS.forEach((c, i) => ps.push(DB.write("cats/c" + (i + 1), { name: c[0], color: c[1], active: true, order: i })));
  SAMPLE.forEach((s, i) => ps.push(DB.write("items/m" + (i + 1), { name: s[0], catId: "c" + (s[1] + 1), price: s[2] * 100, color: null, img: null, active: true, order: i })));
  await Promise.all(ps);
}

/* ================= AÇILIŞ ================= */
async function boot() {
  const cfg = window.FIREBASE_CONFIG;
  if (!window.__MOCK_DB__ && (!cfg || !cfg.apiKey)) {
    $("#loadingMsg").innerHTML = "<b>Kurulum gerekli.</b><br>config.js dosyasına Firebase bilgilerini ekleyin.";
    return;
  }
  try { DB = window.__MOCK_DB__ ? window.__MOCK_DB__() : await makeFirebaseDB(cfg); }
  catch (e) {
    console.error(e);
    $("#loadingMsg").innerHTML = "Uygulama yüklenemedi. İlk açılışta internet bağlantısı gerekir.<br><br><button class='btn brand' onclick='location.reload()'>Tekrar dene</button>";
    return;
  }
  updSync();
  DB.onAuth(u => { if (!S.bootstrapping) handleUser(u); });
}
async function handleUser(u) {
  unsubAll(); S.user = u; S.acc = null; S.me = null; S.mode = null;
  if (!u) { showAuth(); return; }
  let acc = null;
  try { acc = await DB.get("accounts/" + u.uid); } catch (e) { acc = lsGet("acc:" + u.uid, null); }
  if (acc) lsSet("acc:" + u.uid, { role: acc.role, storeId: acc.storeId || null });
  if (!acc) {
    showAuth(); $("#auErr").textContent = "Bu hesap bir mağazaya veya sahibe bağlı değil.";
    DB.signOut(); return;
  }
  S.acc = acc;
  // ortak veriler
  S.unsubs.push(DB.watch("settings/main", d => { S.settings = Object.assign(defaultSettings(), d || {}); applyBrand(); refresh(); }));
  S.unsubs.push(DB.watch("cats", list => { S.cats = list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); refresh(); }));
  S.unsubs.push(DB.watch("items", list => { S.items = list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); refresh(); }));
  if (acc.role === "owner") startOwner(); else startStore(acc.storeId);
}
function hideScreens() { ["#scrLoading", "#scrAuth", "#scrPin"].forEach(s => show(s, false)); }
function applyBrand() {
  $$("#hdrLogo,#pinLogo").forEach(i => i.src = logo());
  document.title = S.settings.name + " Kasa";
  $("#hdrTitle").textContent = S.mode === "store" && S.store ? S.store.name : S.settings.name;
}

/* ---------- Cihaz girişi / ilk kurulum ---------- */
async function showAuth() {
  hideScreens(); show("#scrAuth", true);
  $("#auErr").textContent = ""; $("#suErr").textContent = "";
  let ownerExists = true;
  try { ownerExists = !!(await DB.get("meta/owner")); } catch (e) { ownerExists = true; }
  show("#authSetup", !ownerExists); show("#authLogin", ownerExists);
}
$("#auLogin").onclick = async () => {
  const e = $("#auEmail").value.trim(), p = $("#auPass").value;
  if (!e || !p) { $("#auErr").textContent = "E-posta ve şifre girin."; return; }
  $("#auLogin").disabled = true; $("#auErr").textContent = "";
  try { await DB.signIn(e, p); $("#auPass").value = ""; } catch (x) { $("#auErr").textContent = authErr(x); }
  $("#auLogin").disabled = false;
};
$("#auPass").addEventListener("keydown", e => { if (e.key === "Enter") $("#auLogin").click(); });
$("#suCreate").onclick = async () => {
  const e = $("#suEmail").value.trim(), p = $("#suPass").value;
  if (p !== $("#suPass2").value) { $("#suErr").textContent = "Şifreler aynı değil."; return; }
  $("#suCreate").disabled = true; $("#suErr").textContent = "Oluşturuluyor…";
  S.bootstrapping = true;
  try {
    const u = await DB.signUp(e, p);
    await DB.write("meta/owner", { uid: u.uid, email: e, at: Date.now() });
    await DB.write("accounts/" + u.uid, { role: "owner", email: e });
    await seedSample();
    S.bootstrapping = false; handleUser(u);
  } catch (x) {
    S.bootstrapping = false; $("#suErr").textContent = authErr(x);
    try { await DB.signOut(); } catch (y) { }
  }
  $("#suCreate").disabled = false;
};

/* ================= GEZİNME ================= */
const NAV = {
  owner: [["overview", "Genel Bakış"], ["report", "Raporlar"], ["orders", "Siparişler"], ["stores", "Mağazalar"], ["menu", "Menü"], ["settings", "Ayarlar"]],
  store: [["register", "Kasa"], ["orders", "Siparişler"], ["report", "Rapor", "report"], ["staff", "Personel", "mgr"], ["device", "Cihaz", "mgr"]]
};
function buildNav() {
  const items = NAV[S.mode].filter(n => !n[2] || (n[2] === "mgr" ? isManager() : (isManager() || S.settings.cashReport)));
  $("#nav").innerHTML = items.map(n => `<button data-v="${n[0]}">${n[1]}</button>`).join("");
  $$(".ownerOnly").forEach(e => e.classList.toggle("hidden", S.mode !== "owner"));
}
$("#nav").addEventListener("click", e => { const b = e.target.closest("button"); if (b) go(b.dataset.v); });
function go(v) {
  S.view = v;
  $$("#nav button").forEach(x => x.classList.toggle("on", x.dataset.v === v));
  $$(".view").forEach(x => x.classList.toggle("on", x.id === "v-" + v));
  render();
}
let refreshT = null;
function refresh() { clearTimeout(refreshT); refreshT = setTimeout(() => {
  const a = document.activeElement; // yazı yazılırken formu yeniden çizme
  if (a && (a.tagName === "INPUT" || a.tagName === "SELECT") && ["settings", "stores"].includes(S.view) && a.closest(".view.on")) return;
  if (S.mode) { if (S.mode === "store" && !S.me) renderPinUsers(); else render(); } }, 30); }
function render() {
  const f = {
    register: renderRegister, orders: renderOrders, report: renderReport, staff: renderStaff, device: renderDevice,
    overview: renderOverview, stores: renderStores, menu: renderMenu, settings: renderSettings
  }[S.view];
  if (f) f();
}
function storeOptions(sel, withAll) {
  const el = $(sel), cur = el.value;
  el.innerHTML = (withAll ? `<option value="all">Tüm mağazalar</option>` : "") + S.stores.map(s => `<option value="${s.id}">${esc(s.name)}${s.active === false ? " (pasif)" : ""}</option>`).join("");
  if ([...el.options].some(o => o.value === cur)) el.value = cur;
}

/* ================= SAHİP ================= */
function startOwner() {
  S.mode = "owner"; hideScreens();
  $("#whoName").textContent = S.user.email; $("#whoRole").textContent = "Sahip"; $("#whoRole").className = "role owner";
  $("#lockBtn").classList.add("hidden");
  S.unsubs.push(DB.watch("stores", list => { S.stores = list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); watchToday(); refresh(); }));
  buildNav(); applyBrand(); go("overview");
}
/* Bugünün özetlerini canlı izle */
function watchToday() {
  const today = dayKey(Date.now());
  S.stores.forEach(s => {
    const k = s.id + "|" + today;
    if (S.liveDays[k]) return;
    S.liveDays[k] = DB.watch(`stores/${s.id}/days/${today}`, d => { S.today = S.today || {}; S.today[s.id] = d; if (S.view === "overview") renderOverview(); });
  });
}
function renderOverview() {
  const today = dayKey(Date.now()), T = S.today || {};
  const act = S.stores.filter(s => s.active !== false);
  const sum = act.reduce((a, s) => { const t = (T[s.id] && T[s.id].tot) || {}; a.total += t.total || 0; a.n += t.n || 0; return a; }, { total: 0, n: 0 });
  $("#overviewBody").innerHTML = `
  <div class="card"><h2>Bugün · ${dayTR(today)} <span class="muted" style="font-weight:400;font-size:14px">· canlı</span></h2>
    <div class="kpis"><div class="kpi big"><div class="l">Tüm mağazalar toplam</div><div class="v">${money(sum.total)}</div></div>
    <div class="kpi"><div class="l">Sipariş</div><div class="v">${sum.n}</div></div>
    <div class="kpi"><div class="l">Ortalama sipariş</div><div class="v">${money(sum.n ? Math.round(sum.total / sum.n) : 0)}</div></div>
    <div class="kpi"><div class="l">Aktif mağaza</div><div class="v">${act.length}</div></div></div></div>
  ${act.length ? `<div class="stores">${act.map(s => {
    const d = T[s.id] || {}, t = d.tot || {}, pay = d.pay || {};
    return `<div class="scard"><h3>${esc(s.name)}</h3><div class="t">${money(t.total || 0)}</div>
      <div class="m"><span>${t.n || 0} sipariş</span><span>Ort. ${money(t.n ? Math.round(t.total / t.n) : 0)}</span></div>
      ${Object.values(pay).filter(p => p.n > 0).map(p => `<div class="m"><span>${esc(p.name)}</span><span>${money(p.amt)}</span></div>`).join("")}
      ${d.voids && d.voids.n ? `<div class="m"><span>İptal</span><span>${d.voids.n} · ${money(d.voids.amt)}</span></div>` : ""}
      <div class="row" style="margin-top:10px"><button class="btn sm" data-rep="${s.id}">Rapor</button><button class="btn sm" data-ord="${s.id}">Siparişler</button></div></div>`;
  }).join("")}</div>` : `<div class="card"><p>Henüz mağaza yok. <b>Mağazalar</b> sekmesinden ilk mağazanızı ekleyin.</p><button class="btn brand" id="goStores">Mağaza ekle</button></div>`}`;
  const g = $("#goStores"); if (g) g.onclick = () => go("stores");
}
$("#overviewBody").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.rep) { go("report"); $("#repStore").value = b.dataset.rep; setRange(Date.now(), Date.now()); }
  if (b.dataset.ord) { go("orders"); $("#ordStore").value = b.dataset.ord; $("#ordersDate").value = dayKey(Date.now()); renderOrders(); }
});

/* ---------- Mağazalar ---------- */
let storeSel = null, storeTab = "info";
function renderStores() {
  const st = storeSel && S.stores.find(s => s.id === storeSel);
  if (!st) { storeSel = null; return renderStoreList(); }
  renderStoreDetail(st);
}
function renderStoreList() {
  const T = S.today || {};
  $("#storesBody").innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">Mağazalar (${S.stores.length})</h2><span style="flex:1"></span><button class="btn brand" id="addStore">+ Mağaza ekle</button></div>
  <p class="muted" style="margin:8px 0 0">Her mağaza kendi giriş hesabıyla çalışır. Menü ortaktır; mağazaya özel fiyat ve gizleme için mağazaya tıklayın.</p></div>
  <div class="card"><table><tr><th>Mağaza</th><th>Giriş e-postası</th><th class="r">Bugün</th><th>Durum</th><th></th></tr>
  ${S.stores.map(s => `<tr><td><b>${esc(s.name)}</b></td><td class="muted">${esc(s.email || "")}</td><td class="r">${money(((T[s.id] || {}).tot || {}).total || 0)}</td>
   <td>${s.active === false ? '<span class="tag off">Pasif</span>' : '<span class="tag">Aktif</span>'}</td><td class="act"><button class="btn sm" data-open="${s.id}">Aç</button></td></tr>`).join("") || '<tr><td colspan="5" class="muted">Henüz mağaza yok.</td></tr>'}</table></div>`;
  $("#addStore").onclick = () => { $("#snName").value = ""; $("#snEmail").value = ""; $("#snPass").value = ""; openM("#mStore"); };
}
$("#storesBody").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.open) { storeSel = b.dataset.open; storeTab = "info"; renderStores(); }
  if (b.dataset.tab) { storeTab = b.dataset.tab; renderStores(); }
  if (b.id === "stBack") { storeSel = null; renderStores(); }
});
$("#snCancel").onclick = () => closeM("#mStore");
$("#snSave").onclick = async () => {
  const name = $("#snName").value.trim(), email = $("#snEmail").value.trim(), pass = $("#snPass").value;
  if (!name || !email || pass.length < 6) { toast("Ad, e-posta ve en az 6 karakterli şifre girin"); return; }
  $("#snSave").disabled = true; $("#snSave").textContent = "Oluşturuluyor…";
  try {
    const uid = await DB.createAccount(email, pass);
    const sid = DB.newId();
    await DB.write("stores/" + sid, { name, email, uid, active: true, order: S.stores.length, prices: {}, hidden: {}, createdAt: Date.now() });
    await DB.write("accounts/" + uid, { role: "store", storeId: sid, email });
    await DB.write(`stores/${sid}/users/u1`, { name: "Müdür", role: "manager", pin: "1234", active: true });
    await DB.write(`stores/${sid}/users/u2`, { name: "Kasiyer", role: "cashier", pin: "1111", active: true });
    closeM("#mStore"); toast("Mağaza oluşturuldu: " + name);
  } catch (x) { toast(authErr(x)); }
  $("#snSave").disabled = false; $("#snSave").textContent = "Mağazayı oluştur";
};
let ownerStoreUsers = { sid: null, list: [], unsub: null };
function watchStoreUsers(sid) {
  if (ownerStoreUsers.sid === sid) return;
  if (ownerStoreUsers.unsub) ownerStoreUsers.unsub();
  ownerStoreUsers = { sid, list: [], unsub: DB.watch(`stores/${sid}/users`, l => { ownerStoreUsers.list = l; if (S.view === "stores" && storeTab === "staff") renderStores(); }) };
}
function renderStoreDetail(st) {
  const tabs = [["info", "Bilgiler"], ["staff", "Personel"], ["prices", "Fiyatlar ve görünürlük"]];
  let body = "";
  if (storeTab === "info") {
    body = `<div class="card"><h2>Bilgiler</h2><div class="two">
      <label class="field">Mağaza adı<input id="stName" value="${esc(st.name)}"></label>
      <label class="field">Giriş e-postası<input value="${esc(st.email || "")}" disabled></label></div>
      <div style="margin-top:12px"><label class="check"><input type="checkbox" id="stActive" ${st.active !== false ? "checked" : ""}> Aktif (kapatılırsa mağaza cihazı satış yapamaz)</label></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="stSave">Kaydet</button>
      <span style="flex:1"></span><button class="btn sm" data-mv="-1">▲ Sırada yukarı</button><button class="btn sm" data-mv="1">▼ aşağı</button></div>
      <p class="muted" style="font-size:14px;margin-top:14px">Mağaza şifresini değiştirmek için: Firebase konsolu → Authentication → bu e-posta → şifre sıfırla.</p></div>`;
  } else if (storeTab === "staff") {
    watchStoreUsers(st.id);
    body = `<div class="card"><div class="row"><h2 style="margin:0">Personel</h2><span style="flex:1"></span><button class="btn brand" id="stAddUser">+ Personel ekle</button></div></div>
      <div class="card">${usersTable(ownerStoreUsers.list)}</div>`;
  } else {
    body = `<div class="card"><h2>Fiyatlar ve görünürlük</h2><p class="muted" style="margin-top:0">Boş bırakılan fiyat, menüdeki varsayılan fiyatı kullanır. "Bu mağazada gizle" işaretli ürünler bu mağazanın kasasında görünmez.</p>
      <table><tr><th>Ürün</th><th>Kategori</th><th class="r">Varsayılan</th><th class="r">Bu mağaza</th><th>Gizle</th></tr>
      ${S.cats.map(c => S.items.filter(m => m.catId === c.id).map(m => `<tr><td><b>${esc(m.name)}</b></td><td class="muted">${esc(c.name)}</td><td class="r">${money(m.price)}</td>
        <td class="r"><input class="price-in" data-pid="${m.id}" inputmode="decimal" value="${st.prices && st.prices[m.id] != null ? nf.format(st.prices[m.id] / 100) : ""}" placeholder="—"></td>
        <td><input type="checkbox" data-hid="${m.id}" ${st.hidden && st.hidden[m.id] ? "checked" : ""} style="width:22px;height:22px"></td></tr>`).join("")).join("")}</table>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="stSavePrices">Fiyatları kaydet</button></div></div>`;
  }
  $("#storesBody").innerHTML = `<div class="card"><div class="row"><button class="btn" id="stBack">← Mağazalar</button><h2 style="margin:0">${esc(st.name)}</h2></div></div>
    <div class="subnav">${tabs.map(t => `<button data-tab="${t[0]}" class="${t[0] === storeTab ? "on" : ""}">${t[1]}</button>`).join("")}</div>${body}`;
  if (storeTab === "info") {
    $("#stSave").onclick = () => { dbSet("stores/" + st.id, { name: $("#stName").value.trim() || st.name, active: $("#stActive").checked }, true); toast("Kaydedildi"); };
    $$("#storesBody [data-mv]").forEach(b => b.onclick = () => {
      const i = S.stores.indexOf(st), j = i + +b.dataset.mv; if (j < 0 || j >= S.stores.length) return;
      const o = S.stores[j]; dbSet("stores/" + st.id, { order: j }, true); dbSet("stores/" + o.id, { order: i }, true);
    });
  } else if (storeTab === "staff") {
    $("#stAddUser").onclick = () => openUser(null, st.id, ownerStoreUsers.list);
    $$("#storesBody [data-uedit]").forEach(b => b.onclick = () => openUser(ownerStoreUsers.list.find(u => u.id === b.dataset.uedit), st.id, ownerStoreUsers.list));
  } else {
    $("#stSavePrices").onclick = () => {
      const prices = {}, hidden = {};
      $$("#storesBody [data-pid]").forEach(i => { if (i.value.trim() !== "") prices[i.dataset.pid] = toCents(i.value); });
      $$("#storesBody [data-hid]").forEach(i => { if (i.checked) hidden[i.dataset.hid] = true; });
      // Belgeyi tamamen yaz ki kaldırılan fiyatlar da silinsin
      dbSet("stores/" + st.id, Object.assign({}, stripId(st), { prices, hidden }));
      toast("Fiyatlar kaydedildi");
    };
  }
}
const stripId = o => { const c = Object.assign({}, o); delete c.id; return c; };

/* ---------- Menü (kategoriler / ürünler) ---------- */
let menuPane = "cats", itemFilter = "all", editCat = null, editItm = null, itImg = null;
$("#menuNav").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; menuPane = b.dataset.p; renderMenu(); });
function renderMenu() {
  $$("#menuNav button").forEach(b => b.classList.toggle("on", b.dataset.p === menuPane));
  show("#p-cats", menuPane === "cats"); show("#p-items", menuPane === "items");
  menuPane === "cats" ? renderCats() : renderItems();
}
function renderCats() {
  $("#catCount").textContent = "(" + S.cats.length + ")";
  $("#catTable").innerHTML = `<tr><th>Sıra</th><th></th><th>Ad</th><th class="r">Ürün</th><th>Kasada</th><th></th></tr>` +
    S.cats.map((c, i) => `<tr><td class="act" style="text-align:left"><button class="btn sm" data-cmv="-1" data-i="${i}" ${i === 0 ? "disabled" : ""}>▲</button> <button class="btn sm" data-cmv="1" data-i="${i}" ${i === S.cats.length - 1 ? "disabled" : ""}>▼</button></td>
    <td><span class="swatch" style="background:${esc(c.color)}"></span></td><td><b>${esc(c.name)}</b></td><td class="r">${S.items.filter(m => m.catId === c.id).length}</td>
    <td>${c.active !== false ? "Görünür" : '<span class="muted">Gizli</span>'}</td><td class="act"><button class="btn sm" data-cedit="${c.id}">Düzenle</button></td></tr>`).join("") || '<tr><td colspan="6" class="muted">Henüz kategori yok.</td></tr>';
}
function swapOrder(col, list, i, j) {
  if (j < 0 || j >= list.length) return;
  list.forEach((x, k) => { const want = k === i ? j : k === j ? i : k; if (x.order !== want) dbSet(`${col}/${x.id}`, { order: want }, true); });
}
$("#catTable").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.cmv) { const i = +b.dataset.i; swapOrder("cats", S.cats, i, i + +b.dataset.cmv); }
  if (b.dataset.cedit) openCat(S.cats.find(c => c.id === b.dataset.cedit));
});
function openCat(c) {
  editCat = c || null; $("#catTitle").textContent = c ? "Kategoriyi düzenle" : "Yeni kategori";
  $("#ctName").value = c ? c.name : ""; $("#ctColor").value = c ? c.color : "#f5b41e"; $("#ctActive").checked = c ? c.active !== false : true;
  show("#ctDelete", !!c); openM("#mCat");
}
$("#addCat").onclick = () => openCat(null);
$("#ctCancel").onclick = () => closeM("#mCat");
$("#ctSave").onclick = () => {
  const name = $("#ctName").value.trim(); if (!name) { toast("Ad girin"); return; }
  if (S.cats.some(c => c.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr") && c !== editCat)) { toast("Bu kategori zaten var"); return; }
  const d = { name, color: $("#ctColor").value, active: $("#ctActive").checked };
  if (editCat) dbSet("cats/" + editCat.id, d, true); else dbSet("cats/" + DB.newId(), { ...d, order: S.cats.length });
  closeM("#mCat"); toast("Kaydedildi");
};
$("#ctDelete").onclick = () => {
  if (!editCat) return; const n = S.items.filter(m => m.catId === editCat.id);
  if (n.length) {
    const others = S.cats.filter(c => c !== editCat);
    if (!others.length) { alert(`Bu kategoride ${n.length} ürün var. Önce başka bir kategori oluşturun.`); return; }
    const target = prompt(`Bu kategoride ${n.length} ürün var. Ürünlerin taşınacağı kategorinin adını yazın:\n${others.map(c => c.name).join(", ")}`, others[0].name);
    if (target === null) return; const t = others.find(c => c.name.toLocaleLowerCase("tr") === target.trim().toLocaleLowerCase("tr"));
    if (!t) { alert("Kategori bulunamadı. Hiçbir şey silinmedi."); return; }
    n.forEach(m => dbSet("items/" + m.id, { catId: t.id }, true));
  } else if (!confirm(`"${editCat.name}" kategorisi silinsin mi?`)) return;
  dbDel("cats/" + editCat.id); closeM("#mCat"); toast("Kategori silindi");
};
function renderItems() {
  $("#itemFilter").innerHTML = `<option value="all">Tüm kategoriler</option>` + S.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if (itemFilter !== "all" && !catOf(itemFilter)) itemFilter = "all"; $("#itemFilter").value = itemFilter;
  const ord = S.cats.map(c => c.id);
  const list = S.items.filter(m => itemFilter === "all" || m.catId === itemFilter).sort((a, b) => (ord.indexOf(a.catId) - ord.indexOf(b.catId)) || ((a.order ?? 0) - (b.order ?? 0)));
  $("#itemCount").textContent = "(" + S.items.length + ")";
  $("#itemTable").innerHTML = `<tr><th>Sıra</th><th>Foto</th><th>Ad</th><th>Kategori</th><th class="r">Fiyat</th><th>Kasada</th><th></th></tr>` +
    list.map(m => {
      const same = list.filter(y => y.catId === m.catId), p = same.indexOf(m);
      return `<tr><td class="act" style="text-align:left"><button class="btn sm" data-imv="-1" data-id="${m.id}" ${p === 0 ? "disabled" : ""}>▲</button> <button class="btn sm" data-imv="1" data-id="${m.id}" ${p === same.length - 1 ? "disabled" : ""}>▼</button></td>
      <td>${m.img ? `<span class="thumb" style="background-image:url('${m.img}')"></span>` : `<span class="thumb" style="background:${esc(itemColor(m))}"></span>`}</td>
      <td><b>${esc(m.name)}</b></td><td>${esc(catName(m.catId))}</td><td class="r">${money(m.price)}</td><td>${m.active !== false ? "Görünür" : '<span class="muted">Gizli</span>'}</td>
      <td class="act"><button class="btn sm" data-iedit="${m.id}">Düzenle</button></td></tr>`;
    }).join("") || '<tr><td colspan="7" class="muted">Ürün yok.</td></tr>';
}
$("#itemFilter").onchange = e => { itemFilter = e.target.value; renderItems(); };
$("#itemTable").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.iedit) { openItem(S.items.find(m => m.id === b.dataset.iedit)); return; }
  if (b.dataset.imv) {
    const m = S.items.find(x => x.id === b.dataset.id), same = S.items.filter(x => x.catId === m.catId), i = same.indexOf(m);
    swapOrder("items", same, i, i + +b.dataset.imv);
  }
});
function showItPrev() {
  const p = $("#itPrev");
  if (itImg) { p.style.backgroundImage = `url('${itImg}')`; p.textContent = ""; } else { p.style.backgroundImage = ""; p.textContent = "Fotoğraf yok"; }
  show("#itPhotoDel", !!itImg);
}
function openItem(m) {
  if (!S.cats.length) { toast("Önce bir kategori oluşturun"); return; }
  editItm = m || null; itImg = m ? m.img || null : null; $("#itemTitle").textContent = m ? "Ürünü düzenle" : "Yeni ürün";
  $("#itCat").innerHTML = S.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("#itName").value = m ? m.name : ""; $("#itCat").value = m ? m.catId : (itemFilter !== "all" ? itemFilter : S.cats[0].id);
  $("#itPrice").value = m ? nf.format(m.price / 100) : ""; $("#itOwnColor").checked = !!(m && m.color);
  $("#itColor").value = m && m.color ? m.color : "#f5b41e"; show("#itColor", $("#itOwnColor").checked);
  $("#itActive").checked = m ? m.active !== false : true; show("#itDelete", !!m); showItPrev(); openM("#mItem");
}
$("#itPhoto").onchange = e => { const f = e.target.files[0]; if (!f) return; loadImage(f, 320, 240, "cover", d => { itImg = d; showItPrev(); }); e.target.value = ""; };
$("#itPhotoDel").onclick = () => { itImg = null; showItPrev(); };
$("#itOwnColor").onchange = () => show("#itColor", $("#itOwnColor").checked);
$("#addItem").onclick = () => openItem(null);
$("#itCancel").onclick = () => closeM("#mItem");
$("#itSave").onclick = () => {
  const name = $("#itName").value.trim(); if (!name) { toast("Ürün adı girin"); return; }
  if ($("#itPrice").value.trim() === "") { toast("Fiyat girin"); return; }
  const d = { name, catId: $("#itCat").value, price: toCents($("#itPrice").value), color: $("#itOwnColor").checked ? $("#itColor").value : null, img: itImg, active: $("#itActive").checked };
  if (editItm) dbSet("items/" + editItm.id, d, true);
  else dbSet("items/" + DB.newId(), { ...d, order: S.items.filter(m => m.catId === d.catId).reduce((a, m) => Math.max(a, (m.order ?? 0) + 1), 0) });
  closeM("#mItem"); toast("Kaydedildi");
};
$("#itDelete").onclick = () => { if (editItm && confirm(`"${editItm.name}" silinsin mi? Geçmiş satışlar raporlarda kalır.`)) { dbDel("items/" + editItm.id); closeM("#mItem"); } };

/* ---------- Ayarlar ---------- */
function renderSettings() {
  const s = S.settings; $("#setName").value = s.name; $("#setCur").value = s.cur; $("#setTax").value = String(s.tax).replace(".", ","); $("#setFooter").value = s.footer;
  $("#setPays").value = (s.pays || []).join(", "); $("#setMaxDisc").value = s.maxDisc;
  $("#setCashReport").checked = !!s.cashReport; $("#setCashVoid").checked = !!s.cashVoid; $("#setTaxIncl").checked = !!s.taxIncl;
  $("#logoPrev").style.backgroundImage = `url('${logo()}')`;
  $("#ownerInfo").textContent = "Giriş yapan: " + (S.user && S.user.email);
  loadAdmins();
}
$("#logoFile").onchange = e => { const f = e.target.files[0]; if (!f) return; loadImage(f, 480, 480, "contain", d => { dbSet("settings/main", { logo: d }, true); toast("Logo güncellendi"); }); e.target.value = ""; };
$("#logoReset").onclick = () => dbSet("settings/main", { logo: null }, true);
$("#saveSettings").onclick = () => {
  const pays = $("#setPays").value.split(",").map(x => x.trim()).filter(Boolean);
  if (!pays.length) { toast("En az bir ödeme yöntemi girin"); return; }
  dbSet("settings/main", {
    name: $("#setName").value.trim() || "Doruk Ciğerim", cur: $("#setCur").value || "₺", tax: Math.max(0, num($("#setTax").value)),
    footer: $("#setFooter").value, pays, maxDisc: Math.min(100, Math.max(0, num($("#setMaxDisc").value))),
    cashReport: $("#setCashReport").checked, cashVoid: $("#setCashVoid").checked, taxIncl: $("#setTaxIncl").checked
  }, true);
  toast("Ayarlar kaydedildi (tüm mağazalarda geçerli)");
};
/* ---------- Yöneticiler (sahip hesapları) ---------- */
let admins = [];
async function loadAdmins() {
  try { admins = await DB.query("accounts", [["role", "==", "owner"]]); } catch (e) { admins = []; }
  $("#adminTable").innerHTML = `<tr><th>E-posta</th><th></th></tr>` + admins.map(a => `<tr><td><b>${esc(a.email || a.id)}</b>${S.user && a.id === S.user.uid ? ' <span class="muted">(siz)</span>' : ""}</td>
    <td class="act">${S.user && a.id === S.user.uid ? "" : `<button class="btn sm bad" data-adel="${a.id}">Kaldır</button>`}</td></tr>`).join("");
}
$("#adminTable").addEventListener("click", e => {
  const b = e.target.closest("[data-adel]"); if (!b) return;
  const a = admins.find(x => x.id === b.dataset.adel); if (!a) return;
  if (admins.length <= 1) { toast("En az bir yönetici olmalı"); return; }
  if (!confirm(`"${a.email}" yöneticilikten kaldırılsın mı? Bu hesap artık hiçbir şeye erişemez.`)) return;
  DB.remove("accounts/" + a.id).then(() => { toast("Kaldırıldı"); loadAdmins(); }).catch(x => toast(authErr(x)));
});
$("#addAdmin").onclick = () => { $("#adEmail").value = ""; $("#adPass").value = ""; openM("#mAdmin"); };
$("#adCancel").onclick = () => closeM("#mAdmin");
$("#adSave").onclick = async () => {
  const email = $("#adEmail").value.trim(), pass = $("#adPass").value;
  if (!email || pass.length < 6) { toast("E-posta ve en az 6 karakterli şifre girin"); return; }
  $("#adSave").disabled = true;
  try {
    const uid = await DB.createAccount(email, pass);
    await DB.write("accounts/" + uid, { role: "owner", email, addedBy: S.user.email, at: Date.now() });
    closeM("#mAdmin"); toast("Yönetici eklendi: " + email); loadAdmins();
  } catch (x) { toast(authErr(x)); }
  $("#adSave").disabled = false;
};
$("#ownerSignOut").onclick = () => { if (confirm("Bu cihazdan çıkış yapılsın mı?")) DB.signOut(); };

/* ================= MAĞAZA CİHAZI ================= */
function startStore(sid) {
  S.mode = "store"; S.sid = sid;
  S.unsubs.push(DB.watch("stores/" + sid, d => { S.store = d; applyBrand(); refresh(); }));
  S.unsubs.push(DB.watch(`stores/${sid}/users`, l => { S.users = l; if (S.me) { const u = l.find(x => x.id === S.me.id); if (!u || u.active === false) showPin(); else S.me = u; } refresh(); }));
  $("#lockBtn").classList.remove("hidden");
  showPin();
}
/* ---------- PIN ---------- */
let selUser = null, pinBuf = "";
function padHTML() { return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map(k => `<button data-k="${k}">${k}</button>`).join(""); }
$("#loginPad").innerHTML = padHTML(); $("#apPad").innerHTML = padHTML();
const padKey = (k, b) => k === "C" ? "" : k === "⌫" ? b.slice(0, -1) : (b.length < 6 ? b + k : b);
function showPin() {
  S.me = null; selUser = null; pinBuf = ""; hideScreens(); show("#scrPin", true); renderPinUsers();
}
function renderPinUsers() {
  if (S.mode !== "store") return;
  $("#pinStore").textContent = S.store ? S.store.name : "";
  if (S.store && S.store.active === false) { $("#loginUsers").innerHTML = ""; $("#loginErr").textContent = "Bu mağaza pasif. Sahip ile görüşün."; return; }
  const us = S.users.filter(u => u.active !== false);
  if (us.length === 1 && !selUser) selUser = us[0];
  $("#loginUsers").innerHTML = us.map(u => `<button data-id="${u.id}" class="${selUser && selUser.id === u.id ? "on" : ""}">${esc(u.name)}<small>${ROLE[u.role]}</small></button>`).join("") || `<div class="muted">Personel yükleniyor…</div>`;
  $("#loginDots").textContent = "●".repeat(pinBuf.length);
  if (!$("#loginErr").dataset.keep) $("#loginErr").textContent = selUser ? "" : "Adınızı seçin";
}
$("#loginUsers").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; selUser = S.users.find(u => u.id === b.dataset.id); pinBuf = ""; renderPinUsers(); });
$("#loginPad").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (!selUser) { $("#loginErr").textContent = "Önce adınızı seçin"; return; }
  pinBuf = padKey(b.dataset.k, pinBuf); $("#loginDots").textContent = "●".repeat(pinBuf.length);
  if (pinBuf === selUser.pin) staffLogin(selUser);
  else if (pinBuf.length >= String(selUser.pin).length) { $("#loginErr").textContent = "Hatalı PIN"; pinBuf = ""; setTimeout(() => { $("#loginDots").textContent = ""; }, 600); }
});
function staffLogin(u) {
  S.me = u; hideScreens();
  $("#whoName").textContent = u.name; $("#whoRole").textContent = ROLE[u.role]; $("#whoRole").className = "role " + u.role;
  buildNav(); applyBrand(); go("register");
}
$("#lockBtn").onclick = () => { if (!cart.lines.length || confirm("Açık bir sipariş var. Yine de kilitlensin mi? (Sipariş sepette kalır)")) showPin(); };
/* Müdür onayı */
let apCb = null, apBuf = "";
function needManager(msg, cb) {
  if (isManager()) { cb(S.me || { name: "Sahip" }); return; }
  apCb = cb; apBuf = ""; $("#apMsg").textContent = msg; $("#apDots").textContent = ""; $("#apErr").textContent = ""; openM("#mApprove");
}
$("#apPad").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  apBuf = padKey(b.dataset.k, apBuf); $("#apDots").textContent = "●".repeat(apBuf.length);
  const a = S.users.find(u => u.active !== false && u.role === "manager" && u.pin === apBuf);
  if (a) { closeM("#mApprove"); const cb = apCb; apCb = null; cb(a); }
  else if (apBuf.length === 6) { $("#apErr").textContent = "Müdür PIN'i değil"; apBuf = ""; $("#apDots").textContent = ""; }
});
$("#apCancel").onclick = () => { apCb = null; closeM("#mApprove"); };

/* ---------- Kasa ---------- */
let cart = { lines: [], disc: null, note: "" }, curCat = "all";
const isCash = p => /^nakit$/i.test(String(p).trim());
const menuItems = () => S.items.filter(m => m.active !== false && !hiddenIn(m, S.store));
function visibleCats() { const its = menuItems(); return S.cats.filter(c => c.active !== false && its.some(m => m.catId === c.id)); }
function nextNo(peek) {
  const today = dayKey(Date.now()); let s = lsGet("seq:" + S.sid, { day: today, n: 0 });
  if (s.day !== today) s = { day: today, n: 0 };
  const n = s.n + 1; if (!peek) lsSet("seq:" + S.sid, { day: today, n });
  const code = lsGet("dev:" + S.sid, "");
  return (code ? code + "-" : "") + n;
}
function renderRegister() {
  const cs = visibleCats(); if (curCat !== "all" && !cs.some(c => c.id === curCat)) curCat = "all";
  $("#cats").innerHTML = `<button class="${curCat === "all" ? "on" : ""}" data-c="all">Tümü</button>` + cs.map(c => `<button class="${c.id === curCat ? "on" : ""}" data-c="${c.id}" style="--c:${esc(c.color)}">${esc(c.name)}</button>`).join("");
  const order = cs.map(c => c.id);
  const items = menuItems().filter(m => order.includes(m.catId) && (curCat === "all" || m.catId === curCat)).sort((a, b) => (order.indexOf(a.catId) - order.indexOf(b.catId)) || ((a.order ?? 0) - (b.order ?? 0)));
  $("#grid").innerHTML = items.map(m => { const p = priceFor(m, S.store); return m.img
    ? `<button class="item ph" style="--c:${esc(itemColor(m))}" data-id="${m.id}"><span class="img" style="background-image:url('${m.img}')"></span><span class="txt"><span class="n">${esc(m.name)}</span><span class="p">${money(p)}</span></span></button>`
    : `<button class="item" style="--c:${esc(itemColor(m))}" data-id="${m.id}"><span class="n">${esc(m.name)}</span><span class="p">${money(p)}</span></button>`; }).join("")
    || '<div class="empty">Menü yükleniyor… (ilk açılışta internet gerekir)</div>';
  $("#payBtns").innerHTML = (S.settings.pays || []).map((p, i) => `<button class="btn big ${isCash(p) ? "ok" : i === 1 ? "primary" : "brand"}" data-pay="${esc(p)}">${esc(p)}</button>`).join("");
  renderCart();
}
$("#cats").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { curCat = b.dataset.c; renderRegister(); } });
$("#grid").addEventListener("click", e => {
  const b = e.target.closest(".item"); if (!b) return;
  const m = S.items.find(x => x.id === b.dataset.id); if (!m) return;
  const l = cart.lines.find(x => x.id === m.id);
  if (l) l.qty++; else cart.lines.push({ id: m.id, name: m.name, catId: m.catId, cat: catName(m.catId), price: priceFor(m, S.store), qty: 1 });
  renderCart();
});
function calc(lines, disc, taxPct, incl) {
  const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let d = 0; if (disc) d = disc.type === "pct" ? Math.round(sub * Math.min(disc.val, 100) / 100) : Math.min(toCents(disc.val), sub);
  const after = sub - d;
  if (incl) { const tax = Math.round(after - after / (1 + taxPct / 100)); return { sub, disc: d, tax, total: after }; }
  const tax = Math.round(after * taxPct / 100); return { sub, disc: d, tax, total: after + tax };
}
const curCalc = () => calc(cart.lines, cart.disc, S.settings.tax, S.settings.taxIncl);
function renderCart() {
  $("#nextNo").textContent = nextNo(true);
  $("#lines").innerHTML = cart.lines.length ? cart.lines.map((l, i) => `
    <div class="line"><div><div class="nm">${esc(l.name)}</div><div class="muted">${money(l.price)} / adet</div></div><div class="amt">${money(l.price * l.qty)}</div>
    <div class="qty"><button data-i="${i}" data-d="-1">−</button><span>${l.qty}</span><button data-i="${i}" data-d="1">+</button></div><div></div></div>`).join("")
    + (cart.note ? `<div class="line"><div class="note">Not: ${esc(cart.note)}</div></div>` : "") : '<div class="empty">Eklemek için ürünlere dokunun</div>';
  const t = curCalc();
  $("#totals").innerHTML = `<div><span>Ara toplam</span><span>${money(t.sub)}</span></div>` +
    (t.disc ? `<div><span>İndirim${cart.disc.type === "pct" ? " (%" + cart.disc.val + ")" : ""}</span><span>-${money(t.disc)}</span></div>` : "") +
    `<div><span>KDV (%${S.settings.tax}${S.settings.taxIncl ? " dahil" : ""})</span><span>${money(t.tax)}</span></div><div class="grand"><span>Toplam</span><span>${money(t.total)}</span></div>`;
  $$("[data-pay]").forEach(b => b.disabled = !cart.lines.length);
}
$("#lines").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const i = +b.dataset.i, l = cart.lines[i]; l.qty += +b.dataset.d; if (l.qty <= 0) cart.lines.splice(i, 1); renderCart();
});
$("#clearCart").onclick = () => { if (!cart.lines.length || confirm("Bu sipariş temizlensin mi?")) { cart = { lines: [], disc: null, note: "" }; renderCart(); } };
$("#noteBtn").onclick = () => { const n = prompt("Sipariş notu (örn. masa no, isim, acısız):", cart.note); if (n !== null) { cart.note = n.trim(); renderCart(); } };
$("#discountBtn").onclick = () => {
  $("#discType").value = cart.disc ? cart.disc.type : "pct"; $("#discVal").value = cart.disc ? cart.disc.val : "";
  $("#discHint").textContent = isManager() || S.settings.maxDisc >= 100 ? "" : `%${S.settings.maxDisc} üzeri indirim için müdür PIN'i gerekir.`;
  openM("#mDisc");
};
$("#discCancel").onclick = () => closeM("#mDisc");
$("#discRemove").onclick = () => { cart.disc = null; closeM("#mDisc"); renderCart(); };
$("#discApply").onclick = () => {
  const v = num($("#discVal").value), d = v > 0 ? { type: $("#discType").value, val: v } : null;
  const apply = () => { cart.disc = d; closeM("#mDisc"); renderCart(); };
  if (!d) return apply();
  const sub = cart.lines.reduce((s, l) => s + l.price * l.qty, 0), pct = d.type === "pct" ? d.val : (sub ? toCents(d.val) / sub * 100 : 0);
  if (pct > S.settings.maxDisc && !isManager()) { closeM("#mDisc"); needManager(`%${pct.toFixed(0)} indirimi onaylayın`, apply); } else apply();
};
let payMethod = "", lastOrder = null;
$("#payBtns").addEventListener("click", e => {
  const b = e.target.closest("[data-pay]"); if (!b || !cart.lines.length) return;
  payMethod = b.dataset.pay; const t = curCalc();
  $("#payTitle").textContent = payMethod + " ile ödeme"; $("#payDue").textContent = "Toplam " + money(t.total);
  show("#cashArea", isCash(payMethod)); $("#cashIn").value = ""; $("#changeOut").textContent = "";
  const due = t.total / 100, opts = [due, Math.ceil(due / 50) * 50, Math.ceil(due / 100) * 100, Math.ceil(due / 200) * 200];
  $("#quickCash").innerHTML = [...new Set(opts.map(v => v.toFixed(2)))].map(v => `<button class="btn" data-v="${v}">${money(Math.round(v * 100))}</button>`).join("");
  openM("#mPay");
});
$("#quickCash").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { $("#cashIn").value = b.dataset.v.replace(".", ","); updChange(); } });
$("#cashIn").addEventListener("input", updChange);
function updChange() {
  const t = curCalc(), inC = toCents($("#cashIn").value);
  $("#changeOut").textContent = $("#cashIn").value === "" ? "" : (inC >= t.total ? "Para üstü: " + money(inC - t.total) : "Eksik: " + money(t.total - inC));
}
$("#payCancel").onclick = () => closeM("#mPay");
/* Günlük özet (rapor) için artış/azalış */
function aggDelta(o, sign) {
  const sg = x => INC(sign * x);
  const items = {}, cats = {};
  o.lines.forEach(l => {
    const ik = key(l.id), ck = key(l.cat);
    items[ik] = items[ik] || { name: l.name, cat: l.cat, qty: 0, amt: 0 }; items[ik].qty += l.qty; items[ik].amt += l.price * l.qty;
    cats[ck] = cats[ck] || { name: l.cat, qty: 0, amt: 0 }; cats[ck].qty += l.qty; cats[ck].amt += l.price * l.qty;
  });
  const qty = o.lines.reduce((s, l) => s + l.qty, 0), h = pad(new Date(o.at).getHours());
  const d = {
    day: o.day, storeId: o.storeId, updatedAt: Date.now(),
    tot: { n: sg(1), total: sg(o.total), sub: sg(o.sub), disc: sg(o.disc), tax: sg(o.tax), items: sg(qty) },
    pay: { [key(o.method)]: { name: o.method, n: sg(1), amt: sg(o.total) } },
    users: { [key(o.user)]: { name: o.user || "-", n: sg(1), amt: sg(o.total) } },
    items: {}, cats: {}, hours: { [h]: sg(o.total) }
  };
  for (const k in items) d.items[k] = { name: items[k].name, cat: items[k].cat, qty: sg(items[k].qty), amt: sg(items[k].amt) };
  for (const k in cats) d.cats[k] = { name: cats[k].name, qty: sg(cats[k].qty), amt: sg(cats[k].amt) };
  if (sign < 0) d.voids = { n: INC(1), amt: INC(o.total) };
  return d;
}
$("#payConfirm").onclick = () => {
  if (S.store && S.store.active === false) { toast("Bu mağaza pasif"); return; }
  const t = curCalc(); let tendered = t.total;
  if (isCash(payMethod) && $("#cashIn").value !== "") { tendered = toCents($("#cashIn").value); if (tendered < t.total) { toast("Alınan nakit toplamdan az"); return; } }
  const now = Date.now(), id = DB.newId();
  const o = {
    id, no: nextNo(false), at: now, day: dayKey(now), storeId: S.sid, user: S.me ? S.me.name : "", lines: cart.lines.map(l => ({ ...l })), discInfo: cart.disc || null, note: cart.note,
    sub: t.sub, disc: t.disc, taxRate: S.settings.tax, taxIncl: !!S.settings.taxIncl, tax: t.tax, total: t.total, method: payMethod, tendered, change: tendered - t.total, void: false
  };
  dbSet(`stores/${S.sid}/orders/${id}`, stripId(o));
  dbSet(`stores/${S.sid}/days/${o.day}`, aggDelta(o, 1), true);
  closeM("#mPay");
  $("#doneInfo").textContent = `Sipariş No ${o.no} · ${o.method} · ${money(o.total)}`;
  $("#doneChange").textContent = o.change > 0 ? "Para üstü: " + money(o.change) : "";
  lastOrder = o; openM("#mDone"); cart = { lines: [], disc: null, note: "" }; renderCart();
};
$("#doneNew").onclick = () => closeM("#mDone");
$("#donePrint").onclick = () => lastOrder && printHTML(receiptHTML(lastOrder));
function receiptHTML(o) {
  const r = (a, b) => `<tr><td>${a}</td><td style="text-align:right">${b}</td></tr>`;
  return `<div style="max-width:300px"><div style="text-align:center"><img src="${logo()}" style="width:150px"></div>
  <div style="text-align:center;font-weight:bold;font-size:15px">${esc(S.settings.name)}</div>
  <div style="text-align:center">${esc(storeName(o.storeId))}<br>${fullDate(o.at)}<br>Sipariş No ${esc(o.no)}${o.user ? " · " + esc(o.user) : ""}${o.void ? " — İPTAL" : ""}</div><hr>
  <table style="width:100%">${o.lines.map(l => r(l.qty + " x " + esc(l.name), money(l.price * l.qty))).join("")}</table><hr>
  <table style="width:100%">${r("Ara toplam", money(o.sub))}${o.disc ? r("İndirim", "-" + money(o.disc)) : ""}
  ${r("KDV (%" + o.taxRate + (o.taxIncl ? " dahil" : "") + ")", money(o.tax))}${r("<b>TOPLAM</b>", "<b>" + money(o.total) + "</b>")}
  ${r(esc(o.method), money(o.tendered))}${o.change ? r("Para üstü", money(o.change)) : ""}</table>
  ${o.note ? `<div>Not: ${esc(o.note)}</div>` : ""}<hr><div style="text-align:center">${esc(S.settings.footer)}</div>
  <div style="text-align:center;font-size:10px">Bilgi fişidir, mali değeri yoktur.</div></div>`;
}

/* ---------- Siparişler ---------- */
$("#ordersDate").value = dayKey(Date.now());
$("#ordersDate").onchange = () => renderOrders(true);
$("#ordStore").onchange = () => renderOrders(true);
let ordWatch = { k: null, unsub: null, list: [] };
function ordSid() { if (S.mode === "store") return S.sid; storeOptions("#ordStore", false); return $("#ordStore").value; }
function renderOrders() {
  const sid = ordSid(), day = $("#ordersDate").value, k = sid + "|" + day;
  if (!sid) { $("#ordersTable").innerHTML = '<tr><td class="muted">Mağaza yok.</td></tr>'; return; }
  if (ordWatch.k !== k) {
    if (ordWatch.unsub) ordWatch.unsub();
    ordWatch = { k, list: [], unsub: DB.watch(`stores/${sid}/orders`, l => { ordWatch.list = l; drawOrders(); }, [["day", "==", day]]) };
  }
  drawOrders();
}
function drawOrders() {
  const list = ordWatch.list.slice().sort((a, b) => b.at - a.at);
  $("#ordersCount").textContent = list.length + " sipariş";
  $("#ordersTable").innerHTML = `<tr><th>No</th><th>Saat</th><th>Kasiyer</th><th class="r">Adet</th><th>Ödeme</th><th class="r">Toplam</th><th></th></tr>` +
    (list.map(o => `<tr data-oid="${o.id}" style="cursor:pointer"><td>${esc(o.no)}</td><td>${timeStr(o.at)}</td><td>${esc(o.user || "")}</td>
    <td class="r">${o.lines.reduce((s, l) => s + l.qty, 0)}</td><td>${esc(o.method)}</td><td class="r">${money(o.total)}</td>
    <td>${o.void ? '<span class="tag void">İPTAL</span>' : ""}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">Bu tarihte sipariş yok.</td></tr>');
}
let openOrder = null;
$("#ordersTable").addEventListener("click", e => {
  const r = e.target.closest("tr[data-oid]"); if (!r) return;
  openOrder = ordWatch.list.find(o => o.id === r.dataset.oid); if (!openOrder) return;
  $("#ordTitle").textContent = "Sipariş No " + openOrder.no + (openOrder.void ? " (İPTAL)" : "");
  $("#ordBody").innerHTML = receiptHTML(openOrder) + (openOrder.void ? `<p class="muted">İptal eden ${esc(openOrder.voidBy || "")}: ${esc(openOrder.voidReason || "")}</p>` : "");
  show("#ordVoid", !openOrder.void); openM("#mOrder");
});
$("#ordClose").onclick = () => closeM("#mOrder");
$("#ordPrint").onclick = () => openOrder && printHTML(receiptHTML(openOrder));
$("#ordVoid").onclick = () => {
  if (!openOrder) return; const o = openOrder, sid = o.storeId || ordSid();
  const doVoid = who => {
    const r = prompt(o.no + " numaralı siparişin iptal nedeni:"); if (r === null) return;
    dbSet(`stores/${sid}/orders/${o.id}`, { void: true, voidReason: r || "(neden yok)", voidAt: Date.now(), voidBy: who.name }, true);
    dbSet(`stores/${sid}/days/${o.day}`, aggDelta({ ...o, storeId: sid }, -1), true);
    toast("Sipariş iptal edildi");
  };
  closeM("#mOrder");
  if (S.mode === "owner") doVoid({ name: "Sahip" });
  else if (S.settings.cashVoid) doVoid(S.me); else needManager(o.no + " numaralı siparişin iptalini onaylayın", doVoid);
};

/* ---------- Rapor ---------- */
function setRange(a, b) { $("#repFrom").value = dayKey(a); $("#repTo").value = dayKey(b); renderReport(); }
$("#repToday").onclick = () => setRange(Date.now(), Date.now());
$("#repWeek").onclick = () => setRange(Date.now() - 6 * 864e5, Date.now());
$("#repMonth").onclick = () => { const d = new Date(); setRange(new Date(d.getFullYear(), d.getMonth(), 1), d); };
$("#repFrom").onchange = $("#repTo").onchange = $("#repStore").onchange = () => renderReport();
$("#repFrom").value = $("#repTo").value = dayKey(Date.now());
function repSids() {
  if (S.mode === "store") return [S.sid];
  storeOptions("#repStore", true); const v = $("#repStore").value;
  return v === "all" ? S.stores.map(s => s.id) : [v];
}
function addInto(a, b) {
  for (const k in b) {
    const v = b[k];
    if (typeof v === "number") a[k] = (a[k] || 0) + v;
    else if (v && typeof v === "object") { a[k] = a[k] || {}; addInto(a[k], v); }
    else if (a[k] === undefined) a[k] = v;
  }
  return a;
}
let repSeq = 0, lastReport = null;
async function renderReport() {
  const sids = repSids(), f = $("#repFrom").value, t = $("#repTo").value, my = ++repSeq;
  $("#reportBody").innerHTML = '<div class="card muted">Yükleniyor…</div>';
  try {
    const per = await Promise.all(sids.map(sid => DB.query(`stores/${sid}/days`, [["day", ">=", f], ["day", "<=", t]]).then(days => ({ sid, days }))));
    if (my !== repSeq) return;
    const R = {}, byStore = [], byDay = {};
    per.forEach(({ sid, days }) => {
      const s = {}; days.forEach(d => { addInto(s, d); const t2 = (d.tot || {}); byDay[d.day] = byDay[d.day] || { n: 0, amt: 0 }; byDay[d.day].n += t2.n || 0; byDay[d.day].amt += t2.total || 0; });
      addInto(R, s); byStore.push({ sid, name: storeName(sid), tot: s.tot || {} });
    });
    delete R.day; delete R.storeId; delete R.updatedAt;
    lastReport = { R, byStore, byDay, f, t, sids };
    drawReport();
  } catch (e) { console.error(e); $("#reportBody").innerHTML = '<div class="card">Rapor yüklenemedi. İnternet bağlantısını kontrol edin.</div>'; }
}
const rangeTitle = (f, t) => f === t ? dayTR(f) : dayTR(f) + " – " + dayTR(t);
function drawReport() {
  const { R, byStore, byDay, f, t, sids } = lastReport, T = R.tot || {}, V = R.voids || {};
  const none = n => `<tr><td colspan="${n}" class="muted">Satış yok</td></tr>`;
  const ents = o => Object.values(o || {}).filter(x => (x.n || x.qty || x.amt));
  const items = ents(R.items).sort((a, b) => b.amt - a.amt), maxI = items.length ? items[0].amt : 1;
  const cats = ents(R.cats).sort((a, b) => b.amt - a.amt);
  const hours = Object.keys(R.hours || {}).filter(h => R.hours[h]).sort(), maxH = Math.max(1, ...hours.map(h => R.hours[h]));
  const tbl = (arr, h) => `<table><tr><th>${h}</th><th class="r">Sipariş</th><th class="r">Tutar</th></tr>${arr.map(x => `<tr><td>${esc(x.name)}</td><td class="r">${x.n}</td><td class="r">${money(x.amt)}</td></tr>`).join("") || none(3)}</table>`;
  const net = (T.total || 0) - (T.tax || 0);
  $("#reportBody").innerHTML = `
  <div class="card"><h2>Özet · ${rangeTitle(f, t)}${sids.length > 1 ? " · Tüm mağazalar" : " · " + esc(storeName(sids[0]))}</h2><div class="kpis">
    <div class="kpi"><div class="l">Toplam tahsilat</div><div class="v">${money(T.total)}</div></div>
    <div class="kpi"><div class="l">Net satış (KDV hariç)</div><div class="v">${money(net)}</div></div>
    <div class="kpi"><div class="l">KDV</div><div class="v">${money(T.tax)}</div></div>
    <div class="kpi"><div class="l">İndirimler</div><div class="v">${money(T.disc)}</div></div>
    <div class="kpi"><div class="l">Sipariş sayısı</div><div class="v">${T.n || 0}</div></div>
    <div class="kpi"><div class="l">Ortalama sipariş</div><div class="v">${money(T.n ? Math.round(T.total / T.n) : 0)}</div></div>
    <div class="kpi"><div class="l">Satılan ürün adedi</div><div class="v">${T.items || 0}</div></div>
    <div class="kpi"><div class="l">İptal edilen</div><div class="v">${V.n || 0} <span class="muted" style="font-size:14px">${money(V.amt)}</span></div></div>
  </div></div>
  ${sids.length > 1 ? `<div class="card"><h2>Mağazalara göre</h2><table><tr><th>Mağaza</th><th class="r">Sipariş</th><th class="r">Ortalama</th><th class="r">Toplam</th></tr>
    ${byStore.sort((a, b) => (b.tot.total || 0) - (a.tot.total || 0)).map(s => `<tr><td><b>${esc(s.name)}</b></td><td class="r">${s.tot.n || 0}</td><td class="r">${money(s.tot.n ? Math.round(s.tot.total / s.tot.n) : 0)}</td><td class="r">${money(s.tot.total || 0)}</td></tr>`).join("")}</table></div>` : ""}
  <div class="two"><div class="card"><h2>Ödeme yöntemine göre</h2>${tbl(ents(R.pay), "Yöntem")}</div><div class="card"><h2>Kasiyere göre</h2>${tbl(ents(R.users), "Kasiyer")}</div></div>
  <div class="card"><h2>Kategoriye göre</h2><table><tr><th>Kategori</th><th class="r">Adet</th><th class="r">Satış</th></tr>${cats.map(c => `<tr><td>${esc(c.name)}</td><td class="r">${c.qty}</td><td class="r">${money(c.amt)}</td></tr>`).join("") || none(3)}</table></div>
  <div class="card"><h2>Ürün bazında satış</h2><table><tr><th>Ürün</th><th>Kategori</th><th class="r">Adet</th><th class="r">Satış</th><th style="width:28%"></th></tr>
    ${items.map(v => `<tr><td>${esc(v.name)}</td><td class="muted">${esc(v.cat)}</td><td class="r">${v.qty}</td><td class="r">${money(v.amt)}</td><td><div class="bar" style="width:${Math.max(2, v.amt / maxI * 100)}%"></div></td></tr>`).join("") || none(5)}</table></div>
  <div class="two"><div class="card"><h2>Saatlere göre</h2><table>${hours.map(h => `<tr><td style="width:70px">${h}:00</td><td><div class="bar" style="width:${Math.max(2, R.hours[h] / maxH * 100)}%"></div></td><td class="r" style="width:110px">${money(R.hours[h])}</td></tr>`).join("") || none(3)}</table></div>
  <div class="card"><h2>Günlere göre</h2><table><tr><th>Tarih</th><th class="r">Sipariş</th><th class="r">Tutar</th></tr>${Object.keys(byDay).sort().map(d => `<tr><td>${dayTR(d)}</td><td class="r">${byDay[d].n}</td><td class="r">${money(byDay[d].amt)}</td></tr>`).join("") || none(3)}</table></div></div>`;
}
$("#repPrint").onclick = () => {
  if (!lastReport) return; const { R, byStore, f, t, sids } = lastReport, T = R.tot || {}, V = R.voids || {};
  const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right">${b}</td></tr>`, vals = o => Object.values(o || {}).filter(x => x.n || x.qty);
  printHTML(`<div style="max-width:320px"><div style="text-align:center"><img src="${logo()}" style="width:150px"></div>
  <div style="text-align:center;font-weight:bold;font-size:15px">${esc(S.settings.name)}</div>
  <div style="text-align:center">${sids.length > 1 ? "TÜM MAĞAZALAR" : esc(storeName(sids[0]))}<br>GÜN SONU / SATIŞ RAPORU<br>${rangeTitle(f, t)}<br>Yazdırma: ${fullDate(Date.now())}</div><hr>
  <table style="width:100%">${row("Sipariş sayısı", T.n || 0)}${row("Satılan ürün", T.items || 0)}${row("Brüt satış", money(T.sub))}${row("İndirimler", "-" + money(T.disc))}
  ${row("Net satış (KDV hariç)", money((T.total || 0) - (T.tax || 0)))}${row("KDV", money(T.tax))}${row("<b>TOPLAM TAHSİLAT</b>", "<b>" + money(T.total) + "</b>")}
  ${row("İptaller", (V.n || 0) + " / " + money(V.amt))}</table>
  ${sids.length > 1 ? `<hr><b>Mağazalar</b><table style="width:100%">${byStore.map(s => row(esc(s.name) + " (" + (s.tot.n || 0) + ")", money(s.tot.total || 0))).join("")}</table>` : ""}
  <hr><b>Ödemeler</b><table style="width:100%">${vals(R.pay).map(v => row(esc(v.name) + " (" + v.n + ")", money(v.amt))).join("")}</table>
  <hr><b>Kasiyerler</b><table style="width:100%">${vals(R.users).map(v => row(esc(v.name) + " (" + v.n + ")", money(v.amt))).join("")}</table>
  <hr><b>Ürünler</b><table style="width:100%">${vals(R.items).sort((a, b) => b.amt - a.amt).map(v => row(v.qty + " x " + esc(v.name), money(v.amt))).join("")}</table><hr></div>`);
};
$("#repCsv").onclick = async () => {
  if (!lastReport) return; const { f, t, sids } = lastReport;
  toast("Hazırlanıyor…");
  try {
    const q = s => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"', c = v => ((v || 0) / 100).toFixed(2).replace(".", ",");
    const rows = [["Mağaza", "Sipariş No", "Tarih", "Saat", "Kasiyer", "Durum", "Ödeme", "Ürün", "Kategori", "Adet", "Birim fiyat", "Satır toplam", "Sipariş ara toplam", "Sipariş indirim", "Sipariş KDV", "Sipariş toplam", "Not"]];
    for (const sid of sids) {
      const orders = (await DB.query(`stores/${sid}/orders`, [["day", ">=", f], ["day", "<=", t]])).sort((a, b) => a.at - b.at);
      orders.forEach(o => o.lines.forEach((l, i) => rows.push([storeName(sid), o.no, dayTR(o.day), timeStr(o.at), o.user || "", o.void ? "İPTAL" : "ÖDENDİ", o.method, l.name, l.cat, l.qty, c(l.price), c(l.price * l.qty),
        i ? "" : c(o.sub), i ? "" : c(o.disc), i ? "" : c(o.tax), i ? "" : c(o.total), i ? "" : o.note || ""])));
    }
    download(`satis_${f}_${t}.csv`, "\ufeff" + rows.map(r => r.map(q).join(";")).join("\r\n"), "text/csv");
  } catch (e) { console.error(e); toast("Dışa aktarılamadı (internet gerekli)"); }
};

/* ---------- Personel ---------- */
let editUsr = null, usrSid = null, usrList = [];
function usersTable(list) {
  return `<table><tr><th>Ad</th><th>Yetki</th><th>PIN</th><th>Durum</th><th></th></tr>` +
    list.map(u => `<tr><td><b>${esc(u.name)}</b>${S.me && u.id === S.me.id ? ' <span class="muted">(siz)</span>' : ""}</td><td><span class="role ${u.role}">${ROLE[u.role]}</span></td>
    <td>${"•".repeat(String(u.pin).length)}</td><td>${u.active !== false ? "Aktif" : '<span class="muted">Pasif</span>'}</td><td class="act"><button class="btn sm" data-uedit="${u.id}">Düzenle</button></td></tr>`).join("") + `</table>`;
}
function renderStaff() {
  $("#userTable").outerHTML = `<div id="userTable">${usersTable(S.users)}</div>`;
  $$("#userTable [data-uedit]").forEach(b => b.onclick = () => openUser(S.users.find(u => u.id === b.dataset.uedit), S.sid, S.users));
}
$("#addUser").onclick = () => openUser(null, S.sid, S.users);
function openUser(u, sid, list) {
  editUsr = u || null; usrSid = sid; usrList = list; $("#userTitle").textContent = u ? "Personeli düzenle" : "Yeni personel";
  $("#usName").value = u ? u.name : ""; $("#usRole").value = u ? u.role : "cashier"; $("#usPin").value = "";
  $("#usPinHint").textContent = u ? "Mevcut PIN'i korumak için boş bırakın." : "";
  $("#usActive").checked = u ? u.active !== false : true; show("#usDelete", !!u && !(S.me && u.id === S.me.id)); openM("#mUser");
}
const activeMgrs = l => l.filter(u => u.role === "manager" && u.active !== false);
$("#usCancel").onclick = () => closeM("#mUser");
$("#usSave").onclick = () => {
  const name = $("#usName").value.trim(), pin = $("#usPin").value.trim(), role = $("#usRole").value, active = $("#usActive").checked;
  if (!name) { toast("Ad girin"); return; }
  if ((!editUsr || pin) && !/^\d{4,6}$/.test(pin)) { toast("PIN 4–6 rakam olmalı"); return; }
  const newPin = pin || editUsr.pin;
  if (usrList.some(u => u !== editUsr && u.pin === newPin)) { toast("Bu PIN başka bir personelde var"); return; }
  if (editUsr && S.me && editUsr.id === S.me.id && (role !== "manager" || !active)) { toast("Kendi müdür yetkinizi kaldıramazsınız"); return; }
  if (editUsr && editUsr.role === "manager" && editUsr.active !== false && (role !== "manager" || !active) && activeMgrs(usrList).length === 1) { toast("Mağazada en az bir aktif müdür olmalı"); return; }
  dbSet(`stores/${usrSid}/users/${editUsr ? editUsr.id : DB.newId()}`, { name, role, pin: newPin, active }, true);
  closeM("#mUser"); toast("Kaydedildi");
};
$("#usDelete").onclick = () => {
  if (!editUsr) return;
  if (editUsr.role === "manager" && editUsr.active !== false && activeMgrs(usrList).length === 1) { toast("Mağazada en az bir aktif müdür olmalı"); return; }
  if (confirm(`"${editUsr.name}" silinsin mi? Geçmiş satışları raporlarda kalır.`)) { dbDel(`stores/${usrSid}/users/${editUsr.id}`); closeM("#mUser"); }
};

/* ---------- Cihaz ---------- */
function renderDevice() {
  $("#devInfo").textContent = `Mağaza: ${S.store ? S.store.name : ""} · Hesap: ${S.user ? S.user.email : ""}`;
  $("#devCode").value = lsGet("dev:" + S.sid, "");
}
$("#devSave").onclick = () => { lsSet("dev:" + S.sid, $("#devCode").value.trim().toUpperCase()); toast("Kaydedildi"); renderCart(); };
$("#devSignOut").onclick = () => {
  if (pending > 0 && !confirm(`${pending} kayıt henüz gönderilmedi! Çıkış yaparsanız kaybolabilir. Yine de çıkılsın mı?`)) return;
  if (confirm("Bu cihazın mağaza oturumu kapatılsın mı? Tekrar kullanmak için mağaza e-postası ve şifresi gerekir.")) DB.signOut();
};

/* ================= iPad / ana ekran ================= */
const standalone = window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if (isIOS && !standalone && location.protocol === "https:") show("#installHint", true);
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
$$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m && !["mDone", "mApprove"].includes(m.id)) m.classList.remove("on"); }));
window.addEventListener("beforeunload", e => { if (pending > 0 && !navigator.onLine) { e.preventDefault(); e.returnValue = ""; } });
boot();
