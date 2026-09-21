/**
 * REPORTE DE VOLUMES — do relatório mensal do ERP para a HISTORICO
 * ────────────────────────────────────────────────────────────────────────────
 * O relatório "Mensal por Transação (3 - REPORTE), Tipo: Todos" do Lógica
 * lista a produção DUAS vezes: uma linha por produto acabado e uma linha por
 * volume do produto ("VOL 1/2 …", inclusive VOL 1/1 dos de caixa única) —
 * conferido em JAN/26: 49.209 no total = 24.491 produtos + 24.718 volumes.
 * Por isso o total geral do relatório não serve direto: é preciso separar as
 * duas famílias. Este script faz essa separação e devolve, por mês:
 *
 *   VOLUMES  = linhas VOL + produtos sem SKU de volume (1 caixa = 1 volume,
 *              ou × volumes do cadastro quando a PRODUTO_CODIGO conhecer);
 *   PRODUTOS = linhas de produto acabado;
 *   FATOR    = volumes ÷ produtos — mesma fonte, mesma competência.
 *
 * É esse VOLUMES que alimenta a coluna volumesProduzidos da HISTORICO; o
 * PRODUTOS pode ir para uma coluna produtosReportados (opcional) — com ela o
 * dashboard calcula o fator na base coerente em vez de dividir pelo
 * producaoReal, que vem de outro corte (~9% menor que o relatório em JAN/26).
 *
 * MODO AUTOMÁTICO (o do dia a dia):
 *   1. Crie no Drive uma pasta chamada REPORTES DE VOLUMES;
 *   2. Todo mês, salve nela o PDF do relatório (3 - REPORTE, Tipo: Todos);
 *   3. O resto é sozinho: processarReportesDrive() converte o PDF, extrai as
 *      linhas, atualiza a REPORTE_VOLUMES, recalcula e lança na HISTORICO.
 *      Rode instalarProcessamentoDiario() uma vez e nem o clique precisa —
 *      a pasta é varrida todo dia de manhã; PDF processado vai para a
 *      subpasta PROCESSADOS. Também dá para disparar na hora pelo menu
 *      "📦 Volumes" que aparece na planilha.
 *
 * MODO MANUAL (continua valendo, e é o plano B se o PDF mudar de cara):
 *   1. criarAbaReporteVolumes() — uma vez; monta a aba REPORTE_VOLUMES;
 *   2. Cole o relatório do mês: MES | ANO | CODIGO | DESCRICAO | QUANTIDADE
 *      | PESO. A DESCRICAO é obrigatória: é ela que diz o que é volume
 *      ("VOL x/y…") e o que é produto. Código com pontos ("501.061.001")
 *      funciona. O PESO (kg da linha, como vem no PDF) é opcional para
 *      volumes e fator, e obrigatório para o comparativo de anos medir mix
 *      em peso em vez de só em peças;
 *   3. calcularVolumesMes() — escreve o resumo por mês na própria aba e
 *      lista os produtos sem SKU de volume (pendências de cadastro);
 *   4. Confira e rode lancarVolumesNaHistorico() — grava volumesProduzidos
 *      (e produtosReportados, se a coluna existir) casando mês+ano.
 *
 * Roda dentro da própria planilha, como a carga do plano — o Web App não
 * escreve nessas colunas.
 */

var RV_ABA           = 'REPORTE_VOLUMES';
var RV_ABA_CADASTRO  = 'PRODUTO_CODIGO';
var RV_ABA_HISTORICO = 'HISTORICO';
/* Onde o resumo por mês é escrito dentro da REPORTE_VOLUMES (colunas G..L). */
var RV_COL_RESUMO = 7;
/* Entrada: A..E são MES, ANO, CODIGO, DESCRICAO, QUANTIDADE desde sempre;
   F guarda o PESO da linha (kg), que o PDF já trazia. Fica antes do resumo
   porque F era a única coluna livre entre a entrada e o G do resumo. */
var RV_COL_PESO    = 6;
var RV_COLS_ENTRADA = 6;

var RV_MESES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

/* "VOL 1/2 NOME", "VOL. 01/03 NOME"… → captura número, total e nome. */
var RV_RE_VOL = /^VOL\.?\s*0?(\d+)\s*\/\s*0?(\d+)\s+(.+)$/i;

/* ══ 1 · ABA DE ENTRADA ══ */
function criarAbaReporteVolumes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(RV_ABA)) return rvAvisar('Aba ' + RV_ABA + ' já existe — nada foi alterado.');
  var aba = ss.insertSheet(RV_ABA);
  aba.getRange(1, 1, 1, RV_COLS_ENTRADA)
     .setValues([['MES', 'ANO', 'CODIGO', 'DESCRICAO', 'QUANTIDADE', 'PESO']]).setFontWeight('bold');
  aba.getRange(1, RV_COL_RESUMO, 1, 6).setValues([['RESUMO: MES', 'ANO', 'VOLUMES', 'PRODUTOS', 'FATOR', 'PENDENCIAS']]).setFontWeight('bold');
  aba.setFrozenRows(1);
  rvAvisar('Aba ' + RV_ABA + ' criada. Cole o relatório do mês (MES, ANO, CODIGO, DESCRICAO, QUANTIDADE, PESO) e rode calcularVolumesMes(). '
    + 'O PESO é opcional para volumes e fator; é ele que dá peso por produto no comparativo de anos do painel.');
}

