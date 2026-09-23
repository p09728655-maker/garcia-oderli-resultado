/* ══════════════════════════════════════════════════════════════════════════
   Teste da tela de divulgação — PlanoRealizado.modelo() e .solo()

   Rode com:  node testes/plano-realizado.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   A tela tem endereço próprio (/plano) e é a que vai para a TV e para o
   WhatsApp — é a que mais gente vê e a que ninguém confere contra a
   planilha. Ela não faz conta nenhuma: traduz o pmApurado() da aba Mestre.
   O risco não é cálculo errado, é TRADUÇÃO errada: mostrar o mês certo com
   o veredito do ano, marcar a barra do ano pelo tempo (que diria "em dia"
   enquanto o ritmo diz "atrás"), ou exibir o % de um mês ainda aberto ao
   lado de meses fechados como se fossem comparáveis. É isso que está preso
   aqui, com os números reais de 21/09/26.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function carregar() {
  const ini = HTML.indexOf('window.PlanoRealizado = (function(){');
  if (ini < 0) throw new Error('PlanoRealizado não encontrado no index.html');
  const marca = HTML.indexOf('return { modelo:modelo, html:html, solo:solo', ini);
  if (marca < 0) throw new Error('fim de PlanoRealizado não reconhecido');
  const fim = HTML.indexOf('})();', marca) + '})();'.length;
  const escopo = { window: {} };
  new Function('window', HTML.slice(ini, fim)).call(escopo, escopo.window);
  return escopo.window.PlanoRealizado;
}
const PR = carregar();

/* O kg travado é gerado pelo apurarKg de verdade, não escrito à mão: fixture
   de objeto travado envelhece e passa a testar o que eu imaginei, não o que
   o módulo devolve. */
function carregarMesEmCurso() {
  const ini = HTML.indexOf('window.MesEmCurso = (function(){');
  const marca = HTML.indexOf('return { apurar:apurar, apurarKg:apurarKg', ini);
  const fim = HTML.indexOf('})();', marca) + '})();'.length;
  const escopo = { window: {} };
  new Function('window', HTML.slice(ini, fim)).call(escopo, escopo.window);
  return escopo.window.MesEmCurso;
}
const MEC = carregarMesEmCurso();

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

/* pmApurado() de 21/09/2026, com os números que a tela real mostrou */
const U = {
  ano: 2026, planoAno: 362296, realAcum: 243325, planoFech: 236317,
  planoAberto: 125979, diasAbertos: 76, diasPlanoAno: 240, diasPlanFech: 162,
  ritmoDem: 1334, heP: 27269,
  curso: { mes: 'SET', ate: '18/09', plano: 34810, realizado: 26178, faltaProduzir: 8632,
           diasDecorridos: 13, diasRestantes: 8, diasPlanejados: 21, pctMes: 61.9,
           ritmoNecRestante: 1079, estado: 'verde',
           he: { cx: 27899, heCx: 4534, heHoras: 20, hePct: 16.2515, diasApontados: 13,
                 nivel: 'acima', cor: '#F44336', limHE: 8,
                 realSemHE: 21923.69, ritmoSemHE: 1686.44, projSemHE: 35415.19 },
           kg: { kgPecaMes: 17.483, kgPecaAno: 26.521, kgDiaMes: 35206, kgDiaAno: 39000,
                 difDiaPct: -9.7, difPecaPct: -34.08 } },
  meses: [
    { mes:'JAN', plano:22828, real:22437, normal:19300, status:'Não cumpriu', parcial:null },
    { mes:'FEV', plano:27893, real:32547, normal:27640, status:'Cumpriu c/ HE', parcial:null },
    { mes:'MAR', plano:26700, real:27600, normal:26640, status:'Cumpriu c/ HE', parcial:null },
    { mes:'ABR', plano:32944, real:29195, normal:26180, status:'Não cumpriu', parcial:null },
    { mes:'MAI', plano:31522, real:33330, normal:28340, status:'Cumpriu c/ HE', parcial:null },
    { mes:'JUN', plano:32850, real:30451, normal:27088, status:'Não cumpriu', parcial:null },
    { mes:'JUL', plano:30780, real:33500, normal:30800, status:'Cumpriu c/ HE', parcial:null },
    { mes:'AGO', plano:30800, real:34265, normal:31000, status:'Cumpriu c/ HE', parcial:null },
    { mes:'SET', plano:34810, real:null, normal:null, status:'Em andamento',
      parcial:{ produtos:26178, ate:'18/09' } },
    { mes:'OUT', plano:34810, real:null, normal:null, status:'A produzir', parcial:null },
    { mes:'NOV', plano:31490, real:null, normal:null, status:'A produzir', parcial:null },
    { mes:'DEZ', plano:24860, real:null, normal:null, status:'A produzir', parcial:null }
  ]
};
const M = PR.modelo(U, '21/09 09:12');

