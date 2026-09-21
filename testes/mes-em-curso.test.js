/* ══════════════════════════════════════════════════════════════════════════
   Teste do bloco "Mês em curso" — MesEmCurso.apurar()

   Rode com:  node testes/mes-em-curso.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   O Plano Mestre só dizia se o mês cumpriu depois de fechado. O bloco novo
   lê o corte parcial do ERP (01/MM até a data) e responde, com dias ainda no
   calendário, se o plano cabe no que resta. A conta tem quatro armadilhas
   que não dão erro de sintaxe: contar feriado como dia útil, mover o corte
   de dia por fuso horário, comparar o ritmo necessário com o ritmo COM hora
   extra (que não é capacidade) e comemorar um número alto que na verdade é
   corte errado. Cada uma tem caso aqui.

   O teste lê MesEmCurso do próprio index.html — não há cópia da regra aqui.
   Os números de referência são o corte real de SET/26 (PDF 01 a 18/09):
   26.178 produtos, plano 34.810, 21 dias úteis, 7/9 feriado.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function carregarMesEmCurso() {
  const ini = HTML.indexOf('window.MesEmCurso = (function(){');
  if (ini < 0) throw new Error('MesEmCurso não encontrado no index.html');
  const marca = HTML.indexOf('return { apurar:apurar, apurarKg:apurarKg, explicarRitmos:explicarRitmos', ini);
  if (marca < 0) throw new Error('fim de MesEmCurso não reconhecido');
  const fim = HTML.indexOf('})();', marca) + '})();'.length;
  const escopo = { window: {} };
  new Function('window', HTML.slice(ini, fim)).call(escopo, escopo.window);
  return escopo.window.MesEmCurso;
}

const M = carregarMesEmCurso();

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

const FER_2026 = ['2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01',
                  '2026-06-04','2026-09-07','2026-10-12','2026-11-02','2026-11-20','2026-12-25'];

/* ══ Dias úteis ══ */
sec('Dias úteis — segunda a sexta menos feriados, em UTC');
ok('01 a 18/09/26 com 7/9 feriado', M.diasUteis('2026-09-01', '2026-09-18', FER_2026), 13, 0);
ok('01 a 18/09/26 SEM feriados (feriado vira útil)', M.diasUteis('2026-09-01', '2026-09-18', []), 14, 0);
ok('setembro/26 inteiro', M.diasUteisDoMes(2026, 8, FER_2026), 21, 0);
ok('outubro/26 (12/10 cai na segunda)', M.diasUteisDoMes(2026, 9, FER_2026), 21, 0);
ok('novembro/26 (2 e 20; 15 é domingo)', M.diasUteisDoMes(2026, 10, FER_2026), 19, 0);
ok('junho/26 (Corpus Christi 4/6)', M.diasUteisDoMes(2026, 5, FER_2026), 21, 0);
ok('corte no sábado 19/09 conta como sexta', M.diasUteis('2026-09-01', '2026-09-19', FER_2026), 13, 0);
ok('fim antes do início → 0', M.diasUteis('2026-09-18', '2026-09-01', FER_2026), 0, 0);
ok('data inválida → 0', M.diasUteis('2026-09-01', 'ontem', FER_2026), 0, 0);
afirma('deIso não move o dia por fuso (2026-09-18 → dia 18 UTC)', M.deIso('2026-09-18').getUTCDate() === 18);
afirma('ddmm formata dd/mm', M.ddmm('2026-09-18') === '18/09');