/* ══ 2 · CADASTRO ══
   PRODUTO_CODIGO: A = código do SKU de volume, B = descrição "VOL 1/2 NOME".
   Devolve nome do produto → quantos volumes ele tem. Usado só para o produto
   que aparecer no mês SEM linhas de volume: aí a conta usa o cadastro em vez
   de assumir caixa única. A aba não existir não é erro — vira aproximação. */
function rvLerCadastro(ss) {
  var aba = ss.getSheetByName(RV_ABA_CADASTRO);
  var porProduto = {};
  if (!aba) return porProduto;
  var linhas = aba.getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    var m = String(linhas[i][1] || '').trim().match(RV_RE_VOL);
    if (!m) continue;
    var nome = m[3].trim().toUpperCase();
    porProduto[nome] = Math.max(porProduto[nome] || 0, parseInt(m[2], 10));
  }
  return porProduto;
}

/* ══ 3 · CÁLCULO DO MÊS ══ */
function calcularVolumesMes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(RV_ABA);
  if (!aba) return rvErro('Aba "' + RV_ABA + '" não encontrada — rode criarAbaReporteVolumes().');
  var cadastro = rvLerCadastro(ss);

  var linhas = aba.getRange(2, 1, Math.max(aba.getLastRow() - 1, 1), 5).getValues();
  var agr = rvAgruparLinhas(linhas), meses = agr.meses, ordem = agr.ordem;
  if (!ordem.length) return rvErro('Nenhuma linha válida em ' + RV_ABA + ' (MES, ANO, CODIGO, DESCRICAO, QUANTIDADE).');

  var saida = ordem.map(function (chave) {
    var g = meses[chave];
    var pendentes = rvVolumesDoMes(g, cadastro);
    return [g.mes, g.ano, g.vol, g.prod, g.prod > 0 ? g.vol / g.prod : '',
            pendentes.length
              ? pendentes.length + ' produto(s) sem SKU de volume (contados como 1 caixa): ' + pendentes.slice(0, 8).join('; ')
                + (pendentes.length > 8 ? '…' : '')
              : ''];
  });

  var alt = Math.max(aba.getLastRow() - 1, 1);
  aba.getRange(2, RV_COL_RESUMO, alt, 6).clearContent();
  aba.getRange(2, RV_COL_RESUMO, saida.length, 6).setValues(saida);
  rvAvisar('Resumo calculado para ' + saida.length + ' mês(es). Confira VOLUMES e PRODUTOS e rode lancarVolumesNaHistorico(). '
    + 'Produto listado como pendência: cadastre os SKUs de volume dele na ' + RV_ABA_CADASTRO + ' para a conta ficar exata.');
}

/* Agrupa linhas [MES, ANO, CODIGO, DESCRICAO, QUANTIDADE, (PESO)] por mês,
   separando produto acabado de linha VOL. Puro: serve ao resumo mensal e ao
   corte parcial, com a mesma régua. */
function rvAgruparLinhas(linhas) {
  var meses = {}, ordem = [];
  linhas.forEach(function (l) {
    var mes = String(l[0] || '').trim().toUpperCase().slice(0, 3);
    var ano = parseInt(l[1], 10);
    var desc = String(l[3] || '').trim();
    var qtd = rvNum(l[4]);
    if (RV_MESES.indexOf(mes) < 0 || !ano || !desc || !qtd) return;
    var chave = mes + '/' + ano;
    if (!meses[chave]) {
      meses[chave] = { mes: mes, ano: ano, vol: 0, prod: 0, peso: 0, grupos: {}, produtos: [] };
      ordem.push(chave);
    }
    var g = meses[chave], m = desc.match(RV_RE_VOL);
    if (m) {
      /* grupo por produto: quantas caixas ele tem (o "de" do x/de) e quanto
         foi reportado nessas linhas */
      var nome = m[3].trim().toUpperCase();
      var grp = g.grupos[nome] || (g.grupos[nome] = { n: 1, q: 0 });
      grp.n = Math.max(grp.n, parseInt(m[2], 10) || 1);
      grp.q += qtd;
    } else {
      g.prod += qtd;
      g.peso += rvNum(l[5]);
      g.produtos.push({ nome: desc.toUpperCase(), qtd: qtd });
    }
  });
  return { meses: meses, ordem: ordem };
}

/* Preenche g.vol de um mês agrupado e devolve os produtos sem SKU de volume.
   VOLUMES = quantidade do produto × nº de caixas dele.
   Somar as linhas VOL parecia mais direto, mas elas divergem do produto
   quando a caixa é apontada em mês diferente (39 de 138 produtos em
   JAN/26), e aí o fator chega a ficar abaixo de 1 — impossível, já que
   nenhum produto sai em menos de uma caixa. Multiplicar é imune a essa
   defasagem: cada unidade produzida gera as caixas que a embalagem dela
   exige. O nº de caixas vem da estrutura VOL x/de do próprio mês; sem
   linha VOL, vem do cadastro; sem cadastro, 1 caixa. */
