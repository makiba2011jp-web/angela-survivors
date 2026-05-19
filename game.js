"use strict";

/* =========================================================================
 *  エンジェラサバイバーズ
 *  単一HTMLファイル、Canvas 2D APIのみで動作するサバイバルゲーム
 * ========================================================================= */

// ---------- 基本セットアップ ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ゲーム視野(内部解像度)。resize() で画面の向きに応じて更新する
let VIEW_W = 800;
let VIEW_H = 600;

// ウィンドウにフィット。縦持ち時は縦長の視野にして画面いっぱいに表示する
function resize() {
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  if (ih > iw) {
    // 縦持ち: 横600固定、縦は画面比に合わせる(900〜1300にクランプ)
    VIEW_W = 600;
    VIEW_H = Math.max(900, Math.min(1300, Math.round(600 * ih / iw)));
  } else {
    // 横向き / PC: 従来の 800x600
    VIEW_W = 800;
    VIEW_H = 600;
  }
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  // CSS表示サイズを画面にフィット(アスペクト比維持)
  const aspect = VIEW_W / VIEW_H;
  let w = iw, h = ih;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);
resize();

// ---------- サウンド(効果音・Web Audio合成) ----------
// 音声ファイル不要。AudioContext で波形を合成して鳴らす。
const Sound = (() => {
  let ctx = null, masterGain = null, muted = false;
  let lastXpTime = 0, lastDefeatTime = 0;

  // 初回のユーザー操作時に呼ぶ(ブラウザの自動再生制限を解除)
  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }

  // 単音(オシレーター + 音量エンベロープ)
  function tone(freq, dur, type, vol, freqEnd, delay) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(masterGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // ノイズ(爆発・打撃用)
  function noise(dur, vol, cutoff, delay) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(lp); lp.connect(g); g.connect(masterGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  return {
    init,
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
    shoot()  { tone(720, 0.09, "square", 0.10, 380); },
    hurt()   { tone(180, 0.22, "sawtooth", 0.22, 70); noise(0.12, 0.12, 700); },
    defeat() {
      const now = performance.now();
      if (now - lastDefeatTime < 60) return;   // 鳴りすぎ防止
      lastDefeatTime = now;
      tone(300, 0.10, "square", 0.12, 140); noise(0.08, 0.08, 1500);
    },
    xp() {
      const now = performance.now();
      if (now - lastXpTime < 70) return;       // 鳴りすぎ防止
      lastXpTime = now;
      tone(900, 0.06, "sine", 0.07, 1300);
    },
    levelUp() {
      tone(523, 0.12, "square", 0.16, null, 0);
      tone(659, 0.12, "square", 0.16, null, 0.10);
      tone(784, 0.20, "square", 0.18, null, 0.20);
    },
    cardSelect() {
      tone(880, 0.08, "square", 0.16, null, 0);
      tone(1175, 0.12, "square", 0.16, null, 0.07);
    },
    thunder() {
      noise(0.16, 0.20, 3500);              // 鋭いクラック
      noise(0.45, 0.13, 500, 0.02);         // 低い轟き
      tone(150, 0.22, "sawtooth", 0.10, 60, 0);
    },
    bossAppear() { tone(110, 0.6, "sawtooth", 0.22, 70); noise(0.6, 0.10, 400); },
    bossDefeat() {
      noise(0.35, 0.22, 900);
      tone(392, 0.15, "square", 0.18, null, 0.10);
      tone(523, 0.15, "square", 0.18, null, 0.22);
      tone(784, 0.30, "square", 0.20, null, 0.34);
    },
    stageClear() {
      tone(523, 0.14, "square", 0.18, null, 0);
      tone(659, 0.14, "square", 0.18, null, 0.14);
      tone(784, 0.14, "square", 0.18, null, 0.28);
      tone(1047, 0.32, "square", 0.20, null, 0.42);
    },
    gameOver() {
      tone(330, 0.30, "sawtooth", 0.20, 220, 0);
      tone(247, 0.30, "sawtooth", 0.20, 160, 0.28);
      tone(165, 0.60, "sawtooth", 0.22, 90, 0.56);
    },
  };
})();

// ---------- ゲーム定数 ----------
const CLEAR_TIME = 10 * 60;          // (旧) 互換のため残置
const STAGE_DURATION   = 10 * 60;    // 各ステージ10分
let currentStage = 1;                // 現在のステージ(1〜3)
const XP_PICKUP_RANGE = 80;          // 経験値オーブの吸引距離
const TILE_SIZE = 40;                // 背景タイルのサイズ

// ---------- スプライト読み込み ----------
// 各モーションを個別フレームPNGとして読み込み、ゲーム開始前にすべて待機する
// 読み込み失敗時は loaded=false のまま、図形でフォールバック描画する
const sprites = {
  idle:          { loaded: false, frames: [], count: 4, drawSize: 171 },
  attack:        { loaded: false, frames: [], count: 6, drawSize: 197 },
  effect:        { loaded: false, frames: [], count: 3, drawSize: 96  },
  enemy_idle:    { loaded: false, frames: [], count: 2, drawSize: 125 },
  // ダークゴスペル(紫の雷) - ファイルが1-indexed なので baseIndex=1 で読む
  darkgospel_effect: { loaded: false, frames: [], count: 3, drawSize: 96, baseIndex: 1 },
  // ラブリーヌード(闇のハート) - 1枚絵、白背景除去
  lovelynude_effect: { loaded: false, frames: [], count: 1, drawSize: 80, removeWhite: true },
  // ボス(まきば) - 透過なし白背景PNGなので removeWhite を有効化
  makiba_idle:   { loaded: false, frames: [], count: 2, drawSize: 115, removeWhite: true },
  makiba_attack: { loaded: false, frames: [], count: 4, drawSize: 115, removeWhite: true },
  // 攻撃エフェクトは1枚のみで非正方形(320×220)。ファイル名に番号サフィックスなし
  makiba_effect: { loaded: false, frames: [], count: 1, drawW: 320, drawH: 220, removeWhite: true },
  // ヨンヨン(エリート敵) - ファイル名は yonyon_idle0.png 等(連番にアンダースコアなし)
  yonyon_idle:   { loaded: false, frames: [], count: 2, drawSize: 115, removeWhite: true  },
  yonyon_attack: { loaded: false, frames: [], count: 3, drawSize: 115, removeWhite: true  },
  yonyon_effect: { loaded: false, frames: [], count: 4, drawSize: 260, removeWhite: false },
  // ポッティ(エリート敵2) - 同じく連番にアンダースコアなし
  potty_idle:    { loaded: false, frames: [], count: 3, drawSize: 104, removeWhite: true  },
  potty_attack:  { loaded: false, frames: [], count: 4, drawSize: 104, removeWhite: true  },
  potty_effect:  { loaded: false, frames: [], count: 4, drawSize: 280, removeWhite: false },
  daisy_idle:    { loaded: false, frames: [], count: 3, drawSize: 96, removeWhite: true  },
  daisy_attack:  { loaded: false, frames: [], count: 3, drawSize: 96, removeWhite: true  },
  daisy_effect:  { loaded: false, frames: [], count: 1, drawSize: 180, removeWhite: false },
  konbu_idle:    { loaded: false, frames: [], count: 3, drawSize: 104, removeWhite: true  },
  konbu_attack:  { loaded: false, frames: [], count: 3, drawSize: 104, removeWhite: true  },
  konbu_effect:  { loaded: false, frames: [], count: 1, drawW: 320, drawH: 220, removeWhite: true },
  // ぽりねむ(雑魚・近接＋波動タイプ)
  porinemu_idle:   { loaded: false, frames: [], count: 3, drawSize: 160, removeWhite: true  },
  porinemu_attack: { loaded: false, frames: [], count: 3, drawSize: 160, removeWhite: true  },
  porinemu_effect: { loaded: false, frames: [], count: 1, drawW: 224, drawH: 154, removeWhite: true },
};

// ---------- 透過処理 ----------
// 白背景PNGの「縁から連結した白」だけをフラッドフィルで透過する(=背景のみ除去)。
// キャラ内部の白(輪郭で囲まれた白)は塗りつぶさず残す。
// CORS制約等で getImageData が失敗した場合は元画像をそのまま返す(背景は残る)
function processImage(img, name) {
  const c = document.createElement("canvas");
  c.width  = img.naturalWidth;
  c.height = img.naturalHeight;
  const cctx = c.getContext("2d");
  cctx.drawImage(img, 0, 0);
  try {
    const W = c.width, H = c.height;
    const data = cctx.getImageData(0, 0, W, H);
    const px = data.data;
    // 白(背景)判定: 明るく彩度が低いピクセル
    const isWhite = (p) => {
      const i = p * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      return r > 220 && g > 220 && b > 220 && Math.max(r, g, b) - Math.min(r, g, b) < 30;
    };
    // 画像の四辺を起点に、連結した白ピクセルだけを透明化(フラッドフィル)
    // → 背景の白のみ消え、キャラ内部の白は残る
    const visited = new Uint8Array(W * H);
    const stack = [];
    const seed = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const p = y * W + x;
      if (visited[p]) return;
      visited[p] = 1;
      if (isWhite(p)) stack.push(p);
    };
    for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
    for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
    let cleared = 0;
    while (stack.length) {
      const p = stack.pop();
      px[p * 4 + 3] = 0;
      cleared++;
      const x = p % W, y = (p - x) / W;
      seed(x + 1, y); seed(x - 1, y); seed(x, y + 1); seed(x, y - 1);
    }
    cctx.putImageData(data, 0, 0);
    console.log(`[sprite:${name}] 縁から連結した白背景を透過: ${cleared}px をクリア`);
    return c;
  } catch (e) {
    console.warn(`[sprite:${name}] 透過処理失敗(CORS制約の可能性): ${e.message}`);
    console.warn(`  -> ローカルサーバー(例: python -m http.server)経由で開くと解消します`);
    return img;
  }
}

function preloadSprites(callback) {
  let total = 0;
  for (const key in sprites) total += sprites[key].count;
  let completed = 0;
  const onOne = () => {
    completed++;
    if (completed === total) finish();
  };
  for (const key in sprites) {
    const obj = sprites[key];
    obj.frames = [];
    for (let i = 0; i < obj.count; i++) {
      const img = new Image();
      // 1フレームのみ(makiba_effect.png)は番号サフィックスなし
      // baseIndex で 1-indexed (例: darkgospel_effect_1.png)
      // yonyon_ プレフィックスはアンダースコアなしの連番 (例: yonyon_idle0.png)
      const base = obj.baseIndex || 0;
      const path = obj.count === 1
        ? `${key}.png`
        : (key.startsWith("yonyon_") || key.startsWith("potty_") || key.startsWith("daisy_") || key.startsWith("konbu_") || key.startsWith("porinemu_"))
          ? `${key}${i + base}.png`  // yonyon_ potty_ daisy_ 共通
          : `${key}_${i + base}.png`;
      const idx = i;
      img.onload = () => {
        console.log(`[sprite] ${path} OK (${img.naturalWidth}x${img.naturalHeight})`);
        // 白背景指定があるスプライトは透過処理を適用してフレームを差し替える
        if (obj.removeWhite) {
          obj.frames[idx] = processImage(img, `${key}_${idx}`);
        }
        onOne();
      };
      img.onerror = () => {
        console.error(`[sprite] ${path} 読み込み失敗 (HTMLと同じフォルダにあるか確認)`);
        onOne();
      };
      img.src = path;
      obj.frames.push(img);
    }
  }
  function finish() {
    for (const key in sprites) {
      const o = sprites[key];
      // frames には Image または処理済み canvas が混在しうる
      o.loaded = o.frames.every((f) => {
        if (f instanceof HTMLCanvasElement) return f.width > 0;
        return f.complete && f.naturalWidth > 0;
      });
      console.log(`[sprite:${key}] loaded=${o.loaded} (${o.count}フレーム)`);
    }
    callback();
  }
}

// ---------- 入力管理 ----------
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ---------- ゲーム状態 ----------
const STATE_TITLE    = "title";
const STATE_PLAYING  = "playing";
const STATE_LEVELUP  = "levelup";
const STATE_GAMEOVER = "gameover";
const STATE_CLEAR    = "clear";

let player, enemies, projectiles, xpOrbs, lightnings, lovenudes;
let shadowOrbs, meteorEffects;
let yonyonElites, eliteSpawnTimer;
let pottyElites, pottySpawnTimer;
let daisyEnemies, daisySpawnTimer;
let konbuElites, konbuSpawnTimer;
let konbuWaves = [];
let porinemuEnemies, porinemuSpawnTimer;
let porinemuWaves = [];
let elapsed, killCount, gameState, spawnTimer;
let lastTime = 0;

// ボス(まきば)関連
const BOSS_SPAWN_TIME = 300;        // ★5分経過後に出現
let boss = null;                    // 1体のみ。撃破後 null のまま
let bossDefeated = false;           // 再出現なし
let bossWaves = [];                 // ボスの波動エフェクト(プレイヤーへ飛翔)
let bossNotificationTimer = 0;      // 「BOSS出現!」テキスト表示残り秒

// ステージ内で発生する敵・弾・エフェクトをまとめて初期化する。
// 新しい敵や攻撃を追加した時は、ここに足すとステージ遷移時の掃除漏れを防げる。
function resetStageCombatState(options = {}) {
  const { resetBossDefeated = true } = options;

  enemies = [];
  projectiles = [];
  xpOrbs = [];
  lightnings = [];
  lovenudes = [];
  shadowOrbs = [];
  meteorEffects = [];

  yonyonElites = [];
  pottyElites = [];
  daisyEnemies = [];
  konbuElites = [];
  konbuWaves = [];
  porinemuEnemies = [];
  porinemuWaves = [];

  spawnTimer = 0;
  eliteSpawnTimer = 0;
  pottySpawnTimer = 0;
  daisySpawnTimer = 0;
  konbuSpawnTimer = 0;
  porinemuSpawnTimer = 0;

  boss = null;
  bossWaves = [];
  bossNotificationTimer = 0;
  if (resetBossDefeated) bossDefeated = false;
}

// ---------- 強化候補 ----------
// id, name, icon, desc, apply(player) を持つ
const UPGRADES = [
  {
    id: "atk", name: "魔力増幅", icon: "✦",
    desc: "弾のダメージ +5",
    apply: (p) => { p.bulletDamage += 5; },
  },
  {
    id: "rate", name: "詠唱加速", icon: "⏱",
    desc: "全武器の発動間隔 -12%",
    apply: (p) => { p.castMult = Math.max(0.45, p.castMult - 0.12); },
  },
  {
    id: "speed", name: "俊足の祝福", icon: "🌬",
    desc: "移動速度 +20",
    apply: (p) => { p.speed += 20; },
  },
  {
    id: "hp", name: "鋼の肉体", icon: "❤",
    desc: "最大HP +20 (全回復)",
    apply: (p) => { p.maxHp += 20; p.hp = p.maxHp; },
  },
  {
    id: "spellboost", name: "魔法弾強化", icon: "💥",
    getDesc: (p) => ((p.spellUpCount || 0) % 2 === 0)
      ? "魔法弾を強化 — 今回は 弾数 +1"
      : "魔法弾を強化 — 今回は ダメージ +10",
    apply: (p) => {
      p.spellUpCount = (p.spellUpCount || 0) + 1;
      if (p.spellUpCount % 2 === 1) p.bulletCount += 1;   // 奇数回: 弾数+1
      else p.bulletDamageBonus += 10;                      // 偶数回: ダメージ+10
    },
  },
  // ダークゴスペル(取得/強化、最大Lv5)
  {
    id: "darkgospel", name: "ダークゴスペル", icon: "⚡",
    getDesc: (p) => p.darkgospel.level === 0
      ? "周囲に紫の雷を召喚する範囲攻撃 (取得)"
      : `Lv.${p.darkgospel.level} → Lv.${p.darkgospel.level + 1}  範囲拡大`,
    available: (p) => p.darkgospel.level < 5,
    apply: (p) => {
      p.darkgospel.level += 1;
      // 取得直後は1秒後に最初の発動
      if (p.darkgospel.level === 1) p.darkgospel.timer = 1.0;
    },
  },
  // ラブリーヌード(取得/強化、最大Lv6)
  {
    id: "lovelynude", name: "ラブリーヌード", icon: "💜",
    getDesc: (p) => p.lovelynude.level === 0
      ? "闇のハートを敵に向けて放つ貫通攻撃 (取得)"
      : `Lv.${p.lovelynude.level} → Lv.${p.lovelynude.level + 1}  弾数/サイズ強化`,
    available: (p) => p.lovelynude.level < 6,
    apply: (p) => {
      p.lovelynude.level += 1;
      if (p.lovelynude.level === 1) p.lovelynude.timer = 1.0;
    },
  },
  // シャドウオーブ(周回防御弾、最大Lv5)
  {
    id: "shadoworb", name: "シャドウオーブ", icon: "🔮",
    getDesc: (p) => p.shadoworb.level === 0
      ? "プレイヤー周囲を周回する魔力弾 (取得)"
      : `Lv.${p.shadoworb.level} → Lv.${p.shadoworb.level + 1}  弾数増加・強化`,
    available: (p) => p.shadoworb.level < 5,
    apply: (p) => {
      p.shadoworb.level += 1;
    },
  },
  // メテオ(遅延着弾の範囲攻撃、最大Lv5)
  {
    id: "meteor", name: "メテオ", icon: "☄",
    getDesc: (p) => p.meteor.level === 0
      ? "敵集団に隕石を呼び落とす範囲攻撃 (取得)"
      : `Lv.${p.meteor.level} → Lv.${p.meteor.level + 1}  範囲/ダメージ強化`,
    available: (p) => p.meteor.level < 5,
    apply: (p) => {
      p.meteor.level += 1;
      if (p.meteor.level === 1) p.meteor.timer = 2.0;
    },
  },
];

