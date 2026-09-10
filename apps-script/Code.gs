/**
 * DASHBOARD PPCP — Web App de leitura da planilha
 * ────────────────────────────────────────────────────────────────────────────
 * Publique como Web App (Implantar › Nova implantação › Tipo: App da Web,
 * "Executar como: eu", "Quem tem acesso: qualquer pessoa") e cole a URL /exec
 * em SHEETS_WEBAPP_URL no index.html.
 *
 * doGet — o dashboard lê a planilha ao abrir:
 *   1. Lê a aba HISTORICO (uma linha por mês) e devolve os campos que o
 *      dashboard conhece;
 *   2. Puxa a previsão de produção da aba PLANO MESTRE (linha TOTAL GERAL),
 *      que passa a ser a fonte única do plano — não é preciso repetir o
 *      número no HISTORICO nem manter as duas pontas em dia na mão;
 *   3. Normaliza número em formato brasileiro. Sem isso, uma célula gravada
 *      como texto "33.291" chega ao JavaScript como 33,291 (trinta e três) e
 *      "11,52" chega como NaN → 0. Os dois casos existem hoje na planilha.
 *
 * doPost — o dashboard grava de volta (importar Excel, editar ou excluir mês).
 *   Casa cada registro por mês+ano: atualiza a linha existente e acrescenta a
 *   que não existir, preservando a ordem das colunas da planilha. NÃO escreve
 *   na coluna de previsão nem na aba PLANO MESTRE: o plano é do planejamento,
 *   e deixar o app sobrescrevê-lo permitiria apagar o plano sem querer.
 *
 * METAS — uma linha por meta (chave | valor | unidade | vigencia | origem |
 *   observacao). doGet devolve em `metas`; o painel sobrescreve as constantes
 *   META_EF, META_ABS, ABS_ATENCAO, META_DEP_HE, META_TICKET e DUTEIS com o
 *   que estiver aqui. O app NÃO escreve nesta aba: meta se muda na planilha,
 *   com origem e vigência, não no navegador. Rode criarAbaMetas() uma vez.
 *
 * ACOES — plano de ação da Reunião do Mês (uma linha por ação/decisão).
 *   doGet devolve a aba inteira em `acoes`; doPost aceita { secret, acoes:[…] }
 *   e casa cada item pelo `id`. Quem tem `atualizadoEm` mais novo vence: dois
 *   navegadores editando a mesma ação não se sobrescrevem às cegas. A aba é
 *   criada na primeira gravação, com o cabeçalho de ACOES_CAMPOS.
 */

/* Aba com uma linha por mês (a que alimenta o dashboard). */
var ABA_HISTORICO = 'HISTORICO';
/* Aba matriz do Planejamento Mestre (lotes nas linhas × meses nas colunas). */
var ABA_PLANO = 'PLANO MESTRE';
/* Rótulo da linha de totais dentro da aba do plano. */
var LINHA_TOTAL = 'TOTAL GERAL';
/* Linha opcional com o plano em volumes (a embalagem trabalha por volume;
   um produto vira um ou mais volumes). Sem ela, nada muda — o dashboard
   segue convertendo por fator realizado. */
var LINHA_VOLUMES = 'TOTAL VOLUMES';
/* Aba com as linhas do reporte mensal do ERP (mes, ano, codigo, descricao,
   quantidade) — alimentada pelo ReporteVolumes.gs. O dashboard usa para a
   listagem de produtos produzidos por código. */
