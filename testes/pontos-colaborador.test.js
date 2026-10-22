/* ══════════════════════════════════════════════════════════════════════════
   Teste dos pontos por colaborador — DashUtils.pontosColab (index.html),
   sync do painel, gravarHistorico (Code.gs) e colaboradoresTotal (PontoRH.gs)

   Rode com:  node testes/pontos-colaborador.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   A Reunião mostra pontos ÷ diretos e pontos ÷ quadro total. Três erros não
   aparecem como defeito, só como número plausível:
     • média das razões mês a mês em vez de Σ pontos ÷ Σ colaboradores — um
       mês de quadro pequeno pesa igual a um de quadro grande;
     • mês fechado sem pontos lançados entrando como 0 e puxando a média;
     • o painel reenviando a lista inteira para a HISTORICO: uma cópia aberta
       antes de o PPCP digitar os pontos gravaria 0 por cima.
   Os números são os da planilha em 21/10/2026 (JAN/25 e JAN a SET/26).
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

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
function ok(nome, obtido, esperado, tol = 0.01) {
  total++; const bom = obtido !== null && Math.abs(obtido - esperado) <= tol; if (!bom) falhas++;
  console.log(`  ${bom ? 'ok  ' : 'FALHA'} ${nome.padEnd(56)} ${obtido === null ? 'null' : (+obtido).toFixed(2).padStart(10)} (esperado ${(+esperado).toFixed(2)})`);
}
const sec = t => console.log('\n' + t);

const U = carregarDashUtils();
const reg = (mes, ano, pontos, colaboradores, colaboradoresTotal, producaoReal = 30000) =>
  ({ mes, ano, pontos, colaboradores, colaboradoresTotal, producaoReal });

sec('pontosColab: um mês');
{
  const P = U.pontosColab([reg('JAN', 2026, 5737867, 98, 145)]);
  ok('JAN/26 por direto = 5.737.867 ÷ 98', P.porDireto, 58549.66);
  ok('JAN/26 por colaborador do quadro = 5.737.867 ÷ 145', P.porTotal, 39571.5);
  afirma('um mês em cada base', P.mesesDir === 1 && P.mesesTot === 1);
}

sec('pontosColab: período é Σ pontos ÷ Σ colaboradores, não média das razões');
{
  const P = U.pontosColab([reg('JAN', 2026, 5737867, 98, 145), reg('FEV', 2026, 7398538, 99, 149)]);
  ok('JAN+FEV/26 por direto = 13.136.405 ÷ 197', P.porDireto, 13136405 / 197);
  ok('JAN+FEV/26 por quadro = 13.136.405 ÷ 294', P.porTotal, 13136405 / 294);
  const media = (5737867 / 98 + 7398538 / 99) / 2;
  afirma('e não a média das razões', Math.abs(P.porDireto - media) > 1);
}

sec('pontosColab: mês fechado sem pontos fica fora e é avisado');
{
  const P = U.pontosColab([reg('AGO', 2026, 8156190, 93, 148), reg('SET', 2026, 0, 93, 147)]);
  ok('só AGO entra (8.156.190 ÷ 93)', P.porDireto, 8156190 / 93);
  afirma('SET em semPontos', P.semPontos.length === 1 && P.semPontos[0] === 'SET');
  const vazio = U.pontosColab([reg('SET', 2026, 0, 93, 147)]);
  afirma('sem pontos nenhum → null, nunca 0', vazio.porDireto === null && vazio.porTotal === null);
  const aberto = U.pontosColab([reg('OUT', 2026, 0, 0, 0, 0)]);
  afirma('mês ainda aberto (sem produção) não é cobrado como sem pontos', aberto.semPontos.length === 0);
}

sec('pontosColab: cada base com os seus meses (2025 sem quadro total)');
{
  const P = U.pontosColab([reg('JAN', 2025, 5775743, 83, 0), reg('JAN', 2026, 5737867, 98, 145)]);
  ok('diretos: os dois meses', P.porDireto, (5775743 + 5737867) / (83 + 98));
  ok('quadro: só JAN/26, com os pontos de JAN/26', P.porTotal, 5737867 / 145);
  afirma('mesesDir 2, mesesTot 1', P.mesesDir === 2 && P.mesesTot === 1);
  ok('JAN/25 sozinho por direto (5.775.743 ÷ 83)', U.pontosColab([reg('JAN', 2025, 5775743, 83, 0)]).porDireto, 69587.27);
}

sec('pontosColab: por hora trabalhada (normais + extras dos diretos)');
{
  /* SET/26 × SET/25, planilha em 21/10/2026: o por colaborador dá +4,3% e o
     por hora +13,7% — 21 dias contra 22 e 1.130 h extras contra 1.865. */
  const set26 = Object.assign(reg('SET', 2026, 8450122, 93, 147), { horasNormais: 15188.43, totalExtras: 1129.6 });
  const set25 = Object.assign(reg('SET', 2025, 8538678, 98, 0),   { horasNormais: 16876,    totalExtras: 1865 });
  const A = U.pontosColab([set26]), B = U.pontosColab([set25]);
  ok('SET/26 por hora = 8.450.122 ÷ 16.318,03', A.porHora, 8450122 / 16318.03);
  ok('SET/25 por hora = 8.538.678 ÷ 18.741', B.porHora, 8538678 / 18741);
  ok('por colaborador: +4,3%', (A.porDireto / B.porDireto - 1) * 100, 4.29, 0.05);
  ok('por hora: +13,7%', (A.porHora / B.porHora - 1) * 100, 13.66, 0.05);
  const P = U.pontosColab([set26, Object.assign(reg('AGO', 2026, 8156190, 93, 148), { horasNormais: 14514.82, totalExtras: 1193.2 })]);
  ok('período: Σ pontos ÷ Σ horas', P.porHora, (8450122 + 8156190) / (16318.03 + 15708.02));
  const semHoras = U.pontosColab([reg('SET', 2026, 8450122, 93, 147)]);
  afirma('mês com pontos e sem horas: por hora fica null, por colaborador continua', semHoras.porHora === null && semHoras.porDireto !== null);
}

