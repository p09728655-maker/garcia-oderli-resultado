/**
 * CARGA DO PLANO MESTRE — set a dez/2026
 * ────────────────────────────────────────────────────────────────────────────
 * Roda dentro da própria planilha (Extensões › Apps Script › executar
 * carregarPlanoSetDez). Não passa pelo Web App: o doPost se recusa a escrever
 * na aba PLANO MESTRE de propósito, e essa proteção continua valendo — quem
 * escreve aqui é o planejamento, rodando o script à mão, não o dashboard.
 *
 * O que faz:
 *   1. Insere os lotes 032-26 a 046-26 acima da linha TOTAL GERAL;
 *   2. Completa a linha TOTAL GERAL nos meses set./26 a dez./26;
 *   3. Troca a coluna TOTAL ANO por =SOMA() da linha — é ela que já saiu de
 *      sincronia duas vezes por ser valor digitado;
 *   4. Valida coluna a coluna e aborta se algo não fechar.
 *
 * É idempotente: se o lote 032-26 já existir, não faz nada e avisa.
 */

var CARGA_ABA   = 'PLANO MESTRE';
var CARGA_TOTAL = 'TOTAL GERAL';

/* Colunas da matriz: A = código do lote, B..M = jan..dez, N = TOTAL ANO. */
var CARGA_COL_LOTE  = 1;
var CARGA_COL_JAN   = 2;
var CARGA_COL_DEZ   = 13;
var CARGA_COL_TOTAL = 14;

/* Célula vazia na matriz é traço, não zero — mesmo padrão das linhas atuais. */
var CARGA_VAZIO = '-';

/* Lotes novos: código + quantidade por mês (1 = jan ... 12 = dez). Os lotes
   que aparecem em dois meses seguidos são intencionais — seguem o padrão da
   planilha, em que o último lote do mês vira para o mês seguinte. */
var CARGA_LOTES = [
  { lote: '032-26', meses: { 9: 9000 } },
  { lote: '033-26', meses: { 9: 8500 } },
  { lote: '034-26', meses: { 9: 9000 } },
  { lote: '035-26', meses: { 9: 8310, 10: 1500 } },
  { lote: '036-26', meses: { 10: 8500 } },
  { lote: '037-26', meses: { 10: 8500 } },
  { lote: '038-26', meses: { 10: 8500 } },
  { lote: '039-26', meses: { 10: 7810, 11: 1200 } },
  { lote: '040-26', meses: { 11: 7500 } },
  { lote: '041-26', meses: { 11: 7500 } },
  { lote: '042-26', meses: { 11: 8000 } },
  { lote: '043-26', meses: { 11: 7290, 12: 1000 } },
  { lote: '044-26', meses: { 12: 8000 } },
  { lote: '045-26', meses: { 12: 8000 } },
  { lote: '046-26', meses: { 12: 7860 } }
];

/* Totais esperados do TOTAL GERAL nos meses que estavam vazios. Ficam aqui
   explícitos para a validação ter contra o que conferir — se a soma dos lotes
   não bater com isso, alguém mexeu em um dos dois lados. */
var CARGA_TOTAL_GERAL = { 9: 34810, 10: 34810, 11: 31490, 12: 24860 };


/* ══ ENTRADA ══ */
function carregarPlanoSetDez() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CARGA_ABA);
  if (!aba) return cargaErro('Aba "' + CARGA_ABA + '" não encontrada.');

  var mapa = cargaLocalizar(aba);
  if (mapa.erro) return cargaErro(mapa.erro);

  /* Guarda de reexecução: rodar duas vezes duplicaria os 15 lotes e o total
     do ano dobraria sem ninguém perceber. */
  var jaTem = cargaLotesExistentes(aba, mapa);
  if (jaTem.length) {
    return cargaErro('Estes lotes já estão na planilha: ' + jaTem.join(', ') +
                     '. Nada foi alterado — apague-os antes de rodar de novo.');
  }

  cargaInserirLotes(aba, mapa);
  /* A linha TOTAL GERAL desceu 15 posições com a inserção. */
  mapa.linhaTotal += CARGA_LOTES.length;

  cargaEscreverTotalGeral(aba, mapa);
  cargaFormularTotalAno(aba, mapa);
  SpreadsheetApp.flush();

  var rel = validarPlanoMestre();
  cargaAvisar(rel.ok
    ? 'Plano carregado: ' + CARGA_LOTES.length + ' lotes, ano fecha em ' +
      cargaMil(rel.totalAno) + ' peças.'
    : 'Carregado, MAS a validação acusou problema:\n' + rel.problemas.join('\n'));
  return rel;
}


