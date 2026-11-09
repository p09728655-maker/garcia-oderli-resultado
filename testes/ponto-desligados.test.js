/* ══════════════════════════════════════════════════════════════════════════
   Teste dos desligados do mês no extrato do ponto — apps-script/PontoRH.gs
   (prDesligadosDoMes, prApurarDesligados) e index.html (DashUtils.pontosColab
   e a nota da integridade)

   Rode com:  node testes/ponto-desligados.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   O ponto só põe no Extrato de Totais quem saiu no mês se o RH exportar com
   os demitidos. JAN a SET/26 vieram sem; OUT/26, reexportado em 09/11/2026,
   com os 5 diretos: 91 → 96 diretos, absenteísmo 8,86% → 8,66%, pontos por
   direto −5,2%. Mês com e mês sem não se comparam, e o painel precisa saber
   qual é qual. A contagem é por mês, só diretos:
     desligadosPonto     = demissão no mês e está na PONTO_PESSOA do mês
     desligadosForaPonto = demissão no mês e não está
   Casos montados à mão (OUT/26, dias 1 a 31):
     1532 direto, demissão 26/10, no extrato          → dentro
     1593 direto, demissão 07/10, no extrato          → dentro
     888  direto, demissão 31/10 (último dia), fora   → fora
     1594 indireto, demissão 01/10                    → não conta (só diretos)
     1600 direto, demissão 01/11                      → não é de outubro
     1021 direto, ativo                               → não conta
   SET/26: 1595 e 1567 diretos desligados, fora do extrato → 0 dentro, 2 fora.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

function aba(v) {
  const larg = () => v.reduce((m, l) => Math.max(m, l.length), 0);
  const garante = (r, c) => { while (v.length < r) v.push([]); while (v[r - 1].length < c) v[r - 1].push(''); };
  return {
    v,
    getDataRange: () => ({ getValues: () => { const w = larg(); return v.map(l => { const o = l.slice(); while (o.length < w) o.push(''); return o; }); } }),
    getLastRow: () => { for (let i = v.length; i > 0; i--) if (v[i - 1].some(x => String(x) !== '')) return i; return 0; },
    clearContents() { v.length = 0; },
    setFrozenRows() {}, setColumnWidth() {},
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const g = {
        setValue(x) { garante(r, c); v[r - 1][c - 1] = x; return g; },
        setValues(a) { a.forEach((l, i) => l.forEach((x, j) => { garante(r + i, c + j); v[r + i - 1][c + j - 1] = x; })); return g; },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (v[r + i - 1]) v[r + i - 1][c + j - 1] = ''; return g; },
        setFontWeight() { return g; }
      };
      return g;
    }
  };
}

function carregar(dados) {
  const abas = {};
  Object.keys(dados).forEach(n => { abas[n] = aba(dados[n]); });
  const ss = { getSheetByName: n => abas[n] || null, insertSheet: n => (abas[n] = aba(dados[n] = [])) };
  const avisos = [];
  const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ alert(m) { avisos.push(m); } }) }, Logger: { log() {} } };
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'PontoRH.gs'), 'utf8');
  const PR = new Function(...Object.keys(env), src + '\nreturn { prDesligadosDoMes, prApurarDesligados, prLerFuncionarios, apurarDesligadosNoPonto };')(...Object.values(env));
  return { PR, ss, dados, avisos };
}

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function carregarDashUtils() {
  const ini = HTML.indexOf('window.DashUtils = (function()');
  const fim = HTML.indexOf('function sortD(d){', ini);
  if (ini < 0 || fim < 0) throw new Error('DashUtils não encontrado no index.html');
  const escopo = { window: {} };
  new Function('window', HTML.slice(ini, fim)).call(escopo, escopo.window);
  return escopo.window.DashUtils;
}

let falhas = 0, total = 0;
function afirma(nome, cond) { total++; if (!cond) falhas++; console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`); }
function igual(nome, obtido, esperado) {
  total++; const bom = JSON.stringify(obtido) === JSON.stringify(esperado); if (!bom) falhas++;
  console.log(`  ${bom ? 'ok  ' : 'FALHA'} ${nome}${bom ? '' : `  obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
const sec = t => console.log('\n' + t);

const FUNC = () => [
  ['codigo', 'nome', 'setor', 'direto', 'admissao', 'demissao', 'observacao'],
  ['1021', 'ADEMIR', '1-USINAGEM', 'S', '30/10/2014', '', ''],
  ['1532', 'LUCIANA', '16-COLAGEM DE BORDA', 'S', '01/12/2025', '26/10/2026', 'inativo na DP'],
  ['1593', 'NATALIA', '2-EMBALAGEM', 'S', '24/08/2026', '07/10/2026', 'inativo na DP'],
  ['888', 'RODOLFO', '7-LINHA DE PINTURA', 'S', '25/06/2012', '31/10/2026', 'inativo na DP'],
  ['1594', 'VITOR', '4-EXPEDIÇÃO', 'N', '24/8/2026', '01/10/2026', 'inativo na DP'],
  ['1600', 'FULANA', '3-ACABAMENTO', 'S', '13/10/2026', '01/11/2026', 'inativo na DP'],
  ['1595', 'EDMAR', '16-COLAGEM DE BORDA', 'S', '1/9/2026', '15/09/2026', 'inativo na DP'],
  ['1567', 'GISLEIDE', '3-ACABAMENTO', 'S', '4/5/2026', '01/09/2026', 'inativo na DP']];
/* cod | mes | ano | carga | faltas | atrasos | normais | jornada */
const PONTO = () => [
  ['cod', 'mes', 'ano', 'carga', 'faltas', 'atrasos', 'normais', 'jornada'],
  ['1021', 'OUT', 2026, 176, 0, 0, 176, 176],
  ['1532', 'OUT', 2026, 140.8, 52.8, 4.8, 83.2, 140.8],
  ['1593', 'OUT', 2026, 35.2, 35.2, 0, 0, 35.2],
  ['1600', 'OUT', 2026, 132, 0, 0, 132, 132],
  ['1021', 'SET', 2026, 184.8, 0, 0, 184.8, 184.8]];
