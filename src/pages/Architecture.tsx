import React from 'react';
import Breadcrumb from '../components/Breadcrumb';

type ServiceCardProps = {
  name: string;
  category: string;
  description: string;
  color: string;
};

const ServiceCard = ({ name, category, description, color }: ServiceCardProps) => (
  <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '16px 20px', borderLeft: `4px solid ${color}`, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
    <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{category}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: '#16191f', marginBottom: 6 }}>{name}</div>
    <div style={{ fontSize: 13, color: '#545b64', lineHeight: 1.6 }}>{description}</div>
  </div>
);

type LayerProps = {
  title: string;
  children: React.ReactNode;
};

const Layer = ({ title, children }: LayerProps) => (
  <div style={{ marginBottom: 32 }}>
    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#545b64', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, height: 1, background: '#eaeded' }} />
      {title}
      <span style={{ flex: 1, height: 1, background: '#eaeded' }} />
    </h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      {children}
    </div>
  </div>
);

export default function Architecture() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px', color: '#16191f' }} className="page-container">
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: 'システム構成' }]} />
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>システム構成</h2>
      <p style={{ color: '#545b64', fontSize: 14, marginBottom: 32 }}>
        このアプリケーションは AWS のサービスを組み合わせて構築されたサーバーレス Web アプリです。
      </p>

      {/* アーキテクチャ概要図（テキストベース） */}
      <div style={{ background: '#232f3e', borderRadius: 2, padding: '24px 32px', marginBottom: 40, color: 'white' }}>
        <div style={{ fontSize: 13, color: '#879596', marginBottom: 16, fontWeight: 700, letterSpacing: '1px' }}>ARCHITECTURE OVERVIEW</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', fontSize: 13 }}>
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
              <div key={i} style={{ color: '#ff9900', fontSize: 18, padding: '0 8px', flexShrink: 0 }}>→</div>
            ) : (
              <div key={i} style={{ textAlign: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 2, flexShrink: 0 }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{(item as any).icon}</div>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#ff9900' }}>{(item as any).label}</div>
                <div style={{ fontSize: 11, color: '#879596' }}>{(item as any).sub}</div>
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
          color="#ff9900"
        />
        <ServiceCard
          name="React + TypeScript"
          category="フロントエンドフレームワーク"
          description="UI は React 18 + TypeScript で構築。CSS フレームワークは使わず、AWS マネジメントコンソールを参考にしたインラインスタイルで統一されています。"
          color="#61dafb"
        />
        <ServiceCard
          name="Amazon Cognito"
          category="認証・認可"
          description="ユーザープールによるメール＋パスワード認証。JWT トークンを発行し、API リクエストの認証に使用します。管理者権限はメールアドレスで制御しています。"
          color="#a855f7"
        />
      </Layer>

      {/* バックエンド */}
      <Layer title="バックエンド">
        <ServiceCard
          name="Amazon API Gateway"
          category="API エンドポイント"
          description="REST API のエントリポイント。CORS の設定、リクエストルーティングを担当し、Lambda 関数にプロキシします。"
          color="#e91e63"
        />
        <ServiceCard
          name="AWS Lambda"
          category="サーバーレスコンピューティング"
          description="Node.js（Express.js）で書かれた API サーバーを Lambda 関数として実行。サーバーの管理が不要で、リクエスト数に応じて自動スケールします。"
          color="#f4a261"
        />
        <ServiceCard
          name="Amazon DynamoDB"
          category="NoSQL データベース"
          description="問題データ、セッション、ユーザーの回答履歴などをすべて DynamoDB に保存。キーバリュー＆ドキュメントモデルで高速な読み書きを実現します。"
          color="#2a9d8f"
        />
      </Layer>

      {/* DynamoDB テーブル */}
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>DynamoDB テーブル構成</h3>
      <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, overflow: 'hidden', marginBottom: 40, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#fbfbfb', borderBottom: '1px solid #eaeded' }}>
              {['テーブル名', 'パーティションキー', 'ソートキー', '用途'].map(h => (
                <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 12, color: '#545b64', fontWeight: 700 }}>{h}</th>
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
              <tr key={row.name} style={{ borderBottom: i < 6 ? '1px solid #eaeded' : 'none' }}>
                <td style={{ padding: '10px 20px', fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{row.name}</td>
                <td style={{ padding: '10px 20px', fontFamily: 'monospace', fontSize: 13, color: '#00cccc' }}>{row.pk}</td>
                <td style={{ padding: '10px 20px', fontFamily: 'monospace', fontSize: 13, color: row.sk === '—' ? '#aab7b8' : '#00cccc' }}>{row.sk}</td>
                <td style={{ padding: '10px 20px', color: '#545b64', fontSize: 13 }}>{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CI/CD */}
      <Layer title="CI / CD">
        <ServiceCard
          name="AWS Amplify（CI/CD）"
          category="継続的デプロイ"
          description="メインブランチへのプッシュを検知して自動的にビルド・デプロイを実行。フロントエンドの変更は数分で本番環境に反映されます。"
          color="#ff9900"
        />
        <ServiceCard
          name="AWS CLI / Python"
          category="Lambda デプロイ"
          description="バックエンドの Lambda 関数は、変更時に Python の zipfile モジュールでパッケージを作成し、AWS CLI で直接デプロイしています。"
          color="#f4a261"
        />
      </Layer>

      <div style={{ background: '#e6f9f9', border: '1px solid #d4e9f5', borderRadius: 2, padding: '16px 20px', fontSize: 13, color: '#00cccc', lineHeight: 1.7 }}>
        <strong>注意：</strong> このページにはシステム設計の概要のみが記載されています。AWS アカウント ID、ARN、API キーなどの機密情報は一切含まれていません。
      </div>
    </div>
  );
}
