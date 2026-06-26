// 問題の多言語フィールド選択を集約するアクセサ。
// 言語追加・フォールバック規則の変更をこの1ファイルに閉じ込める（DBスキーマは変更しない）。
type LocalizableQuestion = {
  questionText: string;
  questionTextEn?: string;
  choices: string[];
  choicesEn?: string[];
  explanation?: string;
  explanationEn?: string;
};

const isEn = (lang: string) => lang === 'en';

export function qText(q: LocalizableQuestion, lang: string): string {
  return isEn(lang) && q.questionTextEn ? q.questionTextEn : q.questionText;
}

export function qChoices(q: LocalizableQuestion, lang: string): string[] {
  return isEn(lang) && q.choicesEn && q.choicesEn.length > 0 ? q.choicesEn : q.choices;
}

// 元選択肢インデックス ci に対応する表示テキスト（En 欠落時は ja にフォールバック）
export function qChoiceAt(q: LocalizableQuestion, lang: string, ci: number): string {
  return qChoices(q, lang)[ci] ?? q.choices[ci];
}

export function qExplanation(q: LocalizableQuestion, lang: string): string {
  return isEn(lang) && q.explanationEn ? q.explanationEn : (q.explanation ?? '');
}
