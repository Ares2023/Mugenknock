#!/usr/bin/env node
/**
 * 全資格の生成プロンプト本文を、夜間生成の唯一ソースである
 * prompts/night-prompts/scripts/instructions/<EXAM>.txt から src/data/originalInstructions.ts へ生成する。
 *
 * これにより「夜間スクリプト」と「管理画面のAIプロンプト生成」が常に同じ本文を使う（drift 防止）。
 * .txt を編集すれば、prebuild(npm run build 前)で本ファイルが再生成され両方に反映される。
 *
 * 以前はオリジナルカード（先頭コメントに「AWS認定ではない」を含む .txt）だけを対象にしていたため、
 * AWS 資格の管理画面プロンプトには試験ガイド概要・難易度・避けることが入らず、夜間生成と基準がずれていた。
 *
 * INSTR_DIR 環境変数で読み込み元を差し替えられる（コミット済みの .txt から生成したいとき用）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INSTR_DIR = process.env.INSTR_DIR || join(ROOT, 'prompts/night-prompts/scripts/instructions');
const OUT = join(ROOT, 'src/data/originalInstructions.ts');

const files = readdirSync(INSTR_DIR).filter(f => f.endsWith('.txt') && !f.startsWith('_'));
const map = {};
for (const f of files) {
  const raw = readFileSync(join(INSTR_DIR, f), 'utf8');
  const lines = raw.split('\n');
  // # コメント行と、自動更新が紛れ込ませたコードフェンス（```だけの行）を除いた本文
  const body = lines.filter(l => !l.startsWith('#') && l.trim() !== '```').join('\n').trim();
  const exam = f.replace(/\.txt$/, '');
  map[exam] = body;
}

// 夜間生成(01)が全問へ付与する共通品質基準。管理画面の生成プロンプトにも同じものを付与して要件を揃える。
let commonRules = '';
try {
  commonRules = readFileSync(join(INSTR_DIR, '_common-rules.txt'), 'utf8').trim();
} catch { /* 無ければ空 */ }

const keys = Object.keys(map).sort();
const header = `// AUTO-GENERATED — 編集しないこと。\n`
  + `// ソース: prompts/night-prompts/scripts/instructions/<EXAM>.txt および _common-rules.txt\n`
  + `// 再生成: npm run gen:instructions（npm run build 前に prebuild で自動実行）\n`
  + `// 目的: 夜間生成スクリプトと管理画面のAIプロンプト生成で同一の本文・品質基準を使う。\n\n`;
const body = `export const EXAM_INSTRUCTIONS: Record<string, string> = {\n`
  + keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`).join('\n')
  + `\n};\n\n`
  + `// 夜間生成(01)の【品質基準】= instructions/_common-rules.txt と同一。\n`
  + `export const COMMON_RULES = ${JSON.stringify(commonRules)};\n`;

writeFileSync(OUT, header + body, 'utf8');
console.log(`generated ${OUT} (${keys.length} exams: ${keys.join(', ')}; COMMON_RULES ${commonRules.length}字)`);