/* ══ O mês ══ */
sec('O mês — do corte parcial, com o veredito do que falta');
afirma('veredito "NO RITMO" (1.079 ≤ 1.334)', M.mes.veredito === 'NO RITMO' && M.mes.cor === '#4CAF50');
afirma('nome do mês por extenso e a data do corte', M.mes.nome === 'Setembro' && M.mes.ate === '18/09');
ok('realizado',                 M.mes.real, 26178, 0);
ok('ritmo necessário = 8.632 ÷ 8', M.mes.nec, 1079, 0);
ok('% do plano',                M.mes.pctPlano, 75.20, 0.01);
ok('marca da barra = % do mês decorrido', M.mes.pctRef, 61.9, 0.01);
ok('fecha na jornada normal = 26.178 + 1.334 × 8', M.mes.fecha, 36850, 0);
afirma('cabe na jornada normal', M.mes.cabe === true);

/* ══ O ano — a armadilha ══ */
sec('O ano — a marca é a curva do plano, não o tempo');
afirma('veredito "ATRÁS DO RITMO" (1.658 > 1.334)', M.ano2.veredito === 'ATRÁS DO RITMO' && M.ano2.cor === '#F44336');
ok('ritmo necessário = 125.979 ÷ 76', M.ano2.nec, 1657.62, 0.01);
ok('% do plano feito',          M.ano2.pctPlano, 67.16, 0.01);
ok('marca = planoFech ÷ planoAno = 65%', M.ano2.pctRef, 65.23, 0.01);
afirma('a marca NÃO é o tempo decorrido (68%) — seria "em dia" contra um veredito "atrás"',
  Math.abs(M.ano2.pctRef - (U.diasPlanoAno - U.diasAbertos) / U.diasPlanoAno * 100) > 2);
ok('quanto acima do demonstrado', M.ano2.acimaPct, 24.26, 0.01);
ok('fecha na jornada normal = 243.325 + 1.334 × 76', M.ano2.fecha, 344709, 0);
ok('sobra dos meses fechados = 243.325 − 236.317', M.ano2.sobraFech, 7008, 0);
afirma('legenda do ano preenchida (saía vazia)', !!M.ano2.refLbl && !!M.ano2.refSub);

/* ══ Fita ══ */
sec('Fita mês a mês — cor pelo status, parcial marcado');
afirma('doze meses, na ordem do calendário', M.fita.length === 12 && M.fita[0].mes === 'JAN' && M.fita[11].mes === 'DEZ');
ok('JAN = 22.437 ÷ 22.828',     M.fita[0].pct, 98.29, 0.01);
afirma('JAN não cumpriu → vermelho', M.fita[0].cor === '#F44336');
afirma('FEV cumpriu com hora extra → âmbar', M.fita[1].cor === '#FF9800');
afirma('SET em andamento é marcado como parcial', M.fita[8].parcial === true);
ok('SET mostra o parcial (26.178 ÷ 34.810)', M.fita[8].pct, 75.20, 0.01);
afirma('meses fechados não são parciais', M.fita.slice(0, 8).every(x => !x.parcial));
afirma('OUT a DEZ sem % e cinza', M.fita.slice(9).every(x => x.pct === null && x.cor === '#2A2A2A'));
afirma('mês cumprido na jornada normal seria verde', PR.corStatus('Cumpriu') === '#4CAF50');

