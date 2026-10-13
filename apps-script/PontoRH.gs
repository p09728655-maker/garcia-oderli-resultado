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
 * POR SETOR (aba PONTO_SETOR)
 *   O extrato é por pessoa e a FUNCIONARIOS tem o setor: o mesmo cruzamento
 *   que decide quem é direto soma horas, extra50, extra100, faltas e atrasos
 *   do ponto por setor, diretos e indiretos, uma linha por mês/ano/setor. O
 *   controle de faltas soma as ausências por setor na mesma linha. A
 *   HISTORICO não muda: continua o total dos diretos. A aba serve ao Power
 *   BI e ao painel (o Web App devolve em "setores") para responder se a
 *   hora extra está cobrindo falta (falta alta + HE alta no mesmo setor) ou
 *   está no gargalo (falta baixa + HE alta). Limites: é hora por setor, não
 *   peça por setor (a produção é da fábrica inteira); o setor é o atual da
 *   pessoa na FUNCIONARIOS, não o do mês; a série começa no primeiro
 *   extrato processado por este script.
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
var PR_ABA_LOG_AUS  = 'AUSENCIAS';   /* log do controle de faltas */
var PR_ABA_HISTORICO = 'HISTORICO';
var PR_ABA_SETOR    = 'PONTO_SETOR';   /* mês × setor: horas, HE e ausências */
var PR_SETOR_COLS   = ['mes', 'ano', 'setor', 'direto', 'pessoas', 'horasCarga', 'horasNormais', 'faltasPonto', 'atrasosPonto',
  'extra50', 'extra100', 'totalExtras', 'hePctHoras', 'ausFalta', 'ausAtestado', 'ausAfastado', 'ausAtraso', 'horasFerias', 'atualizadoEm'];
var PR_SETOR_AUS    = ['ausFalta', 'ausAtestado', 'ausAfastado', 'ausAtraso', 'horasFerias'];
/* Mês que já tem horasNormais na HISTORICO é mês fechado: o extrato preenche a
   PONTO_SETOR e o aviso mostra a diferença entre o ponto e o que está digitado,
   mas NÃO regrava a HISTORICO. Conferido em SET/26 com JAN–MAI: as horas
   extras digitadas de MAI/26 eram as da fábrica inteira (1.724 + 671 h), não
   só dos diretos, e o ponto mudaria o "feito na hora extra" de um mês já
   apresentado. Para aceitar o ponto num mês fechado, ponha false, reprocesse
   o extrato daquele mês e volte para true. Mês sem horas grava normalmente. */