function rvVolumesDoMes(g, cadastro) {
  var pend = {}, usados = {};
  g.produtos.forEach(function (p) {
    var achou = null;
    Object.keys(g.grupos).some(function (nv) {
      if (p.nome.indexOf(nv) === 0 || rvAbrevia(nv, p.nome)) { achou = nv; return true; }
      return false;
    });
    if (achou) { g.vol += p.qtd * g.grupos[achou].n; usados[achou] = true; return; }
    var nVols = 0;
    Object.keys(cadastro).some(function (nc) {
      if (p.nome.indexOf(nc) === 0 || rvAbrevia(nc, p.nome)) { nVols = cadastro[nc]; return true; }
      return false;
    });
    if (nVols > 0) { g.vol += p.qtd * nVols; }
    else           { g.vol += p.qtd; pend[p.nome] = true; }
  });
  /* Linhas VOL sem produto correspondente no mês: entram como reportadas,
     senão a caixa apontada some da conta. */
  Object.keys(g.grupos).forEach(function (nv) {
    if (!usados[nv]) g.vol += g.grupos[nv].q;
  });
  return Object.keys(pend);
}

/* ══ 4 · LANÇAMENTO NA HISTORICO ══
   Grava volumesProduzidos casando mês+ano; se existir uma coluna cujo
   cabeçalho comece com "produtosReport", grava também os produtos do
   relatório — é com ela que o dashboard calcula o fator na base coerente.
   Não cria coluna sozinho e não apaga nada. */
function lancarVolumesNaHistorico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaRV = ss.getSheetByName(RV_ABA);
  var aba = ss.getSheetByName(RV_ABA_HISTORICO);
  if (!abaRV) return rvErro('Aba "' + RV_ABA + '" não encontrada.');
  if (!aba)   return rvErro('Aba "' + RV_ABA_HISTORICO + '" não encontrada.');

  var resumo = abaRV.getRange(2, RV_COL_RESUMO, Math.max(abaRV.getLastRow() - 1, 1), 4).getValues()
    .filter(function (l) { return l[0] && l[1] && rvNum(l[2]) > 0; });
  if (!resumo.length) return rvErro('Resumo vazio — rode calcularVolumesMes() primeiro.');

  var linhas = aba.getDataRange().getValues();
  var iCab = -1, col = {};
  for (var i = 0; i < Math.min(linhas.length, 20) && iCab < 0; i++) {
    var norm = linhas[i].map(rvNormaliza);
    if (norm.indexOf('mes') >= 0 && norm.indexOf('ano') >= 0) {
      iCab = i;
      norm.forEach(function (n, c) {
        if (n === 'mes') col.mes = c;
        else if (n === 'ano') col.ano = c;
        else if (n.indexOf('volumes') === 0 && col.vol === undefined) col.vol = c;
        else if (n.indexOf('produtosreport') === 0 && col.prod === undefined) col.prod = c;
      });
    }
  }
  if (iCab < 0) return rvErro('Cabeçalho com "mes" e "ano" não encontrado na ' + RV_ABA_HISTORICO + '.');
  if (col.vol === undefined) {
    return rvErro('Coluna de volumes não encontrada na ' + RV_ABA_HISTORICO + ' — crie o cabeçalho '
      + '"volumesProduzidos" na primeira coluna livre e rode de novo.');
  }

  var mapa = {};
  for (var r = iCab + 1; r < linhas.length; r++) {
    var m = String(linhas[r][col.mes] || '').trim().toUpperCase().slice(0, 3);
    var a = parseInt(linhas[r][col.ano], 10);
    if (RV_MESES.indexOf(m) >= 0 && a) mapa[m + '/' + a] = r + 1;   /* linha na planilha */
  }

  var gravados = [], semLinha = [];
  resumo.forEach(function (l) {
    var chave = String(l[0]).trim().toUpperCase().slice(0, 3) + '/' + parseInt(l[1], 10);
    var linha = mapa[chave];
    if (!linha) { semLinha.push(chave); return; }
    aba.getRange(linha, col.vol + 1).setValue(rvNum(l[2]));
    if (col.prod !== undefined && rvNum(l[3]) > 0) aba.getRange(linha, col.prod + 1).setValue(rvNum(l[3]));
    gravados.push(chave + '=' + rvNum(l[2]));
  });
  rvAvisar('Lançado na ' + RV_ABA_HISTORICO + ': ' + (gravados.join(', ') || 'nada')
    + (semLinha.length ? '. SEM linha na HISTORICO (mês ainda não existe lá): ' + semLinha.join(', ') : '')
    + (col.prod === undefined ? '. Dica: crie também a coluna "produtosReportados" para o dashboard usar o fator exato.' : '')
    + '. O dashboard pega no próximo sync.');
}

/* ══ 5 · AUTOMÁTICO — PDF do Drive direto para a HISTORICO ══
   O ERP é local e não conversa com a planilha; o combinado é: o PDF do mês
   cai na pasta REPORTES DE VOLUMES do Drive e daqui para frente ninguém
   digita nada. A conversão PDF→texto usa o próprio Drive (copiar o arquivo
   como Documento Google extrai o texto, o mesmo truque do OCR), as linhas
   são lidas com a mesma régua do modo manual e o mês inteiro é substituído
   na REPORTE_VOLUMES — rodar duas vezes não duplica. */

