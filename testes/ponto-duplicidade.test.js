/* ══════════════════════════════════════════════════════════════════════════
   Teste do atraso contado duas vezes — apps-script/PontoRH.gs (regra A)

   Rode com:  node testes/ponto-duplicidade.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   O RH lança atraso e saída antecipada como FALTA, com horas, no controle de
   faltas; o painel somava as faltas do controle MAIS o atraso do ponto. Em
   ABR/26, 201,7 h entraram duas vezes (14,06% em vez de 12,58%); em SET/26,
   80,6 h (7,50% em vez de 6,97%). O PontoRH.gs apura pessoa a pessoa:
     ponto, fora o atraso = (jornada − carga) + faltas do ponto
     controle            = falta + atestado + afastado + férias
     dupla = min(max(controle − ponto fora o atraso, 0), atrasos do ponto)
   e grava atrasoDuplicado na HISTORICO (total) e na PONTO_SETOR (por setor).

   Caso montado à mão, jornada 184,8 h:
     101 EMBALAGEM  atraso 10, controle 8 de falta, ponto sem falta  → 8
     102 EMBALAGEM  falta 8,8 e carga 176 no ponto; controle 17,6    → 0
     103 USINAGEM   férias 44 tiram a carga; controle 44 + 4,4 falta → 4,4
     104 USINAGEM   atraso 3, controle 20 de falta                   → 3 (o
                    resto é ausência que o ponto não mostra)
     105 USINAGEM   no ponto, fora do controle                        → 0
     106            no controle, fora do ponto                        → 0
   Total 15,4 h em 3 pessoas: EMBALAGEM 8, USINAGEM 7,4.
   A planilha é um objeto em memória com o que estas funções usam.
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
  const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ alert() {} }) }, Logger: { log() {} } };
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'PontoRH.gs'), 'utf8');
  const PR = new Function(...Object.keys(env), src + '\nreturn { prDuplicidade, prApurarDuplicidade, prGravarPessoas, prBrutasDoMesFechado, prLerHistoricoMes, prMesmoExtrato, PR_ABA_PONTO_PESSOA, PR_CAB_PONTO_PESSOA, PR_ABA_AUS_PESSOA, PR_CAB_AUS_PESSOA, PR_SETOR_COLS };')(...Object.values(env));
  return { PR, ss, dados };
}

let falhas = 0, total = 0;
function afirma(nome, cond) { total++; if (!cond) falhas++; console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`); }
function ok(nome, obtido, esperado, tol = 0.01) {
  total++; const bom = Math.abs(obtido - esperado) <= tol; if (!bom) falhas++;
  console.log(`  ${bom ? 'ok  ' : 'FALHA'} ${nome.padEnd(52)} ${(+obtido).toFixed(2).padStart(8)} (esperado ${(+esperado).toFixed(2)})`);
}
const sec = t => console.log('\n' + t);

/* cod | mes | ano | carga | faltas | atrasos | normais | jornada */
const PONTO = [
  ['101', 'SET', 2026, 184.8, 0,   10, 174.8, 184.8],
  ['102', 'SET', 2026, 176,   8.8, 5,  162.2, 184.8],
  ['103', 'SET', 2026, 140.8, 0,   6,  134.8, 184.8],
  ['104', 'SET', 2026, 184.8, 0,   3,  181.8, 184.8],
  ['105', 'SET', 2026, 184.8, 0,   2,  182.8, 184.8]];
/* cod | mes | ano | falta | atestado | afastado | atraso | ferias */
const AUS = [
  ['101', 'SET', 2026, 8,   0,   0, 0, 0],
  ['102', 'SET', 2026, 8.8, 8.8, 0, 0, 0],
  ['103', 'SET', 2026, 4.4, 0,   0, 0, 44],
  ['104', 'SET', 2026, 20,  0,   0, 0, 0],
  ['106', 'SET', 2026, 8.8, 0,   0, 0, 0]];

sec('prDuplicidade: a regra, pessoa a pessoa');
{
  const { PR } = carregar({});
  const mapa = {};
  AUS.forEach(l => { mapa[l[0]] = { falta: l[3], atestado: l[4], afastado: l[5], ferias: l[7] }; });
  const d = PR.prDuplicidade(PONTO.map(l => ({ cod: l[0], carga: l[3], faltas: l[4], atrasos: l[5], jornada: l[7] })), mapa);
  ok('total de horas contadas duas vezes', d.horas, 15.4);
  ok('pessoas', d.pessoas, 3, 0);
  ok('101: falta do controle = atraso do ponto (até o atraso)', d.porCod['101'], 8);
  afirma('102: controle fecha com falta e carga do ponto → 0', !d.porCod['102']);
  ok('103: férias tiram a carga e não viram duplicidade', d.porCod['103'], 4.4);
  ok('104: limitado ao atraso do ponto', d.porCod['104'], 3);
  afirma('105 (fora do controle) e 106 (fora do ponto) não entram', !d.porCod['105'] && !d.porCod['106']);
}

