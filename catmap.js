// ARNOLD'S CAT の中身。アーノルドの猫写像の 1 回混ぜる・戻す、周期、k 回目の絵、半分でさかさまの判定、保存と URL の読み書き。
// DOM には触らない。ブラウザでは main.js から、テストでは node test.mjs から読む。

// 画面・共有の文に出るアプリ名。名前を変えるときはここと、index.html の <head>・manifest・README を直す
export const APP_NAME = "ARNOLD'S CAT";

export const MIN_N = 8;
export const MAX_N = 256;
export const DEFAULT_N = 124;
// おすすめの大きさ（並べる順）。50・250・10 は周期の半分でさかさまになる
export const PRESETS = [76, 124, 144, 101, 100, 50, 250, 10];

// 行列は [a, b, c, d] = (a b; c d)。マス (x, y) は (a x + b y, c x + d y) mod n へ動く
export const CAT = [2, 1, 1, 1];
const I = [1, 0, 0, 1];

const mod = (v, n) => ((v % n) + n) % n;
const mul = ([a, b, c, d], [e, f, g, h], n) =>
  [mod(a * e + b * g, n), mod(a * f + b * h, n), mod(c * e + d * g, n), mod(c * f + d * h, n)];

// 行列の k 乗 mod n（2 乗をくり返す）
export function matPow(m, k, n) {
  let r = I.map((v) => mod(v, n)), p = m.map((v) => mod(v, n));
  for (; k > 0; k = Math.floor(k / 2)) {
    if (k & 1) r = mul(r, p, n);
    p = mul(p, p, n);
  }
  return r;
}

const same = (m, t, n) => m.every((v, i) => v === mod(t[i], n));

// 周期 p(n): 猫写像の k 乗が単位行列になる最小の k。必ずあり、3n を越えない（Dyson・Falk 1992）
export function period(n) {
  for (let k = 1; ; k++) if (same(matPow(CAT, k, n), I, n)) return k;
}

// 周期の半分で絵がちょうど 180° 回った形（k 乗が −I）になるか
export const hasHalf = (n, p = period(n)) => p % 2 === 0 && same(matPow(CAT, p / 2, n), [-1, 0, 0, -1], n);

// マスの番号 i = y n + x の行き先。fwd は 1 回混ぜる、inv は 1 回戻す（fwd の逆）
export function perms(n) {
  const fwd = new Int32Array(n * n), inv = new Int32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const j = ((x + y) % n) * n + (2 * x + y) % n;
      fwd[y * n + x] = j;
      inv[j] = y * n + x;
    }
  }
  return { fwd, inv };
}

// src のマス i の色を dst[to[i]] に置く（to は fwd か inv）
export function move(src, dst, to) {
  for (let i = 0; i < to.length; i++) dst[to[i]] = src[i];
  return dst;
}

// 元の絵から、k 回混ぜた絵を 1 度に作る（行列の k 乗をかける）
export function imageAt(orig, n, k) {
  const [a, b, c, d] = matPow(CAT, k, n);
  const out = new orig.constructor(orig.length);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) out[((c * x + d * y) % n) * n + (a * x + b * y) % n] = orig[y * n + x];
  }
  return out;
}

// ---- 保存（arnolds-cat.state）と URL ----

export const DEFAULT_STATE = { v: 1, n: DEFAULT_N, speed: 1, pic: 'cat', sound: true, seenHelp: false };

const isN = (n) => Number.isInteger(n) && n >= MIN_N && n <= MAX_N;

// 保存した文字列を読む。読めない・範囲の外のところは初期値にする
export function readState(raw) {
  let o;
  try { o = JSON.parse(raw); } catch { o = null; }
  if (!o || typeof o !== 'object') return { ...DEFAULT_STATE };
  return {
    v: 1,
    n: isN(o.n) ? o.n : DEFAULT_N,
    speed: [0, 1, 2].includes(o.speed) ? o.speed : DEFAULT_STATE.speed,
    pic: o.pic === 'text' ? 'text' : 'cat',   // 写真は保存しない
    sound: o.sound !== false,
    seenHelp: o.seenHelp === true,
  };
}

// location.search の ?n= を読む。8〜256 の整数でなければ null（無視する）
export function nFromSearch(search) {
  const s = new URLSearchParams(search).get('n');
  return s && /^\d+$/.test(s) && isN(+s) ? +s : null;
}

export const shareUrl = (base, n) => `${base}?n=${n}`;
export const shareText = (n, p) => `${n} × ${n} の絵は、${p} 回混ぜるとぴったり元に戻る（${APP_NAME}）`;
