/* ══════════════════════════════════════════════════════════════════════════
   Teste do leitor de PDF do ERP — apps-script/ReporteVolumes.gs

   Rode com:  node testes/reporte-parcial.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   O mesmo "3 - REPORTE" chega em duas versões: o mês fechado (01 a 30) e o
   corte parcial (01 até hoje). Os dois têm o MESMO layout. Se o leitor não
   distinguir, um corte parcial na pasta mensal substitui o mês inteiro,
   vira produtosReportados e o painel fecha setembro com metade das peças —
   sem erro nenhum na tela. A régua que separa os dois é a data final do
   período; este teste a prende, junto com o agrupamento produto × volume
   que o corte parcial reaproveita do resumo mensal.

   E o leitor de linhas: a conversão do Google entrega todas as linhas de
   uma página num parágrafo só, separadas por espaço. A régua antiga, linha
   a linha, leu 1.136 de 26.178 produtos no corte de SET/26 sem acusar nada.
   Aqui o mesmo trecho entra nos dois formatos e a soma tem de bater com a
   linha "Geral" do próprio relatório — o checksum que o PDF já trazia.

   O .gs é JavaScript: o arquivo é avaliado num escopo isolado, com os
   objetos do Apps Script ausentes — só as funções puras são chamadas.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

function carregarRV() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'ReporteVolumes.gs'), 'utf8');
  const exp = 'return { rvPeriodoDoTexto, rvUltimoDiaDoMes, rvLinhasDoTexto, rvAgruparLinhas, rvVolumesDoMes, rvTotalGeralDoTexto, rvConferirTotal, rvGravarParcial, rvNum, RV_RE_VOL, rvTipoDoTexto, rvConferirTipo, rvOrfaosVol, RV_TIPO_OK };';
  return new Function('Logger', src + '\n' + exp)({ log() {} });
}
const RV = carregarRV();

let falhas = 0, total = 0;
function afirma(nome, cond) {
  total++;
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`);
}
function ok(nome, obtido, esperado, tol = 0.001) {
  total++;
  const bom = Math.abs(obtido - esperado) <= tol;
  if (!bom) falhas++;
  console.log(`  ${bom ? 'ok  ' : 'FALHA'} ${nome.padEnd(52)} ${(+obtido).toFixed(3).padStart(12)} (esperado ${(+esperado).toFixed(3)})`);
}
const sec = t => console.log('\n' + t);

/* ══ Período ══ */
sec('rvPeriodoDoTexto — mês, datas e a marca de PARCIAL');
const linha1 = 'Período: 01/09/26 até 18/09/26\nDepósito: Transação: 3 - REPORTE';   /* conversão do Docs: uma linha */
const quebrado = 'Período: até\n01/09/26 18/09/26\nDepósito:';                       /* PDF extraído em duas linhas */
const fechado = 'Período: 01/09/26 até 30/09/26';
const fev = 'Período: 01/02/26 até 28/02/26';
const antigo = 'Período: 01/09/26\nDepósito:';                                         /* sem data final */
let p = RV.rvPeriodoDoTexto(linha1);
afirma('mês e ano da data inicial', p.mes === 'SET' && p.ano === 2026);
afirma('ini/fim em AAAA-MM-DD', p.ini === '2026-09-01' && p.fim === '2026-09-18');
afirma('01 a 18/09 → PARCIAL', p.parcial === true);
afirma('mesma leitura com o texto quebrado em duas linhas', (() => { const q = RV.rvPeriodoDoTexto(quebrado); return q.mes === 'SET' && q.fim === '2026-09-18' && q.parcial; })());
afirma('01 a 30/09 → mês fechado', RV.rvPeriodoDoTexto(fechado).parcial === false);
afirma('01 a 28/02/26 → fechado (fevereiro tem 28)', RV.rvPeriodoDoTexto(fev).parcial === false);
afirma('01 a 28/09 → parcial (setembro tem 30)', RV.rvPeriodoDoTexto('Período: 01/09/26 até 28/09/26').parcial === true);
afirma('05 a 30/09 → parcial (não começa no dia 1)', RV.rvPeriodoDoTexto('Período: 05/09/26 até 30/09/26').parcial === true);
afirma('01/09 a 02/10 → parcial (muda de mês)', RV.rvPeriodoDoTexto('Período: 01/09/26 até 02/10/26').parcial === true);
afirma('ano com 4 dígitos', RV.rvPeriodoDoTexto('Período: 01/09/2026 até 30/09/2026').parcial === false);
afirma('sem data final (layout antigo) → fechado, fim null', (() => { const a = RV.rvPeriodoDoTexto(antigo); return a.parcial === false && a.fim === null && a.mes === 'SET'; })());
afirma('sem "Período" → null', RV.rvPeriodoDoTexto('Relatório sem cabeçalho') === null);
ok('último dia de fev/2026', RV.rvUltimoDiaDoMes(2026, 2), 28, 0);
ok('último dia de fev/2028 (bissexto)', RV.rvUltimoDiaDoMes(2028, 2), 29, 0);
ok('último dia de dez', RV.rvUltimoDiaDoMes(2026, 12), 31, 0);