/* ══ Último corte ══ */
sec('ultimoCorte — o mais recente do mês, ignorando lixo');
const CORTES = [
  { mes: 'SET', ano: 2026, dataCorte: '2026-09-11', produtos: 17000 },
  { mes: 'SET', ano: 2026, dataCorte: '2026-09-18', produtos: 26178 },
  { mes: 'SET', ano: 2026, dataCorte: '2026-09-25', produtos: 0 },        /* sem produto: não vale */
  { mes: 'set', ano: '2026', dataCorte: '2026-09-04', produtos: 8000 },   /* caixa e tipo diferentes */
  { mes: 'OUT', ano: 2026, dataCorte: '2026-10-09', produtos: 9000 },
];
afirma('SET/26 → corte de 18/09', M.ultimoCorte(CORTES, 'SET', 2026).dataCorte === '2026-09-18');
afirma('OUT/26 → corte de 09/10', M.ultimoCorte(CORTES, 'OUT', 2026).dataCorte === '2026-10-09');
afirma('NOV/26 → null', M.ultimoCorte(CORTES, 'NOV', 2026) === null);
afirma('lista vazia → null', M.ultimoCorte([], 'SET', 2026) === null);

/* ══ O caso real ══ */
sec('SET/26 — corte real de 18/09 (26.178 de 34.810), ritmo demonstrado 1.315');
const BASE = { plano: 34810, realizado: 26178, dataCorte: '2026-09-18', diasPlanejados: 21,
               ritmoDem: 1315, limHE: 8, feriados: FER_2026, hoje: '2026-09-21', melhorMesDia: 1522 };
const c = M.apurar(BASE);
ok('dias decorridos',          c.diasDecorridos, 13, 0);
ok('dias restantes',           c.diasRestantes, 8, 0);
ok('falta produzir',           c.faltaProduzir, 8632, 0);
ok('ritmo necessário restante',c.ritmoNecRestante, 1079, 0);
ok('ritmo atual do mês',       c.ritmoAtualMes, 2013.69, 0.01);
ok('projeção do mês',          c.projecaoMes, 42287.54, 0.01);
ok('esperado até 18/09 (linear) = 34.810 × 13 ÷ 21', c.esperadoAte, 21549.05, 0.01);
ok('aderência até 18/09 %',    c.aderenciaAte, 121.48, 0.01);
ok('% do plano feito',         c.pctFeito, 75.20, 0.01);
ok('% do mês decorrido',       c.pctMes, 61.90, 0.01);
afirma('estado verde: 1.079 ≤ 1.315', c.estado === 'verde');
afirma('título "FECHA NA JORNADA NORMAL"', c.titulo === 'FECHA NA JORNADA NORMAL');
afirma('sanidade: 2.014 > 1,3 × 1.522 → aviso "confira o corte"', c.avisos.some(a => /Confira o período do corte/.test(a)));
afirma('calendário (21) = plano (21) → sem aviso de calendário', !c.avisos.some(a => /calendário dá/.test(a)));
afirma('ate = 18/09', c.ate === '18/09');
afirma('mes/ano derivados do corte', c.mes === 'SET' && c.ano === 2026);

/* ══ Semáforo ══ */
sec('Semáforo — contra o ritmo demonstrado e o limite de hora extra');
const com = (extra) => M.apurar(Object.assign({}, BASE, extra));
afirma('ritmoDem 1.079 (igual ao necessário) → verde', com({ ritmoDem: 1079 }).estado === 'verde');
afirma('ritmoDem 1.000 → 1.079 ≤ 1.080 (8% de HE) → amarelo', com({ ritmoDem: 1000 }).estado === 'amarelo');
afirma('ritmoDem 990 → 1.079 > 1.069 → vermelho', com({ ritmoDem: 990 }).estado === 'vermelho');
afirma('limite de HE vem do parâmetro: ritmoDem 1.000 com limHE 5 → vermelho', com({ ritmoDem: 1000, limHE: 5 }).estado === 'vermelho');
afirma('plano já cumprido → verde "JÁ CUMPRIDO"', com({ realizado: 34810 }).estado === 'verde' && /CUMPRIDO/.test(com({ realizado: 34810 }).titulo));
afirma('sem ritmoDem: compara com o ritmo do próprio mês e avisa', (() => { const x = com({ ritmoDem: 0 }); return x.ritmoRef === x.ritmoAtualMes && x.avisos.some(a => /próprio mês/.test(a)); })());
afirma('sem melhorMesDia: nenhum aviso de sanidade', !com({ melhorMesDia: 0 }).avisos.some(a => /Confira o período/.test(a)));
afirma('melhor mês 1.600: 2.014 < 2.080 → sem aviso de sanidade', !com({ melhorMesDia: 1600 }).avisos.some(a => /Confira o período/.test(a)));

