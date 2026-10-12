import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | 無限ノック',
  description: '無限ノックのプライバシーポリシー。個人情報の取り扱い、広告、Cookie、アクセス解析について定めます。',
};

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a', margin: '2em 0 0.5em', borderLeft: '4px solid #ff9900', paddingLeft: 12 }}>
      {children}
    </h3>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0.6em 0', lineHeight: 1.8 }}>{children}</p>;
}
function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0.5em 0', paddingLeft: 24, lineHeight: 1.8 }}>
      {items.map((item, i) => <li key={i} style={{ marginBottom: 4 }}>{item}</li>)}
    </ul>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#333', fontSize: 15 }}>
      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}プライバシーポリシー
      </nav>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#1a1a1a' }}>
        プライバシーポリシー
      </h1>

      <P>制定日：2025年1月1日　最終更新日：2026年10月6日</P>
      <P>
        無限ノック（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。
        本プライバシーポリシーは、本サービスにおける個人情報の取り扱い方針を定めるものです。
      </P>

      <H3>1. 収集する情報と利用目的</H3>
      <P>本サービスは以下の情報を収集します。</P>
      <Ul items={[
        'アカウント情報（メールアドレス）：ログイン認証および運営からのお知らせ送付のため',
        '学習履歴・スコア：演習結果の保存・分析および学習進捗の表示のため',
        '1日の演習回数（1日あたりの演習の上限を設けている場合）：上限の判定のため。日本時間の翌日0時を過ぎてから数日で自動的に削除されます',
        'おひねり（任意のお支払い）をいただいた場合の購入記録（ユーザーID・金額・購入日時・決済ID）：購入状態の反映・お問い合わせ対応・不正利用の確認のため。クレジットカード情報は本サービスでは取得・保存しません',
        'お問い合わせ内容：ユーザーサポート対応のため',
        'アクセスログ（IPアドレス、ブラウザ種別等）：サービスの改善・不正利用防止のため',
      ]} />

      <H3>2. 広告について</H3>
      <P>
        本サービスは、現在、広告を配信していません。
      </P>

      <H3>3. アクセス解析（Google Analytics）</H3>
      <P>
        本サービスは、サービス改善を目的としてアクセス解析ツール「Google Analytics」を利用する場合があります。
        Google Analytics はトラフィックデータ収集のために Cookie または類似技術を使用します。
        収集されるデータは匿名であり、個人を特定するものではありません。
        Google Analytics のデータ収集については
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#0047A3' }}>Google プライバシーポリシー</a>
        をご確認ください。
      </P>

      <H3>4. Cookie について</H3>
      <P>
        本サービスは、以下の目的で Cookie を使用します。
      </P>
      <Ul items={[
        'ログイン状態の維持・設定の保存',
        'アクセス解析',
      ]} />
      <P>
        ブラウザの設定から Cookie を無効にできます（一部機能が利用不可になる場合があります）。
      </P>

      <H3>5. 第三者への提供</H3>
      <P>
        本サービスは、法令に基づく場合を除き、収集した個人情報を第三者に提供・開示しません。
        ただし、AWS（Amazon Web Services）等のインフラサービスを利用するにあたり、
        サービスの運営上必要な範囲でデータが処理される場合があります。
      </P>
      <P>
        おひねり（任意のお支払い）の決済は、決済代行サービス「Stripe」（Stripe, Inc. および Stripe Payments Japan 株式会社）に委託しています。
        決済に必要な情報（メールアドレス・クレジットカード情報等）は Stripe が取得・処理し、本サービスはカード情報を受け取りません。
        Stripe における情報の取り扱いについては、
        <a href="https://stripe.com/jp/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#0047A3' }}>Stripe のプライバシーポリシー</a>
        をご確認ください。
      </P>

      <H3>6. 情報の管理・セキュリティ</H3>
      <P>
        収集した個人情報は、不正アクセス・紛失・改ざん・漏洩等を防止するため、
        適切な安全管理措置を講じます。
      </P>

      <H3>7. ポリシーの変更</H3>
      <P>
        本プライバシーポリシーは、法令の改正やサービス内容の変更に伴い、予告なく改訂する場合があります。
        変更後のポリシーは本ページに掲載した時点で効力を生じます。
      </P>

      <H3>8. お問い合わせ</H3>
      <P>
        個人情報の取り扱いに関するお問い合わせは、
        <a href="mailto:mugenknock@gmail.com" style={{ color: '#0047A3' }}>mugenknock@gmail.com</a>
        までご連絡ください。
      </P>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e0e0e0', fontSize: 13, color: '#888' }}>
        <Link href="/about" style={{ color: '#0047A3', textDecoration: 'none' }}>利用規約・運営者情報はこちら</Link>
      </div>
    </div>
  );
}