// ---------- 初期化 ----------
function initGame() {
  player = {
    x: 0, y: 0,
    radius: 18,
    hp: 100, maxHp: 100,
    speed: 160,
    facing: 0,
    level: 1, xp: 0, xpNext: 5,
    invuln: 0,
    // 武器パラメータ
    attackInterval: 1.5,
    attackTimer: 0,
    castMult: 1,            // 詠唱加速で下がる全武器共通の発動速度倍率
    bulletSpeed: 300,
    bulletDamage: 10,
    bulletCount: 1,         // 魔法弾の同時発射数(魔法弾強化で増加)
    bulletDamageBonus: 0,   // 魔法弾のみの追加ダメージ(魔法弾強化で増加)
    spellUpCount: 0,        // 魔法弾強化の取得回数(奇数=弾数+1, 偶数=ダメージ+8)
    // ダークゴスペル(範囲攻撃)
    darkgospel: {
      level: 0,            // 0=未取得、1〜5
      timer: 3.0,
      interval: 3.0,
    },
    // ラブリーヌード(扇状貫通)
    lovelynude: {
      level: 0,            // 0=未取得、1〜6
      timer: 3.0,
      interval: 3.0,
    },
    // シャドウオーブ(周回弾)
    shadoworb: {
      level: 0,
      angle: 0,           // 現在の周回角度
    },
    // メテオ(遅延爆発)
    meteor: {
      level: 0,
      timer: 4.0,
      interval: 4.0,
    },
    // アニメーション
    anim: {
      state: "idle",       // "idle" or "attack"
      frame: 0,
      timer: 0,
      facingLeft: true,    // true=左向き(元画像のまま) / false=右向き(反転して表示)
      fireCallback: null,
      fireTriggered: false,
    },
  };

  currentStage = 1;
  elapsed = 0;
  killCount = 0;
  resetStageCombatState();
  gameState = STATE_PLAYING;

  // 開始直後から敵を出す
  for (let i = 0; i < 5; i++) spawnEnemy();

  hideOverlay("title");
  hideOverlay("gameover");
  hideOverlay("clear");
  hideOverlay("levelup");
}

// ---------- 攻撃アニメーション ----------
// 攻撃時にATTACKモーションを再生し、frame index 3 で onFire を1度だけ呼ぶ
// (4フレーム目=魔法弾が生成されるタイミング)
function startAttackAnimation(onFire) {
  player.anim.state = "attack";
  player.anim.frame = 0;
  player.anim.timer = 0;
  player.anim.fireCallback = onFire || null;
  player.anim.fireTriggered = false;
}

function updatePlayerAnim(dt) {
  const a = player.anim;
  a.timer += dt;
  if (a.state === "idle") {
    const ft = 0.15;
    while (a.timer >= ft) {
      a.timer -= ft;
      a.frame = (a.frame + 1) % sprites.idle.count;
    }
  } else if (a.state === "attack") {
    const ft = 0.08;
    while (a.timer >= ft) {
      a.timer -= ft;
      a.frame += 1;
      if (a.frame >= sprites.attack.count) {
        // ATTACK終了 -> IDLE へ
        a.state = "idle";
        a.frame = 0;
        a.timer = 0;
        a.fireCallback = null;
        a.fireTriggered = false;
        break;
      }
    }
    // attack_3 (4フレーム目, index 3) で弾を生成
    if (!a.fireTriggered && a.frame >= 3 && a.fireCallback) {
      a.fireCallback();
      a.fireTriggered = true;
    }
  }
}

// ---------- ユーティリティ ----------
function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
function nearestEnemy() {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    const d = dist2(e.x, e.y, player.x, player.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

// ---------- 敵スポーン ----------
// ★序盤のわき抑制倍率: 最初の30秒は1/4、30秒〜1分は1/2(間隔をこの倍率で伸ばす)
function earlySpawnMul() {
  if (elapsed < 30) return 4;
  if (elapsed < 60) return 2;
  return 1;
}
function getSpawnInterval() {
  let base;
  if (currentStage === 1) {
    // ステージ1: 初期2.0秒、10分で0.6秒
    base = Math.max(0.6, 2.0 - elapsed * 0.0023);
  } else if (currentStage === 2) {
    // ステージ2: 初期1.2秒、10分で0.3秒
    base = Math.max(0.3, 1.2 - elapsed * 0.0015);
  } else {
    // ステージ3: 初期0.8秒、10分で0.2秒
    base = Math.max(0.2, 0.8 - elapsed * 0.001);
  }
  // 序盤倍率。ステージ1は専用調整(0〜30秒:約5.0秒 / 30〜60秒:約3秒)
  let mul = earlySpawnMul();
  if (currentStage === 1) {
    if (elapsed < 30) mul = 2.5;
    else if (elapsed < 60) mul = 1.55;
  }
  return base * mul;
}
function getEnemyCap() {
  if (currentStage === 1) return Math.min(100, 20 + Math.floor(elapsed * 0.22));
  if (currentStage === 2) return Math.min(180, 30 + Math.floor(elapsed * 0.33));
  return Math.min(250, 40 + Math.floor(elapsed * 0.45));
}
function getEnemySpeedScale() {
  if (currentStage === 1) return 1.0 + elapsed * 0.001;
  if (currentStage === 2) return 1.15 + elapsed * 0.0018;
  return 1.35 + elapsed * 0.0025;
}

// 時間経過で敵の基礎HPも増加(ステージ別)
function getEnemyHp() {
  if (currentStage === 1) return Math.floor(25 + elapsed * 0.08);
  if (currentStage === 2) return Math.floor(35 + elapsed * 0.15);
  return Math.floor(55 + elapsed * 0.22);
}

function spawnEnemy() {
  // 画面外円周上にスポーン
  const angle = Math.random() * Math.PI * 2;
  const dist = 480 + Math.random() * 80;
  const ex = player.x + Math.cos(angle) * dist;
  const ey = player.y + Math.sin(angle) * dist;
  const hp = getEnemyHp();
  enemies.push({
    x: ex, y: ey,
    radius: 22,
    hp, maxHp: hp,
    // ★速度強化: 基礎75(旧60)、ランダム幅も拡大
    speed: 75 * getEnemySpeedScale() * (0.8 + Math.random() * 0.4),
    // ★接触ダメージ強化: 15(旧10)
    contactDamage: 15,
    contactCD: 0,
    hitFlash: 0,
    facingLeft: true,
    animFrame: 0,
    animTimer: Math.random() * 0.3,
  });
}

function spawnLoop(dt) {
  // タブ切り替え等で dt が大きくなっても上限を設ける
  const safeDt = Math.min(dt, 0.1);
  spawnTimer += safeDt;
  // 0以下にならないよう interval を保護(過剰ループ・0除算防止)
  const interval = Math.max(0.1, getSpawnInterval());
  // 1フレーム内のスポーン回数に上限(無限ループ防止)
  let spawnCount = 0;
  while (spawnTimer >= interval && enemies.length < getEnemyCap() && spawnCount < 10) {
    spawnTimer -= interval;
    spawnEnemy();
    spawnCount++;
    // ステージによって複数スポーンのタイミングを調整
    if (currentStage === 1) {
      if (elapsed >= 180 && enemies.length < getEnemyCap()) spawnEnemy();
    } else if (currentStage === 2) {
      if (elapsed >= 120 && enemies.length < getEnemyCap()) spawnEnemy();
      if (elapsed >= 240 && enemies.length < getEnemyCap()) spawnEnemy();
    } else {
      if (elapsed >= 60  && enemies.length < getEnemyCap()) spawnEnemy();
      if (elapsed >= 180 && enemies.length < getEnemyCap()) spawnEnemy();
      if (elapsed >= 360 && enemies.length < getEnemyCap()) spawnEnemy();
    }
  }
  if (spawnTimer > Math.max(2, interval)) spawnTimer = Math.max(2, interval);
}

// ---------- ダメージ・経験値処理 ----------
function damageEnemy(enemy, dmg) {
  enemy.hp -= dmg;
  enemy.hitFlash = 0.08;
  if (enemy.hp <= 0) killEnemy(enemy);
}
function killEnemy(enemy) {
  killCount++;
  // 経験値オーブをドロップ
  xpOrbs.push({
    x: enemy.x, y: enemy.y,
    vx: (Math.random() - 0.5) * 60,
    vy: (Math.random() - 0.5) * 60,
    xp: 4,
  });
  enemy.dead = true;
}
function damagePlayer(dmg) {
  if (player.invuln > 0) return;
  player.hp -= dmg;
  Sound.hurt();
  // ★無敵時間短縮: 0.3秒(旧0.5秒) — より連続ダメージが通りやすく
  player.invuln = 0.3;
  if (player.hp <= 0) {
    player.hp = 0;
    gameState = STATE_GAMEOVER;
    showGameOver();
  }
}
function gainXp(amount) {
  if (amount > 0) Sound.xp();
  player.xp += amount;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level += 1;
    // ★必要経験値を大幅増加(旧より約1.6倍)
    player.xpNext = Math.floor(10 + player.level * 4 + Math.pow(player.level, 1.7));
    triggerLevelUp();
  }
}

// ---------- レベルアップ画面 ----------
function buildChoices() {
  // available() があるものは現在のプレイヤー状態で利用可能なもののみ残す
  const pool = UPGRADES.filter((u) => !u.available || u.available(player));
  const result = [];
  while (result.length < 3 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}
function triggerLevelUp() {
  gameState = STATE_LEVELUP;
  Sound.levelUp();
  const choices = buildChoices();
  const cardsEl = document.getElementById("cards");
  cardsEl.innerHTML = "";
  for (const c of choices) {
    const el = document.createElement("div");
    el.className = "card";
    const descText = c.getDesc ? c.getDesc(player) : c.desc;
    el.innerHTML = `
      <div class="icon">${c.icon}</div>
      <div class="name">${c.name}</div>
      <div class="desc">${descText}</div>
    `;
    el.onclick = () => {
      Sound.cardSelect();
      c.apply(player);
      hideOverlay("levelup");
      // 連続レベルアップに対応
      if (player.xp >= player.xpNext) {
        // gainXp の繰り返し処理に再委譲
        player.level -= 1;
        player.xp += player.xpNext;
        gainXp(0);
      } else {
        gameState = STATE_PLAYING;
      }
    };
    cardsEl.appendChild(el);
  }
  showOverlay("levelup");
}

// ---------- ダークゴスペル(紫の雷) ----------
// 8方向 / 4方向の角度テーブル
const DIRS_4 = [0, 90, 180, 270].map((d) => d * Math.PI / 180);
const DIRS_8 = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => d * Math.PI / 180);

// 武器レベルに応じて雷を配置する
function spawnLightnings(level) {
  Sound.thunder();
  const INNER = 100, OUTER = 200;
  const damage = player.bulletDamage * 0.7;
  const isLv5 = (level >= 5);

  const push = (a, r) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    lightnings.push({
      x: player.x + dx * r, y: player.y + dy * r,
      dirX: dx, dirY: dy,
      spriteFrame: 0, spriteTimer: 0,
      damage: damage,
      lv5: isLv5,
      expanding: false, expandDist: 0, expandSpeed: 100,
      dead: false,
      hits: new Set(),
    });
  };

  // 内側リング: Lv1=4方向, Lv2以上=8方向
  const innerDirs = (level === 1) ? DIRS_4 : DIRS_8;
  for (const a of innerDirs) push(a, INNER);

  // 外側リング: Lv3=4方向, Lv4以上=8方向
  if (level >= 3) {
    const outerDirs = (level === 3) ? DIRS_4 : DIRS_8;
    for (const a of outerDirs) push(a, OUTER);
  }
}

// ダークゴスペルのクールダウン管理
function updateDarkGospel(dt) {
  if (player.darkgospel.level <= 0) return;
  player.darkgospel.timer -= dt;
  if (player.darkgospel.timer <= 0) {
    player.darkgospel.timer = player.darkgospel.interval * player.castMult;
    spawnLightnings(player.darkgospel.level);
  }
}

// 雷とすべての敵・ボスとの当たり判定。1度ヒットした対象は hits に記録して再ヒットしない
function dealLightningDamage(o) {
  const HIT_R = 48;
  for (const e of enemies) {
    if (e.dead || o.hits.has(e)) continue;
    if (circleHit(o.x, o.y, HIT_R, e.x, e.y, e.radius)) {
      damageEnemy(e, o.damage);
      o.hits.add(e);
    }
  }
  if (boss && !o.hits.has(boss) &&
      circleHit(o.x, o.y, HIT_R, boss.x, boss.y, boss.radius)) {
    damageBoss(o.damage);
    o.hits.add(boss);
  }
  for (const el of yonyonElites) {
    if (el.dead || o.hits.has(el)) continue;
    if (circleHit(o.x, o.y, HIT_R, el.x, el.y, el.radius)) {
      damageYonYon(el, o.damage, o.x, o.y);
      o.hits.add(el);
    }
  }
  for (const el of pottyElites) {
    if (el.dead || o.hits.has(el)) continue;
    if (circleHit(o.x, o.y, HIT_R, el.x, el.y, el.radius)) {
      damagePotty(el, o.damage, o.x, o.y);
      o.hits.add(el);
    }
  }
  for (const el of daisyEnemies) {
    if (el.dead || o.hits.has(el)) continue;
    if (circleHit(o.x, o.y, HIT_R, el.x, el.y, el.radius)) {
      damageDaisy(el, o.damage, o.x, o.y);
      o.hits.add(el);
    }
  }
  for (const el of konbuElites) {
    if (el.dead || o.hits.has(el)) continue;
    if (circleHit(o.x, o.y, HIT_R, el.x, el.y, el.radius)) {
      damageKonbu(el, o.damage, o.x, o.y);
      o.hits.add(el);
    }
  }
  for (const el of porinemuEnemies) {
    if (el.dead || o.hits.has(el)) continue;
    if (circleHit(o.x, o.y, HIT_R, el.x, el.y, el.radius)) {
      damagePorinemu(el, o.damage, o.x, o.y);
      o.hits.add(el);
    }
  }
}

function updateLightnings(dt) {
  for (const o of lightnings) {
    o.spriteTimer += dt;

    if (!o.expanding) {
      if (o.spriteFrame < sprites.darkgospel_effect.count - 1) {
        // フレーム進行 f0 → f1 → f2 (0.2秒/フレーム)
        if (o.spriteTimer >= 0.2) {
          o.spriteTimer = 0;
          o.spriteFrame += 1;
        }
      } else {
        // 最終フレーム到達 → 0.2秒後にヒット処理
        if (o.spriteTimer >= 0.2) {
          dealLightningDamage(o);
          if (o.lv5) {
            // Lv5: 拡散モードへ
            o.expanding = true;
            o.expandDist = 0;
            o.spriteTimer = 0;
          } else {
            o.dead = true;
          }
        }
      }
    } else {
      // 拡散モード: 外側方向へ移動しながら継続ダメージ
      const step = o.expandSpeed * dt;
      o.x += o.dirX * step;
      o.y += o.dirY * step;
      o.expandDist += step;
      dealLightningDamage(o);
      if (o.expandDist >= 100) o.dead = true;
    }
  }
  lightnings = lightnings.filter((o) => !o.dead);
}

