import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  type AiProvider,
  type AiProviderConfig,
  BUILTIN_SKILLS,
  type ProposedEdit,
  generateRevision,
  loadSkills,
  reviseWithFeedback
} from './ai';
import { applyEdits, buildTypesetDiff, compileLatex } from './compiler';
import {
  BUILTIN_SKILL_LABELS_ZH,
  HOST_STRINGS,
  type LanguageSetting,
  type Locale,
  WEBVIEW_STRINGS,
  formatMessage,
  resolveLocale
} from './i18n';
import type { ExtensionMessage, WebviewMessage } from './protocol';
import { type PdfBox, resolveBoxToSource } from './synctex';

const SECRET_KEY = 'texel.apiKey';
const PDFJS_DIR = ['node_modules', 'pdfjs-dist', 'legacy', 'build'];
const BUILTIN_SKILL_SET = new Set(BUILTIN_SKILLS);

function currentLocale(): Locale {
  const setting = vscode.workspace.getConfiguration('texel').get<LanguageSetting>('language');
  return resolveLocale(setting, vscode.env.language);
}

class TexelDiffContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  setContent(uri: vscode.Uri, text: string): void {
    this.contents.set(uri.toString(), text);
    this.onDidChangeEmitter.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }
}

/** Text of `file` as the user sees it: the open (possibly unsaved) buffer, else disk. */
function currentText(file: string): string {
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
  return doc ? doc.getText() : fs.readFileSync(file, 'utf8');
}

