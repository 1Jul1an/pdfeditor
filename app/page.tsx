"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";

type PdfItem = {
  id: string;
  name: string;
  path: string;
  bytes: Uint8Array;
  pageCount: number;
  creationDate: Date | null;
};

type IgnoredItem = {
  path: string;
  reason: string;
};

type WorkState = "idle" | "reading" | "ready" | "merging" | "done" | "error";

type ZipPdfEntry = {
  name: string;
  async: (type: "uint8array") => Promise<Uint8Array>;
};

const MAX_VISIBLE_IGNORED = 10;

function formatDate(date: Date | null): string {
  if (!date) return "No creation date found";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function sortByCreationDate(items: PdfItem[]): PdfItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.creationDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = b.creationDate?.getTime() ?? Number.POSITIVE_INFINITY;

    if (aTime !== bTime) return aTime - bTime;
    return a.path.localeCompare(b.path, "en");
  });
}

function moveItem(items: PdfItem[], fromIndex: number, toIndex: number): PdfItem[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function createSafeDownloadName(zipName: string): string {
  const baseName = zipName.replace(/\.zip$/i, "").replace(/[^a-z0-9_-]+/gi, "-");
  return `${baseName || "merged"}-merged.pdf`;
}

async function readPdfEntry(entry: ZipPdfEntry, index: number): Promise<PdfItem> {
  const bytes = await entry.async("uint8array");
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const creationDate = pdf.getCreationDate() ?? null;

  return {
    id: `${index}-${entry.name}`,
    name: entry.name.split("/").pop() || entry.name,
    path: entry.name,
    bytes,
    pageCount: pdf.getPageCount(),
    creationDate
  };
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [status, setStatus] = useState<WorkState>("idle");
  const [zipName, setZipName] = useState<string>("");
  const [items, setItems] = useState<PdfItem[]>([]);
  const [ignored, setIgnored] = useState<IgnoredItem[]>([]);
  const [error, setError] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [downloadName, setDownloadName] = useState<string>("merged.pdf");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const totalPages = useMemo(() => items.reduce((sum, item) => sum + item.pageCount, 0), [items]);
  const missingDates = useMemo(() => items.filter((item) => !item.creationDate).length, [items]);
  const canMerge = items.length > 0 && status !== "reading" && status !== "merging";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  function resetResult() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl("");
    setDownloadName("merged.pdf");
  }

  async function handleZipFile(file: File) {
    resetResult();
    setStatus("reading");
    setZipName(file.name);
    setItems([]);
    setIgnored([]);
    setError("");

    try {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        throw new Error("Please select a ZIP file.");
      }

      const zipBytes = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(zipBytes);
      const entries = Object.values(zip.files);
      const pdfEntries = entries.filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".pdf"));
      const ignoredEntries: IgnoredItem[] = entries
        .filter((entry) => !entry.dir && !entry.name.toLowerCase().endsWith(".pdf"))
        .map((entry) => ({ path: entry.name, reason: "Not a PDF file" }));

      if (pdfEntries.length === 0) {
        setIgnored(ignoredEntries);
        setStatus("error");
        setError("No PDFs were found in the ZIP file.");
        return;
      }

      const parsed: PdfItem[] = [];
      const failed: IgnoredItem[] = [];

      for (let index = 0; index < pdfEntries.length; index += 1) {
        const entry = pdfEntries[index];
        try {
          parsed.push(await readPdfEntry(entry, index));
        } catch {
          failed.push({ path: entry.name, reason: "Could not read PDF" });
        }
      }

      const sorted = sortByCreationDate(parsed);
      setItems(sorted);
      setIgnored([...ignoredEntries, ...failed]);
      setStatus(sorted.length > 0 ? "ready" : "error");

      if (sorted.length === 0) {
        setError("PDFs were found, but none of them could be read.");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "The ZIP file could not be processed.");
    }
  }

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await handleZipFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (file) void handleZipFile(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function moveUp(index: number) {
    if (index === 0) return;
    resetResult();
    setItems((current) => moveItem(current, index, index - 1));
    setStatus("ready");
  }

  function moveDown(index: number) {
    if (index === items.length - 1) return;
    resetResult();
    setItems((current) => moveItem(current, index, index + 1));
    setStatus("ready");
  }

  function handleRowDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;

    resetResult();
    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === draggedId);
      const toIndex = current.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      return moveItem(current, fromIndex, toIndex);
    });
    setStatus("ready");
    setDraggedId(null);
  }

  async function mergePdfs() {
    if (!items.length) return;

    resetResult();
    setStatus("merging");
    setError("");

    try {
      const merged = await PDFDocument.create();
      merged.setTitle("Merged PDFs");
      merged.setCreator("PDF ZIP Merger");
      merged.setProducer("pdf-lib");
      merged.setCreationDate(new Date());
      merged.setModificationDate(new Date());

      for (const item of items) {
        const source = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
        const copiedPages = await merged.copyPages(source, source.getPageIndices());
        copiedPages.forEach((page) => merged.addPage(page));
      }

      const mergedBytes = await merged.save();
      const mergedBuffer = mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([mergedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      setDownloadUrl(url);
      setDownloadName(createSafeDownloadName(zipName));
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "The PDFs could not be merged.");
    }
  }

  return (
    <main className="app-shell">
      <section className="page-workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Client-side Tool · NextJS · TSX</p>
            <h1>PDF-Editor</h1>
          </div>
          <p>
            Non-PDF files will be ignored. You can review the file order and adjust it via drag-and-drop before merging.
          </p>
        </header>

        <div className="workspace-grid">
          <section className="control-column" aria-label="File and output controls">
            <section id="upload" className="panel upload-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <h2>ZIP File</h2>
                  <p>Only files with the .pdf extension will be processed.</p>
                </div>
              </div>

              <div className="dropzone" onDrop={handleDrop} onDragOver={handleDragOver}>
                <input ref={inputRef} type="file" accept=".zip,application/zip" onChange={handleInputChange} hidden />
                <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>
                  Select ZIP
                </button>
                <span>or drag file here</span>
              </div>

              {zipName && (
                <div className="file-pill" aria-live="polite">
                  <span>{zipName}</span>
                  <small>{status === "reading" ? "Analyzing..." : "Analyzed"}</small>
                </div>
              )}
            </section>

            {error && (
              <section className="alert" role="alert">
                {error}
              </section>
            )}

            <section className="stats-grid" aria-label="Analysis overview">
              <article>
                <span>{items.length}</span>
                <p>PDFs detected</p>
              </article>
              <article>
                <span>{totalPages}</span>
                <p>Total pages</p>
              </article>
              <article>
                <span>{ignored.length}</span>
                <p>Files ignored</p>
              </article>
              <article>
                <span>{missingDates}</span>
                <p>Missing creation date</p>
              </article>
            </section>

            {ignored.length > 0 && (
              <section className="panel compact-panel">
                <h2>Ignored files</h2>
                <ul className="ignored-list">
                  {ignored.slice(0, MAX_VISIBLE_IGNORED).map((entry) => (
                    <li key={`${entry.path}-${entry.reason}`}>
                      <span>{entry.path}</span>
                      <small>{entry.reason}</small>
                    </li>
                  ))}
                </ul>
                {ignored.length > MAX_VISIBLE_IGNORED && (
                  <p className="muted">+ {ignored.length - MAX_VISIBLE_IGNORED} more</p>
                )}
              </section>
            )}

            <section id="download" className="panel download-panel">
              <div>
                <h2>Merge</h2>
                <p>The output is generated in your browser and will be provided as a download afterward.</p>
              </div>
              <div className="download-actions">
                <button className="primary-button" type="button" onClick={mergePdfs} disabled={!hasMounted || !canMerge}>
                  {status === "merging" ? "Building PDF..." : "Merge PDFs"}
                </button>
                {downloadUrl && (
                  <a className="download-link" href={downloadUrl} download={downloadName}>
                    Download PDF
                  </a>
                )}
              </div>
            </section>
          </section>

          <section id="order" className="panel order-panel">
            <div className="panel-heading order-heading">
              <div>
                <h2>Review order</h2>
                <p>By default, files are sorted by oldest creation date first. PDFs without a creation date will be placed at the end.</p>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setItems(sortByCreationDate(items))}
                disabled={!hasMounted || !items.length}
              >
                Sort by date
              </button>
            </div>

            {items.length === 0 ? (
              <div className="empty-state">
                <strong>No PDFs loaded yet.</strong>
                <span>Drag a ZIP file here or select one using the button.</span>
              </div>
            ) : (
              <ol className="pdf-list">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggedId(item.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleRowDrop(item.id)}
                    className={draggedId === item.id ? "dragging" : ""}
                  >
                    <div className="rank">{String(index + 1).padStart(2, "0")}</div>
                    <div className="pdf-meta">
                      <strong>{item.name}</strong>
                      <span>{item.path}</span>
                      <small className={item.creationDate ? "" : "warning-text"}>{formatDate(item.creationDate)}</small>
                    </div>
                    <div className="page-count">{item.pageCount} pages</div>
                    <div className="row-actions" aria-label={`Change order for ${item.name}`}>
                      <button type="button" onClick={() => moveUp(index)} disabled={index === 0} aria-label="up">
                        ↑
                      </button>
                      <button type="button" onClick={() => moveDown(index)} disabled={index === items.length - 1} aria-label="down">
                        ↓
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
