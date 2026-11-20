# Changelog

## [0.1.0] - 2026-11-20
- Initial public release of Texel: lightweight PDF-centric AI LaTeX workspace inside VS Code.
- Interactive `pdf.js` PDF viewer with **Box** and **Text** selection tools, color-grouped annotations, and double-click reverse SyncTeX jump.
- Automatic SyncTeX coordinate-to-LaTeX environment expansion and word-level printed-text line matching for text selections.
- Multi-backend AI revisions (`vscode-lm`, `openai-compatible` with `SecretStorage` API keys, and local `cli`) with 6 built-in skills (**Grammar**, **Clarity**, **Tighten**, **Notation**, **Address Comment**, **Build Warnings**) plus custom `.texel/skills/*.md`.
- Per-edit **Accept** / **Reject** review, inline feedback for multi-round AI revisions, and live-buffer snippet relocation before writing `.tex` edits.
- Isolated `latexdiff` + `latexmk` typeset diff preview (**Original**, **Typeset Diff**, **Side-by-Side**) and native `vscode.diff` source comparison.
- Machine-scoped execution/endpoint settings (`texel.apiBaseUrl`, `texel.cliCommand`, `texel.texBinPath`), Workspace Trust enforcement, nonce-based webview CSP, and `THIRD-PARTY-NOTICES.md` for `pdf.js`.
- Bilingual English / Simplified Chinese UI (`package.nls*.json`, `texel.language`, and live toolbar `中文 / EN` switch), plus custom extension and light/dark toolbar icons.
