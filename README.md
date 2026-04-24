# NextJS PDF ZIP Merger

Reine Frontend-App mit NextJS und TSX. Die Anwendung nimmt eine ZIP-Datei entgegen, ignoriert alle Nicht-PDFs, liest die PDF-Metadaten, sortiert die PDFs nach `CreationDate`, lässt die Reihenfolge manuell korrigieren und erzeugt anschließend eine zusammengeführte PDF zum Download.

## Start

```bash
npm install
npm run dev
```

Dann `http://localhost:3000` öffnen.

## Build als statische Frontend-App

```bash
npm run build
```

Durch `output: "export"` wird eine statische App im Ordner `out` erzeugt.

## Technische Hinweise

- Die Verarbeitung passiert komplett im Browser.
- Nicht-PDFs werden ignoriert.
- PDFs ohne `CreationDate` werden ans Ende sortiert.
- Defekte oder nicht lesbare PDFs werden übersprungen und in der Oberfläche angezeigt.
- Sehr große ZIP/PDF-Dateien können wegen Browser-Speichergrenzen langsam werden oder scheitern.
