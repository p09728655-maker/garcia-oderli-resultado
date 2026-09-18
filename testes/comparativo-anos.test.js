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

/* ══ 9 · LINHA PELO GRUPO DO ERP (aba GRUPOS) ══
   O código do produto é GRUPO.SUBGRUPO.ITEM. Com a aba GRUPOS a linha é
   exata; sem ela cai para a família derivada — e nunca mistura as duas. */
sec('Linha de produto pelo grupo do código');
const CAD = {
  grupos:  { '100': 'TOUCADORES', '103': 'MESA DE CABECEIRA', '105': 'RACKS' },
  modelos: { '100.009': 'TOUCADOR MAGIC NEW', '103.002': 'MESA CABECEIRA PRIME' },
  pesos:   { '100.009.001': 16.6, '103.002.001': 8.4 }
};
const ITENS_COD = [
  ['JAN', 2025, '100.009.001', 'TOUCADOR MAGIC NEW BRANCO',  100],
  ['JAN', 2025, '103.002.001', 'MESA CABECEIRA PRIME BRANCO', 50],
  ['JAN', 2025, '105.010.001', 'RACK BRITO 137 CM BRANCO',    30],
  ['JAN', 2025, '119.003.001', 'BALCAO ZEUS BRANCO',          10],
  ['JAN', 2026, '100.009.001', 'TOUCADOR MAGIC NEW BRANCO',  120],
  ['JAN', 2026, '103.002.001', 'MESA CABECEIRA PRIME BRANCO', 60, 600],   /* tem peso na linha E no cadastro */
  ['JAN', 2026, '105.010.001', 'RACK BRITO 137 CM BRANCO',    40, 952],   /* só na linha do reporte */
  ['JAN', 2026, '119.003.001', 'BALCAO ZEUS BRANCO',          12],        /* sem peso nenhum */
];
const RG = CA.apurar(ITENS_COD, [], { anoA: 2025, anoB: 2026, base: 'comuns', cadastro: CAD });
afirma('origem da linha = grupo quando a aba GRUPOS existe', RG.linha.origem === 'grupo');
afirma('100.009.001 → TOUCADORES (não "TOUCADOR")',
  RG.produtos.find(p => p.cod === '100.009.001').familia === 'TOUCADORES');
afirma('103.002.001 → MESA DE CABECEIRA (nome do ERP, não "MESA CABECEIRA")',
  RG.produtos.find(p => p.cod === '103.002.001').familia === 'MESA DE CABECEIRA');
afirma('grupo sem nome na aba vira "GRUPO 119" e é listado em linha.semNome',
  RG.produtos.find(p => p.cod === '119.003.001').familia === 'GRUPO 119'
  && RG.linha.semNome.join(',') === 'GRUPO 119');
afirma('modelo = subgrupo pelo prefixo 100.009',
  RG.produtos.find(p => p.cod === '100.009.001').modelo === 'TOUCADOR MAGIC NEW');
afirma('produto sem modelo na aba fica com modelo vazio, não undefined',
  RG.produtos.find(p => p.cod === '105.010.001').modelo === '');
afirma('CA.linhaDe sem cadastro cai para a família derivada',
  CA.linhaDe('100.009.001', 'TOUCADOR MAGIC NEW BRANCO', {}) === 'TOUCADOR');
afirma('CA.linhaDe com código fora do padrão usa a família mesmo com aba GRUPOS',
  CA.linhaDe('ABC', 'MESA CABECEIRA LUA', CAD) === 'MESA CABECEIRA');

const RF = CA.apurar(ITENS_COD, [], { anoA: 2025, anoB: 2026, base: 'comuns' });
afirma('sem cadastro: origem = familia e nenhum "GRUPO xxx" aparece',
  RF.linha.origem === 'familia' && RF.produtos.every(p => p.familia.indexOf('GRUPO ') !== 0));
afirma('sem cadastro a apuração de quantidade é idêntica',
  RF.geral.A.qtd === RG.geral.A.qtd && RF.geral.B.qtd === RG.geral.B.qtd);

