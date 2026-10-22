/* ══════════════════════════════════════════════════════════════════════════
   Teste do Quadro por setor — lerQuadroSetor (Code.gs) e QuadroSetor.resumo
   (index.html), seção da aba Pessoas

   Rode com:  node testes/quadro-setor.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   A seção responde "onde o quadro cresceu". Três erros parecem número bom:
     • contar a pessoa pelo mês da admissão só, sem a demissão (o quadro só
       sobe);
     • deixar nome ou código sair da planilha para o navegador;
     • comparar com o mês corrente, que ainda está mudando.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

let falhas = 0, total = 0;
function afirma(nome, cond) { total++; if (!cond) falhas++; console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`); }
const sec = t => console.log('\n' + t);

/* ── Code.gs: lerQuadroSetor ── */
function abaFunc(v) {
  return { getLastRow: () => v.length, getDataRange: () => ({ getValues: () => v.map(l => l.slice()) }) };
}
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const carregarGs = (abas) => {
  const ss = { getSheetByName: n => abas[n] || null };
  const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Logger: { log() {} }, ContentService: {}, MailApp: {}, Session: {}, Utilities: {} };
  return { ss, G: new Function(...Object.keys(env), src + '\nreturn { lerQuadroSetor };')(...Object.values(env)) };
};

sec('lerQuadroSetor (Code.gs): FUNCIONARIOS contada por setor e mês, sem nomes');
{
  const CAB = ['codigo', 'nome', 'setor', 'direto', 'admissao', 'demissao', 'observacao'];
  const v = [CAB,
    ['1', 'PESSOA A', '2-EMBALAGEM', 'S', new Date(2025, 0, 10), '', ''],
    ['2', 'PESSOA B', '2-EMBALAGEM', 'S', '15/03/2025', '10/06/2025', 'inativo na DP'],
    ['3', 'PESSOA C', '31-TRANSPORTE', 'N', '2026-02-01', '', ''],
    ['4', 'PESSOA D', '99-VELHO', 'N', '01/01/2010', '31/12/2024', 'inativo na DP'],
    ['5', 'PESSOA E', '', 'S', '01/01/2025', '', '']];
  const { ss, G } = carregarGs({ FUNCIONARIOS: abaFunc(v) });
  const out = G.lerQuadroSetor(ss);
  const de = (ano, mes, setor) => out.find(r => r.ano === ano && r.mes === mes && r.setor === setor);
  afirma('JAN/25: embalagem com 1 (A), admitido 1', de(2025, 'JAN', '2-EMBALAGEM').pessoas === 1 && de(2025, 'JAN', '2-EMBALAGEM').admitidos === 1);
  afirma('MAR/25: embalagem com 2, B admitido no mês', de(2025, 'MAR', '2-EMBALAGEM').pessoas === 2 && de(2025, 'MAR', '2-EMBALAGEM').admitidos === 1);
  afirma('JUN/25: B ainda conta no mês em que saiu, desligado 1', de(2025, 'JUN', '2-EMBALAGEM').pessoas === 2 && de(2025, 'JUN', '2-EMBALAGEM').desligados === 1);
  afirma('JUL/25: só A', de(2025, 'JUL', '2-EMBALAGEM').pessoas === 1);
  afirma('data em texto aaaa-mm-dd: transporte entra em FEV/26, não em JAN/26', de(2026, 'FEV', '31-TRANSPORTE').pessoas === 1 && de(2026, 'JAN', '31-TRANSPORTE').pessoas === 0);
  afirma('direto vem do S/N da FUNCIONARIOS', de(2025, 'JAN', '2-EMBALAGEM').direto === 'S' && de(2026, 'FEV', '31-TRANSPORTE').direto === 'N');
  afirma('setor sem ninguém desde JAN/25 não sai', !out.some(r => r.setor === '99-VELHO'));
  afirma('linha sem setor fica fora', !out.some(r => r.setor === ''));
  afirma('nenhum nome ou código sai da planilha', out.every(r => !('nome' in r) && !('codigo' in r) && !JSON.stringify(r).includes('PESSOA')));
  const hoje = new Date();
  afirma('vai até o mês corrente', out.some(r => r.ano === hoje.getFullYear() && r.mes === ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][hoje.getMonth()]));
  const sem = carregarGs({ FUNCIONARIOS: abaFunc([['codigo', 'nome'], ['1', 'X']]) });
  afirma('sem as colunas setor e admissao: lista vazia', sem.G.lerQuadroSetor(sem.ss).length === 0);
  const nada = carregarGs({});
  afirma('sem a aba: lista vazia', nada.G.lerQuadroSetor(nada.ss).length === 0);
}

