// 画面と操作。中身（1 回混ぜる・戻す、周期、k 回目の絵、保存と URL の読み書き）は catmap.js にある。
import {
  APP_NAME, MIN_N, MAX_N, PRESETS, period, hasHalf, perms, move, imageAt, readState, nFromSearch, shareUrl, shareText,
} from './catmap.js';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。
// キーは必ず 'cat-map.' で始める。写真はここにも IndexedDB にも入れない（同じサイトの他のアプリから読めるため）
const STORE = 'cat-map.';

function loadRaw(key) {
  try { return localStorage.getItem(STORE + key); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
}

WebAppKit.init({ title: APP_NAME, text: '絵のマス目を決まった式で並べ替えて、ぐちゃぐちゃに混ぜる。何度もくり返すと、ある回数でぴったり元の絵に戻る。' });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ---- ここからアプリ本体 ----

const $ = (id) => document.getElementById(id);

const state = readState(loadRaw('state'));
// 写真を使っていても 'cat' として保存する
const store = () => save('state', { ...state, pic: state.pic === 'photo' ? 'cat' : state.pic });
const qn = nFromSearch(location.search);   // URL の ?n= は保存した値より優先。絵は「ねこ」
if (qn) { state.n = qn; state.pic = 'cat'; }

const RATE = [1, 5, 30];    // 1 秒あたりの回数（ゆっくり・ふつう・はやい）
const SLIDE_MS = 600;       // ゆっくりのとき、マスが次の場所へすべる時間
const BG32 = (0xff << 24 | 0xe6 << 16 | 0xef << 8 | 0xf4) >>> 0;   // すき間の色 = ページの背景 #f4efe6（ImageData 用に ABGR）
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---- 音 ----
// 音声ファイルは使わず Web Audio で作る。オン・オフは state.sound に覚える
let soundOn = state.sound;

// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(on) {
  try { if (navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}
setAudioSession(soundOn);

let actxAudio = null, master = null;
// ブラウザは触る前の音を止めるので、AudioContext は最初に触ったときに作る
function unlockAudio() {
  if (!soundOn) return;
  setAudioSession(true);
  if (!actxAudio) {
    try { actxAudio = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = actxAudio.createGain();
    master.gain.value = 0.5;
    master.connect(actxAudio.destination);
  }
  if (actxAudio.state === 'suspended') actxAudio.resume();
}
addEventListener('pointerdown', unlockAudio, true);
addEventListener('keydown', unlockAudio, true);

// 短い音を 1 つ。notes = [[周波数, 開始の遅れ(秒)], …]。gap 秒より短い間隔では同じ種類を鳴らさない
const lastAt = {};
function tone(kind, gap, notes, { dur = 0.1, type = 'triangle', gain = 0.07 } = {}) {
  if (!soundOn || !actxAudio) return;
  const now = actxAudio.currentTime;
  if (now - (lastAt[kind] ?? -1) < gap) return;
  lastAt[kind] = now;
  for (const [f, at = 0] of notes) {
    const t = now + at;
    const o = actxAudio.createOscillator(), g = actxAudio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
}
const sfx = {
  pop: () => tone('pop', 0.04, [[660]], { dur: 0.08 }),
  mix: (k) => tone('mix', 0.1, [[1100 + (k % 7) * 70]], { dur: 0.05, type: 'sine', gain: 0.03 }),
  unmix: (k) => tone('mix', 0.1, [[720 + (k % 7) * 45]], { dur: 0.05, type: 'sine', gain: 0.03 }),
  half: () => tone('half', 0.2, [[783.99], [1046.5, 0.09]], { dur: 0.16, gain: 0.06 }),
  back: () => tone('back', 0.3, [[523.25], [659.25, 0.08], [783.99, 0.16], [1046.5, 0.16]], { dur: 0.32, gain: 0.07 }),
  tick: () => tone('tick', 0.06, [[1760]], { dur: 0.02, type: 'sine', gain: 0.025 }),
  photo: () => tone('photo', 0.2, [[660], [880, 0.1]], { dur: 0.08 }),
};

function renderSound() {
  $('soundBtn').setAttribute('aria-pressed', String(soundOn));
  $('soundBtn').setAttribute('aria-label', soundOn ? '音: オン' : '音: オフ');
  $('soundIcon').innerHTML = soundOn
    ? '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18.3 6a8.5 8.5 0 0 1 0 12"/>'
    : '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9.5 5 5m0-5-5 5"/>';
}
$('soundBtn').addEventListener('click', () => {
  soundOn = state.sound = !soundOn;
  store();
  setAudioSession(soundOn);
  renderSound();
  if (soundOn) { unlockAudio(); sfx.pop(); }
});
renderSound();

// ---- 見本の絵（コードで描く。512 × 512） ----
const SRC = 512;
const makeCanvas = (w) => Object.assign(document.createElement('canvas'), { width: w, height: w });

function drawCat() {
  const c = makeCanvas(SRC), g = c.getContext('2d');
  const tri = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
  const oval = (x, y, rx, ry, fill) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  g.fillStyle = '#8ccbe0'; g.fillRect(0, 0, SRC, SRC);
  oval(256, 600, 230, 170, '#e98f3c');                  // 肩
  g.fillStyle = '#d43d3d'; g.fillRect(96, 452, 320, 30); // 首輪
  oval(256, 492, 22, 22, '#f5c83c');                    // 鈴
  tri([[96, 250], [118, 52], [236, 160]], '#e98f3c');   // 耳
  tri([[416, 250], [394, 52], [276, 160]], '#e98f3c');
  tri([[124, 214], [136, 104], [206, 168]], '#f4b2a6');
  tri([[388, 214], [376, 104], [306, 168]], '#f4b2a6');
  oval(256, 300, 182, 150, '#f09a45');                  // 顔
  g.fillStyle = '#c96a24';                              // おでこのしま
  for (const x of [226, 256, 286]) g.fillRect(x - 8, 158, 16, x === 256 ? 70 : 52);
  oval(214, 356, 50, 40, '#fbe6c8');                    // 口のまわり
  oval(298, 356, 50, 40, '#fbe6c8');
  for (const x of [186, 326]) {                         // 目
    oval(x, 282, 30, 34, '#27402c');
    oval(x + 9, 270, 9, 10, '#ffffff');
  }
  tri([[236, 322], [276, 322], [256, 346]], '#e66b7f'); // 鼻
  g.strokeStyle = '#3b2a20'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath();                                        // 口
  g.moveTo(256, 346); g.lineTo(256, 362);
  g.arc(236, 362, 20, 0, Math.PI * 0.9);
  g.moveTo(256, 362); g.arc(276, 362, 20, Math.PI, Math.PI * 0.1, true);
  for (const s of [-1, 1]) {                            // ひげ
    for (const dy of [-18, 8]) { g.moveTo(256 + s * 90, 350 + dy / 2); g.lineTo(256 + s * 200, 340 + dy * 1.6); }
  }
  g.stroke();
  return c;
}

function drawText() {
  const c = makeCanvas(SRC), g = c.getContext('2d');
  const font = (px) => `bold ${px}px system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  g.fillStyle = '#fdf7e8'; g.fillRect(0, 0, SRC, SRC);
  g.fillStyle = '#d8543a'; g.fillRect(0, 0, SRC, 110);   // 上の帯（さかさまが分かるように）
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.font = font(72);
  g.fillText('うえ', 256, 58);
  g.fillStyle = '#1e3a5f'; g.font = font(250);
  g.fillText('ねこ', 256, 318);
  g.fillStyle = '#2f8f6b'; g.fillRect(0, 470, 170, 42);   // 左下の印（左右が分かるように）
  return c;
}

const sources = { cat: null, text: null, photo: null };
function source(pic) {
  if (pic === 'photo') return sources.photo;
  return sources[pic] || (sources[pic] = pic === 'text' ? drawText() : drawCat());
}

// ---- 絵の状態 ----
// 絵は 1 マス = 1 点の Canvas を CSS で拡大する（ぼかさない）
const cells = $('cells');
const cctx = cells.getContext('2d');
const work = makeCanvas(1);
const wctx = work.getContext('2d', { willReadFrequently: true });
let n = 0, p, half, fwd, inv, orig, cur, k = 0, img, px;
let holding = false;

// 元の絵を n × n に縮めて作る
function buildOrig() {
  work.width = work.height = n;
  wctx.imageSmoothingEnabled = true;
  wctx.imageSmoothingQuality = 'high';
  wctx.drawImage(source(state.pic), 0, 0, n, n);
  orig = new Uint32Array(wctx.getImageData(0, 0, n, n).data.buffer);
}

function draw() {
  px.set(holding ? orig : cur);
  cctx.putImageData(img, 0, 0);
}

function render() {
  draw();
  $('kText').textContent = k;
  $('pText').textContent = p;
  $('fill').style.width = `${(k / p) * 100}%`;
  $('mid').hidden = !half;
  $('half').disabled = !half;
  $('nText').textContent = `${n} × ${n}`;
  $('slider').value = n;
  $('periodNote').textContent = `この大きさは ${p} 回で戻る`;
  $('minus').disabled = n <= MIN_N;
  $('plus').disabled = n >= MAX_N;
  for (const b of $('presets').children) b.setAttribute('aria-pressed', String(+b.dataset.n === n));
  for (const b of $('pics').children) b.setAttribute('aria-pressed', String(b.dataset.pic === state.pic));
}

// はじめ（k = 0）の絵から
function restart() {
  setPlaying(false);
  stopSlide();
  hideBack();
  buildOrig();
  k = 0;
  cur = orig.slice();
  render();
}

// 大きさを変える: 周期を計算し直し、はじめから。変わらなければ false
function setN(next) {
  next = Math.min(MAX_N, Math.max(MIN_N, next));
  if (next === n) return false;
  n = state.n = next;
  store();
  p = period(n);
  half = hasHalf(n, p);
  ({ fwd, inv } = perms(n));
  cells.width = cells.height = n;
  img = cctx.createImageData(n, n);
  px = new Uint32Array(img.data.buffer);
  restart();
  return true;
}

function setPic(pic) {
  state.pic = pic;
  store();
  restart();
}

// k 回目の絵を 1 度に作る（1 回ずつ回さない）
function jumpTo(kk) {
  stopSlide();
  hideBack();
  k = kk;
  cur = imageAt(orig, n, k);
  render();
}

let backTimer = 0;
function hideBack() { clearTimeout(backTimer); $('backMsg').hidden = true; }
function showBack() {
  $('backMsg').hidden = false;
  clearTimeout(backTimer);
  backTimer = setTimeout(() => { $('backMsg').hidden = true; }, 1500);
  sfx.back();
}

// 1 回進む（dir = 1）・戻す（dir = −1）
function stepBy(dir) {
  const to = dir > 0 ? fwd : inv;
  if (state.speed === 0 && !reducedMotion.matches) startSlide(cur, to);
  cur = move(cur, new Uint32Array(n * n), to);
  k = (k + dir + p) % p;
  render();
  if (k !== 0) hideBack();
  if (k === 0) showBack();
  else if (half && k === p / 2) sfx.half();
  else (dir > 0 ? sfx.mix : sfx.unmix)(k);
}

// ---- ゆっくりのとき: 各マスが今の場所から次の場所へまっすぐすべる ----
// 絵の上に重ねた Canvas に、1 マス = c 点で描く（全体で 1024 点まで）
const anim = $('anim');
const actx = anim.getContext('2d');
let slide = null, aimg = null, apx = null;

function startSlide(src, to) {
  const c = Math.max(1, Math.min(Math.ceil(cells.getBoundingClientRect().width * (devicePixelRatio || 1) / n), Math.floor(1024 / n)));
  const S = n * c;
  if (anim.width !== S || !aimg) {
    anim.width = anim.height = S;
    aimg = actx.createImageData(S, S);
    apx = new Uint32Array(aimg.data.buffer);
  }
  slide = { src, to, c, S, t0: performance.now() };
  anim.hidden = holding;
  slideFrame(slide.t0);   // 最初の 1 枚はすぐ描く（混ぜた後の絵が一瞬見えないように）
}
function stopSlide() {
  slide = null;
  anim.hidden = true;
}
function slideFrame(t) {
  if (!slide) return;
  const e = Math.min((t - slide.t0) / SLIDE_MS, 1);
  if (e >= 1) { stopSlide(); return; }
  const s = e < 0.5 ? 2 * e * e : 1 - (2 - 2 * e) ** 2 / 2;
  const { src, to, c, S } = slide;
  apx.fill(BG32);
  for (let i = 0; i < src.length; i++) {
    const x0 = i % n, y0 = (i - x0) / n, j = to[i], x1 = j % n, y1 = (j - x1) / n;
    const X = Math.round((x0 + (x1 - x0) * s) * c), Y = Math.round((y0 + (y1 - y0) * s) * c);
    for (let r = 0, o = Y * S + X; r < c; r++, o += S) apx.fill(src[i], o, o + c);
  }
  actx.putImageData(aimg, 0, 0);
  const job = slide;
  requestAnimationFrame((t2) => { if (slide === job) slideFrame(t2); });
}

// ---- 再生 ----
let playing = false, acc = 0, last = 0;

function frame(t) {
  if (!playing) return;
  acc += RATE[state.speed] * Math.min((t - last) / 1000, 0.1);   // 裏に回って戻ったときにまとめて進めない
  last = t;
  while (playing && acc >= 1) {
    acc -= 1;
    stepBy(1);
    if (k === 0) setPlaying(false);   // 元に戻ったら止める（「戻った」を見せる）
  }
  if (playing) requestAnimationFrame(frame);
}

function setPlaying(on) {
  if (on === playing) return;
  playing = on;
  $('play').textContent = on ? '⏸' : '▶';
  $('play').setAttribute('aria-label', on ? '止める' : '再生');
  if (on) {
    acc = 1;   // 押したらすぐ 1 回目
    requestAnimationFrame((t) => { last = t; frame(t); });
  }
}
function toggle() { setPlaying(!playing); sfx.pop(); }

$('play').addEventListener('click', toggle);
$('fwd').addEventListener('click', () => { setPlaying(false); stepBy(1); });
$('back').addEventListener('click', () => { setPlaying(false); stepBy(-1); });
$('first').addEventListener('click', () => { setPlaying(false); jumpTo(0); sfx.pop(); });
$('half').addEventListener('click', () => { if (half) { setPlaying(false); jumpTo(p / 2); sfx.half(); } });

function renderSpeed() {
  for (const b of $('speed').children) b.setAttribute('aria-pressed', String(+b.dataset.speed === state.speed));
}
$('speed').addEventListener('click', (e) => {
  const b = e.target.closest('[data-speed]');
  if (!b) return;
  state.speed = +b.dataset.speed;
  store();
  if (state.speed !== 0) stopSlide();
  renderSpeed();
  sfx.pop();
});

// 絵を押しているあいだは元の絵を出す
const pic = $('pic');
function hold(on) {
  if (holding === on) return;
  holding = on;
  $('origTag').hidden = !on;
  anim.hidden = on || !slide;
  draw();
}
pic.addEventListener('pointerdown', (e) => { if (e.button === 0) { pic.setPointerCapture(e.pointerId); hold(true); } });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pic.addEventListener(ev, () => hold(false));
pic.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- 大きさ ----
$('presets').replaceChildren(...PRESETS.map((v) => {
  const b = document.createElement('button');
  b.className = 'btn';
  b.dataset.n = v;
  b.textContent = v;
  b.addEventListener('click', () => { if (setN(v)) sfx.pop(); });
  return b;
}));

// 「−」「＋」は押しっぱなしで続けて変わる。キーボードで押したとき（detail 0）は click で 1 つ
function holdRepeat(btn, d) {
  let t1 = 0, t2 = 0;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  const once = () => { if (setN(n + d)) sfx.tick(); else stop(); };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stop();
    once();
    t1 = setTimeout(() => { t2 = setInterval(once, 70); }, 400);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  btn.addEventListener('click', (e) => { if (e.detail === 0) once(); });
}
holdRepeat($('minus'), -1);
holdRepeat($('plus'), 1);
$('slider').addEventListener('input', (e) => { if (setN(+e.target.value)) sfx.tick(); });

// ---- 絵をえらぶ ----
$('pics').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-pic]');
  if (!b) return;
  $('fileErr').hidden = true;
  setPic(b.dataset.pic);
  sfx.pop();
});

// 写真: まん中の正方形を切り出し、512 点までに縮めてメモリにだけ持つ。どこにも送らない・保存しない
$('file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const w = im.naturalWidth, h = im.naturalHeight, s = Math.min(w, h);
    if (!s) throw new Error('empty');
    const d = Math.min(SRC, s), c = makeCanvas(d);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, (w - s) / 2, (h - s) / 2, s, s, 0, 0, d, d);
    sources.photo = c;
    $('fileErr').hidden = true;
    setPic('photo');
    sfx.photo();
  } catch {
    $('fileErr').hidden = false;   // 前の絵のまま
  } finally {
    URL.revokeObjectURL(url);
  }
});

// 共有: webapp-kit が document で拾う前に、今の大きさと周期を入れておく（写真は入れない）
$('share').addEventListener('click', () => {
  WebAppKit.init({ text: shareText(n, p), url: shareUrl(location.origin + location.pathname, n) });
});

// ---- 遊び方 ----
function openHelp() { $('help').hidden = false; $('helpClose').focus(); }
function closeHelp() {
  $('help').hidden = true;
  if (!state.seenHelp) { state.seenHelp = true; store(); }
  sfx.pop();
}
$('helpBtn').addEventListener('click', () => { openHelp(); sfx.pop(); });
$('helpClose').addEventListener('click', closeHelp);
$('help').addEventListener('click', (e) => { if (e.target === $('help')) closeHelp(); });

// PC: Space で再生・停止、← → で 1 回。ボタンにフォーカスがあっても Space は再生・停止にする
// （ボタンは keyup の Space で押されるので、keyup も止める）。スライダーの上では ← → はスライダーのまま
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('help').hidden) { closeHelp(); return; }
  if (!$('help').hidden) return;
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) toggle(); }
  else if (e.target.closest('input')) return;
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('fwd').click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); $('back').click(); }
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && $('help').hidden) e.preventDefault();
});

// ---- はじめ ----
renderSpeed();
setN(state.n);
if (!state.seenHelp) openHelp();
