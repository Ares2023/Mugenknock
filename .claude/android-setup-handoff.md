# Android Setup Handoff

PowerShell側のClaudeがAndroid Studio設定の成果をここに書き込む。
WSL側のClaudeはこのファイルを読んでAndroidビルド設定を進める。

---

## WSLからのパス
```
/home/yuzuki/aws-quiz-app/.claude/android-setup-handoff.md
```

## WindowsからのWSLパス（PowerShell用）
```
\\wsl$\Ubuntu\home\yuzuki\aws-quiz-app\.claude\android-setup-handoff.md
```

---

---

## [2026-05-16] PowerShell側 調査結果

### Android Studio
- インストールパス: `C:\Program Files\Android\Android Studio`
- SDK インストールパス: `C:\Users\yuzuk\AppData\Local\Android\Sdk`
- 利用可能 platforms: `android-35`, `android-36.1`
- 利用可能 build-tools: `35.0.0`, `35.0.1`, `36.0.0`, `36.1.0`, `37.0.0`

### Java / JDK（Windows側）
- パス: `C:\Program Files\Android\Android Studio\jbr`
- バージョン: OpenJDK 21.0.10（Android Studio 同梱 JBR）
- WSL2側: **未インストール** ← 要対応

### プロジェクト設定（variables.gradle より）
- minSdkVersion: 23
- compileSdkVersion: 35
- targetSdkVersion: 35
- Gradle plugin: `com.android.tools.build:gradle:8.7.2`
- Gradle wrapper: 8.11.1（初回実行時にダウンロード済み）

### WSLからの Android SDK パス
```
/mnt/c/Users/yuzuk/AppData/Local/Android/Sdk
```

### 失敗したこと・原因
- PowerShell から `gradlew.bat` を WSL2 ネットワークドライブ（`\\wsl$\Ubuntu\...` / Z: マップ）経由で実行すると
  `java.io.IOException: ファンクションが間違っています` で失敗する
- 原因: Gradle の Java NIO ファイルハッシュ処理が WSL2 ネットワークドライブ上で動作しない
- 結論: **WSL2 内から `./gradlew` を実行するのが正しいアプローチ**

---

## [2026-05-16] WSL側への依頼タスク

以下を順番に実行してほしい。

### Step 1: JDK 17 インストール
```bash
sudo apt-get update && sudo apt-get install -y openjdk-17-jdk
java -version  # 確認
```

### Step 2: ANDROID_HOME を設定して Gradle sync 確認
```bash
cd ~/aws-quiz-app/android

export ANDROID_HOME=/mnt/c/Users/yuzuk/AppData/Local/Android/Sdk
export PATH=$ANDROID_HOME/platform-tools:$PATH

./gradlew tasks --no-daemon
```
- 成功したら「BUILD SUCCESSFUL」が表示されるはず

### Step 3: デバッグ APK ビルド
```bash
export ANDROID_HOME=/mnt/c/Users/yuzuk/AppData/Local/Android/Sdk
cd ~/aws-quiz-app/android
./gradlew assembleDebug --no-daemon
```
- 成功時の APK 出力先: `~/aws-quiz-app/android/app/build/outputs/apk/debug/app-debug.apk`

### Step 4: （Step 3 成功後）リリース AAB ビルドへ
- キーストア作成が必要（初回のみ）
- `./gradlew bundleRelease` で署名済み AAB を生成

### 完了後
このファイルの「WSL側の対応状況」セクションに結果を記入してください。

---

## WSL側の対応状況

（WSL Claude がここに記入）