var ABA_REPORTE = 'REPORTE_VOLUMES';
/* Aba do plano de ação da Reunião do Mês. Uma linha por ação ou decisão. */
var ABA_ACOES = 'ACOES';
/* Aba de metas oficiais. Chaves = nomes das constantes do painel. */
var ABA_METAS = 'METAS';
var METAS_PADRAO = [
  ['chave','valor','unidade','vigencia','origem','observacao'],
  ['META_EF',     90,  '%',   '2026-01', 'PPCP',      'Independência de HE mínima: produção em jornada normal ÷ meta derivada da planilha'],
  ['META_ABS',    3,   '%',   '2026-01', 'RH',        'Absenteísmo (faltas + atrasos ÷ h. normais): dentro da meta até este valor. Histórico 2025-26: 9% a 17%'],
  ['ABS_ATENCAO', 6,   '%',   '2026-01', 'RH',        'Absenteísmo acima disto é crítico'],
  ['META_DEP_HE', 8,   '%',   '2026-01', 'PPCP',      'Máximo do volume entregue que pode vir de hora extra'],
  ['META_TICKET', 250, 'R$',  '2026-01', 'Comercial', 'Ticket médio mínimo (R$ por peça faturada). 250 é a média histórica dos 18 meses (R$ 247,69), não uma meta decidida'],
  ['DUTEIS',      22,  'dias','2026-01', 'PPCP',      'Dias úteis de referência por mês (capacidade teórica e carteira em dias)']
];
var ACOES_CAMPOS = ['id','tipo','prioridade','kpi','desvio','causa','acao',
  'responsavel','prazo','status','mesRef','criadoEm','atualizadoEm'];

var MESES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

/* Precisa ser igual a SHEETS_SECRET no index.html. Não é segurança de
   verdade — o valor viaja no JavaScript da página, que é público. Serve para
   evitar escrita acidental por quem esbarrar na URL. */
var SECRET = 'TROQUE_ESTA_SENHA_2026';

/* Colunas que o app NÃO pode sobrescrever ao gravar. A previsão vem do
   PLANO MESTRE; se o app pudesse escrevê-la, um dado local desatualizado
   apagaria o plano. */
var COLUNAS_PROTEGIDAS = ['previsaoproducao', 'previsao', 'previsaovolumes'];

