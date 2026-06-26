const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1TNeWPRXhzd2RTNBC-vmMPr70XoWem259QS_WTAbtvxk/gviz/tq?tqx=out:csv&gid=0';

let allRows = [];
let activeDay = 'today';
let searchText = '';
let activeStatus = 'all';
let activeFloor = 'all';
let activeBrand = 'all';

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
function statusKind(status) {
  const s = String(status || '').trim();
  if (s.includes('취소')) return 'cancel';
  if (s.includes('완료')) return 'done';
  if (s.includes('승인대기') || s === '대기') return 'pending';
  return 'normal';
}
function cleanVehicleType(v) {
  return String(v || '')
    .replace(/컨테이너/g, '')
    .replace(/container/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function floorName(v) {
  const s = String(v || '').trim();
  if (!s) return '기타';
  if (s.includes('층')) return s;
  if (/^\d+$/.test(s)) return `${s}층`;
  return s;
}
function floorRank(name) {
  const n = Number(String(name).match(/\d+/)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : 999;
}
function normalizePo(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^[0-9.]+e\+?\d+$/i.test(s)) {
    const num = Number(s);
    if (Number.isFinite(num)) return String(Math.trunc(num));
  }
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
  return s;
}
function mapRows(csvRows) {
  const header = csvRows[0].map(h => String(h).trim());
  const idx = (name) => header.findIndex(h => h === name || h.includes(name));
  const idxExact = (name) => header.findIndex(h => h === name);
  const floorIdx = idxExact('층') >= 0 ? idxExact('층') : 12; // M열
  const i = {
    id: idx('예약ID'), date: idx('날짜'), time: idx('시작시간'), floor: floorIdx, customer: idx('업체명'),
    ton: idx('차량유형'), work: idx('작업유형'), status: idx('상태'), memo: idx('메모'), po: idx('발주번호')
  };
  return csvRows.slice(1).map(r => ({
    id: r[i.id] || '',
    date: parseDateValue(r[i.date] || ''),
    time: parseTimeValue(r[i.time] || ''),
    floor: floorName(r[i.floor] || ''),
    customer: r[i.customer] || '',
    ton: cleanVehicleType(r[i.ton] || ''),
    work: r[i.work] || '',
    status: r[i.status] || '',
    kind: statusKind(r[i.status] || ''),
    memo: r[i.memo] || '',
    po: normalizePo(r[i.po] || '')
  })).filter(r => r.date && r.kind !== 'cancel');
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
function rowMatchesSearch(r) {
  const q = searchText.trim().toLowerCase();
  if (!q) return true;
  return [r.customer, r.po].some(v => String(v || '').toLowerCase().includes(q));
}
function rowMatchesStatus(r) {
  if (activeStatus === 'all') return true;
  if (activeStatus === 'done') return r.kind === 'done';
  if (activeStatus === 'pending') return r.kind === 'pending';
  if (activeStatus === 'notDone') return r.kind !== 'done' && r.kind !== 'pending';
  return true;
}
function rowMatchesFloor(r) {
  if (activeFloor === 'all') return true;
  return r.floor === activeFloor;
}
function rowMatchesBrand(r) {
  if (activeBrand === 'all') return true;
  return String(r.customer || '') === activeBrand;
}
function updateBrandOptions(dayRows) {
  const select = $('brandSelect');
  if (!select) return;
  const current = activeBrand;
  const brands = [...new Set(dayRows.map(r => String(r.customer || '').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'ko'));
  select.innerHTML = '<option value="all">브랜드 전체</option>' +
    brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  if (current !== 'all' && brands.includes(current)) {
    select.value = current;
  } else {
    activeBrand = 'all';
    select.value = 'all';
  }
}
function sortByTimeFirst(a, b) {
  return (a.time || '99:99').localeCompare(b.time || '99:99') ||
    (floorRank(a.floor) - floorRank(b.floor)) ||
    String(a.customer || '').localeCompare(String(b.customer || ''), 'ko') ||
    String(a.po || '').localeCompare(String(b.po || ''), 'ko');
}

function render() {
  updateDateLabel();
  const target = getTargetDate();
  const baseRows = allRows
    .filter(r => r.date === target)
    .filter(rowMatchesSearch);

  updateBrandOptions(baseRows);

  const dayRows = baseRows
    .filter(rowMatchesBrand)
    // 입고 리스트는 층보다 시간이 우선입니다.
    // 전체/층/상태/브랜드 필터를 눌러도 항상 시간순으로 보입니다.
    .sort(sortByTimeFirst);

  const total = dayRows.length;
  const done = dayRows.filter(r => r.kind === 'done').length;
  const pending = dayRows.filter(r => r.kind === 'pending').length;
  const notDone = Math.max(0, total - done - pending);
  $('totalCount').textContent = total;
  $('doneCount').textContent = done;
  $('notDoneCount').textContent = notDone;
  $('pendingCount').textContent = pending;

  document.querySelectorAll('.status-tab').forEach(btn => btn.classList.toggle('on', btn.dataset.filter === activeStatus));

  const statusRows = dayRows.filter(rowMatchesStatus);
  updateFloorCounts(statusRows);

  const rows = statusRows
    .filter(rowMatchesFloor)
    // 최종 표시 직전에도 한 번 더 시간순 정렬합니다.
    // 브랜드/층/상태 필터 조합과 관계없이 항상 시간순으로 보이게 하기 위함입니다.
    .sort(sortByTimeFirst);
  const list = $('list');
  list.innerHTML = '';

  if (!rows.length) {
    $('emptyState').hidden = false;
    return;
  }
  $('emptyState').hidden = true;

  const dateRow = document.createElement('div');
  dateRow.className = 'date-row';
  dateRow.textContent = `${activeDay === 'today' ? '오늘' : '내일'} 입고 · ${activeFloor === 'all' ? '전체 층' : activeFloor}`;
  list.appendChild(dateRow);

  rows.forEach((r, idx) => {
    const el = document.createElement('article');
    el.className = `item-card ${r.kind === 'done' ? 'is-done' : ''}`;
    el.style.animationDelay = `${idx * 18}ms`;
    el.innerHTML = `
      <div class="item-time">
        <strong>${escapeHtml(r.time)}</strong>
        <span>${ampm(r.time)}</span>
      </div>
      <div class="item-bar"></div>
      <div class="item-main">
        <div class="item-top">
          <div class="po">${escapeHtml(r.po || '-')}</div>
          ${statusBadge(r.kind)}
        </div>
        <div class="customer">${escapeHtml(r.customer || '-')}</div>
        <div class="meta">
          <span class="chip tone">${escapeHtml(r.ton || '-')}</span>
          <span class="chip work">${escapeHtml(r.work || '-')}</span>
          <span class="chip floor">${escapeHtml(r.floor || '-')}</span>
          <span class="chip memo">${escapeHtml(r.memo || '-')}</span>
        </div>
      </div>
    `;
    list.appendChild(el);
  });
}
function updateFloorCounts(rows) {
  const counts = { all: rows.length, '1층': 0, '2층': 0, '3층': 0, '4층': 0 };
  rows.forEach(r => {
    if (counts[r.floor] !== undefined) counts[r.floor]++;
  });
  document.querySelectorAll('.floor-tab').forEach(btn => {
    const key = btn.dataset.floor;
    btn.querySelector('em').textContent = counts[key] ?? 0;
    btn.classList.toggle('on', key === activeFloor);
  });
}
function ampm(t) {
  const h = Number(String(t || '0').split(':')[0]);
  return h < 12 ? 'AM' : 'PM';
}
function statusBadge(kind) {
  if (kind === 'done') return '<span class="badge done">완료</span>';
  if (kind === 'pending') return '<span class="badge pending">승인대기</span>';
  return '<span class="badge normal">미입고</span>';
}
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function moveDayThumb() {
  const seg = $('daySeg');
  const thumb = $('dayThumb');
  const btn = seg.querySelector('button.on');
  if (!btn) return;
  thumb.style.width = `${btn.offsetWidth}px`;
  thumb.style.transform = `translateX(${btn.offsetLeft - 4}px)`;
}
async function refresh() {
  const btn = $('refreshBtn');
  try {
    btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin');
    await loadSheet();
    render();
  } catch (e) {
    $('errorState').textContent = e.message;
    $('errorState').hidden = false;
  }
}

// events
document.querySelectorAll('#daySeg button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('#daySeg button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  activeDay = btn.dataset.day;
  moveDayThumb();
  render();
}));
document.querySelectorAll('.status-tab').forEach(btn => btn.addEventListener('click', () => {
  activeStatus = btn.dataset.filter || 'all';
  render();
}));
document.querySelectorAll('.floor-tab').forEach(btn => btn.addEventListener('click', () => {
  activeFloor = btn.dataset.floor || 'all';
  render();
}));
$('searchToggle').addEventListener('click', () => {
  const box = $('searchBox');
  box.hidden = !box.hidden;
  if (!box.hidden) $('searchInput').focus();
});
$('searchInput').addEventListener('input', e => { searchText = e.target.value; render(); });
$('brandSelect')?.addEventListener('change', e => {
  activeBrand = e.target.value || 'all';
  render();
});
$('refreshBtn').addEventListener('click', refresh);
window.addEventListener('resize', moveDayThumb);

if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveDayThumb);
moveDayThumb();
refresh();
