'use strict';
const $ = id => document.getElementById(id);
const GUIDE_MS = 5000;
const PASS_SCORE = 0.65;
const font = '440px "Hiragino Sans", "Yu Gothic", Meiryo, "Noto Sans CJK JP", sans-serif';
let session, completion;

function show(id) {
 for (const screen of ['welcome', 'menu', 'game', 'result']) $(screen).hidden = screen !== id;
 window.scrollTo(0, 0);
}

const percent = value => new Intl.NumberFormat(lang, {style:'percent', maximumFractionDigits:1}).format(value);
const unitName = id => id === 'all' ? t('all') : t('unit', {n:Number(id) + 1});
function options(select, items) {
 const previous = select.value;
 select.replaceChildren(...items.map(([id,text]) => new Option(text,id)));
 if (items.some(([id]) => id === previous)) select.value = previous;
}

function questions(unit, mode) {
 const selection = unit === 'all' ? units : [units[Number(unit)]];
 return selection.flatMap(([, words]) =>
  words.map(([answer,prompt,en,th]) => ({answer,prompt,en,th}))
 );
}

function updateCount() {
 const mode = $('mode').value;
 const count = questions($('unit').value, mode).length;
 $('count').textContent = t('count', {n:mode === 'random' ? Math.min(10,count) : count});
}

function applyLanguage() {
 document.documentElement.lang = lang;
 document.title = t('brand');
 $('language').value = lang;
 for (const element of document.querySelectorAll('[data-t]')) element.textContent = t(element.dataset.t);
 options($('unit'), units.map((_, i) => [String(i),unitName(String(i))]).concat([['all',unitName('all')]]));
 options($('mode'), ['words','random'].map(mode => [mode,t(mode)]));
 updateCount();
 if (session && !$('game').hidden) refreshQuestion();
 if (completion && !$('result').hidden) renderCertificate();
}

function setLanguage(value) {
 lang = value;
 try { localStorage.setItem('minna-kanji-language',value); } catch {}
 applyLanguage();
}

function openMenu() {
 session?.boards.forEach(board => board.hideGuide());
 session = null;
 completion = null;
 resetSavedImage();
 show('menu');
}

$('language-start').onclick = event => {
 const button = event.target.closest('[data-lang]');
 if (!button) return;
 setLanguage(button.dataset.lang);
 $('language').hidden = $('home').hidden = false;
 openMenu();
};
$('language').onchange = () => {
 resetSavedImage();
 setLanguage($('language').value);
};
$('unit').onchange = $('mode').onchange = updateCount;
$('home').onclick = $('back').onclick = $('again').onclick = openMenu;
$('student-name').oninput = () => $('student-name').setCustomValidity('');
$('name-form').onsubmit = event => {
 event.preventDefault();
 const input = $('student-name');
 const name = input.value.trim();
 if (!name) {
  input.setCustomValidity(t('name'));
  input.reportValidity();
  return;
 }
 const unit = $('unit').value;
 const mode = $('mode').value;
 const queue = questions(unit,mode);
 if (mode === 'random') {
  for (let i = queue.length - 1; i > 0; i--) {
   const j = Math.floor(Math.random() * (i + 1));
   [queue[i],queue[j]] = [queue[j],queue[i]];
  }
  queue.splice(10);
 }
 session = {name,unit,mode,queue,index:0,boards:[],score:0,characters:0,hints:0};
 show('game');
 loadQuestion();
};

function loadQuestion() {
 session.boards.forEach(board => board.hideGuide());
 const question = session.queue[session.index];
 session.boards = [];
 for (const char of question.answer) {
  if (/\p{Script=Han}/u.test(char)) {
   session.boards.push(createBoard(char,session.boards.length));
  } else {
   const text = document.createElement('p');
   text.lang = 'ja';
   text.className = 'printed';
   text.textContent = char;
   session.boards.push({element:text,printed:true,hideGuide(){}});
  }
 }
 const sheet = document.createElement('div');
 sheet.className = 'joined-sheet';
 for (const board of session.boards) {
  sheet.append(board.printed ? board.element : board.element.querySelector('.paper'));
 }
 const controls = document.createElement('div');
 controls.className = 'board-controls';
 controls.append(...session.boards.filter(board => !board.printed).map(board => board.element));
 $('boards').replaceChildren(sheet, controls);
 refreshQuestion();
}

