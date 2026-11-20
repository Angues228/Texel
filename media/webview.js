// Message shapes live in src/protocol.ts.
/** @typedef {import('../src/protocol').WebviewMessage} WebviewMessage */
/** @typedef {import('../src/protocol').ExtensionMessage} ExtensionMessage */
(function () {
  const vscode = acquireVsCodeApi();
  /** @param {WebviewMessage} msg */
  const send = (msg) => vscode.postMessage(msg);

  const COLOR_HEX = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#22c55e',
    amber: '#f59e0b'
  };

  const state = {
    locale: document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en',
    i18n: null,
    originalBase64: null,
    diffBase64: null,
    viewMode: 'original', // 'original' | 'diff' | 'side-by-side'
    tool: 'box', // 'box' | 'text'
    scale: 1.25,
    activeColor: 'blue',
    skills: [],
    annotations: [], // { id, box, source, error }
    pendingRevision: null, // { groupColor, edits: [{...edit, decision, comment}], usedDiffFallback }
    pendingSelection: null, // { page, rects, text } awaiting "Mark selection"
    busy: false,
    statusText: '',
    statusIsDefault: true,
    errorText: ''
  };

  const els = {
    btnCompile: document.getElementById('btn-compile'),
    toolGroup: document.getElementById('tool-group'),
    toolBox: document.getElementById('tool-box'),
    toolText: document.getElementById('tool-text'),
    modeOriginal: document.getElementById('mode-original'),
    modeDiff: document.getElementById('mode-diff'),
    modeSideBySide: document.getElementById('mode-side'),
    zoomOut: document.getElementById('zoom-out'),
    zoomIn: document.getElementById('zoom-in'),
    zoomLabel: document.getElementById('zoom-label'),
    colorGroup: document.getElementById('color-group'),
    btnLang: document.getElementById('btn-lang'),
    statusPill: document.getElementById('status-pill'),
    pdfColumns: document.getElementById('pdf-columns'),
    aiSectionTitle: document.getElementById('ai-section-title'),
    annotationsTitle: document.getElementById('annotations-title'),
    annotationList: document.getElementById('annotation-list'),
    reviewSection: document.getElementById('review-section'),
    instructionInput: document.getElementById('instruction-input'),
    skillRow: document.getElementById('skill-row'),
    btnRunAi: document.getElementById('btn-run-ai'),
    btnClearBoxes: document.getElementById('btn-clear-boxes'),
    errorSlot: document.getElementById('error-slot'),
    markBtn: document.getElementById('mark-btn')
  };
  state.statusText = els.statusPill.textContent || '';

  function t(key, params) {
    const raw = (state.i18n && state.i18n[key]) || '';
    if (!params) {
      return raw;
    }
    return raw.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
  }

  function afterLabelText() {
    return state.pendingRevision && state.pendingRevision.usedDiffFallback
      ? t('colUpdatedPdf')
      : t('colTypesetDiff');
  }

  function columnLabelText(kind) {
    if (kind === 'before') return t('colBefore');
    if (kind === 'after') return t('colAfter', { label: afterLabelText() });
    if (kind === 'diff') return afterLabelText();
    return t('colCompiledPdf');
  }

  function applyLocale() {
    if (!state.i18n) {
      return;
    }
    document.documentElement.lang = state.locale;
    els.btnCompile.textContent = t('compileBtn');
    els.toolGroup.title = t('selectionToolTitle');
    els.toolBox.textContent = t('toolBox');
    els.toolBox.title = t('toolBoxTitle');
    els.toolText.textContent = t('toolText');
    els.toolText.title = t('toolTextTitle');
    els.modeOriginal.textContent = t('modeOriginal');
    els.modeDiff.textContent = t('modeDiff');
    els.modeSideBySide.textContent = t('modeSide');
    els.colorGroup.title = t('colorGroupTitle');
    const colorKeys = { red: 'colorRed', blue: 'colorBlue', green: 'colorGreen', amber: 'colorAmber' };
    document.querySelectorAll('.color-dot').forEach((btn) => {
      const k = colorKeys[btn.dataset.color];
      if (k) btn.title = t(k);
    });
    els.btnLang.textContent = t('langToggleLabel');
    els.btnLang.title = t('langToggleTitle');
    els.aiSectionTitle.textContent = t('aiSectionTitle');
    els.instructionInput.placeholder = t('instructionPlaceholder');
    els.btnRunAi.textContent = t('runAiBtn');
    els.btnClearBoxes.textContent = t('clearBtn');
    els.annotationsTitle.textContent = t('annotationsTitle');
    els.markBtn.textContent = t('markSelectionBtn');
    if (state.statusIsDefault) {
      state.statusText = t('statusReady');
    }
    if (!state.originalBase64) {
      const empty = els.pdfColumns.querySelector('.empty-hint');
      if (empty) empty.innerHTML = t('emptyPdfHint');
    }
    els.pdfColumns.querySelectorAll('.column-label[data-col-kind]').forEach((lbl) => {
      lbl.textContent = columnLabelText(lbl.dataset.colKind);
    });
    renderToolbar();
    renderSkills();
    renderSidebar();
  }

  function base64ToUint8Array(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const fileName = (p) => p.split(/[\\/]/).pop();
  const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  function setStatus(text, busy) {
    state.statusText = text;
    state.statusIsDefault = false;
    if (typeof busy === 'boolean') {
      state.busy = busy;
    }
    renderToolbar();
  }

  function renderToolbar() {
    els.modeOriginal.classList.toggle('active', state.viewMode === 'original');
    els.modeDiff.classList.toggle('active', state.viewMode === 'diff');
    els.modeSideBySide.classList.toggle('active', state.viewMode === 'side-by-side');
    els.toolBox.classList.toggle('active', state.tool === 'box');
    els.toolText.classList.toggle('active', state.tool === 'text');

    const hasDiff = Boolean(state.diffBase64);
    els.modeDiff.disabled = !hasDiff;
    els.modeSideBySide.disabled = !hasDiff;

    els.zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
    els.statusPill.textContent = state.statusText;
    els.btnCompile.disabled = state.busy;
    els.btnRunAi.disabled = state.busy;
    els.skillRow.querySelectorAll('button').forEach((b) => (b.disabled = state.busy));
    els.reviewSection.querySelectorAll('[data-busy-lock]').forEach((b) => (b.disabled = state.busy || b.dataset.empty === '1'));

    document.querySelectorAll('.color-dot').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.color === state.activeColor);
    });
    document.querySelectorAll('.overlay').forEach((o) => o.classList.toggle('passthrough', state.tool === 'text'));
  }

  function renderSkills() {
    els.skillRow.innerHTML = '';
    state.skills.forEach((skill) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = skill.label;
      btn.title = t('skillTooltip', { label: skill.label });
      btn.addEventListener('click', () => triggerAiRevision(skill.id));
      els.skillRow.appendChild(btn);
    });
  }

  function renderError() {
    els.errorSlot.innerHTML = state.errorText
      ? `<div class="error-banner">${escapeHtml(state.errorText)}</div>`
      : '';
  }

  const pdfCache = new Map();
  let renderSeq = 0;

  function loadPdfDocument(base64) {
    for (const [key, docPromise] of pdfCache) {
      if (key !== state.originalBase64 && key !== state.diffBase64) {
        pdfCache.delete(key);
        docPromise.then((doc) => doc.destroy()).catch(() => {});
      }
    }
    let cached = pdfCache.get(base64);
    if (!cached) {
      cached = window.pdfjsLib.getDocument({ data: base64ToUint8Array(base64) }).promise;
      pdfCache.set(base64, cached);
    }
    return cached;
  }

  function placeRect(el, r) {
    el.style.left = `${r.x * state.scale}px`;
    el.style.top = `${r.y * state.scale}px`;
    el.style.width = `${r.width * state.scale}px`;
    el.style.height = `${r.height * state.scale}px`;
  }

  function renderPageBoxes(overlay, pageNum) {
    overlay.querySelectorAll('.box-rect').forEach((n) => n.remove());
    state.annotations.forEach((ann, index) => {
      if (ann.box.page !== pageNum) {
        return;
      }
      const isText = Boolean(ann.box.rects && ann.box.rects.length);
      const rects = isText ? ann.box.rects : [ann.box];
      rects.forEach((r, i) => {
        const el = document.createElement('div');
        el.className = `box-rect color-${ann.box.color}${isText ? ' text-mark' : ''}`;
        placeRect(el, r);
        if (i === 0) {
          const badge = document.createElement('span');
          badge.className = 'box-badge';
          badge.style.background = COLOR_HEX[ann.box.color] || COLOR_HEX.blue;
          badge.textContent = ann.source ? `#${index + 1} L${ann.source.startLine}-${ann.source.endLine}` : `#${index + 1}`;
          el.appendChild(badge);
        }
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          send({
            type: 'jumpToSource',
            page: ann.box.page,
            x: r.x + r.width * 0.5,
            y: r.y + r.height * 0.5
          });
        });
        overlay.appendChild(el);
      });
    });
  }

  function addAnnotation(box) {
    state.annotations.push({ id: box.id, box, source: null, error: null });
    refreshAllOverlays();
    renderSidebar();
    send({ type: 'resolveAnnotation', box });
  }

  function attachPageHandlers(wrapper, overlay, pageNum) {
    wrapper.addEventListener('dblclick', (ev) => {
      if (ev.target instanceof Element && ev.target.closest('.box-rect')) {
        return;
      }
      const rect = wrapper.getBoundingClientRect();
      send({
        type: 'jumpToSource',
        page: pageNum,
        x: (ev.clientX - rect.left) / state.scale,
        y: (ev.clientY - rect.top) / state.scale
      });
    });

    let dragStart = null;
    let draftEl = null;

    overlay.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0 || ev.target !== overlay || state.tool !== 'box') {
        return;
      }
      const rect = overlay.getBoundingClientRect();
      dragStart = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      window.addEventListener('mouseup', finishDrag, { once: true });
    });

    overlay.addEventListener('mousemove', (ev) => {
      if (!dragStart) {
        return;
      }
      const rect = overlay.getBoundingClientRect();
      const curX = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
      const curY = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
      if (!draftEl) {
        if (Math.abs(curX - dragStart.x) < 4 && Math.abs(curY - dragStart.y) < 4) {
          return;
        }
        // Defer creating the preview box and disable pointer events so clicks/dblclicks stay on overlay.
        draftEl = document.createElement('div');
        draftEl.className = `box-rect color-${state.activeColor}`;
        draftEl.style.pointerEvents = 'none';
        overlay.appendChild(draftEl);
      }
      draftEl.style.left = `${Math.min(dragStart.x, curX)}px`;
      draftEl.style.top = `${Math.min(dragStart.y, curY)}px`;
      draftEl.style.width = `${Math.abs(curX - dragStart.x)}px`;
      draftEl.style.height = `${Math.abs(curY - dragStart.y)}px`;
    });

    function finishDrag() {
      if (!dragStart) {
        return;
      }
      dragStart = null;
      if (!draftEl) {
        return;
      }
      const left = parseFloat(draftEl.style.left);
      const top = parseFloat(draftEl.style.top);
      const width = parseFloat(draftEl.style.width) || 0;
      const height = parseFloat(draftEl.style.height) || 0;
      draftEl.remove();
      draftEl = null;
      if (width < 8 || height < 8) {
        return;
      }
      addAnnotation({
        id: newId(),
        page: pageNum,
        x: left / state.scale,
        y: top / state.scale,
        width: width / state.scale,
        height: height / state.scale,
        color: state.activeColor,
        note: ''
      });
    }
  }

  // Text tool: after a selection inside one page's text layer, offer "+ Mark selection".
  document.addEventListener('mouseup', (ev) => {
    if (state.tool !== 'text' || ev.target === els.markBtn) {
      return;
    }
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().replace(/\s+/g, ' ').trim() : '';
      const anchor = sel && sel.anchorNode;
      const anchorEl = anchor instanceof Element ? anchor : anchor && anchor.parentElement;
      const wrapper = anchorEl ? anchorEl.closest('.page-wrapper[data-interactive="1"]') : null;
      if (!text || text.length < 2 || !wrapper || !sel || sel.rangeCount === 0) {
        state.pendingSelection = null;
        els.markBtn.style.display = 'none';
        return;
      }
      const base = wrapper.getBoundingClientRect();
      const rects = [...sel.getRangeAt(0).getClientRects()]
        .filter((r) => r.width > 1 && r.height > 1 && r.top >= base.top - 1 && r.bottom <= base.bottom + 1)
        .map((r) => ({
          x: (r.left - base.left) / state.scale,
          y: (r.top - base.top) / state.scale,
          width: r.width / state.scale,
          height: r.height / state.scale
        }));
      if (rects.length === 0) {
        return;
      }
      state.pendingSelection = { page: Number(wrapper.dataset.page), rects: mergeLineRects(rects), text };
      const last = sel.getRangeAt(0).getBoundingClientRect();
      els.markBtn.style.left = `${Math.max(8, Math.min(window.innerWidth - 150, last.right + 6))}px`;
      els.markBtn.style.top = `${Math.min(window.innerHeight - 36, Math.max(8, last.bottom + 6))}px`;
      els.markBtn.style.display = 'block';
    }, 0);
  });

  // The text layer yields one rect per span; join those on the same printed line.
  function mergeLineRects(rects) {
    const lines = [];
    rects
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((r) => {
        const line = lines.find((l) => Math.abs(l.y + l.height / 2 - (r.y + r.height / 2)) < Math.min(l.height, r.height) / 2);
        if (!line) {
          lines.push({ ...r });
          return;
        }
        const right = Math.max(line.x + line.width, r.x + r.width);
        const bottom = Math.max(line.y + line.height, r.y + r.height);
        line.x = Math.min(line.x, r.x);
        line.y = Math.min(line.y, r.y);
        line.width = right - line.x;
        line.height = bottom - line.y;
      });
    return lines;
  }

  els.markBtn.addEventListener('click', () => {
    const pending = state.pendingSelection;
    els.markBtn.style.display = 'none';
    state.pendingSelection = null;
    if (!pending) {
      return;
    }
    const xs = pending.rects.map((r) => r.x);
    const ys = pending.rects.map((r) => r.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    addAnnotation({
      id: newId(),
      page: pending.page,
      x,
      y,
      width: Math.max(...pending.rects.map((r) => r.x + r.width)) - x,
      height: Math.max(...pending.rects.map((r) => r.y + r.height)) - y,
      rects: pending.rects,
      text: pending.text,
      color: state.activeColor,
      note: ''
    });
    window.getSelection().removeAllRanges();
  });

  async function renderPdfColumn(base64, colKind, interactive, col, seq) {
    if (colKind) {
      const lbl = document.createElement('div');
      lbl.className = 'column-label';
      lbl.dataset.colKind = colKind;
      lbl.textContent = columnLabelText(colKind);
      col.appendChild(lbl);
    }

    const pdf = await loadPdfDocument(base64);
    if (seq !== renderSeq) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (seq !== renderSeq) {
        return;
      }
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: state.scale });

      const wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      wrapper.dataset.page = String(pageNum);
      wrapper.dataset.interactive = interactive ? '1' : '0';
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (seq !== renderSeq) {
        return;
      }
      wrapper.appendChild(canvas);
      col.appendChild(wrapper);

      if (!interactive) {
        continue;
      }

      const textLayer = document.createElement('div');
      textLayer.className = 'textLayer';
      textLayer.style.setProperty('--scale-factor', String(viewport.scale));
      wrapper.appendChild(textLayer);
      page
        .getTextContent()
        .then((textContentSource) => {
          if (seq === renderSeq) {
            return window.pdfjsLib.renderTextLayer({ textContentSource, container: textLayer, viewport }).promise;
          }
        })
        .catch(() => {});

      const overlay = document.createElement('div');
      overlay.className = `overlay${state.tool === 'text' ? ' passthrough' : ''}`;
      overlay.dataset.page = String(pageNum);
      wrapper.appendChild(overlay);
      renderPageBoxes(overlay, pageNum);
      attachPageHandlers(wrapper, overlay, pageNum);
    }
  }

  async function renderPdfPane() {
    const seq = ++renderSeq;
    els.pdfColumns.innerHTML = '';
    els.markBtn.style.display = 'none';
    if (!state.originalBase64) {
      els.pdfColumns.innerHTML = `<div class="empty-hint">${t('emptyPdfHint')}</div>`;
      return;
    }

    try {
      if (state.viewMode === 'side-by-side' && state.diffBase64) {
        const beforeCol = document.createElement('div');
        const afterCol = document.createElement('div');
        beforeCol.className = 'pdf-column';
        afterCol.className = 'pdf-column';
        els.pdfColumns.append(beforeCol, afterCol);
        await Promise.all([
          renderPdfColumn(state.originalBase64, 'before', true, beforeCol, seq),
          renderPdfColumn(state.diffBase64, 'after', false, afterCol, seq)
        ]);
      } else {
        const col = document.createElement('div');
        col.className = 'pdf-column';
        els.pdfColumns.appendChild(col);
        if (state.viewMode === 'diff' && state.diffBase64) {
          await renderPdfColumn(state.diffBase64, 'diff', false, col, seq);
        } else {
          await renderPdfColumn(state.originalBase64, 'compiled', true, col, seq);
        }
      }
    } catch (err) {
      if (seq === renderSeq) {
        state.errorText = t('renderError', { error: err && err.message ? err.message : String(err) });
        renderError();
      }
    }
  }

  function renderAnnotations() {
    if (!state.i18n) {
      return;
    }
    if (state.annotations.length === 0) {
      els.annotationList.innerHTML = `<div class="empty-hint">${t('emptyAnnotationsHint')}</div>`;
      return;
    }
    els.annotationList.innerHTML = '';
    state.annotations.forEach((ann, index) => {
      const card = document.createElement('div');
      card.className = 'card';
      const locLabel = ann.source
        ? `${fileName(ann.source.file)}:${ann.source.startLine}-${ann.source.endLine}`
        : ann.error
        ? t('synctexFailed')
        : t('synctexMapping');

      const header = document.createElement('div');
      header.className = 'card-header';
      header.innerHTML = `
        <span class="tag">
          <span class="tag-swatch" style="background:${COLOR_HEX[ann.box.color] || COLOR_HEX.blue}"></span>
          #${index + 1} · p.${ann.box.page} · ${escapeHtml(locLabel)}
        </span>
        <button type="button">${escapeHtml(t('removeBtn'))}</button>
      `;
      header.querySelector('button').addEventListener('click', () => {
        state.annotations = state.annotations.filter((a) => a.id !== ann.id);
        refreshAllOverlays();
        renderSidebar();
      });
      card.appendChild(header);

      if (ann.box.text) {
        const quote = document.createElement('div');
        quote.className = 'quote';
        quote.textContent = `“${ann.box.text}”`;
        card.appendChild(quote);
      }

      if (ann.error) {
        const errDiv = document.createElement('div');
        errDiv.className = 'error-banner';
        errDiv.textContent = ann.error;
        card.appendChild(errDiv);
      } else if (ann.source) {
        const pre = document.createElement('pre');
        pre.className = 'snippet-preview';
        pre.textContent = ann.source.snippet;
        card.appendChild(pre);

        const noteInput = document.createElement('input');
        noteInput.type = 'text';
        noteInput.placeholder = t('notePlaceholder');
        noteInput.value = ann.box.note || '';
        noteInput.addEventListener('input', (e) => {
          ann.box.note = e.target.value;
        });
        card.appendChild(noteInput);
      }
      els.annotationList.appendChild(card);
    });
  }

  function renderReview() {
    const rev = state.pendingRevision;
    if (!rev) {
      els.reviewSection.style.display = 'none';
      els.reviewSection.innerHTML = '';
      return;
    }
    els.reviewSection.style.display = 'block';
    els.reviewSection.innerHTML = `<div class="sidebar-title">${escapeHtml(t('proposedEditsTitle', { count: rev.edits.length }))}</div>`;

    rev.edits.forEach((edit) => {
      const card = document.createElement('div');
      card.className = `card decision-${edit.decision || 'pending'}`;
      card.innerHTML = `
        <div class="card-header">
          <b>${escapeHtml(fileName(edit.file))} L${edit.startLine}-${edit.endLine}</b>
          <button type="button" data-act="texdiff">${escapeHtml(t('viewTexDiffBtn'))}</button>
        </div>
        <div class="explanation">${escapeHtml(edit.explanation)}</div>
        <pre class="snippet-preview">${escapeHtml(edit.proposedSnippet)}</pre>
        <div class="action-row decision-row">
          <button type="button" data-act="accept" class="${edit.decision === 'accept' ? 'active' : ''}">${escapeHtml(t('acceptBtn'))}</button>
          <button type="button" data-act="reject" class="${edit.decision === 'reject' ? 'active' : ''}">${escapeHtml(t('rejectBtn'))}</button>
        </div>
        <input type="text" data-act="comment" placeholder="${escapeHtml(t('feedbackPlaceholder'))}" value="${escapeHtml(edit.comment || '')}" />
      `;
      card.querySelector('[data-act="texdiff"]').addEventListener('click', () => {
        send({ type: 'openTexDiff', edit: stripUi(edit) });
      });
      ['accept', 'reject'].forEach((d) =>
        card.querySelector(`[data-act="${d}"]`).addEventListener('click', () => {
          edit.decision = edit.decision === d ? undefined : d;
          renderReview();
        })
      );
      card.querySelector('[data-act="comment"]').addEventListener('input', (e) => {
        edit.comment = e.target.value;
        updateReviewButtons();
      });
      els.reviewSection.appendChild(card);
    });

    const actions = document.createElement('div');
    actions.className = 'review-actions';
    actions.innerHTML = `
      <div class="action-row">
        <button type="button" data-act="accept-all">${escapeHtml(t('acceptAllBtn'))}</button>
        <button type="button" data-act="apply" class="primary" data-busy-lock style="flex:1"></button>
      </div>
      <div class="action-row">
        <button type="button" data-act="revise" data-busy-lock style="flex:1"></button>
        <button type="button" data-act="discard" class="danger">${escapeHtml(t('discardBtn'))}</button>
      </div>
    `;
    els.reviewSection.appendChild(actions);

    actions.querySelector('[data-act="accept-all"]').addEventListener('click', () => {
      rev.edits.forEach((e) => (e.decision = 'accept'));
      renderReview();
    });
    actions.querySelector('[data-act="apply"]').addEventListener('click', () => {
      const accepted = rev.edits.filter((e) => e.decision === 'accept').map(stripUi);
      if (accepted.length === 0) return;
      send({
        type: 'acceptEdits',
        edits: accepted,
        annotationIds: state.annotations.filter((a) => a.box.color === rev.groupColor).map((a) => a.id)
      });
    });
    actions.querySelector('[data-act="revise"]').addEventListener('click', () => {
      const items = feedbackItems();
      if (items.length === 0) return;
      send({
        type: 'reviseRound',
        kept: rev.edits.filter((e) => e.decision === 'accept').map(stripUi),
        items,
        instruction: els.instructionInput.value.trim(),
        color: rev.groupColor
      });
    });
    actions.querySelector('[data-act="discard"]').addEventListener('click', () => {
      clearRevision();
      send({ type: 'rejectRevision' });
      renderPdfPane();
    });
    updateReviewButtons();
  }

  // Edits the author commented on and did not accept go back to the AI.
  function feedbackItems() {
    return state.pendingRevision.edits
      .filter((e) => e.decision !== 'accept' && (e.comment || '').trim())
      .map((e) => ({ edit: stripUi(e), comment: e.comment.trim() }));
  }

  function updateReviewButtons() {
    const rev = state.pendingRevision;
    if (!rev) return;
    const accepted = rev.edits.filter((e) => e.decision === 'accept').length;
    const feedback = feedbackItems().length;
    const apply = els.reviewSection.querySelector('[data-act="apply"]');
    const revise = els.reviewSection.querySelector('[data-act="revise"]');
    apply.textContent = t('applyAcceptedBtn', { count: accepted });
    apply.dataset.empty = accepted ? '0' : '1';
    revise.textContent = t('reviseFeedbackBtn', { count: feedback });
    revise.dataset.empty = feedback ? '0' : '1';
    renderToolbar();
  }

  function stripUi(edit) {
    const { comment, ...rest } = edit;
    return rest;
  }

  function clearRevision() {
    state.pendingRevision = null;
    state.diffBase64 = null;
    state.viewMode = 'original';
    renderToolbar();
    renderSidebar();
  }

  function renderSidebar() {
    renderAnnotations();
    renderReview();
  }

  function refreshAllOverlays() {
    document.querySelectorAll('.overlay').forEach((overlay) => {
      renderPageBoxes(overlay, parseInt(overlay.dataset.page || '1', 10));
    });
  }

  function triggerAiRevision(skill) {
    state.errorText = '';
    renderError();

    // Marks of the active color group, or every resolved mark if that group is empty.
    const resolved = state.annotations.filter((a) => Boolean(a.source));
    const colorMatched = resolved.filter((a) => a.box.color === state.activeColor);
    const selected = colorMatched.length > 0 ? colorMatched : resolved;

    if (selected.length === 0) {
      state.errorText = t('needRegionError');
      renderError();
      return;
    }

    const instruction = els.instructionInput.value.trim();
    if (!skill && !instruction) {
      state.errorText = t('needInstructionError');
      renderError();
      return;
    }

    send({
      type: 'runRevision',
      annotations: selected.map((a) => ({ box: a.box, source: a.source })),
      instruction,
      skill,
      color: selected[0].box.color
    });
  }

  // Wire toolbar controls
  els.btnCompile.addEventListener('click', () => {
    state.errorText = '';
    renderError();
    send({ type: 'compile' });
  });

  [
    [els.toolBox, 'box'],
    [els.toolText, 'text']
  ].forEach(([btn, tool]) =>
    btn.addEventListener('click', () => {
      state.tool = tool;
      els.markBtn.style.display = 'none';
      renderToolbar();
    })
  );

  [
    [els.modeOriginal, 'original'],
    [els.modeDiff, 'diff'],
    [els.modeSideBySide, 'side-by-side']
  ].forEach(([btn, mode]) =>
    btn.addEventListener('click', () => {
      if (mode !== 'original' && !state.diffBase64) return;
      state.viewMode = mode;
      renderToolbar();
      renderPdfPane();
    })
  );

  els.zoomOut.addEventListener('click', () => {
    state.scale = Math.max(0.6, +(state.scale - 0.15).toFixed(2));
    renderToolbar();
    renderPdfPane();
  });

  els.zoomIn.addEventListener('click', () => {
    state.scale = Math.min(2.5, +(state.scale + 0.15).toFixed(2));
    renderToolbar();
    renderPdfPane();
  });

  document.querySelectorAll('.color-dot').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeColor = btn.dataset.color;
      renderToolbar();
    });
  });

  els.btnLang.addEventListener('click', () => {
    send({ type: 'setLanguage', locale: state.locale === 'zh-CN' ? 'en' : 'zh-CN' });
  });

  els.btnRunAi.addEventListener('click', () => triggerAiRevision());

  els.btnClearBoxes.addEventListener('click', () => {
    state.annotations = [];
    refreshAllOverlays();
    renderSidebar();
  });

  window.addEventListener('message', (event) => {
    /** @type {ExtensionMessage} */
    const msg = event.data;
    switch (msg.type) {
      case 'locale':
        state.locale = msg.locale;
        state.i18n = msg.strings;
        applyLocale();
        break;
      case 'skills':
        state.skills = msg.skills || [];
        renderSkills();
        renderToolbar();
        break;
      case 'pdfData':
        state.originalBase64 = msg.originalBase64;
        if (msg.diffBase64 !== undefined) state.diffBase64 = msg.diffBase64;
        if (msg.mode) state.viewMode = msg.mode;
        renderToolbar();
        renderPdfPane();
        renderSidebar();
        break;
      case 'annotationResolved': {
        const item = state.annotations.find((a) => a.id === msg.boxId);
        if (item) {
          item.source = { file: msg.file, startLine: msg.startLine, endLine: msg.endLine, snippet: msg.snippet };
          item.error = null;
          refreshAllOverlays();
          renderSidebar();
        }
        break;
      }
      case 'annotationError': {
        const item = state.annotations.find((a) => a.id === msg.boxId);
        if (item) {
          item.error = msg.error;
          renderSidebar();
        }
        break;
      }
      case 'revisionReady':
        state.pendingRevision = {
          groupColor: msg.groupColor,
          edits: msg.edits.map((e) => ({ ...e, comment: '' })),
          usedDiffFallback: Boolean(msg.usedDiffFallback)
        };
        state.diffBase64 = msg.diffBase64;
        state.viewMode = 'side-by-side';
        renderToolbar();
        renderSidebar();
        renderPdfPane();
        break;
      case 'clearedRevision':
        if (Array.isArray(msg.removeAnnotationIds)) {
          const drop = new Set(msg.removeAnnotationIds);
          state.annotations = state.annotations.filter((a) => !drop.has(a.id));
        }
        clearRevision();
        refreshAllOverlays();
        break;
      case 'status':
        setStatus(msg.text, msg.busy);
        break;
      case 'error':
        state.errorText = msg.text;
        state.busy = false;
        renderToolbar();
        renderError();
        break;
    }
  });

  renderToolbar();
  renderSidebar();
  send({ type: 'ready' });
})();