/* ══ Linhas ══ */
sec('rvLinhasDoTexto — régua do PDF (código, descrição, qtde, peso, custo)');
const TEXTO = [
  'Produto Descrição Quantidade Peso (KG) Vlr. Custo',
  '100.009.001 TOUCADOR MAGIC NEW BRANCO 259,000 4.299,400 33.190,74',
  '100.009.006 TOUCADOR MAGIC NEW OFF WHITE 94,000 1.560,400 12.700,52',
  '100 TOUCADORES 353,000 5.859,800 45.891,26',                       /* subtotal do grupo: sem código completo */
  '900.001.001 VOL 1/2 TOUCADOR MAGIC NEW BRANCO 259,000 2.100,000 1,00',
  '900.001.002 VOL 2/2 TOUCADOR MAGIC NEW BRANCO 250,000 2.199,400 1,00',
  '102.004.001 SAPATEIRA SPAZIO BRANCO 1,000 39,500 135,74',
  '3 REPORTE 863,000 10.198,700 45.000,00',                            /* rodapé */
].join('\n');
const L = RV.rvLinhasDoTexto(TEXTO, { mes: 'SET', ano: 2026 });
afirma('5 linhas com código (subtotal e rodapé ficam de fora)', L.length === 5);
afirma('linha = [mes, ano, codigo, descricao, qtde, peso]', L[0][0] === 'SET' && L[0][1] === 2026 && L[0][2] === '100.009.001' && L[0][3] === 'TOUCADOR MAGIC NEW BRANCO');
ok('quantidade em padrão BR (259,000 → 259)', L[0][4], 259, 0);
ok('peso em padrão BR (4.299,400 → 4299,4)', L[0][5], 4299.4, 0.001);

/* ══ Formato da conversão do Google: a página inteira num parágrafo ══ */
sec('rvLinhasDoTexto — parágrafo único (como o Google converte o PDF)');
const PARAGRAFO = 'Vlr. Custo 106.042.118 PAINEL INTENSE OFF WHITE/FREIJO 249,000 6.249,900 22.239,78 106.042.119 PAINEL INTENSE BRANCO ACETINADO/FREIJO 49,000 1.229,900 4.394,01 '
  + 'Grupo: 106 PAINEIS/HOME 298,000 7.479,800 26.633,79 108.007.001 MESA COMP SPACE BRANCO 48,000 1.444,800 5.217,73 109.042.124 MESA CENTRO DECOR 700 WHISKY 76,000 570,000 11.257,29 '
  + '105.026.116 RACK SIRIUS 0.9 CINAMOMO 1,000 21,050 106,79 501.113.002 VOL 1/1 PAINEL INTENSE OFF WHITE/FREIJO 249,000 6.249,900 22.239,78\n\n'
  + '.»\n\nPATRIMAR MOVEIS LTDA\n\nCNPJ: 02.948.278/0001-10 I.E.: 393001450118\n\nVlr. Custo Geral 672,000 15.765,450 69.849,38';
const LP = RV.rvLinhasDoTexto(PARAGRAFO, { mes: 'SET', ano: 2026 });
afirma('6 linhas com código (cabeçalho, "Grupo:", CNPJ e "Geral" ficam de fora)', LP.length === 6);
afirma('descrição com número no meio ("DECOR 700 WHISKY", "SIRIUS 0.9") não corta a régua',
  LP.some(l => l[3] === 'MESA CENTRO DECOR 700 WHISKY' && l[4] === 76) && LP.some(l => l[3] === 'RACK SIRIUS 0.9 CINAMOMO' && l[4] === 1));
afirma('descrição termina antes dos números (sem "249,000" grudado)', LP[0][3] === 'PAINEL INTENSE OFF WHITE/FREIJO' && LP[0][4] === 249);
afirma('linha VOL no parágrafo é reconhecida', LP.some(l => /^VOL 1\/1 PAINEL/.test(l[3])));
afirma('o mesmo trecho, uma linha por registro, dá as mesmas 6 linhas',
  RV.rvLinhasDoTexto(PARAGRAFO.replace(/ (?=\d{3}\.\d{3}\.\d{3} )/g, '\n'), { mes: 'SET', ano: 2026 }).length === 6);