sec('prApurarDuplicidade: grava na HISTORICO e na PONTO_SETOR');
{
  const C = (cab) => cab.slice();
  const { PR, ss, dados } = carregar({
    PONTO_PESSOA: [C(['cod', 'mes', 'ano', 'carga', 'faltas', 'atrasos', 'normais', 'jornada'])].concat(PONTO,
      [['101', 'AGO', 2026, 184.8, 0, 50, 134.8, 184.8]]),
    AUSENCIAS_PESSOA: [C(['cod', 'mes', 'ano', 'falta', 'atestado', 'afastado', 'atraso', 'ferias'])].concat(AUS),
    FUNCIONARIOS: [['codigo', 'nome', 'setor', 'direto'],
      ['101', 'P1', '2-EMBALAGEM', 'S'], ['102', 'P2', '2-EMBALAGEM', 'S'], ['103', 'P3', '1-USINAGEM', 'S'],
      ['104', 'P4', '1-USINAGEM', 'S'], ['105', 'P5', '1-USINAGEM', 'S'], ['106', 'P6', '7-LINHA DE PINTURA', 'S']],
    HISTORICO: [['mes', 'ano', 'horasNormais', 'atrasosPonto'],
      ['AGO', 2026, 14514.82, 207.58], ['SET', 2026, 15188.43, 26]],
    PONTO_SETOR: [['mes', 'ano', 'setor', 'atrasosPonto'],
      ['SET', 2026, '1-USINAGEM', 11], ['SET', 2026, '2-EMBALAGEM', 15], ['SET', 2026, '7-LINHA DE PINTURA', 0],
      ['AGO', 2026, '2-EMBALAGEM', 50]]
  });
  /* resto de uma apuração anterior: tem que voltar a 0 */
  dados.PONTO_SETOR[0].push('atrasoDuplicado'); dados.PONTO_SETOR[3].push(9);
  const d = PR.prApurarDuplicidade(ss, 'SET', 2026);
  ok('devolve o total do mês', d.horas, 15.4);
  const H = dados.HISTORICO, hc = H[0];
  afirma('HISTORICO ganha as colunas atrasoDuplicado e duplicidadeApurada', hc.indexOf('atrasoDuplicado') >= 0 && hc.indexOf('duplicidadeApurada') >= 0);
  const set = H.find(l => l[0] === 'SET'), ago = H.find(l => l[0] === 'AGO');
  ok('HISTORICO SET: atrasoDuplicado', set[hc.indexOf('atrasoDuplicado')], 15.4);
  ok('HISTORICO SET: duplicidadeApurada = 1', set[hc.indexOf('duplicidadeApurada')], 1, 0);
  afirma('HISTORICO AGO não é tocada (sem controle por pessoa em AGO)', !ago[hc.indexOf('atrasoDuplicado')]);
  const S = dados.PONTO_SETOR, sc = S[0].indexOf('atrasoDuplicado');
  const linha = (m, s) => S.find(l => l[0] === m && l[2] === s);
  ok('PONTO_SETOR SET USINAGEM: 4,4 + 3', linha('SET', '1-USINAGEM')[sc], 7.4);
  ok('PONTO_SETOR SET EMBALAGEM', linha('SET', '2-EMBALAGEM')[sc], 8);
  ok('PONTO_SETOR SET LINHA DE PINTURA: valor antigo volta a 0', linha('SET', '7-LINHA DE PINTURA')[sc], 0);
  afirma('PONTO_SETOR AGO não é tocada', !linha('AGO', '2-EMBALAGEM')[sc]);
  ok('soma dos setores = total da fábrica', S.filter(l => l[0] === 'SET').reduce((t, l) => t + (+l[sc] || 0), 0), 15.4);
  afirma('PONTO_SETOR continua com as colunas do script (PR_SETOR_COLS) e atrasoDuplicado', PR.PR_SETOR_COLS.indexOf('atrasoDuplicado') >= 0);
  afirma('mês sem as duas abas por pessoa → null, nada gravado', PR.prApurarDuplicidade(ss, 'OUT', 2026) === null);
  /* idempotente: apurar de novo dá o mesmo */
  PR.prApurarDuplicidade(ss, 'SET', 2026);
  ok('apurar de novo: mesmo total na HISTORICO', H.find(l => l[0] === 'SET')[hc.indexOf('atrasoDuplicado')], 15.4);
  ok('apurar de novo: mesmo valor no setor', dados.PONTO_SETOR.find(l => l[0] === 'SET' && l[2] === '1-USINAGEM')[dados.PONTO_SETOR[0].indexOf('atrasoDuplicado')], 7.4);
}

