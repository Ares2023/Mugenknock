import { API_ENDPOINT } from '../constants';

// ログインユーザーの localStorage 設定・実績データを /users/me/preferences の
// 汎用KVマップへ自動同期する（デバイス間同期）。
//
// 仕組み:
// - localStorage.setItem / removeItem をラップし、ホワイトリストに一致する
//   「現在のユーザーIDを含むキー」の書き込みを検知 → デバウンスしてサーバへ送信
// - 起動時（および画面復帰時・5分スロットル）にサーバからプルし、
//   キーごとの更新時刻（Last-Writer-Wins）でローカルへ反映
// - 反映したキーは CustomEvent('kvSynced', {detail: {keys}}) で通知する
//   （テーマ等、メモリ上の状態を持つ購読者が再読込するため）
// - ゲストは対象外（initKvSync が呼ばれない）。ゲストのローカルデータは同期しない。
//
// 日次演習カウント（dailyQCount_）はここでは同期しない。
// セッション終了時にサーバへアトミック加算する方式（utils/dailyProgress.ts）のため。

const SYNC_PREFIXES = [
  'quickExercisePrefs_',   // サクッと演習 設定
  'focusedExercisePrefs_', // しっかり対策 設定
  'exercisePrefs_',        // 演習（Practice）設定
  'examPrefs_',            // 模試 設定
  'lastQuickMode_',        // ホームの quick/focused トグル
  'dailyGoalReward_',      // 日次目標報酬の付与済みフラグ（二重付与防止）
  'score_prev_',           // 前回の予想スコア（差分表示用）
  // 注: domain_history_ / domain_results_ はここで同期しない。
  //   これらは各ドメインの配列を蓄積する「まるごとブロブ」で、キー単位のLWW上書きだと
  //   初回プル時（ローカルmeta=0）にサーバの古い/部分データがローカルの蓄積を消してしまう。
  //   ドメイン別正答率はサーバの累計統計(/users/me/stats)＋domainStatsの /domain-results 同期で
  //   すでにデバイス間連携されるため、kvSync では扱わない（過去記録の消失・未更新を防ぐ）。
  'theme_',                // テーマ（ライト/ダーク）
  'sherpaExamHint_',       // ヒント消去フラグ
  'sherpaStatsHint_',
  'scoreWindow_',          // 予想スコア計算の直近N回設定
];

type KvEntry = { v: string | null; t: number };

let currentUid: string | null = null;
let storagePatched = false;
let applyingPull = false;
let pending: Record<string, KvEntry> = {};
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPullAt = 0;
let visibilityHooked = false;

const metaKey = (uid: string) => `_kvmeta_${uid}`;

function readMeta(uid: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(metaKey(uid)) ?? '{}'); } catch { return {}; }
}
function writeMeta(uid: string, meta: Record<string, number>) {
  try { localStorage.setItem(metaKey(uid), JSON.stringify(meta)); } catch {}
}

function isSyncable(key: string, uid: string): boolean {
  if (!uid || uid === 'guest') return false;
  if (!key.includes(uid)) return false;
  return SYNC_PREFIXES.some(p => key.startsWith(p));
}

function queuePush(key: string, value: string | null) {
  const uid = currentUid;
  if (!uid) return;
  const t = Date.now();
  const meta = readMeta(uid);
  meta[key] = t;
  writeMeta(uid, meta);
  pending[key] = { v: value, t };
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 1500);
}

function flushPush() {
  const uid = currentUid;
  pushTimer = null;
  if (!uid || Object.keys(pending).length === 0) return;
  const patch = pending;
  pending = {};
  fetch(`${API_ENDPOINT}/users/me/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: uid, kvPatch: patch }),
    keepalive: true,
  }).catch(() => {
    // 失敗分は次回フラッシュに持ち越す（新しい書き込みを上書きしない）
    pending = { ...patch, ...pending };
  });
}

function patchStorage() {
  if (storagePatched) return;
  storagePatched = true;
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    origSet(key, value);
    if (!applyingPull && currentUid && isSyncable(key, currentUid)) queuePush(key, value);
  };
  localStorage.removeItem = (key: string) => {
    origRemove(key);
    if (!applyingPull && currentUid && isSyncable(key, currentUid)) queuePush(key, null);
  };
  // タブを閉じる直前に未送信分を送る
  window.addEventListener('pagehide', flushPush);
  window.addEventListener('beforeunload', flushPush);
}

async function pullFromServer(uid: string): Promise<void> {
  try {
    const res = await fetch(`${API_ENDPOINT}/users/me/preferences?userId=${encodeURIComponent(uid)}`);
    if (!res.ok) return;
    const data = await res.json();
    const kv: Record<string, KvEntry> = data.kv ?? {};
    const meta = readMeta(uid);
    const changed: string[] = [];

    applyingPull = true;
    try {
      // サーバ → ローカル（サーバの方が新しいキーのみ反映）
      for (const [k, e] of Object.entries(kv)) {
        if (!e || typeof e.t !== 'number' || !isSyncable(k, uid)) continue;
        if ((meta[k] ?? 0) >= e.t) continue;
        if (e.v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, e.v);
        meta[k] = e.t;
        changed.push(k);
      }
    } finally {
      applyingPull = false;
    }

    // ローカル → サーバ（サーバに無い/古い、既存端末のローカル値を初回アップロード）
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !isSyncable(k, uid)) continue;
      const serverT = kv[k]?.t ?? 0;
      const localT = meta[k] ?? 0;
      if (localT > serverT || (!kv[k] && localStorage.getItem(k) !== null)) {
        const t = localT || Date.now();
        meta[k] = t;
        pending[k] = { v: localStorage.getItem(k), t };
      }
    }
    writeMeta(uid, meta);
    if (Object.keys(pending).length > 0) {
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(flushPush, 500);
    }
    if (changed.length > 0) {
      window.dispatchEvent(new CustomEvent('kvSynced', { detail: { keys: changed } }));
    }
  } catch { /* オフライン等は黙殺（ローカルのみで継続） */ }
}

/** ログインユーザー確定時に呼ぶ。多重呼び出しは安全（uid変更時は再プル） */
export function initKvSync(userId: string): void {
  if (!userId || userId === 'guest') return;
  const uidChanged = currentUid !== userId;
  currentUid = userId;
  patchStorage();
  const now = Date.now();
  if (uidChanged || now - lastPullAt > 5 * 60 * 1000) {
    lastPullAt = now;
    void pullFromServer(userId);
  }
  // 画面復帰時の再プル（5分スロットル）: 別デバイスで変えた設定を持ち帰る
  if (!visibilityHooked) {
    visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !currentUid) return;
      const n = Date.now();
      if (n - lastPullAt > 5 * 60 * 1000) {
        lastPullAt = n;
        void pullFromServer(currentUid);
      }
    });
  }
}