/* ══ LOCALIZAÇÃO ══
   Nada de número de linha fixo: a matriz já mudou de tamanho antes e vai mudar
   de novo a cada lote lançado. */
function cargaLocalizar(aba) {
  var valores = aba.getDataRange().getValues();
  var cab = -1, total = -1;

  for (var i = 0; i < valores.length; i++) {
    var a = cargaNormaliza(valores[i][CARGA_COL_LOTE - 1]);
    if (cab < 0 && a === 'aba') cab = i + 1;
    if (cab > 0 && total < 0 && a === cargaNormaliza(CARGA_TOTAL)) total = i + 1;
  }

  if (cab < 0)   return { erro: 'Linha de cabeçalho (coluna A = "ABA") não encontrada.' };
  if (total < 0) return { erro: 'Linha "' + CARGA_TOTAL + '" não encontrada.' };
  if (total <= cab + 1) return { erro: 'Matriz sem linhas de lote entre o cabeçalho e o total.' };

  return { linhaCab: cab, linhaTotal: total, primeiroLote: cab + 1 };
}

function cargaLotesExistentes(aba, mapa) {
  var qtd = mapa.linhaTotal - mapa.primeiroLote;
  var col = aba.getRange(mapa.primeiroLote, CARGA_COL_LOTE, qtd, 1).getValues();
  var atuais = {};
  col.forEach(function (l) { atuais[cargaNormaliza(l[0])] = true; });
  return CARGA_LOTES
    .filter(function (x) { return atuais[cargaNormaliza(x.lote)]; })
    .map(function (x) { return x.lote; });
}


/* ══ ESCRITA ══ */
function cargaInserirLotes(aba, mapa) {
  var n = CARGA_LOTES.length;
  /* insertRowsBefore herda o formato da linha de cima — que é um lote, então
     borda, fonte e alinhamento vêm certos sem precisar copiar à mão. */
  aba.insertRowsBefore(mapa.linhaTotal, n);

  var bloco = CARGA_LOTES.map(function (x) {
    var linha = [x.lote];
    for (var m = 1; m <= 12; m++) {
      linha.push(x.meses[m] !== undefined ? x.meses[m] : CARGA_VAZIO);
    }
    linha.push('');   /* TOTAL ANO entra como fórmula logo abaixo */
    return linha;
  });

  aba.getRange(mapa.linhaTotal, CARGA_COL_LOTE, n, CARGA_COL_TOTAL).setValues(bloco);
}

function cargaEscreverTotalGeral(aba, mapa) {
  /* A linha inteira de meses passa a ser soma da coluna: enquanto for valor
     digitado, ela volta a divergir dos lotes na primeira edição. */
  var ini = mapa.primeiroLote, fim = mapa.linhaTotal - 1;
  var f = [];
  for (var c = CARGA_COL_JAN; c <= CARGA_COL_DEZ; c++) {
    var letra = cargaLetra(c);
    f.push('=SUM(' + letra + ini + ':' + letra + fim + ')');
  }
  aba.getRange(mapa.linhaTotal, CARGA_COL_JAN, 1, f.length).setFormulas([f]);
}

function cargaFormularTotalAno(aba, mapa) {
  var jan = cargaLetra(CARGA_COL_JAN), dez = cargaLetra(CARGA_COL_DEZ);
  var qtd = mapa.linhaTotal - mapa.primeiroLote + 1;   /* lotes + TOTAL GERAL */
  var f = [];
  for (var i = 0; i < qtd; i++) {
    var l = mapa.primeiroLote + i;
    f.push(['=SUM(' + jan + l + ':' + dez + l + ')']);
  }
  aba.getRange(mapa.primeiroLote, CARGA_COL_TOTAL, qtd, 1).setFormulas(f);
}


/* ══ VALIDAÇÃO ══
   Roda sozinha depois da carga, mas serve para chamar a qualquer momento —
   é o teste que pega o TOTAL ANO fora de sincronia. */