/* ══ Hora extra — qualifica o veredito, não fica no rodapé ══
   "NO RITMO" em verde sem dizer que 16% do volume saiu de hora extra é meia
   verdade, e no rodapé ninguém lê depois de um número grande e verde. */
sec('Hora extra — ao lado do veredito do mês');
afirma('o mês carrega a hora extra', !!M.mes.he);
ok('fatia de hora extra = 4.534 ÷ 27.899', M.mes.he.pct, 16.2515, 0.0001);
ok('limite',                    M.mes.he.lim, 8, 0);
afirma('acima do limite → nível "acima" e cor vermelha', M.mes.he.nivel === 'acima' && M.mes.he.cor === '#F44336');
afirma('sem hora extra o mês ainda cobre o plano (35.415 ≥ 34.810)', M.mes.he.cobreSemHE === true);
afirma('o html traz o selo ao lado do veredito', /16,3% em hora extra/.test(PR.html(M)));
afirma('e a frase diz que a hora extra não está indo para o plano',
  /não está indo para ele/.test(PR.html(M)));
afirma('dentro do limite → verde e a frase muda', (() => {
  const x = PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso,
    { he: { hePct: 6.2, limHE: 8, nivel: 'dentro', cor: '#4CAF50', heHoras: 8, projSemHE: 36000 } }) }), 'x');
  return x.mes.he.nivel === 'dentro' && /dentro do limite de 8%/.test(PR.html(x));
})());
afirma('sem dado da Embalagem → sem selo e sem linha, a tela não quebra', (() => {
  const x = PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso, { he: null }) }), 'x');
  return x.mes.he === null && !/em hora extra/.test(PR.html(x));
})());
afirma('a hora extra saiu do rodapé', !M.notas.some(n => /Hora extra no mês/.test(n.txt)));

/* ══ Peso da peça — mesmo tratamento da hora extra ══
   O plano é em peças. Bater o plano com peça 34% mais leve não é a mesma
   fábrica, e isso não pode viver só no rodapé. */
sec('Peso da peça — selo ao lado do veredito');
afirma('o mês carrega o peso', !!M.mes.kg);
ok('peça do mês',               M.mes.kg.peca, 17.483, 0.001);
ok('média do ano',              M.mes.kg.ano, 26.521, 0.001);
ok('diferença %',               M.mes.kg.difPct, -34.08, 0.01);
afirma('mais leve e relevante (|34%| ≥ 5%)', M.mes.kg.leve === true && M.mes.kg.relevante === true);
afirma('o html traz o selo "peça 34% mais leve"', /peça 34% mais leve/.test(PR.html(M)));
afirma('dois selos no veredito: hora extra e peso',
  (PR.html(M).match(/class="pr-selo"/g) || []).length === 2);
afirma('peça mais PESADA inverte a palavra', (() => {
  const x = PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso,
    { kg: Object.assign({}, U.curso.kg, { kgPecaMes: 33.2, difPecaPct: 25.2 }) }) }), 'x');
  return x.mes.kg.leve === false && /mais pesada/.test(PR.html(x));
})());
afirma('diferença pequena (< 5%) não vira selo — não é mudança de mix', (() => {
  const x = PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso,
    { kg: Object.assign({}, U.curso.kg, { kgPecaMes: 26.0, difPecaPct: -2.0 }) }) }), 'x');
  /* conta os selos: sobra só o da hora extra. Olhar o texto solto pegava
     também a nota do rodapé, que fala de peça mais leve por outro motivo. */
  return x.mes.kg.relevante === false
      && (PR.html(x).match(/class="pr-selo"/g) || []).length === 1;
})());
afirma('sem quilos no ano → sem selo de peso, a tela não quebra', (() => {
  const x = PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso, { kg: null }) }), 'x');
  return x.mes.kg === null && (PR.html(x).match(/class="pr-selo"/g) || []).length === 1;
})());