var RV_PASTA      = 'REPORTES DE VOLUMES';
var RV_PROCESSADOS = 'PROCESSADOS';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📦 Volumes')
    .addItem('Processar PDFs da pasta do Drive', 'processarReportesDrive')
    .addItem('Processar só os cortes parciais (mês em curso)', 'processarParciaisDrive')
    .addItem('Recalcular resumo (dados colados)', 'calcularVolumesMes')
    .addItem('Lançar na HISTORICO', 'lancarVolumesNaHistorico')
    .addSeparator()
    .addItem('Instalar processamento diário', 'instalarProcessamentoDiario')
    .addItem('Criar linha TOTAL VOLUMES no plano mestre', 'criarLinhaTotalVolumes')
    .addToUi();
  /* Ponto do RH (PontoRH.gs): extrato de totais → HISTORICO */
  SpreadsheetApp.getUi().createMenu('👥 Ponto')
    .addItem('Processar extratos da pasta do Drive', 'processarPontoDrive')
    .addItem('Ensaio sem gravar (ver Registro)', 'testePonto')
    .addSeparator()
    .addItem('Criar aba FUNCIONARIOS', 'criarAbaFuncionarios')
    .addItem('Instalar processamento diário', 'instalarProcessamentoPonto')
    .addItem('Apagar meses futuros criados por engano', 'apagarMesesFuturos')
    .addToUi();
  /* Metas oficiais (Code.gs): aba METAS manda sobre o padrão do painel */
  /* Plano Mestre (CargaPlanoMestre.gs) */
  SpreadsheetApp.getUi().createMenu('📋 Plano Mestre')
    .addItem('Validar matriz (TOTAL ANO × lotes)', 'validarPlanoMestre')
    .addItem('Derivar 2025 de 2026 (−5%) — plano derivado, não o da época', 'derivarPlano2025De2026')
    .addItem('Refazer 2025 de 2026 com outro fator…', 'refazerPlano2025De2026')
    .addItem('Formatar colunas de 2025 como as de 2026', 'formatarPlanoDerivado2025')
    .addSeparator()
    .addItem('Criar aba FERIADOS (dias úteis do mês em curso)', 'criarAbaFeriados')
    .addToUi();
  SpreadsheetApp.getUi().createMenu('🎯 Metas')
    .addItem('Criar aba METAS (se não existir)', 'criarAbaMetas')
    .addItem('Produção pelo ERP desde 2025', 'producaoPeloErpDesde2025')
    .addToUi();
}

/* Duas execuções ao mesmo tempo (clique duplo no menu, menu + gatilho das 6h)
   leem a mesma pasta e gravam duas vezes — foi assim que a PARCIAL_MES ganhou
   duas linhas iguais em SET/26. O lock serializa: a segunda espera até 30 s e,
   se a primeira ainda não acabou, desiste avisando em vez de gravar em cima. */
function rvComLock(nome, fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    rvAvisar(nome + ': outro processamento ainda está rodando — aguarde ele terminar e rode de novo.');
    return null;
  }
  try { return fn(); } finally { lock.releaseLock(); }
}

function processarReportesDrive() {
  rvComLock('Reportes', rvProcessarReportes);
}

function rvProcessarReportes() {
  var pastas = DriveApp.getFoldersByName(RV_PASTA);
  if (!pastas.hasNext()) {
    return rvErro('Pasta "' + RV_PASTA + '" não encontrada no Drive — crie a pasta e solte os PDFs do relatório nela.');
  }
  var pasta = pastas.next();
  var arquivos = pasta.getFilesByType(MimeType.PDF);
  var feitos = [], falhas = [];

  while (arquivos.hasNext()) {
    var pdf = arquivos.next();
    try {
      var texto = rvPdfParaTexto(pdf.getId());
      var mesAno = rvPeriodoDoTexto(texto);
      if (!mesAno) throw new Error('não achei "Período: dd/mm/aa" no PDF');
      /* Um corte parcial aqui fecharia o mês com número pela metade: esta
         pasta substitui o mês inteiro e lança em produtosReportados, que é o
         producaoReal do painel. Fica na pasta, com o motivo. */
      if (mesAno.parcial) throw new Error('é um corte PARCIAL (' + mesAno.ini + ' a ' + mesAno.fim
        + ') — vai na pasta "' + RV_PASTA_PARCIAL + '", não aqui');
      var linhas = rvLinhasDoTexto(texto, mesAno);
      if (!linhas.length) throw new Error('nenhuma linha de produto/volume reconhecida');
      var confere = rvConferirTotal(linhas, texto);
      rvSubstituirMes(mesAno, linhas);
      rvMoverParaProcessados(pasta, pdf);
      feitos.push(pdf.getName() + ' → ' + mesAno.mes + '/' + mesAno.ano + ' (' + linhas.length + ' linhas' + confere + ')');
    } catch (e) {
      falhas.push(pdf.getName() + ': ' + (e && e.message || e));
    }
  }

  if (feitos.length) {
    calcularVolumesMes();
    lancarVolumesNaHistorico();
  }
  /* Mesma varredura cuida dos cortes do mês em curso (pasta própria). */
  var parc = rvProcessarParciais();
  rvAvisar((feitos.length ? 'Processados:\n' + feitos.join('\n') : 'Nenhum PDF novo na pasta.')
    + (falhas.length ? '\n\nFALHARAM (ficaram na pasta):\n' + falhas.join('\n') : '')
    + '\n\n' + parc.resumo);
}

