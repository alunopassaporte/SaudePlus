const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const marked = require('./temp_marked.js');

const rootDir = path.resolve(__dirname, '..', '..');
const mdPath = path.join(rootDir, 'docs', 'TAREFAS_SIMPLES_V3.md');
const htmlPath = path.join(rootDir, 'docs', 'TAREFAS_SIMPLES_V3.html');
const pdfPath = path.join(rootDir, 'docs', 'TAREFAS_SIMPLES_V3.pdf');

console.log('Lendo markdown de:', mdPath);
const mdContent = fs.readFileSync(mdPath, 'utf8');

const bodyHtml = marked.parse(mdContent);

const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Saúde+ — Lista de Ajustes Pendentes e Melhorias (Versão 3)</title>
<style>
  @page {
    size: A4;
    margin: 16mm 18mm 16mm 18mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11.5pt;
    line-height: 1.5;
    color: #1f2328;
    background: #fff;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: 19pt;
    font-weight: 800;
    color: #0E2A27;
    margin: 0 0 12pt 0;
    line-height: 1.25;
    border-bottom: 2.5px solid #0F7A6B;
    padding-bottom: 6pt;
  }
  h2 {
    font-size: 14pt;
    font-weight: 700;
    color: #0E2A27;
    margin: 18pt 0 8pt 0;
    padding-bottom: 4pt;
    border-bottom: 1px solid #d0d7de;
    page-break-after: avoid;
    break-after: avoid;
  }
  h3 {
    font-size: 12pt;
    font-weight: 700;
    color: #0B5C50;
    margin: 14pt 0 6pt 0;
    page-break-after: avoid;
    break-after: avoid;
  }
  h4 {
    font-size: 11pt;
    font-weight: 600;
    color: #0E2A27;
    margin: 10pt 0 4pt 0;
    page-break-after: avoid;
    break-after: avoid;
  }
  p {
    margin: 0 0 8pt 0;
  }
  blockquote {
    margin: 10pt 0;
    padding: 8pt 12pt;
    background: #F3F7F5;
    border-left: 4px solid #0F7A6B;
    border-radius: 0 6px 6px 0;
    color: #4b5563;
    font-size: 10.5pt;
  }
  blockquote p:last-child {
    margin-bottom: 0;
  }
  hr {
    border: none;
    border-top: 1px solid #d0d7de;
    margin: 16pt 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0 14pt 0;
    font-size: 10pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  th, td {
    border: 1px solid #d0d7de;
    padding: 6pt 8pt;
    text-align: left;
    vertical-align: top;
  }
  th {
    background-color: #F3F7F5;
    color: #0E2A27;
    font-weight: 700;
  }
  tr:nth-child(even) td {
    background-color: #fafbfc;
  }
  ul, ol {
    margin: 0 0 10pt 0;
    padding-left: 18pt;
  }
  li {
    margin-bottom: 4pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  li > input[type="checkbox"] {
    margin-right: 5pt;
    vertical-align: middle;
  }
  code {
    font-family: Consolas, "SF Mono", Monaco, monospace;
    font-size: 9.5pt;
    background-color: #f6f8fa;
    border: 1px solid #e1e4e8;
    border-radius: 4px;
    padding: 1pt 4pt;
    color: #24292e;
  }
  strong {
    color: #0E2A27;
  }
  a {
    color: #0F7A6B;
    text-decoration: none;
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;

fs.writeFileSync(htmlPath, fullHtml, 'utf8');
console.log('HTML gerado com sucesso em:', htmlPath);

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
console.log('Executando Chrome para gerar PDF...');

const cmd = `"${chromePath}" --headless --disable-gpu --run-all-compositor-stages-before-draw --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\/g, '/')}"`;

execSync(cmd);

console.log('PDF gerado com sucesso em:', pdfPath);
const stats = fs.statSync(pdfPath);
console.log('Tamanho do PDF:', stats.size, 'bytes');