ok('peso da 1ª linha em padrão BR', LP[0][5], 6249.9, 0.001);

sec('rvConferirTotal — a soma lida tem de bater com o "Geral" do relatório');
afirma('Geral lido do texto: 672 pç (249+49+48+76+1+249)', RV.rvTotalGeralDoTexto(PARAGRAFO).qtd === 672);
afirma('"Total:" do resumo por transação também serve', RV.rvTotalGeralDoTexto('Total: 54.342,000 929.854,700 5.191.871,38').qtd === 54342);
afirma('soma 672 = Geral 672 → confere', /confere com o Geral 672/.test(RV.rvConferirTotal(LP, PARAGRAFO)));
afirma('faltando uma linha → recusa (leitura incompleta)', (() => { try { RV.rvConferirTotal(LP.slice(1), PARAGRAFO); return false; } catch (e) { return /leitura incompleta/.test(e.message) && /somam 423 /.test(e.message); } })());
afirma('sem linha Geral no texto → segue, avisando', /sem linha Geral/.test(RV.rvConferirTotal(LP, 'texto sem total')));
afirma('uma peça a menos (54.341 contra Geral 54.342) → recusa', (() => { try { RV.rvConferirTotal([['SET',2026,'x','y',54341,0]], 'Geral 54.342,000 1,000'); return false; } catch (e) { return /somam 54341 /.test(e.message); } })());
afirma('só arredondamento (54.342,4 contra 54.342) → passa', /confere/.test(RV.rvConferirTotal([['SET',2026,'x','y',54342.4,0]], 'Geral 54.342,000 1,000')));

/* ══ Agrupamento — a régua compartilhada entre resumo mensal e corte parcial ══ */
sec('rvAgruparLinhas + rvVolumesDoMes — produto × caixas');
const agr = RV.rvAgruparLinhas(L);
afirma('um mês agrupado: SET/2026', agr.ordem.length === 1 && agr.ordem[0] === 'SET/2026');
const g = agr.meses['SET/2026'];
ok('produtos = 259 + 94 + 1 (linhas VOL não somam)', g.prod, 354, 0);
ok('peso só dos produtos = 4.299,4 + 1.560,4 + 39,5', g.peso, 5899.3, 0.001);
afirma('grupo VOL do TOUCADOR BRANCO com 2 caixas', g.grupos['TOUCADOR MAGIC NEW BRANCO'] && g.grupos['TOUCADOR MAGIC NEW BRANCO'].n === 2);
const pend = RV.rvVolumesDoMes(g, { 'TOUCADOR MAGIC NEW OFF WHITE': 3 });
ok('volumes = 259×2 (VOL do mês) + 94×3 (cadastro) + 1×1 (sem nada)', g.vol, 801, 0);
afirma('pendência = só a SAPATEIRA (sem VOL e sem cadastro)', pend.length === 1 && pend[0] === 'SAPATEIRA SPAZIO BRANCO');
afirma('lista vazia → nenhum mês', RV.rvAgruparLinhas([]).ordem.length === 0);
afirma('linha sem quantidade é ignorada', RV.rvAgruparLinhas([['SET', 2026, '1', 'X', 0, 0]]).ordem.length === 0);