function doGet() {
  var saida;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dados = lerHistorico(ss);
    var plano = lerPlanoMestre(ss);
    aplicarPlano(dados, plano);
    saida = { ok: true, dados: dados, plano: plano.produtos,
              planoVolumes: plano.volumes, planoLotes: plano.lotes,
              producaoItens: lerReporteVolumes(ss),
              acoes: lerAcoes(ss),
              metas: lerMetas(ss),
              geradoEm: new Date().toISOString() };
  } catch (e) {
    saida = { ok: false, erro: String(e && e.message || e) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(saida))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ══ ESCRITA ══
   O app envia { secret, dados:[...] } como text/plain, em modo no-cors — ele
   não lê a resposta, mas devolvemos JSON assim mesmo para dar para testar a
   URL na mão. */
function doPost(e) {
  var saida;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);   /* duas abas salvando ao mesmo tempo não se atropelam */
    var corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && corpo.secret !== SECRET) throw new Error('Senha inválida.');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var recebidos = corpo.dados;
    var acoes = corpo.acoes;
    var temDados = recebidos && recebidos.length;
    var temAcoes = acoes && acoes.length;
    if (!temDados && !temAcoes) throw new Error('Nada para gravar.');

    saida = { ok: true };
    if (temDados) {
      var res = gravarHistorico(ss, recebidos);
      saida.atualizados = res.atualizados; saida.incluidos = res.incluidos;
    }
    if (temAcoes) {
      var ra = gravarAcoes(ss, acoes);
      saida.acoesAtualizadas = ra.atualizados; saida.acoesIncluidas = ra.incluidas;
      saida.acoesIgnoradas = ra.ignoradas;
    }
  } catch (err) {
    saida = { ok: false, erro: String(err && err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
  return ContentService
    .createTextOutput(JSON.stringify(saida))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Ordem usada só quando a aba precisa ser criada do zero. Depois disso, quem
   manda é o cabeçalho que estiver na planilha — colunas podem ser
   reordenadas ou acrescentadas sem quebrar nada. */
var CAMPOS_PADRAO = ['mes','ano','colaboradores','horasCarga','faltas','atraso',
  'totalFaltaAtraso','absenteismo','horasNormais','extra50','extra100',
  'totalExtras','horasTotais','producaoReal','prodSemExtras','meta',
  'eficiencia','eficienciaAdj','margem','ticketMedio','custoCap',
  'qtdeFaturado','diasTrabalhados','qtdeVendida','previsaoProducao','horasFerias'];

function gravarHistorico(ss, recebidos) {
  var aba = ss.getSheetByName(ABA_HISTORICO);
  if (!aba) {
    aba = ss.insertSheet(ABA_HISTORICO);
    aba.getRange(1, 1, 1, CAMPOS_PADRAO.length).setValues([CAMPOS_PADRAO]);
  } else if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, CAMPOS_PADRAO.length).setValues([CAMPOS_PADRAO]);
  }

  var linhas = aba.getDataRange().getValues();
  var iCab = acharCabecalho(linhas);
  var cab = linhas[iCab];

  /* nome normalizado da coluna → índice, para casar com os campos do app */
  var col = {};
  for (var c = 0; c < cab.length; c++) {
    var n = normaliza(cab[c]);
    if (!n) continue;
    if (n.indexOf('previsao') === 0) n = 'previsaoproducao';
    if (n.indexOf('ferias') >= 0)    n = 'horasferias';
    if (col[n] === undefined) col[n] = c;
  }
  if (col.mes === undefined || col.ano === undefined) {
    throw new Error('Colunas "mes" e "ano" não encontradas em ' + ABA_HISTORICO + '.');
  }

  /* mês+ano → número da linha na planilha */
  var mapa = {};
  for (var r = iCab + 1; r < linhas.length; r++) {
    var m = String(linhas[r][col.mes] || '').trim().toUpperCase().slice(0, 3);
    var a = num(linhas[r][col.ano]);
    if (MESES.indexOf(m) >= 0 && a) mapa[m + '/' + a] = r;
  }

  var atualizados = 0, incluidos = 0;
  recebidos.forEach(function (rec) {
    var mes = String(rec.mes || '').trim().toUpperCase().slice(0, 3);
    var ano = num(rec.ano);
    if (MESES.indexOf(mes) < 0 || !ano) return;

    var chave = mes + '/' + ano;
    var idx = mapa[chave];
    var linha;
    if (idx === undefined) {
      linha = new Array(cab.length).fill('');
      linhas.push(linha);
      idx = linhas.length - 1;
      mapa[chave] = idx;
      incluidos++;
    } else {
      linha = linhas[idx];
      atualizados++;
    }

    Object.keys(rec).forEach(function (campo) {
      var n = normaliza(campo);
      if (n === 'id') return;
      if (COLUNAS_PROTEGIDAS.indexOf(n) >= 0) return;
      var c = col[n];
      if (c === undefined) return;      /* campo que a planilha não tem: ignora */
      linha[c] = rec[campo];
    });
    linha[col.mes] = mes;
    linha[col.ano] = ano;
  });

  /* uma escrita só — muito mais rápido que célula a célula */
  var largura = cab.length;
  var bloco = linhas.slice(iCab + 1).map(function (l) {
    var out = l.slice(0, largura);
    while (out.length < largura) out.push('');
    return out;
  });
  if (bloco.length) {
    aba.getRange(iCab + 2, 1, bloco.length, largura).setValues(bloco);
  }
  return { atualizados: atualizados, incluidos: incluidos };
}

function acharCabecalho(linhas) {
  for (var i = 0; i < Math.min(linhas.length, 20); i++) {
    var norm = linhas[i].map(function (c) { return normaliza(c); });
    if (norm.indexOf('mes') >= 0 && norm.indexOf('ano') >= 0) return i;
  }
  throw new Error('Cabeçalho com "mes" e "ano" não encontrado em ' + ABA_HISTORICO + '.');
}

/* ══ NÚMEROS ══
   Aceita number puro, "1.234", "1.234,56", "1234,56", "R$ 1.234,56", "12%",
   "-", vazio. Devolve sempre Number. */
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (Object.prototype.toString.call(v) === '[object Date]') return 0;

  var s = String(v).trim();
  if (!s || s === '-' || s === '—') return 0;
  s = s.replace(/\s| /g, '').replace(/R\$/gi, '').replace(/%/g, '');

  if (s.indexOf(',') >= 0) {
    /* vírgula é o decimal: pontos que restarem são separador de milhar */
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    /* só pontos e todos em grupos de 3 → separador de milhar, não decimal.
       É este caso que salva "33.291" de virar 33,291. */
    s = s.replace(/\./g, '');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function txt(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/* ══ HISTORICO ══ */
function lerHistorico(ss) {
  var aba = ss.getSheetByName(ABA_HISTORICO);
  if (!aba) throw new Error('Aba "' + ABA_HISTORICO + '" não encontrada.');
  var linhas = aba.getDataRange().getValues();
  if (!linhas.length) return [];

  /* A linha de cabeçalho é a que traz "mes" e "ano" — não assumimos que é a
     primeira, porque a planilha pode ganhar título ou linha em branco. */
  var iCab = acharCabecalho(linhas);
  var cab = linhas[iCab];
  var out = [];
  for (var r = iCab + 1; r < linhas.length; r++) {
    var linha = linhas[r];
    var rec = {};
    for (var c = 0; c < cab.length; c++) {
      var nome = txt(cab[c]);
      if (!nome) continue;
      rec[nome] = linha[c];
    }
    var mes = txt(rec.mes || rec.Mes || rec.MES).toUpperCase().slice(0, 3);
    var ano = num(rec.ano || rec.Ano || rec.ANO);
    if (MESES.indexOf(mes) < 0 || !ano) continue;   /* linha vazia ou de rodapé */

    /* converte tudo que não é texto para número normalizado */
    Object.keys(rec).forEach(function (k) {
      if (normaliza(k) === 'mes') { rec[k] = mes; return; }
      rec[k] = num(rec[k]);
    });
    rec.mes = mes;
    rec.ano = ano;
    out.push(rec);
  }
  return out;
}

/* ══ PLANO MESTRE ══
   Devolve { produtos: { '2026': { JAN: 22828, ... } }, volumes: {...},
   lotes: [{ lote:'032-26', meses:{ '2026': { SET: 9000 } } }, ...] }
   lendo as linhas TOTAL GERAL e TOTAL VOLUMES (opcional), a matriz de lotes
   entre o cabeçalho e o total, e o cabeçalho de meses da própria aba. */
function lerPlanoMestre(ss) {
  var plano = { produtos: {}, volumes: {}, lotes: [] };
  var aba = ss.getSheetByName(ABA_PLANO);
  if (!aba) return plano;

  var linhas = aba.getDataRange().getValues();
  var iTotal = -1, iVol = -1, iMes = -1;
  for (var i = 0; i < linhas.length; i++) {
    var a = normaliza(linhas[i][0]);
    if (iTotal < 0 && a === normaliza(LINHA_TOTAL)) iTotal = i;
    if (iVol < 0 && a === normaliza(LINHA_VOLUMES)) iVol = i;
    if (iMes < 0 && contaMeses(linhas[i]) >= 6) iMes = i;
  }
  if (iTotal < 0 || iMes < 0) return plano;

  var cab = linhas[iMes];
  function lerLinha(idx, destino) {
    if (idx < 0) return;
    for (var c = 1; c < cab.length; c++) {
      var mv = mesEAno(cab[c]);
      if (!mv) continue;
      var v = num(linhas[idx][c]);
      if (!v) continue;
      var chave = String(mv.ano);
      if (!destino[chave]) destino[chave] = {};
      destino[chave][mv.mes] = v;
    }
  }
  lerLinha(iTotal, plano.produtos);
  lerLinha(iVol, plano.volumes);

  /* Matriz de lotes: as linhas entre o cabeçalho de meses e o TOTAL GERAL.
     É a programação em si — cada linha diz quanto de cada lote está
     programado em cada mês. Linha sem código ou de total não entra. */
  for (var r = iMes + 1; r < iTotal; r++) {
    var codigo = txt(linhas[r][0]);
    if (!codigo || normaliza(codigo).indexOf('total') === 0) continue;
    var meses = {};
    lerLinha(r, meses);
    if (!Object.keys(meses).length) continue;   /* lote sem quantidade nenhuma */
    plano.lotes.push({ lote: codigo, meses: meses });
  }
  return plano;
}

/* ══ REPORTE (produtos produzidos por código) ══
   Linhas cruas da REPORTE_VOLUMES, compactadas em arrays [mes, ano, codigo,
   descricao, qtd] para o payload não inchar. Aba ausente ou vazia → []. */
function lerReporteVolumes(ss) {
  var aba = ss.getSheetByName(ABA_REPORTE);
  if (!aba || aba.getLastRow() < 2) return [];
  var v = aba.getRange(2, 1, aba.getLastRow() - 1, 5).getValues();
  var out = [];
  v.forEach(function (l) {
    var mes = String(l[0] || '').trim().toUpperCase().slice(0, 3);
    var ano = num(l[1]);
    var qtd = num(l[4]);
    if (MESES.indexOf(mes) < 0 || !ano || !qtd) return;
    out.push([mes, ano, String(l[2] || '').trim(), String(l[3] || '').trim(), qtd]);
  });
  return out;
}

/* Copia a previsão do plano para os registros do histórico. O plano manda:
   onde ele tem número, ele vence o que estiver no HISTORICO. */
function aplicarPlano(dados, plano) {
  dados.forEach(function (r) {
    var doAno = plano.produtos[String(r.ano)];
    if (doAno && doAno[r.mes] > 0) r.previsaoProducao = doAno[r.mes];
    var volAno = plano.volumes[String(r.ano)];
    if (volAno && volAno[r.mes] > 0) r.previsaoVolumes = volAno[r.mes];
  });
}

/* ══ METAS ══
   Devolve { META_EF: { valor: 90, unidade: '%', vigencia: '2026-01', origem: 'PPCP',
   observacao: '…' }, … }. Só chaves com valor numérico entram — célula vazia ou
   texto é ignorada e o painel fica com o padrão do código. Aba ausente → {}. */
function lerMetas(ss) {
  var aba = ss.getSheetByName(ABA_METAS);
  if (!aba || aba.getLastRow() < 2) return {};
  var linhas = aba.getDataRange().getValues();
  var cab = linhas[0].map(function (c) { return normaliza(c); });
  var iChave = cab.indexOf('chave'), iValor = cab.indexOf('valor');
  if (iChave < 0 || iValor < 0) return {};
  var out = {};
  for (var r = 1; r < linhas.length; r++) {
    var chave = txt(linhas[r][iChave]);
    if (!chave) continue;
    var v = num(linhas[r][iValor]);
    if (!(v > 0)) continue;
    var rec = { valor: v };
    for (var c = 0; c < cab.length; c++) {
      if (c === iChave || c === iValor || !cab[c]) continue;
      rec[cab[c]] = acaoTxt(linhas[r][c]);
    }
    out[chave] = rec;
  }
  return out;
}

/* Cria a aba METAS com os valores que hoje estão no código do painel.
   Rode uma vez (Executar › criarAbaMetas). Se a aba já existir, não mexe. */
function criarAbaMetas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(ABA_METAS)) {
    SpreadsheetApp.getUi().alert('Aba ' + ABA_METAS + ' já existe — nada foi alterado.');
    return;
  }
  var aba = ss.insertSheet(ABA_METAS);
  aba.getRange(1, 1, METAS_PADRAO.length, METAS_PADRAO[0].length).setValues(METAS_PADRAO);
  aba.setFrozenRows(1);
  aba.getRange(1, 1, 1, METAS_PADRAO[0].length).setFontWeight('bold');
  aba.setColumnWidth(6, 520);
  try { SpreadsheetApp.getUi().alert('Aba ' + ABA_METAS + ' criada com os valores atuais do painel. Ao mudar um valor aqui, o painel aplica na próxima abertura.'); } catch (e) {}
}

/* ══ ACOES (plano de ação da Reunião do Mês) ══
   Tudo é texto: id, datas em ISO (AAAA-MM-DD) e status por extenso. O Sheets
   converte "2026-09-30" em Data sozinho, por isso a leitura devolve Data como
   ISO de novo — senão o painel receberia um timestamp e a comparação de prazo
   quebraria. Aba ausente → []. */
function lerAcoes(ss) {
  var aba = ss.getSheetByName(ABA_ACOES);
  if (!aba || aba.getLastRow() < 2) return [];
  var linhas = aba.getDataRange().getValues();
  var cab = linhas[0].map(function (c) { return txt(c); });
  var out = [];
  for (var r = 1; r < linhas.length; r++) {
    var rec = {};
    for (var c = 0; c < cab.length; c++) {
      if (!cab[c]) continue;
      rec[cab[c]] = acaoTxt(linhas[r][c]);
    }
    if (!rec.id) continue;
    out.push(rec);
  }
  return out;
}

function gravarAcoes(ss, recebidas) {
  var aba = ss.getSheetByName(ABA_ACOES);
  if (!aba) {
    aba = ss.insertSheet(ABA_ACOES);
    aba.getRange(1, 1, 1, ACOES_CAMPOS.length).setValues([ACOES_CAMPOS]);
    aba.setFrozenRows(1);
  } else if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, ACOES_CAMPOS.length).setValues([ACOES_CAMPOS]);
  }
  var linhas = aba.getDataRange().getValues();
  var cab = linhas[0].map(function (c) { return txt(c); });
  var col = {};
  cab.forEach(function (n, i) { if (n && col[n] === undefined) col[n] = i; });
  if (col.id === undefined) throw new Error('Coluna "id" não encontrada em ' + ABA_ACOES + '.');

  var mapa = {};
  for (var r = 1; r < linhas.length; r++) {
    var id = acaoTxt(linhas[r][col.id]);
    if (id) mapa[id] = r;
  }

  var atualizados = 0, incluidas = 0, ignoradas = 0;
  recebidas.forEach(function (a) {
    if (!a || !a.id) return;
    var id = String(a.id);
    var idx = mapa[id];
    var linha;
    if (idx === undefined) {
      linha = new Array(cab.length).fill('');
      linhas.push(linha);
      idx = linhas.length - 1;
      mapa[id] = idx;
      incluidas++;
    } else {
      linha = linhas[idx];
      /* A planilha tem versão mais nova desta ação: outro navegador editou
         depois. Não sobrescrever. */
      var naPlanilha = acaoTxt(linha[col.atualizadoEm]);
      if (naPlanilha && a.atualizadoEm && naPlanilha > String(a.atualizadoEm)) { ignoradas++; return; }
      atualizados++;
    }
    Object.keys(a).forEach(function (campo) {
      var c = col[campo];
      if (c === undefined) return;
      linha[c] = (a[campo] === null || a[campo] === undefined) ? '' : String(a[campo]);
    });
  });

  var largura = cab.length;
  var bloco = linhas.slice(1).map(function (l) {
    var out = l.slice(0, largura);
    while (out.length < largura) out.push('');
    return out;
  });
  if (bloco.length) {
    /* Como texto: impede o Sheets de reconverter prazo em Data e id em número. */
    var rng = aba.getRange(2, 1, bloco.length, largura);
    rng.setNumberFormat('@');
    rng.setValues(bloco);
  }
  return { atualizados: atualizados, incluidas: incluidas, ignoradas: ignoradas };
}

