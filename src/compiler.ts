import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { getEnvWithTexPath } from './synctex';

const execFileAsync = promisify(execFile);

export async function compileLatex(
  texPath: string,
  texBinPath?: string
): Promise<{ pdfPath: string; log: string }> {
  const absTex = path.resolve(texPath);
  const dir = path.dirname(absTex);
  const baseName = path.basename(absTex);
  const pdfPath = absTex.replace(/\.tex$/i, '.pdf');

  let stdout = '';
  let stderr = '';
  try {
    const res = await execFileAsync(
      'latexmk',
      ['-pdf', '-synctex=1', '-interaction=nonstopmode', '-file-line-error', baseName],
      {
        cwd: dir,
        env: getEnvWithTexPath(texBinPath),
        maxBuffer: 10 * 1024 * 1024
      }
    );
    stdout = res.stdout;
    stderr = res.stderr;
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    stdout = execErr.stdout || '';
    stderr = execErr.stderr || '';
    if (!fs.existsSync(pdfPath)) {
      const tail = (stdout + '\n' + stderr).trim().split('\n').slice(-25).join('\n');
      throw new Error(`LaTeX compilation failed for ${baseName}:\n${tail || execErr.message}`);
    }
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`latexmk completed but PDF was not created at ${pdfPath}`);
  }

  return { pdfPath, log: stdout + (stderr ? '\n' + stderr : '') };
}

export function applySnippetReplacement(
  originalContent: string,
  startLine: number,
  endLine: number,
  newSnippet: string
): string {
  const eol = originalContent.includes('\r\n') ? '\r\n' : '\n';
  const lines = originalContent.split(/\r?\n/);
  const before = lines.slice(0, Math.max(0, startLine - 1));
  const after = lines.slice(Math.min(lines.length, endLine));
  const replacementLines = newSnippet.replace(/\r\n/g, '\n').split('\n');
  return [...before, ...replacementLines, ...after].join(eol);
}

/**
 * Where `snippet` sits in `content` now. The lines it was read from win if they still
 * match; otherwise the exact match closest to them (the file was edited since the
 * selection). Null when the snippet text no longer exists.
 */
export function relocateSnippet(
  content: string,
  startLine: number,
  snippet: string
): { startLine: number; endLine: number } | null {
  const lines = content.split(/\r?\n/);
  const want = snippet.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd());
  const matchesAt = (i: number) =>
    i >= 0 && i + want.length <= lines.length && want.every((w, k) => lines[i + k].trimEnd() === w);

  let best = matchesAt(startLine - 1) ? startLine - 1 : -1;
  for (let i = 0; best !== startLine - 1 && i + want.length <= lines.length; i++) {
    if (matchesAt(i) && (best < 0 || Math.abs(i - startLine + 1) < Math.abs(best - startLine + 1))) {
      best = i;
    }
  }
  return best < 0 ? null : { startLine: best + 1, endLine: best + want.length };
}

/**
 * Applies edits to `content` after relocating each one, so line drift since the PDF
 * selection never overwrites the wrong text. Throws instead of guessing.
 */
export function applyEdits(
  content: string,
  edits: Array<{ startLine: number; originalSnippet: string; proposedSnippet: string }>
): string {
  const located = edits
    .map((edit) => {
      const loc = relocateSnippet(content, edit.startLine, edit.originalSnippet);
      if (!loc) {
        throw new Error(
          `The source near line ${edit.startLine} changed after it was selected. Re-select that region on the PDF.`
        );
      }
      return { ...loc, text: edit.proposedSnippet };
    })
    .sort((a, b) => b.startLine - a.startLine);

  for (let i = 1; i < located.length; i++) {
    if (located[i].endLine >= located[i - 1].startLine) {
      throw new Error(
        `Two edits overlap (lines ${located[i].startLine}-${located[i].endLine} and ${located[i - 1].startLine}-${located[i - 1].endLine}). Remove one of the overlapping selections.`
      );
    }
  }
  return located.reduce(
    (text, loc) => applySnippetReplacement(text, loc.startLine, loc.endLine, loc.text),
    content
  );
}

