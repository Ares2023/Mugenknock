import React from 'react';

// 管理画面から投稿される本文（合格コメント等）の簡易 Markdown レンダラー。
// もともと ExamSelectOverlay 内のローカル関数だったが、資格ダッシュボードでも
// 同じ合格コメントを表示しており、そちらは生テキスト描画で `**太字**` が
// そのまま見えていたため共有コンポーネントとして切り出した。
//
// dangerouslySetInnerHTML は使わず React 要素を組み立てるため、HTML 注入は起きない。

// テキストの inline 記法（**bold** / *italic* / `code` / [text](url)）をパースして React 要素に変換する
export function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g;
  let last = 0, m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] != null) parts.push(<strong key={`${keyPrefix}-b${i}`}>{m[2]}</strong>);
    else if (m[3] != null) parts.push(<em key={`${keyPrefix}-i${i}`}>{m[3]}</em>);
    else if (m[4] != null) parts.push(<code key={`${keyPrefix}-c${i}`} style={{ background: 'rgba(0,0,0,.08)', borderRadius: 3, padding: '0 4px', fontSize: '0.9em' }}>{m[4]}</code>);
    else if (m[5] != null) parts.push(<a key={`${keyPrefix}-a${i}`} href={m[6]} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{m[5]}</a>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Markdown を React 要素にレンダリングする（見出し・リスト・段落・インライン記法対応）
export default function MarkdownText({ text, color }: { text: string; color?: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  const flushList = () => {
    if (listItems.length) { nodes.push(<ul key={`ul-${nodes.length}`} style={{ margin: '4px 0 4px 16px', padding: 0 }}>{listItems}</ul>); listItems = []; }
  };
  lines.forEach((line, idx) => {
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    const li = line.match(/^[-*]\s+(.*)/);
    if (h2) {
      flushList();
      nodes.push(<div key={idx} style={{ fontWeight: 700, fontSize: 'var(--font-size-sm2)', color: color ?? 'inherit', marginTop: 6, marginBottom: 2 }}>{parseInline(h2[1], String(idx))}</div>);
    } else if (h1) {
      flushList();
      nodes.push(<div key={idx} style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: color ?? 'inherit', marginTop: 8, marginBottom: 2 }}>{parseInline(h1[1], String(idx))}</div>);
    } else if (li) {
      listItems.push(<li key={idx} style={{ listStyle: 'disc' }}>{parseInline(li[1], String(idx))}</li>);
    } else {
      flushList();
      if (line === '') {
        nodes.push(<br key={idx} />);
      } else {
        nodes.push(<span key={idx}>{parseInline(line, String(idx))}<br /></span>);
      }
    }
  });
  flushList();
  return <>{nodes}</>;
}