/* ══ Corte velho e mês encerrado ══ */
sec('Corte velho, mês encerrado, sem dado');
afirma('corte de 18/09 lido em 30/09 (12 dias) → velho', com({ hoje: '2026-09-30' }).estado === 'velho');
afirma('corte de 18/09 lido em 25/09 (7 dias) → ainda vale', com({ hoje: '2026-09-25' }).estado === 'verde');
afirma('velho mantém os números (realizado, dias)', com({ hoje: '2026-09-30' }).diasDecorridos === 13);
afirma('corte de 30/09 → mês encerrado, abaixo do plano', (() => { const x = com({ dataCorte: '2026-09-30', hoje: '2026-10-01' }); return x.estado === 'encerrado' && /ABAIXO/.test(x.titulo); })());
afirma('corte de 30/09 com plano coberto → encerrado, coberto', /COBERTO/.test(com({ dataCorte: '2026-09-30', hoje: '2026-10-01', realizado: 35000 }).titulo));
afirma('sem plano → sem', com({ plano: 0 }).estado === 'sem');
afirma('sem corte → sem', com({ dataCorte: null }).estado === 'sem');
afirma('corte inválido → sem', com({ dataCorte: '18/09/2026' }).estado === 'sem');
afirma('corte no domingo 06/09 (0 dias úteis? não: 1 a 4 = 4) → 4 dias', com({ dataCorte: '2026-09-06' }).diasDecorridos === 4);
afirma('saída sempre tem cor e rgb', ['verde','amarelo','vermelho','velho','sem','encerrado'].every(e => {
  const x = { verde: c, amarelo: com({ ritmoDem: 1000 }), vermelho: com({ ritmoDem: 990 }), velho: com({ hoje: '2026-09-30' }),
              sem: com({ plano: 0 }), encerrado: com({ dataCorte: '2026-09-30' }) }[e];
  return x.estado === e && /^#/.test(x.cor) && /^\d+,\d+,\d+$/.test(x.rgb);
}));

/* ══ Calendário × plano ══ */
sec('Calendário × dias do plano — divergência avisa, nunca corrige em silêncio');
afirma('sem FERIADOS: avisa e conta 14 dias', (() => { const x = com({ feriados: [] }); return x.diasDecorridos === 14 && x.avisos.some(a => /Sem aba FERIADOS/.test(a)); })());
afirma('plano com 20 dias e calendário 21 → aviso de divergência', com({ diasPlanejados: 20 }).avisos.some(a => /calendário dá 21/.test(a)));
afirma('plano com 20 dias: restantes = 20 − 13 = 7 (o plano manda no denominador)', com({ diasPlanejados: 20 }).diasRestantes === 7);
afirma('sem diasPlanejados: usa o calendário (21)', com({ diasPlanejados: 0 }).diasPlanejados === 21);
afirma('dezembro sem recesso na FERIADOS: calendário 22 ≠ plano 15 → aviso', (() => {
  const x = M.apurar({ plano: 24860, realizado: 5000, dataCorte: '2026-12-04', diasPlanejados: 15, ritmoDem: 1315, limHE: 8, feriados: FER_2026, hoje: '2026-12-07' });
  return x.avisos.some(a => /calendário dá 22 dias úteis em DEZ e o plano usa 15/.test(a));
})());

