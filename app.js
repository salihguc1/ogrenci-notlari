(function () {
  'use strict';
  const VERSION = '1.13';
  const KEY = 'notdefteri.v1';
  const app = document.getElementById('app');
  let EMBED = false; try { EMBED = window.self !== window.top; } catch (e) { EMBED = true; }

  // ---------- veri ----------
  function fresh() { return { v: 1, theme: 'auto', teacher: '', principal: '', pinHash: null, onboarded: false, term: 1, defaultPenalty: 10, school: '', lesson: '', classes: [] }; }
  let loadWarning = '';
  function load() {
    let s = null;
    try { s = localStorage.getItem(KEY); } catch (e) { return fresh(); }
    if (!s) return fresh();
    try { return Object.assign(fresh(), JSON.parse(s)); }
    catch (e) { // bozuk kayıt: üzerine yazmadan önce kopyasını sakla
      try { localStorage.setItem(KEY + '.bozuk.' + Date.now(), s); } catch (e2) { }
      loadWarning = 'Kayıtlı veriler okunamadı. Bir kopyası saklandı. Son yedeğinizi Ayarlar > Yedekten geri yükle ile yükleyin.';
      return fresh();
    }
  }
  let db = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); saveBanner(false); }
    catch (e) { saveBanner(true); }
  }
  function applyTheme() {
    const t = db.theme === 'dark' || db.theme === 'light' ? db.theme : '';
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const dark = t ? t === 'dark' : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const m = document.getElementById('tc'); if (m) m.setAttribute('content', dark ? '#000000' : '#f2f2f7');
  }
  applyTheme();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { }
  function saveBanner(on) {
    let b = document.getElementById('savewarn');
    if (!on) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('div'); b.id = 'savewarn'; b.className = 'savewarn';
    b.textContent = EMBED ? 'Önizleme: notlar bu cihaza kalıcı kaydedilmiyor.' : 'Dikkat: notlar kaydedilemiyor. Telefonda yer kalmamış olabilir. Hemen Ayarlar > Yedek al yapın.';
    document.body.appendChild(b);
  }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cls = id => db.classes.find(c => c.id === id);
  function getA(c, key, create) {
    const t = (c.terms = c.terms || {});
    const tt = t[db.term] || (create ? (t[db.term] = {}) : null);
    if (!tt) return null;
    if (!tt[key] && create) tt[key] = { title: '', penalty: db.defaultPenalty, e: {} };
    return tt[key] || null;
  }
  function finalOf(en) {
    if (!en) return null;
    if (en.a) return 'G';
    if (en.r == null) return null;
    return en.l ? Math.max(0, en.r - (en.p || 0)) : en.r;
  }
  // ---- sınıfın not sütunları (öğretmen kendisi ekler, dönem başına ayrı) ----
  const isProje = k => k.startsWith('PROJE');
  const keyNum = k => +(k.replace(/\D/g, '')) || 1;
  function itemsOf(c) {
    c.items = c.items || {};
    let l = c.items[db.term];
    if (!l) { // eski sürümden gelen notları koru
      l = []; const tt = (c.terms || {})[db.term] || {};
      for (const k of ['P1', 'P2', 'P3', 'PROJE']) if (tt[k] && (Object.keys(tt[k].e || {}).length || tt[k].title)) l.push(k);
      c.items[db.term] = l;
    }
    return l;
  }
  const sortedItems = c => itemsOf(c).slice().sort((a, b) => (isProje(a) - isProje(b)) || keyNum(a) - keyNum(b));
  const defLabel = k => isProje(k) ? 'Proje' + (keyNum(k) > 1 ? ' ' + keyNum(k) : '') : 'Performans ' + keyNum(k);
  const itemLabel = (c, k) => { const a = getA(c, k, false); return a && a.title ? a.title : defLabel(k); };
  function addItem(c, type, title) {
    const l = itemsOf(c); let n = 1, k;
    do { k = type === 'J' ? (n === 1 ? 'PROJE' : 'PROJE' + n) : 'P' + n; n++; } while (l.includes(k));
    l.push(k);
    const tt = ((c.terms = c.terms || {})[db.term] = (c.terms[db.term] || {}));
    tt[k] = { title: title || '', penalty: db.defaultPenalty, e: {} };
    return k;
  }
  function removeItem(c, k) {
    const l = itemsOf(c); const i = l.indexOf(k); if (i >= 0) l.splice(i, 1);
    if (c.terms && c.terms[db.term]) delete c.terms[db.term][k];
  }

  function progress(c, key) {
    const a = getA(c, key, false); let done = 0, sum = 0, cnt = 0;
    if (a) for (const s of c.students) { const f = finalOf(a.e[s.no]); if (f != null) { done++; if (typeof f === 'number') { sum += f; cnt++; } } }
    return { done, total: c.students.length, avg: cnt ? Math.round(sum / cnt) : null };
  }

  // ---------- yardımcılar ----------
  let toastT;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 2600);
  }
  const trAscii = s => String(s).replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => ({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' }[ch])).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const shortName = n => { const p = n.split(' '); return p.length > 1 ? p.slice(0, -1).join(' ') + ' ' + p[p.length - 1][0] + '.' : n; };

  let dlNs; // Claude içindeki önizlemede dosya kaydetme
  try { if (window.claude && window.claude.use) dlNs = window.claude.use('downloads'); } catch (e) { }
  async function shareFile(blob, filename) {
    if (dlNs) {
      let ns = null; try { ns = await dlNs; } catch (e) { }
      if (ns) {
        try { await ns.save({ filename, data: blob }); }
        catch (e) { if (!e || e.code !== 'declined') toast('Dosya kaydedilemedi.'); }
        return;
      }
    }
    let file = null;
    try { file = new File([blob], filename, { type: blob.type }); } catch (e) { }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }
  function pickFile(cb) {
    const inp = document.createElement('input'); inp.type = 'file';
    inp.style.display = 'none'; document.body.appendChild(inp);
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) cb(f); };
    inp.click();
  }

  async function hashPin(pin) {
    const s = 'notdefteri:' + pin;
    if (window.crypto && crypto.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return 'sha:' + Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
    }
    let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return 'fnv:' + h.toString(16);
  }

  // ---------- gezinme ----------
  let view = { name: 'home' };
  let stack = [];
  function go(v) { stack.push(view); view = v; render(); window.scrollTo(0, 0); }
  function back() { view = stack.pop() || { name: 'home' }; render(); }
  function home() { stack = []; view = { name: 'home' }; render(); }

  function render() {
    closeSheet(); document.onkeydown = null;
    const fn = VIEWS[view.name] || VIEWS.home;
    fn();
  }

  // ---------- alt sayfa (sheet) ----------
  function openSheet(html, onClick) {
    closeSheet();
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet">${html}</div>`;
    const opened = Date.now();
    bg.addEventListener('click', e => {
      if (e.target === bg) { if (Date.now() - opened > 400) closeSheet(); return; }
      const b = e.target.closest('[data-v]'); if (b) onClick(b.dataset.v);
    });
    document.body.appendChild(bg);
  }
  function dialog(html, onMount) {
    return new Promise(res => {
      closeSheet();
      const bg = document.createElement('div'); bg.className = 'sheet-bg';
      bg.innerHTML = `<div class="sheet">${html}</div>`;
      document.body.appendChild(bg);
      const done = v => { bg.remove(); res(v); };
      const opened = Date.now();
      bg.addEventListener('click', e => {
        if (e.target === bg) { if (Date.now() - opened > 400) done(null); return; }
        const b = e.target.closest('[data-r]'); if (!b) return;
        const r = b.dataset.r;
        done(r === 'val' ? bg.querySelector('input').value : r === 'yes' ? true : r === 'no' ? false : null);
      });
      if (onMount) onMount(bg, done);
    });
  }
  function ask(msg, ok, danger) {
    return dialog(`<div style="font-size:16px;margin:2px 0 6px;white-space:pre-line">${esc(msg)}</div>
      <button class="btn ${danger ? 'red' : ''}" data-r="yes">${esc(ok || 'Evet')}</button><button class="btn sec2" data-r="no">Vazgeç</button>`).then(v => v === true);
  }
  function askText(title, val, numeric) {
    return dialog(`<h3>${esc(title)}</h3><div class="card" style="margin-top:10px"><label class="field"><input id="dlg-in" value="${esc(val == null ? '' : val)}" ${numeric ? 'inputmode="numeric" pattern="[0-9]*"' : ''} autocomplete="off"></label></div>
      <button class="btn" data-r="val">Tamam</button><button class="btn sec2" data-r="cancel">Vazgeç</button>`, (bg, done) => {
      const i = bg.querySelector('input'); i.focus(); try { i.select(); } catch (e) { }
      i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(i.value); } });
    });
  }
  function closeSheet() { const s = document.querySelector('.sheet-bg'); if (s) s.remove(); }
  function penaltySheet(title, sub, current, allowRemove, cb) {
    const opts = [5, 10, 15, 20, 25, 30].map(n => `<button data-v="${n}" class="${current === n ? 'on' : ''}">−${n}</button>`).join('');
    openSheet(`<h3>${esc(title)}</h3><div class="sub">${esc(sub)}</div><div class="opts">${opts}</div>
      <button class="btn sec2" data-v="custom">Başka bir değer</button>
      ${allowRemove ? '<button class="btn danger" data-v="remove">Geç teslim değil</button>' : ''}
      <button class="btn sec2" data-v="cancel">Vazgeç</button>`, v => {
      if (v === 'cancel') return closeSheet();
      if (v === 'remove') { closeSheet(); return cb('remove'); }
      if (v === 'custom') {
        askText('Kaç puan kırılsın?', current || '', true).then(x => {
          if (x === null) return;
          const n = parseInt(x, 10);
          if (isNaN(n) || n < 0 || n > 100) return toast('0 ile 100 arasında bir sayı yazın.');
          cb(n);
        });
        return;
      }
      closeSheet(); cb(+v);
    });
  }

  // ---------- PIN ----------
  let pinBuf = '', pinFirst = '';
  function pinView(title, sub, opts) {
    const dots = [0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'f' : ''}"></i>`).join('');
    app.innerHTML = `<div class="lock pinlock">
      <img class="logo" src="icon-180.png" alt="">
      <div style="text-align:center"><div style="font-size:20px;font-weight:600">${esc(title)}</div><div class="sub" style="margin-top:4px">${esc(sub || '')}</div></div>
      <div class="dots" id="dots">${dots}</div>
      <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
        <button class="t" data-k="left">${esc(opts.left || '')}</button><button data-k="0">0</button><button class="t" data-k="del">Sil</button></div>
    </div>`;
    app.querySelector('.pinpad').onclick = e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'del') { pinBuf = pinBuf.slice(0, -1); }
      else if (k === 'left') { if (opts.onLeft) opts.onLeft(); return; }
      else if (pinBuf.length < 4) { pinBuf += k; }
      document.getElementById('dots').innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'f' : ''}"></i>`).join('');
      if (pinBuf.length === 4) { const p = pinBuf; setTimeout(() => opts.onDone(p), 120); }
    };
  }
  function pinWrong() {
    pinBuf = ''; const d = document.getElementById('dots');
    if (d) { d.innerHTML = '<i></i><i></i><i></i><i></i>'; d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); }
    if (navigator.vibrate) navigator.vibrate(150);
  }

  let locked = false, resumeView = null, hiddenAt = 0;
  function lock() {
    if (!db.pinHash || locked) return;
    document.querySelectorAll('.sheet-bg').forEach(x => x.remove());
    const tt = document.querySelector('.toast'); if (tt) tt.style.display = 'none';
    document.onkeydown = null; app.oninput = null;
    locked = true; resumeView = view; pinBuf = '';
    VIEWS.lock();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (db.pinHash && hiddenAt && Date.now() - hiddenAt > 60000) lock();
  });

  // ---------- ekranlar ----------
  const VIEWS = {};

  VIEWS.lock = function () {
    pinView('Not Defteri', 'PIN kodunuzu girin', {
      left: 'Unuttum',
      onLeft() {
        ask('PIN\'i unuttuysanız tek yol tüm verileri silmektir. Son aldığınız yedekten geri yükleyebilirsiniz.\n\nTüm sınıflar ve notlar silinsin mi?', 'Verileri sil', true).then(y => {
          if (!y) return;
          ask('Emin misiniz? Bu işlem geri alınamaz.', 'Evet, sil', true).then(y2 => { if (y2) { try { localStorage.removeItem(KEY); } catch (e) { } db = fresh(); locked = false; home(); } });
        });
      },
      async onDone(p) {
        if (await hashPin(p) === db.pinHash) { locked = false; pinBuf = ''; view = resumeView || { name: 'home' }; render(); }
        else pinWrong();
      }
    });
  };

  VIEWS.setpin = function () {
    const second = !!pinFirst;
    pinView(second ? 'PIN\'i tekrar girin' : 'Yeni PIN belirleyin', second ? 'Doğrulamak için' : '4 haneli bir kod seçin', {
      left: 'Vazgeç',
      onLeft() { pinFirst = ''; pinBuf = ''; if (!db.onboarded) { db.onboarded = true; save(); } back(); },
      async onDone(p) {
        if (!second) { pinFirst = p; pinBuf = ''; VIEWS.setpin(); return; }
        if (p !== pinFirst) { pinFirst = ''; pinBuf = ''; toast('PIN\'ler eşleşmedi. Baştan deneyin.'); VIEWS.setpin(); return; }
        db.pinHash = await hashPin(p); db.onboarded = true; save();
        pinFirst = ''; pinBuf = ''; toast('PIN kilidi kuruldu'); back();
      }
    });
  };

  VIEWS.verifypin = function () {
    pinView('Mevcut PIN\'i girin', view.off ? 'PIN kilidini kapatmak için' : 'PIN\'i değiştirmek için', {
      left: 'Vazgeç', onLeft() { pinBuf = ''; back(); },
      async onDone(p) {
        if (await hashPin(p) !== db.pinHash) return pinWrong();
        pinBuf = '';
        if (view.off) { db.pinHash = null; save(); back(); toast('PIN kilidi kapatıldı'); }
        else { pinFirst = ''; view = { name: 'setpin' }; render(); }
      }
    });
  };

  VIEWS.welcome = function () {
    app.innerHTML = `<div class="lock" style="justify-content:center">
      <img class="logo" src="icon-180.png" alt="">
      <div style="text-align:center;max-width:320px">
        <div style="font-size:24px;font-weight:700;margin-bottom:8px">Not Defteri</div>
        <div class="sub" style="font-size:15px">Performans ve proje notlarını hızlıca girin, e-Okul düzeninde Excel'e aktarın.<br><br>Notlar yalnızca bu telefonda saklanır. Telefonunuz başkasının eline geçtiğinde notlar görünmesin diye 4 haneli bir PIN belirleyin.</div>
      </div>
      <div style="width:100%;max-width:340px">
        <button class="btn" data-act="pin">PIN belirle</button>
        <button class="btn sec2" data-act="skip">Şimdilik geç</button>
      </div></div>`;
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'pin') { stack = [{ name: 'home' }]; pinFirst = ''; pinBuf = ''; view = { name: 'setpin' }; render(); }
      else { db.onboarded = true; save(); home(); }
    };
  };

  VIEWS.home = function () {
    if (!db.onboarded && !db.classes.length) return VIEWS.welcome();
    const groups = {};
    const gk = c => (c.school || '') + '\u0001' + (c.lesson || '');
    for (const c of db.classes) (groups[gk(c)] = groups[gk(c)] || []).push(c);
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    let body = '';
    if (EMBED) body += `<div class="card" style="padding:12px 14px;margin-top:8px;background:var(--warn-bg);color:var(--warn)"><b>Önizleme</b><div style="margin-top:2px;font-size:14px">Bu, Claude içinde açılan deneme sürümü. Notlar burada kalıcı olmayabilir. Okulda kullanmak için uygulamayı kendi adresinden Safari ile kurun.</div></div>`;
    else if (isIOS && !standalone) body += `<div class="card" style="padding:12px 14px;margin-top:8px;background:var(--accent-bg)"><b>Ana ekrana ekleyin</b><div class="sub" style="color:inherit;margin-top:2px">Safari'de alttaki Paylaş düğmesine, sonra "Ana Ekrana Ekle"ye dokunun. Uygulama simgesiyle açılır, internetsiz de çalışır.<br><b>Önemli:</b> Notları yalnızca ana ekrandaki simgeden açarak girin. Safari'de girilen notlar ana ekran uygulamasına geçmez.</div></div>`;
    if (!db.classes.length) {
      body += `<div class="empty"><b>İlk sınıfınızı ekleyin</b>e-Okul'dan indirdiğiniz Excel dosyasını seçin ya da isim listesini kendiniz yazın.</div>
        <button class="btn" data-act="import">Excel'den sınıf listesi al</button>
        <button class="btn sec2" data-act="newclass">Elle sınıf oluştur</button>`;
    } else {
      for (const g of Object.keys(groups).sort((a, b) => a.localeCompare(b, 'tr'))) {
        const [school, lesson] = g.split('\u0001');
        body += `<div class="sec">${esc(school || 'Okul belirtilmemiş')}${lesson ? ' · ' + esc(lesson) : ''}</div><div class="card">`;
        for (const c of groups[g].sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }))) {
          const parts = [];
          for (const k of sortedItems(c)) { const p = progress(c, k); const lb = isProje(k) ? defLabel(k) : k; if (p.done) parts.push(p.done === p.total ? `${lb} ✓` : `${lb} ${p.done}/${p.total}`); }
          body += `<div class="swipe"><button class="swipe-del" data-act="delclass" data-id="${c.id}">Sil</button>
            <div class="row tap swipe-c" data-act="class" data-id="${c.id}"><div class="grow"><div class="name" style="font-weight:600">${esc(c.name)}</div>
            <div class="sub">${c.students.length} öğrenci${parts.length ? ' · ' + esc(parts.join(' · ')) : ''}</div></div><span class="chev">›</span></div></div>`;
        }
        body += `</div>`;
      }
      body += `<div class="note">Bir sınıfı silmek için sola kaydırın.</div><div class="sec">Tüm sınıflar</div><div class="two"><button class="btn" data-act="pdfall">PDF (imza için)</button><button class="btn sec2" data-act="exportall">Excel</button></div>
        <button class="btn sec2" data-act="import">Excel'den sınıf listesi al</button>
        <button class="btn sec2" data-act="newclass">Elle sınıf oluştur</button>`;
    }
    app.innerHTML = `<div class="top"><h1>Sınıflarım</h1><button class="iconbtn" data-act="settings">Ayarlar</button></div>
      <div class="wrap">
        <div class="seg"><button data-act="term" data-t="1" class="${db.term === 1 ? 'on' : ''}">1. Dönem</button><button data-act="term" data-t="2" class="${db.term === 2 ? 'on' : ''}">2. Dönem</button></div>
        <div class="sec">Okul bilgileri</div>
        <div class="card">
          ${[['school', 'Okul', db.school, 'Okul adını ekleyin'], ['teacher', 'Ders öğretmeni', db.teacher, 'Adınızı ekleyin'], ['principal', 'Okul müdürü', db.principal, 'Müdürün adını ekleyin']].map(([k, l, v, ph]) =>
            `<div class="row tap" data-act="prof" data-k="${k}"><div class="grow"><div class="sub">${l}</div><div class="name" style="${v ? '' : 'color:var(--accent)'}">${esc(v || ph)}</div></div><span class="chev">›</span></div>`).join('')}
        </div>
        ${body}
      </div>`;
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'term') { db.term = +a.dataset.t; save(); render(); }
      else if (act === 'class') go({ name: 'class', id: a.dataset.id });
      else if (act === 'delclass') { const c = cls(a.dataset.id); if (c) deleteClass(c, () => render()); }
      else if (act === 'settings') go({ name: 'settings' });
      else if (act === 'import') startImport();
      else if (act === 'newclass') go({ name: 'newclass' });
      else if (act === 'exportall') exportClasses(db.classes);
      else if (act === 'pdfall') exportPDF(db.classes);
      else if (act === 'prof') {
        const k = a.dataset.k, labels = { school: 'Okul adı', teacher: 'Ders öğretmeninin adı soyadı', principal: 'Okul müdürünün adı soyadı' };
        askText(labels[k], db[k] || '').then(v => {
          if (v === null) return; v = v.trim().replace(/\s+/g, ' ');
          if (k === 'school') { const old = db.school || ''; for (const c of db.classes) if ((c.school || '') === old || !c.school) c.school = v; }
          db[k] = v; save(); render();
        });
      }
    };
  };

  VIEWS.class = function () {
    const c = cls(view.id); if (!c) return home();
    const items = sortedItems(c);
    const tiles = items.map(k => {
      const p = progress(c, k); const a = getA(c, k, false);
      const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
      return `<button class="tile" data-act="entry" data-k="${k}"><b class="name">${esc(itemLabel(c, k))}</b>
        <div class="sub">${a && a.title ? defLabel(k) : '&nbsp;'}</div>
        <div class="sub">${p.done ? `${p.done}/${p.total} girildi` : 'Henüz not yok'}${p.avg != null ? ` · Ort. ${p.avg}` : ''}</div>
        <div class="bar ${p.done && p.done === p.total ? 'full' : ''}"><i style="width:${pct}%"></i></div></button>`;
    }).join('') + `<button class="tile addtile" data-act="additem"><span style="font-size:28px;line-height:1">+</span><b>Not ekle</b><div class="sub">Performans ya da proje</div></button>`;
    app.innerHTML = `<div class="top"><button class="back" data-act="back">‹ Sınıflar</button></div>
      <div class="wrap">
        <h1 style="font-size:28px;margin:0 4px 2px">${esc(c.name)}</h1>
        <div class="sub" style="margin:0 4px 14px">${esc([c.school, c.lesson, db.term + '. Dönem', c.students.length + ' öğrenci'].filter(Boolean).join(' · '))}</div>
        ${items.length ? '' : `<div class="note" style="margin-bottom:8px">Bu dönem için henüz not yok. Verdiğiniz her performans ya da proje notu için "Not ekle"ye dokunun.</div>`}
        <div class="tiles">${tiles}</div>
        <div class="two"><button class="btn" data-act="pdf">PDF (imza için)</button><button class="btn sec2" data-act="export">Excel</button></div>
        <div class="sec">Sınıf</div>
        <div class="card">
          <div class="row tap" data-act="logs"><div class="grow">Puan kırma kayıtları</div><span class="sub">${termLogs(c).length || ''}</span><span class="chev">›</span></div>
          <div class="row tap" data-act="students"><div class="grow">Öğrenciler</div><span class="sub">${c.students.length}</span><span class="chev">›</span></div>
          <div class="row tap" data-act="lesson"><div class="grow">Ders</div><span class="sub">${esc(c.lesson || 'Ekle')}</span><span class="chev">›</span></div>
          <div class="row tap" data-act="copy"><div class="grow">Başka bir ders için kopyala</div><span class="chev">›</span></div>
          <div class="row tap" data-act="info"><div class="grow">Sınıf bilgileri</div><span class="chev">›</span></div>
          <div class="row tap" data-act="delclass"><div class="grow" style="color:var(--danger)">Bu sınıfı / dersi sil</div></div>
        </div>
      </div>`;
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'back') back();
      else if (act === 'entry') { if (!c.students.length) return toast('Bu sınıfta öğrenci yok.'); go({ name: 'entry', id: c.id, k: a.dataset.k, sel: firstEmpty(c, a.dataset.k), buf: '' }); }
      else if (act === 'export') exportClasses([c]);
      else if (act === 'additem') addItemDialog(c);
      else if (act === 'delclass') deleteClass(c, () => home());
      else if (act === 'pdf') exportPDF([c]);
      else if (act === 'lesson') askText('Ders adı', c.lesson || '').then(v => {
        if (v === null) return; v = v.trim();
        if (db.classes.some(x => x !== c && x.name === c.name && (x.school || '') === (c.school || '') && (x.lesson || '').toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))) return toast('Bu sınıfın bu dersi zaten var.');
        c.lesson = v; db.lesson = c.lesson || db.lesson; save(); render(); });
      else if (act === 'copy') askText(`${c.name} sınıfının öğrencileriyle yeni ders`, '').then(v => {
        if (v === null) return; v = v.trim(); if (!v) return toast('Ders adını yazın.');
        if (db.classes.some(x => x.name === c.name && (x.school || '') === (c.school || '') && (x.lesson || '').toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))) return toast('Bu ders için zaten var.');
        const n = { id: uid(), name: c.name, school: c.school, lesson: v, students: c.students.map(s => ({ no: s.no, name: s.name })), terms: {} };
        db.classes.push(n); save(); stack = [{ name: 'home' }]; view = { name: 'class', id: n.id }; render(); toast(`${c.name} · ${v} oluşturuldu`);
      });
      else if (act === 'students') go({ name: 'students', id: c.id });
      else if (act === 'logs') go({ name: 'logs', id: c.id, filter: '' });
      else if (act === 'info') go({ name: 'info', id: c.id });
    };
  };

  function addItemDialog(c) {
    let type = 'P', all = false;
    const others = db.classes.filter(x => x !== c && (x.school || '') === (c.school || ''));
    dialog(`<h3>Yeni not</h3>
      <div class="seg" id="ty" style="margin-top:12px"><button data-ty="P" class="on">Performans</button><button data-ty="J">Proje</button></div>
      <div class="card" style="margin-top:12px"><label class="field"><span>Adı (isteğe bağlı)</span><input id="dlg-in" placeholder="Sunum, ödev, kitap özeti…" autocomplete="off"></label></div>
      ${others.length ? `<div class="card" style="margin-top:12px"><div class="row tap" id="allrow"><span class="check" id="allchk"></span><div class="grow">Okuldaki diğer ${others.length} sınıfa da ekle</div></div></div>` : ''}
      <button class="btn" data-r="val">Ekle</button><button class="btn sec2" data-r="cancel">Vazgeç</button>`, bg => {
      bg.querySelector('#ty').addEventListener('click', e => {
        const b = e.target.closest('[data-ty]'); if (!b) return; type = b.dataset.ty;
        bg.querySelectorAll('#ty button').forEach(x => x.classList.toggle('on', x === b));
      });
      const ar = bg.querySelector('#allrow');
      if (ar) ar.addEventListener('click', () => { all = !all; const ch = bg.querySelector('#allchk'); ch.classList.toggle('on', all); ch.textContent = all ? '✓' : ''; });
    }).then(v => {
      if (v === null || v === false) return;
      const t = String(v).trim().slice(0, 60);
      addItem(c, type, t);
      if (all) others.forEach(o => addItem(o, type, t));
      save(); render();
      toast(all ? `${others.length + 1} sınıfa eklendi` : 'Not eklendi');
    });
  }

  function deleteClass(c, after) {
    const title = c.name + (c.lesson ? ' · ' + c.lesson : '');
    let n = 0; for (const t of Object.values(c.terms || {})) for (const a of Object.values(t)) n += Object.keys(a.e || {}).length;
    ask(`${title} silinsin mi?\n${c.students.length} öğrenci${n ? ` ve ${n} not` : ''} silinecek. Bu işlem geri alınamaz.`, 'Evet, sil', true).then(y => {
      if (!y) { closeSwipes(); return; }
      db.classes = db.classes.filter(x => x !== c); save(); after(); toast(`${title} silindi`);
    });
  }

  function firstEmpty(c, k) {
    const a = getA(c, k, false); if (!a) return 0;
    const i = c.students.findIndex(s => finalOf(a.e[s.no]) == null);
    return i < 0 ? 0 : i;
  }

  // ---------- not girişi ----------
  VIEWS.entry = function () {
    const c = cls(view.id); if (!c) return home();
    const a = getA(c, view.k, true);
    view.pad = !!view.pad;
    app.innerHTML = `<div class="entry ${view.pad ? '' : 'nopad'}" id="entry">
      <div class="top"><button class="back" data-act="back">‹ ${esc(c.name)}</button><h1 style="font-size:19px;text-align:right" id="etitle">${esc(itemLabel(c, view.k))}</h1></div>
      <div class="infobar"><span id="cnt"></span><button data-act="pen" id="penbtn"></button><button data-act="title" id="titlebtn"></button><button data-act="delitem" style="color:var(--danger)">Notu sil</button></div>
      <div class="hint" id="hint">Not yazmak için öğrencinin yanındaki kutuya dokunun.</div>
      <div class="list" id="list"></div>
      <div class="pad">
        <div class="quick">${[100, 90, 85, 80, 75, 70].map(n => `<button class="k q" data-q="${n}">${n}</button>`).join('')}</div>
        <div class="keys">
          <button class="k" data-d="1">1</button><button class="k" data-d="2">2</button><button class="k" data-d="3">3</button><button class="k s" data-x="del" aria-label="Sil">⌫</button>
          <button class="k" data-d="4">4</button><button class="k" data-d="5">5</button><button class="k" data-d="6">6</button><button class="k" data-x="g">G</button>
          <button class="k" data-d="7">7</button><button class="k" data-d="8">8</button><button class="k" data-d="9">9</button><button class="k s warn" data-x="late" id="latekey">Geç</button>
          <button class="k s" data-x="close">Kapat</button><button class="k" data-d="0">0</button><button class="k s next" data-x="next" style="grid-column:span 2">Sonraki ▼</button>
        </div>
      </div></div>`;
    const list = document.getElementById('list');

    function entryOf(i) { const s = c.students[i]; return a.e[s.no] || (a.e[s.no] = { r: null, a: false, l: false, p: 0 }); }
    function tidy(i) { const s = c.students[i]; const en = a.e[s.no]; if (en && en.r == null && !en.a && !en.l) delete a.e[s.no]; }
    function valHtml(en) {
      const f = finalOf(en);
      if (f === 'G') return `<div class="val"><div class="gbox g">G</div></div>`;
      if (f == null) return `<div class="val"><div class="gbox"></div>${en && en.l ? '<div class="calc">geç</div>' : ''}</div>`;
      return `<div class="val"><div class="gbox">${f}</div>${en.l ? `<div class="calc">${en.r} − ${en.p}</div>` : ''}</div>`;
    }
    function rowHtml(s, i) {
      const en = a.e[s.no];
      return `<div class="srow ${view.pad && i === view.sel ? 'sel' : ''}" data-i="${i}">
        <span class="num">${i + 1}</span>
        <div class="grow"><div class="name">${esc(s.name)}</div><div class="sub">${noLabel(s)}${en && en.l ? ` <button class="chip" data-chip="${i}">Geç${en.p ? ' −' + en.p : ''}</button>` : ''}</div></div>
        ${valHtml(en)}</div>`;
    }
    function drawAll() {
      list.innerHTML = c.students.map(rowHtml).join('');
      header(); if (view.pad) scrollSel();
    }
    function redraw(i) {
      const el = list.querySelector(`.srow[data-i="${i}"]`);
      if (el) el.outerHTML = rowHtml(c.students[i], i);
    }
    function header() {
      const p = progress(c, view.k);
      document.getElementById('cnt').textContent = `${p.done}/${p.total} girildi`;
      document.getElementById('penbtn').textContent = `Geç kesintisi: −${a.penalty}`;
      document.getElementById('titlebtn').textContent = a.title ? 'Adını değiştir' : 'Ad ver';
      document.getElementById('etitle').textContent = itemLabel(c, view.k);
      const en = a.e[c.students[view.sel].no];
      document.getElementById('latekey').classList.toggle('on', !!(en && en.l));
    }
    function scrollSel() {
      const el = list.querySelector(`.srow[data-i="${view.sel}"]`); if (!el) return;
      const lr = list.getBoundingClientRect(), er = el.getBoundingClientRect();
      if (er.top < lr.top + 4 || er.bottom > lr.bottom - 4) list.scrollTop += (er.top - lr.top) - (lr.height / 2 - er.height / 2);
    }
    function setPad(on) {
      view.pad = on; document.getElementById('entry').classList.toggle('nopad', !on);
    }
    function select(i) {
      const old = view.sel; view.sel = Math.max(0, Math.min(c.students.length - 1, i)); view.buf = '';
      if (!view.pad) setPad(true);
      redraw(old); redraw(view.sel); header();
      requestAnimationFrame(scrollSel);
    }
    function changed(i) { tidy(i); save(); redraw(i); header(); }
    function advance() {
      if (view.sel >= c.students.length - 1) {
        const p = progress(c, view.k);
        toast(p.done === p.total ? 'Tüm öğrencilere not girildi' : 'Liste sonu. Boş kalanlar var.');
        view.buf = ''; setPad(false); redraw(view.sel); return;
      }
      select(view.sel + 1);
    }
    function setLate(i, pen) {
      const en = entryOf(i);
      if (pen === 'remove') { en.l = false; en.p = 0; }
      else { en.l = true; en.p = pen; en.a = false; }
      changed(i);
    }

    list.onclick = e => {
      e.stopPropagation();
      const chip = e.target.closest('[data-chip]');
      if (chip) {
        const i = +chip.dataset.chip; const en = entryOf(i);
        penaltySheet('Geç teslim kesintisi', c.students[i].name, en.p, true, v => setLate(i, v));
        return;
      }
      const r = e.target.closest('.srow'); if (r) select(+r.dataset.i);
    };
    app.querySelector('.pad').onclick = e => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      const i = view.sel, en = entryOf(i);
      if (b.dataset.d != null) {
        if (en.a) en.a = false;
        let nb = (view.buf.length >= 3 || view.buf === '0') ? b.dataset.d : view.buf + b.dataset.d;
        if (+nb > 100) nb = b.dataset.d;
        view.buf = nb; en.r = +nb; changed(i);
        if (nb.length === 3 || (nb.length === 2 && nb !== '10')) advance();
      } else if (b.dataset.q != null) {
        en.r = +b.dataset.q; en.a = false; changed(i); advance();
      } else {
        const x = b.dataset.x;
        if (x === 'del') {
          let s = view.buf || (en.r != null ? String(en.r) : '');
          if (en.a) { en.a = false; s = ''; } else s = s.slice(0, -1);
          view.buf = s; en.r = s ? +s : null; changed(i);
        } else if (x === 'g') {
          en.a = !en.a; if (en.a) { en.r = null; en.l = false; en.p = 0; } changed(i); if (en.a) advance();
        } else if (x === 'late') {
          if (en.a) return toast('G (girmedi) işaretli öğrenciye geç teslim uygulanamaz.');
          if (en.l) penaltySheet('Geç teslim kesintisi', c.students[i].name, en.p, true, v => setLate(i, v));
          else { setLate(i, a.penalty); if (en.r == null) toast('Geç teslim işaretlendi. Şimdi notu yazın.'); }
        } else if (x === 'next') { tidy(i); advance(); }
        else if (x === 'close') { tidy(i); setPad(false); redraw(i); }
      }
    };
    const pad = app.querySelector('.pad');
    const keyMap = { Backspace: '[data-x="del"]', Delete: '[data-x="del"]', Enter: '[data-x="next"]', ArrowDown: '[data-x="next"]', Tab: '[data-x="next"]', Escape: '[data-x="close"]', g: '[data-x="g"]', G: '[data-x="g"]' };
    document.onkeydown = e => {
      if (view.name !== 'entry' || document.querySelector('.sheet-bg') || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); select(view.sel - 1); return; }
      const sel = /^\d$/.test(e.key) ? `[data-d="${e.key}"]` : keyMap[e.key];
      if (!sel) return; e.preventDefault();
      if (!view.pad) setPad(true);
      const b = pad.querySelector(sel); if (b) b.click();
    };
    app.querySelector('.top').onclick = e => { e.stopPropagation(); if (e.target.closest('[data-act="back"]')) { tidy(view.sel); save(); back(); } };
    app.querySelector('.infobar').onclick = e => {
      e.stopPropagation();
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'pen') {
        penaltySheet('Geç teslim kesintisi', 'Bu not için "Geç" düğmesine basınca kırılacak puan', a.penalty, false, v => { a.penalty = v; save(); header(); toast(`Geç kesintisi −${v} oldu`); });
      } else if (b.dataset.act === 'delitem') {
        const p = progress(c, view.k);
        ask(`"${itemLabel(c, view.k)}" silinsin mi?${p.done ? `\n${p.done} öğrencinin bu notu da silinecek.` : ''}`, 'Notu sil', true).then(y => {
          if (!y) return; removeItem(c, view.k); save(); back(); toast('Not silindi');
        });
      } else if (b.dataset.act === 'title') {
        askText('Bu notun adı (isteğe bağlı)', a.title || '').then(t => {
          if (t === null) return;
          a.title = t.trim().slice(0, 60); save(); header();
        });
      }
    };
    app.onclick = null;
    drawAll();
  };

  // ---------- puan kırma kayıtları ----------
  const REASONS = ['Ödev getirmedi', 'Derse hazırlıksız geldi', 'Materyal getirmedi', 'Geç teslim', 'Ders kurallarına uymadı'];
  const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (d || ''); };
  const logsOf = c => (c.logs = c.logs || []);
  const termLogs = c => logsOf(c).filter(l => (l.term || 1) === db.term);

  VIEWS.logs = function () {
    const c = cls(view.id); if (!c) return home();
    const f = view.filter || '';
    const all = termLogs(c).slice().sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.id > x.id ? 1 : -1));
    const list = f ? all.filter(l => l.no === f) : all;
    const sname = no => { const st = c.students.find(x => x.no === no); return st ? st.name : 'Listede olmayan öğrenci'; };
    const total = list.reduce((t, l) => t + (l.pts || 0), 0);
    app.innerHTML = `<div class="top"><button class="back" data-act="back">‹ ${esc(c.name)}</button><h1 style="font-size:19px;text-align:right">Puan kırma</h1></div>
      <div class="wrap">
        <button class="btn" data-act="new" style="margin-top:0">+ Yeni kayıt</button>
        <div class="card" style="margin-top:14px"><label class="field"><span>Öğrenci</span>
          <select id="flt" class="sel"><option value="">Tüm öğrenciler</option>${c.students.map((st, i) => `<option value="${esc(st.no)}" ${st.no === f ? 'selected' : ''}>${i + 1}. ${esc(st.name)}</option>`).join('')}</select></label></div>
        <div class="note">${list.length ? `${list.length} kayıt${total ? ` · Toplam −${total} puan` : ''} · ${db.term}. Dönem` : ''}</div>
        <div class="card">${list.map(l => `<div class="row tap" data-act="edit" data-id="${l.id}">
            <div class="grow"><div class="name" style="font-weight:600">${esc(f ? (l.reason || 'Sebep yazılmamış') : sname(l.no))}</div>
            <div class="sub">${fmtDate(l.date)}${f ? '' : ' · ' + esc(l.reason || 'Sebep yazılmamış')}</div></div>
            ${l.pts ? `<span class="chip">−${l.pts}</span>` : ''}<span class="chev">›</span></div>`).join('') || `<div class="empty" style="padding:28px 16px"><b>Kayıt yok</b>Bir öğrenciden puan kırdığınızda tarihini ve sebebini buraya not edin.</div>`}</div>
      </div>`;
    document.getElementById('flt').onchange = e => { view.filter = e.target.value; render(); };
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'back') back();
      else if (a.dataset.act === 'new') { if (!c.students.length) return toast('Bu sınıfta öğrenci yok.'); go({ name: 'logedit', id: c.id, no: f }); }
      else if (a.dataset.act === 'edit') go({ name: 'logedit', id: c.id, lid: a.dataset.id });
    };
  };

  VIEWS.logedit = function () {
    const c = cls(view.id); if (!c) return home();
    const l = view.lid ? logsOf(c).find(x => x.id === view.lid) : null;
    const no = l ? l.no : (view.no || '');
    app.innerHTML = `<div class="top"><button class="back" data-act="back">‹ Vazgeç</button><h1 style="font-size:19px;text-align:right">${l ? 'Kaydı düzenle' : 'Yeni kayıt'}</h1></div>
      <div class="wrap">
        <div class="card">
          <label class="field"><span>Öğrenci</span><select id="l-no" class="sel"><option value="">Seçin</option>${c.students.map((st, i) => `<option value="${esc(st.no)}" ${st.no === no ? 'selected' : ''}>${i + 1}. ${esc(st.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Tarih</span><input id="l-date" type="date" value="${esc(l ? l.date : today())}"></label>
          <label class="field"><span>Kırılan puan (isteğe bağlı)</span><input id="l-pts" inputmode="numeric" pattern="[0-9]*" placeholder="10" value="${l && l.pts ? l.pts : ''}"></label>
          <label class="field"><span>Sebep</span><input id="l-reason" placeholder="Ödevini getirmedi" value="${esc(l ? l.reason : '')}"></label>
        </div>
        <div class="chips">${REASONS.map(r => `<button class="rchip" data-act="reason">${esc(r)}</button>`).join('')}</div>
        <button class="btn" data-act="save">Kaydet</button>
        ${l ? '<button class="btn danger" data-act="delete">Kaydı sil</button>' : ''}
        <div class="note">Bu kayıtlar notu otomatik değiştirmez, hatırlatma içindir. Excel'e aktarınca "Puan kırma" sekmesinde çıkar.</div>
      </div>`;
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'back') back();
      else if (act === 'reason') { document.getElementById('l-reason').value = a.textContent; }
      else if (act === 'save') {
        const sno = document.getElementById('l-no').value; if (!sno) return toast('Öğrenciyi seçin.');
        const date = document.getElementById('l-date').value || today();
        const ptsS = document.getElementById('l-pts').value.trim();
        if (ptsS && (!/^\d+$/.test(ptsS) || +ptsS > 100)) return toast('Puan 0 ile 100 arasında bir sayı olmalı.');
        const reason = document.getElementById('l-reason').value.trim().slice(0, 200);
        if (!reason && !ptsS) return toast('Sebep ya da puan yazın.');
        if (l) Object.assign(l, { no: sno, date, pts: ptsS ? +ptsS : null, reason });
        else logsOf(c).push({ id: uid(), no: sno, date, pts: ptsS ? +ptsS : null, reason, term: db.term });
        save(); back(); toast(l ? 'Kayıt güncellendi' : 'Kayıt eklendi');
      } else if (act === 'delete') {
        ask('Bu kayıt silinsin mi?', 'Sil', true).then(y => { if (y) { c.logs = logsOf(c).filter(x => x !== l); save(); back(); toast('Kayıt silindi'); } });
      }
    };
  };

  // ---------- öğrenciler ----------
  // öğrenci yardımcıları: okul no isteğe bağlı; numarasızlara iç anahtar verilir
  const hasNo = s => /^\d+$/.test(s.no);
  const noLabel = s => hasNo(s) ? 'No ' + s.no : 'Numarasız';
  let keyN = 0;
  const innerKey = () => 'x' + Date.now().toString(36) + (keyN++).toString(36);
  const upName = n => n.replace(/[\u200B-\u200F\u2060\uFEFF\x00-\x1F]/g, ' ').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr');
  function sortStudents(list) {
    const withNo = list.filter(hasNo).sort((x, y) => (+x.no) - (+y.no));
    return withNo.concat(list.filter(x => !hasNo(x)));
  }
  // Her satır bir öğrenci: "Ayşe Yılmaz", "245 Ayşe Yılmaz", "Ayşe Yılmaz 245", Excel'den "1  245  AYŞE YILMAZ"
  function parseList(text) {
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      const toks = line.replace(/[;,|]/g, ' ').split(/[\s\t]+/).filter(Boolean);
      const isN = t => /^\d+[.)-]?$/.test(t);
      const lead = []; while (toks.length && isN(toks[0]) && lead.length < 2) lead.push(toks.shift());
      let trail = null; if (!lead.length && toks.length > 1 && /^\d+$/.test(toks[toks.length - 1])) trail = toks.pop();
      const name = toks.join(' ');
      if (!/\p{L}/u.test(name)) continue;
      const clean = t => t.replace(/[.)-]$/, '');
      const no = lead.length >= 2 ? clean(lead[1]) : lead.length === 1 ? (/[.)-]$/.test(lead[0]) ? '' : clean(lead[0])) : (trail || '');
      out.push({ no: no ? String(+no) : '', name: upName(name) });
    }
    return out;
  }
  // listeyi sınıfa ekle; eklenen ve atlanan sayısını döndür
  function addStudents(c, list) {
    let added = 0, skipped = 0;
    const before = new Set(c.students.filter(x => !hasNo(x)).map(x => x.name));
    for (const st of list) {
      if (st.no && c.students.some(x => x.no === st.no)) { skipped++; continue; }
      if (!st.no && before.has(st.name)) { skipped++; continue; }
      c.students.push({ no: st.no || innerKey(), name: st.name }); added++;
    }
    c.students = sortStudents(c.students);
    return { added, skipped };
  }
  const listHint = `<div class="note">Her satıra bir öğrenci yazın. Okul numarası isteğe bağlı: "245 Ayşe Yılmaz" ya da yalnızca "Ayşe Yılmaz". Excel'den ya da WhatsApp'tan kopyalayıp yapıştırabilirsiniz.</div>`;

  VIEWS.newclass = function () {
    app.innerHTML = `<div class="top"><button class="back" data-act="back">‹ Vazgeç</button><h1 style="font-size:19px;text-align:right">Yeni sınıf</h1></div>
      <div class="wrap">
        <div class="card">
          <label class="field"><span>Sınıf</span><input id="n-name" placeholder="9/A"></label>
          <label class="field"><span>Okul</span><input id="n-school" value="${esc(db.school)}" placeholder="Okul adı"></label>
          <label class="field"><span>Ders (isteğe bağlı)</span><input id="n-lesson" value="${esc(db.lesson)}" placeholder="Din Kültürü"></label>
        </div>
        <div class="sec">Öğrenci listesi</div>
        <div class="card"><textarea id="n-list" class="ta" rows="9" placeholder="245 AYŞE YILMAZ&#10;246 MEHMET KAYA&#10;ZEYNEP DEMİR"></textarea></div>
        <div class="note" id="n-count">Öğrencileri sonra da ekleyebilirsiniz.</div>
        ${listHint}
        <button class="btn" data-act="create">Sınıfı oluştur</button>
      </div>`;
    const ta = document.getElementById('n-list'), cnt = document.getElementById('n-count');
    app.oninput = e => {
      if (e.target !== ta) return;
      const l = parseList(ta.value);
      cnt.textContent = l.length ? `${l.length} öğrenci algılandı${l.some(x => !x.no) ? ` (${l.filter(x => !x.no).length} tanesi numarasız)` : ''}` : 'Öğrencileri sonra da ekleyebilirsiniz.';
    };
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'back') { app.oninput = null; back(); }
      else if (a.dataset.act === 'create') {
        const name = document.getElementById('n-name').value.trim();
        if (!name) return toast('Sınıf adını yazın.');
        const school = document.getElementById('n-school').value.trim(), lesson = document.getElementById('n-lesson').value.trim();
        if (db.classes.some(c => c.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr') && (c.school || '') === school && (c.lesson || '') === lesson)) return toast('Bu adda bir sınıf zaten var.');
        const c = { id: uid(), name, school, lesson, students: [], terms: {} };
        addStudents(c, parseList(ta.value));
        db.classes.push(c); if (!db.school) db.school = school; db.lesson = lesson; db.onboarded = true; save();
        app.oninput = null; stack = [{ name: 'home' }]; view = { name: 'class', id: c.id }; render();
        toast(`${name} oluşturuldu · ${c.students.length} öğrenci`);
      }
    };
  };

  VIEWS.students = function () {
    const c = cls(view.id); if (!c) return home();
    app.innerHTML = `<div class="top"><button class="back" data-act="back">‹ ${esc(c.name)}</button><h1 style="font-size:19px;text-align:right">Öğrenciler</h1></div>
      <div class="wrap">
        <div class="card">${c.students.map((s, i) => `<div class="row"><span class="sub" style="width:22px;text-align:right">${i + 1}</span><div class="grow tap" data-act="edit" data-i="${i}"><div class="name">${esc(s.name)}</div><div class="sub">${noLabel(s)}</div></div><button class="iconbtn" style="color:var(--danger)" data-act="del" data-i="${i}">Çıkar</button></div>`).join('') || '<div class="row sub">Henüz öğrenci yok</div>'}</div>
        <div class="note">İsmi düzeltmek için öğrencinin adına dokunun.</div>
        <div class="sec">Tek öğrenci ekle</div>
        <div class="card">
          <label class="field"><span>Adı soyadı</span><input id="nm" autocapitalize="characters" placeholder="AYŞE YILMAZ"></label>
          <label class="field"><span>Okul numarası (isteğe bağlı)</span><input id="no" inputmode="numeric" pattern="[0-9]*" placeholder="245"></label>
        </div>
        <button class="btn" data-act="add">Ekle</button>
        <div class="sec">Birden çok öğrenci ekle</div>
        <div class="card"><textarea id="bulk" class="ta" rows="6" placeholder="245 AYŞE YILMAZ&#10;MEHMET KAYA"></textarea></div>
        ${listHint}
        <button class="btn sec2" data-act="bulk">Listeyi ekle</button>
      </div>`;
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'back') back();
      else if (act === 'del') {
        const i = +a.dataset.i, s = c.students[i];
        ask(`${s.name} sınıftan çıkarılsın mı?`, 'Çıkar', true).then(y => { if (y) { c.students.splice(i, 1); save(); render(); } });
      } else if (act === 'edit') {
        const s = c.students[+a.dataset.i];
        askText('Öğrencinin adı', s.name).then(t => {
          if (t === null) return; t = upName(t); if (!t) return toast('İsim boş olamaz.');
          s.name = t; save(); render();
        });
      } else if (act === 'add') {
        const no = document.getElementById('no').value.trim(), nm = upName(document.getElementById('nm').value);
        if (!nm) return toast('Öğrencinin adını yazın.');
        if (no && !/^\d+$/.test(no)) return toast('Okul numarası yalnızca rakam olmalı.');
        const r = addStudents(c, [{ no: no ? String(+no) : '', name: nm }]);
        if (!r.added) return toast(no ? 'Bu numara zaten listede.' : 'Bu isim zaten listede.');
        save(); render(); toast('Öğrenci eklendi');
      } else if (act === 'bulk') {
        const l = parseList(document.getElementById('bulk').value);
        if (!l.length) return toast('Listede isim bulunamadı.');
        const r = addStudents(c, l); save(); render();
        toast(`${r.added} öğrenci eklendi${r.skipped ? `, ${r.skipped} tanesi zaten listedeydi` : ''}`);
      }
    };
  };

  VIEWS.info = function () {
    const c = cls(view.id); if (!c) return home();
    app.innerHTML = `<div class="top"><button class="back" data-act="back">‹ ${esc(c.name)}</button></div>
      <div class="wrap">
        <div class="card">
          <label class="field"><span>Sınıf</span><input id="f-name" value="${esc(c.name)}" placeholder="9/A"></label>
          <label class="field"><span>Okul</span><input id="f-school" value="${esc(c.school)}" placeholder="Okul adı"></label>
          <label class="field"><span>Ders</span><input id="f-lesson" value="${esc(c.lesson)}" placeholder="Din Kültürü"></label>
        </div>
        <button class="btn" data-act="save">Kaydet</button>
        <button class="btn danger" data-act="delete" style="margin-top:28px">Sınıfı sil</button>
      </div>`;
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'back') back();
      else if (a.dataset.act === 'save') {
        const n = document.getElementById('f-name').value.trim(); if (!n) return toast('Sınıf adını yazın.');
        const sc = document.getElementById('f-school').value.trim(), le = document.getElementById('f-lesson').value.trim();
        if (db.classes.some(x => x !== c && x.name.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr') && (x.school || '') === sc && (x.lesson || '') === le)) return toast('Aynı okul ve derste bu adda bir sınıf zaten var.');
        c.name = n; c.school = sc; c.lesson = le;
        save(); toast('Kaydedildi'); back();
      } else if (a.dataset.act === 'delete') {
        deleteClass(c, () => home());
      }
    };
  };

  // ---------- ayarlar ----------
  VIEWS.settings = function () {
    app.innerHTML = `<div class="top"><button class="back" data-act="back">‹ Sınıflar</button><h1 style="font-size:19px;text-align:right">Ayarlar</h1></div>
      <div class="wrap">
        <div class="sec">Görünüm</div>
        <div class="seg">${[['auto', 'Otomatik'], ['light', 'Açık'], ['dark', 'Gece']].map(([v, l]) => `<button data-act="theme" data-t="${v}" class="${(db.theme || 'auto') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="note">Otomatik: iPhone'un açık/koyu ayarını izler.</div>
        <div class="sec">Güvenlik</div>
        <div class="card">${db.pinHash
          ? `<div class="row tap" data-act="pin"><div class="grow">PIN'i değiştir</div><span class="chev">›</span></div>
             <div class="row tap" data-act="pinoff"><div class="grow" style="color:var(--danger)">PIN kilidini kapat</div></div>`
          : `<div class="row tap" data-act="pin"><div class="grow">PIN kilidi</div><span class="sub">Kapalı</span><span class="chev">›</span></div>`}</div>
        <div class="note">PIN açıkken uygulama her açılışta ve 1 dakikadan uzun arka planda kaldığında kod ister.</div>
        <div class="sec">Notlar</div>
        <div class="card"><div class="row tap" data-act="pen"><div class="grow">Varsayılan geç teslim kesintisi</div><span class="sub">−${db.defaultPenalty} puan</span><span class="chev">›</span></div></div>
        <div class="note">Yeni açılan notlarda kullanılır. Her notun kendi kesintisini not giriş ekranından değiştirebilirsiniz.</div>
        <div class="sec">Yedek</div>
        <div class="card">
          <div class="row tap" data-act="backup"><div class="grow">Yedek al</div><span class="chev">›</span></div>
          <div class="row tap" data-act="restore"><div class="grow">Yedekten geri yükle</div><span class="chev">›</span></div>
        </div>
        <div class="note">Notlar yalnızca bu telefonda saklanır. Safari geçmişini silmek ya da telefonu değiştirmek notları kaybettirir. Ayda bir yedek alıp Dosyalar'a veya Drive'a kaydedin.</div>
        <div class="sec">Veriler</div>
        <div class="card"><div class="row tap" data-act="wipe"><div class="grow" style="color:var(--danger)">Tüm verileri sil</div></div></div>
        <div class="note" style="text-align:center;margin-top:20px">Not Defteri ${VERSION}</div>
      </div>`;
    app.onclick = async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'back') back();
      else if (act === 'theme') { db.theme = a.dataset.t; save(); applyTheme(); render(); }
      else if (act === 'pin') { pinFirst = ''; pinBuf = ''; go({ name: db.pinHash ? 'verifypin' : 'setpin' }); }
      else if (act === 'pinoff') { pinBuf = ''; go({ name: 'verifypin', off: true }); }
      else if (act === 'pen') penaltySheet('Varsayılan geç teslim kesintisi', 'Yeni notlarda "Geç" düğmesiyle kırılacak puan', db.defaultPenalty, false, v => { db.defaultPenalty = v; save(); render(); });
      else if (act === 'backup') {
        const data = Object.assign({}, db, { pinHash: null, exportedAt: new Date().toISOString(), app: 'notdefteri' });
        shareFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `NotDefteri_Yedek_${today()}.json`);
      } else if (act === 'restore') {
        pickFile(async f => {
          try {
            const d = JSON.parse(await f.text());
            if (d.app !== 'notdefteri' || !Array.isArray(d.classes)) throw 0;
            if (!(await ask(`Yedekte ${d.classes.length} sınıf var. Şu anki verilerin yerine yedek yüklensin mi?`, 'Yedeği yükle', true))) return;
            const pin = db.pinHash; db = Object.assign(fresh(), d, { pinHash: pin, onboarded: true }); applyTheme();
            delete db.app; delete db.exportedAt; save(); home(); toast('Yedek yüklendi');
          } catch (err) { toast('Bu dosya bir Not Defteri yedeği değil.'); }
        });
      } else if (act === 'wipe') {
        if (await ask('Tüm sınıflar, öğrenciler ve notlar silinsin mi?', 'Tümünü sil', true) && await ask('Emin misiniz? Bu işlem geri alınamaz.', 'Evet, sil', true)) {
          const pin = db.pinHash; db = fresh(); db.pinHash = pin; db.onboarded = true; save(); home(); toast('Tüm veriler silindi');
        }
      }
    };
  };

  // ---------- içe aktarma ----------
  function startImport() {
    pickFile(async f => {
      let lists;
      try { lists = Excel.findLists(await Excel.readAny(f)); }
      catch (e) { return toast(e && e.message ? e.message : 'Dosya okunamadı.'); }
      if (!lists.length) return toast('Dosyada öğrenci listesi bulunamadı.');
      const sig = l => l.students.map(s => s.no).join(',');
      const items = lists.map((l, i) => {
        const dupOf = lists.findIndex((x, j) => j < i && sig(x) === sig(l));
        const nos = new Set(l.students.map(s => s.no));
        let match = null, best = 0;
        for (const c of db.classes) {
          const ov = c.students.filter(s => nos.has(s.no)).length / Math.max(nos.size, c.students.length);
          if (ov > best) { best = ov; match = c; }
        }
        if (best < 0.7) match = null;
        return { list: l, on: dupOf < 0, dupOf, match, name: match && dupOf < 0 ? match.name : '' };
      });
      go({ name: 'import', items, file: f.name });
    });
  }

  VIEWS.import = function () {
    const items = view.items;
    app.innerHTML = `<div class="top"><button class="back" data-act="back">‹ Vazgeç</button><h1 style="font-size:19px;text-align:right">Sınıfları al</h1></div>
      <div class="wrap">
        <div class="card">
          <label class="field"><span>Okul</span><input id="i-school" value="${esc(db.school)}" placeholder="Okul adı"></label>
          <label class="field"><span>Ders (isteğe bağlı)</span><input id="i-lesson" value="${esc(db.lesson)}" placeholder="Din Kültürü"></label>
        </div>
        <div class="note">Dosyada ${items.length} liste bulundu. e-Okul dosyasında sınıf adları yazmıyor. Her listenin hangi sınıf olduğunu yazın, almak istemediklerinizin işaretini kaldırın.</div>
        ${items.map((it, i) => `
          <div class="card" style="margin-top:10px">
            <div class="row tap" data-act="tog" data-i="${i}">
              <span class="check ${it.on ? 'on' : ''}">${it.on ? '✓' : ''}</span>
              <div class="grow"><div style="font-weight:600">Liste ${i + 1} · ${it.list.students.length} öğrenci</div>
              <div class="sub name">${esc(it.list.students.slice(0, 3).map(s => shortName(s.name)).join(', '))}…</div></div>
            </div>
            ${it.on ? `<label class="field"><span>Sınıf adı</span><input data-name="${i}" value="${esc(it.name)}" placeholder="9/A"></label>` : ''}
            ${it.dupOf >= 0 ? `<div class="note" style="padding:0 14px 10px">Liste ${it.dupOf + 1} ile aynı öğrenciler. Aynı sınıfın başka bir dersi olabilir. Ayrı tutmak isterseniz işaretleyip farklı bir ad verin (9/A Seçmeli gibi).</div>` : ''}
            ${it.match && it.on ? `<div class="note" style="padding:0 14px 10px">Mevcut ${esc(it.match.name)} sınıfıyla eşleşiyor. Aynı adı bırakırsanız yeni öğrenciler eklenir, notlar korunur.</div>` : ''}
          </div>`).join('')}
        <button class="btn" data-act="go">Sınıfları ekle</button>
      </div>`;
    app.oninput = e => { const n = e.target.dataset.name; if (n != null) items[+n].name = e.target.value; };
    app.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'back') { app.oninput = null; back(); }
      else if (a.dataset.act === 'tog') { const it = items[+a.dataset.i]; it.on = !it.on; const y = window.scrollY; render(); window.scrollTo(0, y); }
      else if (a.dataset.act === 'go') {
        const chosen = items.filter(it => it.on);
        if (!chosen.length) return toast('En az bir liste seçin.');
        if (chosen.some(it => !it.name.trim())) return toast('İşaretli listelerin hepsine sınıf adı yazın.');
        const names = chosen.map(it => it.name.trim().toLocaleLowerCase('tr'));
        if (new Set(names).size !== names.length) return toast('İki listeye aynı adı verdiniz. Adları farklı yazın.');
        const school = document.getElementById('i-school').value.trim(), lesson = document.getElementById('i-lesson').value.trim();
        if (!db.school) db.school = school; db.lesson = lesson;
        let added = 0, updated = 0;
        for (const it of chosen) {
          const name = it.name.trim();
          const ex = db.classes.find(c => c.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr') && (c.school || '') === school && (c.lesson || '') === lesson);
          if (ex) {
            for (const s of it.list.students) { const o = ex.students.find(x => x.no === s.no); if (o) o.name = s.name; else ex.students.push(s); }
            ex.students = sortStudents(ex.students);
            updated++;
          } else {
            db.classes.push({ id: uid(), name, school, lesson, students: it.list.students.map(s => ({ no: s.no, name: s.name })), terms: {} });
            added++;
          }
        }
        db.onboarded = true; save(); app.oninput = null; home();
        toast([added ? `${added} sınıf eklendi` : '', updated ? `${updated} sınıf güncellendi` : ''].filter(Boolean).join(', '));
      }
    };
  };

  // ---------- dışa aktarma ----------
  function academicYear() { const d = new Date(), y = d.getFullYear(), st = d.getMonth() >= 8 ? y : y - 1; return `${st}-${st + 1}`; }
  function exportPDF(list) {
    if (!list.length) return toast('Aktarılacak sınıf yok.');
    if (!window.PDF) return toast('PDF hazırlanamadı.');
    const d = new Date(), date = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    const sorted = list.slice().sort((a, b) => (a.school || '').localeCompare(b.school || '', 'tr') || (a.lesson || '').localeCompare(b.lesson || '', 'tr') || a.name.localeCompare(b.name, 'tr', { numeric: true }));
    const docs = sorted.map(c => {
      const items = sortedItems(c);
      return {
        school: c.school || db.school, year: academicYear(), term: db.term, title: 'Performans ve Proje Notları Çizelgesi',
        className: c.name, lesson: c.lesson, date, teacher: db.teacher, principal: db.principal,
        columns: items.map(k => { const a = getA(c, k, false); return { code: k, title: a && a.title ? a.title : '' }; }),
        rows: c.students.map((s, i) => ({ sira: i + 1, no: hasNo(s) ? s.no : '', name: s.name, vals: items.map(k => { const a = getA(c, k, false); return a ? finalOf(a.e[s.no]) : null; }) }))
      };
    });
    let blob;
    try { blob = PDF.makePDF(docs); } catch (e) { return toast('PDF hazırlanamadı.'); }
    const nm = list.length === 1 ? trAscii(list[0].name + (list[0].lesson ? '_' + list[0].lesson : '')) : 'Tum-Siniflar';
    shareFile(blob, `Notlar_${nm}_${db.term}-Donem_${today()}.pdf`);
    if (!db.teacher || !db.principal) setTimeout(() => toast('İpucu: Ana sayfadaki "Okul bilgileri"nden öğretmen ve müdür adını ekleyin.'), 600);
  }
  function exportClasses(list) {
    if (!list.length) return toast('Aktarılacak sınıf yok.');
    const sheets = [];
    const detail = [['Sınıf', 'Not', 'Adı', 'Sıra No', 'Okul Numarası', 'Adı Soyadı', 'Ham not', 'Geç teslim', 'Kesinti', 'Son not']];
    const sorted = list.slice().sort((a, b) => (a.school || '').localeCompare(b.school || '', 'tr') || a.name.localeCompare(b.name, 'tr', { numeric: true }));
    for (const c of sorted) {
      const items = sortedItems(c);
      const heads = items.map(k => { const a = getA(c, k, false); return k + (a && a.title ? ` (${a.title})` : ''); });
      const rows = [[[c.school, c.name, c.lesson, db.term + '. Dönem'].filter(Boolean).join(' — ')], [], ['Sıra No', 'Okul Numarası', 'Adı Soyadı', ...heads]];
      c.students.forEach((s, i) => {
        const row = [i + 1, hasNo(s) ? +s.no : null, s.name];
        for (const k of items) { const a = getA(c, k, false); const f = a ? finalOf(a.e[s.no]) : null; row.push(f == null ? null : f); }
        rows.push(row);
      });
      rows.push([], [], [null, 'Ders Öğretmeni', null, 'Okul Müdürü'], [null, db.teacher || null, null, db.principal || null], [null, 'İmza', null, 'İmza']);
      sheets.push({ name: c.name + (c.lesson && sorted.filter(x => x.name === c.name).length > 1 ? ' ' + c.lesson : ''), rows, plainFrom: 3 + c.students.length, widths: [8, 15, 32, ...heads.map(h => Math.min(26, Math.max(8, h.length + 2)))], titleRows: [0], headerRows: [2], freezeRow: 3 });
      for (const k of items) {
        const a = getA(c, k, false); if (!a) continue;
        c.students.forEach((s, i) => {
          const en = a.e[s.no]; if (!en) return;
          const f = finalOf(en); if (f == null && !en.l) return;
          detail.push([c.name, k, a.title || null, i + 1, hasNo(s) ? +s.no : null, s.name, en.a ? 'G' : en.r, en.l ? 'Evet' : null, en.l ? en.p : null, f]);
        });
      }
    }
    const logRows = [['Sınıf', 'Ders', 'Tarih', 'Okul Numarası', 'Adı Soyadı', 'Kırılan puan', 'Sebep']];
    for (const c of sorted) for (const l of termLogs(c).slice().sort((x, y) => (x.date || '').localeCompare(y.date || ''))) {
      const st = c.students.find(x => x.no === l.no);
      logRows.push([c.name, c.lesson || null, fmtDate(l.date), st && hasNo(st) ? +st.no : null, st ? st.name : '', l.pts || null, l.reason || null]);
    }
    if (logRows.length > 1) sheets.push({ name: 'Puan kırma', rows: logRows, widths: [10, 16, 12, 15, 30, 12, 40], headerRows: [0], freezeRow: 1 });
    sheets.push({ name: 'Ayrıntı', rows: detail, widths: [10, 8, 18, 8, 15, 30, 9, 11, 9, 9], headerRows: [0], freezeRow: 1 });
    const blob = Excel.writeXLSX(sheets);
    const nm = list.length === 1 ? trAscii(list[0].name + (list[0].lesson ? '_' + list[0].lesson : '')) : 'Tum-Siniflar';
    shareFile(blob, `Notlar_${nm}_${db.term}-Donem_${today()}.xlsx`);
  }

  // başka bir pencere/sekme veriyi değiştirirse güncel veriyi al (birbirinin notunu silmesin)
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    try { db = Object.assign(fresh(), JSON.parse(e.newValue)); } catch (err) { return; }
    applyTheme();
    if (locked) return;
    if (view.name === 'entry') { const sc = (document.getElementById('list') || {}).scrollTop || 0; render(); const l = document.getElementById('list'); if (l) l.scrollTop = sc; }
    else if (!document.querySelector('.sheet-bg') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) render();
  });

  // ---------- sola kaydırınca "Sil" (iPhone'daki gibi) ----------
  const SW = 88; let sw = null, swipeEndAt = 0;
  function closeSwipes(except) {
    document.querySelectorAll('.swipe-c.open, .swipe.sw-on .swipe-c').forEach(el => { if (el !== except) { el.classList.remove('open'); el.style.transform = ''; const p = el.parentElement; setTimeout(() => { if (!el.classList.contains('open') && !(sw && sw.el === el)) p.classList.remove('sw-on'); }, 220); } });
  }
  app.addEventListener('pointerdown', e => {
    const c = e.target.closest('.swipe-c');
    if (e.target.closest('.swipe-del')) return;
    if (document.querySelector('.swipe-c.open') && (!c || !c.classList.contains('open'))) { closeSwipes(); swipeEndAt = Date.now(); sw = null; return; }
    if (!c) return;
    sw = { el: c, x: e.clientX, y: e.clientY, base: c.classList.contains('open') ? -SW : 0, dx: 0, active: false, id: e.pointerId };
  });
  app.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.active) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { sw.active = true; closeSwipes(sw.el); sw.el.style.transition = 'none'; sw.el.parentElement.classList.add('sw-on'); }
      else if (Math.abs(dy) > 10) { sw = null; return; }
      else return;
    }
    sw.dx = dx;
    sw.el.style.transform = `translateX(${Math.max(-SW - 30, Math.min(0, sw.base + dx))}px)`;
  });
  const swEnd = () => {
    if (!sw) return;
    const s = sw; sw = null;
    if (!s.active) { if (s.base) { closeSwipes(); swipeEndAt = Date.now(); } return; }
    s.el.style.transition = '';
    const open = s.base + s.dx < -SW / 2;
    s.el.classList.toggle('open', open); s.el.style.transform = open ? `translateX(${-SW}px)` : '';
    if (!open) setTimeout(() => { if (!s.el.classList.contains('open')) s.el.parentElement.classList.remove('sw-on'); }, 220);
    swipeEndAt = Date.now();
  };
  app.addEventListener('pointerup', swEnd); app.addEventListener('pointercancel', swEnd);
  // kaydırmanın sonundaki dokunuş sınıfı açmasın
  document.addEventListener('click', e => {
    if (Date.now() - swipeEndAt < 350 && !e.target.closest('.swipe-del')) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // ---------- başlat ----------
  if (loadWarning) setTimeout(() => ask(loadWarning, 'Tamam'), 400);
  if (db.pinHash) lock(); else render();
  try {
    if (!EMBED && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });
  } catch (e) { }
  window.__nd = { get db() { return db; } };
})();
