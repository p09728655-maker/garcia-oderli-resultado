/* ══════════════════════════════════════════════════════════════════════════
   Teste da base de cálculo de produção — DashUtils.periodo()

   Rode com:  node testes/base-producao.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   O painel é um HTML único de 1 MB sem build e sem teste. A conta que decide
   o que a diretoria vê estava errada de três formas ao mesmo tempo:
     • produção COM hora extra comparada contra `meta`, que é calculada sobre
       horas normais — semáforo verde em 18 de 18 meses;
     • absenteísmo dividido por horasCarga quando a planilha usa horasNormais
       — erro de 0,23 a 0,74 p.p. por mês;
     • percentuais tirados por média aritmética entre meses de 15 e de 23 dias.
   Nenhuma dessas três dá erro de sintaxe, e nenhuma aparece na tela como
   defeito: aparece como número plausível. Só teste pega.

   O teste lê DashUtils e o dataset do próprio index.html — não há cópia dos
   dados aqui para sair de sincronia.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ── Extrai DashUtils do index.html e avalia num escopo isolado ── */
function carregarDashUtils() {
  const ini = HTML.indexOf('window.DashUtils = (function()');
  const fim = HTML.indexOf('function sortD(d){', ini);
  if (ini < 0 || fim < 0) throw new Error('DashUtils não encontrado no index.html');
  const escopo = { window: {} };
  new Function('window', HTML.slice(ini, fim)).call(escopo, escopo.window);
  return escopo.window.DashUtils;
}

/* ── Extrai o dataset embutido (var PLANILHA = [...]) ── */
function carregarPlanilha() {
  const m = HTML.match(/var\s+PLANILHA\s*=\s*(\[[\s\S]*?\n\];)/);
  if (!m) throw new Error('PLANILHA não encontrada no index.html');
  return JSON.parse(m[1].replace(/;\s*$/, ''));
}

const U = carregarDashUtils();
const TODOS = carregarPlanilha();
const REGS = TODOS.filter(r => r.producaoReal > 0);