/* Um gatilho por dia, de manhã. Reinstalar não duplica. */
function instalarProcessamentoDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processarReportesDrive') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processarReportesDrive').timeBased().everyDays(1).atHour(6).create();
  rvAvisar('Instalado: as pastas "' + RV_PASTA + '" e "' + RV_PASTA_PARCIAL + '" são varridas todo dia por volta das 6h. '
    + 'PDF do mês fechado na primeira, corte parcial (01/MM até hoje) na segunda; o painel pega no sync.');
}

/* Copia o PDF como Documento Google (o Drive extrai o texto), lê e apaga a
   cópia. Não mexe no PDF original. */
function rvPdfParaTexto(fileId) {
  var resp = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ name: 'tmp_reporte_volumes', mimeType: 'application/vnd.google-apps.document' }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('conversão do PDF falhou (HTTP ' + resp.getResponseCode() + ')');
  }
  var docId = JSON.parse(resp.getContentText()).id;
  try {
    return DocumentApp.openById(docId).getBody().getText();
  } finally {
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (ignore) {}
  }
}

/* "Período: 01/09/26 até 30/09/26". Lê as DUAS datas: o mês é o da
   inicial, e o PDF é PARCIAL quando não vai do dia 1 ao último dia do mês —
   é isso que separa o reporte fechado (REPORTES DE VOLUMES → HISTORICO) do
   corte do mês em curso (REPORTES PARCIAIS → PARCIAL_MES). Tolera o texto
   vir com "até" antes das datas ou quebrado em duas linhas, que é como a
   conversão do PDF às vezes entrega. Sem a data final (layout antigo), vale
   como fechado — comportamento de sempre. */
function rvPeriodoDoTexto(texto) {
  var m = texto.match(/Per[íi]odo:[\s\S]{0,20}?(\d{2})\/(\d{2})\/(\d{2,4})(?:[\s\S]{0,12}?(\d{2})\/(\d{2})\/(\d{2,4}))?/);
  if (!m) return null;
  function ano4(a) { a = parseInt(a, 10); return a < 100 ? a + 2000 : a; }
  function isoD(d, mo, a) { return a + '-' + mo + '-' + d; }
  var mes = parseInt(m[2], 10), ano = ano4(m[3]);
  var out = { mes: RV_MESES[mes - 1], ano: ano, ini: isoD(m[1], m[2], ano), fim: null, parcial: false };
  if (m[4]) {
    out.fim = isoD(m[4], m[5], ano4(m[6]));
    var diaIni = parseInt(m[1], 10), diaFim = parseInt(m[4], 10), mesFim = parseInt(m[5], 10);
    out.parcial = diaIni !== 1 || mesFim !== mes || ano4(m[6]) !== ano || diaFim !== rvUltimoDiaDoMes(ano, mes);
  }
  return out;
}
function rvUltimoDiaDoMes(ano, mes) { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }

/* Régua do PDF: código 000.000.000, descrição, três números (quantidade e
   peso com três decimais, custo com dois). Varre o TEXTO INTEIRO, não linha
   a linha: a conversão do Google entrega todas as linhas de uma página num
   parágrafo só, separadas por espaço, e a régua antiga (uma linha, ^…$)
   pegava só o que por acaso caía isolado — em SET/26 leu 1.136 de 26.178
   produtos e ninguém viu, porque o número é plausível. Os decimais fixos
   são o que ancora o fim da descrição; a descrição fica limitada a 60
   caracteres (o relatório corta em ~40) para um código sem números nunca
   engolir a linha seguinte. Cabeçalho, subtotal "Grupo:" e rodapé não têm
   código e ficam de fora sozinhos.

   O PESO (m[4]) é o total da linha (kg do que foi reportado daquele produto
   no período), na mesma régua do custo ao lado — não o peso unitário. O
   unitário sai de peso ÷ quantidade, e o painel confere a soma contra o
   quilosProduzidos da HISTORICO antes de usar. */
var RV_RE_LINHA = /(\d{3}\.\d{3}\.\d{3})\s+([\s\S]{1,60}?)\s+([\d.]+,\d{3})\s+([\d.]+,\d{3})\s+([\d.]+,\d{2})(?=\s|$)/g;
function rvLinhasDoTexto(texto, mesAno) {
  var out = [], m;
  RV_RE_LINHA.lastIndex = 0;
  while ((m = RV_RE_LINHA.exec(texto))) {
    var qtd = rvNum(m[3]);
    if (!qtd) continue;
    out.push([mesAno.mes, mesAno.ano, m[1], m[2].replace(/\s+/g, ' ').trim(), qtd, rvNum(m[4])]);
  }
  return out;
}

/* O relatório traz o próprio checksum: a linha "Geral" (ou "Total:" no
   resumo por transação) com a quantidade de TODAS as linhas, produto e
   volume. A soma do que foi lido tem de bater com ela EXATAMENTE (o meio
   ponto é só arredondamento): uma linha de 1 peça perdida já é leitura
   parcial, e nada pode ser gravado, nem no mês fechado nem no corte. Sem
   a linha no texto, segue sem conferir e diz isso. */
