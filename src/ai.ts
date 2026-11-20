import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { PdfBox, SourceLocation } from './synctex';

export type AiProvider = 'vscode-lm' | 'openai-compatible' | 'cli';

export interface AiProviderConfig {
  provider: AiProvider;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  cliCommand: string;
}

export interface AnnotatedRegion {
  box: PdfBox;
  source: SourceLocation;
}

export interface ProposedEdit {
  file: string;
  startLine: number;
  endLine: number;
  originalSnippet: string;
  proposedSnippet: string;
  explanation: string;
  /** Review state carried between rounds; set by the webview. */
  decision?: 'accept' | 'reject';
}

export interface Skill {
  id: string;
  label: string;
  prompt: string;
}

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'grammar',
    label: 'Grammar',
    prompt:
      'Correct grammar, spelling, punctuation, and article use. Leave wording that is already correct exactly as it is, and change LaTeX commands only to fix syntax errors.'
  },
  {
    id: 'clarity',
    label: 'Clarity',
    prompt:
      'Rewrite sentences that are hard to follow so that each makes one point in plain academic English. Meaning, technical terms, and all math must stay the same.'
  },
  {
    id: 'tighten',
    label: 'Tighten',
    prompt:
      'Make the passage more concise by removing repetition, filler phrases, and needless hedging. Aim for about a quarter fewer words without dropping any result or reference.'
  },
  {
    id: 'notation',
    label: 'Notation',
    prompt:
      'Check the math for wrong signs, subscripts, and dimensions, and make symbols and terms match how they are used elsewhere in the selection. Say in the explanation what you checked, even if nothing needed changing.'
  },
  {
    id: 'address-comment',
    label: 'Address Comment',
    prompt:
      'The instruction holds a comment from a reviewer or co-author. Change the passage only as far as needed to resolve it, and phrase the explanation as a short reply to that comment.'
  },
  {
    id: 'build-warnings',
    label: 'Build Warnings',
    prompt:
      'Using the compiler warnings appended to the instruction, fix the ones caused by these lines (overfull or underfull boxes, undefined references or citations) with the smallest possible source change.'
  }
];

/**
 * Built-in skills plus `<workspace>/.texel/skills/*.md`. The file name is the id; a
 * leading `# Title` line is the button label; the rest is the prompt. A custom skill
 * with a built-in id replaces it.
 */
export function loadSkills(workspaceDir?: string): Skill[] {
  const skills = new Map(BUILTIN_SKILLS.map((s) => [s.id, s]));
  const dir = workspaceDir ? path.join(workspaceDir, '.texel', 'skills') : '';
  if (dir && fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
      const id = name.slice(0, -3);
      const text = fs.readFileSync(path.join(dir, name), 'utf8').trim();
      const title = text.match(/^#\s+(.+)$/m);
      const prompt = (title && text.startsWith(title[0]) ? text.slice(title[0].length) : text).trim();
      if (prompt) {
        skills.set(id, { id, label: title ? title[1].trim() : id, prompt });
      }
    }
  }
  return [...skills.values()];
}

const RESPONSE_FORMAT = [
  '\nRespond ONLY with a valid JSON array (no extra prose) matching this schema:',
  '[{"regionIndex": 1, "proposedSnippet": "<replacement latex code>", "explanation": "<one concise sentence explaining the edit>"}]'
].join('\n');

function regionBlock(index: number, source: SourceLocation, extra: string[]): string {
  return [
    `[Region ${index}]`,
    `File: ${source.file}`,
    `Lines: ${source.startLine}-${source.endLine}`,
    ...extra.filter(Boolean),
    '```latex',
    source.snippet,
    '```'
  ].join('\n');
}