/* ══ Em quilos — o plano é em peças, o mix muda o peso da peça ══ */
sec('apurarKg — massa por dia e peso por peça contra os meses fechados');
/* corte real de SET/26: 457.677 kg em 26.178 peças e 13 dias; "ano" = junho, 26,52 kg/pç */
const KG_ANO = { kg: 807600, pecas: 30451, dias: 20, meses: 1 };
const k = M.apurarKg(457677.2, 26178, 13, 34810, KG_ANO);
ok('kg/dia do mês = 457.677 ÷ 13',            k.kgDiaMes, 35205.94, 0.01);
ok('kg/peça do mês = 457.677 ÷ 26.178',       k.kgPecaMes, 17.483, 0.001);
ok('kg/dia do ano = 807.600 ÷ 20',            k.kgDiaAno, 40380, 0.01);
ok('kg/peça do ano = 807.600 ÷ 30.451',       k.kgPecaAno, 26.521, 0.001);
ok('massa por dia −12,8%',                    k.difDiaPct, -12.81, 0.01);
ok('peça 34% mais leve',                      k.difPecaPct, -34.08, 0.01);
ok('plano em quilos no mix do mês = 34.810 × 457.677 ÷ 26.178', k.planoKgMes, 608592.84, 0.01);
ok('plano em quilos no mix do ano = 34.810 × 807.600 ÷ 30.451', k.planoKgAno, 923206.33, 0.01);
afirma('massa por dia abaixo de −5% → atenção, laranja', k.nivel === 'atencao' && k.cor === '#FF9800');
afirma('texto diz que o plano está sendo batido pelo mix leve', /mix leve/.test(k.texto));
afirma('−3% de massa → ok (dentro da folga de 5%)', M.apurarKg(39169 * 13, 26178, 13, 34810, KG_ANO).nivel === 'ok');
afirma('massa igual e peça mais leve → ok, e a frase registra a peça mais leve', (() => { const x = M.apurarKg(40380 * 13, 26178, 13, 34810, KG_ANO); return x.nivel === 'ok' && /mais leve/.test(x.texto); })());
afirma('sem quilos no ano → nível "sem", mas kg/dia e kg/peça do mês existem', (() => { const x = M.apurarKg(457677.2, 26178, 13, 34810, { kg: 0, pecas: 0, dias: 0 }); return x.nivel === 'sem' && x.kgDiaAno === null && Math.abs(x.kgDiaMes - 35205.94) < 0.01 && x.planoKgAno === null; })());
afirma('sem peso no corte → null (o bloco esconde a linha)', M.apurarKg(0, 26178, 13, 34810, KG_ANO) === null);
afirma('apurar() carrega kg quando pesoMes e kgAno vêm junto', (() => { const x = com({ pesoMes: 457677.2, kgAno: KG_ANO }); return x.kg && x.kg.nivel === 'atencao' && x.estado === 'verde'; })());
afirma('apurar() sem pesoMes → kg null e o resto igual', com({}).kg === null);

/* ══ Como ler os ritmos — a explicação é calculada, com os números de 21/09/26 ══ */
sec('explicarRitmos — cinco réguas, uma conta cada, com os números da tela');
const U = { planoAno: 362296, diasPlanoAno: 240, planoFech: 236317, diasPlanFech: 162, normalFech: 216108, diasFech: 162, heP: 27269,
            planoAberto: 125979, diasAbertos: 76, fechados: 'JAN a AGO',
            curso: { mes: 'SET', ate: '18/09', realizado: 26178, diasDecorridos: 13, ritmoNecRestante: 1079, kg: { kgDiaMes: 35206, kgDiaAno: 39000, difDiaPct: -9.7 } } };