const HIST = () => [
  ['mes', 'ano', 'colaboradores', 'horasNormais'],
  ['JAN', 2025, 83, 12375],
  ['SET', 2026, 93, 15188.43],
  ['OUT', 2026, 96, 14758],
  ['NOV', 2026, 0, 0]];

sec('prDesligadosDoMes: só diretos, demissão dentro do mês');
{
  const { PR, ss } = carregar({ FUNCIONARIOS: FUNC() });
  const func = PR.prLerFuncionarios(ss);
  const out = PR.prDesligadosDoMes(['1021', '1532', '1593', '1600'], func, 'OUT', 2026);
  igual('OUT/26: 1532 e 1593 dentro', out.noPonto, 2);
  igual('OUT/26: 888 (demissão no último dia) fora', out.fora, 1);
  igual('lista de fora com código e nome', out.foraLista, ['888 RODOLFO']);
  const set = PR.prDesligadosDoMes(['1021'], func, 'SET', 2026);
  igual('SET/26: 0 dentro, 2 fora (1595 e 1567)', [set.noPonto, set.fora], [0, 2]);
  const nov = PR.prDesligadosDoMes([], func, 'NOV', 2026);
  igual('NOV/26: 1600 (demissão 01/11) fora; 1532 não é de novembro', [nov.noPonto, nov.fora], [0, 1]);
  igual('mês inválido não conta nada', PR.prDesligadosDoMes(['1021'], func, 'XXX', 2026).fora, 0);
}

sec('prApurarDesligados: grava na HISTORICO só os meses da PONTO_PESSOA');
{
  const { PR, ss, dados } = carregar({ FUNCIONARIOS: FUNC(), PONTO_PESSOA: PONTO(), HISTORICO: HIST() });
  const lista = PR.prApurarDesligados(ss);
  igual('dois meses contados, em ordem', lista.map(d => d.mes + '/' + d.ano), ['SET/2026', 'OUT/2026']);
  const h = dados.HISTORICO, cab = h[0];
  const cNo = cab.indexOf('desligadosPonto'), cFora = cab.indexOf('desligadosForaPonto');
  afirma('colunas criadas no fim do cabeçalho', cNo === 4 && cFora === 5);
  const linha = m => h.find(l => l[0] === m[0] && l[1] === m[1]);
  igual('OUT/26: 2 dentro, 1 fora', [linha(['OUT', 2026])[cNo], linha(['OUT', 2026])[cFora]], [2, 1]);
  igual('SET/26: 0 dentro, 2 fora', [linha(['SET', 2026])[cNo], linha(['SET', 2026])[cFora]], [0, 2]);
  igual('NOV/26 (sem PONTO_PESSOA) fica em branco', [linha(['NOV', 2026])[cNo], linha(['NOV', 2026])[cFora]], ['', '']);
  igual('JAN/25 (sem PONTO_PESSOA) fica em branco', [linha(['JAN', 2025])[cNo], linha(['JAN', 2025])[cFora]], ['', '']);
  igual('as outras colunas não mudam', linha(['OUT', 2026]).slice(0, 4), ['OUT', 2026, 96, 14758]);
  const antes = JSON.stringify(h);
  PR.prApurarDesligados(ss);
  afirma('rodar de novo não muda nada nem cria coluna', JSON.stringify(h) === antes);
}

sec('prApurarDesligados: valor de mês fora da PONTO_PESSOA é preservado');
{
  const hist = HIST(); hist[0].push('desligadosPonto', 'desligadosForaPonto');
  hist.forEach((l, i) => { if (i > 0) l.push(i === 1 ? 7 : '', i === 1 ? 3 : ''); });   /* JAN/25 com valor digitado antes */
  const { PR, ss, dados } = carregar({ FUNCIONARIOS: FUNC(), PONTO_PESSOA: PONTO(), HISTORICO: hist });
  PR.prApurarDesligados(ss);
  const jan = dados.HISTORICO.find(l => l[0] === 'JAN' && l[1] === 2025);
  igual('JAN/25 continua 7 e 3', [jan[4], jan[5]], [7, 3]);
  afirma('não criou coluna repetida', dados.HISTORICO[0].length === 6);
}

