/* ══════════════════════════════════════════════════════════════════════════
   Teste de quem vem sem nenhuma hora no extrato do ponto — apps-script/PontoRH.gs

   Rode com:  node testes/ponto-sem-horas.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   O Extrato de Totais traz quem está na folha, mesmo sem escala no mês. Em
   OUT/26 duas diretas afastadas o mês inteiro vieram com a linha toda em
   branco (carga, faltas, atrasos, extras e normais vazios). Regra (decisão
   do PPCP em 10/11/2026): elas CONTAM em colaboradores e colaboradoresTotal
   — a vaga está ocupada e ninguém foi contratado no lugar, então para a
   produção a ausência é absenteísmo. O aviso lista os nomes, para conferir
   com o afastamento lançado no controle de faltas. A b96.98 tirou essas
   pessoas da contagem e foi desfeita no mesmo dia; OUT/26 ficou gravado com
   94 em vez de 96, e processar de novo o mesmo extrato tem que voltar.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

let falhas = 0, total = 0;
function afirma(nome, cond) { total++; if (!cond) falhas++; console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`); }
const sec = t => console.log('\n' + t);

/* planilha em memória: só o que PontoRH.gs usa aqui */
function aba(v) {
  const garante = (r, c) => { while (v.length < r) v.push([]); while (v[r - 1].length < c) v[r - 1].push(''); };
  return {
    getDataRange: () => ({ getValues: () => { const w = v.reduce((m, l) => Math.max(m, l.length), 0); return v.map(l => { const o = l.slice(); while (o.length < w) o.push(''); return o; }); } }),
    getLastRow: () => { for (let i = v.length; i > 0; i--) if (v[i - 1].some(x => String(x) !== '')) return i; return 0; },
    getRange(r, c, nl) {
      const g = {
        setValue(x) { garante(r, c); v[r - 1][c - 1] = x; return g; },
        setValues(a) { a.forEach((l, i) => l.forEach((x, j) => { garante(r + i, c + j); v[r + i - 1][c + j - 1] = x; })); return g; }
      };
      return g;
    }
  };
}
function planilha(dados) {
  const abas = {}; Object.keys(dados).forEach(n => { abas[n] = aba(dados[n]); });
  return { getSheetByName: n => abas[n] || null, insertSheet: n => (abas[n] = aba(dados[n] = [])) };
}

const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'PontoRH.gs'), 'utf8');
const carregar = ss => new Function('SpreadsheetApp', 'Logger', src
  + '\nreturn { prAgregar, prAgregarSetores, prMesmoExtrato, prBrutasDoMesFechado, prLerHistoricoMes };')(
  { getActiveSpreadsheet: () => ss }, { log() {} });

const dt = (d, m) => new Date(2026, m - 1, d);
const pessoa = (codigo, nome, carga, normais, e50 = 0) => ({ codigo, nome, carga, normais, faltas: carga - normais, atrasos: 0, e50, e100: 0 });
/* jornada cheia 176 h (20 dias × 8,8 h), como o extrato do print */
const ext = { mes: 'NOV', ano: 2026, fim: dt(30, 11), pessoas: [
  pessoa('1021', 'A', 176, 176), pessoa('1522', 'B', 176, 170),
  pessoa('1700', 'X', 0, 0),               /* afastada o mês inteiro: linha em branco */
  pessoa('1590', 'C', 0, 0, 8.8),          /* sem carga, mas fez extra: trabalhou */
  pessoa('9003', 'D', 176, 176),           /* indireto */
  pessoa('9004', 'E', 0, 0) ] };           /* indireto sem horas */
const func = { mapa: {
  1021: { direto: true, setor: 'A' }, 1522: { direto: true, setor: 'A' }, 1700: { direto: true, setor: 'A' },
  1590: { direto: true, setor: 'B' }, 9003: { direto: false, setor: 'C' }, 9004: { direto: false, setor: 'C' } } };

sec('prAgregar: quem veio sem nenhuma hora conta como colaborador e vai para o aviso');
{
  const PR = carregar(planilha({}));
  const a = PR.prAgregar(ext, func);
  afirma('diretos = 4 (a 1700 sem horas também conta)', a.n === 4);
  afirma('nSemHoras = 1 (só a 1700; a 1590 fez extra)', a.nSemHoras === 1);
  afirma('aviso lista quem veio sem horas (1700 X)', a.semHoras.length === 1 && a.semHoras[0] === '1700 X');
  afirma('quadro inteiro = 6 (indireto sem horas também conta)', a.nTotal === 6);
  afirma('jornada cheia continua 176', a.jornada === 176);
  afirma('as 176 h da escala dela continuam em naoTrabalhadas (6 + 176 + 176 = 358)', Math.abs(a.naoTrabalhadas - 358) < 1e-9);
  const soma = PR.prAgregarSetores(ext, func).reduce((t, s) => t + s.n, 0);
  afirma('pessoas da PONTO_SETOR batem com o quadro', soma === a.nTotal);
}

sec('Mês gravado pela b96.98 (sem quem veio sem horas) volta ao reprocessar o mesmo extrato');
{
  const PR = carregar(planilha({}));
  const a = PR.prAgregar(ext, func);
  const base = { horasCarga: a.carga, horasNormais: a.normais, extra50: a.e50, extra100: a.e100 };
  afirma('colaboradores = regra de hoje → mesmo extrato', PR.prMesmoExtrato(Object.assign({ colaboradores: 4 }, base), a));
  afirma('colaboradores da b96.98 (−1 sem horas) → mesmo extrato', PR.prMesmoExtrato(Object.assign({ colaboradores: 3 }, base), a));
  afirma('outra quantidade → extrato diferente', !PR.prMesmoExtrato(Object.assign({ colaboradores: 2 }, base), a));
  afirma('sem ninguém sem horas, −1 não passa', !PR.prMesmoExtrato(Object.assign({ colaboradores: 3 }, base), Object.assign({}, a, { nSemHoras: 0 })));

  const cab = ['mes', 'ano', 'colaboradores', 'horasCarga', 'horasNormais', 'extra50', 'extra100', 'naoTrabalhadas', 'faltasPonto', 'atrasosPonto', 'colaboradoresTotal'];
  const dados = { HISTORICO: [cab.slice(), ['NOV', 2026, 3, a.carga, a.normais, a.e50, a.e100, a.naoTrabalhadas, a.faltasPonto, a.atrasosPonto, 4]] };
  const ss = planilha(dados), P2 = carregar(ss);
  const r = P2.prBrutasDoMesFechado(ss, 'NOV', 2026, a, P2.prLerHistoricoMes(ss, 'NOV', 2026));
  const v = k => dados.HISTORICO[1][cab.indexOf(k)];
  afirma('o aviso recebe a troca de colaboradores (3 → 4)', r && r.colabAntes === 3 && r.colabDepois === 4 && r.antes === undefined);
  afirma('colaboradores volta para 4', v('colaboradores') === 4);
  afirma('colaboradoresTotal volta para 6', v('colaboradoresTotal') === 6);
  afirma('horas continuam as do mês fechado', v('horasCarga') === a.carga && v('horasNormais') === a.normais);
  const r2 = P2.prBrutasDoMesFechado(ss, 'NOV', 2026, a, P2.prLerHistoricoMes(ss, 'NOV', 2026));
  afirma('rodar de novo: nada a mudar (null)', r2 === null);
}

console.log(`\n${total - falhas}/${total} ok`);
process.exit(falhas ? 1 : 0);
