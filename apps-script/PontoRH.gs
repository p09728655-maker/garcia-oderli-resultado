/**
 * PONTO RH — do Extrato de Totais do ponto para a HISTORICO
 * ─────────────────────────────────────────────────────────
 * O relatório "Extrato de Totais" do ponto sai com a fábrica inteira, uma
 * linha por pessoa: Nº Folha | Nome | Carga | Faltas | Atras. | Ex50% |
 * Ex100% | Normais. Não tem setor. Até SET/26 alguém separava os diretos
 * na mão, somava e digitava seis números no Excel. Este script faz isso:
 *
 *   1. Salve o arquivo do mês na pasta PONTO RH do Drive. O ".xls" que o
 *      ponto exporta é um xlsx com outro nome; os dois formatos entram.
 *   2. processarPontoDrive() converte para Planilha Google, lê o extrato,
 *      cruza cada Nº Folha com a aba FUNCIONARIOS (quem é direto), soma o
 *      grupo e lança na HISTORICO: colaboradores, horasCarga, horasNormais,
 *      extra50, extra100 e três colunas brutas do ponto: naoTrabalhadas,
 *      faltasPonto, atrasosPonto. O arquivo vai para PROCESSADOS. Rodar
 *      duas vezes no mesmo mês só regrava — não duplica.
 *   3. O painel (DashUtils.normalizar) deriva faltas e atraso daí:
 *        atraso = atrasosPonto
 *        faltas = naoTrabalhadas − horasFerias − atraso
 *      porque o ponto não enxerga falta justificada: atestado, afastamento
 *      e licença não aparecem em "Faltas", reduzem a "Carga". O que o
 *      painel chama de falta é tudo que não foi trabalhado, tirando
 *      férias — a mesma conta que era feita na mão (AGO/26: 2.050 h).
 *
 * O QUE O PONTO DIZ (conferido no extrato de AGO/26, 142 pessoas)
 *   Carga   = horas escaladas no mês: 8,8 h × dias úteis, líquida de dias
 *             de férias e afastamento. Mês cheio em agosto = 184,8 h.
 *   Normais = Carga − Faltas − Atrasos = horas trabalhadas na jornada normal.
 *   Faltas  = só as sem justificativa.
 * Jornada cheia do mês = a carga mais frequente entre os diretos (moda);
 * não depende de calendário de feriados. naoTrabalhadas = jornada cheia ×
 * diretos − Normais (inclui férias; o painel desconta as férias lançadas).
 *
 * CONTROLE DE FALTAS (o outro arquivo da mesma pasta)
 *   A planilha CONTROLE_FALTAS_aaaa.xlsx do RH tem a aba BASE, um registro
 *   por pessoa por dia com STATUS (FALTA, ATESTADO, AFASTADO, ATRASO, FÉRIAS),
 *   HORAS FALTA e HORAS FÉRIAS, e a aba DP com a lista de funcionários
 *   (Cód, Nome, Setor, STATUS, DT. ADMISSÃO, DT. DEMISSÃO). Salva na mesma
 *   pasta, o script:
 *     • atualiza a aba FUNCIONARIOS a partir da DP (direto = setor está em
 *       PR_SETORES_DIRETOS), para ninguém manter lista na mão;
 *     • soma, mês a mês e só para os diretos, as horas por status e grava na
 *       HISTORICO: ausFalta, ausAtestado, ausAfastado, ausAtraso e
 *       horasFerias. O painel deriva faltas = ausFalta + ausAtestado +
 *       ausAfastado e atraso = atrasosPonto (o ponto mede o relógio; o
 *       controle só tem o que o líder anota: AGO/26 207,6 h × 12,3 h), ou
 *       ausAtraso sem ponto — a mesma conta que era feita na mão,
 *       mas na MESMA base das horas (até SET/26 as faltas vinham do
 *       departamento 2-PRODUÇÃO inteiro, 18 setores, e as horas dos 11
 *       diretos: o absenteísmo dividia uma coisa pela outra).
 *   Quando as ausências existem, elas mandam; o naoTrabalhadas do ponto vira
 *   conferência (integridade avisa se divergirem demais).
 *
 * Aba FUNCIONARIOS: codigo | nome | setor | direto (S/N) | admissao | obs.
 * Rode criarAbaFuncionarios() uma vez e cole a lista. Código do extrato
 * que não estiver na aba entra como pendência no aviso e NÃO é somado —
 * melhor um aviso do que um número errado. A admissao é respeitada: quem
 * foi admitido depois do último dia do mês do extrato não conta naquele
 * mês (o ponto já lista a pessoa com carga zero assim que ela é
 * cadastrada) e passa a contar sozinho no mês seguinte.
 */
