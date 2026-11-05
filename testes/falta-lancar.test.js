/* ══════════════════════════════════════════════════════════════════════════
   Teste do bloco "Falta lançar" (página Dados) — FaltaLancar.apurar()

   Rode com:  node testes/falta-lancar.test.js
   Sem dependência, sem build. Sai com código 1 se algo quebrar.

   POR QUE ISTO EXISTE
   Em 05/11/2026 OUT/26 estava sem qtde vendida e sem peso, e um admitido de
   26/10 estava no cadastro da DP como "3- ACABAMENTO" (com espaço): o
   PontoRH.gs compara o nome exato com PR_SETORES_DIRETOS e a pessoa entrou
   como indireto, sem aviso. O bloco responde "o que falta para fechar o
   mês". As armadilhas: cobrar 2025 (que não tem ponto processado), acusar
   setor indireto legítimo como erro, aceitar o 0 da planilha como lançado,
   e contar ação Cancelada/Excluída como plano do mês.

   O teste lê FaltaLancar do próprio index.html — não há cópia da regra aqui.
   Números de referência: linhas OUT/26 e SET/26 da HISTORICO e o recorte de
   OUT/26 da PONTO_SETOR, como estavam em 05/11/2026.
══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function carregar() {
  const ini = HTML.indexOf('window.FaltaLancar = (function(){');
  if (ini < 0) throw new Error('FaltaLancar não encontrado no index.html');
  const marca = HTML.indexOf('return { apurar:apurar, geral:geral', ini);
  if (marca < 0) throw new Error('fim de FaltaLancar não reconhecido');
  const fim = HTML.indexOf('})();', marca) + '})();'.length;
  const escopo = { window: {} };
  new Function('window', HTML.slice(ini, fim)).call(escopo, escopo.window);
  return escopo.window.FaltaLancar;
}

const F = carregar();

let falhas = 0, total = 0;
function afirma(nome, cond) {
  total++;
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}`);
}
const sec = t => console.log('\n' + t);
const item = (A, titulo) => A.itens.filter(i => i.titulo === titulo)[0];
const nivel = (A, titulo) => (item(A, titulo) || {}).nivel;

/* HISTORICO como o painel guarda (números já convertidos; previsão já vinda
   do PLANO MESTRE pelo Web App). */
const OUT26 = { id:'o', mes:'OUT', ano:2026, colaboradores:90, horasCarga:14678.4, faltas:1223.7, atraso:48,
  horasNormais:14367.7, extra50:711.53, extra100:122.08, producaoReal:30478, ticketMedio:254.11,
  qtdeFaturado:32763, diasTrabalhados:21, qtdeVendida:0, previsaoProducao:34800, horasFerias:246.4,
  quilosProduzidos:0, produtosReportados:30478, volumesProduzidos:38628, atrasosPonto:161.1, faltasPonto:149.6,
  naoTrabalhadas:1322.7, ausAtraso:13.1, ausAfastado:334.4, ausAtestado:471.13, ausFalta:418.18,
  atrasoDuplicado:113.1, duplicidadeApurada:1, integridadeCiente:'', pontos:8325547.97, colaboradoresTotal:146, foraDoPonto:40 };
const SET26 = { id:'s', mes:'SET', ano:2026, colaboradores:93, horasCarga:15479.2, horasNormais:15188.43, extra50:1093.4, extra100:36.22,
  producaoReal:37948, ticketMedio:229.64, qtdeFaturado:36806, diasTrabalhados:21, qtdeVendida:38698, previsaoProducao:34810,
  horasFerias:466.4, quilosProduzidos:761598.4, produtosReportados:37948, volumesProduzidos:44723, atrasosPonto:141.17,
  faltasPonto:149.6, naoTrabalhadas:1522.77, ausAtraso:3.02, ausAfastado:211.2, ausAtestado:270.15, ausFalta:525.52,
  atrasoDuplicado:80.57, duplicidadeApurada:1, pontos:8450121.74, colaboradoresTotal:147, foraDoPonto:40 };

/* PONTO_SETOR como vem da planilha: texto, vírgula decimal */
const SETORES = [
  { mes:'SET', ano:'2026', setor:'3-ACABAMENTO', direto:'S', pessoas:'7', horasCarga:'1100,0', totalExtras:'60' },
  { mes:'SET', ano:'2026', setor:'17-FURAÇÃO', direto:'S', pessoas:'12', horasCarga:'2000', totalExtras:'90' },
  { mes:'OUT', ano:'2026', setor:'1-USINAGEM', direto:'S', pessoas:'16', horasCarga:'2745,6', totalExtras:'231,93' },
  { mes:'OUT', ano:'2026', setor:'3- ACABAMENTO', direto:'N', pessoas:'1', horasCarga:'44', totalExtras:'6,35' },
  { mes:'OUT', ano:'2026', setor:'3-ACABAMENTO', direto:'S', pessoas:'6', horasCarga:'1020,8', totalExtras:'82,53' },
  { mes:'OUT', ano:'2026', setor:'4-EXPEDIÇÃO', direto:'N', pessoas:'11', horasCarga:'1636,8', totalExtras:'73,82' },
  { mes:'OUT', ano:'2026', setor:'17-FURACAO', direto:'N', pessoas:'2', horasCarga:'350', totalExtras:'0' }
];