/* ══ 10 · PESO PELO CADASTRO (P B × quantidade) ══ */
sec('Peso pelo cadastro');
const tou = RG.produtos.find(p => p.cod === '100.009.001');
const mcp = RG.produtos.find(p => p.cod === '103.002.001');
const rck = RG.produtos.find(p => p.cod === '105.010.001');
const bal = RG.produtos.find(p => p.cod === '119.003.001');
ok('peso 2025 do toucador = 100 × 16,6', tou.pesoA, 1660);
ok('peso 2026 do toucador = 120 × 16,6', tou.pesoB, 1992);
ok('kg/un do toucador é o do cadastro', tou.kgUnB, 16.6, 0.001);
afirma('cadastro manda sobre a linha do reporte quando os dois existem (60 × 8,4 = 504, não 600)',
  Math.abs(mcp.pesoB - 504) < 0.001 && mcp.fontePeso === 'cadastro');
afirma('produto só com peso na linha do reporte usa a linha (952) como reserva',
  Math.abs(rck.pesoB - 952) < 0.001 && rck.fontePeso === 'erp');
afirma('produto sem peso nenhum fica com 0 e sem fonte', bal.pesoB === 0 && bal.fontePeso === '');
ok('fonte.cadastro soma as peças pesadas pelo cadastro (100+50+120+60)', RG.peso.fonte.cadastro, 330);
ok('fonte.erp soma as peças pesadas pela linha (40)', RG.peso.fonte.erp, 40);
ok('fonte.nenhuma soma o resto (30+10+12)', RG.peso.fonte.nenhuma, 52);
ok('cobertura = (330+40) / 422', RG.peso.cobertura, 370 / 422 * 100, 0.01);
afirma('fonteCadastro é false enquanto houver peça pesada pelo reporte', RG.peso.fonteCadastro === false);
const RC2 = CA.apurar(ITENS_COD.map(l => l.slice(0, 5)), [], { anoA: 2025, anoB: 2026, base: 'comuns', cadastro: CAD });
afirma('só cadastro → fonteCadastro = true e kg/un igual nos dois anos',
  RC2.peso.fonteCadastro === true
  && RC2.produtos.filter(p => p.kgUnA > 0 && p.kgUnB > 0).every(p => Math.abs(p.varKgUn) < 1e-9));
afirma('produto sem peso no cadastro e sem coluna PESO não entra no peso total',
  Math.abs(RC2.geral.B.peso - (120 * 16.6 + 60 * 8.4)) < 0.001);

/* ══ 11 · CONTRIBUIÇÃO — o que explica a variação de peso ══
   A conta que sustenta a leitura da reunião ("o peso subiu porque o mix
   migrou para linha pesada"). Se os efeitos não somarem a diferença exata,
   a narrativa está atribuindo a causa errada — e ninguém confere isso na
   tela, porque cada parcela sozinha parece plausível. */
sec('Contribuição: volume × composição');
/* Cenário desenhado como o real: uma linha LEVE encolhe, uma linha PESADA
   cresce, e o peso total sobe mesmo com menos peças. */
const ITENS_CONTRIB = [
  /* MESA DE CABECEIRA: leve (8 kg), perde volume */
  ['JAN', 2025, '103.001.001', 'MESA CABECEIRA SLEEP BRANCO', 1000],
  ['JAN', 2026, '103.001.001', 'MESA CABECEIRA SLEEP BRANCO',  400],
  /* PENTEADEIRA: pesada (40 kg), ganha volume */
  ['JAN', 2025, '114.001.001', 'PENTEADEIRA CAMARIM BRANCO',   100],
  ['JAN', 2026, '114.001.001', 'PENTEADEIRA CAMARIM BRANCO',   300],
];
const CAD_CONTRIB = {
  grupos:  { '103': 'MESA DE CABECEIRA', '114': 'PENTEADEIRA' },
  modelos: {},
  pesos:   { '103.001.001': 8, '114.001.001': 40 }
};
const RK = CA.apurar(ITENS_CONTRIB, [], { anoA: 2025, anoB: 2026, base: 'comuns', cadastro: CAD_CONTRIB });
const K = CA.contribuicao(RK);
afirma('devolve objeto quando há peso', !!K);
ok('peso 2025 = 1000×8 + 100×40', RK.geral.A.peso, 12000);
ok('peso 2026 =  400×8 + 300×40', RK.geral.B.peso, 15200);
afirma('menos peças (1100 → 700) e mais peso (12.000 → 15.200)',
  RK.geral.B.qtd < RK.geral.A.qtd && RK.geral.B.peso > RK.geral.A.peso);