sec('pontosColab: fora do ponto (na folha, não batem ponto) soma ao quadro do ponto');
{
  /* SET/26 em 22/10/2026: 147 no extrato do ponto, 187 ativos na
     FUNCIONARIOS (motoristas, cargos de confiança, SENAI, comercial externo
     e outros fora do extrato) → 40 fora do ponto. */
  const comFora = Object.assign(reg('SET', 2026, 8450122, 93, 147), { foraDoPonto: 40 });
  const P = U.pontosColab([comFora]);
  ok('SET/26 por quadro = 8.450.122 ÷ (147 + 40)', P.porTotal, 8450122 / 187);
  afirma('do ponto 147, fora do ponto 40, quadro 187', P.colabPonto === 147 && P.foraPonto === 40 && P.colabTot === 187);
  afirma('nenhum mês sem fora do ponto', P.semForaPonto.length === 0);
  ok('por direto não muda (8.450.122 ÷ 93)', P.porDireto, 8450122 / 93);
  const sem = U.pontosColab([reg('SET', 2026, 8450122, 93, 147)]);
  ok('sem fora do ponto: só o ponto (÷ 147)', sem.porTotal, 8450122 / 147);
  afirma('e o mês é avisado', sem.semForaPonto.length === 1 && sem.semForaPonto[0] === 'SET');
  const so2025 = U.pontosColab([Object.assign(reg('SET', 2025, 8538678, 98, 0), { foraDoPonto: 40 })]);
  afirma('fora do ponto sem o total do ponto não vira quadro (2025)', so2025.porTotal === null && so2025.mesesTot === 0 && so2025.semForaPonto.length === 0);
  const per = U.pontosColab([reg('AGO', 2026, 8156190, 93, 148), comFora]);
  ok('período: Σ pontos ÷ Σ (ponto + fora do ponto)', per.porTotal, (8156190 + 8450122) / (148 + 187));
  afirma('AGO sem fora do ponto fica avisado', per.semForaPonto.length === 1 && per.semForaPonto[0] === 'AGO');
}

