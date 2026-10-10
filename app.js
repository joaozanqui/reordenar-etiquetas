'use strict';

const pdfjsLib = window.pdfjsLib;
const { PDFDocument } = window.PDFLib;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const el = {
  loading: document.getElementById('loadingOverlay'),
  drag: document.getElementById('dragOverlay'),
  file: document.getElementById('pdfFile'),
  summary: document.getElementById('fileSummary'),
  btnAZ: document.getElementById('btnAZ'),
  btnZA: document.getElementById('btnZA'),
  status: document.getElementById('statusMessage'),
  results: document.getElementById('resultsPanel'),
  resultsTag: document.getElementById('resultsTag'),
  resultsBody: document.getElementById('resultsBody'),
  alertaDebug: document.getElementById('alertaDebug'),
};

let arquivo = null;
let bytesPDF = null;
let paginas = [];

/* ---------------- utilidades ---------------- */

function setStatus(mensagem, tipo = '') {
  el.status.textContent = mensagem;
  el.status.className = 'status-message' + (tipo ? ' ' + tipo : '');
}

function mostrarLoading(ativo, texto = 'Processando etiquetas...') {
  el.loading.classList.toggle('active', ativo);
  el.loading.querySelector('p').textContent = texto;
}

function normalizar(texto) {
  return texto.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ---------------- detecção do destinatário ---------------- */

const ROTULO = /destinat[áa]rio\s*:?\s*/i;

const EXCLUSAO = /^(rua|av|avenida|trav|travessa|rod|rodovia|estr|estrada|alameda|jardim|jd|quadra|lote|casa|ap|apto|apartamento|bloco|torre|conj|sala|cep|bairro|cidade|total|express|exp|transportadora|remetente|pedido|telefone|tel|cel|whatsapp|obs|volume|peso|valor|nota|fiscal|recebedor|entrega|entregar|comprador|cliente)\b/i;

function pareceNome(texto) {
  const t = normalizar(texto);
  if (t.length < 4 || t.length > 90) return false;
  if (/\d/.test(t)) return false;
  if (EXCLUSAO.test(t)) return false;
  const palavras = t.split(' ').filter(Boolean);
  if (palavras.length < 2) return false;
  const maiusculas = palavras.filter(
    (p) => p === p.toUpperCase() && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(p)
  );
  return maiusculas.length / palavras.length >= 0.6;
}

function detectarDestinatario(linhas) {
  // 1) rótulo "Destinatário:" — nome na mesma linha, depois dos dois-pontos
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(ROTULO);
    if (!m) continue;

    const resto = normalizar(linhas[i].slice(m.index + m[0].length))
      .replace(/[:\-–—]+$/, '')
      .trim();
    if (resto.length >= 4 && !EXCLUSAO.test(resto) && /[A-Za-zÀ-ú]/.test(resto)) {
      return resto;
    }

    // 2) nome nas linhas seguintes ao rótulo
    for (let j = i + 1; j < Math.min(i + 4, linhas.length); j++) {
      const cand = normalizar(linhas[j]);
      if (!cand) continue;
      if (ROTULO.test(cand) || /remetente/i.test(cand)) break;
      if (pareceNome(cand)) return cand;
    }
  }

  // 3) fallback: primeira linha que pareça nome de pessoa em maiúsculas
  for (const linha of linhas) {
    if (pareceNome(linha)) return normalizar(linha);
  }
  return null;
}

/* ---------------- leitura do PDF ---------------- */