var PR_PASTA        = 'PONTO RH';
var PR_PROCESSADOS  = 'PROCESSADOS';
var PR_ABA_FUNC     = 'FUNCIONARIOS';
var PR_ABA_LOG      = 'PONTO';
var PR_ABA_HISTORICO = 'HISTORICO';
var PR_MESES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
/* Setores que contam como produção direta — a mesma régua para horas do ponto
   e para faltas do controle. Mude aqui se um setor entrar ou sair da fábrica. */
var PR_SETORES_DIRETOS = ['1-USINAGEM','2-EMBALAGEM','3-ACABAMENTO','6-PINTURA DE BORDA','7-LINHA DE PINTURA',
  '16-COLAGEM DE BORDA','17-FURAÇÃO','21-GERAL','29-CORTE','25-MONTAGEM','35-CONTROLE DE PRODUÇÃO'];

/* ══ 1 · FUNCIONARIOS ══ */
function criarAbaFuncionarios() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(PR_ABA_FUNC)) { prAvisar('Aba ' + PR_ABA_FUNC + ' já existe — nada foi alterado.'); return; }
  var aba = ss.insertSheet(PR_ABA_FUNC);
  aba.getRange(1, 1, 1, 7).setValues([['codigo', 'nome', 'setor', 'direto', 'admissao', 'demissao', 'observacao']]).setFontWeight('bold');
  aba.getRange(2, 1, 1, 7).setValues([['', '', '', '', '', '', 'Uma linha por pessoa. codigo = Nº Folha do ponto. direto = S entra na soma da HISTORICO. A aba é regravada a partir da DP do CONTROLE FALTAS quando ele é processado.']]);
  aba.setColumnWidth(2, 260); aba.setColumnWidth(3, 200); aba.setColumnWidth(7, 520);
  prAvisar('Aba ' + PR_ABA_FUNC + ' criada. Cole a lista (codigo, nome, setor, direto S/N) a partir da linha 2.');
}

function prLerFuncionarios(ss) {
  var aba = ss.getSheetByName(PR_ABA_FUNC);
  if (!aba || aba.getLastRow() < 2) return null;
  var v = aba.getDataRange().getValues();
  var cab = v[0].map(prNormaliza), col = {};
  cab.forEach(function (c, i) { if (col[c] === undefined) col[c] = i; });
  if (col.codigo === undefined || col.direto === undefined) return null;
  var mapa = {}, diretos = 0;
  for (var i = 1; i < v.length; i++) {
    var cod = String(v[i][col.codigo] || '').trim().replace(/\.0$/, '');
    if (!cod) continue;
    var direto = /^s/i.test(String(v[i][col.direto] || '').trim());
    mapa[cod] = { nome: String(v[i][col.nome] || ''), setor: String(v[i][col.setor] || ''), direto: direto,
                  admissao: col.admissao !== undefined ? prData(v[i][col.admissao]) : null,
                  demissao: col.demissao !== undefined ? prData(v[i][col.demissao]) : null };
    if (direto) diretos++;
  }
  return { mapa: mapa, diretos: diretos };
}

/* Data em Date, "dd/mm/aaaa" ou "aaaa-mm-dd" → Date; senão null. */
function prData(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v === null || v === undefined ? '' : v).trim(), m;
  if (!s) return null;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return null;
}

