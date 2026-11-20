// Messages between the extension and media/webview.js. Change this file first when adding one.
import type { AnnotatedRegion, ProposedEdit } from './ai';
import type { Locale, WebviewStrings } from './i18n';
import type { PdfBox } from './synctex';

export interface FeedbackItem {
  edit: ProposedEdit;
  comment: string;
}

/** Webview -> extension. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'compile' }
  | { type: 'setLanguage'; locale: Locale }
  | { type: 'jumpToSource'; page: number; x: number; y: number }
  | { type: 'resolveAnnotation'; box: PdfBox }
  | { type: 'runRevision'; annotations: AnnotatedRegion[]; instruction: string; skill?: string; color: string }
  | { type: 'reviseRound'; kept: ProposedEdit[]; items: FeedbackItem[]; instruction: string; color: string }
  | { type: 'openTexDiff'; edit: ProposedEdit }
  | { type: 'acceptEdits'; edits: ProposedEdit[]; annotationIds: string[] }
  | { type: 'rejectRevision' };

/** Extension -> webview. */
export type ExtensionMessage =
  | { type: 'locale'; locale: Locale; strings: WebviewStrings }
  | { type: 'skills'; skills: Array<{ id: string; label: string }> }
  | { type: 'pdfData'; originalBase64: string; diffBase64: null; mode: 'original' }
  | { type: 'annotationResolved'; boxId?: string; file: string; startLine: number; endLine: number; snippet: string }
  | { type: 'annotationError'; boxId?: string; error: string }
  | { type: 'revisionReady'; groupColor: string; edits: ProposedEdit[]; diffBase64: string; usedDiffFallback: boolean }
  | { type: 'clearedRevision'; removeAnnotationIds: string[] }
  | { type: 'status'; text: string; busy: boolean }
  | { type: 'error'; text: string };