function validarPlanoMestre() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CARGA_ABA);
  if (!aba) return { ok: false, problemas: ['Aba "' + CARGA_ABA + '" não encontrada.'] };

  var mapa = cargaLocalizar(aba);
  if (mapa.erro) return { ok: false, problemas: [mapa.erro] };

  var qtd  = mapa.linhaTotal - mapa.primeiroLote;
  var cab  = aba.getRange(mapa.linhaCab,      CARGA_COL_JAN, 1, 12).getDisplayValues()[0];
  var mat  = aba.getRange(mapa.primeiroLote,  CARGA_COL_JAN, qtd, 12).getValues();
  var tot  = aba.getRange(mapa.linhaTotal,    CARGA_COL_JAN, 1, 12).getValues()[0];
  var totAno = aba.getRange(mapa.linhaTotal, CARGA_COL_TOTAL).getValue();

  var problemas = [], somaMeses = 0;

  for (var c = 0; c < 12; c++) {
    var s = 0;
    for (var r = 0; r < qtd; r++) s += cargaNum(mat[r][c]);
    var t = cargaNum(tot[c]);
    somaMeses += t;
    if (s !== t) {
      problemas.push('· ' + (cab[c] || 'mês ' + (c + 1)) + ': lotes somam ' +
                     cargaMil(s) + ', TOTAL GERAL diz ' + cargaMil(t) +
                     ' (diferença ' + cargaMil(s - t) + ')');
    }
    /* Só cobra os meses recém-carregados contra o valor esperado. */
    var esp = CARGA_TOTAL_GERAL[c + 1];
    if (esp !== undefined && t !== esp) {
      problemas.push('· ' + (cab[c] || 'mês ' + (c + 1)) + ': esperado ' +
                     cargaMil(esp) + ', encontrado ' + cargaMil(t));
    }
  }

  if (cargaNum(totAno) !== somaMeses) {
    problemas.push('· TOTAL ANO (' + cargaMil(cargaNum(totAno)) +
                   ') difere da soma dos 12 meses (' + cargaMil(somaMeses) + ')');
  }

  var rel = { ok: !problemas.length, problemas: problemas, totalAno: somaMeses };
  Logger.log(rel.ok ? 'Validação OK — ano fecha em ' + cargaMil(somaMeses) + ' peças.'
                    : 'Validação falhou:\n' + problemas.join('\n'));
  return rel;
}


