// Pure-function tests: no TeX installation needed.
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import {
  BUILTIN_SKILLS,
  buildFeedbackPrompt,
  buildRevisionPrompt,
  loadSkills,
  parseAiResponse
} from '../ai';
import { applyEdits, applySnippetReplacement, relocateSnippet } from '../compiler';
import {
  BUILTIN_SKILL_LABELS_ZH,
  HOST_STRINGS,
  WEBVIEW_STRINGS,
  formatMessage,
  resolveLocale
} from '../i18n';
import {
  expandToLogicalBlock,
  getEnvWithTexPath,
  isEnvBalanced,
  parseSynctexOutput,
  settleByText,
  type SourceLocation
} from '../synctex';

const SAMPLE = fs.readFileSync(path.resolve(__dirname, '../../examples/sample.tex'), 'utf8');
const sampleLines = SAMPLE.split(/\r?\n/);
const lineOf = (needle: string) => sampleLines.findIndex((l) => l.includes(needle)) + 1;

const EQ_START = lineOf('\\begin{equation}');
const EQ_END = lineOf('\\end{equation}');
const equation: SourceLocation = {
  file: '/tmp/sample.tex',
  startLine: EQ_START,
  endLine: EQ_END,
  snippet: sampleLines.slice(EQ_START - 1, EQ_END).join('\n')
};

describe('parseSynctexOutput', () => {
  it('reads Input/Line pairs and resolves relative paths', () => {
    const out = 'SyncTeX result begin\nOutput:a.pdf\nInput:./ch/intro.tex\nLine:12\nColumn:-1\nInput:/abs/main.tex\nLine:0\nLine:3\n';
    assert.deepEqual(parseSynctexOutput(out, '/proj'), [
      { file: path.resolve('/proj', 'ch/intro.tex'), line: 12 },
      { file: path.normalize('/abs/main.tex'), line: 3 }
    ]);
  });
});

describe('expandToLogicalBlock / isEnvBalanced', () => {
  it('grows a hit inside an equation to the whole environment', () => {
    assert.deepEqual(expandToLogicalBlock(sampleLines, EQ_START + 1, EQ_START + 1), {
      startLine: EQ_START,
      endLine: EQ_END
    });
  });

  it('stops a prose hit at the paragraph', () => {
    const intro = lineOf('We propose');
    assert.deepEqual(expandToLogicalBlock(sampleLines, intro, intro), { startLine: intro, endLine: intro });
  });

  it('detects unbalanced ranges', () => {
    assert.equal(isEnvBalanced(sampleLines, EQ_START, EQ_END), true);
    assert.equal(isEnvBalanced(sampleLines, EQ_START, EQ_END - 1), false);
    assert.equal(isEnvBalanced(sampleLines, EQ_START + 1, EQ_END), false);
  });
});

describe('settleByText', () => {
  const intro = lineOf('maps visual PDF annotations');

  it('moves ends that SyncTeX credited to a neighbouring line', () => {
    const settled = settleByText(
      sampleLines,
      intro - 2,
      intro - 1,
      'maps visual PDF annotations directly to source lines using SyncTeX'
    );
    assert.deepEqual(settled, { startLine: intro, endLine: intro });
  });

  it('follows a selection across source lines and ignores markup and comments', () => {
    const lines = ['Some \\emph{carefully} chosen', 'words % not printed', 'end here.', ''];
    assert.deepEqual(settleByText(lines, 1, 1, 'carefully chosen words end here'), { startLine: 1, endLine: 3 });
  });

  it('keeps SyncTeX lines when the text is not in the source', () => {
    assert.deepEqual(settleByText(sampleLines, intro, intro, 'zzz qqq'), { startLine: intro, endLine: intro });
    assert.deepEqual(settleByText(sampleLines, intro, intro, ''), { startLine: intro, endLine: intro });
  });

  it('keeps SyncTeX lines past the end of the file', () => {
    assert.deepEqual(settleByText(['a b c'], 4, 5, 'a b c'), { startLine: 4, endLine: 5 });
  });
});

describe('relocateSnippet / applyEdits / applySnippetReplacement', () => {
  const edit = { startLine: EQ_START, originalSnippet: equation.snippet, proposedSnippet: 'E^2 = (pc)^2' };
  const shifted = '% 1\n% 2\n% 3\n% 4\n' + SAMPLE;

  it('finds a snippet where it was, or nearest after the file shifted', () => {
    assert.deepEqual(relocateSnippet(SAMPLE, EQ_START, equation.snippet), { startLine: EQ_START, endLine: EQ_END });
    assert.deepEqual(relocateSnippet(shifted, EQ_START, equation.snippet), {
      startLine: EQ_START + 4,
      endLine: EQ_END + 4
    });
    assert.equal(relocateSnippet(SAMPLE, EQ_START, 'not in the file'), null);
  });

  it('applies edits after line drift without touching other text', () => {
    const out = applyEdits(shifted, [edit]);
    assert.ok(out.includes('E^2 = (pc)^2'));
    assert.ok(!out.includes('\\begin{equation}'));
    assert.ok(out.includes('We propose a lightweight workflow'));
    assert.ok(out.includes('Typeset before-and-after diffs'));
  });

  it('throws instead of guessing', () => {
    assert.throws(() => applyEdits(SAMPLE, [{ ...edit, originalSnippet: 'gone' }]), /changed after it was selected/);
    assert.throws(() => applyEdits(SAMPLE, [edit, { ...edit, proposedSnippet: 'x' }]), /overlap/);
  });

  it('keeps CRLF line endings', () => {
    assert.equal(applySnippetReplacement('a\r\nb\r\nc', 2, 2, 'B1\nB2'), 'a\r\nB1\r\nB2\r\nc');
  });
});

