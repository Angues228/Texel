export type Locale = 'en' | 'zh-CN';
export type LanguageSetting = 'auto' | Locale;

export function resolveLocale(setting: LanguageSetting | undefined, envLanguage: string): Locale {
  if (setting === 'en' || setting === 'zh-CN') {
    return setting;
  }
  return envLanguage.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function formatMessage(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`
  );
}

const enWebview = {
  compileBtn: 'Compile PDF',
  selectionToolTitle: 'Selection tool',
  toolBox: 'Box',
  toolBoxTitle: 'Drag a box over equations, figures, or paragraphs',
  toolText: 'Text',
  toolTextTitle: 'Select printed text, then click Mark',
  modeOriginal: 'Original',
  modeDiff: 'Typeset Diff',
  modeSide: 'Side-by-Side',
  colorGroupTitle: 'Annotation Color Group',
  colorRed: 'Red Group',
  colorBlue: 'Blue Group',
  colorGreen: 'Green Group',
  colorAmber: 'Amber Group',
  langToggleLabel: '中文',
  langToggleTitle: 'Switch interface to Simplified Chinese',
  statusReadyShort: 'Ready',
  statusReady: 'Ready — drag a box (or switch to Text and select words) on the PDF',
  aiSectionTitle: 'AI Instruction & Skills',
  instructionPlaceholder: 'Tell AI what to change in the selected regions...',
  runAiBtn: 'Run AI Revision',
  clearBtn: 'Clear',
  annotationsTitle: 'PDF Annotations (SyncTeX)',
  markSelectionBtn: '+ Mark selection',
  skillTooltip: 'Run the "{label}" skill on the selected regions',
  emptyPdfHint: 'No PDF loaded yet. Click <b>Compile PDF</b> to build your LaTeX document.',
  colCompiledPdf: 'Compiled PDF',
  colBefore: 'Before (Original)',
  colUpdatedPdf: 'Updated PDF',
  colTypesetDiff: 'Typeset Diff',
  colAfter: 'After ({label})',
  renderError: 'Failed to render PDF: {error}',
  emptyAnnotationsHint:
    'Box tool: drag over an equation, figure, or paragraph. Text tool: select printed words, then click <b>+ Mark selection</b>. Marks of one color are revised together.',
  synctexFailed: 'SyncTeX failed',
  synctexMapping: 'Mapping via SyncTeX...',
  removeBtn: 'Remove',
  notePlaceholder: 'Optional note for this mark...',
  proposedEditsTitle: 'Proposed Edits ({count})',
  viewTexDiffBtn: 'View .tex Diff',
  acceptBtn: '✓ Accept',
  rejectBtn: '✗ Reject',
  feedbackPlaceholder: 'Feedback for the next round (optional)...',
  acceptAllBtn: 'Accept all',
  applyAcceptedBtn: 'Apply accepted ({count})',
  reviseFeedbackBtn: 'Revise with feedback ({count})',
  discardBtn: 'Discard',
  needRegionError: 'Mark at least one SyncTeX-resolved region on the PDF first.',
  needInstructionError: 'Enter a revision instruction or click a skill button.'
};

export type WebviewStrings = typeof enWebview;

const zhWebview: WebviewStrings = {
  compileBtn: '编译 PDF',
  selectionToolTitle: '选择工具',
  toolBox: '框选',
  toolBoxTitle: '拖框选取公式、图表或段落',
  toolText: '划词',
  toolTextTitle: '拖选正文文字后点击标记',
  modeOriginal: '原稿',
  modeDiff: '排版 Diff',
  modeSide: '左右对照',
  colorGroupTitle: '批注颜色分组',
  colorRed: '红色分组',
  colorBlue: '蓝色分组',
  colorGreen: '绿色分组',
  colorAmber: '琥珀色分组',
  langToggleLabel: 'EN',
  langToggleTitle: 'Switch interface to English',
  statusReadyShort: '就绪',
  statusReady: '就绪 — 在 PDF 上拖框（或切换到「划词」拖选文字）',
  aiSectionTitle: 'AI 指令与技能',
  instructionPlaceholder: '告诉 AI 要如何修改选中区域...',
  runAiBtn: '运行 AI 改写',
  clearBtn: '清空',
  annotationsTitle: 'PDF 批注（SyncTeX）',
  markSelectionBtn: '+ 标记选区',
  skillTooltip: '对选中区域运行「{label}」技能',
  emptyPdfHint: '尚未加载 PDF，请点击 <b>编译 PDF</b> 构建 LaTeX 文档。',
  colCompiledPdf: '已编译 PDF',
  colBefore: '修改前（原稿）',
  colUpdatedPdf: '更新后 PDF',
  colTypesetDiff: '排版 Diff',
  colAfter: '修改后（{label}）',
  renderError: 'PDF 渲染失败：{error}',
  emptyAnnotationsHint:
    '框选模式：拖框选取公式、图表或段落。划词模式：拖选正文后点击 <b>+ 标记选区</b>。同色批注会一起发给 AI 修改。',
  synctexFailed: 'SyncTeX 定位失败',
  synctexMapping: '正在通过 SyncTeX 定位...',
  removeBtn: '移除',
  notePlaceholder: '为此标注添加备注（可选）...',
  proposedEditsTitle: '建议修改（{count}）',
  viewTexDiffBtn: '查看 .tex 对比',
  acceptBtn: '✓ 接受',
  rejectBtn: '✗ 拒绝',
  feedbackPlaceholder: '填写下一轮修改意见（可选）...',
  acceptAllBtn: '全部接受',
  applyAcceptedBtn: '应用已接受（{count}）',
  reviseFeedbackBtn: '按意见重改（{count}）',
  discardBtn: '放弃',
  needRegionError: '请先在 PDF 上标记至少一个已定位到源码的区域。',
  needInstructionError: '请输入修改指令或点击一个技能按钮。'
};

export const WEBVIEW_STRINGS: Record<Locale, WebviewStrings> = {
  en: enWebview,
  'zh-CN': zhWebview
};

const enHost = {
  actionCompile: 'Compiling LaTeX',
  actionAi: 'AI revision',
  trustRequired: '{action} needs a trusted workspace (run "Workspaces: Manage Workspace Trust").',
  loadedPdf: 'Loaded {file}',
  compilingTex: 'Compiling {file}...',
  compiledReady: 'Compiled with SyncTeX ready',
  noLmModel:
    'No VS Code Language Model found. Sign in to GitHub Copilot or set texel.aiProvider to "openai-compatible" or "cli" in Settings.',
  compilingDiff: 'Compiling typeset before/after diff...',
  revisionReadyFallback: 'Revision ready (showing updated PDF)',
  revisionReadyDiff: 'Typeset diff ready — accept or reject each edit',
  generatingRevision: 'Generating AI revision...',
  revisingFeedback: 'Revising with your feedback...',
  sourceDiffTitle: 'Texel Source Diff: {file} (L{start}-{end})',
  applyingEdits: 'Applying accepted edits to .tex...',
  editRejected: 'VS Code rejected the edit.',
  revisionDiscarded: 'Revision discarded',
  pickTexPlaceholder: 'Select the root .tex file to open in Texel',
  noTexFound: 'Open a .tex file or workspace containing .tex files to use Texel.',
  apiKeyPrompt: 'API key for texel.apiBaseUrl (stored in VS Code SecretStorage). Leave empty to remove.',
  apiKeySaved: 'Texel: API key saved securely.',
  apiKeyRemoved: 'Texel: API key removed.'
};

export type HostStrings = typeof enHost;

const zhHost: HostStrings = {
  actionCompile: '编译 LaTeX ',
  actionAi: 'AI 改写',
  trustRequired: '{action}需要受信任的工作区（请运行「工作区：管理工作区信任」）。',
  loadedPdf: '已加载 {file}',
  compilingTex: '正在编译 {file}...',
  compiledReady: '编译完成，SyncTeX 已就绪',
  noLmModel:
    '未找到可用的 VS Code 语言模型。请登录 GitHub Copilot，或在设置中将 texel.aiProvider 切换为 "openai-compatible" 或 "cli"。',
  compilingDiff: '正在编译排版级前后 Diff...',
  revisionReadyFallback: '修订已就绪（当前显示更新后 PDF）',
  revisionReadyDiff: '排版 Diff 已就绪 — 请逐条接受或拒绝修改',
  generatingRevision: '正在生成 AI 改写...',
  revisingFeedback: '正在按你的意见重新改写...',
  sourceDiffTitle: 'Texel 源码对比：{file}（第 {start}-{end} 行）',
  applyingEdits: '正在将已接受的修改写回 .tex...',
  editRejected: 'VS Code 拒绝了此次文件修改。',
  revisionDiscarded: '已放弃本次修订',
  pickTexPlaceholder: '选择要在 Texel 中打开的主 .tex 文件',
  noTexFound: '请先打开一个 .tex 文件或包含 .tex 文件的工作区。',
  apiKeyPrompt: '请输入 texel.apiBaseUrl 对应的 API Key（存入 VS Code 安全存储，留空则移除）。',
  apiKeySaved: 'Texel：API Key 已安全保存。',
  apiKeyRemoved: 'Texel：API Key 已移除。'
};

export const HOST_STRINGS: Record<Locale, HostStrings> = {
  en: enHost,
  'zh-CN': zhHost
};

export const BUILTIN_SKILL_LABELS_ZH: Record<string, string> = {
  grammar: '语法校对',
  clarity: '表达润色',
  tighten: '精简压缩',
  notation: '公式符号',
  'address-comment': '回复意见',
  'build-warnings': '编译警告'
};
