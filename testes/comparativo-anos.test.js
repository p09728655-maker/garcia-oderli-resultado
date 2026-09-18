/* ══════════════════════════════════════════════════════════════════════════
   Teste da apuração do comparativo entre anos — CompAnos.apurar()

   Rode com:  node testes/comparativo-anos.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   A aba Comparativo 2025 × 2026 é a única do painel que responde "o que
   MUDOU" em vez de "quanto foi". Quatro contas dela erram de forma que não
   aparece como defeito na tela, só como número plausível na reunião:

     • somar 2025 inteiro contra um 2026 que ainda está correndo — a queda de
       calendário vira "queda de produção" e ninguém confere o denominador;
     • (B−A)/A com A = 0 — produto novo vira +Infinity ou +100%, e o ranking
       de "maiores altas" enche de item que nunca existiu antes;
     • somar peso só de quem tem a coluna PESO e chamar de peso total, o que
       subestima a produção física sem avisar;
     • classificar "aumentou/reduziu" por percentual puro, o que promove um
       item que foi de 2 para 4 peças a mudança relevante de mix.

   O teste lê CompAnos do próprio index.html — não há cópia da regra aqui
   para sair de sincronia.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ── Extrai CompAnos do index.html e avalia num escopo isolado ── */
function carregarCompAnos() {
  const ini = HTML.indexOf('window.CompAnos = (function () {');
  if (ini < 0) throw new Error('CompAnos não encontrado no index.html');
  /* O módulo termina no primeiro `})();` depois do return do objeto público. */
  const marca = HTML.indexOf('    ROTULO_SITUACAO: ROTULO_SITUACAO, ORDEM_M: ORDEM_M', ini);
  if (marca < 0) throw new Error('fim de CompAnos não reconhecido');
  const fim = HTML.indexOf('})();', marca) + '})();'.length;
  const escopo = { window: {} };
  new Function('window', HTML.slice(ini, fim)).call(escopo, escopo.window);
  return escopo.window.CompAnos;
}

const CA = carregarCompAnos();