/* ── index.html: QuadroSetor ── */
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function carregarQS() {
  const ini = HTML.indexOf('window.QuadroSetor = (function(){');
  const fim = HTML.indexOf('})();', ini) + 5;
  if (ini < 0) throw new Error('QuadroSetor não encontrado no index.html');
  const win = {};
  new Function('window', 'localStorage', HTML.slice(ini, fim))(win, { getItem: () => null });
  return win.QuadroSetor;
}
const Q = carregarQS();
const MES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const L = (ano, m, setor, direto, pessoas, admitidos = 0, desligados = 0) => ({ ano, mes: MES[m - 1], setor, direto, pessoas, admitidos, desligados });

sec('QuadroSetor.resumo: mês contra o mesmo mês do ano anterior');
{
  const linhas = [];
  for (let a = 2025; a <= 2026; a++) for (let m = 1; m <= 12; m++) {
    if (a === 2026 && m > 10) break;
    const depois = a * 100 + m >= 202603;
    linhas.push(L(a, m, '2-EMBALAGEM', 'S', depois ? 27 : 23, m === 3 && a === 2026 ? 5 : 1, m === 3 && a === 2026 ? 1 : 1));
    linhas.push(L(a, m, '29-CORTE', 'S', depois ? 5 : 8, 0, m === 3 && a === 2026 ? 3 : 0));
    linhas.push(L(a, m, '4-EXPEDIÇÃO', 'N', depois ? 11 : 9));
    linhas.push(L(a, m, '22-PPCP', 'N', 3));
  }
  const R = Q.resumo(linhas, { hoje: new Date(2026, 9, 22) });
  afirma('mês corrente (OUT/26) fica fora: último mês é SET/26', Q.rot(R.mes) === 'SET/26' && !R.meses.includes(202610));
  afirma('base SET/25, janela OUT/25 a SET/26', Q.rot(R.base) === 'SET/25' && Q.rot(R.janela.de) === 'OUT/25' && Q.rot(R.janela.ate) === 'SET/26');
  afirma('quadro 46 contra 43 (+3)', R.total.agora === 46 && R.total.antes === 43 && R.total.delta === 3);
  afirma('diretos 32 contra 31, indiretos 14 contra 12', R.total.diretos === 32 && R.total.diretosAntes === 31 && R.total.indiretos === 14 && R.total.indiretosAntes === 12);
  const emb = R.setores.find(x => x.setor === 'Embalagem');
  afirma('Embalagem +4 (23 → 27), admitidos na janela 16 (11 × 1 + 5)', emb.delta === 4 && emb.antes === 23 && emb.agora === 27 && emb.admitidos === 16);
  const corte = R.setores.find(x => x.setor === 'Corte');
  afirma('Corte −3 com 3 desligados', corte.delta === -3 && corte.desligados === 3);
  afirma('nome do setor sem o número; PPCP em maiúsculas', R.setores.some(x => x.setor === 'PPCP') && R.setores.some(x => x.setor === 'Expedição'));
  afirma('validos só os meses com o mesmo mês do ano anterior (JAN a SET/26)', R.validos.length === 9 && R.validos[0] === 202601);
  const J = Q.resumo(linhas, { hoje: new Date(2026, 9, 22), mes: 202602 });
  afirma('mês escolhido: FEV/26 contra FEV/25', Q.rot(J.mes) === 'FEV/26' && Q.rot(J.base) === 'FEV/25' && J.total.delta === 0);
  const X = Q.resumo(linhas, { hoje: new Date(2026, 9, 22), mes: 202510 });
  afirma('mês sem base cai no último válido', Q.rot(X.mes) === 'SET/26');
  afirma('mapa: diretos primeiro', R.mapa[0].tipo === 'Direto' && R.mapa[R.mapa.length - 1].tipo === 'Indireto');
  const celula = R.mapa.find(x => x.setor === 'Embalagem').meses.find(c => c.k === 202603);
  afirma('mapa marca a mudança do mês (MAR/26 +4)', celula.mudou === 4);
}