/* ══ Mês fechado ══ */
sec('Último mês fechado');
afirma('05/11/2026 → OUT/2026', (m => m.mes === 'OUT' && m.ano === 2026)(F.mesFechado('2026-11-05')));
afirma('10/01/2027 → DEZ/2026 (vira o ano)', (m => m.mes === 'DEZ' && m.ano === 2026)(F.mesFechado('2027-01-10')));

/* ══ Setor do cadastro ══ */
sec('Setor escrito de outro jeito no cadastro');
const S = F.setoresSuspeitos(SETORES, 'OUT', 2026);
afirma('"3- ACABAMENTO" (N) é o direto "3-ACABAMENTO"', S.some(s => s.setor === '3- ACABAMENTO' && s.correto === '3-ACABAMENTO'));
afirma('  com 1 pessoa e 44 h de carga (vírgula lida)', S.some(s => s.setor === '3- ACABAMENTO' && s.pessoas === 1 && s.horasCarga === 44));
afirma('sem acento também casa: "17-FURACAO" → "17-FURAÇÃO" (direto em SET)', S.some(s => s.setor === '17-FURACAO' && s.correto === '17-FURAÇÃO'));
afirma('indireto legítimo (4-EXPEDIÇÃO) não é acusado', !S.some(s => s.setor === '4-EXPEDIÇÃO'));
afirma('direto com o nome certo não é acusado', !S.some(s => s.setor === '3-ACABAMENTO' || s.setor === '1-USINAGEM'));
afirma('outro mês não entra', F.setoresSuspeitos(SETORES, 'SET', 2026).length === 0);

/* ══ OUT/26 como estava ══ */
sec('OUT/26 em 05/11/2026');
const A = F.apurar(OUT26, { mes:'OUT', ano:2026, setores:SETORES, erpDesde:2025 });
afirma('qtde vendida 0 → falta', nivel(A, 'Qtde vendida') === 'falta');
afirma('  com botão para o campo fVend', item(A, 'Qtde vendida').campo === 'fVend');
afirma('peso produzido 0 → falta', nivel(A, 'Peso produzido') === 'falta');
afirma('  sem botão (não está no formulário; vai na HISTORICO)', item(A, 'Peso produzido').campo === '');
afirma('setor com nome diferente → atenção', A.itens.filter(i => i.titulo === 'Setor com nome diferente no cadastro').length === 2);
afirma('pontos lançados → ok', nivel(A, 'Pontos do mês') === 'ok');
afirma('fora do ponto (40) → ok', nivel(A, 'Fora do ponto (na folha, não batem ponto)') === 'ok');
afirma('ponto e controle processados, duplicidade apurada → ok',
  nivel(A, 'Horas do mês (carga e normais)') === 'ok' && nivel(A, 'Controle de faltas do RH') === 'ok'
  && nivel(A, 'Atraso contado duas vezes (ponto × controle)') === 'ok');
afirma('plano do mês vindo do PLANO MESTRE → ok', nivel(A, 'Plano do mês') === 'ok');
afirma('total: 2 faltas', A.falta === 2);
afirma('rótulo OUT/26', A.rotulo === 'OUT/26');
afirma('sem acoes/integ no contexto: não inventa item', !item(A, 'Plano de ação do mês') && !item(A, 'Integridade'));

sec('OUT/26 sem o plano aplicado (célula vazia na HISTORICO)');
const semPlano = Object.assign({}, OUT26, { previsaoProducao: 0 });
afirma('plano do mês vazio → falta', nivel(F.apurar(semPlano, { setores:[] }), 'Plano do mês') === 'falta');

/* ══ SET/26 fechado ══ */
sec('SET/26 completo');
const B = F.apurar(SET26, { mes:'SET', ano:2026, setores:SETORES, erpDesde:2025 });
afirma('nenhuma falta', B.falta === 0);
afirma('nenhuma atenção', B.atencao === 0);
afirma('horas por setor (PONTO_SETOR) → ok', nivel(B, 'Horas por setor (PONTO_SETOR)') === 'ok');