sec('Sync do painel: pontos e colaboradoresTotal não saem');
{
  const ini = HTML.indexOf("var _SO_PLANILHA");
  const fim = HTML.indexOf('function _syncStatus(', ini);
  afirma('trecho do sync encontrado', ini > 0 && fim > ini);
  const enviados = [];
  const fakeFetch = (url, o) => { enviados.push(JSON.parse(o.body)); return Promise.resolve(); };
  const sync = new Function('SHEETS_WEBAPP_URL', 'SHEETS_SECRET', 'fetch', '_syncStatus', HTML.slice(ini, fim) + '\nreturn _syncSheetsAgora;')
    ('https://exemplo', 's', fakeFetch, () => {});
  const r = { mes: 'AGO', ano: 2026, colaboradores: 93, horasNormais: 15000, pontos: 0, colaboradoresTotal: 0, integridadeCiente: 'x' };
  sync([r]);
  const d = enviados[0].dados[0];
  afirma('pontos fora do envio', !('pontos' in d));
  afirma('colaboradoresTotal fora do envio', !('colaboradoresTotal' in d));
  afirma('integridadeCiente continua fora do envio em massa', !('integridadeCiente' in d));
  afirma('o resto vai (colaboradores, horasNormais)', d.colaboradores === 93 && d.horasNormais === 15000);
  sync([Object.assign({}, r, { foraDoPonto: 40 })]);
  afirma('foraDoPonto vai (digitado no painel)', enviados[1].dados[0].foraDoPonto === 40);
  enviados.splice(1, 1);
  sync([r], true);
  const d2 = enviados[1].dados[0];
  afirma('envio do Ciente leva o ciente, mas não os pontos', d2.integridadeCiente === 'x' && !('pontos' in d2));
  afirma('o registro local não é alterado', r.pontos === 0 && r.integridadeCiente === 'x');
}

/* ── planilha em memória: o que Code.gs e PontoRH.gs usam ──
   grade: nº de colunas da aba. Com grade, escrever além dela dá o erro do
   Apps Script (a HISTORICO real acabava em AO); sem grade, a aba cresce. */
function aba(v, grade) {
  const garante = (r, c) => { while (v.length < r) v.push([]); while (v[r - 1].length < c) v[r - 1].push(''); };
  let max = grade || Infinity;
  const fora = c => { if (c > max) throw new Error('The coordinates of the range are outside the dimensions of the sheet.'); };
  return {
    getMaxColumns: () => (max === Infinity ? v.reduce((m, l) => Math.max(m, l.length), 0) : max),
    insertColumnsAfter(depois, n) { max += n; },
    getDataRange: () => ({ getValues: () => { const w = v.reduce((m, l) => Math.max(m, l.length), 0); return v.map(l => { const o = l.slice(); while (o.length < w) o.push(''); return o; }); } }),
    getLastRow: () => { for (let i = v.length; i > 0; i--) if (v[i - 1].some(x => String(x) !== '')) return i; return 0; },
    getRange(r, c) {
      const g = {
        setValue(x) { fora(c); garante(r, c); v[r - 1][c - 1] = x; return g; },
        setValues(a) { fora(c + ((a[0] || []).length || 1) - 1); a.forEach((l, i) => l.forEach((x, j) => { garante(r + i, c + j); v[r + i - 1][c + j - 1] = x; })); return g; },
        setNumberFormat() { return g; }
      };
      return g;
    }
  };
}
function planilha(dados, grades) {
  const abas = {}; Object.keys(dados).forEach(n => { abas[n] = aba(dados[n], (grades || {})[n]); });
  return { getSheetByName: n => abas[n] || null, insertSheet: n => (abas[n] = aba(dados[n] = [])) };
}