function groupByFile(edits: ProposedEdit[]): Map<string, ProposedEdit[]> {
  const byFile = new Map<string, ProposedEdit[]>();
  for (const edit of edits) {
    byFile.set(edit.file, [...(byFile.get(edit.file) || []), edit]);
  }
  return byFile;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

class TexelWorkspacePanel {
  static currentPanel: TexelWorkspacePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private pdfPath: string;
  private tempWorkDir: string | null = null;
  private diffSeq = 0;
  private lastCompileLog = '';
  private locale: Locale = currentLocale();

  static createOrShow(
    context: vscode.ExtensionContext,
    diffProvider: TexelDiffContentProvider,
    texPath: string,
    compileFirst: boolean
  ): void {
    const column = vscode.ViewColumn.Beside;
    const existing = TexelWorkspacePanel.currentPanel;
    if (existing) {
      existing.rootTexPath = texPath;
      existing.pdfPath = texPath.replace(/\.tex$/i, '.pdf');
      existing.panel.reveal(column);
      existing.sendLocale();
      existing.sendSkills();
      void (compileFirst ? existing.compileAndSend() : existing.loadExistingOrCompile());
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'texelWorkspace',
      `Texel: ${path.basename(texPath)}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
          vscode.Uri.joinPath(context.extensionUri, ...PDFJS_DIR)
        ]
      }
    );

    TexelWorkspacePanel.currentPanel = new TexelWorkspacePanel(
      panel,
      context,
      diffProvider,
      texPath,
      compileFirst
    );
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly diffProvider: TexelDiffContentProvider,
    private rootTexPath: string,
    private readonly compileOnStart: boolean
  ) {
    this.pdfPath = rootTexPath.replace(/\.tex$/i, '.pdf');
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => void this.handleMessage(msg),
      null,
      this.disposables
    );
    vscode.workspace.onDidChangeConfiguration(
      (ev) => {
        if (ev.affectsConfiguration('texel.language')) {
          const next = currentLocale();
          if (next !== this.locale) {
            this.locale = next;
            this.sendLocale();
            this.sendSkills();
          }
        }
      },
      null,
      this.disposables
    );
  }

  private async getConfig(): Promise<{ ai: AiProviderConfig; texBinPath: string }> {
    // Defaults come from package.json; get() only returns undefined for unknown keys.
    const cfg = vscode.workspace.getConfiguration('texel');
    const get = <T>(key: string) => cfg.get<T>(key) as T;
    // SecretStorage first; the plain setting is only a deprecated fallback.
    const apiKey = (await this.context.secrets.get(SECRET_KEY)) || get<string>('apiKey');
    return {
      ai: {
        provider: get<AiProvider>('aiProvider'),
        apiBaseUrl: get<string>('apiBaseUrl'),
        apiKey,
        model: get<string>('model'),
        cliCommand: get<string>('cliCommand')
      },
      texBinPath: get<string>('texBinPath')
    };
  }

  private workspaceDir(): string {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.rootTexPath));
    return folder ? folder.uri.fsPath : path.dirname(this.rootTexPath);
  }

  /** Workspace skills are prompt text from the repository, so only trusted workspaces get them. */
  private skills() {
    return loadSkills(vscode.workspace.isTrusted ? this.workspaceDir() : undefined);
  }

  private hostText() {
    return HOST_STRINGS[this.locale];
  }

  /** latexmk runs project latexmkrc files, and AI revisions get written back into the project. */
  private requireTrust(action: string): boolean {
    if (vscode.workspace.isTrusted) {
      return true;
    }
    this.post({
      type: 'error',
      text: formatMessage(this.hostText().trustRequired, { action })
    });
    return false;
  }

  private sendLocale(): void {
    this.post({ type: 'locale', locale: this.locale, strings: WEBVIEW_STRINGS[this.locale] });
  }

  private async setLanguage(locale: Locale): Promise<void> {
    this.locale = locale;
    this.sendLocale();
    this.sendSkills();
    try {
      await vscode.workspace.getConfiguration('texel').update('language', locale, vscode.ConfigurationTarget.Global);
    } catch {
      // Still applied live in the current panel even if user settings are read-only.
    }
  }

  private sendSkills(): void {
    const skills = this.skills().map((s) => ({
      id: s.id,
      label:
        this.locale === 'zh-CN' && BUILTIN_SKILL_SET.has(s)
          ? BUILTIN_SKILL_LABELS_ZH[s.id] || s.label
          : s.label
    }));
    this.post({ type: 'skills', skills });
  }

  private cleanupTempWorkDir(): void {
    if (this.tempWorkDir && fs.existsSync(this.tempWorkDir)) {
      fs.rmSync(this.tempWorkDir, { recursive: true, force: true });
    }
    this.tempWorkDir = null;
  }

  private dispose(): void {
    TexelWorkspacePanel.currentPanel = undefined;
    this.cleanupTempWorkDir();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private post(message: ExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private sendPdf(pdfPath: string): void {
    this.post({
      type: 'pdfData',
      originalBase64: fs.readFileSync(pdfPath).toString('base64'),
      diffBase64: null,
      mode: 'original'
    });
  }

  private async loadExistingOrCompile(): Promise<void> {
    if (!fs.existsSync(this.pdfPath)) {
      await this.compileAndSend();
      return;
    }
    this.sendPdf(this.pdfPath);
    this.post({
      type: 'status',
      text: formatMessage(this.hostText().loadedPdf, { file: path.basename(this.pdfPath) }),
      busy: false
    });
  }

  private async compileAndSend(): Promise<void> {
    const t = this.hostText();
    if (!this.requireTrust(t.actionCompile)) {
      return;
    }
    const { texBinPath } = await this.getConfig();
    this.post({
      type: 'status',
      text: formatMessage(t.compilingTex, { file: path.basename(this.rootTexPath) }),
      busy: true
    });
    try {
      const { pdfPath, log } = await compileLatex(this.rootTexPath, texBinPath);
      this.pdfPath = pdfPath;
      this.lastCompileLog = log;
      this.sendPdf(pdfPath);
      this.post({ type: 'status', text: this.hostText().compiledReady, busy: false });
    } catch (err) {
      this.post({ type: 'error', text: errorText(err) });
    }
  }

  private async jumpToSource(page: number, x: number, y: number): Promise<void> {
    const { texBinPath } = await this.getConfig();
    try {
      const loc = await resolveBoxToSource(this.pdfPath, { page, x, y, width: 1, height: 1 }, texBinPath);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(loc.file));
      const column =
        vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === doc.uri.fsPath)?.viewColumn ??
        vscode.ViewColumn.One;
      const editor = await vscode.window.showTextDocument(doc, column);
      const pos = new vscode.Position(Math.max(0, loc.startLine - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch (err) {
      this.post({ type: 'error', text: errorText(err) });
    }
  }

  private async resolveAnnotation(box: PdfBox): Promise<void> {
    const { texBinPath } = await this.getConfig();
    try {
      const loc = await resolveBoxToSource(this.pdfPath, box, texBinPath);
      this.post({
        type: 'annotationResolved',
        boxId: box.id,
        file: loc.file,
        startLine: loc.startLine,
        endLine: loc.endLine,
        snippet: loc.snippet
      });
    } catch (err) {
      this.post({ type: 'annotationError', boxId: box.id, error: errorText(err) });
    }
  }

  private async runVscodeLm(prompt: string, preferredModel: string): Promise<string> {
    let models = await vscode.lm.selectChatModels({ family: preferredModel });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({});
    }
    if (models.length === 0) {
      throw new Error(this.hostText().noLmModel);
    }
    const response = await models[0].sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      {},
      new vscode.CancellationTokenSource().token
    );
    let text = '';
    for await (const chunk of response.text) {
      text += chunk;
    }
    return text;
  }

  /** Compiles the typeset before/after diff for every edit not rejected, then hands the round to the webview. */
  private async previewEdits(edits: ProposedEdit[], groupColor: string): Promise<void> {
    const { texBinPath } = await this.getConfig();
    this.post({ type: 'status', text: this.hostText().compilingDiff, busy: true });
    this.cleanupTempWorkDir();

    // Limitation: the typeset diff covers the first edited file only; other files still get .tex diffs.
    const shown = edits.filter((e) => e.decision !== 'reject');
    const primaryFile = shown[0]?.file || this.rootTexPath;
    const proposedContent = applyEdits(
      currentText(primaryFile),
      shown.filter((e) => e.file === primaryFile)
    );

    const diffResult = await buildTypesetDiff({
      rootTexPath: this.rootTexPath,
      targetTexPath: primaryFile,
      proposedTargetContent: proposedContent,
      texBinPath
    });
    this.tempWorkDir = diffResult.workDir;

    this.post({
      type: 'revisionReady',
      groupColor,
      edits,
      diffBase64: fs.readFileSync(diffResult.diffPdfPath).toString('base64'),
      usedDiffFallback: diffResult.usedDiffFallback
    });
    this.post({
      type: 'status',
      text: diffResult.usedDiffFallback
        ? this.hostText().revisionReadyFallback
        : this.hostText().revisionReadyDiff,
      busy: false
    });
  }

  private latexWarnings(): string {
    const warnings = this.lastCompileLog
      .split(/\r?\n/)
      .filter((l) => /Warning|Overfull|Underfull|Undefined/.test(l))
      .slice(0, 40);
    return warnings.length ? `\nLaTeX warnings from the last compile:\n${warnings.join('\n')}` : '';
  }

  private async runRevision(msg: Extract<WebviewMessage, { type: 'runRevision' }>): Promise<void> {
    const t = this.hostText();
    if (!this.requireTrust(t.actionAi)) {
      return;
    }
    const { ai } = await this.getConfig();
    this.post({ type: 'status', text: t.generatingRevision, busy: true });
    try {
      const skill = msg.skill ? this.skills().find((s) => s.id === msg.skill) : undefined;
      const instruction = msg.instruction + (skill?.id === 'build-warnings' ? this.latexWarnings() : '');
      const edits = await generateRevision(
        { annotations: msg.annotations, instruction, skill, providerConfig: ai },
        (prompt) => this.runVscodeLm(prompt, ai.model)
      );
      await this.previewEdits(edits, msg.color);
    } catch (err) {
      this.post({ type: 'error', text: errorText(err) });
    }
  }

  private async reviseRound(msg: Extract<WebviewMessage, { type: 'reviseRound' }>): Promise<void> {
    const t = this.hostText();
    if (!this.requireTrust(t.actionAi)) {
      return;
    }
    const { ai } = await this.getConfig();
    this.post({ type: 'status', text: t.revisingFeedback, busy: true });
    try {
      const revised = await reviseWithFeedback(
        { items: msg.items, instruction: msg.instruction, providerConfig: ai },
        (prompt) => this.runVscodeLm(prompt, ai.model)
      );
      await this.previewEdits([...msg.kept, ...revised], msg.color);
    } catch (err) {
      this.post({ type: 'error', text: errorText(err) });
    }
  }

  private async openTexDiff(edit: ProposedEdit): Promise<void> {
    try {
      const proposedContent = applyEdits(currentText(edit.file), [edit]);
      const virtualUri = vscode.Uri.parse(`texel-diff:/${path.basename(edit.file)}?seq=${++this.diffSeq}`);
      this.diffProvider.setContent(virtualUri, proposedContent);
      await vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.file(edit.file),
        virtualUri,
        formatMessage(this.hostText().sourceDiffTitle, {
          file: path.basename(edit.file),
          start: edit.startLine,
          end: edit.endLine
        })
      );
    } catch (err) {
      this.post({ type: 'error', text: errorText(err) });
    }
  }

  private async acceptEdits(edits: ProposedEdit[], annotationIds: string[]): Promise<void> {
    this.post({ type: 'status', text: this.hostText().applyingEdits, busy: true });
    try {
      const wsEdit = new vscode.WorkspaceEdit();
      const docs: vscode.TextDocument[] = [];
      // Relocate against the live buffer; throws before touching anything if a region moved away.
      for (const [file, fileEdits] of groupByFile(edits)) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
        const updated = applyEdits(doc.getText(), fileEdits);
        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        wsEdit.replace(doc.uri, fullRange, updated);
        docs.push(doc);
      }
      if (!(await vscode.workspace.applyEdit(wsEdit))) {
        throw new Error(this.hostText().editRejected);
      }
      await Promise.all(docs.map((d) => d.save()));
      this.cleanupTempWorkDir();
      this.post({ type: 'clearedRevision', removeAnnotationIds: annotationIds });
      await this.compileAndSend();
    } catch (err) {
      this.post({ type: 'error', text: errorText(err) });
    }
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.sendLocale();
        this.sendSkills();
        await (this.compileOnStart ? this.compileAndSend() : this.loadExistingOrCompile());
        break;
      case 'compile':
        this.sendSkills();
        await this.compileAndSend();
        break;
      case 'setLanguage':
        await this.setLanguage(msg.locale);
        break;
      case 'jumpToSource':
        await this.jumpToSource(msg.page, msg.x, msg.y);
        break;
      case 'resolveAnnotation':
        await this.resolveAnnotation(msg.box);
        break;
      case 'runRevision':
        await this.runRevision(msg);
        break;
      case 'reviseRound':
        await this.reviseRound(msg);
        break;
      case 'openTexDiff':
        await this.openTexDiff(msg.edit);
        break;
      case 'acceptEdits':
        await this.acceptEdits(msg.edits, msg.annotationIds);
        break;
      case 'rejectRevision':
        this.cleanupTempWorkDir();
        this.post({ type: 'status', text: this.hostText().revisionDiscarded, busy: false });
        break;
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const asset = (...segments: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, ...segments));
    const pdfJsUri = asset(...PDFJS_DIR, 'pdf.min.js');
    const pdfWorkerUri = asset(...PDFJS_DIR, 'pdf.worker.min.js');
    const cssUri = asset('media', 'webview.css');
    const jsUri = asset('media', 'webview.js');
    const nonce = randomBytes(16).toString('base64');
    const s = WEBVIEW_STRINGS[this.locale];

    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: blob:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="${this.locale}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Texel PDF Workspace</title>
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <div class="app">
    <div class="toolbar">
      <div class="toolbar-group">
        <button id="btn-compile" class="primary" type="button">${s.compileBtn}</button>
      </div>
      <div class="divider"></div>
      <div id="tool-group" class="toolbar-group" title="${s.selectionToolTitle}">
        <button id="tool-box" type="button" title="${s.toolBoxTitle}">${s.toolBox}</button>
        <button id="tool-text" type="button" title="${s.toolTextTitle}">${s.toolText}</button>
      </div>
      <div class="divider"></div>
      <div class="toolbar-group">
        <button id="mode-original" type="button">${s.modeOriginal}</button>
        <button id="mode-diff" type="button">${s.modeDiff}</button>
        <button id="mode-side" type="button">${s.modeSide}</button>
      </div>
      <div class="divider"></div>
      <div class="toolbar-group">
        <button id="zoom-out" type="button">-</button>
        <span id="zoom-label" class="zoom-label">125%</span>
        <button id="zoom-in" type="button">+</button>
      </div>
      <div class="divider"></div>
      <div id="color-group" class="toolbar-group" title="${s.colorGroupTitle}">
        <button class="color-dot color-red" data-color="red" type="button" title="${s.colorRed}"></button>
        <button class="color-dot color-blue active" data-color="blue" type="button" title="${s.colorBlue}"></button>
        <button class="color-dot color-green" data-color="green" type="button" title="${s.colorGreen}"></button>
        <button class="color-dot color-amber" data-color="amber" type="button" title="${s.colorAmber}"></button>
      </div>
      <div class="divider"></div>
      <div class="toolbar-group">
        <button id="btn-lang" type="button" title="${s.langToggleTitle}">${s.langToggleLabel}</button>
      </div>
      <span id="status-pill" class="status-pill">${s.statusReadyShort}</span>
    </div>

    <div class="workspace">
      <div class="pdf-pane">
        <div id="pdf-columns" class="pdf-columns"></div>
      </div>

      <aside class="sidebar">
        <div class="sidebar-section">
          <div id="ai-section-title" class="sidebar-title">${s.aiSectionTitle}</div>
          <textarea id="instruction-input" rows="3" placeholder="${s.instructionPlaceholder}"></textarea>
          <div id="skill-row" class="skill-row"></div>
          <div class="action-row">
            <button id="btn-run-ai" class="primary" type="button" style="flex:1">${s.runAiBtn}</button>
            <button id="btn-clear-boxes" type="button">${s.clearBtn}</button>
          </div>
          <div id="error-slot" style="margin-top:8px;"></div>
        </div>

        <div id="review-section" class="sidebar-section review-section" style="display:none;"></div>

        <div class="sidebar-section" style="border-bottom:none; padding-bottom:4px;">
          <div id="annotations-title" class="sidebar-title" style="margin-bottom:0;">${s.annotationsTitle}</div>
        </div>
        <div id="annotation-list" class="sidebar-scroll"></div>
      </aside>
    </div>
  </div>
  <button id="mark-btn" class="primary mark-btn" type="button" style="display:none;">${s.markSelectionBtn}</button>

  <script nonce="${nonce}" src="${pdfJsUri}"></script>
  <!-- Preload pdf.js worker on the page so VS Code webviews skip failing cross-origin Worker setup. -->
  <script nonce="${nonce}" src="${pdfWorkerUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

async function pickTargetTexPath(uri?: vscode.Uri): Promise<string | undefined> {
  const t = HOST_STRINGS[currentLocale()];
  if (uri && uri.fsPath.endsWith('.tex')) {
    return uri.fsPath;
  }
  const active = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (active && active.endsWith('.tex')) {
    return active;
  }
  const found = await vscode.workspace.findFiles('**/*.tex', '**/node_modules/**', 20);
  if (found.length === 1) {
    return found[0].fsPath;
  }
  if (found.length > 1) {
    const picked = await vscode.window.showQuickPick(
      found.map((f) => ({ label: vscode.workspace.asRelativePath(f), fsPath: f.fsPath })),
      { placeHolder: t.pickTexPlaceholder }
    );
    return picked?.fsPath;
  }
  vscode.window.showErrorMessage(t.noTexFound);
  return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  const diffProvider = new TexelDiffContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('texel-diff', diffProvider)
  );

  const open = (compileFirst: boolean) => async (uri?: vscode.Uri) => {
    const texPath = await pickTargetTexPath(uri);
    if (texPath) {
      TexelWorkspacePanel.createOrShow(context, diffProvider, texPath, compileFirst);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('texel.openPreview', open(false)),
    vscode.commands.registerCommand('texel.compileAndPreview', open(true)),
    vscode.commands.registerCommand('texel.setApiKey', async () => {
      const t = HOST_STRINGS[currentLocale()];
      const key = await vscode.window.showInputBox({
        prompt: t.apiKeyPrompt,
        password: true,
        ignoreFocusOut: true
      });
      if (key === undefined) {
        return;
      }
      if (key.trim()) {
        await context.secrets.store(SECRET_KEY, key.trim());
        vscode.window.showInformationMessage(t.apiKeySaved);
      } else {
        await context.secrets.delete(SECRET_KEY);
        vscode.window.showInformationMessage(t.apiKeyRemoved);
      }
    })
  );
}