/* ══ Gravação na PARCIAL_MES — com uma planilha falsa, só o que o script usa ══ */
sec('rvGravarParcial — uma linha por (mes, ano, dataCorte), duplicata colapsa');
function FakeSheet(rows) {                       /* rows[0] = cabeçalho */
  this.rows = rows;
  this.getLastRow = () => this.rows.length;
  this.appendRow = () => { throw new Error('appendRow reconverte texto em Date — não usar'); };
  this.deleteRow = (r) => { this.rows.splice(r - 1, 1); };
  this.setFrozenRows = () => {};
  this.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (this.rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
    setValues: (vals) => { vals.forEach((v, i) => { const row = this.rows[r - 1 + i] || (this.rows[r - 1 + i] = []); v.forEach((x, j) => { row[c - 1 + j] = x; }); }); },
    setNumberFormat: () => ({}), setFontWeight: () => ({}),
  });
}
const CAB = ['mes', 'ano', 'dataCorte', 'produtos', 'volumes', 'peso', 'geradoEm', 'arquivo'];
const ss = (rows) => ({ getSheetByName: () => new FakeSheet(rows), insertSheet: () => { throw new Error('não deveria criar'); } });
const L18 = ['SET', 2026, '2026-09-18', 26178, 30069, 457677.2, 't1', 'a.pdf'];
let sh = ss([CAB.slice()]).getSheetByName(); RV.rvGravarParcial({ getSheetByName: () => sh }, L18);
afirma('aba vazia → acrescenta (1 linha)', sh.rows.length === 2 && sh.rows[1][3] === 26178);
RV.rvGravarParcial({ getSheetByName: () => sh }, ['SET', 2026, '2026-09-18', 26200, 30100, 457700, 't2', 'b.pdf']);
afirma('mesma chave → substitui, continua 1 linha', sh.rows.length === 2 && sh.rows[1][3] === 26200 && sh.rows[1][6] === 't2');
RV.rvGravarParcial({ getSheetByName: () => sh }, ['SET', 2026, '2026-09-25', 30000, 34000, 520000, 't3', 'c.pdf']);
afirma('outra data de corte → acrescenta (2 linhas)', sh.rows.length === 3 && sh.rows[2][2] === '2026-09-25');
RV.rvGravarParcial({ getSheetByName: () => sh }, ['OUT', 2026, '2026-09-25', 1, 1, 1, 't4', 'd.pdf']);
afirma('outro mês, mesma data → acrescenta (3 linhas)', sh.rows.length === 4);
/* o caso real: duas linhas iguais gravadas por execuções concorrentes */
sh = ss([CAB.slice(), L18.slice(), ['SET', 2026, '2026-09-18', 26178, 30069, 457677.2, 't1b', 'a.pdf'], ['OUT', 2026, '2026-10-02', 5, 5, 5, 't5', 'e.pdf']]).getSheetByName();
RV.rvGravarParcial({ getSheetByName: () => sh }, ['SET', 2026, '2026-09-18', 26178, 30069, 457677.2, 't6', 'a.pdf']);
afirma('duplicata da mesma chave colapsa numa linha e a de OUT fica', sh.rows.length === 3 && sh.rows[1][6] === 't6' && sh.rows[2][0] === 'OUT');
sh = ss([CAB.slice(), ['set', '2026', '2026-09-18T00:00:00', 1, 1, 1, 't', 'x']]).getSheetByName();
RV.rvGravarParcial({ getSheetByName: () => sh }, L18);
afirma('chave casa com mes em minúsculas, ano em texto e data com hora', sh.rows.length === 2 && sh.rows[1][3] === 26178);
/* o caso que gerou três linhas: o Sheets devolve dataCorte como Date */
sh = ss([CAB.slice(), ['SET', 2026, new Date(2026, 8, 18), 1136, 1136, 24855.5, 't0', 'a.pdf'],
                      ['SET', 2026, new Date(2026, 8, 18, 0, 0, 0), 26178, 30069, 457677.2, 't1', 'a.pdf']]).getSheetByName();
RV.rvGravarParcial({ getSheetByName: () => sh }, L18);
afirma('dataCorte como Date na planilha casa com a chave ISO → colapsa em 1 linha', sh.rows.length === 2 && sh.rows[1][6] === 't1' && sh.rows[1][3] === 26178);
afirma('Date de outro dia não casa', (() => { sh = ss([CAB.slice(), ['SET', 2026, new Date(2026, 8, 11), 17000, 0, 0, 't', 'x']]).getSheetByName(); RV.rvGravarParcial({ getSheetByName: () => sh }, L18); return sh.rows.length === 3; })());
afirma('escrita não usa appendRow (linha nova vai por setValues, com a célula em texto)', typeof sh.appendRow === 'function' && sh.rows[2][2] === '2026-09-18');


/* ══ Tipo do relatório — as peças saem iguais, os volumes não ══
   O ERP emite o mesmo "3 - REPORTE" como "Todos" (produto + linhas VOL) e
   como "P - PRODUTOS ACABADOS" (só produto). Medido nos PDFs reais: as peças
   e os quilos saem iguais nos dois, porque o leitor separa produto de VOL
   pela descrição; mas sem as linhas VOL os VOLUMES caem para 1 caixa por
   produto — JUN/26 deu 30.851 contra 38.499 reais. Por isso o padrão é
   "Todos", e o PDF fora dele é recusado em vez de gravado pela metade. */
