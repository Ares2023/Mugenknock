#!/usr/bin/env node
/**
 * オリジナル資格(ML/DB/NW/SEC 等)の生成プロンプト本文を、夜間生成の唯一ソースである
 * prompts/night-prompts/scripts/instructions/<EXAM>.txt から src/data/originalInstructions.ts へ生成する。
 *
 * これにより「夜間スクリプト」と「管理画面のAIプロンプト生成」が常に同じ本文を使う（drift 防止）。
 * .txt を編集すれば、prebuild(npm run build 前)で本ファイルが再生成され両方に反映される。
 *
 * 対象判定: 先頭コメント(#行)に「AWS認定ではない」を含む .txt を「オリジナルカード」とみなす。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INSTR_DIR = join(ROOT, 'prompts/night-prompts/scripts/instructions');
const OUT = join(ROOT, 'src/data/originalInstructions.ts');

const files = readdirSync(INSTR_DIR).filter(f => f.endsWith('.txt') && !f.startsWith('_'));
const map = {};
for (const f of files) {
  const raw = readFileSync(join(INSTR_DIR, f), 'utf8');
  const lines = raw.split('\n');
  // 先頭コメント(#行)に Original マーカーがあるファイルのみ対象
  const isOriginal = lines.some(l => l.startsWith('#') && l.includes('AWS認定ではない'));
  if (!isOriginal) continue;
  // # コメント行を除いた本文
  const body = lines.filter(l => !l.startsWith('#')).join('\n').trim();
  const exam = f.replace(/\.txt$/, '');
  map[exam] = body;
}

const keys = Object.keys(map).sort();
const header = `// AUTO-GENERATED — 編集しないこと。\n`
  + `// ソース: prompts/night-prompts/scripts/instructions/<EXAM>.txt\n`
  + `// 再生成: npm run gen:instructions（npm run build 前に prebuild で自動実行）\n`
  + `// 目的: 夜間生成スクリプトと管理画面のAIプロンプト生成で同一本文を使う。\n\n`;
const body = `export const ORIGINAL_INSTRUCTIONS: Record<string, string> = {\n`
  + keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`).join('\n')
  + `\n};\n`;

writeFileSync(OUT, header + body, 'utf8');
console.log(`generated ${OUT} (${keys.length} original cards: ${keys.join(', ')})`);