sec('apurarDesligadosNoPonto: aviso com base mista e os nomes de quem ficou fora');
{
  const { PR, avisos } = carregar({ FUNCIONARIOS: FUNC(), PONTO_PESSOA: PONTO(), HISTORICO: HIST() });
  PR.apurarDesligadosNoPonto();
  const m = avisos[0] || '';
  afirma('lista os meses', /SET\/2026: 0 no extrato, 2 fora/.test(m) && /OUT\/2026: 2 no extrato, 1 fora/.test(m));
  afirma('nomes de quem ficou fora', /1595 EDMAR/.test(m) && /888 RODOLFO/.test(m));
  afirma('mês com desligado dentro e fora não é "com": sem base mista', !/BASE MISTA/.test(m));
  /* com o 888 no extrato, OUT fica com todos os desligados dentro */
  const ponto = PONTO(); ponto.push(['888', 'OUT', 2026, 176, 0, 0, 176, 176]);
  const b = carregar({ FUNCIONARIOS: FUNC(), PONTO_PESSOA: ponto, HISTORICO: HIST() });
  b.PR.apurarDesligadosNoPonto();
  afirma('base mista: OUT com, SET sem', /BASE MISTA: OUT\/26 com os desligados, SET\/26 sem/.test(b.avisos[0] || ''));
}

sec('sem PONTO_PESSOA ou sem FUNCIONARIOS: não grava nada');
{
  const { PR, ss, dados } = carregar({ FUNCIONARIOS: FUNC(), HISTORICO: HIST() });
  igual('sem PONTO_PESSOA devolve lista vazia', PR.prApurarDesligados(ss), []);
  afirma('HISTORICO intacta', dados.HISTORICO[0].length === 4);
}

const U = carregarDashUtils();
const reg = (mes, pontos, colaboradores, dIn, dFo) =>
  ({ mes, ano: 2026, pontos, colaboradores, colaboradoresTotal: colaboradores + 50, producaoReal: 30000, desligadosPonto: dIn, desligadosForaPonto: dFo });

sec('pontosColab: base dos desligados por mês');
{
  const P = U.pontosColab([reg('SET', 8450122, 93, 0, 5), reg('OUT', 8325548, 96, 5, 0)]);
  igual('soma dentro e fora', [P.deslIncl, P.deslFora], [5, 5]);
  igual('OUT com, SET sem', [P.comDesl, P.semDesl], [['OUT'], ['SET']]);
  const Q = U.pontosColab([reg('OUT', 8325548, 96, 5, 0)]);
  igual('um mês com os desligados', [Q.deslIncl, Q.deslFora, Q.comDesl, Q.semDesl], [5, 0, ['OUT'], []]);
  const R = U.pontosColab([{ mes: 'JAN', ano: 2025, pontos: 1, colaboradores: 80, producaoReal: 1 }]);
  igual('mês sem a contagem não entra em nenhum', [R.deslIncl, R.deslFora, R.comDesl, R.semDesl], [0, 0, [], []]);
  const S = U.pontosColab([reg('AGO', 1, 93, 0, 0)]);
  igual('mês sem desligado não entra em nenhum', [S.comDesl, S.semDesl], [[], []]);
  const T = U.pontosColab([reg('OUT', 0, 96, 5, 0)]);
  igual('mês sem pontos não conta desligados', [T.deslIncl, T.comDesl], [0, []]);
}

sec('integridade: uma nota com os meses sem os desligados');
{
  const base = { horasNormais: 14000, horasCarga: 14500, totalExtras: 0, totalFaltaAtraso: 0 };
  const regs = [Object.assign({}, base, reg('SET', 1, 93, 0, 5)), Object.assign({}, base, reg('OUT', 1, 96, 5, 0))];
  const I = U.integridade(regs, {});
  const n = I.itens.filter(i => i.tipo === 'desligados');
  afirma('uma nota só', n.length === 1);
  afirma('é nota, não atenção', n[0] && n[0].nivel === 'info');
  afirma('cita SET/26 com 5 e a base mista com OUT/26', n[0] && /SET\/26 \(5\)/.test(n[0].msg) && /Base mista: OUT\/26/.test(n[0].msg));
  igual('encontrado = diretos fora, esperado 0', n[0] && [n[0].encontrado, n[0].esperado], [5, 0]);
  const J = U.integridade([Object.assign({}, base, reg('OUT', 1, 96, 5, 0))], {});
  afirma('todos os meses com os desligados: sem nota', !J.itens.some(i => i.tipo === 'desligados'));
  const K = U.integridade([Object.assign({}, base, { mes: 'JAN', ano: 2025, producaoReal: 1 })], {});
  afirma('sem a contagem: sem nota', !K.itens.some(i => i.tipo === 'desligados'));
}

console.log(`\n${total - falhas}/${total} ok`);
if (falhas) { console.log(`${falhas} FALHA(S)`); process.exit(1); }