function drawLightning(o) {
  const sheet = sprites.darkgospel_effect;
  const frameImg = sheet.loaded ? sheet.frames[o.spriteFrame] : null;
  if (frameImg) {
    const drawSize = sheet.drawSize; // 96
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.drawImage(frameImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
  } else {
    // フォールバック: 紫の発光円
    ctx.save();
    ctx.fillStyle = "rgba(180, 80, 255, 0.6)";
    ctx.shadowColor = "#cc66ff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- ラブリーヌード(闇ハートの扇状貫通弾) ----------
// レベル毎の弾数とサイズ
const LOVELY_COUNT = [1, 1, 2, 2, 3, 3]; // index = level - 1
const LOVELY_SIZE  = [80, 120, 120, 160, 160, 200];
const LOVELY_SPEED = 400;
const LOVELY_LIFE  = 3.0;
const LOVELY_SPREAD_DEG = 15;

// 全種類の敵(通常敵・特殊敵・ボス)を1つの配列にまとめて返す
function allEnemyTargets() {
  const list = [];
  for (const e of enemies)         if (!e.dead) list.push(e);
  for (const e of yonyonElites)    if (!e.dead) list.push(e);
  for (const e of pottyElites)     if (!e.dead) list.push(e);
  for (const e of daisyEnemies)    if (!e.dead) list.push(e);
  for (const e of konbuElites)     if (!e.dead) list.push(e);
  for (const e of porinemuEnemies) if (!e.dead) list.push(e);
  if (boss && !boss.dead) list.push(boss);
  return list;
}

// 最近接の敵(全種類・ボス含む)を返す
function nearestTarget() {
  let best = null, bestD = Infinity;
  for (const e of allEnemyTargets()) {
    const d = dist2(e.x, e.y, player.x, player.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function spawnLovelyNudes(level) {
  const target = nearestTarget();
  if (!target) return;
  const count = LOVELY_COUNT[level - 1];
  const size  = LOVELY_SIZE[level - 1];
  const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
  // 弾数別の広がり角度(度)
  let angles;
  if (count === 1) angles = [0];
  else if (count === 2) angles = [-LOVELY_SPREAD_DEG, LOVELY_SPREAD_DEG];
  else angles = [-LOVELY_SPREAD_DEG, 0, LOVELY_SPREAD_DEG];

  const damage = player.bulletDamage * 0.7;

  for (const deg of angles) {
    const a = baseAngle + deg * Math.PI / 180;
    lovenudes.push({
      x: player.x, y: player.y,
      vx: Math.cos(a) * LOVELY_SPEED,
      vy: Math.sin(a) * LOVELY_SPEED,
      angle: a,
      drawSize: size,
      hitRadius: size * 0.3,
      damage: damage,
      life: LOVELY_LIFE,
      hitEnemies: new Set(),    // 貫通済み対象(重複ヒット防止)
      dead: false,
    });
  }
}

function updateLovelyNude(dt) {
  if (player.lovelynude.level <= 0) return;
  player.lovelynude.timer -= dt;
  if (player.lovelynude.timer <= 0) {
    player.lovelynude.timer = player.lovelynude.interval * player.castMult;
    spawnLovelyNudes(player.lovelynude.level);
  }
}

function updateLovenudes(dt) {
  for (const p of lovenudes) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }

    // 敵への貫通ヒット
    for (const e of enemies) {
      if (e.dead || p.hitEnemies.has(e)) continue;
      if (circleHit(p.x, p.y, p.hitRadius, e.x, e.y, e.radius)) {
        damageEnemy(e, p.damage);
        p.hitEnemies.add(e);
      }
    }
    // ボスへの貫通ヒット
    if (boss && !p.hitEnemies.has(boss) &&
        circleHit(p.x, p.y, p.hitRadius, boss.x, boss.y, boss.radius)) {
      damageBoss(p.damage);
      p.hitEnemies.add(boss);
    }
    // ヨンヨンへの貫通ヒット
    for (const el of yonyonElites) {
      if (el.dead || p.hitEnemies.has(el)) continue;
      if (circleHit(p.x, p.y, p.hitRadius, el.x, el.y, el.radius)) {
        damageYonYon(el, p.damage, p.x, p.y);
        p.hitEnemies.add(el);
      }
    }
    // ポッティへの貫通ヒット
    for (const el of pottyElites) {
      if (el.dead || p.hitEnemies.has(el)) continue;
      if (circleHit(p.x, p.y, p.hitRadius, el.x, el.y, el.radius)) {
        damagePotty(el, p.damage, p.x, p.y);
        p.hitEnemies.add(el);
      }
    }
    // デイジーへの貫通ヒット
    for (const el of daisyEnemies) {
      if (el.dead || p.hitEnemies.has(el)) continue;
      if (circleHit(p.x, p.y, p.hitRadius, el.x, el.y, el.radius)) {
        damageDaisy(el, p.damage, p.x, p.y);
        p.hitEnemies.add(el);
      }
    }
    // コンブへの貫通ヒット
    for (const el of konbuElites) {
      if (el.dead || p.hitEnemies.has(el)) continue;
      if (circleHit(p.x, p.y, p.hitRadius, el.x, el.y, el.radius)) {
        damageKonbu(el, p.damage, p.x, p.y);
        p.hitEnemies.add(el);
      }
    }
    // ぽりねむへの貫通ヒット
    for (const el of porinemuEnemies) {
      if (el.dead || p.hitEnemies.has(el)) continue;
      if (circleHit(p.x, p.y, p.hitRadius, el.x, el.y, el.radius)) {
        damagePorinemu(el, p.damage, p.x, p.y);
        p.hitEnemies.add(el);
      }
    }
  }
  lovenudes = lovenudes.filter((p) => !p.dead);
}

function drawLovenude(p) {
  const sheet = sprites.lovelynude_effect;
  const frameImg = sheet.loaded ? sheet.frames[0] : null;
  if (frameImg) {
    const drawSize = p.drawSize; // レベル依存
    // 飛行方向に関わらず常に正立で描画(回転・反転は一切かけない)
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.drawImage(frameImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
  } else {
    // フォールバック: 紫のハート風円
    ctx.save();
    ctx.fillStyle = "rgba(200, 60, 180, 0.7)";
    ctx.shadowColor = "#cc44aa";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.drawSize * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- シャドウオーブ(周回防御弾) ----------
// Lv毎の弾数テーブル: [1,2,3,4,6]
const ORBS_COUNT = [1, 2, 3, 4, 6];
const ORB_ORBIT_RADIUS = 80;
const ORB_ORBIT_SPEED = 2.2;   // rad/sec
const ORB_HIT_RADIUS = 18;
const ORB_DAMAGE_FACTOR = 0.8;

function updateShadowOrbs(dt) {
  if (!player || player.shadoworb.level <= 0) return;
  const level = player.shadoworb.level;
  const count = ORBS_COUNT[level - 1];
  player.shadoworb.angle += ORB_ORBIT_SPEED * dt;

  // shadowOrbs 配列は毎フレーム再構築(位置と当たり判定を更新)
  shadowOrbs = [];
  const dmg = player.bulletDamage * ORB_DAMAGE_FACTOR;
  for (let i = 0; i < count; i++) {
    const a = player.shadoworb.angle + (i / count) * Math.PI * 2;
    const ox = player.x + Math.cos(a) * ORB_ORBIT_RADIUS;
    const oy = player.y + Math.sin(a) * ORB_ORBIT_RADIUS;
    shadowOrbs.push({ x: ox, y: oy, angle: a });

    // 敵との衝突(0.5秒クールダウンは敵側の contactCD を流用)
    for (const e of enemies) {
      if (e.dead) continue;
      if (circleHit(ox, oy, OHit_R(), e.x, e.y, e.radius)) {
        if (!e.orbCD || e.orbCD <= 0) {
          damageEnemy(e, dmg);
          e.orbCD = 0.5;
        }
      }
    }
    if (boss && circleHit(ox, oy, OHit_R(), boss.x, boss.y, boss.radius)) {
      if (!boss.orbCD || boss.orbCD <= 0) {
        damageBoss(dmg);
        boss.orbCD = 0.5;
      }
    }
    for (const el of yonyonElites) {
      if (el.dead) continue;
      if (circleHit(ox, oy, OHit_R(), el.x, el.y, el.radius)) {
        if (!el.orbCD || el.orbCD <= 0) {
          damageYonYon(el, dmg, ox, oy);
          el.orbCD = 0.5;
        }
      }
    }
    for (const el of pottyElites) {
      if (el.dead) continue;
      if (circleHit(ox, oy, OHit_R(), el.x, el.y, el.radius)) {
        if (!el.orbCD || el.orbCD <= 0) {
          damagePotty(el, dmg, ox, oy);
          el.orbCD = 0.5;
        }
      }
    }
    for (const el of daisyEnemies) {
      if (el.dead) continue;
      if (circleHit(ox, oy, OHit_R(), el.x, el.y, el.radius)) {
        if (!el.orbCD || el.orbCD <= 0) {
          damageDaisy(el, dmg, ox, oy);
          el.orbCD = 0.5;
        }
      }
    }
    for (const el of konbuElites) {
      if (el.dead) continue;
      if (circleHit(ox, oy, OHit_R(), el.x, el.y, el.radius)) {
        if (!el.orbCD || el.orbCD <= 0) {
          damageKonbu(el, dmg, ox, oy);
          el.orbCD = 0.5;
        }
      }
    }
    for (const el of porinemuEnemies) {
      if (el.dead) continue;
      if (circleHit(ox, oy, OHit_R(), el.x, el.y, el.radius)) {
        if (!el.orbCD || el.orbCD <= 0) {
          damagePorinemu(el, dmg, ox, oy);
          el.orbCD = 0.5;
        }
      }
    }
  }
  for (const e of enemies) if (e.orbCD > 0) e.orbCD -= dt;
  if (boss && boss.orbCD > 0) boss.orbCD -= dt;
  for (const el of yonyonElites) if (el.orbCD > 0) el.orbCD -= dt;
  for (const el of pottyElites) if (el.orbCD > 0) el.orbCD -= dt;
  for (const el of daisyEnemies) if (el.orbCD > 0) el.orbCD -= dt;
  for (const el of konbuElites) if (el.orbCD > 0) el.orbCD -= dt;
  for (const el of porinemuEnemies) if (el.orbCD > 0) el.orbCD -= dt;
}

function OHit_R() {
  return OHit_R._v || (OHit_R._v = ORB_HIT_RADIUS);
}

function drawShadowOrbs() {
  for (const o of shadowOrbs) {
    ctx.save();
    ctx.translate(o.x, o.y);
    // 発光する紫の球
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, OHit_R() + 4);
    grad.addColorStop(0, "rgba(230, 180, 255, 1)");
    grad.addColorStop(0.5, "rgba(140, 60, 220, 0.8)");
    grad.addColorStop(1, "rgba(80, 20, 140, 0)");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#b178ff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, OHit_R() + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- メテオ(遅延着弾の範囲攻撃) ----------
const METEOR_RADIUS = [60, 75, 90, 105, 125]; // index = level - 1
const METEOR_DAMAGE_FACTOR = [1.5, 1.8, 2.1, 2.5, 3.0];
const METEOR_INTERVAL = [4.0, 3.5, 3.0, 2.5, 2.0];
const METEOR_DELAY  = 1.0;   // 着弾予告から爆発まで(秒)

function updateMeteor(dt) {
  if (!player || player.meteor.level <= 0) return;
  const lv = player.meteor.level;
  player.meteor.timer -= dt;
  if (player.meteor.timer <= 0) {
    player.meteor.timer = METEOR_INTERVAL[lv - 1] * player.castMult;
    // 最も敵が密集している方向にメテオを落とす
    const target = nearestTarget();
    if (!target) return;
    // ターゲット付近にランダムオフセット
    const ox = target.x + (Math.random() - 0.5) * 60;
    const oy = target.y + (Math.random() - 0.5) * 60;
    meteorEffects.push({
      x: ox, y: oy,
      radius: METEOR_RADIUS[lv - 1],
      damage: player.bulletDamage * METEOR_DAMAGE_FACTOR[lv - 1],
      delay: METEOR_DELAY,    // 残り時間(0になったら爆発)
      explodeTimer: 0.4,       // 爆発エフェクト表示時間
      exploded: false,
      dead: false,
      hitEnemies: new Set(),
    });
  }
}

function updateMeteorEffects(dt) {
  for (const m of meteorEffects) {
    if (!m.exploded) {
      m.delay -= dt;
      if (m.delay <= 0) {
        m.exploded = true;
        // 爆発ダメージ
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - m.x, dy = e.y - m.y;
          if (dx*dx + dy*dy <= (m.radius + e.radius) ** 2) {
            damageEnemy(e, m.damage);
            m.hitEnemies.add(e);
          }
        }
        if (boss) {
          const dx = boss.x - m.x, dy = boss.y - m.y;
          if (dx*dx + dy*dy <= (m.radius + boss.radius) ** 2) {
            damageBoss(m.damage);
          }
        }
        for (const el of yonyonElites) {
          if (el.dead) continue;
          const dx = el.x - m.x, dy = el.y - m.y;
          if (dx*dx + dy*dy <= (m.radius + el.radius) ** 2) {
            damageYonYon(el, m.damage, m.x, m.y);
          }
        }
        for (const el of pottyElites) {
          if (el.dead) continue;
          const dx = el.x - m.x, dy = el.y - m.y;
          if (dx*dx + dy*dy <= (m.radius + el.radius) ** 2) {
            damagePotty(el, m.damage, m.x, m.y);
          }
        }
        for (const el of daisyEnemies) {
          if (el.dead) continue;
          const dx = el.x - m.x, dy = el.y - m.y;
          if (dx*dx + dy*dy <= (m.radius + el.radius) ** 2) {
            damageDaisy(el, m.damage, m.x, m.y);
          }
        }
        for (const el of konbuElites) {
          if (el.dead) continue;
          const dx = el.x - m.x, dy = el.y - m.y;
          if (dx*dx + dy*dy <= (m.radius + el.radius) ** 2) {
            damageKonbu(el, m.damage, m.x, m.y);
          }
        }
        for (const el of porinemuEnemies) {
          if (el.dead) continue;
          const dx = el.x - m.x, dy = el.y - m.y;
          if (dx*dx + dy*dy <= (m.radius + el.radius) ** 2) {
            damagePorinemu(el, m.damage, m.x, m.y);
          }
        }
      }
    } else {
      m.explodeTimer -= dt;
      if (m.explodeTimer <= 0) m.dead = true;
    }
  }
  meteorEffects = meteorEffects.filter(m => !m.dead);
}

function drawMeteorEffects() {
  for (const m of meteorEffects) {
    if (!m.exploded) {
      // 着弾予告サークル(赤点滅)
      const pulse = 0.5 + 0.5 * Math.sin((METEOR_DELAY - m.delay) * Math.PI * 6);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 80, 20, ${0.5 + 0.5 * pulse})`;
      ctx.lineWidth = 2 + pulse * 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.stroke();
      // 隕石アイコン(落下中)
      const dropY = -120 + (METEOR_DELAY - m.delay) / METEOR_DELAY * 110;
      ctx.fillStyle = "rgba(255, 140, 40, 0.9)";
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 18;
      ctx.font = `${28 + pulse * 6}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("☄", m.x, m.y + dropY);
      ctx.restore();
    } else {
      // 爆発エフェクト
      const t = 1 - m.explodeTimer / 0.4;
      const alpha = 1 - t;
      ctx.save();
      const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius * (0.5 + t * 0.8));
      grad.addColorStop(0, `rgba(255, 255, 180, ${alpha})`);
      grad.addColorStop(0.4, `rgba(255, 140, 40, ${alpha * 0.8})`);
      grad.addColorStop(1, `rgba(160, 40, 10, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius * (0.5 + t * 0.8), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// =========================================================================
// ---------- ヨンヨン(エリート敵) ----------
// 通常敵より大幅に強い中ボス的な敵。3分以降に90秒ごとに1体スポーン。
// 固有行動: [突進] と [散弾] を交互に使用。
// =========================================================================
const ELITE_SPAWN_START    = 30;   // 30秒後から出現開始
const ELITE_SPAWN_INTERVAL = 60;   // 60秒ごとに1体

const YONYON_IDLE_TIMES = [0.16, 0.16];
const YONYON_ATTACK_TIMES = [0.80, 0.30, 0.30];
const YONYON_EFFECT_TIMES = [0.13, 0.13, 0.13, 0.13];

function spawnYonYon() {
  const angle = Math.random() * Math.PI * 2;
  const hp = 600 + Math.floor(elapsed * 0.5);
  yonyonElites.push({
    x: player.x + Math.cos(angle) * 540,
    y: player.y + Math.sin(angle) * 540,
    radius: 36,
    hp, maxHp: hp,
    speed: 110,
    contactDamage: 20, contactCD: 0,
    hitFlash: 0,
    dead: false,
    facingLeft: true,
    phase: "chase",
    phaseTimer: 3.0 + Math.random() * 1.5,
    dashVx: 0, dashVy: 0, dashTimer: 0,
    kbVx: 0, kbVy: 0,
    animState: "idle",
    animFrame: 0,
    animTimer: 0,
    attackCooldown: 3.0 + Math.random() * 1.5,
  });
  console.log(`[elite] ヨンヨン 出現 hp=${hp}`);
}

const POTTY_SPAWN_START    = 150;  // 150秒後から出現開始
const POTTY_SPAWN_INTERVAL = 75;   // 75秒ごとに1体

const DAISY_SPAWN_START    = 15;   // 15秒後から出現開始
const DAISY_SPAWN_INTERVAL = 18;   // 基本18秒ごとに1体
const DAISY_ATTACK_RANGE   = 80;   // 攻撃を開始する距離
const DAISY_DAMAGE         = 20;   // 剣エフェクトのダメージ
const DAISY_EFFECT_OFFSET  = 80;   // 剣先オフセット(向き方向にpx)
const DAISY_EFFECT_RADIUS  = 50;   // エフェクトの当たり判定半径

const KONBU_SPAWN_START    = 120;  // 120秒後から出現開始
const KONBU_SPAWN_INTERVAL = 90;   // 90秒ごとに1体
const KONBU_MELEE_RANGE    = 90;   // 近接攻撃の発動距離
const KONBU_MELEE_DAMAGE   = 25;   // 近接ダメージ
const KONBU_WAVE_DAMAGE    = 20;   // 波動ダメージ
const KONBU_WAVE_SPEED     = 280;  // 波動速度(px/秒)
const KONBU_WAVE_LIFE      = 0.9;  // 波動寿命(秒) → 飛距離約252px
const KONBU_WAVE_BASE_ANGLE = -Math.PI / 4; // まきばと同じ基準角

const PORINEMU_SPAWN_START    = 50;  // 50秒後から出現開始
const PORINEMU_SPAWN_INTERVAL = 42;  // 基本42秒ごとに1体
const PORINEMU_MELEE_RANGE    = 85;  // 近接攻撃の発動距離
const PORINEMU_MELEE_DAMAGE   = 15;  // 近接ダメージ(コンブ25より弱い)
const PORINEMU_WAVE_DAMAGE    = 12;  // 波動ダメージ(コンブ20より弱い)
const PORINEMU_WAVE_SPEED     = 260; // 波動速度(px/秒)
const PORINEMU_WAVE_LIFE      = 0.9; // 波動寿命(秒)
const PORINEMU_WAVE_BASE_ANGLE = -Math.PI / 4; // まきばと同じ基準角

const POTTY_IDLE_TIMES   = [0.18, 0.18, 0.18];
const POTTY_ATTACK_TIMES = [0.25, 0.25, 0.65, 0.25];
const POTTY_EFFECT_TIMES = [0.10, 0.10, 0.20, 0.30];
const POTTY_METEOR_RADIUS = 60;   // 予測円の半径
const POTTY_METEOR_DAMAGE = 30;   // メテオダメージ

function spawnPotty() {
  const angle = Math.random() * Math.PI * 2;
  const hp = 800 + Math.floor(elapsed * 0.6);
  pottyElites.push({
    x: player.x + Math.cos(angle) * 540,
    y: player.y + Math.sin(angle) * 540,
    radius: 34,
    hp, maxHp: hp,
    speed: 95,
    contactDamage: 18, contactCD: 0,
    hitFlash: 0,
    dead: false,
    facingLeft: true,
    phase: "chase",
    phaseTimer: 3.0 + Math.random() * 1.5,
    kbVx: 0, kbVy: 0,
    animState: "idle",
    animFrame: 0,
    animTimer: 0,
    // メテオ関連
    meteors: [{x:0,y:0,hit:false},{x:0,y:0,hit:false}], // 2か所の予測円
    meteorActive: false,       // 予測円表示中か
  });
  console.log(`[elite] ポッティ 出現 hp=${hp}`);
}

function pottySpawnLoop(dt) {
  if (elapsed < POTTY_SPAWN_START) return;
  // ステージ1はゆっくり出現
  const interval = currentStage === 1 ? POTTY_SPAWN_INTERVAL * 1.5 : POTTY_SPAWN_INTERVAL;
  pottySpawnTimer += dt;
  if (pottySpawnTimer >= interval) {
    pottySpawnTimer -= interval;
    spawnPotty();
  }
}

// ─── デイジー(雑魚・剣士) ───

function spawnDaisy() {
  const angle = Math.random() * Math.PI * 2;
  const dist  = 420 + Math.random() * 80;
  const hp    = 150;
  daisyEnemies.push({
    x: player.x + Math.cos(angle) * dist,
    y: player.y + Math.sin(angle) * dist,
    radius: 22,
    hp, maxHp: hp,
    speed: 110,
    dead: false,
    hitFlash: 0,
    kbVx: 0, kbVy: 0,
    phase: "chase",
    phaseTimer: 0,
    animState: "idle",
    animFrame: 0,
    animTimer: 0,
    facingLeft: true,
    effectX: 0, effectY: 0,  // エフェクト表示座標
    effectActive: false,      // エフェクト表示中か
    effectHit: false,         // このサイクルでダメージ済みか
    orbCD: 0,
  });
}

function daisySpawnLoop(dt) {
  if (elapsed < DAISY_SPAWN_START) return;
  // ★序盤抑制: 〜60秒は×8、〜120秒は×4、それ以降は等倍
  const mul = elapsed < 60 ? 8 : (elapsed < 120 ? 4 : 1);
  const interval = DAISY_SPAWN_INTERVAL * mul;
  daisySpawnTimer += dt;
  if (daisySpawnTimer >= interval) {
    daisySpawnTimer -= interval;
    spawnDaisy();
  }
}

// ─── コンブ（エリート・青鎧騎士） ───

function spawnKonbu() {
  const angle = Math.random() * Math.PI * 2;
  const dist  = 480 + Math.random() * 80;
  const hp    = 3000;
  konbuElites.push({
    x: player.x + Math.cos(angle) * dist,
    y: player.y + Math.sin(angle) * dist,
    radius: 32,
    hp, maxHp: hp,
    speed: 110,
    contactDamage: 15, contactCD: 0,
    meleeDamage: KONBU_MELEE_DAMAGE,
    meleeRange: KONBU_MELEE_RANGE,
    meleeInterval: 1.2, meleeTimer: 1.2,
    waveDamage: KONBU_WAVE_DAMAGE,
    waveInterval: 2.5, waveTimer: 2.5,
    dead: false,
    hitFlash: 0,
    kbVx: 0, kbVy: 0,
    state: "idle",
    pendingAttack: null,
    frame: 0, animTimer: 0,
    fireCallback: null, fireTriggered: false,
    orbCD: 0,
  });
  console.log("[elite] コンブ 出現");
}

function konbuSpawnLoop(dt) {
  if (elapsed < KONBU_SPAWN_START) return;
  konbuSpawnTimer += dt;
  if (konbuSpawnTimer >= KONBU_SPAWN_INTERVAL) {
    konbuSpawnTimer -= KONBU_SPAWN_INTERVAL;
    spawnKonbu();
  }
}

function damageKonbu(e, dmg, fromX, fromY) {
  e.hp -= dmg; e.hitFlash = 0.08;
  const dx = e.x - fromX, dy = e.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  e.kbVx += (dx / d) * 100; e.kbVy += (dy / d) * 100;
  if (e.hp <= 0) {
    killCount++;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, r = 12 + Math.random() * 50;
      xpOrbs.push({ x: e.x + Math.cos(a)*r, y: e.y + Math.sin(a)*r,
        vx: Math.cos(a)*90, vy: Math.sin(a)*90, xp: 15 });
    }
    e.dead = true;
    console.log("[elite] コンブ撃破!");
  }
}

function startKonbuAttack(e, type) {
  e.state = "attack";
  e.frame = 0;
  e.animTimer = 0;
  e.fireTriggered = false;
  e.pendingAttack = type;
  const angle = Math.atan2(player.y - e.y, player.x - e.x);
  e.fireCallback = () => {
    if (type === "melee") {
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if (d < e.meleeRange) damagePlayer(e.meleeDamage);
    } else if (type === "wave") {
      konbuWaves.push({
        x: e.x, y: e.y,
        vx: Math.cos(angle) * KONBU_WAVE_SPEED,
        vy: Math.sin(angle) * KONBU_WAVE_SPEED,
        angle: angle,
        damage: e.waveDamage,
        hitRadius: 55,
        life: KONBU_WAVE_LIFE,
        maxLife: KONBU_WAVE_LIFE,
        hit: false,
        dead: false,
      });
    }
  };
}

function updateSingleKonbu(e, dt) {
  if (e.hitFlash > 0) e.hitFlash -= dt;
  if (e.contactCD > 0) e.contactCD -= dt;

  // ノックバック
  if (Math.abs(e.kbVx) > 0.1 || Math.abs(e.kbVy) > 0.1) {
    e.x += e.kbVx * dt;
    e.y += e.kbVy * dt;
    e.kbVx *= Math.pow(0.05, dt);
    e.kbVy *= Math.pow(0.05, dt);
  }

  // 接触ダメージ
  if (circleHit(e.x, e.y, e.radius, player.x, player.y, player.radius)) {
    if (e.contactCD <= 0) {
      damagePlayer(e.contactDamage);
      e.contactCD = 0.7;
    }
  }

  // プレイヤーへ接近（攻撃中は低速）
  const dx = player.x - e.x, dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const moveScale = e.state === "attack" ? 0.3 : 1.0;
  e.x += (dx / d) * e.speed * moveScale * dt;
  e.y += (dy / d) * e.speed * moveScale * dt;

  e.animTimer += dt;

  if (e.state === "idle") {
    // idleアニメループ
    const ft = 0.18;
    while (e.animTimer >= ft) {
      e.animTimer -= ft;
      e.frame = (e.frame + 1) % sprites.konbu_idle.count;
    }
    e.meleeTimer -= dt;
    e.waveTimer  -= dt;
    const dist = Math.hypot(player.x - e.x, player.y - e.y);
    if (dist <= e.meleeRange) {
      if (e.meleeTimer <= 0) {
        e.meleeTimer = e.meleeInterval;
        startKonbuAttack(e, "melee");
      }
    } else {
      if (e.waveTimer <= 0) {
        e.waveTimer = e.waveInterval;
        startKonbuAttack(e, "wave");
      }
    }
  } else if (e.state === "attack") {
    const ft = 0.12;
    while (e.animTimer >= ft) {
      e.animTimer -= ft;
      e.frame++;
      if (e.frame >= sprites.konbu_attack.count) {
        e.state = "idle";
        e.frame = 0;
        e.fireCallback = null;
        e.fireTriggered = false;
        break;
      }
    }
    // 2フレーム目(index 1)で攻撃判定発生
    if (!e.fireTriggered && e.frame >= 1 && e.fireCallback) {
      e.fireCallback();
      e.fireTriggered = true;
    }
  }
}

function updateKonbuElites(dt) {
  for (const e of konbuElites) updateSingleKonbu(e, dt);
  konbuElites = konbuElites.filter(e => !e.dead);
}

function updateKonbuWaves(dt) {
  for (const w of konbuWaves) {
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.life -= dt;
    if (w.life <= 0) { w.dead = true; continue; }
    if (!w.hit && circleHit(w.x, w.y, w.hitRadius, player.x, player.y, player.radius)) {
      damagePlayer(w.damage);
      w.hit = true;
    }
  }
  konbuWaves = konbuWaves.filter(w => !w.dead);
}

function drawKonbuElites() {
  function drawWithMultiply(img, x, y, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(img, x, y, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  for (const e of konbuElites) {
    // 影
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 36, 32, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // HPバー
    const bw = 60, bh = 6;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(e.x - bw/2, e.y - e.radius - 22, bw, bh);
    ctx.fillStyle = e.hp / e.maxHp > 0.5 ? "#44ccff" : "#2266cc";
    ctx.fillRect(e.x - bw/2, e.y - e.radius - 22, bw * Math.max(0, e.hp/e.maxHp), bh);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    ctx.strokeRect(e.x - bw/2, e.y - e.radius - 22, bw, bh);

    // 名前ラベル
    ctx.save();
    ctx.fillStyle = "#aaddff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("コンブ", e.x, e.y - e.radius - 26);
    ctx.restore();

    // スプライト
    const sheet = e.state === "attack" ? sprites.konbu_attack : sprites.konbu_idle;
    const fi = Math.min(e.frame, sheet.frames.length - 1);
    const frameImg = sheet.loaded ? sheet.frames[fi] : null;
    const drawSize = sheet.drawSize;
    const dxOff = -drawSize / 2;
    const dyOff = 28 - drawSize + 35;

    if (frameImg) {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (player.x > e.x) ctx.scale(-1, 1);
      drawWithMultiply(frameImg, dxOff, dyOff, drawSize, drawSize);
      if (e.hitFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.7;
        ctx.drawImage(frameImg, dxOff, dyOff, drawSize, drawSize);
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : "#4488ff";
      ctx.shadowColor = "#0044cc"; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
}

function drawKonbuWaves() {
  const sheet = sprites.konbu_effect;
  for (const w of konbuWaves) {
    const frameImg = sheet.loaded ? sheet.frames[0] : null;
    if (frameImg) {
      const drawW = sheet.drawW || 320;
      const drawH = sheet.drawH || 220;
      const t = Math.max(0, Math.min(1, w.life / w.maxLife));
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle + KONBU_WAVE_BASE_ANGLE);
      ctx.scale(-1, 1);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.4 + 0.5 * t;
      ctx.drawImage(frameImg, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      // フォールバック
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle);
      ctx.fillStyle = "rgba(60, 120, 255, 0.5)";
      ctx.fillRect(-130, -35, 260, 70);
      ctx.restore();
    }
  }
}

// ─── ぽりねむ（雑魚・近接＋波動タイプ） ───

function spawnPorinemu() {
  const angle = Math.random() * Math.PI * 2;
  const dist  = 440 + Math.random() * 80;
  const hp    = 200;
  porinemuEnemies.push({
    x: player.x + Math.cos(angle) * dist,
    y: player.y + Math.sin(angle) * dist,
    radius: 24,
    hp, maxHp: hp,
    speed: 105,
    contactDamage: 10, contactCD: 0,
    meleeDamage: PORINEMU_MELEE_DAMAGE,
    meleeRange: PORINEMU_MELEE_RANGE,
    meleeInterval: 1.4, meleeTimer: 1.4,
    waveDamage: PORINEMU_WAVE_DAMAGE,
    waveInterval: 3.0, waveTimer: 3.0,
    dead: false,
    hitFlash: 0,
    kbVx: 0, kbVy: 0,
    state: "idle",
    pendingAttack: null,
    frame: 0, animTimer: 0,
    fireCallback: null, fireTriggered: false,
    orbCD: 0,
  });
}

function porinemuSpawnLoop(dt) {
  if (elapsed < PORINEMU_SPAWN_START) return;
  // ★序盤抑制: 〜120秒は×1(初出現約92秒)、〜240秒は×2、それ以降は等倍
  const mul = elapsed < 120 ? 1 : (elapsed < 240 ? 2 : 1);
  const interval = PORINEMU_SPAWN_INTERVAL * mul;
  porinemuSpawnTimer += dt;
  if (porinemuSpawnTimer >= interval) {
    porinemuSpawnTimer -= interval;
    spawnPorinemu();
  }
}

function damagePorinemu(e, dmg, fromX, fromY) {
  e.hp -= dmg; e.hitFlash = 0.08;
  const dx = e.x - fromX, dy = e.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  e.kbVx += (dx / d) * 130; e.kbVy += (dy / d) * 130;
  if (e.hp <= 0) {
    killCount++;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, r = 10 + Math.random() * 32;
      xpOrbs.push({ x: e.x + Math.cos(a)*r, y: e.y + Math.sin(a)*r,
        vx: Math.cos(a)*80, vy: Math.sin(a)*80, xp: 6 });
    }
    e.dead = true;
  }
}

function startPorinemuAttack(e, type) {
  e.state = "attack";
  e.frame = 0;
  e.animTimer = 0;
  e.fireTriggered = false;
  e.pendingAttack = type;
  const angle = Math.atan2(player.y - e.y, player.x - e.x);
  e.fireCallback = () => {
    if (type === "melee") {
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if (d < e.meleeRange) damagePlayer(e.meleeDamage);
    } else if (type === "wave") {
      porinemuWaves.push({
        x: e.x, y: e.y,
        vx: Math.cos(angle) * PORINEMU_WAVE_SPEED,
        vy: Math.sin(angle) * PORINEMU_WAVE_SPEED,
        angle: angle,
        damage: e.waveDamage,
        hitRadius: 50,
        life: PORINEMU_WAVE_LIFE,
        maxLife: PORINEMU_WAVE_LIFE,
        hit: false,
        dead: false,
      });
    }
  };
}

function updateSinglePorinemu(e, dt) {
  if (e.hitFlash > 0) e.hitFlash -= dt;
  if (e.contactCD > 0) e.contactCD -= dt;

  // ノックバック
  if (Math.abs(e.kbVx) > 0.1 || Math.abs(e.kbVy) > 0.1) {
    e.x += e.kbVx * dt;
    e.y += e.kbVy * dt;
    e.kbVx *= Math.pow(0.05, dt);
    e.kbVy *= Math.pow(0.05, dt);
  }

  // 接触ダメージ
  if (circleHit(e.x, e.y, e.radius, player.x, player.y, player.radius)) {
    if (e.contactCD <= 0) {
      damagePlayer(e.contactDamage);
      e.contactCD = 0.7;
    }
  }

  // プレイヤーへ接近（攻撃中は低速）
  const dx = player.x - e.x, dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const moveScale = e.state === "attack" ? 0.3 : 1.0;
  e.x += (dx / d) * e.speed * moveScale * dt;
  e.y += (dy / d) * e.speed * moveScale * dt;

  e.animTimer += dt;

  if (e.state === "idle") {
    const ft = 0.18;
    while (e.animTimer >= ft) {
      e.animTimer -= ft;
      e.frame = (e.frame + 1) % sprites.porinemu_idle.count;
    }
    e.meleeTimer -= dt;
    e.waveTimer  -= dt;
    const dist = Math.hypot(player.x - e.x, player.y - e.y);
    if (dist <= e.meleeRange) {
      if (e.meleeTimer <= 0) {
        e.meleeTimer = e.meleeInterval;
        startPorinemuAttack(e, "melee");
      }
    } else {
      if (e.waveTimer <= 0) {
        e.waveTimer = e.waveInterval;
        startPorinemuAttack(e, "wave");
      }
    }
  } else if (e.state === "attack") {
    const ft = 0.12;
    while (e.animTimer >= ft) {
      e.animTimer -= ft;
      e.frame++;
      if (e.frame >= sprites.porinemu_attack.count) {
        e.state = "idle";
        e.frame = 0;
        e.fireCallback = null;
        e.fireTriggered = false;
        break;
      }
    }
    // 2フレーム目(index 1)で攻撃判定発生
    if (!e.fireTriggered && e.frame >= 1 && e.fireCallback) {
      e.fireCallback();
      e.fireTriggered = true;
    }
  }
}

function updatePorinemuEnemies(dt) {
  for (const e of porinemuEnemies) updateSinglePorinemu(e, dt);
  porinemuEnemies = porinemuEnemies.filter(e => !e.dead);
}

function updatePorinemuWaves(dt) {
  for (const w of porinemuWaves) {
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.life -= dt;
    if (w.life <= 0) { w.dead = true; continue; }
    if (!w.hit && circleHit(w.x, w.y, w.hitRadius, player.x, player.y, player.radius)) {
      damagePlayer(w.damage);
      w.hit = true;
    }
  }
  porinemuWaves = porinemuWaves.filter(w => !w.dead);
}

function drawPorinemuEnemies() {
  function drawWithMultiply(img, x, y, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(img, x, y, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  for (const e of porinemuEnemies) {
    // 影
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 28, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // スプライト
    const sheet = e.state === "attack" ? sprites.porinemu_attack : sprites.porinemu_idle;
    const fi = Math.min(e.frame, sheet.frames.length - 1);
    const frameImg = sheet.loaded ? sheet.frames[fi] : null;
    const drawSize = sheet.drawSize;
    const dxOff = -drawSize / 2;
    const dyOff = 28 - drawSize + 35;

    if (frameImg) {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (player.x > e.x) ctx.scale(-1, 1);
      drawWithMultiply(frameImg, dxOff, dyOff, drawSize, drawSize);
      if (e.hitFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.7;
        ctx.drawImage(frameImg, dxOff, dyOff, drawSize, drawSize);
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : "#7ad48a";
      ctx.shadowColor = "#2a8a3a"; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // HPバー(ダメージ時のみ・雑魚なので小さめ)
    if (e.hp < e.maxHp) {
      const bw = 44, bh = 5;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(e.x - bw/2, e.y - e.radius - 18, bw, bh);
      ctx.fillStyle = "#5fd36a";
      ctx.fillRect(e.x - bw/2, e.y - e.radius - 18, bw * Math.max(0, e.hp/e.maxHp), bh);
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1;
      ctx.strokeRect(e.x - bw/2, e.y - e.radius - 18, bw, bh);
    }

    // 名前ラベル(最前面)
    ctx.save();
    ctx.fillStyle = "#aaddaa"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("ぽりねむ", e.x, e.y - e.radius - 22);
    ctx.restore();
  }
}

function drawPorinemuWaves() {
  const sheet = sprites.porinemu_effect;
  for (const w of porinemuWaves) {
    const frameImg = sheet.loaded ? sheet.frames[0] : null;
    if (frameImg) {
      const drawW = sheet.drawW || 320;
      const drawH = sheet.drawH || 220;
      const t = Math.max(0, Math.min(1, w.life / w.maxLife));
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle + PORINEMU_WAVE_BASE_ANGLE);
      ctx.scale(-1, 1);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.4 + 0.5 * t;
      ctx.drawImage(frameImg, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      // フォールバック
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle);
      ctx.fillStyle = "rgba(90, 200, 110, 0.5)";
      ctx.fillRect(-120, -32, 240, 64);
      ctx.restore();
    }
  }
}

function damageDaisy(e, dmg, fromX, fromY) {
  e.hp -= dmg; e.hitFlash = 0.08;
  const dx = e.x - fromX, dy = e.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  e.kbVx += (dx / d) * 120; e.kbVy += (dy / d) * 120;
  if (e.hp <= 0) {
    killCount++;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = 8 + Math.random() * 30;
      xpOrbs.push({ x: e.x + Math.cos(a)*r, y: e.y + Math.sin(a)*r,
        vx: Math.cos(a)*70, vy: Math.sin(a)*70, xp: 3 });
    }
    e.dead = true;
  }
}

function updateSingleDaisy(e, dt) {
  // ヒットフラッシュ
  if (e.hitFlash > 0) e.hitFlash -= dt;

  // ノックバック
  if (Math.abs(e.kbVx) > 0.1 || Math.abs(e.kbVy) > 0.1) {
    e.x += e.kbVx * dt;
    e.y += e.kbVy * dt;
    e.kbVx *= Math.pow(0.05, dt);
    e.kbVy *= Math.pow(0.05, dt);
  }

  // 接触ダメージ(attackフェーズ以外)
  if (e.phase === "chase") {
    const cdx = player.x - e.x, cdy = player.y - e.y;
    if (Math.hypot(cdx, cdy) < e.radius + player.radius) {
      if (e.orbCD <= 0) { damagePlayer(8); e.orbCD = 0.8; }
    }
  }
  if (e.orbCD > 0) e.orbCD -= dt;

  // エフェクトダメージ判定(effectフェーズ中・1回のみ)
  if (e.effectActive) {
    if (!e.effectHit) {
      const edx = player.x - e.effectX, edy = player.y - e.effectY;
      if (Math.hypot(edx, edy) < DAISY_EFFECT_RADIUS + player.radius) {
        damagePlayer(DAISY_DAMAGE);
        e.effectHit = true;
      }
    }
  }

  // アニメタイマー加算
  e.animTimer += dt;

  // ─── 行動AI ───
  switch (e.phase) {
    case "chase": {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.facingLeft = player.x >= e.x;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;

      // idle アニメループ
      const IDLE_TIMES = [0.12, 0.12, 0.12];
      if (e.animTimer >= IDLE_TIMES[e.animFrame]) {
        e.animTimer -= IDLE_TIMES[e.animFrame];
        e.animFrame = (e.animFrame + 1) % sprites.daisy_idle.count;
      }

      // 攻撃範囲に入ったら停止してattackへ
      if (d < DAISY_ATTACK_RANGE) {
        e.phase = "attacking";
        e.animState = "attack";
        e.animFrame = 0;
        e.animTimer = 0;
        e.effectActive = false;
        e.effectHit = false;
      }
      break;
    }
    case "attacking": {
      const ATTACK_TIMES = [0.50, 0.20, 0.20];
      if (e.animTimer >= ATTACK_TIMES[e.animFrame]) {
        e.animTimer -= ATTACK_TIMES[e.animFrame];
        e.animFrame++;
        // f1のタイミングでエフェクト座標を固定
        if (e.animFrame === 1) {
          // facingLeft===true は「プレイヤーが右にいる=右向き」を表すため +1(右)
          const dir = e.facingLeft ? 1 : -1;
          e.effectX = e.x + dir * DAISY_EFFECT_OFFSET;
          e.effectY = e.y;
          e.effectActive = true;
          e.effectHit = false;
        }
        if (e.animFrame >= sprites.daisy_attack.count) {
          // attack完了 → effect へ
          e.animState = "effect";
          e.animFrame = 0;
          e.animTimer = 0;
          e.phase = "effect_phase";
        }
      }
      break;
    }
    case "effect_phase": {
      if (e.animState === "effect") {
        const EFFECT_TIMES = [0.18];
        if (e.animTimer >= (EFFECT_TIMES[e.animFrame] || 0.18)) {
          e.animTimer = 0;
          e.animFrame++;
          if (e.animFrame >= sprites.daisy_effect.count) {
            // effect完了 → cooldown へ
            e.animState = "idle";
            e.animFrame = 0;
            e.animTimer = 0;
            e.effectActive = false;
            e.phase = "cooldown";
            e.phaseTimer = 0.8;
          }
        }
      }
      break;
    }
    case "cooldown": {
      const IDLE_TIMES = [0.12, 0.12, 0.12];
      if (e.animTimer >= IDLE_TIMES[e.animFrame]) {
        e.animTimer -= IDLE_TIMES[e.animFrame];
        e.animFrame = (e.animFrame + 1) % sprites.daisy_idle.count;
      }
      e.phaseTimer -= dt;
      if (e.phaseTimer <= 0) {
        e.phase = "chase";
        e.animState = "idle";
        e.animFrame = 0;
        e.animTimer = 0;
      }
      break;
    }
  }
}

function updateDaisyEnemies(dt) {
  for (const e of daisyEnemies) updateSingleDaisy(e, dt);
  daisyEnemies = daisyEnemies.filter(e => !e.dead);
}

function drawDaisyEnemies() {
  function drawWithMultiply(img, x, y, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(img, x, y, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  for (const e of daisyEnemies) {
    // 影
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 28, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // HPバー
    const bw = 48, bh = 5;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(e.x - bw/2, e.y - e.radius - 18, bw, bh);
    ctx.fillStyle = e.hp / e.maxHp > 0.5 ? "#88ee66" : "#cc4422";
    ctx.fillRect(e.x - bw/2, e.y - e.radius - 18, bw * Math.max(0, e.hp/e.maxHp), bh);
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1;
    ctx.strokeRect(e.x - bw/2, e.y - e.radius - 18, bw, bh);

    // スプライト切替
    let sheet;
    if (e.animState === "attack")      sheet = sprites.daisy_attack;
    else if (e.animState === "effect") sheet = sprites.daisy_effect;
    else                                sheet = sprites.daisy_idle;

    const fi = Math.min(e.animFrame, sheet.frames.length - 1);
    const frameImg = sheet.loaded ? sheet.frames[fi] : null;
    const drawSize = sheet.drawSize;
    const dxOff = -drawSize / 2;
    const dyOff = 28 - drawSize + 35;

    if (frameImg) {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (player.x > e.x) ctx.scale(-1, 1);
      drawWithMultiply(frameImg, dxOff, dyOff, drawSize, drawSize);
      if (e.hitFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.7;
        ctx.drawImage(frameImg, dxOff, dyOff, drawSize, drawSize);
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : "#cc88ff";
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // エフェクト描画(剣先の位置)
    if (e.effectActive) {
      const effSheet = sprites.daisy_effect;
      const effImg = effSheet.loaded ? effSheet.frames[0] : null;
      if (effImg) {
        const sz = effSheet.drawSize || 120;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(effImg, e.effectX - sz / 2, e.effectY - sz / 2, sz, sz);
        ctx.restore();
      }
    }

    // 名前ラベル(最前面)
    ctx.save();
    ctx.fillStyle = "#e6b3ff"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("デイジー", e.x, e.y - e.radius - 22);
    ctx.restore();
  }
}

function eliteSpawnLoop(dt) {
  if (elapsed < ELITE_SPAWN_START) return;
  // ステージ1はゆっくり出現
  const interval = (currentStage === 1 ? ELITE_SPAWN_INTERVAL * 1.5 : ELITE_SPAWN_INTERVAL) * earlySpawnMul();
  eliteSpawnTimer += dt;
  if (eliteSpawnTimer >= interval) {
    eliteSpawnTimer -= interval;
    spawnYonYon();
  }
}

function updateYonyonElites(dt) {
  for (const e of yonyonElites) updateSingleYonYon(e, dt);
  yonyonElites = yonyonElites.filter(e => !e.dead);
}

function updateSingleYonYon(e, dt) {
  if (e.hitFlash > 0) e.hitFlash -= dt;
  if (e.contactCD > 0) e.contactCD -= dt;

  e.x += e.kbVx * dt; e.y += e.kbVy * dt;
  e.kbVx *= Math.pow(0.003, dt); e.kbVy *= Math.pow(0.003, dt);

  e.facingLeft = player.x >= e.x;

  if (e.phase === "dash") {
    if (circleHit(e.x, e.y, e.radius, player.x, player.y, player.radius)) {
      if (e.contactCD <= 0) { damagePlayer(e.contactDamage); e.contactCD = 0.4; }
    }
  }

  switch (e.phase) {
    case "chase": {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      e.phaseTimer -= dt;
      if (e.phaseTimer <= 0) {
        e.phase = "attacking";
        e.animState = "attack";
        e.animFrame = 0;
        e.animTimer = 0;
      }
      break;
    }
    case "attacking":
      break;
    case "effect_phase":
      break;
    case "dash":
      e.x += e.dashVx * dt; e.y += e.dashVy * dt;
      e.dashTimer -= dt;
      if (e.dashTimer <= 0) {
        e.phase = "cooldown";
        e.phaseTimer = 0.8;
        e.animState = "idle";
        e.animFrame = 0;
        e.animTimer = 0;
      }
      break;
    case "cooldown": {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * 0.4 * dt;
      e.y += (dy / d) * e.speed * 0.4 * dt;
      e.phaseTimer -= dt;
      if (e.phaseTimer <= 0) {
        e.phase = "chase";
        e.phaseTimer = 2.0 + Math.random();
        e.animState = "idle";
        e.animFrame = 0;
        e.animTimer = 0;
      }
      break;
    }
  }

  e.animTimer += dt;

  if (e.animState === "idle") {
    const dur = YONYON_IDLE_TIMES[e.animFrame] || 0.16;
    if (e.animTimer >= dur) {
      e.animTimer -= dur;
      e.animFrame = (e.animFrame + 1) % sprites.yonyon_idle.count;
    }
  } else if (e.animState === "attack") {
    const dur = YONYON_ATTACK_TIMES[e.animFrame] || 0.12;
    if (e.animTimer >= dur) {
      e.animTimer -= dur;
      e.animFrame++;
      if (e.animFrame >= sprites.yonyon_attack.count) {
        e.animState = "effect";
        e.animFrame = 0;
        e.animTimer = 0;
        e.phase = "effect_phase";
      }
    }
  } else if (e.animState === "effect") {
    const dur = YONYON_EFFECT_TIMES[e.animFrame] || 0.13;
    if (e.animTimer >= dur) {
      e.animTimer -= dur;
      e.animFrame++;
      if (e.animFrame >= sprites.yonyon_effect.count) {
        e.animState = "idle";
        e.animFrame = 0;
        e.animTimer = 0;
        const dx2 = player.x - e.x, dy2 = player.y - e.y;
        const d2 = Math.hypot(dx2, dy2) || 1;
        e.dashVx = (dx2 / d2) * 780;
        e.dashVy = (dy2 / d2) * 780;
        e.dashTimer = 0.48;
        e.phase = "dash";
        e.hitFlash = 0.06;
      }
    }
  }
}

function damageYonYon(elite, dmg, fromX, fromY) {
  elite.hp -= dmg; elite.hitFlash = 0.08;
  const dx = elite.x - fromX, dy = elite.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  elite.kbVx += (dx / d) * 120; elite.kbVy += (dy / d) * 120;
  if (elite.hp <= 0) {
    killCount++;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = 10 + Math.random() * 40;
      xpOrbs.push({ x: elite.x + Math.cos(a)*r, y: elite.y + Math.sin(a)*r,
        vx: Math.cos(a)*80, vy: Math.sin(a)*80, xp: 8 });
    }
    elite.dead = true;
    console.log("[elite] ヨンヨン撃破!");
  }
}

// ─── ポッティ(第2エリート) ───
function updatePottyElites(dt) {
  for (const e of pottyElites) updateSinglePotty(e, dt);
  pottyElites = pottyElites.filter(e => !e.dead);
}

function updateSinglePotty(e, dt) {
  if (e.hitFlash > 0)  e.hitFlash  -= dt;
  if (e.contactCD > 0) e.contactCD -= dt;

  // ノックバック減衰
  e.x += e.kbVx * dt; e.y += e.kbVy * dt;
  e.kbVx *= Math.pow(0.003, dt); e.kbVy *= Math.pow(0.003, dt);

  e.facingLeft = player.x >= e.x;

  // 接触ダメージ(常時)
  if (circleHit(e.x, e.y, e.radius, player.x, player.y, player.radius)) {
    if (e.contactCD <= 0) { damagePlayer(e.contactDamage); e.contactCD = 0.8; }
  }

  // メテオダメージ判定(effect中)
  if (e.meteorActive && e.animState === "effect") {
    for (const m of e.meteors) {
      if (!m.hit) {
        const mdx = player.x - m.x, mdy = player.y - m.y;
        if (Math.hypot(mdx, mdy) < POTTY_METEOR_RADIUS + player.radius) {
          damagePlayer(POTTY_METEOR_DAMAGE);
          m.hit = true;
        }
      }
    }
  }

  // ──── 行動AI ────
  switch (e.phase) {
    case "chase": {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      e.phaseTimer -= dt;
      if (e.phaseTimer <= 0) {
        e.phase = "attacking";
        e.animState = "attack";
        e.animFrame = 0;
        e.animTimer = 0;
        e.meteorActive = false;
      }
      break;
    }
    case "attacking":
      // アニメステートマシンが遷移させる
      break;
    case "effect_phase":
      // アニメステートマシンが遷移させる
      break;
    case "cooldown": {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * 0.4 * dt;
      e.y += (dy / d) * e.speed * 0.4 * dt;
      e.phaseTimer -= dt;
      if (e.phaseTimer <= 0) {
        e.phase = "chase";
        e.phaseTimer = 2.0 + Math.random();
        e.animState = "idle";
        e.animFrame = 0;
        e.animTimer = 0;
      }
      break;
    }
  }

  // ──── アニメーションステートマシン ────
  e.animTimer += dt;

  if (e.animState === "idle") {
    const dur = POTTY_IDLE_TIMES[e.animFrame] || 0.18;
    if (e.animTimer >= dur) {
      e.animTimer -= dur;
      e.animFrame = (e.animFrame + 1) % sprites.potty_idle.count;
    }

  } else if (e.animState === "attack") {
    const dur = POTTY_ATTACK_TIMES[e.animFrame] || 0.25;
    if (e.animTimer >= dur) {
      e.animTimer -= dur;
      e.animFrame++;
      // f2に入った瞬間に予測円をプレイヤー位置に固定
      if (e.animFrame === 2) {
        const margin = POTTY_METEOR_RADIUS;
        const camX = player.x - VIEW_W / 2;
        const camY = player.y - VIEW_H / 2;
        for (const m of e.meteors) {
          m.x = camX + margin + Math.random() * (VIEW_W - margin * 2);
          m.y = camY + margin + Math.random() * (VIEW_H - margin * 2);
          m.hit = false;
        }
        e.meteorActive = true;
      }
      if (e.animFrame >= sprites.potty_attack.count) {
        // attack完了 → effect へ
        e.animState = "effect";
        e.animFrame = 0;
        e.animTimer = 0;
        e.phase = "effect_phase";
      }
    }

  } else if (e.animState === "effect") {
    const dur = POTTY_EFFECT_TIMES[e.animFrame] || 0.10;
    if (e.animTimer >= dur) {
      e.animTimer -= dur;
      e.animFrame++;
      if (e.animFrame >= sprites.potty_effect.count) {
        // effect完了 → cooldown へ
        e.animState = "idle";
        e.animFrame = 0;
        e.animTimer = 0;
        e.meteorActive = false;
        e.phase = "cooldown";
        e.phaseTimer = 0.8;
      }
    }
  }
}

function damagePotty(elite, dmg, fromX, fromY) {
  elite.hp -= dmg; elite.hitFlash = 0.08;
  const dx = elite.x - fromX, dy = elite.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  elite.kbVx += (dx / d) * 120; elite.kbVy += (dy / d) * 120;
  if (elite.hp <= 0) {
    killCount++;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = 10 + Math.random() * 40;
      xpOrbs.push({ x: elite.x + Math.cos(a)*r, y: elite.y + Math.sin(a)*r,
        vx: Math.cos(a)*80, vy: Math.sin(a)*80, xp: 8 });
    }
    elite.dead = true;
    console.log("[elite] ポッティ撃破!");
  }
}

function drawYonyonElites() {
  for (const e of yonyonElites) {
    // 影
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 36, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 突進オーラ
    if (e.phase === "dash") {
      ctx.save();
      ctx.strokeStyle = "rgba(255,140,0,0.8)";
      ctx.lineWidth = 7;
      ctx.shadowColor = "#ff8c00"; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 10, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // スプライト切替: animState ごとに sheet を選択
    let sheet;
    if (e.animState === "attack")      sheet = sprites.yonyon_attack;
    else if (e.animState === "effect") sheet = sprites.yonyon_effect;
    else                                sheet = sprites.yonyon_idle;

    const fi = Math.min(e.animFrame, sheet.frames.length - 1);
    const frameImg = sheet.loaded ? sheet.frames[fi] : null;
    const drawSize = sheet.drawSize;
    const dxOff = -drawSize / 2;
    const dyOff = 28 - drawSize + 35;

    if (e.animState === "effect" && frameImg) {
      // effect: screen合成でリング(キャラの背後に重ねる)
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.85;
      ctx.translate(e.x, e.y);
      ctx.drawImage(frameImg, dxOff, dyOff, drawSize, drawSize);
      ctx.restore();
      // エフェクトの上に idle のキャラを重ねる(向き反転は適用)
      const idleSheet = sprites.yonyon_idle;
      const idleImg = idleSheet.loaded ? idleSheet.frames[0] : null;
      if (idleImg) {
        const idleSize = idleSheet.drawSize;
        ctx.save();
        ctx.translate(e.x, e.y);
        if (player.x > e.x) ctx.scale(-1, 1);
        ctx.drawImage(idleImg, -idleSize / 2, 28 - idleSize + 35, idleSize, idleSize);
        ctx.restore();
      }
    } else if (frameImg) {
      // idle / attack: 通常描画 + ヒットフラッシュ
      ctx.save();
      ctx.translate(e.x, e.y);
      if (player.x > e.x) ctx.scale(-1, 1);
      if (e.hitFlash > 0) { ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
      ctx.drawImage(frameImg, dxOff, dyOff, drawSize, drawSize);
      if (e.hitFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.7;
        ctx.drawImage(frameImg, dxOff, dyOff, drawSize, drawSize);
      }
      ctx.restore();
    } else {
      // フォールバック(画像未ロード)
      ctx.save();
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : "#ff7700";
      ctx.shadowColor = "#ff4400"; ctx.shadowBlur = e.phase === "dash" ? 22 : 6;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#cc3300"; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }

    // HPバー
    const bw = 64;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(e.x - bw/2, e.y - e.radius - 22, bw, 6);
    ctx.fillStyle = e.hp / e.maxHp > 0.5 ? "#ff8c00" : "#ff2200";
    ctx.fillRect(e.x - bw/2, e.y - e.radius - 22, bw * Math.max(0, e.hp/e.maxHp), 6);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    ctx.strokeRect(e.x - bw/2, e.y - e.radius - 22, bw, 6);

    // 名前ラベル
    ctx.save();
    ctx.fillStyle = "#ffe060"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("ヨンヨン", e.x, e.y - e.radius - 26);
    ctx.restore();

  }
}

// 画面外ヨンヨンへの矢印インジケーター
function drawYonyonArrows() {
  if (!yonyonElites || yonyonElites.length === 0) return;
  const W = VIEW_W, H = VIEW_H;
  const cx = W / 2, cy = H / 2;
  const margin = 36; // 画面端からの余白
  // このプロジェクトでは camera オブジェクトは無いので、render() と同じ計算でカメラ原点を作る
  const camX = player.x - W / 2;
  const camY = player.y - H / 2;

  for (const e of yonyonElites) {
    if (e.dead) continue;

    // スクリーン座標に変換 (sx, sy は画面中央基準の x,y ではなく画面座標)
    const sx = e.x - camX;
    const sy = e.y - camY;

    // 画面内なら矢印不要
    if (sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin) continue;

    // 画面端にクランプした位置を求める(中心からの方向ベクトル)
    const angle = Math.atan2(sy - cy, sx - cx);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let t = Infinity;
    if (cos !== 0) t = Math.min(t, ((cos > 0 ? W - margin : margin) - cx) / cos);
    if (sin !== 0) t = Math.min(t, ((sin > 0 ? H - margin : margin) - cy) / sin);
    const ax = cx + cos * t, ay = cy + sin * t;

    // 矢印描画
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.strokeStyle = "#ff8c00";
    ctx.fillStyle   = "#ff8c00";
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur  = 10;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth   = 2.5;
    // 三角矢印
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-8,  8);
    ctx.closePath();
    ctx.fill();
    // ヨンヨン名ラベル(矢印の手前)
    ctx.rotate(-angle);
    ctx.fillStyle = "#ffe060";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ヨンヨン", 0, -14);
    ctx.restore();
  }
}

// ─── ポッティ描画 (render() のカメラ変換ブロック内で呼ぶ前提・世界座標) ───
function drawPottyElites() {
  // multiply合成方式での白背景除去ヘルパー
  // 1) multiplyで描画(白×任意色=任意色 になるため白背景は事実上消える)
  // 2) source-overで0.92アルファで重ね描き(キャラ色を取り戻す)
  // getImageData を使わずに済むので file:// でも動作する
  function drawWithMultiply(img, x, y, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(img, x, y, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  for (const e of pottyElites) {
    // 影
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 36, 32, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // HPバー(world座標)
    const bw = 60, bh = 6;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(e.x - bw/2, e.y - e.radius - 22, bw, bh);
    ctx.fillStyle = e.hp / e.maxHp > 0.5 ? "#4fc8ff" : "#2299cc";
    ctx.fillRect(e.x - bw/2, e.y - e.radius - 22, bw * Math.max(0, e.hp/e.maxHp), bh);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    ctx.strokeRect(e.x - bw/2, e.y - e.radius - 22, bw, bh);

    // 名前ラベル
    ctx.save();
    ctx.fillStyle = "#aef0ff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("ポッティ", e.x, e.y - e.radius - 26);
    ctx.restore();

    // スプライト切替
    let sheet;
    if (e.animState === "attack")      sheet = sprites.potty_attack;
    else if (e.animState === "effect") sheet = sprites.potty_effect;
    else                                sheet = sprites.potty_idle;

    const fi = Math.min(e.animFrame, sheet.frames.length - 1);
    const frameImg = sheet.loaded ? sheet.frames[fi] : null;
    const drawSize = sheet.drawSize;
    const dxOff = -drawSize / 2;
    const dyOff = 28 - drawSize + 35;

    if (frameImg) {
      // idle / attack / effect: multiply合成で本体描画 + ヒットフラッシュ(lighter)
      ctx.save();
      ctx.translate(e.x, e.y);
      if (player.x > e.x) ctx.scale(-1, 1);
      drawWithMultiply(frameImg, dxOff, dyOff, drawSize, drawSize);
      if (e.hitFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.7;
        ctx.drawImage(frameImg, dxOff, dyOff, drawSize, drawSize);
      }
      ctx.restore();
    } else {
      // フォールバック
      ctx.save();
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : "#4fc8ff";
      ctx.shadowColor = "#0080ff"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#003c80"; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }

    // メテオ予測円の描画(2か所)
    if (e.meteorActive) {
      const isEffect = e.animState === "effect";
      const effSheet = sprites.potty_effect;
      const effImg = isEffect && effSheet.loaded ? effSheet.frames[Math.min(e.animFrame, effSheet.frames.length - 1)] : null;
      for (const m of e.meteors) {
        ctx.save();
        ctx.globalAlpha = isEffect ? 0.85 : 0.45;
        ctx.strokeStyle = isEffect ? "#ff2200" : "#ffaa00";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.arc(m.x, m.y, POTTY_METEOR_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (isEffect) {
          ctx.fillStyle = "rgba(255, 60, 0, 0.25)";
          ctx.fill();
          if (effImg) {
            const sz = effSheet.drawSize || 280;
            ctx.globalAlpha = 0.9;
            ctx.drawImage(effImg, m.x - sz / 2, m.y - sz / 2, sz, sz);
          }
        }
        ctx.restore();
      }
    }
  }
}

// 画面外ポッティへの矢印インジケーター(画面座標、カメラ復元後に呼ぶ前提)
function drawPottyArrows() {
  if (!pottyElites || pottyElites.length === 0) return;
  const W = VIEW_W, H = VIEW_H;
  const cx = W / 2, cy = H / 2;
  const margin = 36;
  const camX = player.x - W / 2;
  const camY = player.y - H / 2;
  for (const e of pottyElites) {
    if (e.dead) continue;
    const sx = e.x - camX;
    const sy = e.y - camY;
    if (sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin) continue;
    const angle = Math.atan2(sy - cy, sx - cx);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let t = Infinity;
    if (cos !== 0) t = Math.min(t, ((cos > 0 ? W - margin : margin) - cx) / cos);
    if (sin !== 0) t = Math.min(t, ((sin > 0 ? H - margin : margin) - cy) / sin);
    const ax = cx + cos * t, ay = cy + sin * t;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = "#60cfff";
    ctx.shadowColor = "#0080ff";
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8);
    ctx.closePath(); ctx.fill();
    ctx.rotate(-angle);
    ctx.fillStyle = "#ffe060";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ポッティ", 0, -14);
    ctx.restore();
  }
}

// ---------- ボス(まきば) ----------
function spawnBoss() {
  Sound.bossAppear();
  // 画面外円周上に出現
  const angle = Math.random() * Math.PI * 2;
  const dist = 540;
  boss = {
    x: player.x + Math.cos(angle) * dist,
    y: player.y + Math.sin(angle) * dist,
    radius: 38,
    // ★HP増加: 8000(旧5000)
    hp: 8000, maxHp: 8000,
    // ★移動速度増加: 130(旧90)
    speed: 130,
    // ★接触ダメージ強化: 25(旧15)、CD短縮: 0.7秒
    contactDamage: 25, contactCD: 0,
    // ★近接: ダメージ50(旧30)、間隔1.0秒(旧1.5秒)、範囲100(旧80)
    meleeDamage: 50, meleeRange: 100,
    meleeInterval: 1.0, meleeTimer: 1.0,
    // ★波動: ダメージ30(旧20)、速度440(旧380)、間隔1.8秒(旧3.0秒)
    waveDamage: 30, waveSpeed: 440,
    waveInterval: 1.8, waveTimer: 1.8,
    state: "idle",
    pendingAttack: null,
    frame: 0, animTimer: 0,
    fireCallback: null, fireTriggered: false,
    hitFlash: 0,
    // ★フェーズ2(HP50%以下で激化)
    phase2: false,
  };
  bossNotificationTimer = 3.0;
  console.log(`[boss] まきば 出現 at (${boss.x.toFixed(0)}, ${boss.y.toFixed(0)})`);
}

function updateBoss(dt) {
  if (bossNotificationTimer > 0) bossNotificationTimer -= dt;

  // 5分経過時に1度だけ出現
  if (!boss && !bossDefeated && elapsed >= BOSS_SPAWN_TIME) {
    spawnBoss();
  }
  if (!boss) return;

  if (boss.hitFlash > 0)  boss.hitFlash  -= dt;
  if (boss.contactCD > 0) boss.contactCD -= dt;

  // ★フェーズ2移行(HP50%以下)
  if (!boss.phase2 && boss.hp <= boss.maxHp * 0.5) {
    boss.phase2 = true;
    boss.speed       = 170;
    boss.waveInterval = 1.0;
    boss.meleeDamage  = 70;
    boss.waveDamage   = 40;
    // 演出用フラッシュ
    boss.hitFlash = 0.3;
    bossNotificationTimer = 2.5;
    console.log("[boss] まきば フェーズ2!");
  }

  // プレイヤーへ接近(攻撃モーション中も少しだけ前進)
  const dx = player.x - boss.x, dy = player.y - boss.y;
  const d = Math.hypot(dx, dy);
  const moveScale = boss.state === "attack" ? 0.3 : 1.0;
  if (d > 0.01) {
    boss.x += (dx / d) * boss.speed * moveScale * dt;
    boss.y += (dy / d) * boss.speed * moveScale * dt;
  }

  // アニメーション更新
  boss.animTimer += dt;
  if (boss.state === "idle") {
    const ft = 0.3;
    while (boss.animTimer >= ft) {
      boss.animTimer -= ft;
      boss.frame = (boss.frame + 1) % sprites.makiba_idle.count;
    }
    // 両方のクールダウンを並行して減らす
    boss.meleeTimer -= dt;
    boss.waveTimer  -= dt;
    // 距離に応じて使用する攻撃を切り替え
    const distToPlayer = Math.hypot(player.x - boss.x, player.y - boss.y);
    if (distToPlayer <= boss.meleeRange) {
      // 近接圏内: 近接斬撃を優先
      if (boss.meleeTimer <= 0) {
        boss.meleeTimer = boss.meleeInterval;
        startBossAttack("melee");
      }
    } else {
      // 遠距離: 波動エフェクトを発射
      if (boss.waveTimer <= 0) {
        boss.waveTimer = boss.waveInterval;
        startBossAttack("wave");
      }
    }
  } else if (boss.state === "attack") {
    const ft = 0.1;
    while (boss.animTimer >= ft) {
      boss.animTimer -= ft;
      boss.frame += 1;
      if (boss.frame >= sprites.makiba_attack.count) {
        boss.state = "idle";
        boss.frame = 0;
        boss.fireCallback = null;
        boss.fireTriggered = false;
        break;
      }
    }
    // 3フレーム目(index 2)で斬撃判定 + 波動エフェクト発生
    if (!boss.fireTriggered && boss.frame >= 2 && boss.fireCallback) {
      boss.fireCallback();
      boss.fireTriggered = true;
    }
  }

  // 接触ダメージ(0.7秒に1回、旧1秒)
  if (circleHit(boss.x, boss.y, boss.radius, player.x, player.y, player.radius)) {
    if (boss.contactCD <= 0) {
      damagePlayer(boss.contactDamage);
      boss.contactCD = 0.7;
    }
  }
}

function startBossAttack(type) {
  boss.state = "attack";
  boss.frame = 0;
  boss.animTimer = 0;
  boss.fireTriggered = false;
  boss.pendingAttack = type;

  // 発射時点のプレイヤー方向を保存(波動はそこへ向けて飛ぶ)
  const angle = Math.atan2(player.y - boss.y, player.x - boss.x);

  boss.fireCallback = () => {
    if (type === "melee") {
      // 近接斬撃: 攻撃発生時に範囲内ならダメージ30
      const d = Math.hypot(player.x - boss.x, player.y - boss.y);
      if (d < boss.meleeRange) damagePlayer(boss.meleeDamage);
    } else if (type === "wave") {
      // ★遠距離波動: フェーズ2では3方向同時発射
      const spread = boss.phase2 ? [-0.22, 0, 0.22] : [0];
      for (const off of spread) {
        bossWaves.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(angle + off) * boss.waveSpeed,
          vy: Math.sin(angle + off) * boss.waveSpeed,
          angle: angle + off,
          damage: boss.waveDamage,
          hitRadius: 60,
          life: 1.2,
          maxLife: 1.2,
          hit: false,
        });
      }
    }
  };
}

function damageBoss(dmg) {
  if (!boss) return;
  boss.hp -= dmg;
  boss.hitFlash = 0.08;
  if (boss.hp <= 0) defeatBoss();
}

function defeatBoss() {
  if (!boss) return;
  Sound.bossDefeat();
  // 大量経験値ドロップ(リング状に60個 = レベル数段一気に上がる量)
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r = 20 + Math.random() * 60;
    xpOrbs.push({
      x: boss.x + Math.cos(a) * r,
      y: boss.y + Math.sin(a) * r,
      vx: Math.cos(a) * 100,
      vy: Math.sin(a) * 100,
      xp: 20,
    });
  }
  killCount++;
  bossDefeated = true;
  boss = null;
  console.log(`[boss] まきば撃破!`);
}

function updateBossWaves(dt) {
  for (const w of bossWaves) {
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.life -= dt;
    if (w.life <= 0) { w.dead = true; continue; }
    // プレイヤー命中(1度のみ)
    if (!w.hit && circleHit(w.x, w.y, w.hitRadius, player.x, player.y, player.radius)) {
      damagePlayer(w.damage);
      w.hit = true;
    }
  }
  bossWaves = bossWaves.filter((w) => !w.dead);
}

// ---------- 更新処理 ----------
function update(dt) {
  if (gameState !== STATE_PLAYING) return;

  elapsed += dt;
  // ステージ別クリア判定
  const stageClearTime = (typeof STAGE_DURATION !== "undefined") ? STAGE_DURATION : CLEAR_TIME;
  if (elapsed >= stageClearTime) {
    Sound.stageClear();
    if (typeof currentStage !== "undefined" && currentStage < 3) {
      // ステージ1〜2クリア(フリーズ防止のため必ず gameState を変える)
      gameState = STATE_CLEAR;
      document.getElementById("stage-clear-title").textContent =
        `ステージ${currentStage} クリア！`;
      document.getElementById("stage-clear-sub").textContent =
        currentStage === 2 ? "最終ステージへ進みます！" : "次のステージへ進みます";
      showOverlay("stage-clear");
    } else {
      gameState = STATE_CLEAR;
      showClear();
    }
    return;
  }

  updatePlayer(dt);
  updatePlayerAnim(dt);
  updateAttack(dt);
  updateDarkGospel(dt);
  updateLightnings(dt);
  updateLovelyNude(dt);
  updateLovenudes(dt);
  updateShadowOrbs(dt);
  updateMeteor(dt);
  updateMeteorEffects(dt);
  updateYonyonElites(dt);
  updatePottyElites(dt);
  updateDaisyEnemies(dt);
  updateKonbuElites(dt);
  updateKonbuWaves(dt);
  konbuSpawnLoop(dt);
  updatePorinemuEnemies(dt);
  updatePorinemuWaves(dt);
  porinemuSpawnLoop(dt);
  daisySpawnLoop(dt);
  eliteSpawnLoop(dt);
  pottySpawnLoop(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateBoss(dt);
  updateBossWaves(dt);
  updateXpOrbs(dt);
  spawnLoop(dt);

  enemies = enemies.filter((e) => !e.dead);
}

// プレイヤー操作
function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys["arrowleft"]  || keys["a"]) dx -= 1;
  if (keys["arrowright"] || keys["d"]) dx += 1;
  if (keys["arrowup"]    || keys["w"]) dy -= 1;
  if (keys["arrowdown"]  || keys["s"]) dy += 1;

  // タッチ入力を合成
  if (touchInput.active) {
    dx += touchInput.dx;
    dy += touchInput.dy;
  }

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    player.x += dx * player.speed * dt;
    player.y += dy * player.speed * dt;
    player.facing = Math.atan2(dy, dx);
    // 攻撃中でなければ移動方向で向きを更新
    if (player.anim.state !== "attack") {
      if (dx < -0.1) player.anim.facingLeft = true;
      else if (dx > 0.1) player.anim.facingLeft = false;
    }
  }

  if (player.invuln > 0) player.invuln -= dt;
}

// 自動攻撃
function updateAttack(dt) {
  player.attackTimer -= dt;
  if (player.attackTimer > 0) return;
  // 全種類の敵を対象に近い順で狙う
  const targets = allEnemyTargets();
  if (targets.length === 0) return;
  player.attackTimer = player.attackInterval * player.castMult;

  // 近い順にソートし、上位 bulletCount 体を狙う
  const sorted = targets.sort((a, b) =>
    dist2(a.x, a.y, player.x, player.y) - dist2(b.x, b.y, player.x, player.y));
  const count = player.bulletCount;
  // 体の向きは最も近い敵に合わせる
  const firstAngle = Math.atan2(sorted[0].y - player.y, sorted[0].x - player.x);
  player.anim.facingLeft = Math.cos(firstAngle) < 0;

  // ATTACKモーションを再生し、4フレーム目で弾を生成する
  startAttackAnimation(() => {
    const dmg = player.bulletDamage + player.bulletDamageBonus;
    for (let i = 0; i < count; i++) {
      // 敵数より弾が多い分は最寄りの敵へ扇状にずらして撃つ
      const tgt = sorted[i] || sorted[sorted.length - 1];
      let ang = Math.atan2(tgt.y - player.y, tgt.x - player.x);
      if (i >= sorted.length) {
        const extra = i - sorted.length + 1;
        ang += extra * 0.20 * (extra % 2 ? 1 : -1);
      }
      projectiles.push({
        x: player.x, y: player.y,
        vx: Math.cos(ang) * player.bulletSpeed,
        vy: Math.sin(ang) * player.bulletSpeed,
        angle: ang,
        radius: 16,
        damage: dmg,
        life: 2.0,
        spriteFrame: 0,
        spriteTimer: 0,
        spriteFrameTime: 0.08,
      });
    }
    Sound.shoot();
  });
}

// 敵の挙動
function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.hitFlash > 0)  e.hitFlash  -= dt;
    if (e.contactCD > 0) e.contactCD -= dt;

    // プレイヤーへ接近
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) {
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
    }
    // プレイヤーが右にいるなら敵は左を向く(元画像のまま)、左にいるなら右向き(反転)
    e.facingLeft = dx >= 0;

    // アニメーション(2フレーム 300ms/frame)
    e.animTimer += dt;
    if (e.animTimer >= 0.3) {
      e.animTimer -= 0.3;
      e.animFrame = (e.animFrame + 1) % sprites.enemy_idle.count;
    }

    // プレイヤーとの接触ダメージ(1秒に1回)
    if (circleHit(e.x, e.y, e.radius, player.x, player.y, player.radius)) {
      if (e.contactCD <= 0) {
        damagePlayer(e.contactDamage);
        e.contactCD = 1.0;
      }
    }
  }

  // 敵同士の重なり緩和(近接ペアのみ反発)
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < Math.min(enemies.length, i + 6); j++) {
      const b = enemies[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const r = a.radius + b.radius;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const overlap = (r - d) * 0.5;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * overlap;
        a.y -= uy * overlap;
        b.x += ux * overlap;
        b.y += uy * overlap;
      }
    }
  }
}

// 弾の更新
function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    // スプライトフレーム更新(0.2秒ごとに f0 → f1 → f2 と進み、最終フレームで固定)
    p.spriteTimer += dt;
    if (p.spriteTimer >= 0.2 && p.spriteFrame < sprites.effect.count - 1) {
      p.spriteTimer = 0;
      p.spriteFrame += 1;
    }

    // 寿命切れ(画面外相当)で消滅
    if (p.life <= 0) { p.dead = true; continue; }

    // 敵との衝突
    let hit = false;
    for (const e of enemies) {
      if (e.dead) continue;
      if (circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
        damageEnemy(e, p.damage);
        p.dead = true;
        hit = true;
        break;
      }
    }
    // ボスとの衝突(優先度は通常敵が当たらなかった場合のみ)
    if (!hit && boss && circleHit(p.x, p.y, p.radius, boss.x, boss.y, boss.radius)) {
      damageBoss(p.damage);
      p.dead = true;
      hit = true;
    }
    // ヨンヨンとの衝突
    if (!hit) {
      for (const el of yonyonElites) {
        if (el.dead) continue;
        if (circleHit(p.x, p.y, p.radius, el.x, el.y, el.radius)) {
          damageYonYon(el, p.damage, p.x, p.y);
          p.dead = true; hit = true; break;
        }
      }
    }
    // ポッティとの衝突
    if (!hit) {
      for (const el of pottyElites) {
        if (el.dead) continue;
        if (circleHit(p.x, p.y, p.radius, el.x, el.y, el.radius)) {
          damagePotty(el, p.damage, p.x, p.y);
          p.dead = true; hit = true; break;
        }
      }
    }
    // デイジーとの衝突
    if (!hit) {
      for (const el of daisyEnemies) {
        if (el.dead) continue;
        if (circleHit(p.x, p.y, p.radius, el.x, el.y, el.radius)) {
          damageDaisy(el, p.damage, p.x, p.y);
          p.dead = true; hit = true; break;
        }
      }
    }
    // コンブとの衝突
    if (!hit) {
      for (const el of konbuElites) {
        if (el.dead) continue;
        if (circleHit(p.x, p.y, p.radius, el.x, el.y, el.radius)) {
          damageKonbu(el, p.damage, p.x, p.y);
          p.dead = true; hit = true; break;
        }
      }
    }
    // ぽりねむとの衝突
    if (!hit) {
      for (const el of porinemuEnemies) {
        if (el.dead) continue;
        if (circleHit(p.x, p.y, p.radius, el.x, el.y, el.radius)) {
          damagePorinemu(el, p.damage, p.x, p.y);
          p.dead = true; hit = true; break;
        }
      }
    }
  }
  projectiles = projectiles.filter((p) => !p.dead);
}

// 経験値オーブの更新
function updateXpOrbs(dt) {
  for (const o of xpOrbs) {
    o.vx *= Math.pow(0.001, dt);
    o.vy *= Math.pow(0.001, dt);
    o.x += o.vx * dt;
    o.y += o.vy * dt;

    const dx = player.x - o.x, dy = player.y - o.y;
    const d2 = dx * dx + dy * dy;
    const pickR2 = XP_PICKUP_RANGE * XP_PICKUP_RANGE;
    if (d2 < pickR2) {
      const d = Math.sqrt(d2) || 0.0001;
      const pull = 380;
      o.x += (dx / d) * pull * dt;
      o.y += (dy / d) * pull * dt;
    }
    if (d2 < (player.radius + 8) * (player.radius + 8)) {
      gainXp(o.xp);
      o.dead = true;
    }
  }
  xpOrbs = xpOrbs.filter((o) => !o.dead);
}

// ---------- 描画処理 ----------
function render() {
  // クリア
  ctx.fillStyle = "#142019";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (gameState === STATE_TITLE) {
    drawTitleBackground();
    return;
  }

  // カメラオフセット(プレイヤー中心)
  const camX = player.x - VIEW_W / 2;
  const camY = player.y - VIEW_H / 2;

  drawGrid(camX, camY);

  ctx.save();
  ctx.translate(-camX, -camY);

  // 経験値オーブ(下層)
  for (const o of xpOrbs) drawXpOrb(o);

  // メテオ予告・爆発(敵の下層)
  drawMeteorEffects();

  // 敵
  for (const e of enemies) drawEnemy(e);

  // ヨンヨン(エリート敵) - 通常敵より上層
  drawYonyonElites();
  // ポッティ(エリート敵2)
  drawPottyElites();
  // デイジー(雑魚・剣士)
  drawDaisyEnemies();
  // コンブ(エリート・青鎧騎士)
  drawKonbuElites();
  drawKonbuWaves();
  // ぽりねむ(雑魚・近接＋波動)
  drawPorinemuEnemies();
  drawPorinemuWaves();

  // ボス(プレイヤーより下層)
  if (boss) drawBoss();

  // プレイヤー
  drawPlayer();

  // シャドウオーブ(プレイヤー上)
  drawShadowOrbs();

  // 弾(プレイヤーより上)
  for (const p of projectiles) drawProjectile(p);

  // ラブリーヌード(闇のハート)
  for (const p of lovenudes) drawLovenude(p);

  // ダークゴスペルの雷(プレイヤーより上)
  for (const o of lightnings) drawLightning(o);

  // ボス波動エフェクト(最上層・発光合成)
  for (const w of bossWaves) drawBossWave(w);

  ctx.restore();

  // 画面外エリートを示す矢印(画面座標で描画するためカメラ復元後に呼ぶ)
  drawYonyonArrows();
  drawPottyArrows();

  drawUI();
  drawMinimap();
}

// タイトル時の背景(うっすら動く星のような演出)
function drawTitleBackground() {
  drawGrid(0, 0);
}

// 背景: 単色(チェッカー模様によるスクロール時のチラつき防止のため一色塗り)
function drawGrid(camX, camY) {
  ctx.fillStyle = "#19281e";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// プレイヤー描画
function drawPlayer() {
  // 影
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 36, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  const a = player.anim;
  const sheet = a.state === "attack" ? sprites.attack : sprites.idle;
  const frameImg = sheet.loaded ? sheet.frames[a.frame] : null;

  if (frameImg) {
    // IDLE: 200px、ATTACK: 230px
    const drawSize = sheet.drawSize;
    // attack_3 (4フレーム目, frame index 3) だけ描画X座標を-20pxオフセット
    const xOff = (a.state === "attack" && a.frame === 3) ? -20 : 0;
    // IDLE/ATTACK両方にY方向 -12px のオフセット(ATTACKが下にずれて見える問題の補正)
    const yOff = -12;
    ctx.save();
    ctx.translate(player.x, player.y);
    // 元画像は左向きで描かれているので、右向きに見せたい時にだけ反転
    if (!a.facingLeft) ctx.scale(-1, 1);
    if (player.invuln > 0 && Math.floor(elapsed * 20) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }
    ctx.drawImage(
      frameImg,
      xOff - drawSize / 2,
      yOff - drawSize / 2,
      drawSize, drawSize
    );
    ctx.restore();
  } else {
    // フォールバック: 円
    ctx.save();
    if (player.invuln > 0 && Math.floor(elapsed * 20) % 2 === 0) {
      ctx.fillStyle = "#ffaaaa";
    } else {
      ctx.fillStyle = "#b178ff";
    }
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a1f70";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

// 敵描画
function drawEnemy(e) {
  // 影
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 28, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const sheet = sprites.enemy_idle;
  const frameImg = sheet.loaded ? sheet.frames[e.animFrame] : null;

  if (frameImg) {
    const drawSize = sheet.drawSize; // 125 (96の約1.3倍)
    // 影の中心オフセット(e.yからの相対Y)
    const SHADOW_OFFSET_Y = 28;
    // 足元(スプライトの下端)を影の中心に揃える
    // スプライト画像下部に余白があるため +35px 下げて見た目の足元を影に合わせる
    const dx = -drawSize / 2;
    const dy = SHADOW_OFFSET_Y - drawSize + 35;
    ctx.save();
    ctx.translate(e.x, e.y);
    // 元画像は左向きで描かれているため、プレイヤーが右にいる時に反転して右向きに見せる
    if (player.x > e.x) ctx.scale(-1, 1);
    if (e.hitFlash > 0) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(frameImg, dx, dy, drawSize, drawSize);
    // ヒット時の白フラッシュ(上から薄く重ねる)
    if (e.hitFlash > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.6;
      ctx.drawImage(frameImg, dx, dy, drawSize, drawSize);
    }
    ctx.restore();
  } else {
    // フォールバック: 矩形
    ctx.save();
    ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : "#7a8a9a";
    ctx.fillRect(e.x - 14, e.y - 18, 28, 36);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeRect(e.x - 14, e.y - 18, 28, 36);
    ctx.restore();
  }

  // HPバー(満タンでなければ)
  if (e.hp < e.maxHp) {
    const w = 36;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(e.x - w / 2, e.y - 38, w, 4);
    ctx.fillStyle = "#ff5252";
    ctx.fillRect(e.x - w / 2, e.y - 38, w * (e.hp / e.maxHp), 4);
  }

  // 名前ラベル(最前面)
  ctx.save();
  ctx.fillStyle = "#ffdd88"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("ドエル", e.x, e.y - e.radius - 22);
  ctx.restore();
}

// ボス描画(まきば)
// 192px、足元を影中心に揃える。プレイヤーが右にいる時に反転(元画像が左向きと仮定)
function drawBoss() {
  // 影
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(boss.x, boss.y + 50, 50, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  const sheet = boss.state === "attack" ? sprites.makiba_attack : sprites.makiba_idle;
  const frameImg = sheet.loaded ? sheet.frames[boss.frame] : null;

  if (frameImg) {
    const drawSize = sheet.drawSize; // 192
    // 画像下部に余白を考慮して足元を影の中心に揃える
    const SHADOW_OFFSET_Y = 50;
    const dx = -drawSize / 2;
    const dy = SHADOW_OFFSET_Y - drawSize + 50;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (player.x > boss.x) ctx.scale(-1, 1);
    ctx.drawImage(frameImg, dx, dy, drawSize, drawSize);
    if (boss.hitFlash > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.7;
      ctx.drawImage(frameImg, dx, dy, drawSize, drawSize);
    }
    ctx.restore();
  } else {
    // フォールバック: 大きめ矩形
    ctx.save();
    ctx.fillStyle = boss.hitFlash > 0 ? "#fff" : "#a02828";
    ctx.fillRect(boss.x - 40, boss.y - 60, 80, 100);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeRect(boss.x - 40, boss.y - 60, 80, 100);
    ctx.restore();
  }
}

// ボス波動描画(makiba_effect.png をプレイヤー方向へ回転表示)
// 元画像は「左下→右上」の斬撃なので基準角度を -π/4 補正してから rotate する
// screen合成で暗背景での発光感を強調する
const BOSS_WAVE_BASE_ANGLE = -Math.PI / 4;
function drawBossWave(w) {
  const sheet = sprites.makiba_effect;
  const frameImg = sheet.loaded ? sheet.frames[0] : null;
  if (frameImg) {
    const drawW = sheet.drawW; // 320
    const drawH = sheet.drawH; // 220
    const t = Math.max(0, Math.min(1, w.life / w.maxLife));
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.angle + BOSS_WAVE_BASE_ANGLE);
    ctx.scale(-1, 1); // 元画像の向きに合わせて左右反転
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.4 + 0.6 * t;
    ctx.drawImage(frameImg, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  } else {
    // フォールバック: 半透明バー
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.angle);
    ctx.fillStyle = "rgba(255, 60, 60, 0.5)";
    ctx.fillRect(-160, -40, 320, 80);
    ctx.restore();
  }
}

// 弾描画
// 元画像は「左から右に飛ぶ」向き(angle≒0が基準)で描かれているため、
// rotate だけで全方向に対応できる(反転は不要)
function drawProjectile(p) {
  const sheet = sprites.effect;
  const frameImg = sheet.loaded ? sheet.frames[p.spriteFrame] : null;
  if (frameImg) {
    const drawSize = sheet.drawSize; // 96
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.drawImage(
      frameImg,
      -drawSize / 2, -drawSize / 2,
      drawSize, drawSize
    );
    ctx.restore();
  } else {
    // フォールバック: 発光円
    ctx.save();
    ctx.fillStyle = "#cc66ff";
    ctx.shadowColor = "#cc66ff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// 経験値オーブ描画
function drawXpOrb(o) {
  ctx.save();
  ctx.fillStyle = "#7df0ff";
  ctx.beginPath();
  ctx.arc(o.x, o.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(125, 240, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(o.x, o.y, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------- UI ----------
function drawUI() {
  // 上部背景
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, VIEW_W, 70);

  // HPバー
  drawBar(16, 12, 240, 18, player.hp / player.maxHp, "#d33", "#5a1818");
  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`HP ${Math.ceil(player.hp)} / ${player.maxHp}`, 22, 12 + 9);

  // 経験値バー
  drawBar(16, 38, 240, 14, player.xp / player.xpNext, "#7df0ff", "#234455");
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(`Lv. ${player.level}   ${player.xp} / ${player.xpNext}`, 22, 38 + 7);

  // タイマー(ステージ + 残り時間)
  const remaining = Math.max(0, STAGE_DURATION - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = Math.floor(remaining % 60);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `ステージ${currentStage}　残り ${mm}:${ss.toString().padStart(2, "0")}`,
    VIEW_W / 2, 32
  );

  // 撃破数・レベル
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#fff";
  ctx.fillText(`撃破: ${killCount}`, VIEW_W - 16, 22);
  ctx.fillText(`Lv ${player.level}`, VIEW_W - 16, 42);
  ctx.fillText(`残: ${enemies.length}`, VIEW_W - 16, 60);

  // ボス出現通知(3秒間フェードイン/アウト)
  if (bossNotificationTimer > 0) {
    const t = bossNotificationTimer;
    const fadeIn  = Math.min(1, (3.0 - t) * 4);
    const fadeOut = Math.min(1, t * 2);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    ctx.save();
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(255, 0, 0, 0.7)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = `rgba(255, 90, 90, ${alpha})`;
    const msg = (boss && boss.phase2)
      ? "まきば 激怒！ フェーズ2!!"
      : "BOSS 出現!  まきば";
    ctx.fillText(msg, VIEW_W / 2, 140);
    ctx.restore();
  }

  // ボスHPバー(下部中央)
  if (boss && boss.hp > 0) {
    const bw = 520, bh = 22;
    const bx = (VIEW_W - bw) / 2;
    const by = VIEW_H - 44;
    drawBar(bx, by, bw, bh, boss.hp / boss.maxHp, "#ffd54a", "#3a2a00");
    ctx.save();
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // 縁取りで視認性確保
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(`まきば   ${Math.ceil(boss.hp)} / ${boss.maxHp}`, VIEW_W / 2 + 1, by + bh / 2 + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(`まきば   ${Math.ceil(boss.hp)} / ${boss.maxHp}`, VIEW_W / 2, by + bh / 2);
    ctx.restore();
  }
}

function drawBar(x, y, w, h, ratio, color, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// ---------- オーバーレイ操作 ----------
function showOverlay(id) { document.getElementById(id).classList.add("active"); }
function hideOverlay(id) { document.getElementById(id).classList.remove("active"); }

function showGameOver() {
  Sound.gameOver();
  document.getElementById("go-time").textContent  = `生存時間: ${formatTime(elapsed)}`;
  document.getElementById("go-kills").textContent = `撃破数: ${killCount}`;
  document.getElementById("go-level").textContent = `到達レベル: ${player.level}`;
  const { hs, updated } = saveHighscore(killCount, player.level, elapsed);
  const hsEl = document.getElementById("go-highscore");
  if (hsEl) {
    hsEl.textContent = updated
      ? `🏆 新記録！ 最高撃破: ${hs.kills}  最高レベル: ${hs.level}`
      : `🏆 ベスト 撃破: ${hs.kills}  レベル: ${hs.level}`;
  }
  showOverlay("gameover");
}
// 次のステージへ進む(stage-clear ボタンから呼ばれる)
function nextStage() {
  currentStage++;
  elapsed = 0;
  resetStageCombatState();
  hideOverlay("stage-clear");
  gameState = STATE_PLAYING;
  // プレイヤーHP全回復
  player.hp = player.maxHp;

  // 開始直後に無人にならないよう、通常敵だけ少し配置する。
  for (let i = 0; i < 2; i++) spawnEnemy();
}

function showClear() {
  document.getElementById("cl-time").textContent  = `生存時間: ${formatTime(elapsed)}`;
  document.getElementById("cl-kills").textContent = `撃破数: ${killCount}`;
  document.getElementById("cl-level").textContent = `到達レベル: ${player.level}`;
  const { hs, updated } = saveHighscore(killCount, player.level, elapsed);
  const hsEl = document.getElementById("cl-highscore");
  if (hsEl) {
    hsEl.textContent = updated
      ? `🏆 新記録！ 最高撃破: ${hs.kills}  最高レベル: ${hs.level}`
      : `🏆 ベスト 撃破: ${hs.kills}  レベル: ${hs.level}`;
  }
  showOverlay("clear");
}
function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function restart() {
  updateHighscoreDisplay();
  initGame();
}

// ---------- ミニマップ ----------
const minimapCanvas = document.getElementById("minimap");
const mmCtx = minimapCanvas.getContext("2d");
const MM_W = 120, MM_H = 90;
const MM_RANGE = 600; // ミニマップが表示するゲーム座標の半径

function drawMinimap() {
  if (gameState !== STATE_PLAYING) {
    mmCtx.clearRect(0, 0, MM_W, MM_H);
    return;
  }
  mmCtx.clearRect(0, 0, MM_W, MM_H);
  mmCtx.fillStyle = "rgba(0,0,0,0.6)";
  mmCtx.fillRect(0, 0, MM_W, MM_H);

  const toMM = (wx, wy) => ({
    x: MM_W / 2 + (wx - player.x) / MM_RANGE * MM_W / 2,
    y: MM_H / 2 + (wy - player.y) / MM_RANGE * MM_H / 2,
  });

  // 敵(赤い点)
  mmCtx.fillStyle = "rgba(255, 80, 80, 0.85)";
  for (const e of enemies) {
    const p = toMM(e.x, e.y);
    if (p.x < 0 || p.x > MM_W || p.y < 0 || p.y > MM_H) continue;
    mmCtx.beginPath();
    mmCtx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    mmCtx.fill();
  }

  // ヨンヨン(黄色の大きめ点)
  for (const el of yonyonElites) {
    if (el.dead) continue;
    const p = toMM(el.x, el.y);
    mmCtx.fillStyle = "rgba(255, 200, 40, 1)";
    mmCtx.beginPath();
    mmCtx.arc(
      Math.max(3, Math.min(MM_W-3, p.x)),
      Math.max(3, Math.min(MM_H-3, p.y)),
      3.5, 0, Math.PI * 2
    );
    mmCtx.fill();
  }

  // ポッティ(水色の大きめ点)
  for (const el of pottyElites) {
    if (el.dead) continue;
    const p = toMM(el.x, el.y);
    mmCtx.fillStyle = "rgba(96, 207, 255, 1)";
    mmCtx.beginPath();
    mmCtx.arc(
      Math.max(3, Math.min(MM_W-3, p.x)),
      Math.max(3, Math.min(MM_H-3, p.y)),
      3.5, 0, Math.PI * 2
    );
    mmCtx.fill();
  }

  // ボス(オレンジ・大きめ)
  if (boss) {
    const p = toMM(boss.x, boss.y);
    mmCtx.fillStyle = "rgba(255, 200, 40, 1)";
    mmCtx.beginPath();
    mmCtx.arc(
      Math.max(3, Math.min(MM_W - 3, p.x)),
      Math.max(3, Math.min(MM_H - 3, p.y)),
      4, 0, Math.PI * 2
    );
    mmCtx.fill();
  }

  // プレイヤー(白・中央)
  mmCtx.fillStyle = "#fff";
  mmCtx.beginPath();
  mmCtx.arc(MM_W / 2, MM_H / 2, 3, 0, Math.PI * 2);
  mmCtx.fill();

  // 枠線
  mmCtx.strokeStyle = "rgba(255,255,255,0.3)";
  mmCtx.lineWidth = 1;
  mmCtx.strokeRect(0.5, 0.5, MM_W - 1, MM_H - 1);
}

// ---------- ハイスコア ----------
const HS_KEY = "angela_survivors_hs";

function loadHighscore() {
  try {
    const data = JSON.parse(localStorage.getItem(HS_KEY) || "{}");
    return data;
  } catch { return {}; }
}

function saveHighscore(kills, level, survived) {
  const hs = loadHighscore();
  let updated = false;
  if (kills > (hs.kills || 0)) { hs.kills = kills; updated = true; }
  if (level > (hs.level || 0)) { hs.level = level; updated = true; }
  if (survived > (hs.survived || 0)) { hs.survived = survived; updated = true; }
  if (updated) localStorage.setItem(HS_KEY, JSON.stringify(hs));
  return { hs, updated };
}

function updateHighscoreDisplay() {
  const hs = loadHighscore();
  const el = document.getElementById("highscore-display");
  if (!el) return;
  if (hs.kills) {
    el.textContent = `🏆 最高記録 — 撃破: ${hs.kills}  最高レベル: ${hs.level}  最長生存: ${formatTime(hs.survived || 0)}`;
  } else {
    el.textContent = "";
  }
}

// ---------- モバイル仮想スティック ----------
const joystickZone = document.getElementById("joystick-zone");
const joystickBase = document.getElementById("joystick-base");
const joystickKnob = document.getElementById("joystick-knob");
const JOYSTICK_MAX = 40; // ノブが動ける最大距離(px)

let touchInput = { dx: 0, dy: 0, active: false };
let activeTouchId = null;
let baseRect = null;

function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

function initTouchControls() {
  if (!isTouchDevice()) return;
  joystickZone.style.display = "block";
  document.getElementById("hint").style.display = "none";

  joystickZone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    activeTouchId = touch.identifier;
    baseRect = joystickBase.getBoundingClientRect();
    updateJoystick(touch);
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === activeTouchId) {
        e.preventDefault();
        updateJoystick(touch);
      }
    }
  }, { passive: false });

  document.addEventListener("touchend", (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === activeTouchId) {
        activeTouchId = null;
        touchInput = { dx: 0, dy: 0, active: false };
        joystickKnob.style.transform = "translate(-50%, -50%)";
      }
    }
  });
}

function updateJoystick(touch) {
  if (!baseRect) return;
  const cx = baseRect.left + baseRect.width / 2;
  const cy = baseRect.top  + baseRect.height / 2;
  let dx = touch.clientX - cx;
  let dy = touch.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > JOYSTICK_MAX) { dx = dx/dist*JOYSTICK_MAX; dy = dy/dist*JOYSTICK_MAX; }
  joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  const norm = dist > 1 ? dist : 1;
  touchInput = { dx: dx / JOYSTICK_MAX, dy: dy / JOYSTICK_MAX, active: dist > 4 };
}

// ---------- メインループ ----------
let prevKillCount = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  // 撃破数の増加を監視して敵撃破音を鳴らす(全敵種共通・1フレーム1回)
  if (typeof killCount === "number") {
    if (killCount < prevKillCount) prevKillCount = killCount;        // リスタート等でリセット
    else if (killCount > prevKillCount) { Sound.defeat(); prevKillCount = killCount; }
  }
  requestAnimationFrame(loop);
}

// タイトル状態の初期化(プレイヤー等は STARTで生成)
function initTitleState() {
  gameState = STATE_TITLE;
  // ダミー値(描画はしないが update が触らないように)
  player = null;
  resetStageCombatState();
  elapsed = 0;
  killCount = 0;
}

// ---------- 起動 ----------
preloadSprites(() => {
  initTitleState();
  updateHighscoreDisplay();
  initTouchControls();
  document.getElementById("startBtn").addEventListener("click", () => {
    Sound.init();
    initGame();
  });
  // ミュートボタン
  const muteBtn = document.getElementById("mute-btn");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      Sound.init();
      const m = !Sound.isMuted();
      Sound.setMuted(m);
      muteBtn.textContent = m ? "🔇" : "🔊";
    });
  }
  lastTime = performance.now();
  requestAnimationFrame(loop);
});

// ---------- PWA: Service Worker 登録 ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => {
      console.warn("ServiceWorker 登録失敗:", e);
    });
  });
}
