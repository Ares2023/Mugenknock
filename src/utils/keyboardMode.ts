// キーボード操作モードのグローバル状態。
// 既定は無効（カーソル非表示）。矢印などのナビキー入力で有効化し、Escで無効化する。
// document.body.dataset.kbmode を即時の真実とし、'kbmodechange' イベントで各コンポーネントの
// 表示状態（カーソル可視）を同期する。

export function isKbMode(): boolean {
  return typeof document !== 'undefined' && document.body.dataset.kbmode === 'on';
}

export function setKbMode(on: boolean): void {
  if (typeof document === 'undefined') return;
  const v = on ? 'on' : 'off';
  if (document.body.dataset.kbmode === v) return;
  document.body.dataset.kbmode = v;
  window.dispatchEvent(new CustomEvent('kbmodechange', { detail: on }));
}
