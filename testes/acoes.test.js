/* ══════════════════════════════════════════════════════════════════════════
   Teste da gravação do plano de ação — apps-script/Code.gs (gravarAcoes)

   Rode com:  node testes/acoes.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   A aba ACOES só recebia o cabeçalho quando era criada. Campo que o painel
   passou a mandar depois (enviadoEm, enviadoPara; em b96.38 realizado e
   concluidoEm) não tinha coluna e gravarAcoes descartava em silêncio: a
   ação era concluída com "o que foi realizado" e a planilha guardava só o
   status. A planilha é um objeto em memória com o que a função usa.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

function aba(v) {
  const garante = (r, c) => { while (v.length < r) v.push([]); while (v[r - 1].length < c) v[r - 1].push(''); };
  return {
    v,
    getDataRange: () => ({ getValues: () => { const w = v.reduce((m, l) => Math.max(m, l.length), 0); return v.map(l => { const o = l.slice(); while (o.length < w) o.push(''); return o; }); } }),
    getLastRow: () => { for (let i = v.length; i > 0; i--) if (v[i - 1].some(x => String(x) !== '')) return i; return 0; },
    setFrozenRows() {},
    getRange(r, c, nr, nc) {
      const g = {
        setValue(x) { garante(r, c); v[r - 1][c - 1] = x; return g; },
        setValues(a) { a.forEach((l, i) => l.forEach((x, j) => { garante(r + i, c + j); v[r + i - 1][c + j - 1] = x; })); return g; },
        setNumberFormat() { return g; }
      };
      return g;
    }
  };
}
function carregar(dados) {
  const abas = {}; Object.keys(dados).forEach(n => { abas[n] = aba(dados[n]); });
  const ss = { getSheetByName: n => abas[n] || null, insertSheet: n => (abas[n] = aba(dados[n] = [])) };
  const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Logger: { log() {} }, ContentService: {}, MailApp: {}, Session: {}, Utilities: {} };
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  const G = new Function(...Object.keys(env), src + '\nreturn { gravarAcoes, lerAcoes, ACOES_CAMPOS };')(...Object.values(env));
  return { G, ss, dados };
}
let falhas = 0, total = 0;
function afirma(nome, cond) { total++; if (!cond) falhas++; console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`); }

console.log('\ngravarAcoes: coluna nova no cabeçalho de uma aba antiga');
{
  /* a aba como está em 13/10/26: 13 colunas, sem enviadoEm/enviadoPara */
  const CAB = ['id','tipo','prioridade','kpi','desvio','causa','acao','responsavel','prazo','status','mesRef','criadoEm','atualizadoEm'];
  const { G, ss, dados } = carregar({ ACOES: [CAB.slice(),
    ['a1','Ação','Vermelho','Outro','furação','conferir','cronometrar','Ricardo','2026-09-17','Aberta','AGO/26','2026-09-10T18:58:30Z','2026-09-10T18:58:30Z']] });
  const r = G.gravarAcoes(ss, [{ id:'a1', status:'Concluída', realizado:'furação passou de 40 para 52 peças/min', concluidoEm:'2026-10-13', atualizadoEm:'2026-10-13T12:00:00Z' }]);
  const cab = dados.ACOES[0];
  afirma('cria realizado e concluidoEm (e as que faltavam: enviadoEm, enviadoPara)', ['realizado','concluidoEm','enviadoEm','enviadoPara'].every(c => cab.indexOf(c) >= 0));
  afirma('colunas antigas no mesmo lugar', CAB.every((c, i) => cab[i] === c));
  const l = dados.ACOES[1];
  afirma('grava o que foi realizado', l[cab.indexOf('realizado')] === 'furação passou de 40 para 52 peças/min');
  afirma('grava a data de conclusão', l[cab.indexOf('concluidoEm')] === '2026-10-13');
  afirma('status atualizado e o resto da linha mantido', l[cab.indexOf('status')] === 'Concluída' && l[cab.indexOf('responsavel')] === 'Ricardo');
  afirma('1 atualizada, 0 incluída', r.atualizados === 1 && r.incluidas === 0);
  const lida = G.lerAcoes(ss).find(a => a.id === 'a1');
  afirma('lerAcoes devolve o realizado para o painel', lida && lida.realizado === 'furação passou de 40 para 52 peças/min');
  G.gravarAcoes(ss, [{ id:'a2', status:'Aberta', acao:'nova', atualizadoEm:'2026-10-13T12:05:00Z' }]);
  afirma('rodar de novo não duplica coluna', dados.ACOES[0].filter(c => c === 'realizado').length === 1);
  afirma('ação nova entra com a largura nova', dados.ACOES[2].length >= dados.ACOES[0].length - 0 && dados.ACOES[2][0] === 'a2');
}
{
  const { G, ss, dados } = carregar({});
  G.gravarAcoes(ss, [{ id:'x', status:'Concluída', realizado:'ok', atualizadoEm:'2026-10-13T12:00:00Z' }]);
  afirma('aba criada do zero já com realizado e concluidoEm', dados.ACOES[0].join() === G.ACOES_CAMPOS.join() && dados.ACOES[1][G.ACOES_CAMPOS.indexOf('realizado')] === 'ok');
}

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