const E = M.explicarRitmos(U);
const por = (k) => E.itens.filter(i => i.chave === k)[0];
ok('ritmo do plano = 362.296 ÷ 240',        E.ritmoPlano, 1509.57, 0.01);
ok('ritmo exigido = 236.317 ÷ 162',         E.ritmoExig, 1458.75, 0.01);
ok('ritmo demonstrado = 216.108 ÷ 162',     E.ritmoDem, 1334, 0.01);
ok('com hora extra = (216.108 + 27.269) ÷ 162', E.ritmoComHE, 1502.33, 0.01);
ok('ritmo necessário = 125.979 ÷ 76',       E.ritmoNec, 1657.62, 0.01);
ok('ritmo do mês = 26.178 ÷ 13',            E.ritmoAtual, 2013.69, 0.01);
afirma('cinco itens, na ordem plano → exigido → demonstrado → necessário → mês', E.itens.map(i => i.chave).join(',') === 'plano,exigido,demonstrado,necessario,atual');
afirma('cada item tem as três linhas (o que é, como calcula, como ler)', E.itens.every(i => i.oQueE && i.comoCalcula && i.comoLer));
afirma('a conta do plano traz os números: "362.296 ÷ 240 = 1.510"', /362\.296 ÷ 240 = 1\.510/.test(por('plano').comoCalcula));
afirma('a conta do exigido nomeia os meses: "Plano de JAN a AGO ÷ dias trabalhados"', /Plano de JAN a AGO ÷ dias trabalhados = 236\.317 ÷ 162/.test(por('exigido').comoCalcula));
afirma('demonstrado explica a jornada normal e cita o ritmo com hora extra (1.502)', /descontada na proporção das horas extras/.test(por('demonstrado').comoCalcula) && /1\.502 pç\/dia/.test(por('demonstrado').comoLer));
afirma('necessário: "24% acima do demonstrado: não cabe na jornada normal"', /24% acima do demonstrado: não cabe/.test(por('necessario').comoLer));
afirma('plano mais pesado no fim (1.658 > 1.510)', /mais pesado no fim do ano/.test(por('plano').comoLer));
afirma('mês em curso: "26.178 ÷ 13 = 2.014" e "cabe" (1.079 ≤ 1.334), com os quilos', /26\.178 ÷ 13 = 2\.014/.test(por('atual').comoCalcula) && /— cabe\./.test(por('atual').comoLer) && /35,2 t\/dia contra 39,0/.test(por('atual').comoLer));
afirma('leitura: 8,6% abaixo, trecho mais pesado ainda vem, peça leve', /8,6% abaixo/.test(E.leitura[0]) && /trecho mais pesado do ano ainda vem/.test(E.leitura[1]) && /peça leve, não fábrica mais rápida/.test(E.leitura[2]));
afirma('confusão 1: exigido menor que o do plano não é folga', E.confusoes.some(q => /estava folgado/.test(q.p) && /trecho fácil/.test(q.r)));
afirma('confusão 2: 2.014 do mês não se compara com o necessário do ano', E.confusoes.some(q => /Então sobra/.test(q.p) && /jornada normal \(1\.334\)/.test(q.r)));
afirma('sem mês em curso: quatro itens e nenhuma confusão sobre o mês', (() => { const x = M.explicarRitmos(Object.assign({}, U, { curso: null })); return x.itens.length === 4 && !x.confusoes.some(q => /sobra/.test(q.p)); })());
afirma('sem meses fechados: exigido vale o do plano e o texto diz por quê', (() => { const x = M.explicarRitmos({ planoAno: 362296, diasPlanoAno: 240, planoAberto: 362296, diasAbertos: 240 }); return Math.abs(x.ritmoExig - x.ritmoPlano) < 0.01 && /vale o ritmo do plano/.test(por.call(null, 'exigido') ? x.itens[1].comoCalcula : '') && x.leitura.length === 0; })());
afirma('restante mais leve que o demonstrado → "cabe na jornada normal"', /cabe na jornada normal/.test(M.explicarRitmos(Object.assign({}, U, { planoAberto: 90000 })).itens[3].comoLer));
afirma('restante entre o demonstrado e a média do plano (1.380): "mais leve que a média, mas acima do que a fábrica entrega"',
  /mais leve que a média do ano, mas acima do que a fábrica entrega/.test(M.explicarRitmos(Object.assign({}, U, { planoAberto: 1380 * 76 })).leitura[1]));

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
