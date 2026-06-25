const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1TNeWPRXhzd2RTNBC-vmMPr70XoWem259QS_WTAbtvxk/gviz/tq?tqx=out:csv&gid=0';
const BRAND_ORDER = ['파인우드', '오가렌', '레어로우', '빌라레코드', '보블릭'];

let allRows = [];
let activeDay = 'today';
let searchText = '';

const $ = (id) => document.getElementById(id);

function todayLocal(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}
function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function mdLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}(${['일','월','화','수','목','금','토'][date.getDay()]})`;
}
function parseDateValue(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m1 = s.match(/(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2,'0')}-${m1[3].padStart(2,'0')}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return ymd(d);
  return s;
}
function parseTimeValue(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/(\d{1,2})[:시]\s*(\d{1,2})?/);
  if (m) return `${m[1].padStart(2,'0')}:${String(m[2] || '00').padStart(2,'0')}`;
  return s;
}
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"') {
      if (quote && next === '"') { cur += '"'; i++; }
      else quote = !quote;
    } else if (ch === ',' && !quote) {
      row.push(cur); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !quote) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function normalizeBrand(name) {
  const s = String(name || '').trim();
  for (const b of BRAND_ORDER) if (s.includes(b)) return b;
  return s || '기타';
}
function statusKind(status) {
  const s = String(status || '').trim();
  if (s.includes('취소')) return 'cancel';
  if (s.includes('완료')) return 'done';
  if (s.includes('승인대기') || s === '대기') return 'pending';
  return 'normal';
}
function mapRows(csvRows) {
  const header = csvRows[0].map(h => String(h).trim());
  const idx = (name) => header.findIndex(h => h === name || h.includes(name));
  const i = {
    id: idx('예약ID'), date: idx('날짜'), time: idx('시작시간'), brand: idx('업체명'),
    ton: idx('차량유형'), work: idx('작업유형'), status: idx('상태'), memo: idx('메모'), po: idx('발주번호')
  };
  return csvRows.slice(1).map(r => ({
    id: r[i.id] || '',
    date: parseDateValue(r[i.date] || ''),
    time: parseTimeValue(r[i.time] || ''),
    brandRaw: r[i.brand] || '',
    brand: normalizeBrand(r[i.brand] || ''),
    ton: r[i.ton] || '',
    work: r[i.work] || '',
    status: r[i.status] || '',
    kind: statusKind(r[i.status] || ''),
    memo: r[i.memo] || '',
    po: r[i.po] || ''
  })).filter(r => r.date && r.brand && r.kind !== 'cancel');
}
async function loadSheet() {
  $('errorState').hidden = true;
  const res = await fetch(`${SHEET_CSV_URL}&_=${Date.now()}`);
  if (!res.ok) throw new Error('시트 데이터를 읽지 못했습니다. 공유 권한과 CSV 접근을 확인해 주세요.');
  const text = await res.text();
  allRows = mapRows(parseCsv(text));
}
function getTargetDate() {
  return activeDay === 'today' ? ymd(todayLocal(0)) : ymd(todayLocal(1));
}
function updateDateLabel() {
  const d = activeDay === 'today' ? todayLocal(0) : todayLocal(1);
  $('dateLabel').textContent = `${activeDay === 'today' ? '오늘' : '내일'} ${mdLabel(d)}`;
}
function rowMatches(r) {
  const q = searchText.trim().toLowerCase();
  if (!q) return true;
  return [r.brandRaw, r.brand, r.po, r.memo, r.ton, r.work].some(v => String(v || '').toLowerCase().includes(q));
}
function sortBrands(keys) {
  return keys.sort((a,b) => {
    const ia = BRAND_ORDER.indexOf(a), ib = BRAND_ORDER.indexOf(b);
    const ra = ia === -1 ? 999 : ia, rb = ib === -1 ? 999 : ib;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, 'ko');
  });
}
function render() {
  updateDateLabel();
  const target = getTargetDate();
  const rows = allRows.filter(r => r.date === target).filter(rowMatches)
    .sort((a,b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  const total = rows.length;
  const done = rows.filter(r => r.kind === 'done').length;
  const pending = rows.filter(r => r.kind === 'pending').length;
  const notDone = Math.max(0, total - done - pending);
  $('totalCount').textContent = `${total}건`;
  $('doneCount').textContent = `${done}건`;
  $('notDoneCount').textContent = `${notDone}건`;
  $('pendingCount').textContent = `${pending}건`;

  const groups = {};
  for (const r of rows) (groups[r.brand] ||= []).push(r);
  const keys = sortBrands(Object.keys(groups));
  const wrap = $('brandList');
  wrap.innerHTML = '';

  for (const brand of keys) {
    const arr = groups[brand];
    const brandDone = arr.filter(r => r.kind === 'done').length;
    const card = document.createElement('article');
    card.className = 'brand-card';
    card.innerHTML = `
      <div class="brand-head brand-${brand}">
        <div class="brand-title">${escapeHtml(brand)}</div>
        <div class="brand-progress">완료 ${brandDone} / ${arr.length} ▾</div>
      </div>
      <div class="brand-body">
        <div class="row header"><div>시간</div><div>발주번호</div><div>톤수</div><div>작업</div><div>메모</div><div>상태</div></div>
        ${arr.map(r => `
          <div class="row ${r.kind === 'done' ? 'done' : ''}">
            <div class="time">${escapeHtml(r.time)}</div>
            <div class="po">${escapeHtml(r.po)}</div>
            <div>${escapeHtml(r.ton)}</div>
            <div>${escapeHtml(r.work)}</div>
            <div class="memo">${escapeHtml(r.memo || '')}</div>
            <div>${statusBadge(r.kind)}</div>
          </div>`).join('')}
      </div>`;
    card.querySelector('.brand-head').addEventListener('click', () => {
      const body = card.querySelector('.brand-body');
      body.hidden = !body.hidden;
    });
    wrap.appendChild(card);
  }
  $('emptyState').hidden = rows.length !== 0;
}
function statusBadge(kind) {
  if (kind === 'done') return '<span class="status-badge">✅ 완료</span>';
  if (kind === 'pending') return '<span class="status-badge status-pending">⚠ 승인대기</span>';
  return '<span class="status-normal">-</span>';
}
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
async function refresh() {
  try { await loadSheet(); render(); }
  catch (e) { $('errorState').textContent = e.message; $('errorState').hidden = false; }
}

document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeDay = btn.dataset.day;
  render();
}));
$('searchInput').addEventListener('input', e => { searchText = e.target.value; render(); });
$('refreshBtn').addEventListener('click', refresh);
refresh();