/* ══ HELPERS ══ */
function cargaNormaliza(v) {
  return String(v === null || v === undefined ? '' : v)
    .trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* Traço, vazio e texto viram 0; o resto vira número. Mesmo tratamento que o
   Code.gs dá ao ler a planilha. */
function cargaNum(v) {
  if (typeof v === 'number') return v;
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s || s === CARGA_VAZIO) return 0;
  s = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function cargaLetra(col) {
  var s = '';
  while (col > 0) {
    var r = (col - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    col = (col - 1 - r) / 26;
  }
  return s;
}

function cargaMil(n) {
  return Math.round(n).toLocaleString('pt-BR');
}

function cargaErro(msg) {
  Logger.log('ERRO: ' + msg);
  cargaAvisar(msg);
  return { ok: false, problemas: [msg] };
}

/* Alert só existe com UI aberta; rodando pelo editor cai no log. */
function cargaAvisar(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}


/* ══ PLANO DERIVADO ═══════════════════════════════════════════════════════════
   derivarPlanoAnoAnterior(): copia as colunas de meses de um ano (padrão
   2026) para um ano anterior (padrão 2025) com um fator (padrão 0,95),
   em colunas novas à direita do TOTAL ANO — a matriz de 2026 (B..N) fica
   intocada, e o Code.gs lê as colunas novas pelo cabeçalho (mesEAno).

   AVISO DE ORIGEM: o resultado NÃO é o plano que valia em 2025. É 2026 ×
   0,95, pedido pelo PPCP em 17/09/2026 para ter um alvo por lote no ano
   fechado. A previsão real de 2025 continua na HISTORICO, coluna
   planoNaHistorico (o painel avisa quando os dois divergem). Cada cabeçalho
   novo recebe uma nota dizendo isso.

   Idempotente: se já houver coluna de mês do ano destino, não faz nada.
   Menu 📋 Plano Mestre → Derivar 2025 de 2026 (−5%). */
function derivarPlanoAnoAnterior(anoOrigem, anoDestino, fator) {
  anoOrigem  = anoOrigem  || 2026;
  anoDestino = anoDestino || (anoOrigem - 1);
  fator      = (fator > 0) ? fator : 0.95;
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CARGA_ABA);
  if (!aba) return cargaErro('Aba "' + CARGA_ABA + '" não encontrada.');
  var mapa = cargaLocalizar(aba);
  if (mapa.erro) return cargaErro(mapa.erro);

  var valores = aba.getDataRange().getValues();
  var cab = valores[mapa.linhaCab - 1];
  var origem = [], jaTem = false, ultima = 0;
  for (var c = 0; c < cab.length; c++) {
    var mv = cargaMesEAno(cab[c]);
    if (!mv) continue;
    ultima = Math.max(ultima, c + 1);
    if (mv.ano === anoOrigem)  origem.push({ col: c + 1, mes: mv.mes, idx: mv.idx, rotulo: cab[c] });
    if (mv.ano === anoDestino) jaTem = true;
  }
  if (jaTem) return cargaErro('Já existem colunas de ' + anoDestino + ' no ' + CARGA_ABA + ' — nada foi alterado.');
  if (origem.length !== 12) return cargaErro('Esperava 12 colunas de meses de ' + anoOrigem + ' no cabeçalho, achei ' + origem.length + '.');
  origem.sort(function (a, b) { return a.idx - b.idx; });

  /* destino começa depois da última coluna usada (TOTAL ANO de 2026 incluído) */
  var ultimaUsada = Math.max(aba.getLastColumn(), ultima);
  var col0 = ultimaUsada + 1;                          /* jan do destino */
  var colTotal = col0 + 12;                            /* TOTAL ANO do destino */
  var iVol = -1;
  for (var r = 0; r < valores.length; r++) if (cargaNormaliza(valores[r][0]) === cargaNormaliza('TOTAL VOLUMES')) iVol = r + 1;

  /* cabeçalho: mesmo formato do de origem, com o ano trocado */
  var cabNovo = origem.map(function (o) { return cargaTrocarAno(o.rotulo, anoOrigem, anoDestino, o.idx); });
  cabNovo.push('TOTAL ANO ' + anoDestino);
  aba.getRange(mapa.linhaCab, col0, 1, 13).setValues([cabNovo]);
  var nota = 'DERIVADO: ' + anoOrigem + ' × ' + String(fator).replace('.', ',') + ', gerado em '
    + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy') + '. Não é o plano que valia em '
    + anoDestino + '; a previsão da época está na HISTORICO (planoNaHistorico).';
  for (var k = 0; k < 13; k++) aba.getRange(mapa.linhaCab, col0 + k).setNote(nota);

  /* lotes: valor × fator, arredondado; vazio/traço continua traço */
  var ini = mapa.primeiroLote, fim = mapa.linhaTotal - 1, bloco = [], somas = [];
  for (var m = 0; m < 12; m++) somas.push(0);
  for (var l = ini; l <= fim; l++) {
    var linha = [];
    for (var j = 0; j < 12; j++) {
      var v = cargaNum(valores[l - 1][origem[j].col - 1]);
      if (v > 0) { var d = Math.round(v * fator); linha.push(d); somas[j] += d; } else linha.push(CARGA_VAZIO);
    }
    bloco.push(linha);
  }
  if (bloco.length) aba.getRange(ini, col0, bloco.length, 12).setValues(bloco);

  /* TOTAL GERAL do destino = soma das colunas; TOTAL ANO por linha = soma da linha */
  var fTot = [];
  for (var j2 = 0; j2 < 12; j2++) { var L = cargaLetra(col0 + j2); fTot.push('=SUM(' + L + ini + ':' + L + fim + ')'); }
  aba.getRange(mapa.linhaTotal, col0, 1, 12).setFormulas([fTot]);
  var fAno = [], a = cargaLetra(col0), z = cargaLetra(col0 + 11);
  for (var l2 = ini; l2 <= mapa.linhaTotal; l2++) fAno.push(['=SUM(' + a + l2 + ':' + z + l2 + ')']);
  aba.getRange(ini, colTotal, fAno.length, 1).setFormulas(fAno);

  /* TOTAL VOLUMES (se existir): valor × fator */
  if (iVol > 0) {
    var vol = [];
    for (var j3 = 0; j3 < 12; j3++) { var vv = cargaNum(valores[iVol - 1][origem[j3].col - 1]); vol.push(vv > 0 ? Math.round(vv * fator) : CARGA_VAZIO); }
    aba.getRange(iVol, col0, 1, 12).setValues([vol]);
  }
  cargaCopiarFormato(aba, mapa, origem[0].col, col0, iVol);
  var total = somas.reduce(function (s, x) { return s + x; }, 0);
  var msg = CARGA_ABA + ': colunas ' + cargaLetra(col0) + '..' + cargaLetra(colTotal) + ' criadas para ' + anoDestino
    + ' = ' + anoOrigem + ' × ' + String(fator).replace('.', ',') + '. ' + bloco.length + ' lotes, total do ano ' + cargaMil(total) + ' pç.'
    + '\n\nÉ um plano DERIVADO, não o da época (nota nos cabeçalhos). O painel passa a usá-lo como previsão de ' + anoDestino
    + ' na próxima abertura e avisa, na integridade, onde ele difere da previsão que a HISTORICO guardava.';
  cargaAvisar(msg);
  return { ok: true, col0: col0, lotes: bloco.length, total: total };
}

function derivarPlano2025De2026() { return derivarPlanoAnoAnterior(2026, 2025, 0.95); }

/* Formato das colunas novas igual ao das de origem (cabeçalho "jan./25",
   números com separador de milhar, larguras). Só formato: não mexe em valor. */
function cargaCopiarFormato(aba, mapa, colOrigem, colDestino, iVol) {
  var ultima = Math.max(mapa.linhaTotal, iVol > 0 ? iVol : 0);
  var linhas = ultima - mapa.linhaCab + 1;
  var de = aba.getRange(mapa.linhaCab, colOrigem, linhas, 13);        /* 12 meses + TOTAL ANO */
  var para = aba.getRange(mapa.linhaCab, colDestino, linhas, 13);
  de.copyTo(para, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  for (var k = 0; k < 13; k++) aba.setColumnWidth(colDestino + k, aba.getColumnWidth(colOrigem + k));
}

/* Menu 📋 Plano Mestre → Formatar colunas de 2025 como as de 2026: para o
   bloco derivado que já foi criado antes de o script copiar o formato. */
function formatarPlanoDerivado2025() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CARGA_ABA);
  if (!aba) return cargaErro('Aba "' + CARGA_ABA + '" não encontrada.');
  var mapa = cargaLocalizar(aba);
  if (mapa.erro) return cargaErro(mapa.erro);
  var valores = aba.getDataRange().getValues(), cab = valores[mapa.linhaCab - 1], c26 = 0, c25 = 0, iVol = -1;
  for (var c = 0; c < cab.length; c++) {
    var mv = cargaMesEAno(cab[c]);
    if (mv && mv.idx === 0 && mv.ano === 2026 && !c26) c26 = c + 1;
    if (mv && mv.idx === 0 && mv.ano === 2025 && !c25) c25 = c + 1;
  }
  for (var r = 0; r < valores.length; r++) if (cargaNormaliza(valores[r][0]) === cargaNormaliza('TOTAL VOLUMES')) iVol = r + 1;
  if (!c26 || !c25) return cargaErro('Não achei as colunas de janeiro de 2026 e de 2025 no cabeçalho.');
  cargaCopiarFormato(aba, mapa, c26, c25, iVol);
  cargaAvisar('Colunas de 2025 formatadas como as de 2026.');
}