function refreshQuestion() {
 const question = session.queue[session.index];
 $('prompt').textContent = question.prompt;
 $('meaning').textContent = lang === 'th' ? (question.th ?? '') : lang === 'en' ? (question.en ?? '') : '';
 $('counter').textContent = (session.index + 1) + ' / ' + session.queue.length;
 $('progress').max = session.queue.length;
 const passed = session.boards.every(board => board.printed || board.passed);
 $('progress').value = session.index + Number(passed);
 $('next').hidden = !passed;
 $('check-all').hidden = passed;
 $('next').textContent = t(session.index + 1 === session.queue.length ? 'finish' : 'next');
 for (const board of session.boards) board.translate?.();
 updateGuideButton();
}

function updateGuideButton() {
 const visible = Boolean(session?.boards.some(board => board.isGuideVisible?.()));
 $('guide-all').textContent = t(visible ? 'hide' : 'guide');
 $('guide-all').setAttribute('aria-pressed', String(visible));
}
$('guide-all').onclick = () => {
 if (!session) return;
 const visible = session.boards.some(board => board.isGuideVisible?.());
 for (const board of session.boards) {
  if (visible) board.hideGuide();
  else board.showGuide?.();
 }
 updateGuideButton();
};
$('clear-all').onclick = () => {
 if (!session || session.boards.some(board => board.isDrawing?.())) return;
 session.boards.forEach(board => board.clearWriting?.());
 refreshQuestion();
};

$('check-all').onclick = () => {
 if (!session || session.boards.some(board => board.isDrawing?.())) return;
 for (const board of session.boards) board.judge?.();
 refreshQuestion();
 if (!$('next').hidden) $('next').scrollIntoView({behavior:'smooth',block:'nearest'});
};

$('next').onclick = () => {
 if (!session || $('next').hidden) return;
 if (session.index + 1 < session.queue.length) {
  session.index++;
  loadQuestion();
  window.scrollTo(0,0);
  return;
 }
 completion = {name:session.name,unit:session.unit,mode:session.mode,size:session.queue.length,
  hints:session.hints,average:session.score / session.characters,date:new Date()};
 renderCertificate();
 show('result');
};

function renderCertificate() {
 $('cert-division').textContent = unitName(completion.unit) + ' · ' + t(completion.mode);
 $('cert-name').textContent = completion.name;
 $('cert-count').textContent = String(completion.size);
 $('cert-hints').textContent = String(completion.hints);
 $('cert-average').textContent = percent(completion.average);
 $('cert-date').textContent = new Intl.DateTimeFormat(lang,{dateStyle:'long'}).format(completion.date);
 $('cert-code').textContent = (completion.unit === 'all' ? 'ALL' : 'UNIT ' + (Number(completion.unit) + 1)) + ' / ' + completion.size;
}

function createBoard(char,index) {
 const element = document.createElement('section');
 element.className = 'board';
 element.innerHTML = `<p class="board-label"></p><div class="paper">
  <span class="guide" lang="ja" aria-hidden="true" hidden></span><canvas width="600" height="600"></canvas>
 </div>
 <p class="feedback" role="status"></p>`;
 const canvas = element.querySelector('canvas');
 const guide = element.querySelector('.guide');
 const feedback = element.querySelector('.feedback');
 const ctx = canvas.getContext('2d');
 const strokes = [];
 let pointer = null, timer, usedHint = false, match = null, message = '';
 guide.textContent = char;

 function translate() {
  const label = t('box',{n:index + 1});
  element.querySelector('.board-label').textContent = label;
  canvas.setAttribute('aria-label', label);
  feedback.textContent = message ? t(message) : '';
  if (match !== null) {
   feedback.textContent += ' · ' + t('match') + ' ' + percent(Math.floor(match * 100) / 100);
   if (!board.passed) feedback.textContent += ' (' + t('pass') + ' ' + percent(PASS_SCORE) + ')';
  }
 }
 function hideGuide() {
  clearTimeout(timer);
  guide.hidden = true;
  updateGuideButton();
 }
 const board = {element,passed:false,translate,hideGuide,showGuide,clearWriting,judge, isGuideVisible: () => !guide.hidden, isDrawing: () => pointer !== null};
 function showGuide() {
  clearTimeout(timer);
  if (!usedHint) { session.hints++; usedHint = true; }
  guide.hidden = false;
  timer = setTimeout(hideGuide,GUIDE_MS);
 }
 const point = event => {
  const bounds = canvas.getBoundingClientRect();
  return [(event.clientX-bounds.left)*600/bounds.width,(event.clientY-bounds.top)*600/bounds.height];
 };
 function draw() {
  ctx.clearRect(0,0,600,600);
  ctx.strokeStyle = '#15584d';
  ctx.lineWidth = 12;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const stroke of strokes) {
   ctx.beginPath();
   ctx.moveTo(...stroke[0]);
   if (stroke.length === 1) ctx.lineTo(stroke[0][0]+0.1,stroke[0][1]);
   else for (const pair of stroke.slice(1)) ctx.lineTo(...pair);
   ctx.stroke();
  }
 }
 canvas.onpointerdown = event => {
  if (board.passed || pointer !== null || event.button !== 0) return;
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  strokes.push([point(event)]);
  draw();
 };
 canvas.onpointermove = event => {
  if (event.pointerId !== pointer) return;
  strokes.at(-1).push(point(event));
  draw();
 };
 canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = event => {
  if (event.pointerId !== pointer) return;
  pointer = null;
 };
 function clearWriting() {
  if (pointer !== null) return;
  if (board.passed) {
   session.score -= match;
   session.characters--;
   board.passed = false;
  }
  hideGuide();
  strokes.length = 0;
  match = null;
  message = '';
  feedback.dataset.state = '';
  draw();
  translate();
 };
 function judge() {
  if (board.passed || pointer !== null) return;
  const points = strokes.flat();
  const xs = points.map(([x])=>x), ys = points.map(([,y])=>y);
  if (!points.length || Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)) < 45) {
   match = null;
   message = 'bigger';
  } else {
   const result = score(canvas,char);
   match = result.match;
   message = !result.parts ? 'missing' : match < PASS_SCORE ? 'retry' : 'correct';
  }
  feedback.dataset.state = message;
  if (message === 'correct') {
   board.passed = true;
   session.score += match;
   session.characters++;
   hideGuide();
  }
  translate();
 };
 return board;
}