var PR_PROTEGER_FECHADOS = true;
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
  m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\s*([AaPp])\.?[Mm]\.?)?$/);
  if (m) {
    var h = parseInt(m[1], 10);
    if (m[4]) { var pm = /p/i.test(m[4]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }   /* "8:48 AM" (formato de hora em inglês) */
    return d * 24 + h + parseInt(m[2], 10) / 60 + (m[3] ? parseInt(m[3], 10) / 3600 : 0);
  }
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
  /* ABR/26 veio exportado sem Ex50%/Ex100%: lido como zero, apagaria a hora
     extra do mês. Sem as duas colunas o arquivo não entra. */
  if (col.e50 === undefined && col.e100 === undefined) throw new Error('extrato sem as colunas Ex50% e Ex100% — exporte de novo com as horas extras');
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
      linhas[iCab][largura] = nome;   /* a cópia precisa ver a coluna nova, senão a próxima cai no mesmo lugar */
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

/* O que a HISTORICO tem hoje para o mês (ou null se a linha não existe). */
function prLerHistoricoMes(ss, mes, ano) {
  var aba = ss.getSheetByName(PR_ABA_HISTORICO);
  if (!aba) return null;
  var linhas = aba.getDataRange().getValues(), iCab = -1, col = {};
  for (var i = 0; i < Math.min(linhas.length, 20) && iCab < 0; i++) {
    var norm = linhas[i].map(prNormaliza);
    if (norm.indexOf('mes') >= 0 && norm.indexOf('ano') >= 0) { iCab = i; norm.forEach(function (n, c) { if (col[n] === undefined) col[n] = c; }); }
  }
  if (iCab < 0) return null;
  var num = function (l, nome) { var c = col[prNormaliza(nome)]; if (c === undefined) return 0; var v = parseFloat(String(l[c]).replace(',', '.')); return isFinite(v) ? v : 0; };
  for (var r = iCab + 1; r < linhas.length; r++) {
    var m = String(linhas[r][col.mes] || '').trim().toUpperCase().slice(0, 3);
    if (m === mes && parseInt(linhas[r][col.ano], 10) === ano)
      return { colaboradores: num(linhas[r], 'colaboradores'), horasCarga: num(linhas[r], 'horasCarga'), horasNormais: num(linhas[r], 'horasNormais'),
               extra50: num(linhas[r], 'extra50'), extra100: num(linhas[r], 'extra100') };
  }
  return null;
}

function prLog(ss, arquivo, ext, a, criou) {
  var aba = ss.getSheetByName(PR_ABA_LOG) || ss.insertSheet(PR_ABA_LOG);
  if (aba.getLastRow() === 0) {
    aba.appendRow(['processadoEm', 'arquivo', 'mes', 'ano', 'pessoasNoExtrato', 'diretos', 'jornadaCheia', 'carga', 'normais', 'faltasPonto', 'atrasosPonto', 'extra50', 'extra100', 'naoTrabalhadas', 'linhaCriada', 'pendentes (fora da FUNCIONARIOS)']);
    aba.getRange(1, 1, 1, 16).setFontWeight('bold');
  }
  aba.appendRow([new Date(), arquivo, ext.mes, ext.ano, ext.pessoas.length, a.n, a.jornada, a.carga, a.normais, a.faltasPonto, a.atrasosPonto, a.e50, a.e100, a.naoTrabalhadas, criou ? 'sim' : 'não', a.pendentes.join('; ')]);
}

/* ══ 4b · PONTO_SETOR ══
   Uma linha por mês/ano/setor. O extrato grava as colunas de horas e HE; o
   controle de faltas grava as de ausência. Cada fonte só mexe nas suas
   colunas, então a ordem em que os arquivos chegam não importa. Quem não
   está na FUNCIONARIOS não entra (é a mesma pendência do total). */
function prAgregarSetores(ext, func) {
  var por = {};
  ext.pessoas.forEach(function (p) {
    var f = func.mapa[p.codigo];
    if (!f) return;
    if (f.admissao && ext.fim && f.admissao > ext.fim) return;
    var nome = String(f.setor || '').trim() || '(sem setor)';
    var s = por[nome] || (por[nome] = { setor: nome, direto: false, n: 0, carga: 0, normais: 0, faltasPonto: 0, atrasosPonto: 0, e50: 0, e100: 0 });
    s.direto = s.direto || f.direto;
    s.n++; s.carga += p.carga; s.normais += p.normais; s.faltasPonto += p.faltasPonto === undefined ? p.faltas : p.faltasPonto;
    s.atrasosPonto += p.atrasos; s.e50 += p.e50; s.e100 += p.e100;
  });
  return Object.keys(por).sort().map(function (k) { return por[k]; });
}

/* Abre (ou cria) a aba e devolve { aba, v (valores), col (nome normalizado →
   índice), largura }. Colunas que faltarem são criadas no fim. */
function prAbrirSetores(ss) {
  var aba = ss.getSheetByName(PR_ABA_SETOR);
  if (!aba) {
    aba = ss.insertSheet(PR_ABA_SETOR);
    aba.getRange(1, 1, 1, PR_SETOR_COLS.length).setValues([PR_SETOR_COLS]).setFontWeight('bold');
    aba.setFrozenRows(1);
    aba.setColumnWidth(3, 200);
  }
  var v = aba.getDataRange().getValues();
  if (!v.length || !String(v[0][0] || '').trim()) { v = [PR_SETOR_COLS.slice()]; aba.getRange(1, 1, 1, PR_SETOR_COLS.length).setValues([PR_SETOR_COLS]).setFontWeight('bold'); }
  var col = {};
  v[0].forEach(function (c, i) { var n = prNormaliza(c); if (n && col[n] === undefined) col[n] = i; });
  var largura = v[0].length;
  PR_SETOR_COLS.forEach(function (nome) {
    var n = prNormaliza(nome);
    if (col[n] === undefined) { aba.getRange(1, largura + 1).setValue(nome).setFontWeight('bold'); v[0][largura] = nome; col[n] = largura; largura++; }
  });
  return { aba: aba, v: v, col: col, largura: largura };
}

/* Grava valores nas linhas de (mes, ano, setor); cria a linha se não existir.
   linhas = [{ setor, valores: { campo: valor } }]. Tudo em memória, depois a
   aba inteira ordenada por ano, mês e setor numa escrita só: setor que só
   existe no extrato (sem ausência) ficava no fim da aba, e AGO aparecia
   depois de SET. */
function prGravarSetores(ss, mes, ano, linhas) {
  var t = prAbrirSetores(ss), aba = t.aba, v = t.v, col = t.col, largura = t.largura;
  var idx = {};
  for (var r = 1; r < v.length; r++) {
    var m = String(v[r][col.mes] || '').trim().toUpperCase().slice(0, 3);
    if (m === mes && parseInt(v[r][col.ano], 10) === ano) idx[prNormaliza(v[r][col.setor])] = r;
  }
  var criadas = 0, agora = new Date();
  linhas.forEach(function (l) {
    var r = idx[prNormaliza(l.setor)], row;
    if (r === undefined) {
      row = []; for (var i = 0; i < largura; i++) row.push('');
      row[col.mes] = mes; row[col.ano] = ano; row[col.setor] = l.setor;
      v.push(row); r = v.length - 1; idx[prNormaliza(l.setor)] = r; criadas++;
    } else {
      row = v[r]; while (row.length < largura) row.push('');
    }
    Object.keys(l.valores).forEach(function (k) {
      var c = col[prNormaliza(k)]; if (c === undefined) return;
      var x = l.valores[k]; row[c] = (typeof x === 'number') ? Math.round(x * 100) / 100 : x;
    });
    row[col.atualizadoem] = agora;
  });
  prEscreverSetoresOrdenado(aba, v, col, largura);
  return criadas;
}

/* Ordena (ano, mês na ordem do calendário, setor) e grava da linha 2 em diante. */
function prEscreverSetoresOrdenado(aba, v, col, largura) {
  var corpo = v.slice(1).filter(function (row) { return String(row[col.mes] || '').trim() !== ''; })
    .map(function (row) { while (row.length < largura) row.push(''); return row; });
  corpo.sort(function (a, b) {
    var d = (parseInt(a[col.ano], 10) || 0) - (parseInt(b[col.ano], 10) || 0); if (d) return d;
    d = PR_MESES.indexOf(String(a[col.mes]).toUpperCase().slice(0, 3)) - PR_MESES.indexOf(String(b[col.mes]).toUpperCase().slice(0, 3)); if (d) return d;
    return String(a[col.setor]).localeCompare(String(b[col.setor]), 'pt-BR', { numeric: true });   /* 7-... antes de 12-... */
  });
  if (corpo.length) aba.getRange(2, 1, corpo.length, largura).setValues(corpo);
  var sobra = aba.getLastRow() - 1 - corpo.length;   /* linhas que sumiram (não deve haver): limpa o rastro */
  if (sobra > 0) aba.getRange(corpo.length + 2, 1, sobra, largura).clearContent();
}

/* Reordena a aba que já existe. Executar › ordenarPontoSetor, uma vez. */
function ordenarPontoSetor() {
  var t = prAbrirSetores(SpreadsheetApp.getActiveSpreadsheet());
  prEscreverSetoresOrdenado(t.aba, t.v, t.col, t.largura);
  prAvisar('Aba ' + PR_ABA_SETOR + ' ordenada por ano, mês e setor.');
}

/* Extrato → colunas de horas e HE por setor. */
function prGravarSetoresPonto(ss, ext, setores) {
  return prGravarSetores(ss, ext.mes, ext.ano, setores.map(function (s) {
    var he = s.e50 + s.e100;
    return { setor: s.setor, valores: {
      direto: s.direto ? 'S' : 'N', pessoas: s.n, horasCarga: s.carga, horasNormais: s.normais,
      faltasPonto: s.faltasPonto, atrasosPonto: s.atrasosPonto, extra50: s.e50, extra100: s.e100,
      totalExtras: he, hePctHoras: s.normais > 0 ? he / s.normais * 100 : 0 } };
  }));
}

/* Zera as ausências de todos os setores do ano (o controle é a fonte do ano
   inteiro, como na HISTORICO). Uma escrita para a aba toda. */
function prLimparAusenciasSetor(ss, ano) {
  var t = prAbrirSetores(ss), v = t.v, col = t.col;
  var cols = PR_SETOR_AUS.map(function (n) { return col[prNormaliza(n)]; });
  var mudou = false;
  for (var r = 1; r < v.length; r++) {
    if (parseInt(v[r][col.ano], 10) !== ano) continue;
    while (v[r].length < t.largura) v[r].push('');
    cols.forEach(function (c) { v[r][c] = 0; }); mudou = true;
  }
  if (mudou) prEscreverSetoresOrdenado(t.aba, v, col, t.largura);
}

/* Para o Web App: a aba inteira como lista de objetos (chave = cabeçalho). */
function prLerSetores(ss) {
  try {
    var aba = ss.getSheetByName(PR_ABA_SETOR);
    if (!aba || aba.getLastRow() < 2) return [];
    var v = aba.getDataRange().getValues(), cab = v[0].map(function (c) { return String(c || '').trim(); }), out = [];
    for (var r = 1; r < v.length; r++) {
      var mes = String(v[r][0] || '').trim().toUpperCase().slice(0, 3), ano = parseInt(v[r][1], 10);
      if (!mes || !(ano > 2000)) continue;
      var o = {};
      cab.forEach(function (k, i) {
        if (!k) return;
        var x = v[r][i];
        if (x instanceof Date) o[k] = x.toISOString();
        else if (typeof x === 'number') o[k] = x;
        else { var s = String(x === null || x === undefined ? '' : x).trim(); var n = parseFloat(s.replace(',', '.')); o[k] = (s !== '' && /^-?\d+([.,]\d+)?$/.test(s)) ? n : s; }
      });
      o.mes = mes; o.ano = ano;
      out.push(o);
    }
    return out;
  } catch (e) { return []; }
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
        feitos.push(arq.getName() + ' → ' + r.ext.mes + '/' + r.ext.ano + ': ' + r.a.n + ' diretos, ' + Math.round(r.a.normais) + ' h normais, ' + Math.round(r.a.naoTrabalhadas) + ' h não trabalhadas; ' + r.setores.length + ' setor(es) na ' + PR_ABA_SETOR
          + (r.protegido ? '\n   HISTORICO mantida (mês já fechado). Ponto × digitado: colaboradores ' + r.a.n + ' × ' + r.protegido.colaboradores
                           + ' | h. normais ' + Math.round(r.a.normais) + ' × ' + Math.round(r.protegido.horasNormais)
                           + ' | extra50 ' + Math.round(r.a.e50) + ' × ' + Math.round(r.protegido.extra50)
                           + ' | extra100 ' + Math.round(r.a.e100) + ' × ' + Math.round(r.protegido.extra100)
                           + '. Para aceitar o ponto: PR_PROTEGER_FECHADOS = false e reprocessar este arquivo.'
                         : ''));
        if (!r.a.e50 && !r.a.e100) feitos.push('   ATENÇÃO: extrato sem hora extra (colunas Ex50%/Ex100% ausentes ou zeradas). Exporte de novo com as colunas de extras.');
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
    /* a cópia nasce no fuso padrão da conta (GMT−8), o script roda no seu:
       uma hora 8:48 lida como Date chegava como 13:41 — 4,9 h a mais em cada
       linha. Igualar o fuso antes de ler resolve datas e horas de uma vez. */
    try { doc.setSpreadsheetTimeZone(Session.getScriptTimeZone()); } catch (ignore) {}
  }
  try {
    var base = doc.getSheetByName('BASE');
    if (base) return prProcessarControle(ss, arq, doc, base);   /* CONTROLE DE FALTAS */
    var ext = prExtrair(doc.getSheets()[0]);                     /* Extrato de Totais */
    var a = prAgregar(ext, func);
    if (!a.n) throw new Error('nenhum direto encontrado: confira a coluna direto (S/N) na ' + PR_ABA_FUNC);
    var atual = prLerHistoricoMes(ss, ext.mes, ext.ano), protegido = null, criou = false;
    if (PR_PROTEGER_FECHADOS && atual && atual.horasNormais > 0) {
      protegido = atual;   /* mês fechado: HISTORICO fica como está */
    } else {
      criou = prLancarHistorico(ss, ext.mes, ext.ano, a);
    }
    prLog(ss, arq.getName(), ext, a, criou);
    var setores = prAgregarSetores(ext, func);
    prGravarSetoresPonto(ss, ext, setores);
    return { tipo: 'ponto', ext: ext, a: a, setores: setores, protegido: protegido };
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
  /* getValues, não getDisplayValues: DATA é data de verdade e o texto exibido
     na cópia convertida sai no formato da conta (mês/dia/ano) — lido como
     dia/mês virava meses de 2027 e 2028. Horas vêm como Date (hh:mm) ou
     fração de dia; prHoras trata os dois. */
  var rng = base.getDataRange(), disp = rng.getValues(), texto = rng.getDisplayValues();
  var cab = disp[0].map(prNormaliza), col = {};
  cab.forEach(function (c, i) {
    if (c === 'data') col.data = i; else if (c === 'cod' || c === 'codigo') col.cod = i;
    else if (c === 'status') col.status = i; else if (c === 'horas falta') col.hf = i;
    else if (c === 'horas ferias') col.hfe = i;
  });
  if (col.data === undefined || col.cod === undefined || col.status === undefined || col.hf === undefined)
    throw new Error('BASE sem as colunas DATA, COD, STATUS e HORAS FALTA');
  var meses = {}, anos = {}, foraDoIntervalo = 0, desconhecidos = {}, ignorados = 0;
  var porSetor = {};   /* chave mês/ano → setor → ausências (diretos e indiretos) */
  var limite = new Date(); limite.setDate(limite.getDate() + 45);
  for (var i = 1; i < disp.length; i++) {
    var l = disp[i], d = prData(l[col.data]);
    if (!d) continue;
    if (d.getFullYear() < 2000 || d > limite) { foraDoIntervalo++; continue; }   /* trava: nunca cria mês no futuro */
    var cod = String(l[col.cod] || '').trim().replace(/\.0$/, '');
    var f = func.mapa[cod];
    if (!f) continue;
    var chave = PR_MESES[d.getMonth()] + '/' + d.getFullYear();
    /* por setor entra todo mundo da FUNCIONARIOS; a HISTORICO segue só com os diretos */
    var nomeSetor = String(f.setor || '').trim() || '(sem setor)';
    var ps = porSetor[chave] || (porSetor[chave] = { mes: PR_MESES[d.getMonth()], ano: d.getFullYear(), setores: {} });
    var m = ps.setores[nomeSetor] || (ps.setores[nomeSetor] = { setor: nomeSetor, direto: f.direto, falta: 0, atestado: 0, afastado: 0, atraso: 0, ferias: 0 });
    m.direto = m.direto || f.direto;
    anos[d.getFullYear()] = true;
    if (f.direto) {
      var mh = meses[chave] || (meses[chave] = { mes: PR_MESES[d.getMonth()], ano: d.getFullYear(), falta: 0, atestado: 0, afastado: 0, atraso: 0, ferias: 0, registros: 0 });
    }
    /* horas pelo texto formatado ("8:48"), que não depende de fuso; a data pelo valor */
    var stBruto = String(l[col.status] || '').trim(), st = prStatusAusencia(stBruto), hf = prHoras(texto[i][col.hf]), hfe = col.hfe !== undefined ? prHoras(texto[i][col.hfe]) : 0;
    if (!stBruto && !hf && !hfe) continue;   /* linha sem status e sem horas: não é registro */
    if (f.direto) mh.registros++;
    if (st === 'ferias') { m.ferias += hfe || hf; if (f.direto) mh.ferias += hfe || hf; }
    else if (st === 'ignorar') { if (f.direto) ignorados++; }
    else {
      if (st === 'desconhecido') { if (f.direto) desconhecidos[stBruto] = (desconhecidos[stBruto] || 0) + hf; st = 'falta'; }   /* vira falta e aparece no aviso */
      m[st] += hf; if (f.direto) mh[st] += hf;
    }
  }
  /* o controle do ano é a fonte do ano inteiro: zera as ausências dos meses
     do ano antes de gravar, para valor de rodada errada não sobreviver */
  Object.keys(anos).forEach(function (ano) { prLimparAusencias(ss, parseInt(ano, 10)); prLimparAusenciasSetor(ss, parseInt(ano, 10)); });
  Object.keys(porSetor).forEach(function (k) {
    var ps = porSetor[k];
    prGravarSetores(ss, ps.mes, ps.ano, Object.keys(ps.setores).sort().map(function (nome) {
      var x = ps.setores[nome];
      return { setor: nome, valores: { direto: x.direto ? 'S' : 'N', ausFalta: x.falta, ausAtestado: x.atestado, ausAfastado: x.afastado, ausAtraso: x.atraso, horasFerias: x.ferias } };
    }));
  });
  var chaves = Object.keys(meses), lancados = [];
  var descL = Object.keys(desconhecidos);
  if (descL.length) lancados.push('status fora da lista, contados como falta: ' + descL.map(function (k) { return k + ' (' + Math.round(desconhecidos[k]) + ' h)'; }).join(', '));
  if (ignorados) lancados.push(ignorados + ' registro(s) de banco de horas ignorados (folga compensada não é falta)');
  if (foraDoIntervalo) lancados.push(foraDoIntervalo + ' registro(s) com data fora do intervalo ignorados');
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
   em PR_SETORES_DIRETOS, independente do STATUS: quem foi desligado em agosto
   faltou como direto até o desligamento, e o extrato de ponto só traz quem
   estava na folha no mês. A demissão fica na aba, para conferência. */
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
    var direto = PR_SETORES_DIRETOS.indexOf(setor) >= 0;
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

/* STATUS da BASE → categoria. O RH escreve variações; o que não estiver
   aqui vira falta e aparece no aviso, para entrar na lista. */
function prStatusAusencia(st) {
  var s = prNormaliza(st);
  if (!s) return 'desconhecido';
  if (s === 'falta') return 'falta';
  if (s === 'ferias') return 'ferias';
  if (/^atest|^just/.test(s)) return 'atestado';            /* ATESTADO, ATEST. OB., JUST., JUSTIFICATIVA */
  if (/^afast|^lic/.test(s)) return 'afastado';             /* AFASTADO, LIC. MAT. */
  if (/^atras|^tarde/.test(s)) return 'atraso';             /* ATRASO, TARDE */
  if (/^banco/.test(s)) return 'ignorar';                   /* BANCO H.: folga compensada */
  return 'desconhecido';
}

/* Zera ausFalta, ausAtestado, ausAfastado, ausAtraso e horasFerias de todos
   os meses do ano na HISTORICO (só onde as colunas existem). */
function prLimparAusencias(ss, ano) {
  var aba = ss.getSheetByName(PR_ABA_HISTORICO);
  if (!aba) return;
  var linhas = aba.getDataRange().getValues(), iCab = -1, col = {};
  for (var i = 0; i < Math.min(linhas.length, 20) && iCab < 0; i++) {
    var norm = linhas[i].map(prNormaliza);
    if (norm.indexOf('mes') >= 0 && norm.indexOf('ano') >= 0) { iCab = i; norm.forEach(function (n, c) { if (col[n] === undefined) col[n] = c; }); }
  }
  if (iCab < 0) return;
  var cols = ['ausFalta', 'ausAtestado', 'ausAfastado', 'ausAtraso', 'horasFerias'].map(function (n) { return col[prNormaliza(n)]; }).filter(function (c) { return c !== undefined; });
  for (var r = iCab + 1; r < linhas.length; r++) {
    if (parseInt(linhas[r][col.ano], 10) !== ano) continue;
    cols.forEach(function (c) { aba.getRange(r + 1, c + 1).setValue(0); });
  }
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
      aba.getRange(iCab + 1, largura + 1).setValue(nome);
      linhas[iCab][largura] = nome;   /* idem: a cópia precisa ver a coluna nova */
      col[n] = largura; largura++;
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

/* Log em aba própria (AUSENCIAS): as colunas são outras, e na aba PONTO o
   registro saía desalinhado sob o cabeçalho do extrato. */
function prLogAus(ss, arquivo, m, criou) {
  var aba = ss.getSheetByName(PR_ABA_LOG_AUS) || ss.insertSheet(PR_ABA_LOG_AUS);
  if (aba.getLastRow() === 0) {
    aba.appendRow(['processadoEm', 'arquivo', 'mes', 'ano', 'registros', 'ausFalta', 'ausAtestado', 'ausAfastado', 'ausAtraso', 'horasFerias', 'linhaCriada']);
    aba.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
  aba.appendRow([new Date(), arquivo, m.mes, m.ano, m.registros, Math.round(m.falta * 10) / 10, Math.round(m.atestado * 10) / 10, Math.round(m.afastado * 10) / 10, Math.round(m.atraso * 10) / 10, Math.round(m.ferias * 10) / 10, criou ? 'sim' : 'não']);
}

/* Apaga da HISTORICO linhas de anos futuros sem produção, sem horas e sem
   plano — as que uma rodada com data lida errada criou (2027/2028). Menu
   👥 Ponto → Apagar meses futuros criados por engano. */
function apagarMesesFuturos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), aba = ss.getSheetByName(PR_ABA_HISTORICO);
  if (!aba) return prErro('aba ' + PR_ABA_HISTORICO + ' não encontrada');
  var linhas = aba.getDataRange().getValues(), iCab = -1, col = {};
  for (var i = 0; i < Math.min(linhas.length, 20) && iCab < 0; i++) {
    var norm = linhas[i].map(prNormaliza);
    if (norm.indexOf('mes') >= 0 && norm.indexOf('ano') >= 0) { iCab = i; norm.forEach(function (n, c) { if (col[n] === undefined) col[n] = c; }); }
  }
  if (iCab < 0) return prErro('cabeçalho com "mes" e "ano" não encontrado');
  var anoAtual = new Date().getFullYear(), vazio = function (l, nome) { var c = col[prNormaliza(nome)]; return c === undefined || !(parseFloat(l[c]) > 0); };
  var apagar = [];
  for (var r = iCab + 1; r < linhas.length; r++) {
    var l = linhas[r], ano = parseInt(l[col.ano], 10);
    if (ano > anoAtual && vazio(l, 'producaoReal') && vazio(l, 'horasNormais') && vazio(l, 'horasCarga') && vazio(l, 'previsaoProducao') && vazio(l, 'planoNaHistorico'))
      apagar.push({ linha: r + 1, rotulo: String(l[col.mes]) + '/' + ano });
  }
  if (!apagar.length) return prAvisar('Nenhuma linha de ano futuro sem dados na ' + PR_ABA_HISTORICO + '.');
  for (var k = apagar.length - 1; k >= 0; k--) aba.deleteRow(apagar[k].linha);   /* de baixo para cima */
  prAvisar('Apagadas ' + apagar.length + ' linha(s): ' + apagar.map(function (a) { return a.rotulo; }).join(', '));
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

/* Aceita o ponto na HISTORICO de meses já fechados sem reprocessar arquivo:
   lê a última linha de cada mês na aba PONTO (o log guarda a soma dos
   diretos) e grava como prLancarHistorico gravaria. Executar ›
   aceitarPontoNaHistorico e responder "FEV/2026, MAI/2026". Nasceu de
   FEV e MAI/26: HE de maio digitada com a fábrica inteira, horas normais
   de fevereiro 1.416 h acima do ponto. */
function aceitarPontoNaHistorico() {
  var ui = null, resp = '';
  try { ui = SpreadsheetApp.getUi(); var r = ui.prompt('Aceitar o ponto na HISTORICO', 'Ano inteiro (2026) ou meses soltos (FEV/26, MAI/26). Em branco = ano corrente.', ui.ButtonSet.OK_CANCEL); if (r.getSelectedButton() !== ui.Button.OK) return; resp = r.getResponseText(); }
  catch (e) { resp = ''; }                                    /* sem UI (Executar no editor): ano corrente */
  if (!String(resp).trim()) resp = String(new Date().getFullYear());
  /* Aceita "2026" (todos os meses daquele ano que tiverem linha no log),
     "JAN/2026", "JAN/26", "JAN 2026" e "JAN-26". Mês a mês obrigava a lembrar
     quais faltavam, e quem esquece um mês fica com o ano em duas réguas. */
  var pedidos = [], anos = [], erros = [];
  resp.toUpperCase().split(/[,;]+/).forEach(function (x) {
    x = x.trim();
    if (!x) return;
    var so = x.match(/^(\d{2}|\d{4})$/);
    if (so) { var y = parseInt(so[1], 10); anos.push(y < 100 ? 2000 + y : y); return; }
    var m = x.match(/^([A-Z]{3})\s*[\/\-]?\s*(\d{2}|\d{4})$/);
    if (!m || PR_MESES.indexOf(m[1]) < 0) { erros.push(x); return; }
    var a = parseInt(m[2], 10);
    pedidos.push({ mes: m[1], ano: a < 100 ? 2000 + a : a });
  });
  if (!pedidos.length && !anos.length) return prErro('nada reconhecido em "' + resp + '". Use o ano (2026) ou meses (FEV/26, MAI/26).');
  var ss = SpreadsheetApp.getActiveSpreadsheet(), log = ss.getSheetByName(PR_ABA_LOG);
  if (!log || log.getLastRow() < 2) return prErro('aba ' + PR_ABA_LOG + ' vazia: o extrato do mês precisa ter sido processado antes');
  var v = log.getDataRange().getValues(), cab = v[0].map(prNormaliza), col = {};
  cab.forEach(function (c, i) { if (col[c] === undefined) col[c] = i; });
  var num = function (x) { var f = parseFloat(String(x).replace(',', '.')); return isFinite(f) ? f : 0; };
  /* "2026" vira a lista de meses que o log tem daquele ano, na ordem do
     calendário. Mês sem extrato processado simplesmente não entra. */
  anos.forEach(function (ano) {
    var achados = {};
    for (var r = 1; r < v.length; r++) {
      if (parseInt(v[r][col.ano], 10) !== ano) continue;
      var mm = String(v[r][col.mes]).toUpperCase().slice(0, 3);
      if (PR_MESES.indexOf(mm) >= 0) achados[mm] = true;
    }
    var lista = PR_MESES.filter(function (m) { return achados[m]; });
    if (!lista.length) { erros.push(ano + ' (nenhum extrato processado)'); return; }
    lista.forEach(function (m) {
      if (!pedidos.some(function (p) { return p.mes === m && p.ano === ano; })) pedidos.push({ mes: m, ano: ano });
    });
  });
  pedidos.sort(function (a, b) { return (a.ano - b.ano) || (PR_MESES.indexOf(a.mes) - PR_MESES.indexOf(b.mes)); });
  if (!pedidos.length) return prErro('nada a regravar: ' + erros.join(', '));
  var feitos = [], falhas = [], iguais = 0;
  pedidos.forEach(function (p) {
    var ult = null;
    for (var r = 1; r < v.length; r++) {   /* a última linha do mês vence */
      if (String(v[r][col.mes]).toUpperCase().slice(0, 3) === p.mes && parseInt(v[r][col.ano], 10) === p.ano) ult = v[r];
    }
    if (!ult) { falhas.push(p.mes + '/' + p.ano + ': sem linha na aba ' + PR_ABA_LOG); return; }
    var a = { n: num(ult[col.diretos]), carga: num(ult[col.carga]), normais: num(ult[col.normais]), faltasPonto: num(ult[col.faltasponto]),
              atrasosPonto: num(ult[col.atrasosponto]), e50: num(ult[col.extra50]), e100: num(ult[col.extra100]),
              jornada: num(ult[col.jornadacheia]), naoTrabalhadas: num(ult[col.naotrabalhadas]) };
    if (!(a.normais > 0)) { falhas.push(p.mes + '/' + p.ano + ': linha do log sem horas normais'); return; }
    var antes = prLerHistoricoMes(ss, p.mes, p.ano);
    prLancarHistorico(ss, p.mes, p.ano, a);
    /* mês que já estava igual não polui o aviso: só conta */
    if (antes && Math.abs(antes.horasNormais - a.normais) < 1 && Math.abs(antes.extra50 - a.e50) < 1
        && Math.abs(antes.extra100 - a.e100) < 1 && antes.colaboradores === a.n) { iguais++; return; }
    feitos.push(p.mes + '/' + p.ano + ': h. normais ' + (antes ? Math.round(antes.horasNormais) : '—') + ' → ' + Math.round(a.normais)
      + ' | extra50 ' + (antes ? Math.round(antes.extra50) : '—') + ' → ' + Math.round(a.e50)
      + ' | extra100 ' + (antes ? Math.round(antes.extra100) : '—') + ' → ' + Math.round(a.e100)
      + ' | colaboradores ' + (antes ? antes.colaboradores : '—') + ' → ' + a.n);
  });
  prAvisar((feitos.length ? 'HISTORICO regravada pelo ponto:\n' + feitos.join('\n') : 'Nenhum mês precisou mudar.')
    + (iguais ? '\n\n' + iguais + ' mês(es) já estavam iguais ao ponto.' : '')
    + (falhas.length ? '\n\nNão feito:\n' + falhas.join('\n') : '')
    + (erros.length ? '\n\nNão reconhecido: ' + erros.join(', ') : '')
    + '\n\nNo painel, use "Gravar cálculos na planilha" (Reunião › Integridade dos dados) para refazer absenteísmo, peças por hora e hora extra destes meses.');
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
      prAgregarSetores(ext, func).forEach(function (s) {
        Logger.log('   ' + s.setor + (s.direto ? ' (direto)' : '') + ': ' + s.n + ' pessoas | normais ' + s.normais.toFixed(1) + ' | e50 ' + s.e50.toFixed(1) + ' | e100 ' + s.e100.toFixed(1)
          + ' | HE/normais ' + (s.normais > 0 ? ((s.e50 + s.e100) / s.normais * 100).toFixed(1) : '0') + '%');
      });
    } finally { try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (ignore) {} }
    return;
  }
  Logger.log('Nenhum extrato na pasta.');
}

function prNormaliza(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function prAvisar(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); } }
function prErro(msg) { Logger.log('ERRO: ' + msg); prAvisar(msg); }