/* ══ Trava de base — a TV cala quando os quilos não são comparáveis ══
   O quilosProduzidos da HISTORICO é digitado à mão; lançar ali a linha
   "Geral" do relatório (produto MAIS volume) dobra o peso do ano e a tela
   afirmaria "peça 50% mais leve" com toda a confiança, num telão, para a
   fábrica inteira. apurarKg anula a comparação; aqui se prova que a tela
   de divulgação fica em silêncio em vez de repetir o número. */
sec('Trava de base — peso suspeito não vai para a tela');
/* mesmo corte de SET/26, com o peso do ano dobrado (o erro conhecido) */
const KG_TRAVADO = MEC.apurarKg(457677.2, 26178, 13, 34810,
  { kg: 807600 * 2, pecas: 30451, dias: 20, meses: 1 });
const T = PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso, { kg: KG_TRAVADO }) }), 'x');
afirma('o apurarKg de verdade marcou suspeita', KG_TRAVADO.nivel === 'suspeita' && KG_TRAVADO.kgPecaAno === null);
afirma('o mês não carrega peso', T.mes.kg === null);
afirma('sobra só o selo da hora extra', (PR.html(T).match(/class="pr-selo"/g) || []).length === 1);
afirma('nada de "mais leve" na tela inteira', !/mais leve/.test(PR.html(T)));
afirma('a nota de peso do rodapé também sai', !T.notas.some(n => /Peça do mês/.test(n.txt)));
afirma('o veredito do mês em peças não muda — o plano é em peças',
  T.mes.status === PR.modelo(U, 'x').mes.status);

/* ══ Rodapé ══ */
sec('Rodapé — a ressalva que a manchete em peças não conta');
afirma('peso da peça contra a média do ano, e por que isso importa',
  M.notas.some(n => /17,5 kg/.test(n.txt) && /26,5 kg/.test(n.txt) && /o plano é em peças/.test(n.txt)));

/* ══ Sem corte parcial ══ */
sec('Sem corte parcial — cai no último mês fechado, a tela segue valendo');
const semCurso = PR.modelo(Object.assign({}, U, { curso: null }), '21/09 09:12');
afirma('mês = AGO, o último fechado', semCurso.mes.nome === 'Agosto' && semCurso.mes.tipo === 'fechado');
afirma('AGO cumpriu com hora extra (34.265 ≥ 30.800, mas 31.000 s/HE também) → verde',
  semCurso.mes.veredito === 'CUMPRIU NA JORNADA NORMAL');
afirma('sem dias restantes, não mostra ritmo necessário nem projeção',
  semCurso.mes.dias === 0 && semCurso.mes.fecha === null);
afirma('o ano continua igual', semCurso.ano2.veredito === 'ATRÁS DO RITMO');
afirma('sem corte, o rodapé cai na dependência de HE do ano',
  semCurso.notas.some(n => /Dependência de hora extra no ano/.test(n.txt)));

/* ══ Corte defasado ══
   O print de 23/09: "dados até 18/09" num canto, "atualizado 23/09 07:04" ao
   lado e "NO RITMO" em verde — parecia dado de hoje. */
sec('Corte defasado — a tela diz que o dado é velho');
const comSC = n => PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso, { diasSemCorte: n }) }), '23/09 07:04');
afirma('0 dia útil sem corte → sem aviso, verde', !comSC(0).defasado && comSC(0).mes.cor === '#4CAF50');
afirma('sem a informação → sem aviso (não inventa)', !M.defasado && !/pr-def/.test(PR.html(M)));
afirma('1 dia útil → avisa, mas mantém o verde', (() => { const x = comSC(1); return x.defasado && !x.defasado.cinza && x.mes.cor === '#4CAF50' && x.mes.veredito === 'NO RITMO'; })());
afirma('2 dias úteis → veredito cinza e datado', (() => { const x = comSC(2); return x.defasado.cinza && x.mes.cor === '#888888' && x.mes.veredito === 'NO RITMO ATÉ 18/09'; })());
afirma('html traz o aviso com a data e a contagem', (() => { const h = PR.html(comSC(2)); return /pr-def/.test(h) && /Dados de 18\/09/.test(h) && /2 dias úteis/.test(h) && /REPORTES PARCIAIS/.test(h); })());
afirma('singular com 1 dia', /1 dia útil de produção/.test(PR.html(comSC(1))));
afirma('o ano não muda de cor pelo corte (o veredito dele é de meses fechados)', comSC(2).ano2.cor === M.ano2.cor);
afirma('cabeçalho diz "tela gerada", não "atualizado"', /tela gerada 21\/09/.test(PR.html(M)) && !/atualizado/.test(PR.html(M)));