sec('QuadroSetor.resumo: mês a mês dentro da comparação');
{
  const linhas = [];
  const emb = [21, 22, 20, 22, 25, 24, 25, 25, 23, 24, 21, 21, 21, 21, 21, 21, 23, 23, 25, 26, 27, 28];
  const cor = [7, 8, 9, 9, 8, 8, 8, 8, 8, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5];
  emb.forEach((v, i) => {
    const a = 2025 + Math.floor(i / 12), m = i % 12 + 1;
    linhas.push(L(a, m, '2-EMBALAGEM', 'S', v));
    linhas.push(L(a, m, '29-CORTE', 'S', cor[i]));
    linhas.push(L(a, m, '22-PPCP', 'N', 3));
  });
  const R = Q.resumo(linhas, { hoje: new Date(2026, 9, 22) });
  const P = R.passos;
  afirma('12 meses de OUT/25 a SET/26', P.meses.length === 12 && Q.rot(P.meses[0]) === 'OUT/25' && Q.rot(P.meses[11]) === 'SET/26');
  const e = P.linhas.find(x => x.setor === 'Embalagem');
  afirma('Embalagem mês a mês: OUT/25 +1, NOV/25 −3, MAI/26 +2', e.deltas[0] === 1 && e.deltas[1] === -3 && e.deltas[7] === 2);
  afirma('a linha soma a variação do setor (23 → 27 = +4)', e.deltas.reduce((t, d) => t + d, 0) === e.total && e.total === 4);
  afirma('todas as linhas somam o próprio total', P.linhas.every(x => x.deltas.reduce((t, d) => t + d, 0) === x.total));
  afirma('cada mês do quadro é a soma dos setores', P.totais.every((t, i) => t === P.linhas.reduce((s, x) => s + x.deltas[i], 0)));
  afirma('os meses somam a variação do quadro', P.totais.reduce((t, d) => t + d, 0) === R.total.delta);
  afirma('setor sem mudança (PPCP) fica fora; maior alta primeiro', !P.linhas.some(x => x.setor === 'PPCP') && P.linhas[0].setor === 'Embalagem');
  const D = Q.resumo(linhas, { hoje: new Date(2026, 9, 22), cmp: 'dez' });
  afirma('contra DEZ/25: JAN a SET/26', D.passos.meses.length === 9 && Q.rot(D.passos.meses[0]) === 'JAN/26');
}

sec('QuadroSetor.resumo: contra dezembro do ano anterior');
{
  const linhas = [L(2025, 12, '1-USINAGEM', 'S', 17), L(2026, 1, '1-USINAGEM', 'S', 17, 2, 2), L(2026, 9, '1-USINAGEM', 'S', 19, 1, 0)];
  const D = Q.resumo(linhas, { hoje: new Date(2026, 9, 22), cmp: 'dez' });
  afirma('SET/26 contra DEZ/25: +2', Q.rot(D.base) === 'DEZ/25' && D.total.delta === 2);
  afirma('janela JAN a SET/26: 3 admitidos, 2 desligados', Q.rot(D.janela.de) === 'JAN/26' && D.total.admitidos === 3 && D.total.desligados === 2);
  afirma('sem dados: null (a seção diz o que falta)', Q.resumo([], {}) === null);
}

sec('Painel: leitura do Web App e atalho da Reunião');
{
  afirma('as duas leituras da planilha guardam quadroSetor', (HTML.match(/json\.quadroSetor\) \{ try \{ localStorage\.setItem\(QuadroSetor\.SK/g) || []).length === 2);
  afirma('Code.gs manda quadroSetor no doGet', /quadroSetor: lerQuadroSetor\(ss\)/.test(src));
  afirma('aba Pessoas tem a seção', HTML.includes('id="ps-quadro"'));
  afirma('seção tem o botão Relatório', HTML.includes('id="qs-imp"') && HTML.includes('function imprimirQuadroSetor()'));
  afirma('relatório em A4 deitado com a régua de impressão do painel', /function imprimirQuadroSetor\(\)[\s\S]*?size:A4 landscape[\s\S]*?printBase\(\)/.test(HTML));
  const pl = new Function(HTML.match(/function _qsPl\([^)]*\)\{[^\n]*\}/)[0] + '\nreturn _qsPl;')();
  afirma('balão no singular com 1 ("1 desligado") e no plural com 2', pl(1, 'desligado', 'desligados') === '1 desligado' && pl(2, 'admitido', 'admitidos') === '2 admitidos');
  afirma('Reunião tem o atalho para a seção, fora da impressão', /class="reu-noprint" onclick="reuIrQuadro\(/.test(HTML) && HTML.includes('window.reuIrQuadro=function'));
}

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
