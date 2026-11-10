/* ══════════════════════════════════════════════════════════════════════════
   Teste da auditoria dos relatórios (Briefing Mensal e Reunião do Mês) —
   b96.97. As contas centrais do DashUtils, com os números de referência de
   OUT/2026 que a auditoria usou como caso de teste.

   Rode com:  node testes/auditoria-out26.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   Os dois relatórios calculavam o mesmo indicador de jeitos diferentes:
     • dias úteis restantes 44 no Briefing e 34 na Reunião (duas tabelas
       fixas de dias);
     • "falta produzir 56.359" = plano de NOV+DEZ, quando o saldo para fechar
       o ano é plano do ano − realizado = 57.819;
     • "RITMO ABAIXO DO PLANO −10,5%" vinha da jornada normal, num ano a
       −0,5% no volume;
     • "capacidade 29.631" = produção × normais ÷ carga (sai da própria
       produção) e gap 5.179 no Briefing × 5.320 na Reunião;
     • absenteísmo sobre horas normais (decisão do PPCP: horas previstas) e
       "dependência de HE" chamada de "% do volume" sendo HE ÷ normais.
   Agora cada indicador tem uma função no DashUtils e os dois relatórios
   usam a mesma. Este teste trava essas funções.
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
  total++; const bom = obtido !== null && obtido !== undefined && Math.abs(obtido - esperado) <= tol; if (!bom) falhas++;
  console.log(`  ${bom ? 'ok  ' : 'FALHA'} ${nome.padEnd(60)} ${obtido === null || obtido === undefined ? 'null' : (+obtido).toFixed(2).padStart(10)} (esperado ${(+esperado).toFixed(2)})`);
}
const sec = t => console.log('\n' + t);
const U = carregarDashUtils();

/* Feriados nacionais de 2026 (Code.gs, FERIADOS_PADRAO) */
const FER = ['2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01','2026-06-04',
             '2026-09-07','2026-10-12','2026-11-02','2026-11-20','2026-12-25'];
const M = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
/* 2026 até OUT: plano 305.937, realizado 304.477 (OUT/26: 34.810 e 30.478). */
const PLANO = [24181, 28866, 25468, 31407, 32204, 31937, 31468, 30537, 35059, 34810, 31495, 24864];
const REAL  = [22437, 28151, 27600, 29195, 33330, 30851, 32123, 32364, 37948, 30478, 0, 0];
const NORM  = [20409, 24334, 25417, 24906, 29563, 26667, 28856, 29438, 35375, 28727, 0, 0];
const ANO = M.map((mes, i) => ({ mes, ano: 2026, previsaoProducao: PLANO[i], producaoReal: REAL[i],
  prodSemExtras: NORM[i], diasTrabalhados: REAL[i] > 0 ? 21 : 0 }));

sec('Calendário: dias úteis até o último dia de produção (18/12)');
ok('NOV/26 inteiro, sem 02/11 e 20/11', U.diasUteis('2026-11-01', '2026-11-30', FER), 19, 0);
ok('DEZ/26 de 1º a 18', U.diasUteis('2026-12-01', '2026-12-18', FER), 14, 0);
afirma('fim da produção = 18/12 (DIA_FIM_ANO)', U.fimProducaoAno(2026, 18) === '2026-12-18');
afirma('feriado como objeto { data } também vale', U.diasUteis('2026-11-20', '2026-11-20', [{ data: '2026-11-20' }]) === 0);
afirma('fim antes do início → 0', U.diasUteis('2026-12-18', '2026-12-01', FER) === 0);

sec('Fechamento do ano em OUT/26 (DashUtils.fechamentoAno)');
const F = U.fechamentoAno(ANO, 2026, 'OUT', { feriados: FER, diaFim: 18 });
ok('plano do ano', F.planoAno, 362296, 0);
ok('plano acumulado JAN–OUT', F.planoAcum, 305937, 0);
ok('realizado acumulado JAN–OUT', F.realAcum, 304477, 0);
ok('aderência ao plano acumulado = 304.477 ÷ 305.937', F.aderAcum, 99.52);
ok('desvio acumulado', F.desvioAcum, -1460, 0);
ok('ritmo com HE vs plano (volume)', F.pctVolume, -0.48);
ok('ritmo só jornada normal vs plano (dependência)', F.pctJornada, -10.54);
ok('realizado ÷ plano do ANO INTEIRO (10 de 12 meses)', F.pctAno, 84.04);
ok('saldo para fechar o ano = 362.296 − 304.477', F.saldo, 57819, 0);
ok('plano restante (NOV+DEZ) — não é o saldo', F.planoRestante, 56359, 0);
ok('dias úteis restantes (1º/11 a 18/12)', F.diasRestantes, 33, 0);
ok('ritmo exigido para fechar = 57.819 ÷ 33', F.ritmoExigido, 57819 / 33);
afirma('com feriados lidos, sem aviso', F.semFeriados === false);
const F0 = U.fechamentoAno(ANO, 2026, 'OUT', { feriados: [], diaFim: 18 });
afirma('sem a aba FERIADOS: conta 35 dias e avisa', F0.diasRestantes === 35 && F0.semFeriados === true);
afirma('mês até a referência com plano e sem produção vai para semReal, não conta zero',
  (() => { const x = ANO.map(r => r.mes === 'MAR' ? Object.assign({}, r, { producaoReal: 0, prodSemExtras: 0 }) : r);
    const f = U.fechamentoAno(x, 2026, 'OUT', { feriados: FER }); return f.semReal.join() === 'MAR' && f.planoAcum === 305937 - 25468; })());