const BUILD_ARTIFACT_RE = /\.(aux|log|fls|fdb_latexmk|out|toc|synctex\.gz)$/i;

/**
 * Mirrors rootDir into destDir using symlinks, except along the relative path to targetTexPath
 * where real directories are created so targetTexPath can be written independently.
 */
function mirrorWorkspaceForTarget(
  srcDir: string,
  destDir: string,
  relTargetSegments: string[],
  rootPdfName: string
): void {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  const [head, ...rest] = relTargetSegments;

  for (const entry of entries) {
    const srcEntry = path.join(srcDir, entry.name);
    const destEntry = path.join(destDir, entry.name);
    // Symlinked build artifacts would let latexmk in the temp dir overwrite the user's originals.
    if (BUILD_ARTIFACT_RE.test(entry.name) || entry.name === rootPdfName) {
      continue;
    }
    if (entry.name === head) {
      if (rest.length > 0 && entry.isDirectory()) {
        mirrorWorkspaceForTarget(srcEntry, destEntry, rest, rootPdfName);
      }
      // If rest.length === 0, this is the target .tex file itself; caller writes it directly.
      continue;
    }
    if (!fs.existsSync(destEntry)) {
      fs.symlinkSync(srcEntry, destEntry);
    }
  }
}

export async function buildTypesetDiff(params: {
  rootTexPath: string;
  targetTexPath: string;
  proposedTargetContent: string;
  texBinPath?: string;
}): Promise<{
  diffPdfPath: string;
  afterPdfPath: string;
  workDir: string;
  usedDiffFallback: boolean;
}> {
  const rootAbs = path.resolve(params.rootTexPath);
  const targetAbs = path.resolve(params.targetTexPath);
  const rootDir = path.dirname(rootAbs);
  const relTarget = path.relative(rootDir, targetAbs);

  if (relTarget.startsWith('..') || path.isAbsolute(relTarget)) {
    throw new Error(`Target file ${targetAbs} must reside under root directory ${rootDir}`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'texel-diff-'));
  const relSegments = relTarget.split(path.sep).filter(Boolean);
  mirrorWorkspaceForTarget(
    rootDir,
    workDir,
    relSegments,
    path.basename(rootAbs).replace(/\.tex$/i, '.pdf')
  );

  const workRootTex = path.join(workDir, path.basename(rootAbs));
  const workTargetTex = path.join(workDir, relTarget);
  const afterTargetSnapshot = path.join(workDir, '__after_target.tex');
  const afterPdfSnapshot = path.join(workDir, '__after.pdf');

  fs.writeFileSync(afterTargetSnapshot, params.proposedTargetContent, 'utf8');
  fs.writeFileSync(workTargetTex, params.proposedTargetContent, 'utf8');
  const afterResult = await compileLatex(workRootTex, params.texBinPath);
  fs.copyFileSync(afterResult.pdfPath, afterPdfSnapshot);

  let diffPdfPath = afterPdfSnapshot;
  let usedDiffFallback = false;

  try {
    const { stdout: diffTex } = await execFileAsync(
      'latexdiff',
      ['--math-markup=whole', targetAbs, afterTargetSnapshot],
      {
        cwd: workDir,
        env: getEnvWithTexPath(params.texBinPath),
        maxBuffer: 10 * 1024 * 1024
      }
    );

    // Clean build artifacts before compiling diff so latexmk sees fresh source
    for (const ext of ['.aux', '.fls', '.fdb_latexmk', '.pdf', '.log']) {
      const candidate = workRootTex.replace(/\.tex$/i, ext);
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
      }
    }

    fs.writeFileSync(workTargetTex, diffTex, 'utf8');
    const diffResult = await compileLatex(workRootTex, params.texBinPath);
    diffPdfPath = path.join(workDir, '__diff.pdf');
    fs.copyFileSync(diffResult.pdfPath, diffPdfPath);
  } catch {
    // latexdiff output can fail to compile on unusual macros; show the plain after.pdf instead.
    usedDiffFallback = true;
    diffPdfPath = afterPdfSnapshot;
  }

  return {
    diffPdfPath,
    afterPdfPath: afterPdfSnapshot,
    workDir,
    usedDiffFallback
  };
}