function rvTotalGeralDoTexto(texto) {
  var m = texto.match(/\b(?:Geral|Total:)\s+([\d.]+,\d{3})\s+([\d.]+,\d{3})/);
  return m ? { qtd: rvNum(m[1]), peso: rvNum(m[2]) } : null;
}
function rvConferirTotal(linhas, texto) {
  var g = rvTotalGeralDoTexto(texto);
  if (!g) return ' (sem linha Geral no PDF para conferir)';
  var soma = 0;
  linhas.forEach(function (l) { soma += rvNum(l[4]); });
  if (Math.abs(soma - g.qtd) > 0.5) {
    throw new Error('as linhas lidas somam ' + soma + ' e o total Geral do relatório é ' + g.qtd
      + ' — leitura incompleta, nada foi gravado');
  }
  return ' (confere com o Geral ' + g.qtd + ')';
}

/* Garante o cabeçalho PESO na coluna F de uma aba que nasceu com cinco
   colunas. Só escreve se F estiver vazia: se alguém já usou a coluna para
   outra coisa, o script não atropela — avisa quem chamou e o peso fica de
   fora, que é o comportamento de antes. */
function rvGarantirColunaPeso(aba) {
  var atual = String(aba.getRange(1, RV_COL_PESO).getValue() || '').trim();
  if (rvNormaliza(atual) === 'peso') return true;
  if (atual) return false;
  aba.getRange(1, RV_COL_PESO).setValue('PESO').setFontWeight('bold');
  return true;
}

/* Troca as linhas do mês na REPORTE_VOLUMES pelas recém-lidas — reprocessar
   o mesmo mês (PDF corrigido, por exemplo) substitui em vez de somar.

   Lê e escreve seis colunas mesmo quando as linhas antigas só tinham cinco:
   getValues() já devolve a matriz retangular com '' na F, e setValues()
   exige que toda linha tenha o mesmo tamanho — por isso as novas passam por
   rvSeisColunas() antes de entrar. */
function rvSubstituirMes(mesAno, novas) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(RV_ABA);
  if (!aba) { criarAbaReporteVolumes(); aba = ss.getSheetByName(RV_ABA); }
  var comPeso = rvGarantirColunaPeso(aba);
  var largura = comPeso ? RV_COLS_ENTRADA : 5;
  var alt = Math.max(aba.getLastRow() - 1, 0);
  var atuais = alt ? aba.getRange(2, 1, alt, largura).getValues() : [];
  var mantidas = atuais.filter(function (l) {
    var m = String(l[0] || '').trim().toUpperCase().slice(0, 3);
    return l[0] && !(m === mesAno.mes && parseInt(l[1], 10) === mesAno.ano);
  });
  var tudo = mantidas.concat(novas).map(function (l) { return rvLinhaLarga(l, largura); });
  if (alt) aba.getRange(2, 1, alt, largura).clearContent();
  if (tudo.length) aba.getRange(2, 1, tudo.length, largura).setValues(tudo);
}

/* Corta ou completa a linha para a largura da aba — linha de cinco colunas
   ganha '' na F, linha de seis perde o peso se a coluna não existir. */
function rvLinhaLarga(linha, largura) {
  var out = [];
  for (var i = 0; i < largura; i++) out.push(linha[i] === undefined ? '' : linha[i]);
  return out;
}

function rvMoverParaProcessados(pasta, pdf) {
  var sub = pasta.getFoldersByName(RV_PROCESSADOS);
  var destino = sub.hasNext() ? sub.next() : pasta.createFolder(RV_PROCESSADOS);
  pdf.moveTo(destino);
}

/* ══ 5b · CORTE PARCIAL — o mês em curso ══
   O reporte fechado só existe depois do dia 30. Para saber DURANTE o mês se
   o plano cabe no que resta, o mesmo "3 - REPORTE" é emitido de 01/MM até a
   data de hoje e salvo na pasta REPORTES PARCIAIS. Cada PDF vira UMA LINHA na
   aba PARCIAL_MES (mes, ano, dataCorte, produtos, volumes, peso, geradoEm,
   arquivo): acumulado, não a semana isolada — um corte perdido não quebra a
   soma, o mais recente sempre vale. Reprocessar o mesmo corte substitui a
   linha. Nada aqui toca a HISTORICO: o mês continua aberto para todo o
   painel; só o bloco "Mês em curso" do Plano Mestre lê esta aba. */
var RV_PASTA_PARCIAL = 'REPORTES PARCIAIS';
var RV_ABA_PARCIAL   = 'PARCIAL_MES';
var RV_PARCIAL_CAB   = ['mes', 'ano', 'dataCorte', 'produtos', 'volumes', 'peso', 'geradoEm', 'arquivo'];

function processarParciaisDrive() {
  rvComLock('Cortes parciais', function () { rvAvisar(rvProcessarParciais().resumo); });
}

