import dedent from 'dedent';

const pdfCSS = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body, #root {
  height: 100%;
  width: 100%;
}
.pdf-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #525659;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.pdf-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  color: #fff;
}
.pdf-title {
  color: #fff;
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 8px;
}
.pdf-subtitle {
  color: #999;
  font-size: 14px;
  margin-bottom: 24px;
}
.download-btn {
  background: #4a90d9;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  transition: background 0.2s;
}
.download-btn:hover {
  background: #357abd;
}
.loading {
  color: #999;
  font-size: 14px;
}
.error {
  color: #ff6b6b;
  font-size: 14px;
}
`;

export const getPdfFiles = (content: string) => {
  const documentCode = content;

  const appCode = dedent`
    import React from 'react';
    import { PDFDownloadLink } from '@react-pdf/renderer';
    import { MyDocument } from './Document';

    const PdfIcon = () => (
      <svg className="pdf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );

    export default function App() {
      return (
        <div className="pdf-container">
          <PdfIcon />
          <div className="pdf-title">PDF Document Ready</div>
          <div className="pdf-subtitle">Click below to download your document</div>
          <PDFDownloadLink document={<MyDocument />} fileName="document.pdf">
            {({ loading, error }) => {
              if (loading) return <span className="loading">Preparing document...</span>;
              if (error) return <span className="error">Error: {error.message}</span>;
              return <span className="download-btn">Download PDF</span>;
            }}
          </PDFDownloadLink>
        </div>
      );
    }
  `;

  const indexCode = dedent`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import "./styles.css";
    import App from "./App";

    const root = createRoot(document.getElementById("root"));
    root.render(<App />);
  `;

  // Ensure the document code exports MyDocument as a named export
  let finalDocumentCode = documentCode;
  if (documentCode.includes('export default') && !documentCode.includes('export { MyDocument }') && !documentCode.includes('export const MyDocument')) {
    finalDocumentCode = documentCode.replace(/export\s+default\s+/, 'export ');
  }
  if (!finalDocumentCode.includes('export')) {
    finalDocumentCode += '\n\nexport { MyDocument };';
  }

  return {
    'App.tsx': appCode,
    'Document.tsx': finalDocumentCode,
    'index.tsx': indexCode,
    'styles.css': pdfCSS,
  };
};
