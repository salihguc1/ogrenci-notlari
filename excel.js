// Excel okuma (.xls BIFF8, .xlsx) ve yazma (.xlsx) — harici kütüphane yok.
(function (global) {
  'use strict';

  // ---------- .xls (OLE / BIFF8) okuma ----------
  function readCFB(buf) {
    const u8 = new Uint8Array(buf);
    const bad = () => { throw new Error('Dosya bozuk ya da yarım. e-Okul\'dan yeniden indirmeyi deneyin.'); };
    if (u8.length < 512) bad();
    const dv = new DataView(buf);
    const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    for (let i = 0; i < 8; i++) if (u8[i] !== sig[i]) throw new Error('Bu dosya eski Excel (.xls) biçiminde değil.');
    const secShift = dv.getUint16(30, true), miniShift = dv.getUint16(32, true);
    if ((secShift !== 9 && secShift !== 12) || miniShift !== 6) bad();
    const secSize = 1 << secShift, miniSize = 1 << miniShift;
    const nSec = Math.floor((u8.length - secSize) / secSize) + 1;      // dosyadaki sektör sayısı (üst sınır)
    const numFat = dv.getUint32(44, true);
    const dirStart = dv.getUint32(48, true);
    const miniCutoff = dv.getUint32(56, true);
    const miniFatStart = dv.getUint32(60, true);
    let difStart = dv.getUint32(68, true);
    const numDif = dv.getUint32(72, true);
    if (numFat === 0 || numFat > nSec || numDif > nSec) bad();
    const END = 0xfffffffa;
    const secOff = s => (s + 1) * secSize;
    const okSec = s => s < nSec && secOff(s) + secSize <= u8.length;

    const fatSecs = [];
    for (let i = 0; i < 109 && fatSecs.length < numFat; i++) fatSecs.push(dv.getUint32(76 + i * 4, true));
    const seenDif = new Set();
    for (let k = 0; k < numDif && difStart < END && fatSecs.length < numFat; k++) {
      if (!okSec(difStart) || seenDif.has(difStart)) bad(); seenDif.add(difStart);
      const o = secOff(difStart);
      for (let i = 0; i < secSize / 4 - 1 && fatSecs.length < numFat; i++) fatSecs.push(dv.getUint32(o + i * 4, true));
      difStart = dv.getUint32(o + secSize - 4, true);
    }
    const fat = [];
    for (const s of fatSecs) {
      if (!okSec(s)) bad();
      const o = secOff(s);
      for (let i = 0; i < secSize / 4; i++) fat.push(dv.getUint32(o + i * 4, true));
    }
    const chain = (start, tbl, limit) => {
      const out = []; const seen = new Set(); let s = start;
      while (s < END) {
        if (s >= tbl.length || seen.has(s) || out.length > limit) bad();
        seen.add(s); out.push(s); s = tbl[s];
      }
      return out;
    };
    const readStream = start => {
      const ch = chain(start, fat, nSec);
      const out = new Uint8Array(ch.length * secSize);
      ch.forEach((s, i) => { if (!okSec(s)) bad(); out.set(u8.subarray(secOff(s), secOff(s) + secSize), i * secSize); });
      return out;
    };
    const dir = readStream(dirStart);
    const entries = [];
    for (let o = 0; o + 128 <= dir.length; o += 128) {
      const nl = Math.min(64, dir[o + 64] | (dir[o + 65] << 8));
      let name = '';
      for (let i = 0; i < nl / 2 - 1; i++) name += String.fromCharCode(dir[o + i * 2] | (dir[o + i * 2 + 1] << 8));
      const d = new DataView(dir.buffer, o, 128);
      entries.push({ name, type: dir[o + 66], start: d.getUint32(116, true), size: d.getUint32(120, true) });
    }
    if (!entries.length) bad();
    return function get(name) {
      const e = entries.find(x => x.name.toLowerCase() === name.toLowerCase() && x.type === 2);
      if (!e) return null;
      if (e.size > u8.length) bad();
      if (e.size < miniCutoff) {
        const mini = readStream(entries[0].start);
        const mfRaw = miniFatStart < END ? readStream(miniFatStart) : new Uint8Array(0);
        const mfat = [];
        for (let i = 0; i + 4 <= mfRaw.length; i += 4) mfat.push(new DataView(mfRaw.buffer).getUint32(i, true));
        const ch = chain(e.start, mfat, mini.length / miniSize + 1);
        const out = new Uint8Array(ch.length * miniSize);
        ch.forEach((s, i) => { if ((s + 1) * miniSize > mini.length) bad(); out.set(mini.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize); });
        return out.subarray(0, e.size);
      }
      return readStream(e.start).subarray(0, e.size);
    };
  }

  function rkValue(v) {
    let n;
    if (v & 2) n = (v | 0) >> 2;
    else {
      const b = new DataView(new ArrayBuffer(8));
      b.setUint32(0, 0, true);
      b.setUint32(4, v & 0xfffffffc, true);
      n = b.getFloat64(0, true);
    }
    return (v & 1) ? n / 100 : n;
  }

  function parseSST(segs) {
    let si = 0, off = 0, seg = segs[0];
    const next = () => { si++; seg = segs[si]; off = 0; if (!seg) throw new Error('eof'); };
    const u8 = () => { if (off >= seg.length) next(); return seg[off++]; };
    const u16 = () => u8() | (u8() << 8);
    const u32 = () => (u16() | (u16() << 16)) >>> 0;
    const skip = n => { while (n > 0) { if (off >= seg.length) next(); const k = Math.min(n, seg.length - off); off += k; n -= k; } };
    const out = [];
    try {
      u32(); const cnt = Math.min(u32(), 2000000);
      for (let i = 0; i < cnt; i++) {
        const cch = u16(); const flags = u8();
        let high = flags & 1;
        const runs = (flags & 8) ? u16() : 0;
        const ext = (flags & 4) ? u32() : 0;
        let s = '', left = cch;
        while (left > 0) {
          if (off >= seg.length || (high && seg.length - off < 2)) { next(); high = seg[off++] & 1; }
          const avail = high ? Math.floor((seg.length - off) / 2) : seg.length - off;
          const n = Math.min(left, avail);
          if (n <= 0) throw new Error('eof');
          for (let k = 0; k < n; k++) {
            if (high) { s += String.fromCharCode(seg[off] | (seg[off + 1] << 8)); off += 2; }
            else { s += String.fromCharCode(seg[off]); off += 1; }
          }
          left -= n;
        }
        skip(runs * 4 + ext);
        out.push(s);
      }
    } catch (e) { /* yarım SST: okunabilenleri döndür */ }
    return out;
  }

  function readXLS(buf) {
    const get = readCFB(buf);
    const wb = get('Workbook') || get('Book');
    if (!wb) throw new Error('Excel çalışma kitabı bulunamadı.');
    const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    const sheets = [];
    let cur = null, sst = [], p = 0, sstSegs = null, lastType = 0;
    const set = (r, c, v) => { if (!cur || r > 65535 || c > 255) return; (cur[r] = cur[r] || [])[c] = v; };
    while (p + 4 <= wb.length) {
      const type = dv.getUint16(p, true), len = dv.getUint16(p + 2, true);
      const d = wb.subarray(p + 4, p + 4 + len);
      const ddv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      p += 4 + len;
      if (type === 0x003c && lastType === 0x00fc) { sstSegs.push(d); continue; }
      if (sstSegs) { sst = parseSST(sstSegs); sstSegs = null; }
      lastType = type;
      switch (type) {
        case 0x0809: if (len >= 4 && ddv.getUint16(2, true) === 0x10) { cur = []; sheets.push(cur); } else if (ddv.getUint16(2, true) !== 0x5) cur = null; break;
        case 0x000a: break;
        case 0x00fc: sstSegs = [d]; break;
        case 0x00fd: set(ddv.getUint16(0, true), ddv.getUint16(2, true), sst[ddv.getUint32(6, true)]); break;
        case 0x0203: set(ddv.getUint16(0, true), ddv.getUint16(2, true), ddv.getFloat64(6, true)); break;
        case 0x027e: set(ddv.getUint16(0, true), ddv.getUint16(2, true), rkValue(ddv.getUint32(6, true))); break;
        case 0x00bd: {
          const r = ddv.getUint16(0, true); let c = ddv.getUint16(2, true);
          for (let o = 4; o + 6 <= len - 2; o += 6) set(r, c++, rkValue(ddv.getUint32(o + 2, true)));
          break;
        }
        case 0x0204: {
          const cch = ddv.getUint16(6, true), high = d[8] & 1; let s = '';
          for (let k = 0; k < cch; k++) s += high ? String.fromCharCode(d[9 + k * 2] | (d[10 + k * 2] << 8)) : String.fromCharCode(d[9 + k]);
          set(ddv.getUint16(0, true), ddv.getUint16(2, true), s); break;
        }
        case 0x0006: if (!(d[12] === 0xff && d[13] === 0xff)) set(ddv.getUint16(0, true), ddv.getUint16(2, true), ddv.getFloat64(6, true)); break;
      }
    }
    if (sstSegs) sst = parseSST(sstSegs);
    return sheets;
  }

  // ---------- .xlsx okuma ----------
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Dosya okunamadı.');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + el + cl;
      const ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = u8.subarray(ds, ds + csize);
      files[name] = { method, raw };
    }
    const get = async name => {
      const f = files[name]; if (!f) return null;
      if (f.method === 0) return new TextDecoder().decode(f.raw);
      if (typeof DecompressionStream === 'undefined') throw new Error('Bu iPhone .xlsx dosyasını açamıyor (iOS 16.4 veya üstü gerekiyor). Dosyayı Excel\'de .xls ya da .csv olarak kaydedin, ya da listeyi "Elle sınıf oluştur"a yapıştırın.');
      const stream = new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    };
    get.names = Object.keys(files);
    return get;
  }

  async function readXLSX(buf) {
    const get = await unzip(buf);
    const xml = s => new DOMParser().parseFromString(s, 'application/xml');
    const ss = [];
    const sst = await get('xl/sharedStrings.xml');
    if (sst) for (const si of xml(sst).getElementsByTagName('si')) {
      let t = ''; for (const x of si.getElementsByTagName('t')) t += x.textContent; ss.push(t);
    }
    const sheets = [];
    const sheetFiles = get.names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    for (const sf of sheetFiles) {
      const s = await get(sf); if (!s) continue;
      const rows = [];
      for (const c of xml(s).getElementsByTagName('c')) {
        const ref = c.getAttribute('r') || ''; const m = ref.match(/^([A-Z]+)(\d+)$/); if (!m) continue;
        let col = 0; for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
        const r = +m[2] - 1, t = c.getAttribute('t');
        if (r > 100000 || col > 1000) continue;
        let v;
        if (t === 'inlineStr') { v = ''; for (const x of c.getElementsByTagName('t')) v += x.textContent; }
        else { const vEl = c.getElementsByTagName('v')[0]; if (!vEl) continue; v = vEl.textContent; if (t === 's') v = ss[+v]; else if (t !== 'str' && t !== 'b' && v !== '' && !isNaN(v)) v = +v; }
        (rows[r] = rows[r] || [])[col - 1] = v;
      }
      sheets.push(rows);
    }
    return sheets;
  }

  function decodeText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1254').decode(buf); }
  }
  function readHTML(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const own = (el, sel) => Array.from(el.querySelectorAll(sel)).filter(x => x.closest('table') === el.closest('table') || x.parentElement.closest('table') === el);
    return Array.from(doc.querySelectorAll('table')).map(t => Array.from(t.querySelectorAll('tr')).filter(tr => tr.closest('table') === t).map(tr =>
      Array.from(tr.children).filter(td => /^(TD|TH)$/.test(td.tagName)).map(td => {
        const c = td.cloneNode(true); c.querySelectorAll('table').forEach(x => x.remove());
        const v = c.textContent.replace(/\s+/g, ' ').trim(); return v === '' ? undefined : v;
      })));
  }
  function readCSV(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const sample = lines.slice(0, 20).join('\n');
    const delim = [';', '\t', ','].map(d => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const splitLine = l => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
        else if (ch === delim) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map(v => { v = v.trim(); return v === '' ? undefined : v; });
    };
    return [lines.map(splitLine)];
  }

  async function readAny(file) {
    try { return await readAnyInner(file); }
    catch (e) {
      if (e && e.constructor === Error) throw e;  // kendi Türkçe mesajlarımız
      throw new Error('Dosya bozuk ya da okunamadı. e-Okul\'dan yeniden indirmeyi deneyin.');
    }
  }
  async function readAnyInner(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if (u8[0] === 0xd0 && u8[1] === 0xcf) return readXLS(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return readXLSX(buf);
    const text = decodeText(buf);
    if (/<table[\s>]/i.test(text)) return readHTML(text);
    if (/[;,\t]/.test(text) && /\p{L}/u.test(text) && !/[\x00-\x08]/.test(text.slice(0, 2000))) return readCSV(text);
    throw new Error('Bu dosya okunamadı. e-Okul\'dan indirdiğiniz .xls/.xlsx dosyasını ya da bir .csv dosyası seçin.');
  }

  // Satırlardan öğrenci listelerini (blokları) çıkar
  function findLists(sheets) {
    const lists = [];
    const isInt = v => typeof v === 'number' ? (Number.isInteger(v) && v >= 0 && v < 1e9) : (typeof v === 'string' && /^\s*\d{1,9}\s*$/.test(v));
    const isName = v => typeof v === 'string' && (v.match(/\p{L}/gu) || []).length >= 2 && v.trim().length > 2 && !/^\s*[\d.,+eE-]+\s*$/.test(v);
    const isPart = v => typeof v === 'string' && /^[\p{L} .'’-]+$/u.test(v.trim()) && v.trim().length >= 2 && !/^(erkek|kız|kiz|e|k|bay|bayan)$/i.test(v.trim());
    for (const rows of sheets) {
      let cur = null, gap = 0, split = false;
      for (let r = 0; r < rows.length; r++) {
        const cells = (rows[r] || []).map(x => (x === undefined || x === null || x === '') ? undefined : x).filter(x => x !== undefined);
        // başlıkta "Adı" ve "Soyadı" ayrı sütunsa iki hücreyi birleştir
        if (cells.some(v => typeof v === 'string' && /^soyad[ıi]?$/i.test(v.trim()))) split = true;
        const nm = i => (split && isPart(cells[i]) && isPart(cells[i + 1])) ? cells[i].trim() + ' ' + cells[i + 1].trim() : String(cells[i]).trim();
        let st = null;
        if (cells.length >= 3 && isInt(cells[0]) && isInt(cells[1]) && isName(cells[2])) st = { sira: +cells[0], no: String(+cells[1]), name: nm(2) };
        else if (cells.length >= 2 && isInt(cells[0]) && isName(cells[1])) st = { sira: null, no: String(+cells[0]), name: nm(1) };
        if (st) {
          if (!cur || gap > 2 || (st.sira === 1 && cur.students.length > 0)) { cur = { students: [] }; lists.push(cur); }
          if (!cur.students.some(x => x.no === st.no)) cur.students.push({ no: st.no, name: st.name.replace(/[\u200B-\u200F\u2060\uFEFF\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr') });
          gap = 0;
        } else if (cells.length) gap++;
      }
    }
    return lists.filter(l => l.students.length > 0);
  }

  // ---------- .xlsx yazma ----------
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function zip(files) {
    const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
    const now = new Date();
    const dtime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const ddate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const [name, content] of files) {
      const nb = enc.encode(name), data = enc.encode(content), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dtime, true); h.setUint16(12, ddate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nb, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dtime, true); c.setUint16(14, ddate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), nb);
      offset += 30 + nb.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const esc = s => String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  // sheets: [{name, rows: [[cell...]], widths:[..], boldRows:[rowIndex...]}]; cell: string|number|null
  function writeXLSX(sheets) {
    const files = [];
    const used = new Set();
    const names = sheets.map(s => {
      let n = String(s.name).replace(/[\x00-\x1F]/g, '').replace(/[\\\/\?\*\[\]:]/g, '-').replace(/^'+|'+$/g, '').slice(0, 31).trim() || 'Sayfa';
      let base = n, k = 2; while (used.has(n.toLowerCase())) n = base.slice(0, 28) + ' ' + k++;
      used.add(n.toLowerCase()); return n;
    });
    files.push(['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>']);
    files.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
    files.push(['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>']);
    files.push(['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    files.push(['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']);
    sheets.forEach((s, i) => {
      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      if (s.freezeRow) x += `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${s.freezeRow}" topLeftCell="A${s.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
      if (s.widths) x += '<cols>' + s.widths.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
      x += '<sheetData>';
      s.rows.forEach((row, r) => {
        if (!row) return;
        const style = (s.plainFrom != null && r >= s.plainFrom) ? (r === s.plainFrom + 2 ? 1 : 0) : (s.titleRows || []).includes(r) ? 1 : (s.headerRows || []).includes(r) ? 2 : (r > (s.headerRows || [-1])[0] && (s.headerRows || []).length ? 3 : 0);
        x += `<row r="${r + 1}">`;
        row.forEach((v, c) => {
          const ref = colName(c) + (r + 1); const st = style ? ` s="${style}"` : '';
          if (v === null || v === undefined || v === '') { if (style >= 2) x += `<c r="${ref}"${st}/>`; return; }
          if (typeof v === 'number') x += `<c r="${ref}"${st}><v>${v}</v></c>`;
          else x += `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        });
        x += '</row>';
      });
      x += '</sheetData></worksheet>';
      files.push([`xl/worksheets/sheet${i + 1}.xml`, x]);
    });
    return zip(files);
  }

  global.Excel = { readAny, readXLS, readXLSX, findLists, writeXLSX };
})(typeof window !== 'undefined' ? window : globalThis);
