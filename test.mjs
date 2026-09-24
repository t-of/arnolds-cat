// 中身のテスト。node test.mjs で走る（フレームワークなし）。
import assert from 'node:assert/strict';
import {
  CAT, MIN_N, MAX_N, PRESETS, matPow, period, hasHalf, perms, move, imageAt, readState, nFromSearch, shareUrl, shareText, DEFAULT_STATE,
} from './catmap.js';

const test = (name, fn) => { fn(); console.log('✓', name); };
const ramp = (n) => Uint32Array.from({ length: n * n }, (_, i) => i);

test('仕様のおすすめの大きさの周期', () => {
  assert.deepEqual(PRESETS.map(period), [9, 15, 12, 25, 150, 150, 750, 30]);
});

test('ほかの周期（小さい N）', () => {
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 9, 10].map(period), [3, 4, 3, 10, 12, 8, 6, 12, 30]);
});

test('8〜256 のどの N でも周期は 3N 以下、3N になるのは 2·5ⁿ だけ', () => {
  for (let n = MIN_N; n <= MAX_N; n++) {
    const p = period(n);
    assert.ok(p >= 1 && p <= 3 * n, `n=${n} p=${p}`);
    assert.equal(p === 3 * n, [10, 50, 250].includes(n), `n=${n}`);
    assert.deepEqual(matPow(CAT, p, n), [1, 0, 0, 1]);
  }
});

test('行列の k 乗（2 乗のくり返し）は k 回かけたのと同じ', () => {
  let m = [1, 0, 0, 1];
  for (let k = 0; k < 40; k++) {
    assert.deepEqual(matPow(CAT, k, 97), m);
    m = [(2 * m[0] + m[2]) % 97, (2 * m[1] + m[3]) % 97, (m[0] + m[2]) % 97, (m[1] + m[3]) % 97];
  }
});

test('1 回混ぜる: (x, y) → (2x + y, x + y) mod N', () => {
  const n = 8, { fwd } = perms(n);
  assert.equal(fwd[0], 0);
  assert.equal(fwd[1], 1 * n + 2);                  // (1, 0) → (2, 1)
  assert.equal(fwd[3 * n + 5], (8 % n) * n + 13 % n); // (5, 3) → (13, 8) mod 8 = (5, 0)
});

test('マスは重ならず抜けない。戻すと元どおり', () => {
  for (const n of [8, 37, 124]) {
    const { fwd, inv } = perms(n);
    assert.equal(new Set(fwd).size, n * n);
    const a = ramp(n), b = move(a, new Uint32Array(n * n), fwd), c = move(b, new Uint32Array(n * n), inv);
    assert.deepEqual(c, a);
  }
});

test('k 回目を直接作ったものは、1 回ずつ k 回混ぜたものと同じ。p 回で元に戻る', () => {
  const n = 76, { fwd } = perms(n), orig = ramp(n);
  let cur = orig;
  for (let k = 1; k <= period(n); k++) {
    cur = move(cur, new Uint32Array(n * n), fwd);
    assert.deepEqual(imageAt(orig, n, k), cur);
    assert.equal(cur.every((v, i) => v === i), k === period(n), `k=${k}`);
  }
});

test('半分でさかさま: 判定と、そのとき絵が 180° 回っていること', () => {
  // おすすめのうち 50・250・10 は「半分へ」が押せる（250 だけにしない）
  assert.deepEqual(PRESETS.map((n) => hasHalf(n)), [false, false, false, false, false, true, true, true]);
  assert.equal(hasHalf(10), true);
  // 判定は、周期の半分の絵を実際に作って 180° 回った形（(x, y) の色が (−x, −y) mod N）かを見たのと同じ
  for (let n = MIN_N; n <= MAX_N; n++) {
    const p = period(n);
    let flipped = false;
    if (p % 2 === 0) {
      const half = imageAt(ramp(n), n, p / 2);
      flipped = half.every((v, j) => {
        const x = j % n, y = (j - x) / n;
        return v === ((n - y) % n) * n + (n - x) % n;
      });
    }
    assert.equal(hasHalf(n), flipped, `n=${n}`);
  }
});

test('保存: 読めない・範囲外は既定、写真は保存されない', () => {
  assert.deepEqual(readState(null), DEFAULT_STATE);
  assert.deepEqual(readState('{壊れた'), DEFAULT_STATE);
  assert.deepEqual(readState('{"n":300,"speed":5,"pic":"photo","sound":"x","seenHelp":1}'), DEFAULT_STATE);
  assert.deepEqual(readState('{"v":1,"n":100,"speed":2,"pic":"text","sound":false,"seenHelp":true}'),
    { v: 1, n: 100, speed: 2, pic: 'text', sound: false, seenHelp: true });
  assert.equal(readState('{"n":7}').n, 124);
  assert.equal(readState('{"n":12.5}').n, 124);
});

test('URL の ?n= と共有の文', () => {
  assert.equal(nFromSearch('?n=76'), 76);
  assert.equal(nFromSearch('?n=7'), null);
  assert.equal(nFromSearch('?n=257'), null);
  assert.equal(nFromSearch('?n=1e2'), null);
  assert.equal(nFromSearch(''), null);
  assert.equal(shareUrl('https://t-of.github.io/arnolds-cat/', 124), 'https://t-of.github.io/arnolds-cat/?n=124');
  assert.equal(shareText(124, 15), "124 × 124 の絵は、15 回混ぜるとぴったり元に戻る（ARNOLD'S CAT）");
});