ok('difPeso', K.difPeso, 3200);
/* MESA: (400−1000)×8 = −4.800 · PENTEADEIRA: (300−100)×40 = +8.000 */
ok('efeito volume soma −4.800 + 8.000', K.efVolume, 3200);
ok('efeito composição é zero (kg/un de cada linha não mudou)', K.efComposicao, 0);
afirma('volume + composição = difPeso, sem resíduo',
  Math.abs((K.efVolume + K.efComposicao) - K.difPeso) < 1e-9);

/* Peso médio: 10,91 → 21,71 kg/pç, tudo por mix entre linhas */
ok('kg/pç 2025', K.kgMedA, 12000 / 1100, 0.001);
ok('kg/pç 2026', K.kgMedB, 15200 / 700, 0.001);
afirma('mix entre linhas explica a variação do peso médio, sem resíduo',
  Math.abs((K.mixEntre + K.mixDentro) - K.difKgMed) < 1e-9);
afirma('mix dentro das linhas é zero neste cenário', Math.abs(K.mixDentro) < 1e-9);
afirma('PENTEADEIRA é quem mais empurrou o peso',
  K.linhas[0].nome === 'PENTEADEIRA' && K.linhas[0].difPeso === 8000);
afirma('subiram e cairam separam as duas linhas',
  K.subiram.length === 1 && K.cairam.length === 1
  && K.subiram[0].nome === 'PENTEADEIRA' && K.cairam[0].nome === 'MESA DE CABECEIRA');
ok('soma das contribuições por linha = difPeso',
  K.linhas.reduce((s, x) => s + x.difPeso, 0), K.difPeso);

/* Mix DENTRO da linha: mesma linha, produto leve trocado por pesado. */
const ITENS_DENTRO = [
  ['JAN', 2025, '103.001.001', 'MESA CABECEIRA SLEEP',  1000],
  ['JAN', 2026, '103.002.001', 'MESA CABECEIRA MADERO', 1000],
];
const RD2 = CA.apurar(ITENS_DENTRO, [], { anoA: 2025, anoB: 2026, base: 'comuns',
  cadastro: { grupos: { '103': 'MESA DE CABECEIRA' }, modelos: {}, pesos: { '103.001.001': 8, '103.002.001': 12 } } });
const KD = CA.contribuicao(RD2);
ok('mesma quantidade nos dois anos', KD.linhas[0].difQtd, 0);
ok('todo o ganho de peso é composição (1000 × (12−8))', KD.efComposicao, 4000);
ok('efeito volume é zero', KD.efVolume, 0);
afirma('a linha ficou mais pesada por dentro (8 → 12 kg/un)',
  Math.abs(KD.linhas[0].kgUnA - 8) < 1e-9 && Math.abs(KD.linhas[0].kgUnB - 12) < 1e-9);

/* Linha que nasce: todo o peso é volume, nada de composição inventada. */
const RN2 = CA.apurar(ITENS_CONTRIB.concat([['JAN', 2026, '117.001.001', 'BERCO NOVO', 50]]), [],
  { anoA: 2025, anoB: 2026, base: 'comuns',
    cadastro: { grupos: Object.assign({ '117': 'BERCO' }, CAD_CONTRIB.grupos), modelos: {},
                pesos: Object.assign({ '117.001.001': 30 }, CAD_CONTRIB.pesos) } });
const KN = CA.contribuicao(RN2);
const berco = KN.linhas.find(x => x.nome === 'BERCO');
afirma('linha nova é marcada como nova', berco.nova === true);
ok('peso da linha nova entra todo como volume (50 × 30)', berco.efVolume, 1500);
ok('e nada como composição', berco.efComposicao, 0);
afirma('mesmo com linha nova, volume + composição = difPeso',
  Math.abs((KN.efVolume + KN.efComposicao) - KN.difPeso) < 1e-9);

/* Sem peso não há o que decompor. */
afirma('sem peso, contribuicao devolve null',
  CA.contribuicao(CA.apurar(ITENS_CONTRIB.map(l => l.slice(0, 5)), [], { anoA: 2025, anoB: 2026, base: 'comuns' })) === null);
afirma('entrada vazia devolve null',
  CA.contribuicao(CA.apurar([], [], { anoA: 2025, anoB: 2026, base: 'comuns' })) === null);

/* ══ 12 · BORDAS ══ */
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