let falhas = 0, total = 0;
function ok(nome, obtido, esperado, tol = 0.01) {
  total++;
  const bom = Math.abs(obtido - esperado) <= tol;
  if (!bom) falhas++;
  console.log(`  ${bom ? 'ok  ' : 'FALHA'} ${nome.padEnd(52)} ${(+obtido).toFixed(2).padStart(12)} (esperado ${(+esperado).toFixed(2)})`);
}
function afirma(nome, cond) {
  total++;
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`);
}
const sec = t => console.log('\n' + t);

/* ── Cenário base ──
   2025 fecha JAN e FEV. 2026 fecha JAN, FEV e MAR — MAR é o mês que 2025
   não tem, e é ele que denuncia se a base de comparação está certa.
   Linha VOL é caixa, não produto: entra de propósito para ser ignorada. */
const ITENS = [
  ['JAN', 2025, '001', 'MESA CABECEIRA LUA',        100,  500],
  ['FEV', 2025, '001', 'MESA CABECEIRA LUA',        100,  500],
  ['JAN', 2025, '002', 'GUARDA ROUPA SOL',           50, 1500],
  ['FEV', 2025, '002', 'GUARDA ROUPA SOL',           60, 1800],
  ['JAN', 2025, '003', 'PAINEL TV VELHO',            80,  400],
  ['JAN', 2025, '009', 'MESA CABECEIRA MINI',         2,    6],
  ['JAN', 2025, 'VOL', 'VOL 1/2 MESA CABECEIRA LUA', 200,    0],

  ['JAN', 2026, '001', 'MESA CABECEIRA LUA',        150,  750],
  ['FEV', 2026, '001', 'MESA CABECEIRA LUA',        150,  780],
  ['JAN', 2026, '002', 'GUARDA ROUPA SOL',           50, 1600],
  ['FEV', 2026, '002', 'GUARDA ROUPA SOL',           20,  640],
  ['JAN', 2026, '004', 'COZINHA COMPACTA NOVA',      40, 1200],
  ['JAN', 2026, '009', 'MESA CABECEIRA MINI',         4,   12],
  ['MAR', 2026, '001', 'MESA CABECEIRA LUA',        999, 4995],
];
const REGS = [
  { mes: 'JAN', ano: 2025, quilosProduzidos: 2406 },
  { mes: 'FEV', ano: 2025, quilosProduzidos: 2300 },
  { mes: 'JAN', ano: 2026, quilosProduzidos: 3562 },
  { mes: 'FEV', ano: 2026, quilosProduzidos: 1420 },
  { mes: 'MAR', ano: 2026, quilosProduzidos: 4995 },
];
const base = (o) => CA.apurar(ITENS, REGS, Object.assign({ anoA: 2025, anoB: 2026 }, o));

/* ══ 1 · BASE DE COMPARAÇÃO ══
   É a defesa contra o número que mais engana na reunião. */
sec('Base de comparação');
const R = base({ base: 'comuns' });
afirma('mesmos meses = interseção dos dois anos (JAN, FEV)',
  R.base.comuns.join(',') === 'JAN,FEV');
afirma('MAR/26 existe só em 2026 e fica FORA da base "mesmos meses"',
  R.base.usaB.indexOf('MAR') < 0);
ok('2025 em mesmos meses', R.geral.A.qtd, 392);        /* 100+100+50+60+80+2 */
ok('2026 em mesmos meses', R.geral.B.qtd, 414);        /* 150+150+50+20+40+4 */
afirma('base "mesmos meses" nunca é marcada como parcial', R.base.parcial === false);

const RC = base({ base: 'cheio' });
ok('2026 em ano cheio inclui MAR (+999)', RC.geral.B.qtd, 1413);
afirma('ano cheio com contagem de meses diferente é marcado como parcial',
  RC.base.parcial === true);
afirma('ano cheio: 2025 com 2 meses, 2026 com 3',
  RC.geral.A.nMeses === 2 && RC.geral.B.nMeses === 3);

const RM = base({ base: 'comuns', mes: 'FEV' });
ok('filtro de mês isola FEV em 2025', RM.geral.A.qtd, 160);   /* 100+60 */
ok('filtro de mês isola FEV em 2026', RM.geral.B.qtd, 170);   /* 150+20 */

/* ══ 2 · LINHA VOL ══ */
sec('Linha de volume não é produto');
afirma('VOL x/y fora da contagem de produtos',
  R.produtos.every(p => p.cod !== 'VOL'));
afirma('as 200 caixas do VOL não entram na quantidade de 2025',
  R.geral.A.qtd === 392);

/* ══ 3 · VARIAÇÃO CONTRA ZERO ══ */
sec('Variação quando um dos anos é zero');
const novo = R.produtos.find(p => p.cod === '004');
const saiu = R.produtos.find(p => p.cod === '003');
afirma('produto que só existe em 2026 → situação "novo"', novo.situacao === 'novo');
afirma('produto novo tem variação NULA, não +Infinity nem +100%',
  novo.varQtd === null && isFinite(novo.qtdB));
afirma('produto que sumiu em 2026 → situação "saiu"', saiu.situacao === 'saiu');
ok('produto que sumiu tem variação exata de −100%', saiu.varQtd, -100);
afirma('CA.variacao(0, n) devolve null', CA.variacao(0, 50) === null);
afirma('CA.variacao(0, 0) devolve null', CA.variacao(0, 0) === null);
ok('CA.variacao(100, 150) = +50%', CA.variacao(100, 150), 50);
afirma('produto zerado nos dois anos não entra na lista',
  R.produtos.every(p => p.qtdA > 0 || p.qtdB > 0));

/* ══ 4 · CLASSIFICAÇÃO E MATERIALIDADE ══
   O corte de materialidade é o que separa "variou muito" de "importa". */
sec('Situação e materialidade');
const mesa = R.produtos.find(p => p.cod === '001');   /* 200 → 300 = +50% */
const grpo = R.produtos.find(p => p.cod === '002');   /* 110 →  70 = −36% */
const mini = R.produtos.find(p => p.cod === '009');   /*   2 →   4 = +100% */
afirma('+50% classifica como aumentou', mesa.situacao === 'aumentou');
afirma('−36% classifica como reduziu',  grpo.situacao === 'reduziu');
afirma('2 → 4 peças também é "aumentou" (+100%)', mini.situacao === 'aumentou');
afirma('a mesa, que move 100 peças, entra na lista executiva',
  R.mix.subiram.some(p => p.cod === '001'));
afirma('variação abaixo de 10% é estável',
  CA.situacaoDe(100, 105) === 'estavel' && CA.situacaoDe(100, 95) === 'estavel');
afirma('10% exatos já sai de estável',
  CA.situacaoDe(100, 110) === 'aumentou' && CA.situacaoDe(100, 90) === 'reduziu');

/* O corte de materialidade é em % do total do período, então só mostra a que
   veio em volume de fábrica. No cenário acima, de 392 peças, o item de 2 → 4
   pesa 0,51% e passaria — o que é correto: num mês de 392 peças, 2 peças SÃO
   meio por cento. Com o volume real da Patrimar (dezenas de milhares por mês)
   o mesmo item some, e é isso que o corte existe para fazer. */
const ITENS_ESCALA = [
  ['JAN', 2025, '001', 'MESA CABECEIRA LUA',  15000, 75000],
  ['JAN', 2026, '001', 'MESA CABECEIRA LUA',  18000, 90000],
  ['JAN', 2025, '009', 'MESA CABECEIRA MINI',     2,     6],
  ['JAN', 2026, '009', 'MESA CABECEIRA MINI',     4,    12],
];
const RE_ = CA.apurar(ITENS_ESCALA, [], { anoA: 2025, anoB: 2026, base: 'comuns' });
const miniE = RE_.produtos.find(p => p.cod === '009');
const mesaE = RE_.produtos.find(p => p.cod === '001');
afirma('em volume de fábrica, 2 → 4 peças continua "aumentou"',
  miniE.situacao === 'aumentou');
afirma('mas não é material: move 0,01% do total, não entra na lista executiva',
  miniE.relevante === false && RE_.mix.subiram.every(p => p.cod !== '009'));
afirma('as 3.000 peças da mesa são materiais e entram',
  mesaE.relevante === true && RE_.mix.subiram.some(p => p.cod === '001'));

/* ══ 5 · MIX ══ */
sec('Entradas e saídas do mix');
afirma('entraram: só o 004', R.mix.entraram.map(p => p.cod).join(',') === '004');
afirma('saíram: só o 003',   R.mix.sairam.map(p => p.cod).join(',') === '003');
afirma('nenhum produto aparece em entraram e saíram ao mesmo tempo',
  R.mix.entraram.every(p => !R.mix.sairam.some(q => q.cod === p.cod)));

/* ══ 6 · FAMÍLIA (a "linha de produto") ══ */
sec('Família derivada da descrição');
afirma('nome composto leva duas palavras', CA.familiaDe('MESA CABECEIRA LUA') === 'MESA CABECEIRA');
afirma('nome simples leva uma',            CA.familiaDe('COZINHA COMPACTA NOVA') === 'COZINHA');
afirma('prefixo KIT é embalagem, não família',
  CA.familiaDe('KIT 2 MESA CABECEIRA LUA') === 'MESA CABECEIRA');
const famMesa = R.familias.find(f => f.nome === 'MESA CABECEIRA');
ok('família MESA CABECEIRA soma os dois códigos em 2025', famMesa.qtdA, 202);  /* 200 + 2 */
ok('família MESA CABECEIRA soma os dois códigos em 2026', famMesa.qtdB, 304);  /* 300 + 4 */
ok('participação das famílias soma 100% em 2026',
  R.familias.reduce((s, f) => s + f.partQtdB, 0), 100, 0.001);
ok('soma dos p.p. de todas as famílias é zero',
  R.familias.reduce((s, f) => s + f.ppQtd, 0), 0, 0.001);
afirma('família que nasceu em 2026 tem nProdA = 0',
  R.familias.find(f => f.nome === 'COZINHA').nProdA === 0);

/* ══ 7 · PESO ══ */
sec('Peso por produto');
ok('peso 2025 soma as linhas com peso', R.geral.A.peso, 4706);   /* 500+500+1500+1800+400+6 */
ok('peso 2026 soma as linhas com peso', R.geral.B.peso, 4982);   /* 750+780+1600+640+1200+12 */
ok('peso médio 2025', R.geral.A.pesoMedio, 4706 / 392, 0.001);
ok('peso médio 2026', R.geral.B.pesoMedio, 4982 / 414, 0.001);
afirma('peso subiu mais que a quantidade → peça média mais pesada',
  R.geral.varPeso > R.geral.varQtd && R.geral.varPesoMedio > 0);
ok('peso unitário do guarda-roupa em 2025', grpo.kgUnA, 3300 / 110, 0.001);
afirma('cobertura de peso é 100% quando toda linha tem peso',
  Math.abs(R.peso.cobertura - 100) < 0.001);
afirma('peso confere com a HISTORICO dentro de 2%', R.peso.confere === true);

/* Cobertura parcial: metade do reporte sem a coluna PESO. */
const ITENS_SEM = ITENS.map(l => l[0] === 'FEV' ? l.slice(0, 5) : l);
const RS = CA.apurar(ITENS_SEM, REGS, { anoA: 2025, anoB: 2026, base: 'comuns' });
afirma('linha sem peso não vira peso zero — reduz a cobertura',
  RS.peso.cobertura > 0 && RS.peso.cobertura < 100);
afirma('quantidade NÃO muda quando falta a coluna peso',
  RS.geral.A.qtd === R.geral.A.qtd && RS.geral.B.qtd === R.geral.B.qtd);
afirma('peso unitário usa só a quantidade que tem peso informado',
  Math.abs(RS.produtos.find(p => p.cod === '001').kgUnA - 5) < 0.001);

/* Nenhuma linha com peso: a tela precisa saber que não há peso nenhum. */
const RN = CA.apurar(ITENS.map(l => l.slice(0, 5)), REGS, { anoA: 2025, anoB: 2026, base: 'comuns' });
afirma('sem coluna PESO em lugar nenhum → temPeso = false', RN.peso.temPeso === false);
afirma('sem peso, a quantidade continua apurada normalmente', RN.geral.B.qtd === 414);

/* Divergência contra a HISTORICO tem de acender o alerta. */
const REGS_ERR = REGS.map(r => Object.assign({}, r, { quilosProduzidos: r.quilosProduzidos * 1.5 }));
const RD = CA.apurar(ITENS, REGS_ERR, { anoA: 2025, anoB: 2026, base: 'comuns' });
afirma('peso 33% abaixo da HISTORICO reprova a conferência', RD.peso.confere === false);

/* ══ 8 · FILTRO DE EXIBIÇÃO ══
   Filtrar é de tela: não pode mexer no que já foi apurado. */
sec('Filtro de exibição');
afirma('filtro por família devolve só ela',
  CA.filtrar(R.produtos, { familia: 'GUARDA ROUPA' }).every(p => p.familia === 'GUARDA ROUPA'));
afirma('filtro por situação devolve só ela',
  CA.filtrar(R.produtos, { situacao: 'novo' }).every(p => p.situacao === 'novo'));
afirma('busca casa código e descrição',
  CA.filtrar(R.produtos, { busca: 'cozinha' }).length === 1);
afirma('filtro não altera os totais já apurados',
  R.geral.B.qtd === 414 && R.produtos.length === 5);

/* ══ 9 · BORDAS ══ */
sec('Bordas');
const RV = CA.apurar([], [], { anoA: 2025, anoB: 2026, base: 'comuns' });
afirma('entrada vazia não quebra', RV.produtos.length === 0 && RV.geral.A.qtd === 0);
afirma('sem meses comuns, tudo zera em vez de somar errado',
  CA.apurar([['JAN', 2025, '1', 'X', 10]], [], { anoA: 2025, anoB: 2026, base: 'comuns' }).geral.A.qtd === 0);
afirma('quantidade zero ou negativa é ignorada',
  CA.apurar(ITENS.concat([['JAN', 2026, '777', 'FANTASMA', 0, 0]]), REGS,
    { anoA: 2025, anoB: 2026, base: 'comuns' }).produtos.every(p => p.cod !== '777'));

console.log(`\n${total - falhas}/${total} passaram`);
process.exit(falhas ? 1 : 0);