/* ══ 2 · LEITURA DO EXTRATO ══ */
/* "184:48", "7 days, 16:48:00", "23443:12", número em dias (Sheets) → horas */
function prHoras(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v * 24 : 0;
  if (v instanceof Date) return v.getHours() + v.getMinutes() / 60 + v.getSeconds() / 3600;
  var s = String(v).trim(), d = 0, m;
  if (!s) return 0;
  m = s.match(/^(\d+)\s*days?,\s*(.*)$/i);
  if (m) { d = parseInt(m[1], 10); s = m[2]; }
  m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return d * 24 + parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + (m[3] ? parseInt(m[3], 10) / 3600 : 0);
  var n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/* Lê a planilha convertida. Devolve { mes, ano, pessoas:[{codigo, nome,
   carga, faltas, atrasos, e50, e100, normais}] }. Usa getDisplayValues:
   duração vem como "184:48" seja qual for o tipo da célula. */
function prExtrair(sheet) {
  var disp = sheet.getDataRange().getDisplayValues();
  var mes = null, ano = null, iCab = -1, col = {};
  for (var i = 0; i < disp.length; i++) {
    var linha = disp[i];
    for (var j = 0; j < linha.length && (mes === null || iCab < 0); j++) {
      var s = String(linha[j] || '');
      var mp = s.match(/de:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
      if (mp && mes === null) { mes = PR_MESES[parseInt(mp[2], 10) - 1]; ano = parseInt(mp[3], 10); }
    }
    if (iCab < 0) {
      var norm = linha.map(prNormaliza);
      if (norm.indexOf('carga') >= 0 && norm.indexOf('normais') >= 0) {
        iCab = i;
        norm.forEach(function (n, c) {
          if (/^n[º°o]?\s*folha|^codigo|^matricula/.test(n)) col.codigo = c;
          else if (n === 'nome') col.nome = c;
          else if (n === 'carga') col.carga = c;
          else if (n === 'faltas') col.faltas = c;
          else if (n.indexOf('atras') === 0) col.atrasos = c;
          else if (n.replace(/\s/g, '') === 'ex50%') col.e50 = c;
          else if (n.replace(/\s/g, '') === 'ex100%') col.e100 = c;
          else if (n === 'normais') col.normais = c;
        });
      }
    }
  }
  if (iCab < 0) throw new Error('não achei o cabeçalho (Carga … Normais) no extrato');
  if (col.codigo === undefined) col.codigo = 0;
  if (col.nome === undefined) col.nome = 1;
  if (!mes) throw new Error('não achei o período "De: dd/mm/aaaa" no extrato');
  var pessoas = [];
  for (var r = iCab + 1; r < disp.length; r++) {
    var l = disp[r];
    var cod = String(l[col.codigo] || '').trim();
    if (!/^\d+$/.test(cod)) continue;                 /* rodapé TOTAIS, linhas vazias */
    pessoas.push({
      codigo: cod, nome: String(l[col.nome] || '').trim(),
      carga: prHoras(l[col.carga]), faltas: prHoras(l[col.faltas]), atrasos: prHoras(l[col.atrasos]),
      e50: prHoras(l[col.e50]), e100: prHoras(l[col.e100]), normais: prHoras(l[col.normais])
    });
  }
  if (!pessoas.length) throw new Error('extrato sem linhas de pessoa');
  /* último dia do mês do extrato: quem entrou depois disso não é deste mês */
  var mesIdx = PR_MESES.indexOf(mes);
  return { mes: mes, ano: ano, fim: new Date(ano, mesIdx + 1, 0), pessoas: pessoas };
}

/* ══ 3 · SOMA DOS DIRETOS ══ */
function prAgregar(ext, func) {
  var dir = [], pend = [], depois = [];
  ext.pessoas.forEach(function (p) {
    var f = func.mapa[p.codigo];
    if (!f) { pend.push(p.codigo + ' ' + p.nome); return; }
    if (!f.direto) return;
    if (f.admissao && ext.fim && f.admissao > ext.fim) { depois.push(p.codigo + ' ' + p.nome); return; }
    dir.push(p);
  });
  var soma = function (k) { return dir.reduce(function (a, p) { return a + p[k]; }, 0); };
  /* jornada cheia = carga mais frequente (arredondada a 0,1 h) */
  var cont = {}, jornada = 0, melhor = 0;
  dir.forEach(function (p) { if (p.carga > 0) { var k = Math.round(p.carga * 10) / 10; cont[k] = (cont[k] || 0) + 1; if (cont[k] > melhor) { melhor = cont[k]; jornada = k; } } });
  var a = { n: dir.length, carga: soma('carga'), normais: soma('normais'), faltasPonto: soma('faltas'),
            atrasosPonto: soma('atrasos'), e50: soma('e50'), e100: soma('e100'), jornada: jornada };
  a.naoTrabalhadas = Math.max(0, a.jornada * a.n - a.normais);
  a.pendentes = pend;
  a.admitidosDepois = depois;   /* cadastrados no ponto antes de começar: ficam para o mês da admissão */
  return a;
}

/* ══ 4 · HISTORICO ══ */
function prLancarHistorico(ss, mes, ano, a) {
  var aba = ss.getSheetByName(PR_ABA_HISTORICO);
  if (!aba) throw new Error('aba ' + PR_ABA_HISTORICO + ' não encontrada');
  var linhas = aba.getDataRange().getValues();
  var iCab = -1, col = {};
  for (var i = 0; i < Math.min(linhas.length, 20) && iCab < 0; i++) {
    var norm = linhas[i].map(prNormaliza);
    if (norm.indexOf('mes') >= 0 && norm.indexOf('ano') >= 0) { iCab = i; norm.forEach(function (n, c) { if (col[n] === undefined) col[n] = c; }); }
  }
  if (iCab < 0) throw new Error('cabeçalho com "mes" e "ano" não encontrado na ' + PR_ABA_HISTORICO);
  /* colunas brutas do ponto: cria na primeira coluna livre se faltarem */
  var largura = linhas[iCab].length;
  ['naoTrabalhadas', 'faltasPonto', 'atrasosPonto'].forEach(function (nome) {
    var n = prNormaliza(nome);
    if (col[n] === undefined) {
      while (largura > 0 && !String(linhas[iCab][largura - 1] || '').trim()) largura--;
      aba.getRange(iCab + 1, largura + 1).setValue(nome);
      col[n] = largura; largura++;
    }
  });
  var linha = -1;
  for (var r = iCab + 1; r < linhas.length; r++) {
    var m = String(linhas[r][col.mes] || '').trim().toUpperCase().slice(0, 3);
    if (m === mes && parseInt(linhas[r][col.ano], 10) === ano) { linha = r + 1; break; }
  }
  var criou = false;
  if (linha < 0) {
    linha = aba.getLastRow() + 1;
    aba.getRange(linha, col.mes + 1).setValue(mes);
    aba.getRange(linha, col.ano + 1).setValue(ano);
    criou = true;
  }
  var grava = function (nome, v) { var c = col[prNormaliza(nome)]; if (c !== undefined) aba.getRange(linha, c + 1).setValue(Math.round(v * 100) / 100); };
  grava('colaboradores', a.n);
  grava('horasCarga', a.carga);
  grava('horasNormais', a.normais);
  grava('extra50', a.e50);
  grava('extra100', a.e100);
  grava('naoTrabalhadas', a.naoTrabalhadas);
  grava('faltasPonto', a.faltasPonto);
  grava('atrasosPonto', a.atrasosPonto);
  return criou;
}

function prLog(ss, arquivo, ext, a, criou) {
  var aba = ss.getSheetByName(PR_ABA_LOG) || ss.insertSheet(PR_ABA_LOG);
  if (aba.getLastRow() === 0) {
    aba.appendRow(['processadoEm', 'arquivo', 'mes', 'ano', 'pessoasNoExtrato', 'diretos', 'jornadaCheia', 'carga', 'normais', 'faltasPonto', 'atrasosPonto', 'extra50', 'extra100', 'naoTrabalhadas', 'linhaCriada', 'pendentes (fora da FUNCIONARIOS)']);
    aba.getRange(1, 1, 1, 16).setFontWeight('bold');
  }
  aba.appendRow([new Date(), arquivo, ext.mes, ext.ano, ext.pessoas.length, a.n, a.jornada, a.carga, a.normais, a.faltasPonto, a.atrasosPonto, a.e50, a.e100, a.naoTrabalhadas, criou ? 'sim' : 'não', a.pendentes.join('; ')]);
}

/* ══ 5 · DRIVE → HISTORICO ══ */
function processarPontoDrive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pastas = DriveApp.getFoldersByName(PR_PASTA);
  if (!pastas.hasNext()) return prErro('Pasta "' + PR_PASTA + '" não encontrada no Drive — crie a pasta e solte o extrato do ponto nela.');
  var pasta = pastas.next();
  /* o controle de faltas vai primeiro: ele regrava a FUNCIONARIOS que o extrato usa */
  var todos = [], it = pasta.getFiles();
  while (it.hasNext()) { var f0 = it.next(); if (/\.xlsx?$/i.test(f0.getName()) || f0.getMimeType() === MimeType.GOOGLE_SHEETS) todos.push(f0); }
  todos.sort(function (a, b) { var ca = /controle/i.test(a.getName()) ? 0 : 1, cb = /controle/i.test(b.getName()) ? 0 : 1; return ca - cb; });
  var feitos = [], falhas = [], pend = [];
  todos.forEach(function (arq) {
    try {
      var func = prLerFuncionarios(ss);
      if (!func && !/controle/i.test(arq.getName())) throw new Error('aba ' + PR_ABA_FUNC + ' ausente ou vazia — processe o CONTROLE FALTAS primeiro ou rode criarAbaFuncionarios() e cole a lista');
      var r = prProcessarArquivo(ss, arq, func);
      if (r.tipo === 'controle') {
        feitos.push(arq.getName() + ' → ausências de ' + r.meses + ' mês(es)' + (r.funcionarios ? '; FUNCIONARIOS regravada com ' + r.funcionarios + ' pessoas' : '') + ':\n   ' + r.lancados.join('\n   '));
      } else {
        feitos.push(arq.getName() + ' → ' + r.ext.mes + '/' + r.ext.ano + ': ' + r.a.n + ' diretos, ' + Math.round(r.a.normais) + ' h normais, ' + Math.round(r.a.naoTrabalhadas) + ' h não trabalhadas');
        if (r.a.pendentes.length) pend.push(r.ext.mes + '/' + r.ext.ano + ': ' + r.a.pendentes.join(', '));
        if (r.a.admitidosDepois.length) feitos.push('   admitidos depois de ' + r.ext.mes + '/' + r.ext.ano + ', não contam neste mês: ' + r.a.admitidosDepois.join(', '));
      }
      var sub = pasta.getFoldersByName(PR_PROCESSADOS);
      arq.moveTo(sub.hasNext() ? sub.next() : pasta.createFolder(PR_PROCESSADOS));
    } catch (e) {
      falhas.push(arq.getName() + ': ' + (e && e.message || e));
    }
  });
  prAvisar((feitos.length ? 'Lançado na ' + PR_ABA_HISTORICO + ':\n' + feitos.join('\n') : 'Nenhum extrato novo na pasta "' + PR_PASTA + '".')
    + (pend.length ? '\n\nFORA da FUNCIONARIOS (não somados — cadastre e rode de novo se forem diretos):\n' + pend.join('\n') : '')
    + (falhas.length ? '\n\nFalhas:\n' + falhas.join('\n') : '')
    + '\n\nO painel deriva faltas e atraso das ausências do controle (ou, sem elas, do ponto). O dashboard pega no próximo sync.');
}

function prProcessarArquivo(ss, arq, func) {
  var doc, tmpId = null;
  if (arq.getMimeType() === MimeType.GOOGLE_SHEETS) {
    doc = SpreadsheetApp.openById(arq.getId());
  } else {
    tmpId = prConverterParaSheets(arq.getId());
    doc = SpreadsheetApp.openById(tmpId);
  }
  try {
    var base = doc.getSheetByName('BASE');
    if (base) return prProcessarControle(ss, arq, doc, base);   /* CONTROLE DE FALTAS */
    var ext = prExtrair(doc.getSheets()[0]);                     /* Extrato de Totais */
    var a = prAgregar(ext, func);
    if (!a.n) throw new Error('nenhum direto encontrado: confira a coluna direto (S/N) na ' + PR_ABA_FUNC);
    var criou = prLancarHistorico(ss, ext.mes, ext.ano, a);
    prLog(ss, arq.getName(), ext, a, criou);
    return { tipo: 'ponto', ext: ext, a: a };
  } finally {
    if (tmpId) { try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (ignore) {} }
  }
}

/* ══ 6 · CONTROLE DE FALTAS → FUNCIONARIOS + ausências na HISTORICO ══ */
function prProcessarControle(ss, arq, doc, base) {
  var dp = doc.getSheetByName('DP');
  var atualizou = dp ? prAtualizarFuncionarios(ss, dp) : 0;
  var func = prLerFuncionarios(ss);
  if (!func) throw new Error('aba ' + PR_ABA_FUNC + ' ausente — a DP do controle não foi encontrada para gerá-la');
  var disp = base.getDataRange().getDisplayValues();
  var cab = disp[0].map(prNormaliza), col = {};
  cab.forEach(function (c, i) {
    if (c === 'data') col.data = i; else if (c === 'cod' || c === 'codigo') col.cod = i;
    else if (c === 'status') col.status = i; else if (c === 'horas falta') col.hf = i;
    else if (c === 'horas ferias') col.hfe = i;
  });
  if (col.data === undefined || col.cod === undefined || col.status === undefined || col.hf === undefined)
    throw new Error('BASE sem as colunas DATA, COD, STATUS e HORAS FALTA');
  var meses = {};
  for (var i = 1; i < disp.length; i++) {
    var l = disp[i], d = prData(l[col.data]);
    if (!d) continue;
    var cod = String(l[col.cod] || '').trim().replace(/\.0$/, '');
    var f = func.mapa[cod];
    if (!f || !f.direto) continue;
    var chave = PR_MESES[d.getMonth()] + '/' + d.getFullYear();
    var m = meses[chave] || (meses[chave] = { mes: PR_MESES[d.getMonth()], ano: d.getFullYear(), falta: 0, atestado: 0, afastado: 0, atraso: 0, ferias: 0, registros: 0 });
    var st = prNormaliza(l[col.status]), hf = prHoras(l[col.hf]), hfe = col.hfe !== undefined ? prHoras(l[col.hfe]) : 0;
    m.registros++;
    if (st === 'falta') m.falta += hf;
    else if (st === 'atestado') m.atestado += hf;
    else if (st === 'afastado') m.afastado += hf;
    else if (st === 'atraso') m.atraso += hf;
    else if (st === 'ferias') m.ferias += hfe || hf;
    else m.falta += hf;                       /* status desconhecido: conta como falta e fica visível na soma */
  }
  var chaves = Object.keys(meses), lancados = [];
  chaves.forEach(function (k) {
    var m = meses[k];
    var criou = prLancarAusencias(ss, m);
    lancados.push(k + ': falta ' + Math.round(m.falta) + ' · atestado ' + Math.round(m.atestado) + ' · afastado ' + Math.round(m.afastado)
      + ' · atraso ' + Math.round(m.atraso) + ' · férias ' + Math.round(m.ferias) + (criou ? ' (linha criada)' : ''));
    prLogAus(ss, arq.getName(), m, criou);
  });
  return { tipo: 'controle', meses: chaves.length, lancados: lancados, funcionarios: atualizou };
}

/* Regrava a FUNCIONARIOS a partir da aba DP do controle (Cód | Nome | Setor |
   Departamento | STATUS | DT. ADMISSÃO | DT. DEMISSÃO). direto = setor está
   em PR_SETORES_DIRETOS. Inativo entra com N e a data de demissão — assim o
   histórico continua conferindo. */
function prAtualizarFuncionarios(ss, dp) {
  var v = dp.getDataRange().getValues(), iCab = -1, col = {};
  for (var i = 0; i < Math.min(v.length, 10) && iCab < 0; i++) {
    var norm = v[i].map(prNormaliza);
    if (norm.indexOf('cod') >= 0 && norm.indexOf('nome') >= 0) {
      iCab = i;
      norm.forEach(function (n, c) {
        if (n === 'cod') col.cod = c; else if (n === 'nome') col.nome = c; else if (n === 'setor') col.setor = c;
        else if (n === 'status') col.status = c; else if (n.indexOf('admiss') >= 0) col.adm = c; else if (n.indexOf('demiss') >= 0) col.dem = c;
      });
    }
  }
  if (iCab < 0) return 0;
  var linhas = [];
  for (var r = iCab + 1; r < v.length; r++) {
    var cod = String(v[r][col.cod] || '').trim().replace(/\.0$/, '');
    if (!/^\d+$/.test(cod)) continue;
    var setor = String(v[r][col.setor] || '').trim();
    var inativo = /inativo/i.test(String(col.status !== undefined ? v[r][col.status] : ''));
    var direto = !inativo && PR_SETORES_DIRETOS.indexOf(setor) >= 0;
    var fmt = function (x) { var d = prData(x); return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy') : ''; };
    linhas.push([cod, String(v[r][col.nome] || '').trim(), setor, direto ? 'S' : 'N',
                 col.adm !== undefined ? fmt(v[r][col.adm]) : '', col.dem !== undefined ? fmt(v[r][col.dem]) : '', inativo ? 'inativo na DP' : '']);
  }
  if (!linhas.length) return 0;
  var aba = ss.getSheetByName(PR_ABA_FUNC) || ss.insertSheet(PR_ABA_FUNC);
  aba.clear();
  aba.getRange(1, 1, 1, 7).setValues([['codigo', 'nome', 'setor', 'direto', 'admissao', 'demissao', 'observacao']]).setFontWeight('bold');
  aba.getRange(2, 1, linhas.length, 7).setValues(linhas);
  return linhas.length;
}

function prLancarAusencias(ss, m) {
  var aba = ss.getSheetByName(PR_ABA_HISTORICO);
  if (!aba) throw new Error('aba ' + PR_ABA_HISTORICO + ' não encontrada');
  var linhas = aba.getDataRange().getValues(), iCab = -1, col = {};
  for (var i = 0; i < Math.min(linhas.length, 20) && iCab < 0; i++) {
    var norm = linhas[i].map(prNormaliza);
    if (norm.indexOf('mes') >= 0 && norm.indexOf('ano') >= 0) { iCab = i; norm.forEach(function (n, c) { if (col[n] === undefined) col[n] = c; }); }
  }
  if (iCab < 0) throw new Error('cabeçalho com "mes" e "ano" não encontrado na ' + PR_ABA_HISTORICO);
  var largura = linhas[iCab].length;
  ['ausFalta', 'ausAtestado', 'ausAfastado', 'ausAtraso', 'horasFerias'].forEach(function (nome) {
    var n = prNormaliza(nome);
    if (col[n] === undefined) {
      while (largura > 0 && !String(linhas[iCab][largura - 1] || '').trim()) largura--;
      aba.getRange(iCab + 1, largura + 1).setValue(nome); col[n] = largura; largura++;
    }
  });
  var linha = -1;
  for (var r = iCab + 1; r < linhas.length; r++) {
    var mm = String(linhas[r][col.mes] || '').trim().toUpperCase().slice(0, 3);
    if (mm === m.mes && parseInt(linhas[r][col.ano], 10) === m.ano) { linha = r + 1; break; }
  }
  var criou = false;
  if (linha < 0) { linha = aba.getLastRow() + 1; aba.getRange(linha, col.mes + 1).setValue(m.mes); aba.getRange(linha, col.ano + 1).setValue(m.ano); criou = true; }
  var grava = function (nome, v) { var c = col[prNormaliza(nome)]; if (c !== undefined) aba.getRange(linha, c + 1).setValue(Math.round(v * 100) / 100); };
  grava('ausFalta', m.falta); grava('ausAtestado', m.atestado); grava('ausAfastado', m.afastado); grava('ausAtraso', m.atraso);
  grava('horasFerias', m.ferias);
  return criou;
}

function prLogAus(ss, arquivo, m, criou) {
  var aba = ss.getSheetByName(PR_ABA_LOG) || ss.insertSheet(PR_ABA_LOG);
  if (aba.getLastRow() === 0) aba.appendRow(['processadoEm', 'arquivo', 'mes', 'ano', 'registros', 'ausFalta', 'ausAtestado', 'ausAfastado', 'ausAtraso', 'horasFerias', 'linhaCriada']);
  aba.appendRow([new Date(), arquivo + ' (ausências)', m.mes, m.ano, m.registros, m.falta, m.atestado, m.afastado, m.atraso, m.ferias, criou ? 'sim' : 'não']);
}

/* Copia o xlsx como Planilha Google (o Drive converte), lê e apaga a cópia.
   Mesmo truque do ReporteVolumes.gs com o PDF. Não mexe no original. */
function prConverterParaSheets(fileId) {
  var resp = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ name: 'tmp_ponto_rh', mimeType: 'application/vnd.google-apps.spreadsheet' }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) throw new Error('conversão do extrato falhou (HTTP ' + resp.getResponseCode() + ')');
  return JSON.parse(resp.getContentText()).id;
}