sec('prGravarPessoas: troca só as linhas do mês, numa escrita');
{
  const { PR, ss, dados } = carregar({ PONTO_PESSOA: [PR_CAB(), ['101', 'AGO', 2026, 1, 1, 1, 1, 1], ['101', 'SET', 2026, 9, 9, 9, 9, 9]] });
  function PR_CAB() { return ['cod', 'mes', 'ano', 'carga', 'faltas', 'atrasos', 'normais', 'jornada']; }
  PR.prGravarPessoas(ss, PR.PR_ABA_PONTO_PESSOA, PR.PR_CAB_PONTO_PESSOA, l => String(l[1]) === 'SET' && +l[2] === 2026,
    [['101', 'SET', 2026, 184.8, 0, 10, 174.8, 184.8], ['102', 'SET', 2026, 176, 8.8, 5, 162.2, 184.8]]);
  const v = dados.PONTO_PESSOA.filter(l => l.some(x => String(x) !== ''));
  afirma('cabeçalho mantido', v[0].join() === PR.PR_CAB_PONTO_PESSOA.join());
  afirma('AGO fica', v.some(l => l[1] === 'AGO'));
  afirma('SET antigo sai, SET novo entra (2 linhas)', v.filter(l => l[1] === 'SET').length === 2 && !v.some(l => l[1] === 'SET' && l[3] === 9));
  const nova = carregar({});
  nova.PR.prGravarPessoas(nova.ss, 'AUSENCIAS_PESSOA', nova.PR.PR_CAB_AUS_PESSOA, () => false, [['101', 'SET', 2026, 8, 0, 0, 0, 0]]);
  afirma('aba que não existe é criada com cabeçalho', nova.dados.AUSENCIAS_PESSOA[0].join() === nova.PR.PR_CAB_AUS_PESSOA.join() && nova.dados.AUSENCIAS_PESSOA.length === 2);
}

sec('Entrou ou saiu no mês, e carga acima da jornada (revisão de 13/10)');
{
  /* jornada cheia do mês = 176 (a mais frequente). 201 saiu em 20/09: jornada =
     própria carga 110, com 17,6 h de atestado que já reduziram a carga, e 3 h
     de atraso → nada duplicado. 202 tem escala de 184,8 (carga acima da
     jornada), mesma falta de 8,8 h no ponto e no controle, 5 h de atraso →
     nada duplicado. 203 normal, controle 8 de falta, ponto sem falta, 10 de
     atraso → 8. */
  const { PR, ss, dados } = carregar({
    PONTO_PESSOA: [['cod','mes','ano','carga','faltas','atrasos','normais','jornada'],
      ['201','SET',2026,110,0,3,107,110], ['202','SET',2026,184.8,8.8,5,171,176], ['203','SET',2026,176,0,10,166,176], ['204','SET',2026,176,0,0,176,176]],
    AUSENCIAS_PESSOA: [['cod','mes','ano','falta','atestado','afastado','atraso','ferias'],
      ['201','SET',2026,0,17.6,0,0,0], ['202','SET',2026,8.8,0,0,0,0], ['203','SET',2026,8,0,0,0,0]],
    FUNCIONARIOS: [['codigo','nome','setor','direto'], ['201','A','1-USINAGEM','S'], ['202','B','1-USINAGEM','S'], ['203','C','2-EMBALAGEM','S'], ['204','D','2-EMBALAGEM','S']],
    HISTORICO: [['mes','ano','horasNormais','atrasosPonto'], ['SET', 2026, 620, 18]],
    PONTO_SETOR: [['mes','ano','setor','atrasosPonto'], ['SET',2026,'1-USINAGEM',8], ['SET',2026,'2-EMBALAGEM',10]]
  });
  const d = PR.prApurarDuplicidade(ss, 'SET', 2026);
  ok('só o 203 conta (8 h): desligado com atestado e escala maior não', d.horas, 8);
  ok('pessoas', d.pessoas, 1, 0);
  afirma('201 (saiu no mês) fora', !d.porCod['201']);
  afirma('202 (carga acima da jornada) fora', !d.porCod['202']);
  const S = dados.PONTO_SETOR, c = S[0].indexOf('atrasoDuplicado');
  ok('setor da usinagem sem duplicidade', S.find(l => l[2] === '1-USINAGEM')[c], 0);
}

