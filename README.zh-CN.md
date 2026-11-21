<p align="center">
  <img src="./media/icon.png" alt="Texel" width="128" height="128" />
</p>

<h1 align="center">Texel</h1>

<p align="center">
  <b>VS Code 轻量级 PDF 优先 AI LaTeX 改稿插件</b><br/>
  👉 <a href="./README.md"><b>English README (英文说明文档)</b></a>
</p>

> **适用平台**：macOS / Windows / Linux（VS Code `1.90.0+`）  
> **界面语言**：简体中文 / English 双语界面（默认跟随 VS Code 语言，工具栏支持一键 `中文 / EN` 实时切换）  
> **前置环境**：本地 TeX 发行版（提供 `latexmk`、`synctex`、`latexdiff`）  
> **核心体验**：在编译好的 PDF 页面上直接框选或划词 → SyncTeX 自动精准定位源码 → AI 按指令或技能改写 → `latexdiff` 生成排版级红删蓝增对比 → 逐条审阅安全写回 `.tex`。  
> **AI 后端**：零厂商锁定，原生支持 VS Code 内置模型（`vscode-lm`）、任意 OpenAI 兼容 API（OpenAI / Gemini / DeepSeek / 本地 Ollama 等）及本地 CLI 工具。  
> **安全设计**：隔离临时目录编译不改动原稿；高危路径与接口配置锁定用户级；未受信任工作区默认只读预览。

---

## ✨ 为什么用 Texel？

写论文或长篇 LaTeX 文档时，对着满屏源码看纯文本 Diff 很难一眼判断排版、公式和行距效果。**Texel** 把整套改稿闭环直接放进 VS Code：

```text
PDF 上框选/划词标注 ──▶ SyncTeX 自动定位源码块 ──▶ AI 按指令/技能改写 ──▶ 排版级前后 Diff 审阅 ──▶ 逐条确认写回 .tex
```

- **框选 + 划词双模式**：
  - **Box（框选）**：直接拖框圈出公式、图表、表格或整段文字，自动补全完整的 `\begin{...}...\end{...}` 环境。
  - **Text（划词）**：在 PDF 文本层直接拖选句子并点击 **`+ Mark selection`**，自动按选中词句校正 SyncTeX 行号偏差。
  - **双向跳转**：双击 PDF 任意位置或点击已有标注框，立即跳到对应 `.tex` 源码行；支持 4 种颜色分组，同色标注可一次发给 AI 联合修改。
- **排版级视觉 Diff**：在系统临时目录中通过符号链接隔离编译，支持 **Original（原稿）**、**Typeset Diff（红删蓝增排版对比）**、**Side-by-Side（左右双栏对照）** 三种 PDF 视图，同时可一键打开 VS Code 原生 `.tex` 源码对比。
- **逐条审阅 & 多轮带意见重改**：每处建议改动可单独标记 **`✓ Accept`** 或 **`✗ Reject`**；对不满意的条目直接写反馈并点 **`Revise with feedback`**，系统会保留已接受的改动，只把待改进条目送回 AI 返工。
- **防错位安全写回**：写回 `.tex` 前会在当前编辑器缓冲区重新定位原文；即使审阅期间手动改过其他行也不会写错位置，原文已被改动时会直接停止提示，绝不瞎覆盖。

<!-- 📸 效果展示：将实机截图放入 docs/ 目录后取消下面注释即可在 GitHub 页面展示
## 📸 效果展示

### 1. PDF 框选 / 划词标注与 SyncTeX 定位
![PDF 标注与定位](./docs/demo-annotate.png)

### 2. Side-by-Side 排版级前后 Diff 与逐条审阅
![Side-by-Side 排版对比](./docs/demo-diff.png)
-->

---

## 🚀 极速上手指南

### 1. 准备本地 TeX 环境