sec('Tipo do relatório — só "Todos" traz os volumes');
afirma('lê o layout novo', RV.rvTipoDoTexto('Depósito: 1 Transação: 3 - REPORTE\nTipo: Todos\nProduto') === 'TODOS');
afirma('lê o layout antigo, com ponto-e-vírgula entre as células',
  RV.rvTipoDoTexto('Tipo: ; P - PRODUTOS ACABADOS ;;;;\nProduto') === 'P - PRODUTOS ACABADOS');
afirma('sem a linha Tipo → null (não dá para exigir o que o papel não diz)',
  RV.rvTipoDoTexto('Relatório Mensal\nProduto') === null);
afirma('o padrão é Todos', RV.RV_TIPO_OK === 'TODOS');
afirma('Todos passa', /Todos/.test(RV.rvConferirTipo('Tipo: Todos\nx')));
afirma('sem linha Tipo passa, dizendo que não conferiu',
  /sem linha/.test(RV.rvConferirTipo('Relatório\nx')));
afirma('Tipo P é RECUSADO, e o erro diz o que se perde', (() => {
  try { RV.rvConferirTipo('Tipo: P - PRODUTOS ACABADOS\nx'); return false; }
  catch (e) { return /Tipo: Todos/.test(e.message) && /38\.499/.test(e.message) && /Nada foi gravado/.test(e.message); }
})());

/* ══ VOL órfão — o que o casamento de nomes deixa passar ══
   Caixa apontada cujo produto não aparece como linha de produto: hoje entra
   só em VOLUMES e as peças e o peso somem. O casamento por nome abreviado
   cobre quase tudo ("PENT CAMARIM 1PT 2GAV DIAMANTE B" casa com
   "PENTEADEIRA CAMARIM 1PT 2GAV DIAMANTE BRANCO"), mas não é garantia. */
sec('VOL órfão — contado e dito, nunca engolido');
const LINHAS_ORF = [
  ['SET', 2026, '100.009.001', 'TOUCADOR MAGIC NEW BRANCO', 100, 1660],
  ['SET', 2026, '501.060.001', 'VOL 1/2 TOUCADOR MAGIC NEW BRANCO', 100, 830],
  ['SET', 2026, '501.060.002', 'VOL 2/2 TOUCADOR MAGIC NEW BRANCO', 100, 830],
  ['SET', 2026, '501.099.001', 'VOL 1/2 CANT CAFE AURORA CINAMOMO', 60, 900],
  ['SET', 2026, '501.099.002', 'VOL 2/2 CANT CAFE AURORA CINAMOMO', 60, 600]
];
const gOrf = (() => { const a = RV.rvAgruparLinhas(LINHAS_ORF); const g = a.meses[a.ordem[0]]; RV.rvVolumesDoMes(g, {}); return g; })();
const orf = RV.rvOrfaosVol(gOrf);
afirma('acha o produto que só existe como VOL', orf.nomes.length === 1 && /CANT CAFE AURORA/.test(orf.nomes[0]));
ok('as peças que ficaram de fora (120 caixas ÷ 2 por produto)', orf.pecas, 60);
ok('e os quilos que foram junto',                                orf.peso, 1500);
afirma('o produto que TEM linha de produto não é órfão', !orf.nomes.some(n => /TOUCADOR/.test(n)));
afirma('nome abreviado casa com o produto por extenso — não vira órfão falso', (() => {
  const L = [['SET', 2026, '1', 'PENTEADEIRA CAMARIM 1PT 2GAV DIAMANTE BRANCO', 50, 2275],
             ['SET', 2026, '2', 'VOL 1/2 PENT CAMARIM 1PT 2GAV DIAMANTE B', 50, 1400],
             ['SET', 2026, '3', 'VOL 2/2 PENT CAMARIM 1PT 2GAV DIAMANTE B', 50, 875]];
  const a = RV.rvAgruparLinhas(L); const g = a.meses[a.ordem[0]]; RV.rvVolumesDoMes(g, {});
  return RV.rvOrfaosVol(g).pecas === 0;
})());
afirma('sem linha VOL nenhuma → nenhum órfão', (() => {
  const a = RV.rvAgruparLinhas([['JUN', 2026, '1', 'TOUCADOR MAGIC NEW BRANCO', 94, 1560.4]]);
  const g = a.meses[a.ordem[0]]; RV.rvVolumesDoMes(g, {});
  return RV.rvOrfaosVol(g).pecas === 0 && RV.rvOrfaosVol(g).nomes.length === 0;
})());
afirma('o peso das linhas VOL é guardado — sem ele não dá para dizer quanto se perde',
  gOrf.grupos['CANT CAFE AURORA CINAMOMO'].p === 1500);

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