afirma('referência em DEZ: zero dia restante', U.fechamentoAno(ANO, 2026, 'DEZ', { feriados: FER }).diasRestantes === 0);

sec('Veredito do ano: volume no título, jornada normal no alerta');
const V = U.vereditoAno(F);
const texto = (V.frase + ' ' + (V.alerta ? V.alerta.texto : '')).replace(/<[^>]+>/g, '');
afirma('título pelo volume (ritmo com HE × exigido para fechar)', /FECHA|NÃO FECHA/.test(V.titulo) && V.pctRot.indexOf('com hora extra') >= 0);
afirma('o −10,5% não é o título: vai no alerta de dependência', V.alerta !== null && /10,5% abaixo/.test(V.alerta.texto));
afirma('frase traz saldo, dias e o último dia de produção', /57\.819 pç em 33 dias úteis/.test(texto) && /até 18\/12/.test(texto));
afirma('frase traz o acumulado: 99,5%, −1.460', /99,5%/.test(texto) && /−1\.460 pç/.test(texto));
afirma('ritmo com HE abaixo do exigido em mais de 5% → NÃO FECHA', V.titulo === 'NÃO FECHA NO RITMO ATUAL' && V.pct < -5);
afirma('ano que já atingiu o plano', U.vereditoAno(Object.assign({}, F, { saldo: -10 })).titulo === 'PLANO DO ANO ATINGIDO');
afirma('folga ≥ 0 → FECHA, com a decisão sobre a hora extra se a jornada normal está abaixo',
  (() => { const v = U.vereditoAno(Object.assign({}, F, { folgaFechar: 2 })); return v.titulo === 'FECHA O ANO NO RITMO ATUAL' && /hora extra/.test(v.acao); })());
afirma('sem plano: sem base, sem título inventado', U.vereditoAno(U.fechamentoAno([], 2026, 'OUT', {})).titulo === 'SEM BASE PARA RESPONDER');

sec('OUT/26 — bases de horas, absenteísmo, hora extra e capacidade');
/* Referência: normais 14.758 h, extras 848,1 h, faltas + atrasos 1.277,4 h
   (afastamento 334 + falta s/ justificativa 418 + atraso 49 + atestado 476),
   carga do ponto 15.180 h, produção 30.478, previsão 34.810, 96 diretos com 5
   desligados no mês. */
const OUT = U.normalizar({ mes:'OUT', ano:2026, colaboradores:96, horasCarga:15180, horasNormais:14758,
  extra50:678.5, extra100:169.6, ausAfastado:334, ausFalta:418, ausAtraso:49, ausAtestado:476,
  producaoReal:30478, previsaoProducao:34810, diasTrabalhados:21, desligadosPonto:5, desligadosForaPonto:0 });
const P = U.periodo([OUT]);
ok('horas previstas = normais + faltas + atrasos', P.hPrevistas, 16035, 0.5);
ok('absenteísmo = 1.277 ÷ 16.035 (era 8,66% sobre as normais)', OUT.absenteismo, 7.97);
ok('absenteísmo do período = o do mês', P.absenteismo, 7.97);
ok('motivos somam o absenteísmo do card', U.absMotivos([OUT]).total, P.absenteismo);
ok('HE sobre horas normais = 848,1 ÷ 14.758 (meta 8%)', P.heNormais, 5.75);
ok('HE sobre horas totais = 848,1 ÷ 15.606 (outro indicador)', P.pctExtras, 5.43);
ok('produção em jornada normal (regra mantida)', OUT.prodSemExtras, 28727, 0);
const C = U.capacidadeNormal([OUT], 6);
ok('peças por hora normal = 28.727 ÷ 14.758', C.ritmoNormal, 28727 / 14758, 0.0001);
ok('horas perdidas acima da meta = 1.277 − 6% × 16.035', C.hAcimaMeta, 1277 - 0.06 * 16035, 0.5);
ok('capacidade da jornada normal com absenteísmo na meta', C.capacidade, 29340, 1);
ok('gap previsão − capacidade', C.gap, 5470, 1);
ok('recuperável com absenteísmo na meta (faltas + atrasos 1.277 h, arredondado pelo normalizar)', C.recuperavel, 613, 1);
ok('identidade: (previsão − normal) − recuperável = gap (a frase da Reunião)', (34810 - 28727) - C.recuperavel, C.gap, 0.01);
afirma('absenteísmo abaixo da meta: capacidade = produção normal, nada a recuperar',
  (() => { const c = U.capacidadeNormal([OUT], 10); return Math.abs(c.capacidade - 28727) < 0.5 && c.recuperavel === 0; })());