/* "jan./26", "JAN/2026", "jan-26", Date → { mes, ano, idx }. Mesma regra
   do mesEAno do Code.gs, com o índice do mês para ordenar. */
var CARGA_MES_TXT = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
function cargaMesEAno(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return { mes: v.getMonth(), idx: v.getMonth(), ano: v.getFullYear() };
  var s = cargaNormaliza(v);
  var m = s.match(/^([a-z]{3})[a-z]*\.?[\/\-\s]?(\d{2,4})?/);
  if (!m || CARGA_MES_TXT[m[1]] === undefined) return null;
  var ano = m[2] ? parseInt(m[2], 10) : new Date().getFullYear();
  if (ano < 100) ano += 2000;
  return { mes: CARGA_MES_TXT[m[1]], idx: CARGA_MES_TXT[m[1]], ano: ano };
}

/* Cabeçalho novo no formato do antigo: Date vira Date do ano destino; texto
   troca "26"/"2026" por "25"/"2025". */
function cargaTrocarAno(rotulo, de, para, idxMes) {
  if (Object.prototype.toString.call(rotulo) === '[object Date]') return new Date(para, idxMes, 1);
  var s = String(rotulo);
  if (s.indexOf(String(de)) >= 0) return s.replace(String(de), String(para));
  return s.replace(String(de).slice(2), String(para).slice(2));
}
