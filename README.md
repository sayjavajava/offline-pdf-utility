# Offline PDF Utility

An **AI-coded**, completely offline PDF toolkit built with React and TypeScript, featuring a stunning glassmorphism UI. Perform all PDF operations securely in your browser with complete privacy.

## App Interface

![Offline PDF Utility Interface](PDF-Utility-Professional-Document-Tools.png)

## Features

- **100% Offline**: Your files are never uploaded to a server, ensuring maximum privacy and security.
- **Modern UI**: A beautiful and intuitive glassmorphism interface built with the Lovable UI framework.
- **Split PDF**: Extract specific pages or page ranges from a PDF.
- **Merge PDF**: Combine multiple PDF documents into a single file.
- **Unlock PDF**: Remove password protection from an encrypted PDF, given its
  password. Supports both RC4 and AES encryption. Note that the reverse —
  *adding* a password to a PDF — is not currently supported.
- **Edit Metadata**: Modify your PDF's title, author, subject, and keywords.
- **Convert to PDF**: Convert JPEG, PNG, or DOCX files to PDF format.
- **Add Watermark**: Apply a text watermark to every page of your PDF.
- **Rotate Pages**: Rotate selected pages (or the whole document) by 90°, 180°, or 270°.
- **Delete / Reorder Pages**: Keep pages in a custom order; omit pages to delete them.
- **Add Page Numbers**: Stamp sequential page numbers, "page x of y", or zero-padded Bates
  numbers (with an optional prefix) for legal documents.
- **Extract Images**: Pull the embedded images out of a PDF without modifying it; several
  images are bundled into a zip.

## How to Use

This tool is designed to be simple and intuitive. All processing happens directly in your browser, ensuring your files remain private.

1.  **Open the Application**: Access the PDF Utility through the provided live URL or by running it locally (see [Setup and Development](#setup-and-development)).
2.  **Choose a Tool**: From the main dashboard, click on the tool you need, such as "Split PDF" or "Add Watermark".
3.  **Follow the Steps**: Each tool will present you with simple options. This usually involves:
    *   Uploading your PDF or image file(s).
    *   Filling in any required fields (like page numbers for splitting or text for a watermark).
4.  **Process Your File**: Click the main action button for the tool.
5.  **Download Your File**: Your new, modified file will be automatically downloaded by your browser.

That's it! No complex steps, just a straightforward tool for your PDF needs.

## Offline Usage (No Internet Required)

For a truly offline experience, you can run this application without any internet connection, not even for the first time.

### For Developers (Creating the Offline Version)

1.  **Build the application**:

    ```bash
    npm run build
    ```

2.  **Ship `dist/index.html`**:
    The build produces a single self-contained `dist/index.html` with all
    JavaScript, CSS, and fonts inlined. That one file *is* the application —
    there is nothing else to package, and no `.zip` is needed.

    This is deliberate. Browsers treat a page opened from disk as having a
    `null` origin and fetch module scripts and fonts under CORS rules, so a
    conventional multi-file build silently refuses to start from `file://`.
    Inlining every asset is what makes opening the file directly work at all.

### For End-Users

1.  **Get the file**: Obtain `index.html` from the developer.
2.  **Open it**: Double-click it, or open it in your browser. That's it.

The application runs entirely from your machine, with no network access at
any point — you can verify this by disconnecting before you open it.

## Technologies

- **React**: A JavaScript library for building user interfaces.
- **TypeScript**: A typed superset of JavaScript that compiles to plain JavaScript.
- **Vite**: A fast and modern build tool for web development.
- **pdf-lib**: A JavaScript library for creating and modifying PDF documents.
- **mammoth.js**: A library for converting .docx files to HTML.
- **html2pdf.js**: A library to generate PDFs from HTML.
- **Lovable UI**: A stunning, modern UI framework.
- **AI-Assisted Development**: Coded with the help of Cascade, an agentic AI coding assistant.

## Setup and Development

This project uses **npm** (see `packageManager` in `package.json`). Do not commit
other lockfiles.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sayjavajava/offline-pdf-utility.git
   cd offline-pdf-utility
   ```

2. **Install dependencies:**
   ```bash
   npm ci
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open the application:**
   Open your browser and navigate to the local URL provided by Vite (usually `http://localhost:5173`).

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE).

## Contribution Guidelines

We welcome contributions! If you have an idea for a new feature or have found a bug, please open an issue to discuss it. Pull requests are also welcome.

## Contact

For any questions or feedback, please reach out via [GitHub Issues](../../issues).
