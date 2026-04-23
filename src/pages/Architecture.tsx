import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

type ServiceCardProps = {
  name: string;
  category: string;
  description: string;
  color: string;
};

const ServiceCard = ({ name, category, description, color }: ServiceCardProps) => (
  <Card padding="16px 20px" style={{ borderLeft: `4px solid ${color}` }}>
    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-xs)' }}>{category}</div>
    <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 'var(--spacing-sm)' }}>{name}</div>
    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>{description}</div>
  </Card>
);

type LayerProps = {
  title: string;
  children: React.ReactNode;
};

const Layer = ({ title, children }: LayerProps) => (
  <div style={{ marginBottom: 'var(--spacing-xl)' }}>
    <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
      <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      {title}
      <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--spacing-md)' }}>
      {children}
    </div>
  </div>
);

export default function Architecture() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)', color: 'var(--color-text-main)' }} className="page-container">
      <h2 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-sm)' }}>システム構成</h2>
      <p style={{ color: 'var(--color-text-sub)', fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-xl)' }}>
        このアプリケーションは AWS のサービスを組み合わせて構築されたサーバーレス Web アプリです。
      </p>

      {/* アーキテクチャ概要図（テキストベース） */}
      <div style={{ background: 'var(--color-secondary)', borderRadius: 'var(--border-radius-md)', padding: 'var(--spacing-xl)', marginBottom: 40, color: 'var(--color-bg-white)' }}>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-lg)', fontWeight: 700, letterSpacing: '1px' }}>ARCHITECTURE OVERVIEW</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', fontSize: 'var(--font-size-sm)' }}>
          {[
            { label: 'ユーザー', sub: 'ブラウザ', icon: '👤' },
            { arrow: true },
            { label: 'Amplify Hosting', sub: 'CDN / S3', icon: '🌐' },
            { arrow: true },
            { label: 'Cognito', sub: '認証', icon: '🔐' },
            { arrow: true },
            { label: 'API Gateway', sub: 'REST API', icon: '⚡' },
            { arrow: true },
            { label: 'Lambda', sub: 'Express.js', icon: '𝛌' },
            { arrow: true },
            { label: 'DynamoDB', sub: 'NoSQL DB', icon: '🗄️' },
          ].map((item, i) =>
            (item as any).arrow ? (
              <div key={i} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, padding: '0 var(--spacing-sm)', flexShrink: 0 }}>→</div>
            ) : (
              <div key={i} style={{ textAlign: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--border-radius-md)', flexShrink: 0 }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{(item as any).icon}</div>
                <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,0.9)' }}>{(item as any).label}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>{(item as any).sub}</div>
              </div>
            )
          )}
        </div>
      </div>

      {/* フロントエンド */}
      <Layer title="フロントエンド">
        <ServiceCard
          name="AWS Amplify Hosting"
          category="ホスティング / CDN"
          description="React SPA（シングルページアプリ）を静的ファイルとしてホスト。CloudFront 経由で配信し、コードをプッシュするたびに自動デプロイが走ります。"
          color="var(--color-primary)"
        />
        <ServiceCard
          name="React + TypeScript"
          category="フロントエンドフレームワーク"
          description="UI は React 18 + TypeScript で構築。CSS フレームワークは使わず、AWS マネジメントコンソールを参考にしたインラインスタイルで統一されています。"
          color="var(--color-primary)"
        />
        <ServiceCard
          name="Amazon Cognito"
          category="認証・認可"
          description="ユーザープールによるメール＋パスワード認証。JWT トークンを発行し、API リクエストの認証に使用します。管理者権限はメールアドレスで制御しています。"
          color="var(--color-primary)"
        />
      </Layer>

      {/* バックエンド */}
      <Layer title="バックエンド">
        <ServiceCard
          name="Amazon API Gateway"
          category="API エンドポイント"
          description="REST API のエントリポイント。CORS の設定、リクエストルーティングを担当し、Lambda 関数にプロキシします。"
          color="var(--color-text-light)"
        />
        <ServiceCard
          name="AWS Lambda"
          category="サーバーレスコンピューティング"
          description="Node.js（Express.js）で書かれた API サーバーを Lambda 関数として実行。サーバーの管理が不要で、リクエスト数に応じて自動スケールします。"
          color="var(--color-text-light)"
        />
        <ServiceCard
          name="Amazon DynamoDB"
          category="NoSQL データベース"
          description="問題データ、セッション、ユーザーの回答履歴などをすべて DynamoDB に保存。キーバリュー＆ドキュメントモデルで高速な読み書きを実現します。"
          color="var(--color-text-light)"
        />
      </Layer>

      {/* DynamoDB テーブル */}
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: '0 0 var(--spacing-md)' }}>DynamoDB テーブル構成</h3>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: 40 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-base)' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-main)', borderBottom: '1px solid var(--color-border)' }}>
                {['テーブル名', 'パーティションキー', 'ソートキー', '用途'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Questions', pk: 'questionId', sk: '—', desc: '問題文・選択肢・正解・解説' },
                { name: 'Sessions', pk: 'userId', sk: 'sessionId', desc: '演習・模試のセッション管理' },
                { name: 'UserAnswers', pk: 'userId', sk: 'questionIdTimestamp', desc: '各問への回答履歴' },
                { name: 'UserQuestionStats', pk: 'userId', sk: 'questionId', desc: '正解数・不正解数・ブックマーク' },
                { name: 'UserTagStats', pk: 'userId', sk: 'tagId', desc: 'タグ別の正解率統計' },
                { name: 'Tips', pk: 'tipId', sk: '—', desc: '演習中に表示するコラム記事' },
                { name: 'Reports', pk: 'questionId', sk: 'reportId', desc: '問題への通報内容' },
              ].map((row, i) => (
                <tr key={row.name} style={{ borderBottom: i < 6 ? '1px solid var(--color-border)' : 'none' }}>
                  <td style={{ padding: '10px 20px', fontWeight: 700, fontFamily: 'monospace', fontSize: 'var(--font-size-sm)' }}>{row.name}</td>
                  <td style={{ padding: '10px 20px', fontFamily: 'monospace', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>{row.pk}</td>
                  <td style={{ padding: '10px 20px', fontFamily: 'monospace', fontSize: 'var(--font-size-sm)', color: row.sk === '—' ? 'var(--color-text-light)' : 'var(--color-primary)' }}>{row.sk}</td>
                  <td style={{ padding: '10px 20px', color: 'var(--color-text-sub)', fontSize: 'var(--font-size-sm)' }}>{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* CI/CD */}
      <Layer title="CI / CD">
        <ServiceCard
          name="AWS Amplify（CI/CD）"
          category="継続的デプロイ"
          description="メインブランチへのプッシュを検知して自動的にビルド・デプロイを実行。フロントエンドの変更は数分で本番環境に反映されます。"
          color="var(--color-primary)"
        />
        <ServiceCard
          name="AWS CLI / Python"
          category="Lambda デプロイ"
          description="バックエンドの Lambda 関数は、変更時に Python の zipfile モジュールでパッケージを作成し、AWS CLI で直接デプロイしています。"
          color="var(--color-text-light)"
        />
      </Layer>

      <div style={{ background: 'var(--color-primary-light)', borderLeft: '4px solid var(--color-primary)', borderRadius: 'var(--border-radius-md)', padding: '16px 20px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--color-primary)' }}>注意：</strong> このページにはシステム設計の概要のみが記載されています。AWS アカウント ID、ARN、API キーなどの機密情報は一切含まれていません。
      </div>
    </div>
  );
}
