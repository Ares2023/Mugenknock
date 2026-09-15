import { API_ENDPOINT } from '@/constants';

// ランディングページ（app/page.tsx のメタデータ・Portal.tsx の本文）に出す
// 「問題数」の唯一の真実source。ビルド時に実データを取得する。
//
// 過去は QUESTION_COUNT 定数を手動で書き換えており（chore(portal): 問題数を
// 4900→5000に更新、等）、更新のたびに DB 実績を手で確認する運用だった。
// この運用では検証(02)・監査による自動削除/非表示化で実数が変動しても
// 定数側は追従せず、2026-09-15 時点で「5000問以上」と表示されているのに
// 実際の出題プール（totalVerified）は 4957 問と、表示が実数を上回って
// いた（サイトの信頼性に関わる）。
//
// 対策: ビルドのたびに実数を取得し、100問単位で切り捨てて表示する。
// 「X問以上」の主張は今後 実数 >= 表示値 が常に成り立つ（実数が減って
// 次のキリ番を割り込まない限り、手動更新なしに正しい状態を保てる）。
//
// GET /questions/growth-stats の totalVerified は validityCheckedAt を
// 持つ問題数（isHidden は見ていない）。GET /questions の実際の出題プールは
// !isHidden && !!validityCheckedAt なので totalVerified はわずかに
// 過大な場合があるが、100問単位への切り捨てが十分な安全マージンになる。
const FALLBACK_COUNT = 4500; // API取得に失敗した場合の保守的な既定値（実数を上回らないよう低めに設定）
const ROUND_TO = 100;

export async function getQuestionCountDisplay(): Promise<number> {
  try {
    const res = await fetch(`${API_ENDPOINT}/questions/growth-stats`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return FALLBACK_COUNT;
    const data = await res.json();
    const verified = Number(data.totalVerified);
    if (!Number.isFinite(verified) || verified <= 0) return FALLBACK_COUNT;
    return Math.floor(verified / ROUND_TO) * ROUND_TO;
  } catch {
    return FALLBACK_COUNT;
  }
}
