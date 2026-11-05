/* ══════════════════════════════════════════════════════════════════════════
   Teste do setor direto digitado de outro jeito na DP — PontoRH.gs

   Rode com:  node testes/ponto-setor.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   Em OUT/26 uma admissão de 26/10 veio da aba DP do CONTROLE_FALTAS como
   "3- ACABAMENTO" (com espaço). O PontoRH.gs comparava o nome exato com
   PR_SETORES_DIRETOS: a pessoa entrou como indireto (1 pessoa, 44 h no mês)
   e a PONTO_SETOR ganhou um setor a mais. Agora o setor é comparado sem
   espaço, sem acento e sem caixa, a FUNCIONARIOS guarda o nome da lista com
   o texto da DP na observação, e a linha da variante sai da PONTO_SETOR
   quando o mês é processado de novo. As armadilhas: virar direto um setor
   indireto parecido, desfazer o N digitado à mão num setor com o nome
   certo, e apagar a linha da variante sem que o setor certo tenha sido
   regravado (a pessoa sumiria das horas por setor).

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
    clear() { v.length = 0; }, clearContents() { v.length = 0; },
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
  const pad = x => (x < 10 ? '0' : '') + x;
  const env = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ alert() {} }) },
    Logger: { log() {} },
    Utilities: { formatDate: d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' }
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'PontoRH.gs'), 'utf8');
  const PR = new Function(...Object.keys(env), src + '\nreturn { prSetorCanonico, prSetorVariante, prAtualizarFuncionarios, prLerFuncionarios, prGravarSetores, PR_SETOR_COLS };')(...Object.values(env));
  return { PR, ss, dados };
}

let falhas = 0, total = 0;
function afirma(nome, cond) { total++; if (!cond) falhas++; console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`); }
const sec = t => console.log('\n' + t);

/* ══ Regra do nome ══ */
sec('prSetorCanonico / prSetorVariante');
{
  const { PR } = carregar({});
  afirma('"3- ACABAMENTO" → "3-ACABAMENTO"', PR.prSetorCanonico('3- ACABAMENTO') === '3-ACABAMENTO');
  afirma('"3-acabamento" (caixa) → "3-ACABAMENTO"', PR.prSetorCanonico('3-acabamento') === '3-ACABAMENTO');
  afirma('"17-FURACAO" (sem acento) → "17-FURAÇÃO"', PR.prSetorCanonico('17-FURACAO') === '17-FURAÇÃO');
  afirma('" 17 - FURAÇÃO " (espaços) → "17-FURAÇÃO"', PR.prSetorCanonico(' 17 - FURAÇÃO ') === '17-FURAÇÃO');
  afirma('indireto fica como está: "4-EXPEDIÇÃO"', PR.prSetorCanonico('4-EXPEDIÇÃO') === '4-EXPEDIÇÃO');
  afirma('indireto só é aparado: " 39-INDUSTRIAL "', PR.prSetorCanonico(' 39-INDUSTRIAL ') === '39-INDUSTRIAL');
  afirma('vazio continua vazio', PR.prSetorCanonico('') === '' && PR.prSetorCanonico(null) === '');
  afirma('variante: "3- ACABAMENTO" sim', PR.prSetorVariante('3- ACABAMENTO') === true);
  afirma('variante: "3-ACABAMENTO" (nome certo) não', PR.prSetorVariante('3-ACABAMENTO') === false);
  afirma('variante: "4-EXPEDIÇÃO" (indireto) não', PR.prSetorVariante('4-EXPEDIÇÃO') === false);
}