function raster(source){const n=64,c=document.createElement('canvas');c.width=c.height=n;const x=c.getContext('2d');x.drawImage(source,0,0,n,n);const d=x.getImageData(0,0,n,n).data;let minX=n,minY=n,maxX=0,maxY=0;for(let y=0;y<n;y++)for(let xx=0;xx<n;xx++)if(d[(y*n+xx)*4+3]>40){minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}const out=document.createElement('canvas');out.width=out.height=n;const ox=out.getContext('2d');if(maxX<minX||maxY<minY)return Array(n*n).fill(false);const w=maxX-minX+1,h=maxY-minY+1;const scale=48/Math.max(w,h);ox.drawImage(c,minX,minY,w,h,(n-w*scale)/2,(n-h*scale)/2,w*scale,h*scale);const a=ox.getImageData(0,0,n,n).data;return Array.from({length:n*n},(_,i)=>a[i*4+3]>40)}
function overlap(a,b){let hit=0,total=0;for(let i=0;i<a.length;i++){if(!a[i])continue;total++;const x=i%64,y=Math.floor(i/64);let found=false;for(let dy=-4;dy<=4&&!found;dy++)for(let dx=-4;dx<=4;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<64&&yy>=0&&yy<64&&b[yy*64+xx]){found=true;break}}if(found)hit++}return total?hit/total:0}
// Check each disconnected piece of the model independently.
function hasSeparateParts(sample, reference) {
 const size = 64;
 const remaining = reference.slice();
 for (let start = 0; start < remaining.length; start++) {
  if (!remaining[start]) continue;
  const pixels = [start];
  remaining[start] = false;
  for (let i = 0; i < pixels.length; i++) {
   const x = pixels[i] % size;
   const y = Math.floor(pixels[i] / size);
   for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
     if (x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size) continue;
     const neighbor = (y + dy) * size + x + dx;
     if (!remaining[neighbor]) continue;
     remaining[neighbor] = false;
     pixels.push(neighbor);
    }
   }
  }
  if (pixels.length < 6) continue;
  const part = Array(reference.length).fill(false);
  for (const pixel of pixels) part[pixel] = true;
  if (overlap(part, sample) < 0.5) return false;
 }
 return true;
}
function score(canvas, char) {
 const model = document.createElement('canvas');
 model.lang = 'ja';
 model.width = model.height = 600;
 const ctx = model.getContext('2d');
 ctx.font = font;
 ctx.textAlign = 'center';
 ctx.textBaseline = 'middle';
 ctx.fillText(char,300,300);
 const sample = raster(canvas), reference = raster(model);
 return { match: Math.min(overlap(sample,reference),overlap(reference,sample)),
  parts: hasSeparateParts(sample,reference) };
}

try {
 const savedLanguage = localStorage.getItem('minna-kanji-language');
 if (Object.hasOwn(messages,savedLanguage)) {
  setLanguage(savedLanguage);
  $('language').hidden = $('home').hidden = false;
  show('menu');
 }
} catch {}
