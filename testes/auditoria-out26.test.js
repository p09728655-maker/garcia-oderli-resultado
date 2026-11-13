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

sec('b96.100: ritmo atual = últimos 3 meses; venda contra o plano');
afirma('meses do ritmo atual: AGO, SET e OUT', F.mesesRecente.join() === 'AGO,SET,OUT');
ok('ritmo atual = (32.364 + 37.948 + 30.478) ÷ 63 dias', F.ritmoRecente, 100790 / 63);
ok('folga para fechar pelo ritmo atual (era −14,8% pela média do ano)', F.folgaFechar, (100790 / 63) / (57819 / 33) * 100 - 100);
ok('a do ano continua em folgaAno', F.folgaAno, (F.realAcum / F.diasAcum) / (57819 / 33) * 100 - 100);
afirma('o título diz de que meses é o ritmo, com hora extra', V.pctRot === 'ritmo de AGO a OUT com hora extra vs exigido para fechar');
afirma('a frase traz o ritmo atual e o do ano entre parênteses', /o ritmo de AGO a OUT com hora extra é 1\.600 pç\/dia \(no ano, /.test(texto));
/* Venda real de 2026 (HISTORICO, qtdeVendida): 346.395 pç, 13,2% acima do plano 305.937 */
const VENDA26 = [36734, 14063, 52435, 40059, 26770, 41709, 21956, 35758, 38698, 38213, 0, 0];
const ANOV = ANO.map((r, i) => Object.assign({}, r, { qtdeVendida: VENDA26[i] }));
const FV = U.fechamentoAno(ANOV, 2026, 'OUT', { feriados: FER, diaFim: 18 });
ok('venda contra o plano: 346.395 ÷ 305.937', FV.pctVenda, (346395 / 305937 - 1) * 100);
afirma('sem venda lançada → null, nunca 0', F.pctVenda === null);
const VV = U.vereditoAno(FV);
afirma('com a venda acima do plano a decisão é PRAZO, não plano (curta: a venda está no Por quê)', /prazos de entrega/.test(VV.acao) && !/repactuar o plano/.test(VV.acao) && VV.acao.length < 120);
afirma('e a frase diz a venda', /Venda do ano: 13,2% acima do plano/.test(VV.frase.replace(/<[^>]+>/g, '')));
afirma('sem a venda, a decisão de antes', /repactuar o plano com a área comercial/.test(V.acao));
afirma('mês em que a venda não foi lançada não entra na conta da venda', (() => {
  const x = ANOV.map(r => r.mes === 'OUT' ? Object.assign({}, r, { qtdeVendida: 0 }) : r);
  const f = U.fechamentoAno(x, 2026, 'OUT', { feriados: FER });
  return Math.abs(f.pctVenda - ((346395 - 38213) / (305937 - 34810) - 1) * 100) < 0.01; })());
sec('b96.101: Fechamos o ano? — precisa × fazemos, por quê, decisão');
afirma('as duas barras são a conta do título, na mesma régua',
  /barraQ1\('Precisa','para fechar o ano',FA\.ritmoExigido/.test(HTML) && /barraQ1\('Fazemos',[\s\S]{0,120}FA\.ritmoAtual,corF\(FA\.folgaFechar\)\)/.test(HTML)
  && /escQ1=Math\.max\(FA\.ritmoExigido\|\|0,FA\.ritmoAtual\|\|0\)/.test(HTML));
afirma('as 4 barras com exigidos diferentes saíram', !/linhasRit/.test(HTML));
afirma('Por quê: acumulado, sem hora extra e venda, uma frase cada',
  /t:'Até '\+refAno\+': <b>'/.test(HTML) && /t:'Sem hora extra: <b>'/.test(HTML) && /t:'Venda: <b>'/.test(HTML));
afirma('a base da conta fica recolhida', /<summary style="cursor:pointer">Como a conta sai<\/summary>/.test(HTML));
afirma('Apresentar: a fala é curta, precisa × fazemos', /\. Precisa '\+fi\(FA\.ritmoExigido\)\+' pç\/dia, fazemos '\+fi\(FA\.ritmoAtual\)/.test(HTML));
afirma('Reunião: vendido − faturado não se chama carteira e diz que não é a do ERP',
  /card\('Vendido − faturado'/.test(HTML) && /não é a carteira do ERP<br>/.test(HTML) && !/b3\+=card\('Carteira a faturar'/.test(HTML));

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

sec('b96.102: a meta de absenteísmo vem da aba METAS (tela Pessoas dizia 3%)');
afirma('linha do gráfico na META_ABS', /var ylim=yP\(META_ABS\)/.test(HTML) && HTML.indexOf('var ylim=yP(3)') < 0);
afirma('cor das barras pela META_ABS e ABS_ATENCAO', /var cor=v>ABS_ATENCAO\?C\.red:v>META_ABS\?C\.amber:C\.green/.test(HTML));
afirma('nenhum "3%" fixo de absenteísmo sobrou', !/Meses acima 3%|Limite 3%|limite ≤ 3%|Meta: ≤ 3%|meta de 3%|absenteismo>3;|abs<=3\?|ab<=3\?|absM > 3\)|≤ 3,0 %/.test(HTML));
afirma('rótulos fixos levam a meta num span pintado pela aba METAS',
  (HTML.match(/class="metaAbsTxt"/g) || []).length === 5 && /function _pintarMetaAbs\(\)/.test(HTML)
  && (HTML.match(/_pintarMetaAbs\(\);/g) || []).length === 2);

sec('b96.103: fila de pedidos pela carteira do ERP (NOV/26: 44.000 − 16.833)');
const ERP = [
  { mes:'OUT', ano:2026, producaoReal:30478 },
  { mes:'NOV', ano:2026, carteiraERP:44000, estoqueERP:16833 }
];
const FL = U.filaERP(ERP, 2026, 'OUT', 1600, 14);
afirma('Reunião de OUT sem retrato de OUT: usa o do mês seguinte (NOV/26)', FL && FL.mes === 'NOV' && FL.ano === 2026);
ok('fila = carteira − estoque', FL.fila, 27167, 0);
ok('dias úteis = 27.167 ÷ 1.600', FL.diasUteis, 16.98, 0.01);
ok('dias corridos ≈ úteis × 7/5', FL.diasCorridos, 23.77, 0.01);
ok('acima do prazo: 27.167 − 14 × 5/7 × 1.600', FL.excesso, 11167, 0);
afirma('23,8 dias > 1,5 × 14 → crítico', FL.cor === 'critico');
afirma('dentro do prazo → ok', U.filaERP([{ mes:'NOV', ano:2026, carteiraERP:20000, estoqueERP:5000 }], 2026, 'NOV', 1600, 14).cor === 'ok');
afirma('sem carteira digitada → null (volta ao vendido − faturado)', U.filaERP([{ mes:'NOV', ano:2026, estoqueERP:5000 }], 2026, 'NOV', 1600, 14) === null);
afirma('estoque maior que a carteira → fila 0, nunca negativa', U.filaERP([{ mes:'NOV', ano:2026, carteiraERP:1000, estoqueERP:5000 }], 2026, 'NOV', 1600, 14).fila === 0);
afirma('retrato do próprio corte vence o do mês seguinte',
  U.filaERP([{ mes:'OUT', ano:2026, carteiraERP:30000 }, { mes:'NOV', ano:2026, carteiraERP:44000 }], 2026, 'OUT', 1600, 14).mes === 'OUT');
afirma('período passado (2025, SET/26) não pega o retrato de NOV/26: volta ao vendido − faturado',
  U.filaERP(ERP, 2025, 'DEZ', 1533, 30) === null && U.filaERP(ERP, 2026, 'SET', 1600, 30) === null);
afirma('DEZ olha JAN do ano seguinte', U.filaERP([{ mes:'JAN', ano:2027, carteiraERP:40000 }], 2026, 'DEZ', 1600, 30).mes === 'JAN');
afirma('sem estoque digitado: avisa', U.filaERP([{ mes:'NOV', ano:2026, carteiraERP:44000 }], 2026, 'NOV', 1600, 14).semEstoque === true);
afirma('Reunião e Produção & Vendas usam o filaERP com o ritmo da pergunta 1',
  (HTML.match(/DashUtils\.filaERP\(todos, [^)]*FA\.ritmoAtual/g) || []).length === 2);
afirma('o painel nunca grava carteiraERP e estoqueERP', /var _SO_PLANILHA = \[[^\]]*'carteiraERP', 'estoqueERP'\]/.test(HTML));
const GS = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
afirma('Code.gs protege as duas colunas', /'carteiraerp', 'estoqueerp'\]/.test(GS));
afirma('PRAZO_ENTREGA é meta aceita (painel e Code.gs)',
  /'PRAZO_ENTREGA',/.test(HTML) && /\['PRAZO_ENTREGA', 30,/.test(GS) && /var PRAZO_ENTREGA = 30;/.test(HTML));
const FL30 = U.filaERP(ERP, 2026, 'OUT', 1600, 30);
afirma('prazo prometido 30: 23,8 dias está dentro (verde, nada acima)', FL30.cor === 'ok' && FL30.excesso === 0);

sec('b96.104: aviso de capacidade × venda (dados reais JAN–OUT/26, fila NOV/26)');
const CAP26 = [['JAN',22437,19261,17,36734],['FEV',28151,23526,20,14063],['MAR',27600,26635,22,52435],['ABR',29195,26125,19,40059],
  ['MAI',33330,28932,20,26770],['JUN',30851,27444,20,41709],['JUL',32123,28226,23,21956],['AGO',32364,29703,21,35758],
  ['SET',37948,35126,21,38698],['OUT',30478,28727,21,38213]].map(x => ({ mes:x[0], ano:2026, producaoReal:x[1], prodSemExtras:x[2], diasTrabalhados:x[3], qtdeVendida:x[4] }));
const AV = U.avisoCapacidade(CAP26, 2026, 'OUT', { limiteHE:8, prazo:30, antecedencia:30, fila:{ fila:27167 } });
ok('demanda = venda MAI–OUT ÷ dias (6 meses)', AV.demanda, 203104 / 126, 0.01);
ok('sem hora extra AGO–OUT', AV.semHE, 93556 / 63, 0.01);
ok('hora extra necessária = 1 − sem HE ÷ demanda (a base do prodSemExtras)', AV.heNec, 7.87, 0.01);
afirma('7,9% fica dentro do limite de 8% (era 8,5% com demanda ÷ semHE − 1)', AV.heAcima === false);
ok('prova: a produção real de OUT/26 dá a HE do mês pela mesma conta (848 h ÷ 14.758 h = 5,75%)', (1 - 28727 / 30478) * 100, 5.75, 0.01);
ok('fila sobe ~2,5 dias úteis por mês (venda 1.788 − produção 1.600)', AV.crescMes, 2.48, 0.01);
ok('fila hoje em dias úteis', AV.filaDias, 16.98, 0.01);
ok('sem calendário: prazo 30 corridos ≈ 21,4 úteis; passa em ~37,7 dias úteis', AV.diasAte, 37.7, 0.1);
afirma('dentro de 2× a antecedência de 30 → PREPARAR', AV.nivel === 'preparar');
const AT = U.avisoCapacidadeTexto(AV);
afirma('texto: rótulo e prazo para decidir', AT.rotulo === 'PREPARAR' && /Decidir o aumento em até 16 dias úteis/.test(AT.acao));
afirma('texto diz o período de cada número', /Venda MAI–OUT/.test(AT.linhas[0]) && /Sem hora extra AGO–OUT/.test(AT.linhas[1]) && /AGO–OUT: venda 1\.788 × produção 1\.600/.test(AT.linhas[2]));
afirma('texto curto: 4 linhas', AT.linhas.length === 4 && AT.linhas.every(l => l.length <= 90));
const SET0 = CAP26.map(r => r.mes === 'SET' ? Object.assign({}, r, { prodSemExtras: 0 }) : r);
const AVsb = U.avisoCapacidade(SET0, 2026, 'OUT', { limiteHE:8, prazo:30, antecedencia:30 });
afirma('sem a produção sem HE de SET e sem fila → SEM BASE, nunca OK verde', AVsb.nivel === 'sembase' && U.avisoCapacidadeTexto(AVsb).status === 'sembase'
  && /falta a produção sem hora extra de SET\/26/.test(U.avisoCapacidadeTexto(AVsb).linhas.join(' ')));
const CAL = U.calendarioEntrega('2026-11-13', 16.98, 30, [{ data:'2026-11-20' }], 18);
afirma('calendário: 17 dias úteis de 13/11 terminam em 09/12 (pula 20/11)', CAL.data === '2026-12-09' && CAL.corridos === 26);
afirma('calendário: 30 dias corridos a partir de 13/11 (sex) = 19 dias úteis de produção (14/11 a 13/12, sem 20/11)', CAL.uteisPrazo === 19);
afirma('calendário: produção vai até 18/12; 10 úteis de 10/12 caem em JAN',
  U.calendarioEntrega('2026-12-10', 10, 0, [{ data:'2027-01-01' }], 18).data === '2027-01-07');
const FLc = U.filaERP(ERP, 2026, 'OUT', 1600, 30, { hoje:'2026-11-13', feriados:[{ data:'2026-11-20' }], diaFim:18 });
afirma('fila de NOV com calendário: 17 dias úteis, termina 09/12, prazo 30 = 19 úteis, dentro', Math.round(FLc.diasUteis) === 17 && FLc.dataEntrega === '2026-12-09' && FLc.uteisPrazo === 19 && FLc.cor === 'ok');
const AVc = U.avisoCapacidade(CAP26, 2026, 'OUT', { limiteHE:8, prazo:30, antecedencia:30, fila:FLc });
afirma('aviso com calendário: o prazo encolhe no recesso; a fila estoura em ~7 dias úteis (25/11, prazo 17), não em 17',
  AVc.diasAte === 7 && AVc.dataEstoura === '2026-11-25' && AVc.prazoNaData === 17 && AVc.antUteis === 19);
afirma('hoje: a fila estouraria também sem crescer (26/11) e a janela pega o recesso → causa recesso, PREPARAR, ajustar o prazo',
  AVc.causa === 'recesso' && AVc.nivel === 'preparar' && /ajustar o prazo prometido/.test(U.avisoCapacidadeTexto(AVc).acao));
afirma('o texto diz a partir de quando o pedido só fica pronto em janeiro (25/11)',
  /pedido a partir de 25\/11 só fica pronto em janeiro \(recesso\)/.test(U.avisoCapacidadeTexto(AVc).linhas.join(' ')));
const FER26 = [{ data:'2026-11-20' }];
function avCaso(base, snap, carteira, hoje, corte) {
  const D = base.concat([{ mes:snap, ano:2026, carteiraERP:carteira, estoqueERP:0 }]);
  const cal = { hoje:hoje, feriados:FER26, diaFim:18 };
  return U.avisoCapacidade(D, 2026, corte, { limiteHE:8, prazo:30, antecedencia:30, fila:U.filaERP(D, 2026, corte, 1600, 30, cal) });
}
const ESTv = CAP26.map(r => Object.assign({}, r, { qtdeVendida: r.producaoReal }));
const A1103 = avCaso(ESTv.filter(r => ['JAN','FEV','MAR'].indexOf(r.mes) >= 0), 'MAR', 20.2 * 1600, '2026-03-11', 'MAR');
afirma('11/03, fila 20,2 estável: o prazo oscila pelo dia da semana → limite, nunca "recesso"/"janeiro"',
  A1103.causa === 'limite' && A1103.nivel === 'preparar' && !/janeiro|Recesso/.test(U.avisoCapacidadeTexto(A1103).linhas.join(' ') + U.avisoCapacidadeTexto(A1103).acao));
const A1510 = avCaso(ESTv.filter(r => ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET'].indexOf(r.mes) >= 0), 'OUT', 15 * 1600, '2026-10-15', 'SET');
afirma('15/10, fila 15 estável: estouro só pelo recesso (03/12) → ação de prazo, não "decidir o aumento"',
  A1510.causa === 'recesso' && !/Decidir o aumento/.test(U.avisoCapacidadeTexto(A1510).acao));
const A0712 = avCaso(CAP26, 'NOV', 36000 - 16833, '2026-12-07', 'NOV');
afirma('retrato de NOV visto em 07/12: a fila anda até hoje e nenhuma data fica no passado',
  A0712.filaRetrato === '2026-11-30' && (A0712.dataEstoura === null || A0712.dataEstoura >= '2026-12-07')
  && /levado a hoje/.test(U.avisoCapacidadeTexto(A0712).linhas.join(' ')));
afirma('já passou só por causa do recesso → PREPARAR com ação de prazo, não AUMENTAR AGORA', A0712.nivel === 'preparar' && A0712.causa === 'recesso');
const EST = CAP26.map(r => ['AGO','SET','OUT'].indexOf(r.mes) >= 0 ? Object.assign({}, r, { qtdeVendida: r.producaoReal }) : r).concat([{ mes:'NOV', ano:2026, carteiraERP:44000, estoqueERP:16833 }]);
const AVe = U.avisoCapacidade(EST, 2026, 'OUT', { limiteHE:8, prazo:30, antecedencia:30,
  fila: U.filaERP(EST, 2026, 'OUT', 1600, 30, { hoje:'2026-11-13', feriados:[{ data:'2026-11-20' }], diaFim:18 }) });
afirma('venda = produção: não dá OK verde; estoura em 26/11 pelo recesso → PREPARAR, ajustar o prazo',
  AVe.nivel === 'preparar' && AVe.causa === 'recesso' && AVe.dataEstoura === '2026-11-26' && /ajustar o prazo prometido/.test(U.avisoCapacidadeTexto(AVe).acao));
afirma('retrato de mês passado parte do fim daquele mês (31/10 + 10 úteis = 13/11)', U.filaERP([{ mes:'OUT', ano:2026, carteiraERP:16000, estoqueERP:0 }], 2026, 'OUT', 1600, 30, { hoje:'2026-11-13', feriados:[], diaFim:18 }).dataEntrega === '2026-11-13');
const AV60 = U.avisoCapacidade(CAP26, 2026, 'OUT', { limiteHE:8, prazo:30, antecedencia:60, fila:{ fila:27167 } });
afirma('antecedência 60: passa dentro dela, mas a fila só cresce há um mês (SET caiu) → PREPARAR, confirmar',
  AV60.nivel === 'preparar' && AV60.confirmar === true);
afirma('fila já acima do prazo (25 úteis > 21,4) → AUMENTAR AGORA',
  U.avisoCapacidade(CAP26, 2026, 'OUT', { limiteHE:8, prazo:30, antecedencia:30, fila:{ fila:40000 } }).nivel === 'aumentar');
const AVsem = U.avisoCapacidade(CAP26, 2026, 'OUT', { limiteHE:10, prazo:30, antecedencia:30 });
afirma('sem carteira do ERP e HE dentro do limite → OK, diz que a fila não foi avaliada',
  AVsem.nivel === 'ok' && /fila não avaliada/.test(U.avisoCapacidadeTexto(AVsem).linhas.join(' ')));
afirma('menos de 3 meses de venda → null', U.avisoCapacidade(CAP26.slice(0, 2), 2026, 'FEV', {}) === null);
afirma('Reunião, Briefing e Visão Geral usam o mesmo aviso',
  (HTML.match(/DashUtils\.avisoCapacidade\(/g) || []).length === 3 && (HTML.match(/DashUtils\.avisoCapacidadeTexto\(/g) || []).length === 3);
afirma('ANTECEDENCIA_CAP é meta aceita (painel e Code.gs)', /'ANTECEDENCIA_CAP'\]/.test(HTML) && /\['ANTECEDENCIA_CAP', 30,/.test(GS));

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
