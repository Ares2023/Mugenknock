#!/usr/bin/env python3
"""
過去のgitコミット履歴からリリースノートを生成してDynamoDBに挿入するスクリプト。
既存エントリがない日付に対してのみ挿入する。
"""
import boto3
import uuid
from datetime import datetime, timezone

AWS_REGION = "ap-northeast-1"
TABLE_NAME = "Releases"

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)

RELEASES = [
    {
        "date": "2026-04-20",
        "title": "無限ノック、誕生！",
        "body": "AWS資格の学習をサポートするWebアプリが産声を上げました。\nこれからも継続的に機能を追加・改善していきます！",
        "titleEn": "Mugen Knock is Born!",
        "bodyEn": "Our AWS certification study app has launched!\nWe'll keep adding and improving features going forward.",
    },
    {
        "date": "2026-04-22",
        "title": "UI大改革！ブックマーク・英語対応・ログイン不要化！",
        "body": "デザインをAWS Cloudscapeスタイルに全面刷新！\nブックマーク機能・統計ページ追加、ログインなしでも全機能を使えるようになりました。",
        "titleEn": "Major UI Overhaul + Bookmarks + No Login Required!",
        "bodyEn": "Redesigned the entire UI in AWS Cloudscape style!\nAdded bookmarks, a stats page, and made all features available without logging in.",
    },
    {
        "date": "2026-04-26",
        "title": "問題一覧のフィルター機能を強化！",
        "body": "タグ・キーワード検索をインクリメンタル入力＋チップ形式に刷新！\nCloudWatch風のインラインフィルターパネルで絞り込みがよりスムーズに。",
        "titleEn": "Enhanced Question List Filters!",
        "bodyEn": "Redesigned tag and keyword search with incremental input and chip-style filters!\nFiltering is now smoother with a CloudWatch-inspired inline filter panel.",
    },
    {
        "date": "2026-04-30",
        "title": "UIの細部を調整",
        "body": "演習・模試設定画面の手順バッジをグレーに統一しました。\n操作感のノイズを減らして見やすくなっています。",
        "titleEn": "Minor UI Tweaks",
        "bodyEn": "Unified step badge colors to gray in exercise and exam setup screens.\nReduced visual noise for a cleaner look.",
    },
    {
        "date": "2026-05-02",
        "title": "操作感とローディングを改善！",
        "body": "「回答する」「次の問題へ」ボタンを右揃えに変更し、操作しやすくなりました。\nロード中にスピナーアニメーションが表示されるようになりました！",
        "titleEn": "Improved UX and Loading Animations!",
        "bodyEn": "Moved the Submit and Next buttons to the right for easier tapping.\nAdded spinner animations for loading states!",
    },
    {
        "date": "2026-05-05",
        "title": "問題一覧にドメインフィルター追加！",
        "body": "問題一覧からドメイン別に絞り込めるようになりました。\n試験ガイドのドメイン定義に合わせた正確なフィルタリングができます。",
        "titleEn": "Domain Filter Added to Question List!",
        "bodyEn": "You can now filter the question list by domain.\nFiltering is based on the official exam guide domain definitions.",
    },
    {
        "date": "2026-05-06",
        "title": "問題一覧の読み込みを安定化！",
        "body": "DynamoDBのデータ取得にページネーション処理を追加しました。\n大量データでも安定してすべての問題を読み込めるようになっています。",
        "titleEn": "Stabilized Question List Loading!",
        "bodyEn": "Added pagination to DynamoDB data fetching.\nAll questions now load reliably even with large datasets.",
    },
    {
        "date": "2026-05-07",
        "title": "カラーテーマをリニューアル！",
        "body": "メインカラーをティールからAWSブルー（#006CE0）に変更しました。\nより洗練されたビジュアルになっています！",
        "titleEn": "Color Theme Refreshed!",
        "bodyEn": "Changed the main color from teal to AWS Blue (#006CE0).\nThe app now has a more polished look!",
    },
    {
        "date": "2026-05-11",
        "title": "DVA・SOA資格を追加！今日のサービス機能も登場！",
        "body": "Developer Associate（DVA）とSysOps Administrator Associate（SOA-C03）の問題に対応しました！\nホーム画面に「今日のAWSサービス」カードも新登場です。",
        "titleEn": "Added DVA & SOA Certifications + Today's AWS Service!",
        "bodyEn": "Now supporting Developer Associate (DVA) and SysOps Administrator Associate (SOA-C03) questions!\nA new 'Today's AWS Service' card has been added to the home screen.",
    },
    {
        "date": "2026-05-12",
        "title": "日めくりAWSサービスに公式アイコンが登場！",
        "body": "日めくりAWSサービスに公式アーキテクチャアイコンを表示するようにしました！\n演習中の選択肢も動的なA/B/C/Dラベルに対応し、より本番試験に近い形式になりました。",
        "titleEn": "Official AWS Icons Now Shown in Daily Service!",
        "bodyEn": "Daily AWS Service cards now display official AWS architecture icons!\nAnswer choices in practice mode now show dynamic A/B/C/D labels, closer to the real exam format.",
    },
    {
        "date": "2026-05-13",
        "title": "モバイルUIを大幅改善！",
        "body": "スマホ向けのUIを全面的に見直し、より使いやすくなりました。\n「その他」ページが独立し、各コンテンツへのアクセスが簡単になっています！",
        "titleEn": "Major Mobile UI Overhaul!",
        "bodyEn": "Completely revamped the mobile UI for better usability.\nThe 'Others' page is now independent, making it easier to access each section!",
    },
    {
        "date": "2026-05-14",
        "title": "ホーム成績表示とスコア計算を改善！",
        "body": "ホーム画面の成績パネルをグレードバー形式にリニューアルし、より直感的な確認が可能になりました。\n直近10セッションをベースにした予想スコア計算も実装しています。",
        "titleEn": "Improved Home Score Display and Calculation!",
        "bodyEn": "Revamped the home screen performance panel with grade bars for more intuitive viewing.\nAlso implemented an estimated score calculation based on the last 10 sessions.",
    },
    {
        "date": "2026-05-15",
        "title": "スマホ横スワイプ操作と演習テストページを追加！",
        "body": "スマホ版でページ間を横スワイプで移動できるようになりました！\n演習・模試を集約した「トレーニング」画面を新設し、スマホから使いやすくなっています。",
        "titleEn": "Mobile Swipe Navigation + Training Screen Added!",
        "bodyEn": "You can now swipe horizontally between pages on mobile!\nA new 'Training' screen consolidating exercise and exam modes makes it easier to use on mobile.",
    },
    {
        "date": "2026-05-16",
        "title": "「このサイトについて」ページ追加・成績詳細モーダル刷新！",
        "body": "プライバシーポリシー・利用規約・運営者情報をまとめた「このサイトについて」ページを追加しました。\n成績詳細モーダルをデスクトップ2列・スマホタブ構成に刷新しています。",
        "titleEn": "Added 'About This Site' Page + Revamped Stats Modal!",
        "bodyEn": "Added an 'About This Site' page with privacy policy, terms of service, and operator info.\nAlso revamped the stats detail modal with a 2-column desktop layout and tab view on mobile.",
    },
    {
        "date": "2026-05-17",
        "title": "管理画面の問題一覧を高速化！",
        "body": "管理画面の問題一覧にページネーション処理を実装し、大量データでもスムーズに動作するようになりました。\n6MB上限によるエラーも解消しています。",
        "titleEn": "Faster Question List in Admin Panel!",
        "bodyEn": "Implemented pagination in the admin question list for smooth performance with large data.\nAlso fixed errors caused by the 6MB data limit.",
    },
    {
        "date": "2026-05-18",
        "title": "「しっかり対策」モード追加・AdSense対応！",
        "body": "苦手ドメインを集中的に演習できる「しっかり対策」モードを追加しました（30問演習で解放）！\nサクッと演習にドメイン選択機能も付き、さらに細かく設定できます。",
        "titleEn": "Added 'Focused Practice' Mode + AdSense Support!",
        "bodyEn": "Added a new 'Focused Practice' mode to intensively practice weak domains (unlocked after 30 questions)!\nQuick practice now also supports domain selection for more targeted study.",
    },
    {
        "date": "2026-05-19",
        "title": "サービス図鑑が登場！毎日1サービスずつ解放！",
        "body": "日めくりAWSサービスを訪れるたびに1つずつ解放されていくサービス図鑑を追加しました！\n129種の公式AWSアイコンも取り込み、本格的な図鑑体験が楽しめます。",
        "titleEn": "Service Encyclopedia Added! Unlock One Service Per Day!",
        "bodyEn": "Added a Service Encyclopedia that unlocks one entry each time you visit the Daily AWS Service!\nIncludes 129 official AWS icons for an authentic encyclopedia experience.",
    },
    {
        "date": "2026-05-20",
        "title": "ノック履歴追加・Web版レイアウトを大改善！",
        "body": "演習・模試の回答履歴をさかのぼれる「ノック履歴」タブを追加しました！\nWeb版のレイアウトも整理され、コンテンツ幅が最適化されています。",
        "titleEn": "Knock History Added + Improved Web Layout!",
        "bodyEn": "Added a 'Knock History' tab to review past exercise and exam answers!\nAlso improved the web layout with optimized content widths.",
    },
    {
        "date": "2026-05-22",
        "title": "対応資格が12種に拡大！日めくり解放ガチャ演出追加！",
        "body": "DEA・ANS・SCSを加え、対応AWS認定資格が12種類になりました！\n日めくりサービスの解放に抽選演出が追加され、毎日のログインがもっと楽しくなりました。",
        "titleEn": "Now Supporting 12 Certifications! Gacha Unlock Animation Added!",
        "bodyEn": "Added DEA, ANS, and SCS — now supporting 12 AWS certifications!\nAdded a lottery unlock animation to the daily AWS service, making daily check-ins more fun.",
    },
    {
        "date": "2026-05-23",
        "title": "ログイン画面を日本語化・使い勝手を改善！",
        "body": "ログイン・アカウント作成画面を日本語対応しました。\nオンボーディングや日めくりデータのアカウント分離など、細部の使い勝手も向上しています。",
        "titleEn": "Login Screen Now in Japanese + UX Improvements!",
        "bodyEn": "Localized the login and account creation screens to Japanese.\nAlso improved details like onboarding and per-account daily service data separation.",
    },
    {
        "date": "2026-05-24",
        "title": "インフラを最新環境（Amplify Gen2）に移行！",
        "body": "バックエンドをAWS Amplify Gen1からGen2へ移行しました。\nより安定した環境でサービスを提供できるようになっています。",
        "titleEn": "Migrated Infrastructure to Amplify Gen2!",
        "bodyEn": "Migrated the backend from AWS Amplify Gen1 to Gen2.\nThis enables us to deliver the service on a more stable infrastructure.",
    },
    {
        "date": "2026-05-25",
        "title": "成績詳細にドメイン別スコア表示を追加！",
        "body": "成績詳細モーダルにドメインごとのスコア内訳を追加しました！\nどのドメインが強くてどこが弱いか、一目でわかるようになっています。",
        "titleEn": "Domain Score Breakdown Added to Stats Detail!",
        "bodyEn": "Added a per-domain score breakdown to the stats detail modal!\nYou can now see at a glance which domains are your strengths and weaknesses.",
    },
    {
        "date": "2026-05-26",
        "title": "演習画面UI刷新！途中採点機能も追加！",
        "body": "演習画面のUIを全面刷新し、進捗ノードや選択肢デザインがよりすっきりしました。\n演習を途中でやめても「中断して採点」できる機能も追加しています！",
        "titleEn": "Revamped Exercise UI + Mid-Session Scoring Added!",
        "bodyEn": "Completely revamped the exercise screen UI with cleaner progress nodes and choice design.\nAlso added the ability to 'score and quit' in the middle of an exercise session!",
    },
    {
        "date": "2026-05-27",
        "title": "成績計算を刷新！直近5問基準に統一！",
        "body": "予想スコアと正答率の計算を直近5問ベースに統一し、より実態に近い成績表示になりました。\n成績詳細の各バーや内訳も計算方法が揃い、数字の整合性が取れています。",
        "titleEn": "Revamped Score Calculation! Now Based on Last 5 Questions!",
        "bodyEn": "Unified estimated score and accuracy calculations to be based on the last 5 questions for more realistic results.\nAll bars and breakdowns in the stats detail now use consistent calculation methods.",
    },
    {
        "date": "2026-05-28",
        "title": "資格ダッシュボードとポイント制が登場！",
        "body": "目標資格の進捗を一覧できる「資格ダッシュボード」を追加しました！\n演習問題に正解するとポイントが貯まる仕組みも実装しています。",
        "titleEn": "Certification Dashboard and Points System Added!",
        "bodyEn": "Added a 'Certification Dashboard' to view your progress for all target certifications!\nAlso implemented a points system that rewards you for correct answers.",
    },
    {
        "date": "2026-05-29",
        "title": "日めくり再抽選がアニメーション演出に！",
        "body": "日めくりAWSサービスの再抽選がモーダルアニメーション付きの演出になりました！\n毎日のサービス解放がさらに楽しくなっています。",
        "titleEn": "Daily Service Re-roll Now Has Animation!",
        "bodyEn": "The daily AWS service re-roll now features a modal animation!\nUnlocking services each day is even more fun.",
    },
    {
        "date": "2026-05-30",
        "title": "SEO・AdSense審査対応！グラフアニメーション追加！",
        "body": "サイトマップ・OGP・JSON-LDを整備し、SEOとAdSense審査への対応を強化しました。\n成長グラフに滑らかなアニメーションも追加しています！",
        "titleEn": "SEO & AdSense Updates + Chart Animations Added!",
        "bodyEn": "Added sitemap, OGP, and JSON-LD to improve SEO and AdSense compliance.\nAlso added smooth animations to the growth charts!",
    },
    {
        "date": "2026-05-31",
        "title": "マイページ追加・ステージング/本番の2環境構成を整備！",
        "body": "学習状況と苦手分析をまとめて確認できる「マイページ」を追加しました！\nステージング環境（develop）と本番環境（master）の2段階デプロイ構成も整備しています。",
        "titleEn": "My Page Added + Staging/Production Two-Environment Setup!",
        "bodyEn": "Added 'My Page' to review your learning progress and weak-point analysis all in one place!\nAlso set up a two-stage deployment pipeline with separate staging (develop) and production (master) environments.",
    },
    {
        "date": "2026-06-01",
        "title": "エラー監視・デバッグ基盤を強化！マイページを拡充！",
        "body": "クライアントエラーをCloudWatchに自動送信する監視基盤を整備しました。\nマイページの「しっかり対策」ボタンもホーム画面と統一されデザインが揃っています！",
        "titleEn": "Enhanced Error Monitoring & Debugging + Expanded My Page!",
        "bodyEn": "Set up a monitoring system to automatically send client errors to CloudWatch.\nThe 'Focused Practice' button on My Page now matches the home screen design!",
    },
]


def get_existing_dates():
    response = table.scan(ProjectionExpression="#d", ExpressionAttributeNames={"#d": "date"})
    return {item["date"] for item in response.get("Items", [])}


def insert_release(release):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    item = {
        "releaseId": str(uuid.uuid4()),
        "date": release["date"],
        "title": release["title"],
        "body": release["body"],
        "titleEn": release["titleEn"],
        "bodyEn": release["bodyEn"],
        "createdAt": now,
    }
    table.put_item(Item=item)
    print(f"  Inserted: {release['date']} — {release['title']}")


def main():
    print("Fetching existing release dates...")
    existing_dates = get_existing_dates()
    print(f"Existing dates ({len(existing_dates)}): {sorted(existing_dates)}\n")

    inserted = 0
    skipped = 0
    for release in RELEASES:
        if release["date"] in existing_dates:
            print(f"  SKIP (exists): {release['date']} — {release['title']}")
            skipped += 1
        else:
            insert_release(release)
            inserted += 1

    print(f"\nDone. Inserted: {inserted}, Skipped (already exists): {skipped}")


if __name__ == "__main__":
    main()