let falhas = 0, total = 0;
function ok(nome, obtido, esperado, tol = 0.01) {
  total++;
  const bom = Math.abs(obtido - esperado) <= tol;
  if (!bom) falhas++;
  console.log(`  ${bom ? 'ok  ' : 'FALHA'} ${nome.padEnd(46)} ${(+obtido).toFixed(2).padStart(12)} (esperado ${(+esperado).toFixed(2)})`);
}
function afirma(nome, cond) {
  total++;
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`);
}
const sec = t => console.log('\n' + t);

/* ══ Identidades da planilha — se quebrarem, o dado de origem mudou ══ */
sec('Identidades do dataset (18 meses fechados)');
const quebra = (f) => REGS.filter(r => Math.abs(f(r)) > 0.5).map(r => `${r.mes}/${r.ano}`);
afirma('horasTotais = horasNormais + totalExtras',
  quebra(r => r.horasTotais - (r.horasNormais + r.totalExtras)).length === 0);
afirma('totalExtras = extra50 + extra100',
  quebra(r => r.totalExtras - (r.extra50 + r.extra100)).length === 0);
afirma('totalFaltaAtraso = faltas + atraso',
  quebra(r => r.totalFaltaAtraso - (r.faltas + r.atraso)).length === 0);
afirma('prodSemExtras <= producaoReal',
  REGS.every(r => r.prodSemExtras <= r.producaoReal));
afirma('absenteismo = totalFaltaAtraso / horasNormais  (NAO / horasCarga)',
  REGS.every(r => Math.abs(r.absenteismo - r.totalFaltaAtraso / r.horasNormais * 100) <= 0.02));
afirma('eficiencia = prodSemExtras / meta',
  REGS.every(r => !r.meta || Math.abs(r.eficiencia - r.prodSemExtras / r.meta * 100) <= 0.02));

/* A `meta` da planilha é derivada do próprio realizado. Enquanto isso for
   verdade, nenhum indicador pode usá-la como se fosse capacidade. Se este
   teste passar a falhar, a planilha mudou de método — e aí `meta` volta a
   valer como alvo. */
sec('meta é circular (derivada do realizado) — premissa do desenho da tela');
afirma('meta = producaoReal x (horasNormais / horasCarga), erro < 0,01%',
  REGS.every(r => Math.abs(r.meta - r.producaoReal * r.horasNormais / r.horasCarga) / r.meta * 100 < 0.01));
afirma('logo producaoReal >= meta em 18 de 18 meses (verde por construção)',
  REGS.filter(r => r.producaoReal >= r.meta).length === REGS.length);

/* ══ Agregado do período ══ */
sec('periodo() — 18 meses');
const o = U.periodo(TODOS);
ok('meses com produção',        o.mesesProd,   18, 0);
ok('produção COM extras',       o.comExtras, 556827, 0);
ok('produção SEM extras',       o.semExtras, 472441, 0);
ok('peças vindas de hora extra',o.deExtras,   84386, 0);
ok('dependência de hora extra %',o.depExtras, 15.15);
ok('absenteísmo ponderado %',   o.absenteismo, 12.10);
ok('% horas extras',            o.pctExtras,   12.68);
ok('ticket ponderado R$',       o.ticket,     247.69);
ok('ritmo hora normal pç/h',    o.ritmoNormal,  1.79);
ok('aderência ao plano %',      o.aderPlano,  101.79);
ok('gap vs demanda faturada',   o.gapDemanda, 91883, 0);

sec('periodo() — recortes');
ok('2026: meses',        U.periodo(TODOS.filter(r => r.ano === 2026)).mesesProd, 6, 0);
ok('2026: aderência plano %', U.periodo(TODOS.filter(r => r.ano === 2026)).aderPlano, 100.47);
const abr = U.periodo(TODOS.filter(r => r.ano === 2026 && r.mes === 'ABR'));
ok('ABR/26: prod c/ extras', abr.comExtras, 29195, 0);
ok('ABR/26: prod s/ extras', abr.semExtras, 26147, 0);
ok('ABR/26: aderência = eficiência da planilha', abr.aderencia, 92.26, 0.02);

sec('Bordas');
afirma('lista vazia não quebra',       U.periodo([]).mesesProd === 0);
afirma('null não quebra',              U.periodo(null).mesesProd === 0);
afirma('vazio devolve null, não NaN',  U.periodo([]).aderencia === null);
afirma('meses todos zerados não contam', U.periodo(TODOS.filter(r => r.producaoReal === 0)).mesesProd === 0);

/* Mês de fábrica parada: horas apontadas, produção zero. Tem de entrar no
   denominador das horas — se saísse, o absenteísmo melhoraria justamente no
   mês em que a fábrica parou. */
sec('Mês de fábrica parada entra nas horas, não na produção');
const parado = { mes:'XXX', ano:2099, producaoReal:0, prodSemExtras:0, meta:0,
  horasCarga:10000, horasNormais:9000, totalExtras:0, horasTotais:9000,
  totalFaltaAtraso:1000, qtdeFaturado:0, qtdeVendida:0, ticketMedio:0,
  colaboradores:0, diasTrabalhados:20, previsaoProducao:0 };
const cp = U.periodo(TODOS.concat([parado]));
ok('conta nos meses de horas',      cp.meses,     o.meses + 1, 0);
ok('não conta nos meses de produção',cp.mesesProd, o.mesesProd, 0);
ok('horas perdidas somam',          cp.hPerdidas, o.hPerdidas + 1000, 0.1);
ok('horas normais somam',           cp.hNormais,  o.hNormais + 9000, 0.1);
ok('produção não muda',             cp.comExtras, o.comExtras, 0);
afirma('absenteísmo reage ao mês parado, não o ignora', cp.absenteismo !== o.absenteismo);

/* getProd cai em producaoReal quando prodSemExtras falta — reintroduz em
   silêncio o bug que esta função existe para evitar. Tem de ser sinalizado. */
sec('Sinalização de base "sem extras" ausente');
const semCol = REGS.map(r => Object.assign({}, r, { prodSemExtras: 0 }));
const sc = U.periodo(semCol);
ok('detecta os 18 meses sem base', sc.semBase, 18, 0);
afirma('e nesse caso semExtras vira comExtras (o risco sinalizado)',
  sc.semExtras === sc.comExtras);

/* ══ PORTÃO DE SANIDADE DA IMPORTAÇÃO ══
   Reproduz as identidades que o importarExcel usa como gate. O que importa
   testar é que um DESLOCAMENTO DE COLUNA seja pego — o modo de falha que
   grava dado errado em silêncio e só aparece na reunião. */
sec('Portão de sanidade do import');
function reprova(r){
  var f=[];
  if (Math.abs((r.horasNormais + r.totalExtras) - r.horasTotais) > 1) f.push('horas');
  if (Math.abs((r.extra50 + r.extra100) - r.totalExtras) > 1)        f.push('extras');
  if (Math.abs((r.faltas + r.atraso) - r.totalFaltaAtraso) > 1)      f.push('faltaAtraso');
  if (r.prodSemExtras > 0 && r.prodSemExtras > r.producaoReal + 1)   f.push('prodSE>prodCE');
  if (r.diasTrabalhados < 0 || r.diasTrabalhados > 31)               f.push('dias');
  if (r.absenteismo < 0 || r.absenteismo > 60)                       f.push('absenteismo');
  if (r.ticketMedio < 0 || r.ticketMedio > 10000)                    f.push('ticket');
  if (r.custoCap < 0)                                                f.push('custoCap');
  return f;
}
afirma('planilha atual passa no portão (18/18)',
  REGS.every(r => reprova(r).length === 0));

/* Simula o cenário real: uma coluna inserida no meio da planilha. Tudo a
   partir dali roda uma casa. O bloco de horas, que é o único que alguém
   confere de olho, sai perfeito — por isso a validação tem de ser automática. */
const CAMPOS = ['colaboradores','horasCarga','faltas','atraso','totalFaltaAtraso',
  'absenteismo','horasNormais','extra50','extra100','totalExtras','horasTotais',
  '_x1','_x2','_x3','producaoReal','prodSemExtras','_x4','meta','_x5','eficiencia',
  'eficienciaAdj','margem','ticketMedio','custoCap','qtdeFaturado','diasTrabalhados'];
function deslocar(r, aPartirDe){
  const linha = CAMPOS.map(c => (c.startsWith('_') ? 0 : r[c]));
  linha.splice(aPartirDe, 0, 999);          /* insere uma coluna */
  const o = Object.assign({}, r);
  CAMPOS.forEach((c, i) => { if (!c.startsWith('_')) o[c] = linha[i] === undefined ? 0 : linha[i]; });
  return o;
}
const base = REGS[REGS.length - 1];
[3, 8, 12, 14, 18, 20].forEach(pos => {
  const d = deslocar(base, pos);
  const f = reprova(d);
  afirma(`coluna inserida na posição ${String(pos).padStart(2)} é detectada  [${f.join(',') || 'NENHUMA'}]`,
    f.length > 0);
});

/* ══ PLANO DE AÇÃO — card "Ações críticas" da Reunião ══
   Crítica = em aberto E (prioridade Vermelho OU prazo vencido). Concluída e
   Cancelada nunca contam. Status vazio é Aberta. Datas ISO comparam como
   texto — se alguém gravar dd/mm/aaaa, a comparação quebra em silêncio, por
   isso o Apps Script devolve Data como ISO. */
sec('acoesResumo() — ações críticas');
const HOJE = '2026-09-10';
const ACOES = [
  { id:'1', prioridade:'Vermelho', prazo:'2026-09-30', status:'Aberta' },        /* crítica: vermelha        */
  { id:'2', prioridade:'Amarelo',  prazo:'2026-09-01', status:'Em andamento' },  /* crítica: vencida         */
  { id:'3', prioridade:'Amarelo',  prazo:'2026-10-15', status:'Aberta' },        /* aberta, não crítica      */
  { id:'4', prioridade:'Vermelho', prazo:'2026-08-01', status:'Concluída' },     /* fechada: não conta       */
  { id:'5', prioridade:'Vermelho', prazo:'2026-08-01', status:'Cancelada' },     /* fechada: não conta       */
  { id:'6', prioridade:'Verde',    prazo:'',           status:'' },              /* aberta sem prazo         */
  { id:'7', prioridade:'Verde',    prazo:'2026-09-10', status:'Aberta' },        /* vence HOJE: não vencida  */
  { id:'8', prioridade:'Vermelho', prazo:'2026-01-01', status:'Excluída' },      /* apagada: não existe      */
];
const ra = U.acoesResumo(ACOES, HOJE);
ok('total',        ra.total,      7, 0);
ok('abertas',      ra.abertas,    5, 0);
ok('vencidas',     ra.vencidas,   1, 0);
ok('críticas',     ra.criticas,   2, 0);
ok('concluídas',   ra.concluidas, 1, 0);
ok('canceladas',   ra.canceladas, 1, 0);
afirma('lista vazia não quebra',   U.acoesResumo([], HOJE).criticas === 0);
afirma('null não quebra',          U.acoesResumo(null, HOJE).total === 0);
afirma('sem "hoje" ninguém vence', U.acoesResumo(ACOES, '').vencidas === 0);

/* ══ STATUS DA FÁBRICA — régua única para Resumo, PPCP e Visão Geral ══ */
sec('statusFabrica() e demanda()');
afirma('demanda: vendido primeiro',          U.demanda({qtdeVendida:100, qtdeFaturado:80, producaoReal:70}) === 100);
afirma('demanda: sem vendido usa faturado',  U.demanda({qtdeVendida:0,   qtdeFaturado:80, producaoReal:70}) === 80);
afirma('demanda: sem ambos usa produção',    U.demanda({producaoReal:70}) === 70);
afirma('gap ≤ 0 → ok',                       U.statusFabrica(100, 100).nivel === 'ok');
afirma('gap 10% → atenção',                  U.statusFabrica(100, 90).nivel === 'atencao');
afirma('gap 10,1% → sobrecarga',             U.statusFabrica(1000, 899).nivel === 'sobrecarga');
afirma('demanda zero não quebra',            U.statusFabrica(0, 50).nivel === 'ok');
ok('funcNecessarios 1.000/dia a 40 pç/colab', U.funcNecessarios(1000, 800, 20), 25, 0);
afirma('funcNecessarios sem produção devolve colabs', U.funcNecessarios(1000, 0, 20) === 20);

/* ══ INTEGRIDADE DOS DADOS — a conferência que faltou em SET/26 ══
   Cada caso reproduz um erro real que passou por três pessoas e uma revisão:
   JUN/26 (derivadas de outra produção), JUL/26 (horas totais digitadas
   erradas no Sheets), AGO/26 (margem trocada), AGO/26 (previsão da HISTORICO
   diferente do Plano Mestre), JAN/26 (produção igual ao faturado). */
sec('integridade() — conferência automática');
const AGO26 = { mes:'AGO', ano:2026, colaboradores:95, horasCarga:14907, faltas:2050, atraso:0,
  totalFaltaAtraso:2050, absenteismo:14.12, horasNormais:14514, extra50:1182, extra100:11.17,
  totalExtras:1193.17, horasTotais:15707.17, producaoReal:32364, prodSemExtras:29703.41,
  meta:31510.77, eficiencia:94.26, margem:-4.74, qtdeFaturado:31192, produtosReportados:32364,
  previsaoProducao:30800, planoNaHistorico:30800 };
const caso = (extra) => U.integridade([Object.assign({}, AGO26, extra)]);
const tipos = (I) => I.itens.map(i => i.nivel + ':' + i.tipo).sort().join(',');
afirma('AGO/26 consistente: nenhum item, nível ok',    caso({}).itens.length === 0 && caso({}).nivel === 'ok');
afirma('JUL/26 horas totais 18.222 (certo 18.822) → planilha desatualizada (horas)',
  tipos(caso({ horasNormais:16871, totalExtras:1951, extra50:1627, extra100:324, horasTotais:18222,
               faltas:1897, totalFaltaAtraso:1897, absenteismo:11.24, horasCarga:17284,
               producaoReal:33291, prodSemExtras:29441.15, meta:32495.51, eficiencia:90.60, margem:-0.67,
               qtdeFaturado:33658, produtosReportados:33291 })) === 'atencao:horas');
const JUN = caso({ mes:'JUN', horasNormais:14388, horasCarga:14792, totalExtras:1589, extra50:1545, extra100:44,
  horasTotais:15977, faltas:1532, totalFaltaAtraso:1532, absenteismo:10.65, producaoReal:30851,
  prodSemExtras:27088, meta:29619, eficiencia:91.45, margem:-1.62, qtdeFaturado:30451, produtosReportados:30851 });
afirma('JUN/26 produção do ERP + derivadas de 30.451 → 2 planilha desatualizada', tipos(JUN) === 'atencao:derivada,atencao:derivada');
afirma('JUN/26 nível atenção (o painel refaz a conta)',    JUN.nivel === 'atencao' && JUN.erros === 0 && JUN.atencoes === 2);
afirma('AGO/26 margem -4,47 (certo -4,74) → planilha desatualizada', tipos(caso({ margem:-4.47 })) === 'atencao:derivada');
afirma('mês com produção e sem horas normais → erro de entrada', tipos(caso({ horasNormais:0, horasTotais:0, absenteismo:0, prodSemExtras:0, meta:0, eficiencia:0, margem:0 })).indexOf('erro:entrada') === 0);
afirma('faltas maiores que as horas normais → erro de entrada', tipos(caso({ faltas:20000, totalFaltaAtraso:20000, absenteismo:0, margem:0 })).indexOf('erro:entrada') >= 0);
afirma('AGO/26 previsão 32.435 na HISTORICO → nota plano (não pinta a barra)', tipos(caso({ planoNaHistorico:32435 })) === 'info:plano');
afirma('nota plano não conta como atenção: nível ok, 1 nota',
  (() => { const I = caso({ planoNaHistorico:32435 }); return I.nivel === 'ok' && I.atencoes === 0 && I.notas === 1 && I.mesesComItem === 0; })());
afirma('JAN/26 produção igual ao faturado → atenção cópia', tipos(caso({ qtdeFaturado:32364 })) === 'atencao:copia');
afirma('produção 8% abaixo do reporte do ERP → atenção erp', tipos(caso({ produtosReportados:35000 })) === 'atencao:erp');
afirma('diferença de 0,5% contra o ERP não acusa',       caso({ produtosReportados:32500 }).itens.length === 0);
afirma('sem produtosReportados nem planoNaHistorico não acusa', caso({ produtosReportados:0, planoNaHistorico:0 }).itens.length === 0);
afirma('mês aberto (producaoReal 0) é ignorado',         U.integridade([{ mes:'SET', ano:2026, producaoReal:0 }]).meses === 0);
afirma('null não quebra',                                U.integridade(null).nivel === 'ok');
/* O dataset embutido é um retrato antigo da planilha e carrega erros reais
   que a conferência tem de pegar: DEZ/25 com a margem digitada (-1,06 no
   lugar de 11,51 — a célula W14 do Excel era um número, não fórmula) e
   JAN, FEV e JUN/26 com a produção copiada do faturado (FEV e JUN já foram
   corrigidos na planilha viva; JAN segue a confirmar no ERP). */
const IE = U.integridade(REGS);
afirma('dataset embutido: nenhum erro de entrada; a margem de DEZ/25 é planilha desatualizada',
  IE.erros === 0 && IE.itens.filter(i => i.tipo === 'derivada').map(i => i.mes + '/' + i.ano).join(',') === 'DEZ/2025');
afirma('dataset embutido: produção = faturado em JAN, FEV e JUN/26',
  IE.itens.filter(i => i.tipo === 'copia').map(i => i.mes + '/' + i.ano).join(',') === 'JAN/2026,FEV/2026,JUN/2026');
afirma('dataset embutido: nenhuma soma de horas quebrada',
  IE.itens.filter(i => i.tipo === 'horas').length === 0);
afirma('contagem: meses conferidos e meses com item',
  (() => { const I = U.integridade([Object.assign({}, AGO26, { margem:-4.47 }), Object.assign({}, AGO26, { mes:'JUL' })]);
           return I.meses === 2 && I.mesesComItem === 1; })());

/* ══ FAIXA CONTRA UM LIMITE — a regra de redação da apresentação ══ */
sec('faixaLimite() — dentro / bem perto / acima');
afirma('8,0% com limite 8 → dentro',        U.faixaLimite(8.0, 8).nivel === 'dentro');
afirma('8,2% com limite 8 → bem perto',     U.faixaLimite(8.2, 8).nivel === 'perto' && U.faixaLimite(8.2, 8).texto === 'bem perto do limite de 8%');
afirma('8,8% com limite 8 → ainda perto',   U.faixaLimite(8.8, 8).nivel === 'perto');
afirma('8,9% com limite 8 → acima',         U.faixaLimite(8.9, 8).nivel === 'acima');
afirma('3,5% com limite 8 → dentro',        U.faixaLimite(3.5, 8).nivel === 'dentro');
afirma('14,1% com limite 6 → acima',        U.faixaLimite(14.1, 6).nivel === 'acima');
afirma('limite 0 não quebra',               U.faixaLimite(5, 0).nivel === 'sem');
afirma('valor inválido não quebra',         U.faixaLimite(NaN, 8).nivel === 'sem');

/* ══ FONTE ÚNICA — normalizar() refaz as colunas calculadas pela regra ══ */
sec('normalizar() — colunas calculadas saem da regra, não da planilha');
const ENT = { mes:'AGO', ano:2026, colaboradores:95, horasCarga:14907, faltas:2050, atraso:0, horasNormais:14514,
              extra50:1182, extra100:11.17, producaoReal:32364, ticketMedio:261.48, qtdeFaturado:31192, produtosReportados:32364 };
const N = U.normalizar(ENT);
ok('totalFaltaAtraso',     N.totalFaltaAtraso, 2050, 0.05);
ok('totalExtras',          N.totalExtras,     1193.17, 0.05);
ok('horasTotais',          N.horasTotais,     15707.17, 0.05);
ok('absenteismo %',        N.absenteismo,     14.12, 0.01);
ok('prodSemExtras',        N.prodSemExtras,   29703, 1);
ok('meta (cap. teórica)',  N.meta,            31511, 1);
ok('eficiencia %',         N.eficiencia,      94.26, 0.02);
ok('margem %',             N.margem,          -4.74, 0.02);
ok('custoCap R$',          N.custoCap,        1195289, 400);
afirma('não altera o objeto de entrada',            ENT.horasTotais === undefined && ENT.meta === undefined);
afirma('JUN/26: produção vem do ERP (30.851, não 30.451) e derivadas seguem',
  (() => { const j = U.normalizar({ ano:2026, mes:'JUN', horasCarga:14792, faltas:1532, atraso:0, horasNormais:14388, extra50:1545, extra100:44, producaoReal:30451, produtosReportados:30851 });
           return j.producaoReal === 30851 && Math.abs(j.prodSemExtras - 27444) <= 1 && Math.abs(j.meta - 30008) <= 1; })());
afirma('2025 usa o ERP (erpDesde padrão 2025 desde b91)',
  U.normalizar({ ano:2025, mes:'MAI', horasNormais:14400, horasCarga:15008, producaoReal:36450, produtosReportados:38729 }).producaoReal === 38729);
afirma('2024 fica com o digitado',
  U.normalizar({ ano:2024, mes:'MAI', horasNormais:14400, horasCarga:15008, producaoReal:36450, produtosReportados:38729 }).producaoReal === 36450);
afirma('erpDesde 2026 mantém 2025 no digitado',
  U.normalizar({ ano:2025, mes:'MAI', horasNormais:14400, horasCarga:15008, producaoReal:36450, produtosReportados:38729 }, { erpDesde:2026 }).producaoReal === 36450);
afirma('erpDesde 2025 aplica o ERP também em 2025',
  U.normalizar({ ano:2025, mes:'MAI', horasNormais:14400, horasCarga:15008, producaoReal:36450, produtosReportados:38729 }, { erpDesde:2025 }).producaoReal === 38729);
afirma('sem reporte do ERP vale o digitado',
  U.normalizar({ ano:2026, mes:'SET', horasNormais:100, horasCarga:110, producaoReal:200 }).producaoReal === 200);
afirma('sem horas normais nada é derivado',
  (() => { const z = U.normalizar({ ano:2026, mes:'SET', producaoReal:200, horasCarga:100 }); return z.meta === undefined && z.absenteismo === undefined; })());
afirma('null não quebra',                            U.normalizar(null) === null);
/* Ponto do RH: AGO/26 — 95 diretos, jornada cheia 184,8 h, normais 14.514,8,
   faltas do ponto 184,8, atrasos 207,6, férias 1.091. naoTrabalhadas =
   95 × 184,8 − 14.514,8 = 3.041,2. faltas = 3.041,2 − 1.091 − 207,6 = 1.742,6. */
const PONTO = U.normalizar({ ano:2026, mes:'AGO', horasCarga:14907.2, horasNormais:14514.8, extra50:1182, extra100:11.17,
  naoTrabalhadas:3041.2, faltasPonto:184.8, atrasosPonto:207.6, horasFerias:1091, producaoReal:32364, faltas:2050, atraso:0 });
ok('ponto: atraso = atrasos do ponto',        PONTO.atraso, 207.6, 0.05);
ok('ponto: faltas = nãoTrab − férias − atraso', PONTO.faltas, 1742.6, 0.05);
ok('ponto: totalFaltaAtraso',                 PONTO.totalFaltaAtraso, 1950.2, 0.05);
ok('ponto: absenteísmo %',                    PONTO.absenteismo, 13.44, 0.01);
afirma('ponto ausente: faltas e atraso digitados ficam',
  (() => { const z = U.normalizar({ ano:2026, mes:'SET', horasNormais:14000, horasCarga:14400, faltas:2000, atraso:100 }); return z.faltas === 2000 && z.atraso === 100; })());
afirma('ponto sem férias lançadas → integridade avisa (atenção férias)',
  U.integridade([Object.assign({}, PONTO, { horasFerias:0, faltas:2950.2 })]).itens.some(i => i.tipo === 'ferias' && i.nivel === 'atencao'));
/* Controle de faltas do RH (b90): AGO/26 nos 11 setores diretos — FALTA 684,8,
   ATESTADO 285,6, AFASTADO 624,8, ATRASO 12,3, férias 844,8. Com o ponto de
   93 diretos: naoTrabalhadas = 93 × 184,8 − 14.514,8 = 2.671,6; atrasos 207,6.
   faltas = 684,8 + 285,6 + 624,8 = 1.595,2; atraso = 207,6 (ponto);
   1.595,2 + 207,6 + 844,8 = 2.647,6 fecha com 2.671,6 (0,9%). */
const CTRL = U.normalizar({ ano:2026, mes:'AGO', horasCarga:14907.2, horasNormais:14514.8, extra50:1182, extra100:11.17,
  naoTrabalhadas:2671.6, faltasPonto:184.8, atrasosPonto:207.6, horasFerias:844.8,
  ausFalta:684.8, ausAtestado:285.6, ausAfastado:624.8, ausAtraso:12.3, producaoReal:32364, faltas:2050, atraso:0 });
ok('controle: faltas = falta + atestado + afastado', CTRL.faltas, 1595.2, 0.05);
ok('controle com ponto: atraso = atrasos do ponto', CTRL.atraso, 207.6, 0.05);
ok('controle: totalFaltaAtraso',                    CTRL.totalFaltaAtraso, 1802.8, 0.05);
ok('controle: absenteísmo %',                       CTRL.absenteismo, 12.42, 0.01);
afirma('controle sem ponto: atraso = ausAtraso',
  (() => { const z = U.normalizar({ ano:2026, mes:'JUL', horasNormais:14000, horasCarga:14400, ausFalta:500, ausAtestado:200, ausAfastado:300, ausAtraso:12.3, faltas:9999, atraso:9999 }); return z.faltas === 1000 && z.atraso === 12.3; })());
afirma('controle manda sobre a regra do ponto',
  U.normalizar(Object.assign({}, PONTO, { ausFalta:100, ausAtestado:0, ausAfastado:0, ausAtraso:0 })).faltas === 100);
afirma('ponto × controle fecham → integridade sem aviso "ponto"',
  !U.integridade([CTRL]).itens.some(i => i.tipo === 'ponto'));
afirma('ponto × controle divergem >10% → integridade avisa (atenção ponto)',
  U.integridade([U.normalizar(Object.assign({}, CTRL, { naoTrabalhadas:3600 }))]).itens.some(i => i.tipo === 'ponto' && i.nivel === 'atencao'));
afirma('controle sem ponto: nenhuma conferência ponto × controle',
  !U.integridade([U.normalizar({ ano:2026, mes:'JUL', horasNormais:14000, horasCarga:14400, ausFalta:500, ausAtraso:12.3, horasFerias:100 })]).itens.some(i => i.tipo === 'ponto'));
afirma('dataset embutido: normalizar() reproduz eficiência da planilha em 18 de 18 meses (±0,05)',
  REGS.every(r => Math.abs(U.normalizar(r).eficiencia - r.eficiencia) <= 0.05));
afirma('dataset embutido: normalizar() reproduz absenteísmo em 18 de 18 meses (±0,02)',
  REGS.every(r => Math.abs(U.normalizar(r).absenteismo - r.absenteismo) <= 0.02));

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