/* Devolve { feitos, falhas, resumo } — chamado pelo gatilho diário e pelo menu. */
function rvProcessarParciais() {
  var pastas = DriveApp.getFoldersByName(RV_PASTA_PARCIAL);
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder(RV_PASTA_PARCIAL);
  var arquivos = pasta.getFilesByType(MimeType.PDF);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cadastro = rvLerCadastro(ss);
  var feitos = [], falhas = [];

  while (arquivos.hasNext()) {
    var pdf = arquivos.next();
    try {
      var texto = rvPdfParaTexto(pdf.getId());
      var per = rvPeriodoDoTexto(texto);
      if (!per) throw new Error('não achei "Período: dd/mm/aa até dd/mm/aa" no PDF');
      if (!per.fim) throw new Error('não achei a data final do período');
      if (!per.parcial) throw new Error('é o mês FECHADO (' + per.ini + ' a ' + per.fim + ') — vai na pasta "' + RV_PASTA + '"');
      if (per.ini.slice(-2) !== '01') throw new Error('o corte tem de começar no dia 1 (veio ' + per.ini + ') — o painel soma do início do mês');
      var linhas = rvLinhasDoTexto(texto, per);
      if (!linhas.length) throw new Error('nenhuma linha de produto/volume reconhecida');
      var confere = rvConferirTotal(linhas, texto);
      var agr = rvAgruparLinhas(linhas);
      var g = agr.meses[agr.ordem[0]];
      rvVolumesDoMes(g, cadastro);
      rvGravarParcial(ss, [g.mes, g.ano, per.fim, g.prod, g.vol, Math.round(g.peso * 10) / 10,
                            new Date().toISOString(), pdf.getName()]);
      rvMoverParaProcessados(pasta, pdf);
      feitos.push(pdf.getName() + ' → ' + g.mes + '/' + g.ano + ' até ' + per.fim + ': ' + g.prod + ' produtos, '
        + g.vol + ' volumes em ' + linhas.length + ' linhas' + confere);
    } catch (e) {
      falhas.push(pdf.getName() + ': ' + (e && e.message || e));
    }
  }
  var resumo = 'Cortes parciais — ' + (feitos.length ? 'lançados na ' + RV_ABA_PARCIAL + ':\n' + feitos.join('\n')
    : 'nenhum PDF novo em "' + RV_PASTA_PARCIAL + '".')
    + (falhas.length ? '\nFALHARAM (ficaram na pasta):\n' + falhas.join('\n') : '');
  return { feitos: feitos, falhas: falhas, resumo: resumo };
}

function rvGarantirAbaParcial(ss) {
  var aba = ss.getSheetByName(RV_ABA_PARCIAL);
  if (aba) return aba;
  aba = ss.insertSheet(RV_ABA_PARCIAL);
  aba.getRange(1, 1, 1, RV_PARCIAL_CAB.length).setValues([RV_PARCIAL_CAB]).setFontWeight('bold');
  aba.setFrozenRows(1);
  /* dataCorte e geradoEm como texto: uma data convertida pelo Sheets voltaria
     em outro fuso e moveria o corte de sexta para quinta. */
  aba.getRange(2, 3, 1000, 1).setNumberFormat('@');
  aba.getRange(2, 7, 1000, 1).setNumberFormat('@');
  return aba;
}

/* Célula que pode ter virado Date: o Sheets converte '2026-09-18' ao gravar
   por appendRow, mesmo com a coluna em texto, e String(Date) é "Thu Sep 18
   2026…" — foi assim que o mesmo corte entrou três vezes na PARCIAL_MES: a
   chave nunca casava. Devolve 'AAAA-MM-DD' no calendário da planilha (os
   getters locais, como o acaoTxt do Code.gs); texto passa como está. */
function rvIsoDia(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var m = v.getMonth() + 1, d = v.getDate();
    return v.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  return String(v === null || v === undefined ? '' : v).trim().slice(0, 10);
}

/* Escreve a linha com dataCorte e geradoEm forçados a texto ANTES do valor
   entrar — setNumberFormat('@') na célula e depois setValues; appendRow não
   respeita o formato e reconverte. */
function rvEscreverParcial(aba, row, linha) {
  aba.getRange(row, 3).setNumberFormat('@');
  aba.getRange(row, 7).setNumberFormat('@');
  aba.getRange(row, 1, 1, linha.length).setValues([linha]);
}

/* Uma linha por (mes, ano, dataCorte): o mesmo corte reprocessado substitui.
   Se a chave já estiver duplicada, a primeira linha recebe o valor novo e as
   demais saem — de baixo para cima, para os índices não se moverem no meio
   da remoção. */
function rvGravarParcial(ss, linha) {
  var aba = rvGarantirAbaParcial(ss);
  var n = Math.max(aba.getLastRow() - 1, 0);
  var atuais = n ? aba.getRange(2, 1, n, 3).getValues() : [];
  var iguais = [];
  for (var i = 0; i < atuais.length; i++) {
    if (String(atuais[i][0]).toUpperCase().slice(0, 3) === linha[0] && parseInt(atuais[i][1], 10) === linha[1]
        && rvIsoDia(atuais[i][2]) === linha[2]) iguais.push(i + 2);
  }
  if (!iguais.length) { rvEscreverParcial(aba, aba.getLastRow() + 1, linha); return; }
  rvEscreverParcial(aba, iguais[0], linha);
  for (var k = iguais.length - 1; k >= 1; k--) aba.deleteRow(iguais[k]);
}

/* ══ 6 · PLANO MESTRE EM VOLUMES ══
   A capacidade da embalagem é por volume, então o plano também precisa
   existir nessa unidade — mas a matriz de lotes continua em produtos, que é
   o que o resto do painel (ritmos, simulação, demanda) consome. A saída é
   uma linha oficial TOTAL VOLUMES logo abaixo da TOTAL GERAL: nasce como
   fórmula (produtos do mês × fator, editável na coluna O) e o planejamento
   pode sobrescrever qualquer mês com o número decidido. O Code.gs lê a
   linha e o dashboard passa a usar o plano oficial em vez do fator médio. */

