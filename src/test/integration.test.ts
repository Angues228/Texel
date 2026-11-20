// Integration tests: need latexmk, synctex, and latexdiff. Work in a temp copy of examples/.
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { applyEdits, buildTypesetDiff, compileLatex } from '../compiler';
import { getEnvWithTexPath, resolveBoxToSource } from '../synctex';

const ROOT = path.resolve(__dirname, '../..');
// Same default the extension uses, read from package.json so it is defined only there.
const TEX_BIN: string = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes
  .configuration.properties['texel.texBinPath'].default;
const env = getEnvWithTexPath(TEX_BIN);

const has = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { env, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const skip = has('latexmk', ['-v']) && has('synctex', ['version']) ? false : 'latexmk/synctex not installed';
const hasLatexdiff = has('latexdiff', ['--version']);

describe('TeX pipeline', { skip }, () => {
  let dir = '';
  let tex = '';

  before(() => {
    // realpath: SyncTeX reports resolved paths (macOS /var -> /private/var).
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texel-it-')));
    tex = path.join(dir, 'sample.tex');
    fs.copyFileSync(path.join(ROOT, 'examples', 'sample.tex'), tex);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('compiles with SyncTeX, maps a box to the equation, and builds a typeset diff', async () => {
    const { pdfPath } = await compileLatex(tex, TEX_BIN);
    assert.ok(fs.statSync(pdfPath).size > 1000);
    assert.ok(fs.existsSync(path.join(dir, 'sample.synctex.gz')));

    // Ask SyncTeX where the equation was typeset (first line with a non-empty box), then box that spot.
    const lines = fs.readFileSync(tex, 'utf8').split('\n');
    const eqStart = lines.findIndex((l) => l.includes('\\begin{equation}')) + 1;
    const eqEnd = lines.findIndex((l) => l.includes('\\end{equation}')) + 1;
    let record: string | undefined;
    for (let line = eqStart; !record && line <= eqEnd; line++) {
      const view = execFileSync('synctex', ['view', '-i', `${line}:1:${tex}`, '-o', pdfPath], {
        cwd: dir,
        env,
        encoding: 'utf8'
      });
      record = view.split('Output:').slice(1).find((r) => /H:[1-9]/.test(r));
    }
    assert.ok(record, 'SyncTeX found no typeset box for the equation');
    const num = (key: string) => Number(record.match(new RegExp(`^${key}:([0-9.]+)`, 'm'))?.[1]);

    const loc = await resolveBoxToSource(
      pdfPath,
      { page: num('Page'), x: num('x'), y: Math.max(0, num('y') - 8), width: 120, height: 18 },
      TEX_BIN
    );
    assert.equal(path.resolve(loc.file), path.resolve(tex));
    assert.ok(loc.snippet.startsWith('\\begin{equation}'), loc.snippet);
    assert.ok(loc.snippet.endsWith('\\end{equation}'), loc.snippet);

    const proposed = applyEdits(fs.readFileSync(tex, 'utf8'), [
      { startLine: loc.startLine, originalSnippet: loc.snippet, proposedSnippet: '\\begin{equation}\nE^2 = (p c)^2 + (m c^2)^2\n\\end{equation}' }
    ]);
    const diff = await buildTypesetDiff({
      rootTexPath: tex,
      targetTexPath: tex,
      proposedTargetContent: proposed,
      texBinPath: TEX_BIN
    });
    try {
      assert.ok(fs.statSync(diff.afterPdfPath).size > 1000);
      assert.ok(fs.statSync(diff.diffPdfPath).size > 1000);
      assert.equal(diff.usedDiffFallback, !hasLatexdiff);
      assert.equal(fs.readFileSync(tex, 'utf8').includes('(p c)^2'), false, 'original .tex was modified');
    } finally {
      fs.rmSync(diff.workDir, { recursive: true, force: true });
    }
  });
});