afirma('a capacidade antiga (campo meta) era 29.631 e não é mais usada pelos relatórios', OUT.meta === 29631);

sec('Quadro, carteira e ticket');
ok('ativos no fim do mês = 96 diretos − 5 desligados', U.ativosFim(OUT), 91, 0);
afirma('mês sem a contagem de desligados → null, não adivinha', U.ativosFim({ colaboradores: 93 }) === null);
afirma('mês com desligados fora do extrato → os diretos já são os ativos', U.ativosFim({ colaboradores: 93, desligadosPonto: 0, desligadosForaPonto: 5 }) === 93);
const VEND = [
  { mes:'DEZ', ano:2025, qtdeVendida:20000, qtdeFaturado:3995 },
  { mes:'SET', ano:2026, qtdeVendida:200000, qtdeFaturado:180000, producaoReal:180000 },
  { mes:'OUT', ano:2026, qtdeVendida:146395, qtdeFaturado:130866, producaoReal:124477 }
];
const CB = U.carteiraAno(VEND, 2026, 'OUT');
ok('vendido − faturado no ano = 346.395 − 310.866', CB.saldo, 35529, 0);
ok('desde o início da série (carteira a faturar da Reunião)', CB.saldoSerie, 51534, 0);
ok('conciliação: o que veio de antes do ano', CB.anteriorAoAno, 16005, 0);
ok('estoque consumido = faturado 310.866 − produzido 304.477', CB.estoqueConsumido, 6389, 0);
ok('carteira vendida vs plano = 346.395 ÷ 305.937 − 1 (era "12% maior")', (346395 / 305937 - 1) * 100, 13.22);
const TK = U.ticketComparar([
  { mes:'OUT', ano:2025, ticketMedio:282.84, qtdeFaturado:1, producaoReal:1 },
  { mes:'SET', ano:2026, ticketMedio:229.64, qtdeFaturado:100, producaoReal:1 },
  { mes:'OUT', ano:2026, ticketMedio:254.11, qtdeFaturado:100, producaoReal:1 }
], 2026, 'OUT');
ok('ticket vs mesmo mês do ano anterior (OUT/25 R$ 282,84)', TK.vsLy, -10.16);
ok('ticket do ano = receita ÷ peças faturadas', TK.mediaAno, (229.64 + 254.11) / 2, 0.001);
afirma('sem ticket no mês → null', U.ticketComparar([{ mes:'OUT', ano:2026 }], 2026, 'OUT') === null);

sec('Os dois relatórios usam as mesmas funções');
afirma('Reunião: fechamento, veredito e capacidade pelo DashUtils',
  /DashUtils\.fechamentoAno\(todos, ano, rMes\.mes/.test(HTML) && /var VA = DashUtils\.vereditoAno\(FA\)/.test(HTML)
  && /DashUtils\.capacidadeNormal\(anoTodo\?fechados:\[rMes\], META_ABS_\)/.test(HTML));
afirma('Briefing: fechamento, veredito, capacidade e carteira pelo DashUtils',
  /var FB=DashUtils\.fechamentoAno\(dados, a\.ano, a\.mes/.test(HTML) && /var VB=DashUtils\.vereditoAno\(FB\)/.test(HTML)
  && /DashUtils\.capacidadeNormal\(\[a\], META_ABS\)/.test(HTML) && /DashUtils\.carteiraAno\(dados, a\.ano, a\.mes\)/.test(HTML));
afirma('Briefing lê os dados normalizados (load), não o dash_v3 cru', /var dados=\(typeof load==='function'\)\?load\(\)/.test(HTML));
afirma('nenhuma tabela fixa de dias úteis no Briefing (pmDiasPlan)', HTML.indexOf('var pmDiasPlan=') < 0);
afirma('Mestre: veredito pelo DashUtils', /var VPM=DashUtils\.vereditoAno\(FPM\)/.test(HTML));
afirma('sem SWOT nos relatórios', HTML.indexOf('gerarSWOT') < 0 && HTML.indexOf('Análise SWOT') < 0);
afirma('"sustentada na jornada normal" não existe mais como texto fixo', HTML.indexOf('Entrega sustentada na jornada normal') < 0);
afirma('"relativamente estável/em recuperação" saiu do texto', HTML.indexOf("analise = 'Ticket médio relativamente estável") < 0);

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
