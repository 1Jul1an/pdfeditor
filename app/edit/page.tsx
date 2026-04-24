"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

type PageItem = {
  id: string;
  originalIndex: number;
};

type WorkState = "idle" | "reading" | "ready" | "saving" | "done" | "error";
type PreviewState = "idle" | "loading" | "ready" | "error";

type PdfViewport = {
  width: number;
  height: number;
};

type PdfRenderTask = {
  promise: Promise<void>;
  cancel: () => void;
};

type PdfPageProxy = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => PdfRenderTask;
  cleanup?: () => void;
};

type PdfDocumentProxy = {
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy?: () => Promise<void> | void;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocumentProxy>;
  destroy?: () => void;
};

type PdfJsModule = {
  getDocument: (params: { data: Uint8Array; disableWorker?: boolean }) => PdfLoadingTask;
};

function moveItem(items: PageItem[], fromIndex: number, toIndex: number): PageItem[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function createEditedDownloadName(fileName: string): string {
  const baseName = fileName.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "-");
  return `${baseName || "edited"}-edited.pdf`;
}

function createPageItems(pageCount: number): PageItem[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    id: `page-${index + 1}`,
    originalIndex: index
  }));
}

function PagePreview({
  documentProxy,
  pageNumber,
  fallbackUrl
}: {
  documentProxy: PdfDocumentProxy | null;
  pageNumber: number;
  fallbackUrl: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");

  useEffect(() => {
    if (!documentProxy) {
      setPreviewState("idle");
      return;
    }

    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;
    let renderFinished = false;

    async function renderPreview() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setPreviewState("loading");

      try {
        const page = await documentProxy.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 132;
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");

        if (!context) throw new Error("Canvas is not available.");

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        renderFinished = true;

        page.cleanup?.();
        if (!cancelled) setPreviewState("ready");
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!cancelled && !message.toLowerCase().includes("cancelled")) {
          setPreviewState("error");
        }
      }
    }

    void renderPreview();

    return () => {
      cancelled = true;
      if (renderTask && !renderFinished) renderTask.cancel();
    };
  }, [documentProxy, pageNumber]);

  const showBrowserFallback = (!documentProxy || previewState === "error") && Boolean(fallbackUrl);

  return (
    <div className={`page-preview ${showBrowserFallback ? "ready" : previewState}`}>
      {showBrowserFallback ? (
        <iframe
          className="page-preview-frame"
          title={`Preview of page ${pageNumber}`}
          src={`${fallbackUrl}#page=${pageNumber}&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
        />
      ) : (
        <canvas ref={canvasRef} aria-label={`Preview of page ${pageNumber}`} />
      )}
      {previewState === "loading" && !showBrowserFallback && <span>Rendering</span>}
      {previewState === "idle" && !showBrowserFallback && <span>Preview</span>}
      {previewState === "error" && !showBrowserFallback && <span>Unavailable</span>}
    </div>
  );
}

export default function EditPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [status, setStatus] = useState<WorkState>("idle");
  const [previewStatus, setPreviewStatus] = useState<PreviewState>("idle");
  const [fileName, setFileName] = useState("");
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [previewDocument, setPreviewDocument] = useState<PdfDocumentProxy | null>(null);
  const [previewFileUrl, setPreviewFileUrl] = useState("");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [originalPageCount, setOriginalPageCount] = useState(0);
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("edited.pdf");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const deletedPages = useMemo(() => Math.max(originalPageCount - pages.length, 0), [originalPageCount, pages.length]);
  const canExport = Boolean(pdfBytes) && pages.length > 0 && status !== "reading" && status !== "saving";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (!pdfBytes) {
      setPreviewFileUrl("");
      return;
    }

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    setPreviewFileUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pdfBytes]);

  useEffect(() => {
    if (!pdfBytes) {
      setPreviewDocument(null);
      setPreviewStatus("idle");
      return;
    }

    let cancelled = false;
    let loadedDocument: PdfDocumentProxy | null = null;
    let loadingTask: PdfLoadingTask | null = null;

    async function loadPreviewDocument() {
      setPreviewStatus("loading");

      try {
        const pdfjs = (await import("pdfjs-dist")) as any;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
        loadedDocument = await loadingTask.promise;

        if (cancelled) {
          await loadedDocument.destroy?.();
          return;
        }

        setPreviewDocument(loadedDocument);
        setPreviewStatus("ready");
      } catch (err) {
        console.error("PDF preview loading failed", err);
        if (!cancelled) {
          setPreviewDocument(null);
          setPreviewStatus("error");
        }
      }
    }

    void loadPreviewDocument();

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
      void loadedDocument?.destroy?.();
    };
  }, [pdfBytes]);

  function resetResult() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl("");
    setDownloadName("edited.pdf");
  }

  async function handlePdfFile(file: File) {
    resetResult();
    setStatus("reading");
    setPreviewStatus("idle");
    setFileName(file.name);
    setPdfBytes(null);
    setPreviewDocument(null);
    setPages([]);
    setOriginalPageCount(0);
    setError("");

    try {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Please select a PDF file.");
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = pdf.getPageCount();

      if (pageCount === 0) {
        throw new Error("The selected PDF does not contain any pages.");
      }

      setPdfBytes(bytes);
      setOriginalPageCount(pageCount);
      setPages(createPageItems(pageCount));
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setPreviewStatus("idle");
      setError(err instanceof Error ? err.message : "The PDF could not be processed.");
    }
  }

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await handlePdfFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (file) void handlePdfFile(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function removePage(id: string) {
    resetResult();
    setPages((current) => current.filter((page) => page.id !== id));
    setStatus("ready");
  }

  function resetPages() {
    resetResult();
    setPages(createPageItems(originalPageCount));
    setStatus(originalPageCount > 0 ? "ready" : "idle");
  }

  function moveUp(index: number) {
    if (index === 0) return;
    resetResult();
    setPages((current) => moveItem(current, index, index - 1));
    setStatus("ready");
  }

  function moveDown(index: number) {
    if (index === pages.length - 1) return;
    resetResult();
    setPages((current) => moveItem(current, index, index + 1));
    setStatus("ready");
  }

  function handleRowDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;

    resetResult();
    setPages((current) => {
      const fromIndex = current.findIndex((page) => page.id === draggedId);
      const toIndex = current.findIndex((page) => page.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      return moveItem(current, fromIndex, toIndex);
    });
    setStatus("ready");
    setDraggedId(null);
  }

  async function exportPdf() {
    if (!pdfBytes || pages.length === 0) return;

    resetResult();
    setStatus("saving");
    setError("");

    try {
      const source = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const edited = await PDFDocument.create();
      edited.setTitle("Edited PDF");
      edited.setCreator("PDF Editor");
      edited.setProducer("pdf-lib");
      edited.setCreationDate(new Date());
      edited.setModificationDate(new Date());

      const copiedPages = await edited.copyPages(
        source,
        pages.map((page) => page.originalIndex)
      );
      copiedPages.forEach((page) => edited.addPage(page));

      const editedBytes = await edited.save();
      const editedBuffer = editedBytes.buffer.slice(
        editedBytes.byteOffset,
        editedBytes.byteOffset + editedBytes.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([editedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      setDownloadUrl(url);
      setDownloadName(createEditedDownloadName(fileName));
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "The edited PDF could not be exported.");
    }
  }

  return (
    <main className="app-shell">
      <section className="page-workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Client-side Edit · NextJS · TSX</p>
            <h1>Edit PDFs</h1>
          </div>
          <p>Upload one PDF, preview its pages, delete individual pages, reorder the remaining pages, and export the edited file.</p>
        </header>

        <div className="workspace-grid">
          <section className="control-column" aria-label="File and output controls">
            <Link className="back-link" href="/">
              Back to home
            </Link>

            <section id="upload" className="panel upload-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <h2>PDF File</h2>
                  <p>Select one PDF to edit its page order.</p>
                </div>
              </div>

              <div className="dropzone" onDrop={handleDrop} onDragOver={handleDragOver}>
                <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={handleInputChange} hidden />
                <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>
                  Select PDF
                </button>
                <span>or drag file here</span>
              </div>

              {fileName && (
                <div className="file-pill" aria-live="polite">
                  <span>{fileName}</span>
                  <small>{status === "reading" ? "Analyzing..." : previewStatus === "loading" ? "Rendering previews..." : "Analyzed"}</small>
                </div>
              )}
            </section>

            {error && (
              <section className="alert" role="alert">
                {error}
              </section>
            )}

            {previewStatus === "error" && (
              <section className="alert soft-alert" role="status">
                Page previews are unavailable, but editing and export still work.
              </section>
            )}

            <section className="stats-grid" aria-label="Edit overview">
              <article>
                <span>{originalPageCount}</span>
                <p>Original pages</p>
              </article>
              <article>
                <span>{pages.length}</span>
                <p>Pages kept</p>
              </article>
              <article>
                <span>{deletedPages}</span>
                <p>Pages deleted</p>
              </article>
              <article>
                <span>{downloadUrl ? 1 : 0}</span>
                <p>Exports ready</p>
              </article>
            </section>

            <section id="download" className="panel download-panel">
              <div>
                <h2>Export</h2>
                <p>The edited PDF is generated locally in your browser.</p>
              </div>
              <div className="download-actions">
                <button className="primary-button" type="button" onClick={exportPdf} disabled={!hasMounted || !canExport}>
                  {status === "saving" ? "Building PDF..." : "Export PDF"}
                </button>
                {downloadUrl && (
                  <a className="download-link" href={downloadUrl} download={downloadName}>
                    Download PDF
                  </a>
                )}
              </div>
            </section>
          </section>

          <section id="pages" className="panel order-panel page-editor-panel">
            <div className="panel-heading order-heading">
              <div>
                <h2>Edit pages</h2>
                <p>Drag pages into a new order, use the arrow buttons, or remove pages from the output.</p>
              </div>
              <button className="ghost-button" type="button" onClick={resetPages} disabled={!hasMounted || originalPageCount === 0}>
                Reset pages
              </button>
            </div>

            {pages.length === 0 ? (
              <div className="empty-state">
                <strong>No pages loaded yet.</strong>
                <span>Select a PDF to start editing its pages.</span>
              </div>
            ) : (
              <ol className="pdf-list page-list preview-page-list">
                {pages.map((page, index) => (
                  <li
                    key={page.id}
                    draggable
                    onDragStart={() => setDraggedId(page.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleRowDrop(page.id)}
                    className={draggedId === page.id ? "dragging" : ""}
                  >
                    <div className="rank">{String(index + 1).padStart(2, "0")}</div>
                    <PagePreview documentProxy={previewDocument} pageNumber={page.originalIndex + 1} fallbackUrl={previewFileUrl || null} />
                    <div className="pdf-meta">
                      <strong>Page {page.originalIndex + 1}</strong>
                      <span>Original position {page.originalIndex + 1}</span>
                    </div>
                    <div className="page-count">Output page {index + 1}</div>
                    <div className="row-actions page-actions" aria-label={`Change page ${page.originalIndex + 1}`}>
                      <button type="button" onClick={() => moveUp(index)} disabled={index === 0} aria-label="Move up">
                        ↑
                      </button>
                      <button type="button" onClick={() => moveDown(index)} disabled={index === pages.length - 1} aria-label="Move down">
                        ↓
                      </button>
                      <button type="button" onClick={() => removePage(page.id)} disabled={pages.length === 1} aria-label="Delete page">
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
