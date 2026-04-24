# PDF Editor

A client-side PDF tool built with NextJS and TSX. The app runs completely in the browser and provides two workflows from the landing page: merge PDFs from a ZIP file and edit the pages of a single PDF.

## Features

- Landing page with separate cards for merging and editing PDFs
- Clean GitHub island with links to the repository and profile
- Merge workflow for ZIP files containing PDFs
- Automatic PDF sorting by `CreationDate` in the merge workflow
- Manual drag-and-drop ordering before merging
- Edit workflow for a single PDF
- Rendered page previews while editing
- Delete individual pages from a PDF
- Move pages within a PDF by drag-and-drop or arrow controls
- Export the edited PDF as a new file
- Browser-only processing with no server upload

## Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build as a static frontend app

```bash
npm run build
```

The `output: "export"` setting creates a static app in the `out` folder.

## Routes

- `/` opens the landing page.
- `/merge` opens the ZIP-to-PDF merge workflow.
- `/edit` opens the page editing workflow.

## Technical notes

- Processing happens entirely in the browser.
- `pdf-lib` is used to read, merge, reorder, delete, and export PDF pages.
- `pdfjs-dist` is used to render page previews in the edit workflow.
- The merge workflow ignores non-PDF files in ZIP uploads.
- PDFs without `CreationDate` are placed at the end of the default merge order.
- Broken or unreadable PDFs are skipped in the merge workflow and shown in the interface.
- The edit workflow exports a new PDF and leaves the uploaded file unchanged.
- Very large ZIP or PDF files may be slow or fail because of browser memory limits.