/* ══ Corte suspeito ══
   O print de 23/09 07:24: "PLANO CUMPRIDO", 419.339 de 34.810, 1.205%. */
sec('Corte suspeito — nada do corte vai para o telão');
const MS = PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso, { ate: '22/09', realizado: 419339,
  estado: 'suspeito', ritmoAtualMes: 27956, fatorSuspeito: 18.4 }) }), '23/09 07:24');
const HS = PR.html(MS);
afirma('veredito "CORTE EM CONFERÊNCIA", cinza', MS.mes.veredito === 'CORTE EM CONFERÊNCIA' && MS.mes.cor === '#888888');
afirma('não mostra 419.339 nem 1.205%', !/419\.339/.test(HS) && !/1\.205/.test(HS));
afirma('não mostra "PLANO CUMPRIDO"', !/PLANO CUMPRIDO/.test(HS));
afirma('sem bloco de ritmo necessário nem projeção do mês', MS.mes.dias === 0 && MS.mes.fecha === null);
afirma('faixa de aviso com a data e o fator', /Corte de 22\/09 em conferência/.test(HS) && /18× o melhor mês/.test(HS));
afirma('SET sem % na fita', MS.fita[8].pct === null);
afirma('o ano segue igual (meses fechados)', MS.ano2.veredito === M.ano2.veredito && MS.ano2.real === M.ano2.real);

/* ══ Bordas ══ */
sec('Bordas');
afirma('sem apurado → null (a tela mostra o vazio explicado)', PR.modelo(null) === null);
afirma('sem plano no ano → null', PR.modelo({ planoAno: 0 }) === null);
afirma('html(null) explica o que fazer, não quebra', /Sem plano para mostrar/.test(PR.html(null)));
afirma('html(modelo) traz os números da tela',
  (() => { const s = PR.html(M); return /26\.178/.test(s) && /243\.325/.test(s) && /1\.079/.test(s) && /1\.658/.test(s); })());
afirma('restante do ano mais leve que o demonstrado → ano verde',
  PR.modelo(Object.assign({}, U, { planoAberto: 76 * 1000 }), 'x').ano2.veredito === 'NO RITMO');
afirma('plano do mês já cumprido → "PLANO CUMPRIDO"',
  PR.modelo(Object.assign({}, U, { curso: Object.assign({}, U.curso, { realizado: 35000, faltaProduzir: -190 }) }), 'x').mes.veredito === 'PLANO CUMPRIDO');

/* ══ Endereços ══ */
sec('solo() — que endereços abrem a tela sozinha');
const L = (pathname, search) => ({ pathname, search: search || '' });
afirma('/plano abre',        PR.solo(L('/plano')) === true);
afirma('/plano/ abre',       PR.solo(L('/plano/')) === true);
afirma('/tv abre',           PR.solo(L('/tv')) === true);
afirma('?tela=plano abre (antes do rewrite publicar)', PR.solo(L('/index.html', '?tela=plano')) === true);
afirma('?tela=tv abre',      PR.solo(L('/', '?tela=tv')) === true);
afirma('/ não abre — o painel abre normal', PR.solo(L('/')) === false);
afirma('/index.html não abre', PR.solo(L('/index.html')) === false);
afirma('/planejamento não abre (não confunde com /plano)', PR.solo(L('/planejamento')) === false);
afirma('?tela=outra não abre', PR.solo(L('/', '?tela=outra')) === false);

console.log(`\n${total - falhas}/${total} passaram` + (falhas ? ` — ${falhas} FALHA(S)\n` : '\n'));
process.exit(falhas ? 1 : 0);