/* Célula da ACOES → texto. Data vira ISO (AAAA-MM-DD). */
function acaoTxt(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var m = v.getMonth() + 1, d = v.getDate();
    return v.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  return String(v).trim();
}

/* ══ HELPERS DE CABEÇALHO ══ */
function normaliza(v) {
  return String(v === null || v === undefined ? '' : v)
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

var _MES_TXT = { jan:'JAN', fev:'FEV', mar:'MAR', abr:'ABR', mai:'MAI', jun:'JUN',
                 jul:'JUL', ago:'AGO', set:'SET', out:'OUT', nov:'NOV', dez:'DEZ' };

/* Aceita "jan./26", "JAN/2026", "jan-26" ou uma Data — o Sheets converte
   alguns desses cabeçalhos em data sozinho. */
function mesEAno(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return { mes: MESES[v.getMonth()], ano: v.getFullYear() };
  }
  var s = normaliza(v);
  if (!s) return null;
  var m = s.match(/^([a-z]{3})[a-z]*\.?[\/\-\s]?(\d{2,4})?/);
  if (!m || !_MES_TXT[m[1]]) return null;
  var ano = m[2] ? parseInt(m[2], 10) : new Date().getFullYear();
  if (ano < 100) ano += 2000;
  return { mes: _MES_TXT[m[1]], ano: ano };
}

