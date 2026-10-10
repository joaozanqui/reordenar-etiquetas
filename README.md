# Reordenar Etiquetas PDF

Pagina web estatica hospedada no GitHub Pages para reordenar automaticamente as paginas de PDFs de etiquetas em ordem alfabetica pelo destinatario.

## O que o sistema faz

Recebe um arquivo `.pdf` de etiquetas (uma etiqueta por pagina), le o nome do destinatario de cada pagina, reordena as paginas em ordem alfabetica (A→Z ou Z→A) e gera um novo PDF para download.

- Detecta o nome apos o rotulo **Destinatario:** em cada pagina
- Paginas sem destinatario detectado ficam marcadas na pre-visualizacao e vao para o final
- Tabela de pre-visualizacao com botao **ver texto** para conferir o que foi lido de cada pagina
- As paginas sao copiadas na integra, sem perda de qualidade

## Estrutura do projeto

- `index.html` - pagina principal
- `styles.css` - interface visual
- `app.js` - toda a logica de leitura, deteccao e reordenacao em JavaScript puro

Bibliotecas carregadas via CDN (precisa de internet conectada):

- **pdf.js** - extrai o texto de cada pagina do PDF
- **pdf-lib** - monta o PDF novo com as paginas na ordem correta

## Como usar

1. Acesse a pagina pelo GitHub Pages: https://joaozanqui.github.io/reordenar-etiquetas-pdf/
2. Selecione ou arraste o arquivo `.pdf` de etiquetas
3. A leitura e a deteccao acontecem automaticamente
4. Confira a pre-visualizacao da nova ordem
5. Clique em **Ordenar A→Z e baixar** (ou **Ordenar Z→A e baixar**)