function instalarProcessamentoPonto() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'processarPontoDrive') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('processarPontoDrive').timeBased().everyDays(1).atHour(6).nearMinute(30).create();
  prAvisar('Instalado: a pasta "' + PR_PASTA + '" é varrida todo dia por volta das 6h30. É só salvar o extrato do mês lá.');
}

/* Ensaio sem gravar: mostra no Registro o que seria lançado do primeiro
   arquivo da pasta. Rode antes da primeira vez. */
function testePonto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var func = prLerFuncionarios(ss);
  if (!func) { Logger.log('FUNCIONARIOS ausente ou vazia.'); return; }
  var pastas = DriveApp.getFoldersByName(PR_PASTA);
  if (!pastas.hasNext()) { Logger.log('Pasta ' + PR_PASTA + ' não existe.'); return; }
  var arquivos = pastas.next().getFiles();
  while (arquivos.hasNext()) {
    var arq = arquivos.next();
    if (!/\.xlsx?$/i.test(arq.getName())) continue;
    var tmpId = prConverterParaSheets(arq.getId());
    try {
      var ext = prExtrair(SpreadsheetApp.openById(tmpId).getSheets()[0]);
      var a = prAgregar(ext, func);
      Logger.log(arq.getName() + ' → ' + ext.mes + '/' + ext.ano + ' | pessoas ' + ext.pessoas.length + ' | diretos ' + a.n
        + ' | jornada cheia ' + a.jornada + ' | carga ' + a.carga.toFixed(1) + ' | normais ' + a.normais.toFixed(1)
        + ' | faltas(ponto) ' + a.faltasPonto.toFixed(1) + ' | atrasos ' + a.atrasosPonto.toFixed(1)
        + ' | e50 ' + a.e50.toFixed(1) + ' | e100 ' + a.e100.toFixed(2) + ' | naoTrabalhadas ' + a.naoTrabalhadas.toFixed(1)
        + (a.pendentes.length ? ' | FORA da FUNCIONARIOS: ' + a.pendentes.join(', ') : '')
        + (a.admitidosDepois.length ? ' | admitidos depois do mês (não contam): ' + a.admitidosDepois.join(', ') : ''));
    } finally { try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (ignore) {} }
    return;
  }
  Logger.log('Nenhum extrato na pasta.');
}

function prNormaliza(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function prAvisar(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); } }
function prErro(msg) { Logger.log('ERRO: ' + msg); prAvisar(msg); }
