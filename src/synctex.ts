import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfBox extends PdfRect {
  id?: string;
  page: number;
  color?: string;
  note?: string;
  /** Printed text the author selected (text-selection mode). */
  text?: string;
  /** One rect per selected printed line, in PDF points (text-selection mode). */
  rects?: PdfRect[];
}

export interface SourceLocation {
  file: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

export interface SynctexHit {
  file: string;
  line: number;
}

export function getEnvWithTexPath(texBinPath?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const parts = (env.PATH || '').split(path.delimiter).filter(Boolean);
  const dir = texBinPath?.trim();
  if (dir && !parts.includes(dir) && fs.existsSync(dir)) {
    parts.unshift(dir);
  }
  env.PATH = parts.join(path.delimiter);
  return env;
}

export function parseSynctexOutput(stdout: string, baseDir: string): SynctexHit[] {
  const hits: SynctexHit[] = [];
  let currentFile: string | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('Input:')) {
      const rawPath = line.slice('Input:'.length).trim();
      currentFile = path.isAbsolute(rawPath)
        ? path.normalize(rawPath)
        : path.resolve(baseDir, rawPath);
    } else if (line.startsWith('Line:') && currentFile) {
      const lineNum = parseInt(line.slice('Line:'.length).trim(), 10);
      if (!Number.isNaN(lineNum) && lineNum > 0) {
        hits.push({ file: currentFile, line: lineNum });
      }
    }
  }

  return hits;
}

async function querySynctexPoint(
  pdfPath: string,
  page: number,
  x: number,
  y: number,
  texBinPath?: string
): Promise<SynctexHit[]> {
  const coord = `${Math.max(1, Math.round(page))}:${Math.max(0, x).toFixed(2)}:${Math.max(0, y).toFixed(2)}:${pdfPath}`;
  const { stdout } = await execFileAsync('synctex', ['edit', '-o', coord], {
    cwd: path.dirname(pdfPath),
    env: getEnvWithTexPath(texBinPath),
    maxBuffer: 1024 * 1024
  });
  return parseSynctexOutput(stdout, path.dirname(pdfPath));
}