sec('gravarHistorico (Code.gs): o painel não grava pontos nem colaboradoresTotal');
{
  const CAB = ['mes', 'ano', 'colaboradores', 'horasNormais', 'pontos', 'colaboradoresTotal'];
  const dados = { HISTORICO: [CAB.slice(), ['AGO', 2026, 93, 15000, 8156190, 148]] };
  const ss = planilha(dados);
  const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Logger: { log() {} }, ContentService: {}, MailApp: {}, Session: {}, Utilities: {} };
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  const G = new Function(...Object.keys(env), src + '\nreturn { gravarHistorico, lerHistorico };')(...Object.values(env));
  /* cópia velha do painel: tem os campos com 0 (CAMPOS_NUM) e manda tudo */
  G.gravarHistorico(ss, [{ mes: 'AGO', ano: 2026, colaboradores: 93, horasNormais: 15000, pontos: 0, colaboradoresTotal: 0 }]);
  afirma('pontos digitados continuam (8.156.190)', dados.HISTORICO[1][4] === 8156190);
  afirma('colaboradoresTotal continua (148)', dados.HISTORICO[1][5] === 148);
  const lido = G.lerHistorico(ss)[0];
  afirma('lerHistorico devolve os dois como número', lido.pontos === 8156190 && lido.colaboradoresTotal === 148);
}

sec('gravarHistorico (Code.gs): coluna foraDoPonto criada na primeira gravação com valor');
{
  const CAB = ['mes', 'ano', 'colaboradores', 'horasNormais', 'pontos', 'colaboradoresTotal', 'integridadeCiente'];
  const dados = { HISTORICO: [CAB.slice(), ['AGO', 2026, 93, 15000, 8156190, 148, ''], ['SET', 2026, 93, 15188, 8450122, 147, '']] };
  /* grade cheia, como a HISTORICO real em 22/10/2026 */
  const ss = planilha(dados, { HISTORICO: CAB.length });
  let estourou = false;
  try { ss.getSheetByName('HISTORICO').getRange(1, CAB.length + 1).setValue('x'); } catch (e) { estourou = true; }
  afirma('a grade da aba de teste é cheia (escrever fora dela dá erro)', estourou);
  const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Logger: { log() {} }, ContentService: {}, MailApp: {}, Session: {}, Utilities: {} };
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  const G = new Function(...Object.keys(env), src + '\nreturn { gravarHistorico, lerHistorico };')(...Object.values(env));
  G.gravarHistorico(ss, [{ mes: 'AGO', ano: 2026, colaboradores: 93, horasNormais: 15000, foraDoPonto: 0 }]);
  afirma('só zeros: coluna não é criada', dados.HISTORICO[0].indexOf('foraDoPonto') < 0);
  G.gravarHistorico(ss, [{ mes: 'AGO', ano: 2026, colaboradores: 93, horasNormais: 15000, foraDoPonto: 0 },
                         { mes: 'SET', ano: 2026, colaboradores: 93, horasNormais: 15188, foraDoPonto: 40 }]);
  const c = dados.HISTORICO[0].indexOf('foraDoPonto');
  afirma('coluna criada depois das existentes, com a grade cheia', c === CAB.length);
  afirma('SET grava 40', dados.HISTORICO[2][c] === 40);
  afirma('pontos e colaboradoresTotal intactos', dados.HISTORICO[2][4] === 8450122 && dados.HISTORICO[2][5] === 147);
  const set = G.lerHistorico(ss).filter(r => r.mes === 'SET')[0];
  afirma('lerHistorico devolve foraDoPonto como número', set.foraDoPonto === 40);
  afirma('o painel lê foraDoPonto como número (CAMPOS_NUM)', /var CAMPOS_NUM = \[[^\]]*'foraDoPonto'/.test(HTML));
}