/* ══ DP → FUNCIONARIOS ══ */
sec('prAtualizarFuncionarios: a DP com o setor digitado de outro jeito');
{
  const { PR, ss, dados } = carregar({ FUNCIONARIOS: [] });
  const dp = aba([
    ['Cód', 'Nome', 'Setor', 'Departamento', 'STATUS', 'DT. ADMISSÃO', 'DT. DEMISSÃO'],
    ['1605', 'PESSOA A', '3- ACABAMENTO', '2-PRODUÇÃO', 'ATIVO', '26/10/2026', ''],
    ['1', 'PESSOA B', '4-EXPEDIÇÃO', '2-PRODUÇÃO', 'ATIVO', '01/02/2020', ''],
    ['2', 'PESSOA C', '3-ACABAMENTO', '2-PRODUÇÃO', 'INATIVO', '01/02/2020', '10/09/2026'],
    ['3', 'PESSOA D', '17-furacao', '2-PRODUÇÃO', 'INATIVO', '01/02/2020', '10/09/2026']]);
  const n = PR.prAtualizarFuncionarios(ss, dp);
  const F = dados.FUNCIONARIOS, linha = cod => F.filter(l => l[0] === cod)[0];
  afirma('4 pessoas gravadas', n === 4);
  afirma('1605: setor "3-ACABAMENTO" e direto S', linha('1605')[2] === '3-ACABAMENTO' && linha('1605')[3] === 'S');
  afirma('  observação guarda o texto da DP', linha('1605')[6] === 'setor na DP: "3- ACABAMENTO"');
  afirma('  admissão 26/10/2026 mantida', linha('1605')[4] === '26/10/2026');
  afirma('indireto continua N, sem observação', linha('1')[3] === 'N' && linha('1')[6] === '');
  afirma('nome certo: S, só "inativo na DP"', linha('2')[3] === 'S' && linha('2')[6] === 'inativo na DP');
  afirma('inativo + variante: as duas notas', linha('3')[2] === '17-FURAÇÃO' && linha('3')[6] === 'inativo na DP; setor na DP: "17-furacao"');
}

/* ══ FUNCIONARIOS antiga ══ */
sec('prLerFuncionarios: aba gravada antes da correção');
{
  const { PR, ss } = carregar({ FUNCIONARIOS: [
    ['codigo', 'nome', 'setor', 'direto', 'admissao', 'demissao', 'observacao'],
    ['1605', 'PESSOA A', '3- ACABAMENTO', 'N', '26/10/2026', '', ''],
    ['1', 'PESSOA B', '4-EXPEDIÇÃO', 'N', '01/02/2020', '', ''],
    ['7', 'PESSOA E', '3-ACABAMENTO', 'N', '01/02/2020', '', ''],
    ['8', 'PESSOA F', '1-USINAGEM', 'S', '01/02/2020', '', '']] });
  const f = PR.prLerFuncionarios(ss);
  afirma('variante com N vira direto, no setor da lista', f.mapa['1605'].direto === true && f.mapa['1605'].setor === '3-ACABAMENTO');
  afirma('indireto continua indireto', f.mapa['1'].direto === false);
  afirma('nome certo com N digitado à mão continua N', f.mapa['7'].direto === false);
  afirma('contagem de diretos: 2 (1605 e 8)', f.diretos === 2);
}

/* ══ PONTO_SETOR ══ */
sec('prGravarSetores: a linha da variante sai quando o setor certo é regravado');
const C = ['mes', 'ano', 'setor', 'direto', 'pessoas', 'horasCarga', 'horasNormais', 'faltasPonto', 'atrasosPonto',
  'extra50', 'extra100', 'totalExtras', 'hePctHoras', 'ausFalta', 'ausAtestado', 'ausAfastado', 'ausAtraso', 'horasFerias', 'atualizadoEm', 'atrasoDuplicado'];
