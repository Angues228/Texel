<p align="center">
  <img src="./media/icon.png" alt="Texel" width="128" height="128" />
</p>

<h1 align="center">Texel</h1>

<p align="center">
  <b>Lightweight PDF-Centric AI LaTeX Editor for VS Code</b><br/>
  👉 <a href="./README.zh-CN.md"><b>简体中文说明文档 (Simplified Chinese README)</b></a>
</p>

> **Platforms**: macOS / Windows / Linux (VS Code `1.90.0+`)  
> **UI Language**: English & Simplified Chinese (auto-follows VS Code language, with a one-click `中文 / EN` toggle in the PDF toolbar)  
> **Prerequisites**: A local TeX distribution providing `latexmk`, `synctex`, and `latexdiff`  
> **Workflow**: Mark regions directly on the compiled PDF → SyncTeX maps to source lines → AI rewrites with instructions or skills → review typeset `latexdiff` before/after diffs → accept and apply safely to `.tex`.  
> **AI Backends**: Vendor-neutral — supports VS Code built-in Language Models (`vscode-lm`), any OpenAI-compatible API (OpenAI / Gemini / DeepSeek / local Ollama, etc.), and local CLI agents.  
> **Security**: Isolated temp-dir compilation, machine-scoped execution/endpoint settings, Workspace Trust enforcement, and nonce-based webview CSP.

---

## ✨ Why Texel?

Reading raw LaTeX text diffs makes it hard to judge how an edit actually looks on the page—especially for equations, layout, and spacing. **Texel** keeps the whole review loop inside VS Code:

```text
Mark PDF (Box / Text) ──▶ SyncTeX source mapping ──▶ AI revision ──▶ Typeset diff review ──▶ Safe .tex apply
```

- **Box & Text Selection on PDF (`pdf.js`)**:
  - **Box tool**: Drag rectangles over equations, figures, tables, or paragraphs; Texel automatically expands to balanced `\begin{...}...\end{...}` blocks.
  - **Text tool**: Highlight printed words directly on the PDF text layer and click **`+ Mark selection`**; Texel matches the selected words against the source to tighten SyncTeX's line range.
  - **Reverse Jump & Color Groups**: Double-click anywhere on the PDF (or click a mark) to jump straight to the `.tex` line; group marks into 4 colors to revise related regions together.
- **Typeset Before-and-After Diffs**: Compiles revisions inside a symlinked temporary workspace so your paper directory stays untouched. Switch between **Original**, **Typeset Diff**, and **Side-by-Side** PDF views, or open VS Code's native `.tex` diff on any edit.
- **Per-Edit Review & Multi-Round Feedback**: Mark each proposed edit **`✓ Accept`** or **`✗ Reject`**, leave inline comments on edits that need work, and click **`Revise with feedback`** to keep accepted edits while refining the rest.
- **Drift-Safe Source Application**: Before writing back to `.tex`, each edit is located again in the live editor buffer—so manual edits made during review won't shift lines onto the wrong text. If the original text was changed or removed, Texel stops instead of guessing.

<!-- 📸 Screenshots: drop images into docs/ and uncomment to display them on GitHub
## 📸 Screenshots

### 1. PDF Annotation & SyncTeX Mapping
![PDF Annotation](./docs/demo-annotate.png)

### 2. Side-by-Side Typeset Diff & Per-Edit Review
![Side-by-Side Typeset Diff](./docs/demo-diff.png)
-->

---

## 🚀 Quick Start

### 1. Install a Local TeX Distribution

