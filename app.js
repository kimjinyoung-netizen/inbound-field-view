const cfg = window.APP_CONFIG;
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/gviz/tq?tqx=out:csv&gid=${cfg.gid}`;

const els = {
  board: document.getElementById('board'),
  empty: document.getElementById('empty'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  dateLabel: document.getElementById('dateLabel'),
  searchInput: document.getElementById('searchInput'),
  refreshBtn: document.getElementById('refreshBtn'),
  todayBtn: document.getElementById('todayBtn'),
  tomorrowBtn: document.getElementById('tomorrowBtn'),
  totalCount: document.getElementById('totalCount'),
  doneCount: document.getElementById('doneCount'),
  notDoneCount: document.getElementById('notDoneCount'),
  waitingCount: document.getElementById('waitingCount')
};

let allRows = [];
let selectedDay = 'today';
let collapsed = new Set();

function pad(n){ return String(n).padStart(2,'0'); }
function localDate(offset=0){
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function displayDate(ymd){
  const [y,m,d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}
function normalizeDate(v){
  if(!v) return '';
  const s = String(v).trim();
  if(/^\d{4}-\d{1,2}-\d{1,2}/.test(s)){
    const [y,m,d] = s.split(/[ T]/)[0].split('-');
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  if(/^\d{4}\.\s?\d{1,2}\.\s?\d{1,2}/.test(s)){
    const [y,m,d] = s.replace(/\s/g,'').split('.').filter(Boolean);
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  if(/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)){
    const [y,m,d] = s.split('/');
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  const dt = new Date(s);
  if(!isNaN(dt)) return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  return s;
}
function normalizeTime(v){
  if(!v) return '';
  const s = String(v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if(m) return `${pad(m[1])}:${m[2]}`;
  return s;
}
function clean(v){ return (v ?? '').toString().trim(); }
function isDone(status){ return clean(status).includes('완료'); }
function isWaiting(status){ return clean(status).includes('승인대기'); }
function isCancel(status){ return clean(status).includes('취소'); }

function parseCSV(text){
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i], next = text[i+1];
    if(ch === '"'){
      if(inQuotes && next === '"'){ cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if(ch === ',' && !inQuotes){ row.push(cell); cell=''; }
    else if((ch === '\n' || ch === '\r') && !inQuotes){
      if(ch === '\r' && next === '\n') i++;
      row.push(cell); cell='';
      if(row.some(c => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if(row.some(c => c !== '')) rows.push(row);
  return rows;
}

function toObjects(rows){
  if(!rows.length) return [];
  const header = rows[0].map(h => clean(h));
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h,i)=> obj[h] = clean(r[i]));
    return {
      id: obj['예약ID'],
      date: normalizeDate(obj['날짜']),
      time: normalizeTime(obj['시작시간']),
      dock: obj['도크번호'],
      brandCode: obj['업체코드'],
      brand: obj['업체명'] || '기타',
      ton: obj['차량유형'],
      work: obj['작업유형'],
      status: obj['상태'],
      memo: obj['메모'],
      orderNo: obj['발주번호']
    };
  }).filter(r => r.date && r.brand);
}

async function loadSheet(){
  showLoading(true);
  els.error.classList.add('hidden');
  try{
    const res = await fetch(`${SHEET_URL}&cacheBust=${Date.now()}`);
    if(!res.ok) throw new Error(`시트 조회 실패 (${res.status})`);
    const text = await res.text();
    allRows = toObjects(parseCSV(text));
    render();
  }catch(err){
    console.error(err);
    els.error.textContent = '시트 데이터를 읽지 못했습니다. 시트 공유 권한 또는 CSV 접근 설정을 확인해 주세요.';
    els.error.classList.remove('hidden');
  }finally{ showLoading(false); }
}

function targetDate(){ return selectedDay === 'today' ? localDate(0) : localDate(1); }
function applyFilter(){
  const q = els.searchInput.value.trim().toLowerCase();
  const d = targetDate();
  return allRows
    .filter(r => r.date === d)
    .filter(r => !isCancel(r.status))
    .filter(r => {
      if(!q) return true;
      return [r.brand, r.orderNo, r.memo, r.ton, r.work].some(v => clean(v).toLowerCase().includes(q));
    })
    .sort((a,b)=> (a.time || '').localeCompare(b.time || '') || (a.brand || '').localeCompare(b.brand || ''));
}

function groupByBrand(rows){
  const map = new Map();
  rows.forEach(r => {
    const brand = r.brand || '기타';
    if(!map.has(brand)) map.set(brand, []);
    map.get(brand).push(r);
  });
  const fixed = cfg.brandOrder.filter(b => map.has(b));
  const rest = [...map.keys()].filter(b => !cfg.brandOrder.includes(b)).sort((a,b)=>a.localeCompare(b,'ko'));
  return [...fixed, ...rest].map(brand => [brand, map.get(brand)]);
}

function render(){
  const rows = applyFilter();
  const total = rows.length;
  const done = rows.filter(r => isDone(r.status)).length;
  const waiting = rows.filter(r => isWaiting(r.status)).length;
  const notDone = rows.filter(r => !isDone(r.status)).length;

  els.totalCount.textContent = `${total}건`;
  els.doneCount.textContent = `${done}건`;
  els.notDoneCount.textContent = `${notDone}건`;
  els.waitingCount.textContent = `${waiting}건`;

  const d = targetDate();
  els.dateLabel.textContent = `${selectedDay === 'today' ? '오늘' : '내일'} ${displayDate(d)}`;

  els.board.innerHTML = '';
  els.empty.classList.toggle('hidden', rows.length > 0);
  if(!rows.length) return;

  groupByBrand(rows).forEach(([brand, items]) => {
    const doneCount = items.filter(r => isDone(r.status)).length;
    const color = cfg.brandColors[brand] || cfg.brandColors['기타'];
    const card = document.createElement('section');
    card.className = 'brand-card';
    const isClosed = collapsed.has(brand);
    card.innerHTML = `
      <div class="brand-head" data-brand="${escapeHtml(brand)}">
        <div class="brand-title"><span class="brand-dot" style="background:${color}"></span>${escapeHtml(brand)}</div>
        <div class="brand-progress">완료 ${doneCount} / ${items.length}<span class="caret">${isClosed ? '▶' : '▼'}</span></div>
      </div>
      <div class="table-wrap ${isClosed ? 'hidden' : ''}">
        <table>
          <thead><tr><th>시간</th><th>발주번호</th><th>톤수</th><th>작업유형</th><th>메모</th><th></th></tr></thead>
          <tbody>${items.map(rowHtml).join('')}</tbody>
        </table>
      </div>`;
    els.board.appendChild(card);
  });
}

function rowHtml(r){
  const done = isDone(r.status);
  const waiting = isWaiting(r.status);
  let badge = '';
  if(done) badge = '<span class="badge done">✅ 완료</span>';
  else if(waiting) badge = '<span class="badge wait">⚠ 승인대기</span>';
  return `<tr class="${done ? 'done-row' : ''}">
    <td class="time">${escapeHtml(r.time)}</td>
    <td class="order">${escapeHtml(r.orderNo)}</td>
    <td>${escapeHtml(r.ton)}</td>
    <td>${escapeHtml(r.work)}</td>
    <td class="memo">${escapeHtml(r.memo)}</td>
    <td class="status">${badge}</td>
  </tr>`;
}
function escapeHtml(v){
  return clean(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function showLoading(on){ els.loading.classList.toggle('hidden', !on); }

els.todayBtn.addEventListener('click', () => setDay('today'));
els.tomorrowBtn.addEventListener('click', () => setDay('tomorrow'));
els.refreshBtn.addEventListener('click', loadSheet);
els.searchInput.addEventListener('input', render);
els.board.addEventListener('click', (e) => {
  const head = e.target.closest('.brand-head');
  if(!head) return;
  const brand = head.dataset.brand;
  if(collapsed.has(brand)) collapsed.delete(brand); else collapsed.add(brand);
  render();
});
function setDay(day){
  selectedDay = day;
  els.todayBtn.classList.toggle('active', day === 'today');
  els.tomorrowBtn.classList.toggle('active', day === 'tomorrow');
  render();
}

loadSheet();