const linhaSetor = (mes, setor, direto, pessoas, carga) => { const l = C.map(() => ''); l[0] = mes; l[1] = 2026; l[2] = setor; l[3] = direto; l[4] = pessoas; l[5] = carga; return l; };
{
  const { PR, dados } = carregar({ PONTO_SETOR: [C.slice(),
    linhaSetor('SET', '3- ACABAMENTO', 'N', 1, 40),
    linhaSetor('OUT', '1-USINAGEM', 'S', 16, 2745.6),
    linhaSetor('OUT', '3- ACABAMENTO', 'N', 1, 44),
    linhaSetor('OUT', '3-ACABAMENTO', 'S', 6, 1020.8)] });
  PR.prGravarSetores({ getSheetByName: n => n === 'PONTO_SETOR' ? aba(dados.PONTO_SETOR) : null }, 'OUT', 2026,
    [{ setor: '3-ACABAMENTO', valores: { direto: 'S', pessoas: 7, horasCarga: 1064.8 } }]);
  const P = dados.PONTO_SETOR.filter(l => l[0] !== '' && l[0] !== 'mes');
  const out = P.filter(l => l[0] === 'OUT');
  afirma('OUT sem "3- ACABAMENTO"', !out.some(l => l[2] === '3- ACABAMENTO'));
  afirma('"3-ACABAMENTO" com as 7 pessoas e 1.064,8 h', out.some(l => l[2] === '3-ACABAMENTO' && l[4] === 7 && l[5] === 1064.8));
  afirma('1-USINAGEM intacta', out.some(l => l[2] === '1-USINAGEM' && l[4] === 16));
  afirma('outro mês (SET) não é tocado', P.some(l => l[0] === 'SET' && l[2] === '3- ACABAMENTO'));
  afirma('sem linha duplicada: 3 linhas no total', P.length === 3);
}
{
  const { PR, dados } = carregar({ PONTO_SETOR: [C.slice(),
    linhaSetor('OUT', '3- ACABAMENTO', 'N', 1, 44),
    linhaSetor('OUT', '1-USINAGEM', 'S', 16, 2745.6)] });
  PR.prGravarSetores({ getSheetByName: n => n === 'PONTO_SETOR' ? aba(dados.PONTO_SETOR) : null }, 'OUT', 2026,
    [{ setor: '1-USINAGEM', valores: { pessoas: 17 } }]);
  const out = dados.PONTO_SETOR.filter(l => l[0] === 'OUT');
  afirma('gravação sem o setor certo não apaga a variante (a pessoa não some)', out.some(l => l[2] === '3- ACABAMENTO' && l[4] === 1));
}

/* O que aconteceu em 05/11/2026: o CONTROLE_FALTAS foi processado sozinho
   (sem o extrato). A gravação do controle só traz direto e ausências; a
   primeira versão apagou a variante e as horas do ponto dela sumiram. */
sec('prGravarSetores: controle processado sem o extrato (OUT/26 real)');
const comHoras = (setor, direto, pessoas, carga, normais, he, atest) => {
  const l = linhaSetor('OUT', setor, direto, pessoas, carga);
  l[6] = normais; l[11] = he; l[12] = Math.round(he / normais * 10000) / 100; l[14] = atest; return l;
};
{
  const { PR, dados } = carregar({ PONTO_SETOR: [C.slice(),
    comHoras('3- ACABAMENTO', 'N', 1, 44, 44, 6.35, 4.8),
    comHoras('3-ACABAMENTO', 'S', 6, 1020.8, 1005.28, 82.53, 66.33)] });
  PR.prGravarSetores({ getSheetByName: n => n === 'PONTO_SETOR' ? aba(dados.PONTO_SETOR) : null }, 'OUT', 2026,
    [{ setor: '3-ACABAMENTO', valores: { direto: 'S', ausAtestado: 71.13 } }]);
  const out = dados.PONTO_SETOR.filter(l => l[0] === 'OUT'), a = out.filter(l => l[2] === '3-ACABAMENTO')[0];
  afirma('variante sai', !out.some(l => l[2] === '3- ACABAMENTO'));
  afirma('horas do ponto dela somadas: 7 pessoas, 1.064,8 h de carga', a[4] === 7 && a[5] === 1064.8);
  afirma('normais 1.049,28 h e HE 88,88 h somadas', a[6] === 1049.28 && a[11] === 88.88);
  afirma('hePctHoras refeito: 88,88 ÷ 1.049,28 = 8,47%', a[12] === 8.47);
  afirma('ausência que o controle regravou vale o novo (71,13, não 75,93)', a[14] === 71.13);
}
{
  const { PR, dados } = carregar({ PONTO_SETOR: [C.slice(), comHoras('3- ACABAMENTO', 'N', 1, 44, 44, 6.35, 4.8)] });
  PR.prGravarSetores({ getSheetByName: n => n === 'PONTO_SETOR' ? aba(dados.PONTO_SETOR) : null }, 'OUT', 2026,
    [{ setor: '3-ACABAMENTO', valores: { direto: 'S', ausAtestado: 4.8 } }]);
  const out = dados.PONTO_SETOR.filter(l => l[0] === 'OUT');
  afirma('sem linha do setor certo: a variante só muda de nome', out.length === 1 && out[0][2] === '3-ACABAMENTO' && out[0][4] === 1 && out[0][5] === 44);
  afirma('  e recebe o que a gravação trouxe (direto S)', out[0][3] === 'S');
}

console.log(`\n${total - falhas}/${total} ok` + (falhas ? ` — ${falhas} FALHA(S)` : ''));
process.exit(falhas ? 1 : 0);