describe('loadSkills', () => {
  it('returns the built-in skills with unique ids', () => {
    const skills = loadSkills();
    assert.deepEqual(skills, BUILTIN_SKILLS);
    assert.equal(new Set(skills.map((s) => s.id)).size, skills.length);
    assert.ok(skills.every((s) => s.label && s.prompt));
  });

  it('adds workspace skills and lets them replace a built-in id', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'texel-skills-'));
    try {
      const dir = path.join(ws, '.texel', 'skills');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'abstract.md'), '# Abstract Check\nKeep the abstract under 200 words.');
      fs.writeFileSync(path.join(dir, `${BUILTIN_SKILLS[0].id}.md`), 'My own prompt.');
      fs.writeFileSync(path.join(dir, 'empty.md'), '# Only a title');

      const skills = loadSkills(ws);
      assert.equal(skills.length, BUILTIN_SKILLS.length + 1);
      assert.deepEqual(skills.find((s) => s.id === 'abstract'), {
        id: 'abstract',
        label: 'Abstract Check',
        prompt: 'Keep the abstract under 200 words.'
      });
      assert.equal(skills.find((s) => s.id === BUILTIN_SKILLS[0].id)?.prompt, 'My own prompt.');
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});

describe('prompts and parseAiResponse', () => {
  const box = { page: 1, x: 0, y: 0, width: 10, height: 10, note: 'tighten this' };

  it('builds a revision prompt with the snippet, skill, and note', () => {
    const prompt = buildRevisionPrompt([{ box, source: equation }], 'Use the full relation', BUILTIN_SKILLS[0]);
    assert.ok(prompt.includes('E = m c^2'));
    assert.ok(prompt.includes(BUILTIN_SKILLS[0].prompt));
    assert.ok(prompt.includes('Annotation note: tighten this'));
    assert.ok(prompt.includes('Author instruction: Use the full relation'));
  });

  it('builds a feedback prompt with the comment and original text', () => {
    const [edit] = parseAiResponse('[{"regionIndex":1,"proposedSnippet":"x","explanation":"e"}]', [equation]);
    const prompt = buildFeedbackPrompt([{ edit, comment: 'Keep c^2 factored' }], 'Preserve label');
    assert.ok(prompt.includes('Keep c^2 factored'));
    assert.ok(prompt.includes('E = m c^2'));
  });

  it('parses fenced JSON and maps regions', () => {
    const raw = '```json\n[{"regionIndex": 1, "proposedSnippet": "E^2 = (pc)^2", "explanation": "Relativistic form."}]\n```';
    const [edit] = parseAiResponse(raw, [equation]);
    assert.equal(edit.proposedSnippet, 'E^2 = (pc)^2');
    assert.equal(edit.explanation, 'Relativistic form.');
    assert.equal(edit.startLine, EQ_START);
  });

  it('accepts raw LaTeX for a single region and rejects junk for several', () => {
    assert.equal(parseAiResponse('```latex\nE = mc^2\n```', [equation])[0].proposedSnippet, 'E = mc^2');
    assert.throws(() => parseAiResponse('no json here', [equation, equation]), /Could not parse/);
  });
});

describe('getEnvWithTexPath', () => {
  it('puts an existing directory first and ignores a missing one', () => {
    const dir = os.tmpdir();
    assert.equal(getEnvWithTexPath(dir).PATH?.split(path.delimiter)[0], dir);
    assert.ok(!getEnvWithTexPath('/no/such/dir').PATH?.includes('/no/such/dir'));
  });
});

describe('i18n', () => {
  it('resolves locale from setting or VS Code language', () => {
    assert.equal(resolveLocale('auto', 'zh-cn'), 'zh-CN');
    assert.equal(resolveLocale('auto', 'zh-TW'), 'zh-CN');
    assert.equal(resolveLocale('auto', 'en'), 'en');
    assert.equal(resolveLocale('en', 'zh-cn'), 'en');
    assert.equal(resolveLocale('zh-CN', 'en'), 'zh-CN');
  });

  it('formats placeholders', () => {
    assert.equal(formatMessage('Loaded {file} ({count})', { file: 'a.pdf', count: 2 }), 'Loaded a.pdf (2)');
  });

  it('covers all built-in skills, runtime strings, and package.nls keys in EN and zh-CN', () => {
    for (const skill of BUILTIN_SKILLS) {
      assert.ok(BUILTIN_SKILL_LABELS_ZH[skill.id], `missing zh-CN label for skill ${skill.id}`);
    }
    for (const table of [WEBVIEW_STRINGS, HOST_STRINGS]) {
      const enKeys = Object.keys(table.en).sort();
      const zhKeys = Object.keys(table['zh-CN']).sort();
      assert.deepEqual(zhKeys, enKeys);
      for (const k of enKeys) {
        assert.ok((table.en as Record<string, string>)[k], `empty en.${k}`);
        assert.ok((table['zh-CN'] as Record<string, string>)[k], `empty zh-CN.${k}`);
      }
    }

    const root = path.resolve(__dirname, '../..');
    const pkgText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const nlsEn = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8')) as Record<string, string>;
    const nlsZh = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.zh-cn.json'), 'utf8')) as Record<string, string>;
    const placeholders = [...pkgText.matchAll(/%([a-zA-Z0-9_.-]+)%/g)].map((m) => m[1]);
    assert.ok(placeholders.length > 0);
    for (const key of placeholders) {
      assert.ok(nlsEn[key], `missing package.nls.json key: ${key}`);
      assert.ok(nlsZh[key], `missing package.nls.zh-cn.json key: ${key}`);
    }
  });
});