export function buildRevisionPrompt(
  annotations: AnnotatedRegion[],
  instruction: string,
  skill?: Skill
): string {
  const regionsText = annotations
    .map((ann, idx) =>
      regionBlock(idx + 1, ann.source, [
        ann.box.text ? `Printed text the author selected: "${ann.box.text}"` : '',
        ann.box.note ? `Annotation note: ${ann.box.note}` : ''
      ])
    )
    .join('\n\n');

  return [
    'You are an expert academic LaTeX editor assisting an author reviewing a compiled PDF.',
    'Revise ONLY the LaTeX snippets shown below according to the author instruction.',
    'Return each snippet in full (all of its lines), changed only where needed.',
    'Keep surrounding LaTeX structure intact (preserve \\label, \\cite, and math delimiters unless asked to change them).',
    skill ? `\nSkill directive (${skill.label}): ${skill.prompt}` : '',
    instruction.trim() ? `\nAuthor instruction: ${instruction.trim()}` : '',
    '\nTarget LaTeX regions:',
    regionsText,
    RESPONSE_FORMAT
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildFeedbackPrompt(
  items: Array<{ edit: ProposedEdit; comment: string }>,
  instruction: string
): string {
  const regionsText = items
    .map(({ edit, comment }, idx) =>
      regionBlock(
        idx + 1,
        { file: edit.file, startLine: edit.startLine, endLine: edit.endLine, snippet: edit.originalSnippet },
        [
          'Your previous proposal (rejected or needs changes):',
          '```latex',
          edit.proposedSnippet,
          '```',
          `Author feedback: ${comment}`,
          'Original LaTeX to revise:'
        ]
      )
    )
    .join('\n\n');

  return [
    'You are an expert academic LaTeX editor. The author reviewed your previous revision and left feedback.',
    'Produce a new revision of each ORIGINAL snippet that follows the feedback.',
    'Return each snippet in full (all of its lines).',
    instruction.trim() ? `\nGeneral instruction: ${instruction.trim()}` : '',
    '\nRegions:',
    regionsText,
    RESPONSE_FORMAT
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseAiResponse(raw: string, sources: SourceLocation[]): ProposedEdit[] {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const toEdit = (source: SourceLocation, proposedSnippet: string, explanation: string): ProposedEdit => ({
    file: source.file,
    startLine: source.startLine,
    endLine: source.endLine,
    originalSnippet: source.snippet,
    proposedSnippet,
    explanation
  });

  const firstBracket = candidate.indexOf('[');
  const lastBracket = candidate.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const parsed = JSON.parse(candidate.slice(firstBracket, lastBracket + 1));
      if (Array.isArray(parsed)) {
        const edits: ProposedEdit[] = [];
        for (const item of parsed) {
          const source = sources[Number(item.regionIndex ?? 1) - 1];
          if (!source || typeof item.proposedSnippet !== 'string') {
            continue;
          }
          const explanation =
            typeof item.explanation === 'string' && item.explanation.trim()
              ? item.explanation.trim()
              : 'AI revision applied.';
          edits.push(toEdit(source, item.proposedSnippet, explanation));
        }
        if (edits.length > 0) {
          return edits;
        }
      }
    } catch {
      // Fall through to single-region fallback below
    }
  }

  // Fallback for models/CLI tools returning plain LaTeX for a single selected region
  if (sources.length === 1 && candidate.length > 0) {
    const latexMatch = trimmed.match(/```(?:latex|tex)?\s*([\s\S]*?)\s*```/i);
    return [toEdit(sources[0], latexMatch ? latexMatch[1] : trimmed, 'AI revision returned as raw LaTeX.')];
  }

  throw new Error(`Could not parse AI revision output as JSON:\n${trimmed.slice(0, 400)}`);
}

async function callOpenAiCompatible(prompt: string, config: AiProviderConfig): Promise<string> {
  if (!config.apiKey.trim()) {
    throw new Error(
      'No API key set. Run "Texel: Set API Key" from the Command Palette, or switch texel.aiProvider to "vscode-lm".'
    );
  }
  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a precise academic LaTeX editing assistant.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI API returned HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI API returned an empty response.');
  }
  return content;
}

function callCliAgent(prompt: string, cliCommand: string): Promise<string> {
  const parts = cliCommand.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('texel.cliCommand is empty.');
  }
  const [cmd, ...args] = parts;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(new Error(`Failed to launch CLI "${cmd}": ${err.message}`));
    });
    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`CLI "${cliCommand}" exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export type LmRunner = (prompt: string) => Promise<string>;

function callModel(prompt: string, config: AiProviderConfig, vscodeLmRunner?: LmRunner): Promise<string> {
  switch (config.provider) {
    case 'vscode-lm':
      if (!vscodeLmRunner) {
        throw new Error('VS Code Language Model runner is unavailable in this environment.');
      }
      return vscodeLmRunner(prompt);
    case 'openai-compatible':
      return callOpenAiCompatible(prompt, config);
    case 'cli':
      return callCliAgent(prompt, config.cliCommand);
  }
}

export async function generateRevision(
  request: {
    annotations: AnnotatedRegion[];
    instruction: string;
    skill?: Skill;
    providerConfig: AiProviderConfig;
  },
  vscodeLmRunner?: LmRunner
): Promise<ProposedEdit[]> {
  // Two marks on the same source lines would yield two overlapping edits.
  const seen = new Set<string>();
  const annotations = request.annotations.filter((a) => {
    const key = `${a.source.file}:${a.source.startLine}-${a.source.endLine}`;
    return !seen.has(key) && seen.add(key);
  });
  if (annotations.length === 0) {
    throw new Error('Select at least one region on the PDF before requesting an AI revision.');
  }

  const prompt = buildRevisionPrompt(annotations, request.instruction, request.skill);
  const raw = await callModel(prompt, request.providerConfig, vscodeLmRunner);
  return parseAiResponse(raw, annotations.map((a) => a.source));
}

export async function reviseWithFeedback(
  request: {
    items: Array<{ edit: ProposedEdit; comment: string }>;
    instruction: string;
    providerConfig: AiProviderConfig;
  },
  vscodeLmRunner?: LmRunner
): Promise<ProposedEdit[]> {
  if (request.items.length === 0) {
    throw new Error('Add a comment to at least one proposed edit before requesting another round.');
  }
  const prompt = buildFeedbackPrompt(request.items, request.instruction);
  const raw = await callModel(prompt, request.providerConfig, vscodeLmRunner);
  return parseAiResponse(
    raw,
    request.items.map(({ edit }) => ({
      file: edit.file,
      startLine: edit.startLine,
      endLine: edit.endLine,
      snippet: edit.originalSnippet
    }))
  );
}