sec('Mês fechado com OUTRO extrato: prMesmoExtrato decide se mexe');
{
  const { PR } = carregar({});
  const atual = { colaboradores: 93, horasCarga: 14062.4, horasNormais: 13633.2, extra50: 1092.87, extra100: 340.82, naoTrabalhadas: 1749.2 };
  afirma('mesmo extrato → true', PR.prMesmoExtrato(atual, { n: 93, carga: 14062.4, normais: 13633.2, e50: 1092.87, e100: 340.82 }));
  afirma('reexportado com 4 desligados (97 pessoas) → false', !PR.prMesmoExtrato(atual, { n: 97, carga: 14350, normais: 13830, e50: 1092.87, e100: 340.82 }));
  afirma('sem linha na HISTORICO → false', !PR.prMesmoExtrato(null, { n: 93 }));
}

sec('Mês fechado, mesmo extrato: só as colunas brutas do script mudam (prBrutasDoMesFechado)');
{
  /* JUN/26 em 13/10/26: o extrato reexportado é o mesmo de setembro (95
     diretos, carga 14.792,8, normais 14.388,6, extras iguais), mas a
     naoTrabalhadas da HISTORICO era da regra antiga: 2.331,35 contra
     2.014,55 pela regra de hoje. */
  const cab = ['mes', 'ano', 'colaboradores', 'horasCarga', 'horasNormais', 'extra50', 'extra100', 'absenteismo', 'naoTrabalhadas', 'faltasPonto', 'atrasosPonto'];
  const base = () => ({ HISTORICO: [cab.slice(), ['JUN', 2026, 95, 14792.8, 14388.6, 950.5, 20.2, 8.1, 2331.35, 237.6, 166.55]] });
  const a = { n: 95, carga: 14792.8, normais: 14388.65, e50: 950.5, e100: 20.2, naoTrabalhadas: 2014.55, faltasPonto: 237.6, atrasosPonto: 166.55 };
  const val = (d, k) => d.HISTORICO[1][cab.indexOf(k)];
  {
    const { PR, ss, dados } = carregar(base());
    const r = PR.prBrutasDoMesFechado(ss, 'JUN', 2026, a, PR.prLerHistoricoMes(ss, 'JUN', 2026));
    afirma('mesmo extrato → devolve antes e depois', r && Math.round(r.antes) === 2331 && Math.round(r.depois) === 2015);
    ok('naoTrabalhadas regravada pela regra de hoje', val(dados, 'naoTrabalhadas'), 2014.55);
    afirma('colaboradores, carga, normais e extras não são tocados',
      val(dados, 'colaboradores') === 95 && val(dados, 'horasCarga') === 14792.8 && val(dados, 'horasNormais') === 14388.6 && val(dados, 'extra50') === 950.5 && val(dados, 'extra100') === 20.2);
    afirma('coluna calculada (absenteismo) não é tocada', val(dados, 'absenteismo') === 8.1);
  }
  {
    const { PR, ss, dados } = carregar(base());
    const r = PR.prBrutasDoMesFechado(ss, 'JUN', 2026, Object.assign({}, a, { e50: 1010 }), PR.prLerHistoricoMes(ss, 'JUN', 2026));
    afirma('extrato diferente (extra 50% mudou) → mês protegido, nada muda', r === null && val(dados, 'naoTrabalhadas') === 2331.35);
  }
  {
    const { PR, ss, dados } = carregar(base());
    const r = PR.prBrutasDoMesFechado(ss, 'JUN', 2026, Object.assign({}, a, { n: 96 }), PR.prLerHistoricoMes(ss, 'JUN', 2026));
    afirma('outra quantidade de diretos → nada muda', r === null && val(dados, 'naoTrabalhadas') === 2331.35);
  }
  {
    const { PR, ss } = carregar(base());
    const r = PR.prBrutasDoMesFechado(ss, 'JUN', 2026, Object.assign({}, a, { naoTrabalhadas: 2331.35 }), PR.prLerHistoricoMes(ss, 'JUN', 2026));
    afirma('já igual → null (não reescreve nem polui a mensagem)', r === null);
  }
}

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