sec('PontoRH.gs: prAgregar conta o quadro inteiro com o filtro da PONTO_SETOR');
const srcPR = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'PontoRH.gs'), 'utf8');
{
  const PR = new Function('SpreadsheetApp', 'Logger', srcPR + '\nreturn { prAgregar, prAgregarSetores };')({}, { log() {} });
  const dt = (d, m) => new Date(2026, m - 1, d);
  const pessoa = (codigo) => ({ codigo, nome: '', carga: 184.8, normais: 184.8, faltas: 0, atrasos: 0, e50: 0, e100: 0 });
  const ext = { mes: 'SET', ano: 2026, fim: dt(30, 9), pessoas: ['1', '2', '3', '4', '5', '6', '7'].map(pessoa) };
  const func = { mapa: {
    1: { direto: true, setor: 'A' }, 2: { direto: true, setor: 'A' }, 3: { direto: false, setor: 'B' },
    4: { direto: false, setor: 'B', admissao: dt(5, 10) },   /* indireto admitido depois do mês: não conta */
    5: { direto: true, setor: 'A', admissao: dt(2, 10) },    /* direto admitido depois: não conta */
    6: { direto: false, setor: 'C' } } };                     /* 7: fora da FUNCIONARIOS (pendência) */
  const a = PR.prAgregar(ext, func);
  afirma('diretos = 2', a.n === 2);
  afirma('quadro = 4 (2 diretos + 2 indiretos; admitidos depois e pendente fora)', a.nTotal === 4);
  const soma = PR.prAgregarSetores(ext, func).reduce((t, s) => t + s.n, 0);
  afirma('bate com a soma de pessoas da PONTO_SETOR', soma === a.nTotal);
  afirma('admitidosDepois continua só com diretos', a.admitidosDepois.length === 1 && /^5 /.test(a.admitidosDepois[0]));
  afirma('pendentes continuam', a.pendentes.length === 1 && /^7 /.test(a.pendentes[0]));
}

sec('PontoRH.gs: colaboradoresTotal na HISTORICO');
{
  const cab = ['mes', 'ano', 'colaboradores', 'horasCarga', 'horasNormais', 'extra50', 'extra100', 'naoTrabalhadas', 'faltasPonto', 'atrasosPonto'];
  const base = () => ({ HISTORICO: [cab.slice(), ['SET', 2026, 93, 15479, 15109, 900, 230, 1500, 100, 120]] });
  const carregar = (dados) => {
    const ss = planilha(dados);
    const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ alert() {} }) }, Logger: { log() {} } };
    return { ss, PR: new Function(...Object.keys(env), srcPR + '\nreturn { prLancarHistorico, prBrutasDoMesFechado, prLerHistoricoMes };')(...Object.values(env)) };
  };
  const a = { n: 93, nTotal: 147, carga: 15479, normais: 15109, e50: 900, e100: 230, naoTrabalhadas: 1500, faltasPonto: 100, atrasosPonto: 120 };
  const col = d => d.HISTORICO[0].indexOf('colaboradoresTotal');
  {
    const dados = base(), { ss, PR } = carregar(dados);
    PR.prLancarHistorico(ss, 'SET', 2026, a);
    afirma('coluna criada e total gravado (147)', col(dados) > 0 && dados.HISTORICO[1][col(dados)] === 147);
  }
  {
    const dados = base(), { ss, PR } = carregar(dados);
    const doLog = Object.assign({}, a); delete doLog.nTotal;   /* aceitarPontoNaHistorico: soma do log, sem total */
    PR.prLancarHistorico(ss, 'SET', 2026, doLog);
    afirma('soma do log não grava total (sem NaN, sem 0)', dados.HISTORICO[1][col(dados)] === undefined || dados.HISTORICO[1][col(dados)] === '');
  }
  {
    const dados = base(), { ss, PR } = carregar(dados);
    const r = PR.prBrutasDoMesFechado(ss, 'SET', 2026, a, PR.prLerHistoricoMes(ss, 'SET', 2026));
    afirma('mês fechado, mesmo extrato, só o total mudou: grava o total', dados.HISTORICO[1][col(dados)] === 147);
    afirma('e não anuncia mudança de não trabalhadas', r === null);
    afirma('colaboradores e horas intactos', dados.HISTORICO[1][2] === 93 && dados.HISTORICO[1][4] === 15109);
  }
  {
    const dados = base(), { ss, PR } = carregar(dados);
    PR.prBrutasDoMesFechado(ss, 'SET', 2026, Object.assign({}, a, { e50: 1000 }), PR.prLerHistoricoMes(ss, 'SET', 2026));
    afirma('extrato diferente: mês protegido, total não entra', col(dados) < 0 || !dados.HISTORICO[1][col(dados)]);
  }
}

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
