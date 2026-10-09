/* ══════════════════════════════════════════════════════════════════════════
   Teste do aceite do ponto pelo log — apps-script/PontoRH.gs

   Rode com:  node testes/ponto-log.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   Até b90.1 (17/09/26) o controle de faltas registrava as ausências na aba
   PONTO, onze colunas sob o cabeçalho de dezesseis do extrato: "diretos"
   recebia ausFalta, "carga" ausAfastado, "normais" ausAtraso. O
   aceitarPontoNaHistorico pega a última linha do mês e, com "2026", gravou
   em SET/26 colaboradores 141,53, horasCarga 70,4 e horasNormais 7,5 — e o
   mesmo em OUT, NOV e DEZ/26. O painel conta todo mês com horasCarga > 0,
   então os quatro entraram no acumulado do ano sem erro na tela.

   As linhas abaixo são as do log real de 17/09 e 09/10/26 (números, sem
   nomes). A planilha é um objeto em memória: só getDataRange, getLastRow e
   getRange().setValue, que é tudo que estas funções usam.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const CAB_LOG = ['processadoEm', 'arquivo', 'mes', 'ano', 'pessoasNoExtrato', 'diretos', 'jornadaCheia', 'carga', 'normais',
  'faltasPonto', 'atrasosPonto', 'extra50', 'extra100', 'naoTrabalhadas', 'linhaCriada', 'pendentes (fora da FUNCIONARIOS)'];
/* linha de ausência no formato antigo: 11 colunas, sim/não cai em atrasosPonto */
const aus = (mes, ano, reg, falta, atest, afast, atraso, ferias) =>
  ['2026-09-17', 'CONTROLE_FALTAS_2026.xlsx (ausências)', mes, ano, reg, falta, atest, afast, atraso, ferias, 'não'];
const ext = (arq, mes, ano, pessoas, n, jornada, carga, normais, fp, ap, e50, e100, nt) =>
  ['2026-09-18', arq, mes, ano, pessoas, n, jornada, carga, normais, fp, ap, e50, e100, nt, 'não', ''];

function planilha() {
  return {
    PONTO: [CAB_LOG,
      aus('AGO', 2026, 68, 196.75, 52.78, 61.6, 0, 211.2),
      aus('SET', 2026, 65, 141.5333333, 62.4, 70.4, 7.5, 220),
      aus('DEZ', 2026, 53, 98.45, 87.43, 70.4, 14.7833333, 132),
      aus('OUT', 2026, 80, 140, 114.4, 105.6, 2.6333333, 264),
      ext('PONTO 082026.xls', 'AGO', 2026, 150, 93, 184.8, 14907.2, 14514.8166667, 184.8, 207.58, 1182, 11.17, 2671.58),
      ext('PONTO 092026.xls', 'SET', 2026, 147, 90, 184.8, 15400, 15109.2333333, 149.6, 141.17, 1092.95, 36.22, 1522.77)],
    HISTORICO: [['mes', 'ano', 'colaboradores', 'horasCarga', 'horasNormais', 'extra50', 'extra100', 'horasTotais', 'absenteismo',
                 'naoTrabalhadas', 'faltasPonto', 'atrasosPonto'],
      ['AGO', 2026, 93, 14907.2, 14514.82, 1182, 11.17, 15708, 12.42, 2671.58, 184.8, 207.58],
      ['SET', 2026, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ['OUT', 2026, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ['DEZ', 2026, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]
  };
}

function rodar(dados, fn, resposta) {
  const abas = {};
  Object.keys(dados).forEach(function (n) {
    const v = dados[n];
    abas[n] = {
      getDataRange: () => ({ getValues: () => v.map(l => l.slice()) }),
      getLastRow: () => v.length,
      getRange: (r, c) => ({ setValue(x) { while (v[r - 1].length < c) v[r - 1].push(''); v[r - 1][c - 1] = x; } })
    };
  });
  const avisos = [];
  const env = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => abas[n] || null }),
      getUi: () => ({ alert: m => avisos.push(m), ButtonSet: {}, Button: { OK: 'OK' },
                      prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => resposta || '' }) }) },
    Logger: { log() {} }
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'PontoRH.gs'), 'utf8');
  new Function(...Object.keys(env), src + '\nreturn ' + fn + ';')(...Object.values(env))();
  return avisos.join('\n');
}

const mes = (d, m) => { const c = d.HISTORICO[0], l = d.HISTORICO.find(x => x[0] === m);
  return [l[c.indexOf('colaboradores')], l[c.indexOf('horasCarga')], l[c.indexOf('horasNormais')]].join(' / '); };

let falhas = 0, total = 0;
function afirma(nome, cond) {
  total++;
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`);
}

console.log('aceitarPontoNaHistorico "2026"');
let d = planilha();
let aviso = rodar(d, 'aceitarPontoNaHistorico', '2026');
afirma('SET vem do extrato, não da linha de ausência', mes(d, 'SET') === '90 / 15400 / 15109.23');
afirma('OUT e DEZ não recebem nada (só têm linha de ausência)', mes(d, 'OUT') === '0 / 0 / 0' && mes(d, 'DEZ') === '0 / 0 / 0');
afirma('AGO segue igual', mes(d, 'AGO') === '93 / 14907.2 / 14514.82');
afirma('o aviso não cita OUT nem DEZ', !/OUT\/2026|DEZ\/2026/.test(aviso));

console.log('aceitarPontoNaHistorico "OUT/26" pedido à mão');
d = planilha();
aviso = rodar(d, 'aceitarPontoNaHistorico', 'OUT/26');
afirma('recusa: sem extrato processado', /OUT\/2026: sem extrato/.test(aviso) && mes(d, 'OUT') === '0 / 0 / 0');

console.log('corrigirPontoGravadoComAusencias na planilha estragada');
d = planilha();
const sujo = { SET: [141.53, 70.4, 7.5, 7.5, 7448], OUT: [140, 105.6, 2.63, 2.6, 0], DEZ: [98.45, 70.4, 14.78, 14.8, 0] };
Object.keys(sujo).forEach(function (m) {
  const l = d.HISTORICO.find(x => x[0] === m);
  [l[2], l[3], l[4], l[7], l[8]] = sujo[m];
  l[10] = 220;   /* faltasPonto recebia as férias */
});
aviso = rodar(d, 'corrigirPontoGravadoComAusencias');
afirma('SET regravado pelo extrato', mes(d, 'SET') === '90 / 15400 / 15109.23');
afirma('SET leva a hora extra do extrato', d.HISTORICO[2][5] === 1092.95 && d.HISTORICO[2][6] === 36.22);
afirma('OUT e DEZ zerados, horasTotais e absenteísmo inclusive', ['OUT', 'DEZ'].every(function (m) {
  const l = d.HISTORICO.find(x => x[0] === m); return l.slice(2).every(v => v === 0);
}));
afirma('AGO não é tocado', mes(d, 'AGO') === '93 / 14907.2 / 14514.82' && d.HISTORICO[1][7] === 15708);
afirma('segunda rodada não muda nada', /Nenhum mês/.test(rodar(d, 'corrigirPontoGravadoComAusencias')));

console.log('corrigirPontoGravadoComAusencias não toca mês digitado que só se parece');
d = planilha();
d.HISTORICO[3].splice(2, 3, 140, 105.6, 2.64);   /* OUT com 2,64 h, não 2,63: não é a assinatura */
rodar(d, 'corrigirPontoGravadoComAusencias');
afirma('OUT fica como está', mes(d, 'OUT') === '140 / 105.6 / 2.64');

console.log(`\n${total - falhas}/${total} ok`);
process.exit(falhas ? 1 : 0);
