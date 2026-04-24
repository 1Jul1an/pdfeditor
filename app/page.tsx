import Link from "next/link";

function GithubIcon() {
  return (
    <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.59 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.37 9.37 0 0 1 12 6.96c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.04 10.04 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="external-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6.5 4.5a1 1 0 0 0 0 2h5.09l-7.3 7.3a1 1 0 1 0 1.42 1.4L13 7.91V13a1 1 0 1 0 2 0V5.5a1 1 0 0 0-1-1H6.5Z"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="app-shell">
      <section className="landing-page">
        <header className="landing-hero">
          <p className="eyebrow">Client-side PDF Tool · NextJS · TSX</p>
          <h1>PDF-Editor</h1>
          <p>Choose a workflow and process your PDFs directly in the browser.</p>
        </header>

        <section className="choice-grid" aria-label="PDF workflows">
          <Link className="choice-card" href="/merge">
            <span className="choice-kicker">Workflow 01</span>
            <h2>Merge PDFs</h2>
            <p>Upload a ZIP file, sort the detected PDFs, and combine them into one PDF.</p>
            <span className="choice-link">Open merge tool</span>
          </Link>

          <Link className="choice-card" href="/edit">
            <span className="choice-kicker">Workflow 02</span>
            <h2>Edit PDFs</h2>
            <p>Upload one PDF, remove pages, reorder pages, and export the edited file.</p>
            <span className="choice-link">Open edit tool</span>
          </Link>
        </section>

        <section className="github-island" aria-label="GitHub links">
          <div className="github-orb">
            <GithubIcon />
          </div>
          <div className="github-copy">
            <span className="github-kicker">Open source</span>
            <h2>Built by Julian</h2>
            <p>View the repository, check the code, or jump straight to the GitHub profile.</p>
          </div>
          <div className="github-actions">
            <a href="https://github.com/1Jul1an/pdfeditor" target="_blank" rel="noreferrer">
              <span>
                <strong>Repository</strong>
                <small>pdfeditor</small>
              </span>
              <ExternalIcon />
            </a>
            <a href="https://github.com/1Jul1an" target="_blank" rel="noreferrer">
              <span>
                <strong>Profile</strong>
                <small>@1Jul1an</small>
              </span>
              <ExternalIcon />
            </a>
          </div>
        </section>
      </section>
    </main>
  );
}