/* ══ Casos de borda ══ */
sec('Bordas');
const N = F.apurar(null, { mes:'NOV', ano:2026 });
afirma('mês sem linha na HISTORICO → 1 falta, sem quebrar', N.falta === 1 && !N.existe);
const digitado = Object.assign({}, SET26, { naoTrabalhadas:0, faltasPonto:0, atrasosPonto:0 });
afirma('horas digitadas sem extrato processado → atenção', nivel(F.apurar(digitado, {}), 'Horas do mês (carga e normais)') === 'atencao');
const semHE = Object.assign({}, SET26, { extra50:0, extra100:0 });
afirma('mês sem hora extra → atenção (pode ser verdade, confirmar)', nivel(F.apurar(semHE, {}), 'Hora extra (50% + 100%)') === 'atencao');
const textoZero = Object.assign({}, SET26, { qtdeVendida:'0', quilosProduzidos:'' });
afirma('"0" e "" em texto contam como não lançado',
  (A2 => nivel(A2, 'Qtde vendida') === 'falta' && nivel(A2, 'Peso produzido') === 'falta')(F.apurar(textoZero, {})));
const semControle = Object.assign({}, SET26, { ausFalta:0, ausAtestado:0, ausAfastado:0, ausAtraso:0 });
const C = F.apurar(semControle, {});
afirma('sem controle de faltas → falta, e não cobra duplicidade', nivel(C, 'Controle de faltas do RH') === 'falta'
  && !item(C, 'Atraso contado duas vezes (ponto × controle)'));

/* ══ Integridade ══ */
sec('Integridade do mês');
afirma('erro → falta', nivel(F.apurar(SET26, { integ:[{ nivel:'erro' }, { nivel:'atencao' }] }), 'Integridade') === 'falta');
afirma('só atenção sem Ciente → atenção', nivel(F.apurar(SET26, { integ:[{ nivel:'atencao' }] }), 'Integridade') === 'atencao');
afirma('aviso com Ciente (info) não pesa → ok', nivel(F.apurar(SET26, { integ:[{ nivel:'info' }] }), 'Integridade') === 'ok');

/* ══ Plano de ação ══ */
sec('Plano de ação do mês');
afirma('nenhuma ação de OUT/26 → atenção', nivel(F.apurar(OUT26, { acoes:[{ mesRef:'SET/26', status:'Aberta' }] }), 'Plano de ação do mês') === 'atencao');
afirma('ação Cancelada ou Excluída não conta', nivel(F.apurar(OUT26, { acoes:[{ mesRef:'OUT/26', status:'Cancelada' }, { mesRef:'OUT/26', status:'Excluída' }] }), 'Plano de ação do mês') === 'atencao');
afirma('ação Aberta de OUT/26 → ok', nivel(F.apurar(OUT26, { acoes:[{ mesRef:'OUT/26', status:'Aberta' }] }), 'Plano de ação do mês') === 'ok');
afirma('mês antes da primeira ação registrada não é cobrado (plano começou em AGO/26)',
  !item(F.apurar(Object.assign({}, SET26, { mes:'JUL' }), { acoes:[{ mesRef:'AGO/26', status:'Excluída' }, { mesRef:'SET/26', status:'Aberta' }] }), 'Plano de ação do mês'));
afirma('  e o próprio mês de início é cobrado', nivel(F.apurar(Object.assign({}, SET26, { mes:'AGO' }), { acoes:[{ mesRef:'AGO/26', status:'Excluída' }] }), 'Plano de ação do mês') === 'atencao');
afirma('sem nenhuma ação na lista: não cobra', !item(F.apurar(OUT26, { acoes:[] }), 'Plano de ação do mês'));

/* ══ Fora do mês ══ */
sec('Pendências fora do mês');
const ACOES = [
  { mesRef:'AGO/26', status:'Aberta',       prazo:'2026-09-24' },
  { mesRef:'AGO/26', status:'Aberta',       prazo:'2026-09-17' },
  { mesRef:'AGO/26', status:'Excluída',     prazo:'2026-09-01' },
  { mesRef:'SET/26', status:'Em andamento', prazo:'2026-10-28' },
  { mesRef:'SET/26', status:'Concluída',    prazo:'2026-10-01' },
  { mesRef:'SET/26', status:'Aberta',       prazo:'2026-12-01' }
];
const FER26 = ['2026-01-01','2026-11-20','2026-12-25'];
const Gn = F.geral({ hoje:'2026-11-05', acoes:ACOES, feriados:FER26 });
const venc = Gn.filter(i => i.titulo === 'Ações com prazo vencido')[0];
afirma('3 ações vencidas (Excluída, Concluída e no prazo ficam fora)', !!venc && /^3 ações/.test(venc.valor));
afirma('  a mais antiga é 17/09/26', !!venc && /17\/09\/26/.test(venc.valor));
afirma('novembro sem feriados de 2027 → avisa', Gn.some(i => i.titulo === 'Feriados de 2027'));
afirma('outubro: ainda não cobra 2027', !F.geral({ hoje:'2026-10-05', feriados:FER26 }).some(i => /Feriados/.test(i.titulo)));
afirma('ano corrente sem feriado nenhum → avisa', F.geral({ hoje:'2027-02-01', feriados:FER26 }).some(i => i.titulo === 'Feriados de 2027'));

console.log(`\n${total - falhas}/${total} ok` + (falhas ? ` — ${falhas} FALHA(S)` : ''));
process.exit(falhas ? 1 : 0);
