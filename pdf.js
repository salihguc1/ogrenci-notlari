// İmzaya hazır not çizelgesi PDF'i. Sayfalar tuvalde çizilir (Türkçe harfler sorunsuz),
// JPEG olarak PDF'e gömülür. Harici kütüphane yok, her şey eşzamanlı (iOS paylaşma için).
(function (global) {
  'use strict';
  const DPI = 200, S = DPI / 25.4;              // mm -> piksel
  let W = 210, H = 297;                         // A4 (mm), çok sütunda yatay
  const FONT = '-apple-system, "Helvetica Neue", Helvetica, Arial, "DejaVu Sans", sans-serif';
  const pt = n => n * 0.3528 * S;               // punto -> piksel
  const px = mm => mm * S;

  function font(ctx, size, bold) { ctx.font = `${bold ? '700' : '400'} ${pt(size)}px ${FONT}`; }
  function fit(ctx, text, maxW, size, bold, minSize) {
    let s = size; font(ctx, s, bold);
    while (ctx.measureText(text).width > maxW && s > (minSize || 6)) { s -= 0.25; font(ctx, s, bold); }
    if (ctx.measureText(text).width > maxW) {
      let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    }
    return text;
  }
  function textAt(ctx, text, x, y, align) { ctx.textAlign = align || 'left'; ctx.fillText(text, x, y); }
  function line(ctx, x1, y1, x2, y2, w, color) {
    ctx.strokeStyle = color || '#000'; ctx.lineWidth = px(w || 0.2);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // doc: {school, year, term, title, className, lesson, date, teacher, principal,
  //       columns:[{code, title}], rows:[{sira, no, name, vals:[...]}]}
  function renderDoc(doc) {
    const landscape = doc.columns.length > 8;
    W = landscape ? 297 : 210; H = landscape ? 210 : 297;
    const L = 14, R = 14, T = 12, B = 10;
    const sigH = 31;
    const headerBottom = 43;                       // tablonun başladığı y (mm)
    const hasTitles = doc.columns.some(c => c.title);
    const headH = hasTitles ? 10.5 : 8;
    const availLast = H - B - sigH - headerBottom - headH;
    const availMid = H - B - 8 - headerBottom - headH;
    const MIN = 5.2, MIN_ONE = 4.7, MAX = 8.5;

    // satırları sayfalara böl (tek sayfaya sığabiliyorsa biraz sıkıştır)
    const pagesRows = []; let rest = doc.rows.slice();
    if (rest.length * MIN_ONE <= availLast) pagesRows.push(rest);
    else while (true) {
      if (rest.length * MIN <= availLast) { pagesRows.push(rest); break; }
      const n = Math.max(1, Math.floor(availMid / MIN));
      pagesRows.push(rest.slice(0, n)); rest = rest.slice(n);
      if (!rest.length) { pagesRows.push([]); break; }
    }

    // sütun genişlikleri
    const usable = W - L - R;
    const nCol = doc.columns.length;
    let wGrade = nCol <= 4 ? 19 : nCol <= 6 ? 16 : Math.max(10, Math.min(16, Math.floor((usable - 11 - 18 - 60) / nCol)));
    const wSira = 11, wNo = 18;
    let wName = usable - wSira - wNo - wGrade * nCol;
    if (wName < 50) { wGrade = Math.max(8, (usable - wSira - wNo - 50) / Math.max(1, nCol)); wName = usable - wSira - wNo - wGrade * nCol; }
    const cols = [{ w: wSira, h: 'Sıra', align: 'center' }, { w: wNo, h: 'Okul No', align: 'center' }, { w: wName, h: 'Adı Soyadı', align: 'left' }]
      .concat(doc.columns.map(c => ({ w: wGrade, h: c.code, sub: c.title, align: 'center' })));

    const pages = [];
    pagesRows.forEach((rows, pi) => {
      const last = pi === pagesRows.length - 1;
      const cv = document.createElement('canvas');
      cv.width = Math.round(px(W)); cv.height = Math.round(px(H));
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';

      // başlık
      let y = T + 6;
      if (doc.school) textAt(ctx, fit(ctx, doc.school, px(usable), 14, true, 9), px(W / 2), px(y), 'center');
      y += 6.5; font(ctx, 10.5, false);
      textAt(ctx, [doc.year ? doc.year + ' Eğitim-Öğretim Yılı' : '', doc.term ? doc.term + '. Dönem' : ''].filter(Boolean).join(' · '), px(W / 2), px(y), 'center');
      y += 6.5;
      textAt(ctx, fit(ctx, doc.title, px(usable), 12, true), px(W / 2), px(y), 'center');
      y += 8.5; font(ctx, 10.5, false);
      const left = [doc.className ? 'Sınıf: ' + doc.className : '', doc.lesson ? 'Ders: ' + doc.lesson : ''].filter(Boolean).join('     ');
      textAt(ctx, left, px(L), px(y));
      textAt(ctx, 'Tarih: ' + doc.date, px(W - R), px(y), 'right');

      // tablo başlığı
      let ty = headerBottom; let x = L;
      ctx.fillStyle = '#e9e9e9'; ctx.fillRect(px(L), px(ty), px(usable), px(headH)); ctx.fillStyle = '#000';
      cols.forEach(c => {
        const cx = c.align === 'center' ? x + c.w / 2 : x + 1.8;
        if (c.sub) {
          textAt(ctx, fit(ctx, c.h, px(c.w - 2), 9.5, true, 6), px(cx), px(ty + headH / 2 - 0.4), c.align);
          textAt(ctx, fit(ctx, c.sub, px(c.w - 1.5), 7, false, 5), px(cx), px(ty + headH / 2 + 3.4), c.align);
        } else {
          textAt(ctx, fit(ctx, c.h, px(c.w - 2), 9.5, true, 6), px(cx), px(ty + headH / 2 + 1.3), c.align);
        }
        x += c.w;
      });
      ty += headH;

      // satırlar
      const avail = last ? availLast : availMid;
      const rh = rows.length ? Math.min(MAX, Math.max(pagesRows.length === 1 ? MIN_ONE : MIN, avail / Math.max(rows.length, 1))) : 0;
      const fs = Math.min(10.5, Math.max(8.5, rh * 1.35));
      rows.forEach((r, ri) => {
        if (ri % 2 === 1) { ctx.fillStyle = '#f5f5f5'; ctx.fillRect(px(L), px(ty), px(usable), px(rh)); ctx.fillStyle = '#000'; }
        let cx = L; const by = ty + rh / 2 + fs * 0.3528 * 0.36;
        const vals = [String(r.sira), r.no == null ? '' : String(r.no), r.name].concat(r.vals.map(v => v == null ? '' : String(v)));
        vals.forEach((v, ci) => {
          const c = cols[ci];
          const t = fit(ctx, v, px(c.w - 2.5), fs, ci >= 3, ci === 2 ? 7 : 6);
          textAt(ctx, t, px(c.align === 'center' ? cx + c.w / 2 : cx + 1.8), px(by), c.align);
          cx += c.w;
        });
        ty += rh;
        line(ctx, px(L), px(ty), px(W - R), px(ty), 0.15, '#9a9a9a');
      });

      // tablo çizgileri
      const top = headerBottom, bottom = ty;
      line(ctx, px(L), px(top + headH), px(W - R), px(top + headH), 0.3);
      let gx = L;
      for (let i = 0; i <= cols.length; i++) {
        const w = (i === 0 || i === cols.length) ? 0.35 : 0.15;
        line(ctx, px(gx), px(top), px(gx), px(bottom), w, i === 0 || i === cols.length ? '#000' : '#9a9a9a');
        if (i < cols.length) gx += cols[i].w;
      }
      line(ctx, px(L), px(top), px(W - R), px(top), 0.35);
      line(ctx, px(L), px(bottom), px(W - R), px(bottom), 0.35);

      // imza alanı
      if (last) {
        const sy = Math.min(bottom + 11, H - B - sigH + 4);
        [[L + usable * 0.22, 'Ders Öğretmeni', doc.teacher], [L + usable * 0.78, 'Okul Müdürü', doc.principal]].forEach(([cx, role, name]) => {
          font(ctx, 10.5, false); textAt(ctx, role, px(cx), px(sy), 'center');
          if (name) textAt(ctx, fit(ctx, name, px(70), 11, true), px(cx), px(sy + 6), 'center');
          line(ctx, px(cx - 27), px(sy + 22), px(cx + 27), px(sy + 22), 0.25);
          ctx.fillStyle = '#555'; font(ctx, 8.5, false); textAt(ctx, 'İmza', px(cx), px(sy + 26), 'center'); ctx.fillStyle = '#000';
        });
      }
      if (pagesRows.length > 1) { ctx.fillStyle = '#555'; font(ctx, 8, false); textAt(ctx, `Sayfa ${pi + 1}/${pagesRows.length}`, px(W - R), px(H - 6), 'right'); ctx.fillStyle = '#000'; }
      pages.push(cv);
    });
    return pages;
  }

  function jpegBytes(cv) {
    cv.__w = cv.width; cv.__h = cv.height;
    const url = cv.toDataURL("image/jpeg", 0.8);
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    cv.width = cv.height = 1; // belleği bırak
    return { bytes: u, w: cv.__w, h: cv.__h, landscape: cv.__w > cv.__h };
  }

  // imgs: [{bytes,w,h}] -> PDF Blob
  function buildPDF(imgs) {
    const enc = new TextEncoder(); const parts = []; const offsets = []; let pos = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; };
    const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const n = imgs.length;
    const pageIds = imgs.map((_, i) => 3 + i * 3);
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${n} >>`));
    imgs.forEach((im, i) => {
      const p = 3 + i * 3, c = p + 1, x = p + 2;
      const pw = im.landscape ? 841.89 : 595.28, ph = im.landscape ? 595.28 : 841.89;
      obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${x} 0 R >> >> /Contents ${c} 0 R >>`));
      const cs = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
      obj(c, () => { push(`<< /Length ${cs.length} >>\nstream\n`); push(cs); push('\nendstream'); });
      obj(x, () => { push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); push(im.bytes); push('\nendstream'); });
    });
    const total = 3 + n * 3; const xref = pos;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  function makePDF(docs) {
    const imgs = [];
    for (const d of docs) for (const cv of renderDoc(d)) imgs.push(jpegBytes(cv));
    return buildPDF(imgs);
  }

  global.PDF = { makePDF };
})(window);