确认本机已安装 TeX 发行版，并包含 `latexmk`、`synctex` 和 `latexdiff`：
- **macOS**：安装 [MacTeX](https://tug.org/mactex/)（默认位于 `/Library/TeX/texbin`，Texel 开箱即用）。
- **Linux**：以 Ubuntu / Debian 为例：
  ```bash
  sudo apt-get install latexmk texlive-latex-base texlive-latex-recommended texlive-plain-generic latexdiff
  ```
- **Windows**：安装 [TeX Live](https://tug.org/texlive/) 或 MiKTeX（需确保 `latexmk`、`synctex`、`latexdiff` 已在系统 `PATH` 中，或在设置里指定 `texel.texBinPath`）。

---

### 2. 安装插件（二选一）

- **方式 A：安装打包好的 `.vsix`（推荐给普通用户）**
  1. 前往本仓库右侧 **[Releases](https://github.com/Angues228/Texel/releases)** 页面下载最新的 `texel-*.vsix` 文件。
  2. 在 VS Code 左侧打开 **扩展（Extensions）** 面板，点击右上角 `...` 菜单 → **`从 VSIX 安装...`（Install from VSIX...）**，选中下载的文件即可。

- **方式 B：从源码本地编译或调试运行（适合开发者）**
  ```bash
  git clone https://github.com/Angues228/Texel.git
  cd Texel
  npm install
  npx @vscode/vsce package
  ```
  打包完成后用上述方式安装生成的 `.vsix`；或者直接用 VS Code 打开项目目录，按 **`F5`**（Mac 笔记本可能需要 **`Fn + F5`**）即可启动扩展调试宿主并自动打开示例论文 `examples/sample.tex`。

---

### 3. 开始改稿（4 步完成一轮）

1. 在 VS Code 中打开任意 `.tex` 文件。
2. 点击编辑器右上角标题栏的 <img src="./media/icon.png" alt="Texel" width="18" height="18" align="absmiddle" /> **Texel 图标**（专属蓝框 `T` + 金色星芒，即使同时装了 LaTeX Workshop 绿色 `▷` 或 Code Runner 灰色 `▷` 也能一眼分辨），或按 `Cmd+Shift+P` / `Ctrl+Shift+P` 运行 **`Texel: 编译 LaTeX 并打开 PDF 工作区`**。如果你平时已通过 LaTeX Workshop 按 `Cmd+S` / `Ctrl+S` 自动编译好 PDF、只想秒开不重编，可直接运行 **`Texel: 打开 PDF 批注与 AI 工作区`**。
3. 在右侧 PDF 面板用 **Box** 拖框或 **Text** 划词标记需要修改的区域，在指令框输入要求（或直接点击下方的预设 Skill 按钮），点击 **`Run AI Revision`**。
4. 在生成的 **Side-by-Side** / **Typeset Diff** 视图中核对排版效果，必要时点 **`View .tex Diff`** 查看源码差异；逐条点 **`✓ Accept`**（或填写反馈点 **`Revise with feedback`** 再改一轮），最后点 **`Apply accepted`** 自动写回 `.tex` 并重新编译。

---

## 🤖 AI 后端配置指南

在 VS Code 设置（`Cmd+,` / `Ctrl+,`）中搜索 **`texel`**，按需选择以下 3 种后端之一：

### 方式 A：`vscode-lm`（默认，免配 Key）
直接调用 VS Code 内置语言模型（如已登录的 GitHub Copilot）。保持 `texel.aiProvider` 为 `"vscode-lm"` 即可，可在 `texel.model` 中填偏好的模型族名称（可选）。

### 方式 B：`openai-compatible`（OpenAI / Gemini / DeepSeek / Ollama 等）
1. 将 **`Texel: Ai Provider`** 设为 `openai-compatible`。
2. 按 `Cmd+Shift+P` / `Ctrl+Shift+P` 运行 **`Texel: Set API Key (Secure Storage)`**，粘贴你的 API Key 回车（密钥会加密保存在系统钥匙串 / VS Code `SecretStorage`，不会写入明文 `settings.json`；使用本地 Ollama 时可填任意占位字符串如 `ollama`）。
3. 填写 **`Texel: Api Base Url`** 和 **`Texel: Model`**（插件会自动拼接 `/chat/completions`，填写 Base URL 时**不要**自己加末尾路径）：

| 平台 | `texel.apiBaseUrl` | `texel.model` 示例 |
| :--- | :--- | :--- |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini`、`gpt-4o` |
| **Google AI Studio (Gemini)** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.5-flash-lite`、`gemini-3.8-flash` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat`、`deepseek-reasoner` |
| **Ollama（本地模型）** | `http://localhost:11434/v1` | `qwen2.5:14b`、`llama3.1` |

### 方式 C：`cli`（本地 CLI 智能体）
1. 将 **`Texel: Ai Provider`** 设为 `cli`。
2. 在 **`Texel: Cli Command`** 中填入能从标准输入读取提示词的本地命令（例如 `claude -p` 或其他本地 CLI 工具）。

---

## 🧠 内置 Skills 与工作区自定义技能

### 内置 6 个学术写作技能

选好 PDF 区域后，直接点对应按钮即可运行（也可以同时在指令框补充额外要求）：

| 按钮名称 | 适用场景 | 行为说明 |
| :--- | :--- | :--- |
| **Grammar** | 语法与拼写校对 | 只修语法、拼写、标点、冠词及小处 LaTeX 语法错误，不随意改写本来通顺的句子 |
| **Clarity** | 学术表达清晰化 | 梳理难懂的长句，让表达更清晰自然，严格保持原意、术语和数学公式不变 |
| **Tighten** | 精简压缩篇幅 | 去掉冗余和套话，目标压缩约四分之一字数，保留全部结论、公式与引用 |
| **Notation** | 数学与符号核查 | 检查正负号、上下标、量纲以及选区内的术语/符号一致性，并在说明里列出核查项 |
| **Address Comment** | 按审稿/合作者意见修改 | 把审稿意见粘进指令框，最小范围改写正文并生成一句简洁的回复摘要 |
| **Build Warnings** | 修复编译警告 | 自动附带最近一次编译日志里的警告（Overfull box、未定义引用等），做最小源码修复 |

### 自定义项目专属技能（`.texel/skills/*.md`）

在论文项目根目录新建 `.texel/skills/` 文件夹，放入任意 `.md` 文件即可自动变成侧边栏按钮（首行 `# 标题` 为按钮名，其余正文为提示词；如果文件名与内置技能 ID 相同则会覆盖内置技能）：

```markdown
# 摘要字数检查
请将该段摘要控制在 150 词以内，确保明确包含研究背景、方法与核心结果，不要删掉任何定量指标。
```

保存为 `.texel/skills/abstract-limit.md` 后，点一次 **`Compile PDF`** 或重新打开面板即可看到新按钮。

---

## ⚙️ 命令与配置项速查

| 类型 | 名称 | 说明 |
| :--- | :--- | :--- |
| **命令** | `Texel: Compile LaTeX & Open PDF Workspace` | 编译当前 `.tex` 并打开 PDF 改稿工作区 |
| **命令** | `Texel: Open PDF Annotator & AI Workspace` | 直接打开已有 PDF（不存在时自动触发编译） |
| **命令** | `Texel: Set API Key (Secure Storage)` | 将 API Key 存入或移除自 VS Code 安全存储 |
| **配置** | `texel.language` | 界面语言：`auto`（跟随 VS Code，默认）/ `en` / `zh-CN`；也可直接在 PDF 工具栏一键切换 |
| **配置** | `texel.aiProvider` | AI 后端：`vscode-lm`（默认）/ `openai-compatible` / `cli` |
| **配置** | `texel.apiBaseUrl` | OpenAI 兼容接口根地址（**仅限用户级设置**） |
| **配置** | `texel.model` | 模型名称或 `vscode-lm` 偏好模型族 |
| **配置** | `texel.cliCommand` | 本地 CLI 命令（默认 `claude -p`，**仅限用户级设置**） |
| **配置** | `texel.texBinPath` | TeX 可执行文件目录（默认 `/Library/TeX/texbin`，**仅限用户级设置**） |

---

## 🔒 安全与工作区信任说明

LaTeX 项目本身可能包含可执行的 `latexmkrc` 或仓库级配置，Texel 默认做了三层防护：
1. **防工作区配置劫持**：`texel.apiBaseUrl`、`texel.cliCommand`、`texel.texBinPath` 均为 `machine` 作用域，**只能在你本机的用户设置中修改**，打开陌生仓库时其中的 `.vscode/settings.json` 无法偷偷改掉你的命令路径或把 API Key 发往第三方地址。
2. **受限模式（Untrusted Workspace）保护**：在未受信任的文件夹中，Texel 只允许浏览已有的 PDF；触发 LaTeX 编译、调用 AI 改写以及加载仓库内 `.texel/skills/*.md` 提示词都会被拦截，直到你手动信任该工作区。
3. **Webview CSP 隔离**：PDF 面板禁止内联脚本，所有加载的脚本均受随机 `nonce` 约束。

---

## 📂 项目文件结构

```text
Texel/
├── src/
│   ├── extension.ts          # 扩展入口、Webview 面板生命周期、命令注册与信任校验
│   ├── ai.ts                 # 内置/自定义技能加载、Prompt 构建、JSON 解析与多后端调用
│   ├── compiler.ts           # latexmk 编译、隔离临时目录镜像、latexdiff 与安全写回定位
│   ├── synctex.ts            # SyncTeX 双向映射、LaTeX 环境平衡扩展与划词行号校正
│   ├── i18n.ts               # 中英文双语界面文案与语言解析
│   ├── protocol.ts           # 扩展与 Webview 双向消息协议类型定义
│   └── test/
│       ├── unit.test.ts      # 纯函数单元测试（无需本机安装 TeX）
│       └── integration.test.ts # latexmk + synctex + latexdiff 端到端集成测试
├── media/
│   ├── icon.png              # 512×512 高清插件主图标（附矢量源文件 icon.svg）
│   ├── texel-action-*.svg    # 编辑器标题栏浅/深色自适应按钮图标
│   ├── webview.js            # PDF 渲染、Box/Text 标注交互、审阅卡片与状态管理
│   └── webview.css           # Webview 样式与 pdf.js 文本层样式
├── examples/
│   └── sample.tex            # 本地调试与集成测试示例论文
├── .github/workflows/
│   ├── ci.yml                # main 分支 push / PR 自动测试
│   └── release.yml           # 打 v* tag 自动测试、打包 VSIX 与发布
├── THIRD-PARTY-NOTICES.md    # 随包分发的 pdf.js 第三方开源许可声明
└── package.json              # 扩展清单、命令与配置定义
```

---

## ❓ 常见问题解答 (FAQ)

### 1）点击编译提示找不到 `latexmk` / `synctex` / `latexdiff`？
- **macOS**：确认已安装 MacTeX 且 `/Library/TeX/texbin` 目录存在。
- **Windows / Linux**：`texel.texBinPath` 默认值是 macOS 路径；请确认 TeX 已加入系统 `PATH`，或在 VS Code **用户设置** 中把 `texel.texBinPath` 改为你本机 TeX 的 `bin` 目录后重试。

### 2）框选或划词提示 `SyncTeX could not map page ...`？
- 说明当前 PDF 旁缺少对应的 `.synctex.gz` 文件（或不是带 `-synctex=1` 参数编译出来的）。点击面板左上角 **`Compile PDF`** 用 Texel 重新编译一次即可生成 SyncTeX 索引。

### 3）点 Run AI Revision 提示 `No VS Code Language Model found`？
- 默认后端是 `vscode-lm`，需要当前 VS Code 窗口已登录 GitHub Copilot 等语言模型插件。如果没有订阅 Copilot，按上方「AI 后端配置指南」切到 `openai-compatible`（如 Gemini / DeepSeek / 本地 Ollama）或 `cli` 即可。

### 4）为什么有时 `Typeset Diff` 显示的是 `Updated PDF` 而不是红删蓝增？
- 遇到特别复杂的自定义宏包或表格语法时，`latexdiff` 生成的对比 `.tex` 有可能无法直接编译通过。此时 Texel 会自动回退显示改写后的干净 PDF（`Updated PDF`），避免阻塞审阅；你仍可点 **`View .tex Diff`** 核对每一行源码变动。

### 5）在受限模式下点击编译或 AI 提示需要 trusted workspace？
- 这是正常的安全拦截。确认该论文仓库可信后，点击窗口顶部提示条的 **`管理`（Manage）** 或左下角 **`受限模式`（Restricted Mode）** 信任该文件夹即可恢复全部功能。

### 6）当前已知限制（v0.1.0）
- 一次修订同时涉及多个 `.tex` 文件时，右侧排版级 PDF Diff 目前只预览第一个被修改的文件（其余文件仍可通过 **`View .tex Diff`** 查看源码差异并正常应用）。
- 点击 **`Apply accepted`** 写回 `.tex` 时当前采用整文件范围更新，撤销（`Cmd+Z`）会一次性撤回该次全部改动。

---

## 🧪 本地开发与测试

```bash
npm install
npm test                  # TypeScript 类型检查 + 单元测试（无需 TeX）
npm run test:integration  # 端到端集成测试（需本机有 latexmk / synctex / latexdiff）
npx @vscode/vsce package  # 打包本地 .vsix 安装包
```

用 VS Code 打开本仓库后按 **`F5`**，即可启动扩展开发宿主窗口进行实时调试。

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Angues228/Texel&type=Date)](https://star-history.com/#Angues228/Texel&Date)

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。随包分发的 `pdf.js` 许可信息见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