const SKIP_ENVS = new Set(['document']);
const BEGIN_RE = /\\begin\{([^}]+)\}/;
const END_RE = /\\end\{([^}]+)\}/;
const SECTION_RE = /\\(?:part|chapter|section|subsection|subsubsection|paragraph)\*?\{/;

export function expandToLogicalBlock(
  lines: string[],
  minLine: number,
  maxLine: number
): { startLine: number; endLine: number } {
  const total = lines.length;
  if (total === 0) {
    return { startLine: 1, endLine: 1 };
  }

  let start = Math.max(1, Math.min(minLine, total));
  let end = Math.max(start, Math.min(maxLine, total));

  const scanLimit = 20;
  let needBegin = 0;
  let needEnd = 0;

  for (let i = start; i <= end; i++) {
    const text = lines[i - 1];
    const b = text.match(BEGIN_RE);
    if (b && !SKIP_ENVS.has(b[1])) {
      needEnd++;
    }
    const e = text.match(END_RE);
    if (e && !SKIP_ENVS.has(e[1])) {
      if (needEnd > 0) {
        needEnd--;
      } else {
        needBegin++;
      }
    }
  }

  // Scan upward: capture enclosing \begin{...} or paragraph start
  let upNestedEnds = 0;
  for (let i = start - 1; i >= Math.max(1, start - scanLimit); i--) {
    const text = lines[i - 1];
    const trimmed = text.trim();
    const b = text.match(BEGIN_RE);
    const e = text.match(END_RE);

    if (b && SKIP_ENVS.has(b[1])) {
      break;
    }
    if (trimmed === '' && needBegin === 0 && upNestedEnds === 0) {
      break;
    }
    if (SECTION_RE.test(trimmed) && needBegin === 0 && upNestedEnds === 0) {
      break;
    }
    if (e && !SKIP_ENVS.has(e[1])) {
      if (needBegin === 0 && upNestedEnds === 0) {
        // Hit the end of a preceding environment; stop before it
        break;
      }
      upNestedEnds++;
    }

    start = i;

    if (b && !SKIP_ENVS.has(b[1])) {
      if (upNestedEnds > 0) {
        upNestedEnds--;
      } else if (needBegin > 0) {
        needBegin--;
        if (needBegin === 0) {
          break;
        }
      } else {
        // Discovered an enclosing environment whose \end sits below `end`
        needEnd++;
        break;
      }
    }
  }

  // Scan downward: capture matching \end{...} or paragraph end
  for (let i = end + 1; i <= Math.min(total, end + scanLimit); i++) {
    const text = lines[i - 1];
    const trimmed = text.trim();
    const b = text.match(BEGIN_RE);
    const e = text.match(END_RE);

    if (e && SKIP_ENVS.has(e[1])) {
      break;
    }
    if (trimmed === '' && needEnd === 0) {
      break;
    }
    if (SECTION_RE.test(trimmed) && needEnd === 0) {
      break;
    }
    if (e && !SKIP_ENVS.has(e[1]) && needEnd === 0) {
      break;
    }

    end = i;

    if (b && !SKIP_ENVS.has(b[1])) {
      needEnd++;
    }
    if (e && !SKIP_ENVS.has(e[1])) {
      needEnd--;
      if (needEnd === 0) {
        break;
      }
    }
  }

  return { startLine: start, endLine: end };
}

/** Case-folded words; NFKC turns printed ligatures (e.g. "ﬁ") back into letters. */
const words = (text: string): string[] =>
  text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Words a source line prints, roughly: no comment, no command names. */
const sourceWords = (line: string): string[] =>
  words(line.split(/(?<!\\)%/, 1)[0].replace(/\\[A-Za-z]+/g, ' '));

const ANCHOR_WORDS = 3;
const PARAGRAPH_SCAN = 20;

/**
 * Narrows SyncTeX's lines for a text selection. SyncTeX reports the box under a
 * point, and that box can belong to a neighbouring source line, so the first and
 * last few selected words are looked up in the source paragraph(s) around the
 * reported lines. An end whose words are not found (math, macros, hyphenation)
 * keeps SyncTeX's line.
 */
export function settleByText(
  lines: string[],
  start: number,
  end: number,
  selected: string
): { startLine: number; endLine: number } {
  const fallback = { startLine: start, endLine: end };
  const picked = words(selected);
  if (picked.length === 0 || end > lines.length) {
    return fallback;
  }

  let lo = start;
  let hi = end;
  while (lo > 1 && start - lo < PARAGRAPH_SCAN && lines[lo - 2].trim()) lo--;
  while (hi < lines.length && hi - end < PARAGRAPH_SCAN && lines[hi].trim()) hi++;

  const tokens: Array<{ word: string; line: number }> = [];
  for (let n = lo; n <= hi; n++) {
    for (const word of sourceWords(lines[n - 1])) {
      tokens.push({ word, line: n });
    }
  }

  // Line of the anchor's first or last word, for the occurrence nearest `target`.
  const locate = (anchor: string[], edge: 'first' | 'last', target: number): number => {
    let best = target;
    let bestGap = Infinity;
    for (let i = 0; i + anchor.length <= tokens.length; i++) {
      if (anchor.every((w, k) => tokens[i + k].word === w)) {
        const line = tokens[edge === 'first' ? i : i + anchor.length - 1].line;
        if (Math.abs(line - target) < bestGap) {
          best = line;
          bestGap = Math.abs(line - target);
        }
      }
    }
    return best;
  };

  const startLine = locate(picked.slice(0, ANCHOR_WORDS), 'first', start);
  const endLine = locate(picked.slice(-ANCHOR_WORDS), 'last', end);
  return startLine <= endLine ? { startLine, endLine } : fallback;
}

/** True when every non-document \begin in [start, end] is closed inside it, and vice versa. */
export function isEnvBalanced(lines: string[], start: number, end: number): boolean {
  let depth = 0;
  for (let i = start; i <= end; i++) {
    const text = lines[i - 1] ?? '';
    const b = text.match(BEGIN_RE);
    if (b && !SKIP_ENVS.has(b[1])) {
      depth++;
    }
    const e = text.match(END_RE);
    if (e && !SKIP_ENVS.has(e[1]) && --depth < 0) {
      return false;
    }
  }
  return depth === 0;
}

async function resolveTextSelection(
  pdfPath: string,
  box: PdfBox,
  rects: PdfRect[],
  texBinPath?: string
): Promise<SourceLocation> {
  // Start of the first printed line, end of the last, and the middle line.
  const first = rects[0];
  const last = rects[rects.length - 1];
  const mid = rects[Math.floor(rects.length / 2)];
  const points: Array<[number, number]> = [
    [first.x + 1, first.y + first.height / 2],
    [mid.x + mid.width / 2, mid.y + mid.height / 2],
    [last.x + Math.max(1, last.width - 1), last.y + last.height / 2]
  ];
  const { file, minLine, maxLine } = await queryMostLikelyLines(pdfPath, box.page, points, texBinPath);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let { startLine, endLine } = settleByText(lines, minLine, maxLine, box.text || '');
  if (!isEnvBalanced(lines, startLine, endLine)) {
    ({ startLine, endLine } = expandToLogicalBlock(lines, startLine, endLine));
  }
  return { file, startLine, endLine, snippet: lines.slice(startLine - 1, endLine).join('\n') };
}

async function queryMostLikelyLines(
  pdfPath: string,
  page: number,
  points: Array<[number, number]>,
  texBinPath?: string
): Promise<{ file: string; minLine: number; maxLine: number }> {
  const results = await Promise.all(
    points.map(([px, py]) =>
      querySynctexPoint(pdfPath, page, px, py, texBinPath).catch(() => [] as SynctexHit[])
    )
  );
  const hits = results
    .flat()
    .filter((hit) => hit.file.endsWith('.tex') && fs.existsSync(hit.file));
  if (hits.length === 0) {
    throw new Error(
      `SyncTeX could not map page ${page} to a .tex file. Ensure the PDF was compiled with -synctex=1.`
    );
  }
  const counts = new Map<string, number>();
  for (const hit of hits) {
    counts.set(hit.file, (counts.get(hit.file) || 0) + 1);
  }
  const file = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const fileLines = hits.filter((h) => h.file === file).map((h) => h.line);
  return { file, minLine: Math.min(...fileLines), maxLine: Math.max(...fileLines) };
}

export async function resolveBoxToSource(
  pdfPath: string,
  box: PdfBox,
  texBinPath?: string
): Promise<SourceLocation> {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Compiled PDF not found: ${pdfPath}`);
  }
  if (box.text && box.rects && box.rects.length > 0) {
    return resolveTextSelection(pdfPath, box, box.rects, texBinPath);
  }

  const w = Math.max(0, box.width);
  const h = Math.max(0, box.height);
  const points: Array<[number, number]> =
    w <= 4 && h <= 4
      ? [[box.x, box.y]]
      : [
          [box.x + Math.min(4, w * 0.2), box.y + Math.min(4, h * 0.2)],
          [box.x + w * 0.5, box.y + Math.min(4, h * 0.2)],
          [box.x + w * 0.5, box.y + h * 0.5],
          [box.x + w * 0.5, box.y + Math.max(0, h - Math.min(4, h * 0.2))],
          [box.x + Math.max(0, w - Math.min(4, w * 0.2)), box.y + Math.max(0, h - Math.min(4, h * 0.2))]
        ];

  const { file: targetFile, minLine, maxLine } = await queryMostLikelyLines(
    pdfPath,
    box.page,
    points,
    texBinPath
  );

  const content = fs.readFileSync(targetFile, 'utf8');
  const lines = content.split(/\r?\n/);
  const { startLine, endLine } =
    w <= 4 && h <= 4
      ? { startLine: minLine, endLine: minLine }
      : expandToLogicalBlock(lines, minLine, maxLine);

  const snippet = lines.slice(startLine - 1, endLine).join('\n');
  return {
    file: targetFile,
    startLine,
    endLine,
    snippet
  };
}