async function extrairLinhas(page) {
  const conteudo = await page.getTextContent();
  const itens = [];
  for (const item of conteudo.items) {
    if (typeof item.str !== 'string' || item.str === '') continue;
    itens.push({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      w: item.width || 0,
    });
  }
  itens.sort((a, b) => b.y - a.y || a.x - b.x);

  // agrupa os pedaços de texto por coordenada Y (reconstrói as linhas visuais)
  const grupos = [];
  const TOLERANCIA = 3.5;
  for (const it of itens) {
    let grupo = grupos.find((g) => Math.abs(g.y - it.y) <= TOLERANCIA);
    if (!grupo) {
      grupo = { y: it.y, itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push(it);
  }

  const linhas = [];
  for (const grupo of grupos) {
    grupo.itens.sort((a, b) => a.x - b.x);
    let texto = '';
    let fim = null;
    for (const it of grupo.itens) {
      if (fim !== null && it.x - fim > 1.2) texto += ' ';
      texto += it.str;
      fim = it.x + it.w;
    }
    const t = normalizar(texto);
    if (t) linhas.push(t);
  }
  return linhas;
}

async function processar() {
  mostrarLoading(true, 'Abrindo PDF...');
  try {
    paginas = [];
    const doc = await pdfjsLib
      .getDocument({ data: new Uint8Array(bytesPDF) })
      .promise;

    let caracteres = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      mostrarLoading(true, `Lendo página ${i} de ${doc.numPages}...`);
      const page = await doc.getPage(i);
      const linhas = await extrairLinhas(page);
      caracteres += linhas.join('').length;
      paginas.push({
        indice: i - 1,
        pagina: i,
        nome: detectarDestinatario(linhas),
        linhas,
      });
    }

    if (caracteres < 20) {
      setStatus(
        'Este PDF parece conter apenas imagens (escaneado). Não há texto para detectar destinatários.',
        'erro'
      );
    } else {
      const detectadas = paginas.filter((p) => p.nome).length;
      setStatus(
        `${detectadas} de ${paginas.length} etiquetas detectadas. Confira a pré-visualização antes de baixar.`,
        detectadas ? 'ok' : 'erro'
      );
    }
    renderTabela();
  } catch (erro) {
    console.error(erro);
    if (erro && /password/i.test(String(erro))) {
      setStatus('O PDF é protegido por senha. Remova a proteção e tente novamente.', 'erro');
    } else {
      setStatus('Não foi possível ler o PDF. Verifique se o arquivo é válido.', 'erro');
    }
  } finally {
    mostrarLoading(false);
  }
}

/* ---------------- pré-visualização ---------------- */

function ordenarParaExibicao() {
  const detectadas = paginas
    .filter((p) => p.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  const naoDetectadas = paginas.filter((p) => !p.nome);
  return [...detectadas, ...naoDetectadas];
}

function renderTabela() {
  const ordem = ordenarParaExibicao();
  const detectadas = paginas.filter((p) => p.nome).length;

  el.resultsTag.textContent = `${detectadas} de ${paginas.length} detectados`;
  el.alertaDebug.hidden = detectadas > 0;
  el.results.hidden = false;
  el.btnAZ.disabled = false;
  el.btnZA.disabled = false;

  el.resultsBody.innerHTML = '';
  ordem.forEach((p, idx) => {
    const tr = document.createElement('tr');

    const tdPos = document.createElement('td');
    tdPos.className = 'mono';
    tdPos.textContent = `${idx + 1}º`;

    const tdPag = document.createElement('td');
    tdPag.className = 'mono';
    tdPag.textContent = `pág. ${p.pagina}`;

    const tdNome = document.createElement('td');
    tdNome.textContent = p.nome || '—';

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge ' + (p.nome ? 'ok' : 'falha');
    badge.textContent = p.nome ? 'detectado' : 'não detectado';
    tdStatus.appendChild(badge);

    const tdAcao = document.createElement('td');
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'ver-texto';
    botao.textContent = 'ver texto';
    const pre = document.createElement('pre');
    pre.className = 'debug-pre';
    pre.textContent = p.linhas.length
      ? p.linhas.join('\n')
      : '(nenhum texto extraído desta página)';
    botao.addEventListener('click', () => pre.classList.toggle('aberto'));
    tdAcao.appendChild(botao);

    tr.append(tdPos, tdPag, tdNome, tdStatus, tdAcao);
    el.resultsBody.appendChild(tr);

    const trDebug = document.createElement('tr');
    const tdDebug = document.createElement('td');
    tdDebug.colSpan = 5;
    tdDebug.appendChild(pre);
    trDebug.appendChild(tdDebug);
    el.resultsBody.appendChild(trDebug);
  });
}

/* ---------------- geração do PDF ---------------- */

async function gerar(direcao) {
  if (!paginas.length) return;
  mostrarLoading(true, 'Gerando PDF...');
  try {
    const detectadas = paginas
      .filter((p) => p.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    if (direcao === 'za') detectadas.reverse();
    const naoDetectadas = paginas.filter((p) => !p.nome);
    const ordem = [...detectadas, ...naoDetectadas];

    const origem = await PDFDocument.load(new Uint8Array(bytesPDF));
    const destino = await PDFDocument.create();
    const copiadas = await destino.copyPages(origem, ordem.map((p) => p.indice));
    copiadas.forEach((pg) => destino.addPage(pg));
    const bytes = await destino.save();

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = arquivo.name.replace(/\.pdf$/i, '') + '-ordenado.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setStatus(
      `PDF gerado com ${ordem.length} páginas em ordem ${direcao === 'az' ? 'A→Z' : 'Z→A'}.`,
      'ok'
    );
  } catch (erro) {
    console.error(erro);
    setStatus('Erro ao gerar o PDF. Tente novamente.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

/* ---------------- eventos ---------------- */

function carregarArquivo(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    setStatus('Selecione um arquivo PDF.', 'erro');
    return;
  }
  arquivo = file;
  file.arrayBuffer().then((buffer) => {
    bytesPDF = new Uint8Array(buffer);
    el.summary.innerHTML =
      '<p class="summary-label">' + file.name + '</p>' +
      '<p class="summary-value">' + (file.size / 1024).toFixed(0) + ' KB · processando...</p>';
    processar();
  });
}

el.file.addEventListener('change', () => carregarArquivo(el.file.files[0]));
el.btnAZ.addEventListener('click', () => gerar('az'));
el.btnZA.addEventListener('click', () => gerar('za'));

['dragenter', 'dragover'].forEach((evento) =>
  document.addEventListener(evento, (e) => {
    e.preventDefault();
    el.drag.classList.add('active');
  })
);

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) el.drag.classList.remove('active');
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  el.drag.classList.remove('active');
  carregarArquivo(e.dataTransfer?.files?.[0]);
});