Make sure `latexmk`, `synctex`, and `latexdiff` are available on your machine:
- **macOS**: Install [MacTeX](https://tug.org/mactex/) (binaries live in `/Library/TeX/texbin`, which Texel uses by default).
- **Linux** (Ubuntu / Debian example):
  ```bash
  sudo apt-get install latexmk texlive-latex-base texlive-latex-recommended texlive-plain-generic latexdiff
  ```
- **Windows**: Install [TeX Live](https://tug.org/texlive/) or MiKTeX and make sure `latexmk`, `synctex`, and `latexdiff` are on your `PATH` (or set `texel.texBinPath` in User Settings).

---

### 2. Install Texel (Choose One)

- **Option A: Install from VS Code Marketplace (Recommended ⚡)**
  - Open the **Extensions** sidebar in VS Code (`Cmd+Shift+X` / `Ctrl+Shift+X`) and search for **`Texel`**.
  - Or press `Cmd+P` / `Ctrl+P` in VS Code and run:
    ```text
    ext install Angues.texel
    ```
  - Or from your terminal:
    ```bash
    code --install-extension Angues.texel
    ```

- **Option B: Install Pre-built `.vsix` (GitHub Releases)**
  1. Download the latest `texel-v*.vsix` from **[GitHub Releases](https://github.com/Angues228/Texel/releases)**.
  2. Open VS Code → **Extensions** sidebar → click the top-right `...` menu → **`Install from VSIX...`** and select the downloaded file.

- **Option C: Build or Run from Source (Developers)**
  ```bash
  git clone https://github.com/Angues228/Texel.git
  cd Texel
  npm install
  npx @vscode/vsce package
  ```
  Install the generated `.vsix`, or open the folder in VS Code and press **`F5`** (`Fn + F5` on some MacBooks) to launch an Extension Development Host with `examples/sample.tex`.

---

### 3. Revise a Paper in 4 Steps

1. Open any `.tex` file in VS Code.
2. Click the <img src="./media/icon.png" alt="Texel" width="18" height="18" align="absmiddle" /> **Texel icon** (blue selection-frame `T` + amber sparkle — visually distinct even alongside LaTeX Workshop's green `▷` or Code Runner's `▷`) in the editor title bar, or run **`Texel: Compile LaTeX & Open PDF Workspace`** from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`). If you already auto-compile on save (`Cmd+S` / `Ctrl+S`) via LaTeX Workshop and want to open the existing PDF immediately without recompiling, run **`Texel: Open PDF Annotator & AI Workspace`**.
3. Use **Box** or **Text** mode to mark regions on the PDF, type an instruction or click a skill button, and click **`Run AI Revision`**.
4. Inspect the **Side-by-Side** / **Typeset Diff** view (and **`View .tex Diff`** if desired), mark edits **`✓ Accept`** / **`✗ Reject`** (or add comments and run **`Revise with feedback`**), then click **`Apply accepted`** to save changes and recompile automatically.

---

## 🤖 AI Backend Setup

Open VS Code Settings (`Cmd+,` / `Ctrl+,`) and search for **`texel`**. Choose any of the three backends:

### Option A: `vscode-lm` (Default, No API Key Needed)
Uses VS Code's built-in Language Model API (e.g., GitHub Copilot). Leave `texel.aiProvider` set to `"vscode-lm"`; optionally set `texel.model` as a preferred model family hint.

### Option B: `openai-compatible` (OpenAI / Gemini / DeepSeek / Ollama / etc.)
1. Set **`Texel: Ai Provider`** to `openai-compatible`.
2. Run **`Texel: Set API Key (Secure Storage)`** from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and paste your key (stored in VS Code `SecretStorage`, never written to plain `settings.json`; for local Ollama any placeholder string like `ollama` works).
3. Configure **`Texel: Api Base Url`** and **`Texel: Model`** (Texel appends `/chat/completions` automatically—**do not** include it in the Base URL):

| Provider | `texel.apiBaseUrl` | `texel.model` (examples) |
| :--- | :--- | :--- |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini`, `gpt-4o` |
| **Google AI Studio (Gemini)** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.5-flash-lite`, `gemini-3.8-flash` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-reasoner` |
| **Ollama (Local)** | `http://localhost:11434/v1` | `qwen2.5:14b`, `llama3.1` |

### Option C: `cli` (Local CLI Agents)
1. Set **`Texel: Ai Provider`** to `cli`.
2. Set **`Texel: Cli Command`** to a local command that reads a prompt from stdin (for example `claude -p` or another local CLI tool).

---

## 🧠 Built-in & Custom Workspace Skills

### 6 Built-in Skills

Select regions on the PDF and click a skill button (you can also combine it with extra text in the instruction box):

| Skill | Best For | What It Does |
| :--- | :--- | :--- |
| **Grammar** | Copy-editing | Fixes grammar, spelling, punctuation, articles, and minor LaTeX syntax errors without rephrasing clean sentences |
| **Clarity** | Readability | Rewrites convoluted sentences into clear academic English while preserving meaning, terminology, and math |
| **Tighten** | Cutting length | Removes redundancy and filler (~25% shorter) without dropping results, equations, or citations |
| **Notation** | Math & consistency | Checks signs, indices, dimensions, and symbol/term consistency across the selected regions |
| **Address Comment** | Rebuttals & co-authors | Paste a reviewer/co-author comment in the instruction box; revises minimally and summarizes the response |
| **Build Warnings** | Compiler diagnostics | Automatically attaches warnings from the last compile (overfull boxes, undefined refs) and fixes them minimally |

### Custom Workspace Skills (`.texel/skills/*.md`)

Add project-specific skills by creating Markdown files in `<workspace>/.texel/skills/*.md`. The filename becomes the skill ID, a leading `# Title` becomes the button label, and the body becomes the prompt (using a built-in ID overrides that built-in skill):

```markdown
# Abstract Check
Keep this abstract under 150 words while keeping the problem statement, method, and quantitative results intact.
```

Save as `.texel/skills/abstract-check.md`, then click **`Compile PDF`** or reopen the panel to load it.

---

## ⚙️ Commands & Settings Reference

| Kind | Name | Description |
| :--- | :--- | :--- |
| **Command** | `Texel: Compile LaTeX & Open PDF Workspace` | Compile the active `.tex` file and open the PDF workspace |
| **Command** | `Texel: Open PDF Annotator & AI Workspace` | Open an existing PDF (compiles if missing) |
| **Command** | `Texel: Set API Key (Secure Storage)` | Store or remove your API key in VS Code `SecretStorage` |
| **Setting** | `texel.language` | Interface language: `auto` (default, follows VS Code), `en`, or `zh-CN` (also switchable live from the PDF toolbar) |
| **Setting** | `texel.aiProvider` | AI backend: `vscode-lm` (default), `openai-compatible`, or `cli` |
| **Setting** | `texel.apiBaseUrl` | Base URL for OpenAI-compatible APIs (**User/Machine scope only**) |
| **Setting** | `texel.model` | Model name or preferred `vscode-lm` family hint |
| **Setting** | `texel.cliCommand` | Local CLI command (default `claude -p`, **User/Machine scope only**) |
| **Setting** | `texel.texBinPath` | Directory containing TeX binaries (default `/Library/TeX/texbin`, **User/Machine scope only**) |

---

## 🔒 Security & Workspace Trust

Because LaTeX repositories can include executable `latexmkrc` files or workspace configs, Texel enforces three boundaries by default:
1. **Machine-scoped sensitive settings**: `texel.apiBaseUrl`, `texel.cliCommand`, and `texel.texBinPath` use `"scope": "machine"`, so a repository's `.vscode/settings.json` cannot hijack local commands, TeX binaries, or API endpoints.
2. **Untrusted Workspace protection**: In Restricted Mode, Texel only displays an existing PDF. Compiling LaTeX, running AI revisions, and loading custom prompts from `.texel/skills/*.md` all require a trusted workspace.
3. **Nonce-based Webview CSP**: Inline scripts are disallowed; all webview scripts load with a per-panel cryptographic nonce.

---

## 📂 Project Structure

```text
Texel/
├── src/
│   ├── extension.ts          # Extension entry, webview panel lifecycle, commands & trust checks
│   ├── ai.ts                 # Built-in/workspace skills, prompt building, response parsing & providers
│   ├── compiler.ts           # latexmk compilation, symlink temp workspace, latexdiff & safe edits
│   ├── synctex.ts            # SyncTeX mapping, LaTeX environment expansion & text-selection matching
│   ├── i18n.ts               # English / Simplified Chinese UI strings & locale resolution
│   ├── protocol.ts           # Typed discriminated-union messages between extension and webview
│   └── test/
│       ├── unit.test.ts      # Pure-function unit tests (no TeX required)
│       └── integration.test.ts # End-to-end latexmk + synctex + latexdiff integration test
├── media/
│   ├── icon.png              # 512×512 extension icon (vector source in icon.svg)
│   ├── texel-action-*.svg    # Adaptive light/dark editor title bar icons
│   ├── webview.js            # PDF rendering, Box/Text annotation tools, review UI & state
│   └── webview.css           # Webview theme styles and pdf.js text layer rules
├── examples/
│   └── sample.tex            # Demo paper for F5 debugging and integration tests
├── .github/workflows/
│   ├── ci.yml                # Automated unit & integration tests on main pushes / PRs
│   └── release.yml           # Tag-triggered tests, VSIX packaging & release publishing
├── THIRD-PARTY-NOTICES.md    # License notice for bundled pdf.js files
└── package.json              # Extension manifest, commands & configuration schema
```

---

## ❓ FAQ & Known Limitations

### 1. Compilation fails because `latexmk`, `synctex`, or `latexdiff` is not found
- **macOS**: Install MacTeX and verify `/Library/TeX/texbin` exists.
- **Windows / Linux**: `texel.texBinPath` defaults to the macOS path. Ensure your TeX `bin` directory is on `PATH`, or set `texel.texBinPath` in **User Settings**.

### 2. Annotations report `SyncTeX could not map page ...`
- Make sure a matching `.synctex.gz` file exists next to the PDF (compiled with `-synctex=1`). Clicking **`Compile PDF`** in Texel compiles with `-synctex=1` automatically.

### 3. `No VS Code Language Model found`
- The default `vscode-lm` provider requires a signed-in VS Code Language Model provider (such as GitHub Copilot). Otherwise switch `texel.aiProvider` to `openai-compatible` or `cli` as shown above.

### 4. Why does `Typeset Diff` sometimes show `Updated PDF` instead of red/blue diff markup?
- On unusual custom macros or complex tables, `latexdiff` output can fail to compile. Texel automatically falls back to showing the clean updated PDF so your workflow isn't blocked; you can still inspect exact source edits via **`View .tex Diff`**.

### 5. Known Limitations (v0.1.0)
- When a single revision modifies multiple `.tex` files, the typeset PDF diff currently previews the first edited file (other files still support **`View .tex Diff`** and apply normally).
- Applying accepted edits updates each modified file as a single document replace, so Undo (`Cmd+Z` / `Ctrl+Z`) reverts the batch in one step.

---

## 🧪 Development & Testing

```bash
npm install
npm test                  # Type check + unit tests (no TeX needed)
npm run test:integration  # Integration test (needs latexmk, synctex, latexdiff)
npx @vscode/vsce package  # Build a local .vsix package
```

Open this repository in VS Code and press **`F5`** to launch an Extension Development Host window.

---

## 📄 License

Released under the [MIT License](LICENSE). Third-party license notices for bundled `pdf.js` files are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