function contaMeses(linha) {
  var n = 0;
  for (var i = 0; i < linha.length; i++) if (mesEAno(linha[i])) n++;
  return n;
}

/* ══ TESTE MANUAL ══
   Rode no editor do Apps Script antes de implantar (Executar › testeManual).
   Não escreve nada: só lê e mostra o resultado no Registro de execução. */
function testeManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var plano = lerPlanoMestre(ss);
  Logger.log('Plano lido do ' + ABA_PLANO + ': ' + JSON.stringify(plano.produtos));
  Logger.log('Plano em volumes (' + LINHA_VOLUMES + '): '
    + (Object.keys(plano.volumes).length ? JSON.stringify(plano.volumes) : 'linha ausente — dashboard usa fator realizado'));
  Logger.log('Lotes programados: ' + plano.lotes.length
    + (plano.lotes.length ? ' (' + plano.lotes.map(function (l) { return l.lote; }).join(', ') + ')' : ''));

  var dados = lerHistorico(ss);
  aplicarPlano(dados, plano);
  Logger.log('Meses no ' + ABA_HISTORICO + ': ' + dados.length);
  var metas = lerMetas(ss);
  Logger.log('Metas na ' + ABA_METAS + ': ' + (Object.keys(metas).length
    ? Object.keys(metas).map(function (k) { return k + '=' + metas[k].valor; }).join(', ')
    : 'aba ausente — rode criarAbaMetas(); o painel usa os padrões do código'));
  var acoes = lerAcoes(ss);
  Logger.log('Ações na ' + ABA_ACOES + ': ' + acoes.length
    + (acoes.length ? ' (' + acoes.filter(function (a) { return a.status !== 'Concluída' && a.status !== 'Cancelada'; }).length + ' em aberto)' : ' — aba ausente ou vazia, criada na primeira gravação'));

  dados.filter(function (r) { return r.ano === new Date().getFullYear(); })
       .forEach(function (r) {
    Logger.log(r.mes + '/' + r.ano
      + ' | produção ' + r.producaoReal
      + ' | s/ extras ' + r.prodSemExtras
      + ' | previsão ' + r.previsaoProducao
      + ' | dias ' + r.diasTrabalhados);
  });

  /* Conferência de tipo: aqui é onde "33.291" gravado como texto aparecia
     como 33,291 antes da normalização. */
  var suspeitos = dados.filter(function (r) {
    return r.producaoReal > 0 && r.producaoReal < 1000;
  });
  if (suspeitos.length) {
    Logger.log('⚠ Produção suspeita (menor que 1.000 peças) — confira se a '
      + 'célula está formatada como número: '
      + suspeitos.map(function (r) { return r.mes + '/' + r.ano + '=' + r.producaoReal; }).join(', '));
  } else {
    Logger.log('✓ Nenhum valor de produção com cara de texto mal convertido.');
  }
}
