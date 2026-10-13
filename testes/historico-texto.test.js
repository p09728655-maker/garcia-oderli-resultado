/* ══════════════════════════════════════════════════════════════════════════
   Teste da coluna de texto da HISTORICO — apps-script/Code.gs
   (lerHistorico, gravarHistorico com integridadeCiente)

   Rode com:  node testes/historico-texto.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   lerHistorico convertia TODA coluna em número. O "Ciente" da integridade
   (b96.39) guarda texto na linha do mês ("ponto | 1749 | 2119 | 2026-10-13 |
   motivo"): sem a exceção, voltava ao painel como 0 e o aviso reaparecia na
   próxima abertura. gravarHistorico ignorava campo sem coluna; agora cria a
   coluna integridadeCiente na primeira vez.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

function aba(v) {
  const garante = (r, c) => { while (v.length < r) v.push([]); while (v[r - 1].length < c) v[r - 1].push(''); };
  return {
    getDataRange: () => ({ getValues: () => { const w = v.reduce((m, l) => Math.max(m, l.length), 0); return v.map(l => { const o = l.slice(); while (o.length < w) o.push(''); return o; }); } }),
    getLastRow: () => { for (let i = v.length; i > 0; i--) if (v[i - 1].some(x => String(x) !== '')) return i; return 0; },
    getRange(r, c) {
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
  const G = new Function(...Object.keys(env), src + '\nreturn { lerHistorico, gravarHistorico };')(...Object.values(env));
  return { G, ss, dados };
}
let falhas = 0, total = 0;
function afirma(nome, cond) { total++; if (!cond) falhas++; console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`); }

const CAB = ['mes', 'ano', 'colaboradores', 'horasNormais', 'naoTrabalhadas', 'atrasoDuplicado'];
const base = () => ({ HISTORICO: [CAB.slice(), ['ABR', 2026, 93, 13633.2, 1749.2, 201.7], ['MAI', 2026, 95, 14768.4, 1784.4, 167.6]] });
const TXT = 'ponto | 1749.2 | 2119.4 | 2026-10-13 | extrato sem os desligados de abril';

console.log('\ngravarHistorico: cria a coluna de texto e grava');
{
  const { G, ss, dados } = carregar(base());
  G.gravarHistorico(ss, [{ mes: 'ABR', ano: 2026, colaboradores: 93, horasNormais: 13633.2, integridadeCiente: TXT }]);
  const cab = dados.HISTORICO[0], i = cab.indexOf('integridadeCiente');
  afirma('coluna integridadeCiente criada no fim', i === CAB.length);
  afirma('texto gravado na linha de ABR', dados.HISTORICO[1][i] === TXT);
  afirma('MAI não ganha texto', !dados.HISTORICO[2][i]);
  afirma('colunas protegidas continuam intactas (atrasoDuplicado de ABR)', dados.HISTORICO[1][CAB.indexOf('atrasoDuplicado')] === 201.7);
  const lido = G.lerHistorico(ss);
  afirma('lerHistorico devolve o texto, não 0', lido.find(r => r.mes === 'ABR').integridadeCiente === TXT);
  afirma('e os números continuam números', lido.find(r => r.mes === 'ABR').horasNormais === 13633.2);
  G.gravarHistorico(ss, [{ mes: 'ABR', ano: 2026, colaboradores: 93, horasNormais: 13633.2, integridadeCiente: '' }]);
  afirma('desfazer: grava vazio, não cria segunda coluna', dados.HISTORICO[0].filter(c => c === 'integridadeCiente').length === 1 && dados.HISTORICO[1][i] === '');
}
{
  const { G, ss, dados } = carregar(base());
  G.gravarHistorico(ss, [{ mes: 'ABR', ano: 2026, colaboradores: 93, horasNormais: 13633.2 }]);
  afirma('sem ciente em nenhum registro: coluna não é criada', dados.HISTORICO[0].indexOf('integridadeCiente') < 0);
}

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