var RV_PM_ABA    = 'PLANO MESTRE';
var RV_PM_TOTAL  = 'TOTAL GERAL';
var RV_PM_LINHA  = 'TOTAL VOLUMES';
/* Colunas da matriz: A = rótulo, B..M = jan..dez, N = TOTAL ANO, O = fator. */
var RV_PM_COL_JAN = 2, RV_PM_COL_DEZ = 13, RV_PM_COL_TOTAL = 14, RV_PM_COL_FATOR = 15;
/* Fator inicial: realizado JAN–JUL/26 (254.821 volumes ÷ 210.961 produtos). */
var RV_PM_FATOR_INICIAL = 1.208;

function criarLinhaTotalVolumes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(RV_PM_ABA);
  if (!aba) return rvErro('Aba "' + RV_PM_ABA + '" não encontrada.');

  var valores = aba.getDataRange().getValues();
  var iTotal = -1, iVol = -1;
  for (var i = 0; i < valores.length; i++) {
    var a = rvNormaliza(valores[i][0]);
    if (iTotal < 0 && a === rvNormaliza(RV_PM_TOTAL)) iTotal = i + 1;
    if (iVol < 0 && a === rvNormaliza(RV_PM_LINHA)) iVol = i + 1;
  }
  if (iVol > 0)   return rvAvisar('Linha ' + RV_PM_LINHA + ' já existe (linha ' + iVol + ') — nada foi alterado.');
  if (iTotal < 0) return rvErro('Linha "' + RV_PM_TOTAL + '" não encontrada na ' + RV_PM_ABA + '.');

  aba.insertRowsAfter(iTotal, 1);
  var nova = iTotal + 1;
  aba.getRange(nova, 1).setValue(RV_PM_LINHA).setFontWeight('bold');
  aba.getRange(nova, RV_PM_COL_FATOR).setValue(RV_PM_FATOR_INICIAL);
  aba.getRange(nova, RV_PM_COL_FATOR + 1)
     .setValue('← fator vol/produto — edite aqui, ou digite o volume direto no mês')
     .setFontStyle('italic');

  /* Mês sem plano fica traço, como o resto da matriz; com plano, produtos ×
     fator. É fórmula de propósito: enquanto o planejamento não decidir o
     número, a linha acompanha o plano de produtos sozinha. */
  var f = [];
  for (var c = RV_PM_COL_JAN; c <= RV_PM_COL_DEZ; c++) {
    var letra = String.fromCharCode(64 + c);
    f.push('=IF(N(' + letra + iTotal + ')=0,"-",ROUND(' + letra + iTotal + '*$O$' + nova + ',0))');
  }
  aba.getRange(nova, RV_PM_COL_JAN, 1, f.length).setFormulas([f]);
  aba.getRange(nova, RV_PM_COL_TOTAL).setFormula('=SUM(B' + nova + ':M' + nova + ')');

  rvAvisar('Linha ' + RV_PM_LINHA + ' criada abaixo da ' + RV_PM_TOTAL + ' com fator '
    + RV_PM_FATOR_INICIAL + ' (realizado JAN–JUL/26). Ajuste o fator na coluna O ou digite '
    + 'os meses direto. Reimplante o Web App para o dashboard passar a ler o plano em volumes.');
}

/* ══ HELPERS ══ */

/* A linha VOL abrevia e trunca a descrição do produto: "PENT CAMARIM 1PT
   2GAV" contra "PENTEADEIRA CAMARIM 1PT 2GAV BRANCO", "CONJ 2 MESAS" contra
   "CONJUNTO 2 MESAS", "CANT CAFE" contra "CANTINHO DO CAFE". Só comparar
   começo de texto não casa esses, e o produto era contado como caixa única
   ALÉM das linhas VOL dele — 5% de volume a mais no ano. Aqui cada palavra
   do VOL precisa ser começo da palavra correspondente do produto (ou vice-
   versa), ignorando conectores; qualquer palavra diferente reprova o
   casamento, então "MESA CABECEIRA SLEEP" não casa com "MESA CABECEIRA
   MAVIE". */
var RV_STOP = { DO:1, DA:1, DE:1, DOS:1, DAS:1, E:1 };
function rvPalavras(s) {
  return String(s || '').toUpperCase().split(/[\s\/]+/).filter(function (t) {
    return t && !RV_STOP[t];
  });
}
function rvAbrevia(nomeVol, nomeProduto) {
  var a = rvPalavras(nomeVol), b = rvPalavras(nomeProduto);
  var n = Math.min(a.length, b.length);
  if (n < 2) return false;
  for (var i = 0; i < n; i++) {
    if (b[i].indexOf(a[i]) !== 0 && a[i].indexOf(b[i]) !== 0) return false;
  }
  return true;
}

function rvNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s || s === '-') return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function rvNormaliza(v) {
  return String(v === null || v === undefined ? '' : v)
    .trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function rvErro(msg) { Logger.log('ERRO: ' + msg); rvAvisar(msg); }

function rvAvisar(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}
