// 给 words.js 的每个词加 pos 字段（词性：V/N/A/ADV），离线标注，不改其他字段
const fs = require('fs');
const tagger = require('wink-pos-tagger')();

const file = 'E:/work Buddy运行/微信/vibe-coding/words.js';
let content = fs.readFileSync(file, 'utf8');

// 提取 WORDS 数组
const m = content.match(/const WORDS = (\[[\s\S]*?\];)/);
if (!m) { console.error('无法解析 WORDS'); process.exit(1); }
const WORDS = eval(m[1].replace(/;\s*$/, ''));

const VB = s => s && s.startsWith('VB');
const NN = s => s && s.startsWith('NN');
const JJ = s => s && s.startsWith('JJ');
const RB = s => s && s.startsWith('RB');
let miss = 0;
WORDS.forEach(w => {
  const tok = tagger.tagSentence(w.word)[0];
  const p = tok && tok.pos ? tok.pos : '';
  let pos = '';
  if (VB(p)) pos = 'V';
  else if (NN(p)) pos = 'N';
  else if (JJ(p)) pos = 'A';
  else if (RB(p)) pos = 'ADV';
  w.pos = pos;
  if (!pos) miss++;
});

function q(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

let out = '// words.js —— 四级核心词库（按考试核心频率大致降序，共 ' + WORDS.length + ' 词）\n' +
  '// 说明：word 英文 / phonetic 音标 / meaning 中文释义 / pos 词性(V名词? 见下) / neighbors 干扰词\n' +
  '// pos: V=动词 N=名词 A=形容词 ADV=副词（空串=未识别，多为生僻/专有名词）\n' +
  'const WORDS = [\n';
WORDS.forEach(w => {
  out += '  { word: ' + q(w.word) + ', phonetic: ' + q(w.phonetic) + ', meaning: ' + q(w.meaning) +
    ', pos: ' + q(w.pos) + ', neighbors: [' + w.neighbors.map(q).join(', ') + '] },\n';
});
out += '];\n';

fs.writeFileSync(file, out, 'utf8');
console.log('完成：共 ' + WORDS.length + ' 词，未识别词性 ' + miss + ' 个（已置空）');
