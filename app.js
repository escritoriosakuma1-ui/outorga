/* =====================================================================
   Controle de Outorga e Irrigação — SAKUMA Agronegócios
   Dados: Supabase (REST) com cache local de segurança.
   ===================================================================== */

// ---------- CONFIGURAÇÃO DO BANCO ----------
const DB = {
  url: "__SUPABASE_URL__",
  key: "__SUPABASE_ANON_KEY__"
};

const MESES = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];

// Tipo de controle: define as colunas e o título padrão da ficha
const MODELOS = {
  horimetro4:  { nome: "Horímetro — horas (4 colunas)",  titulo: "CONTROLE HORÍMETRO BOMBA D'ÁGUA",
                 cols: ["DATA","HORA INICIAL","HORA FINAL","RESPONSÁVEL"] },
  horimetro5:  { nome: "Horímetro — horas com observação", titulo: "CONTROLE HORÍMETRO BOMBA D'ÁGUA",
                 cols: ["DATA","HORA INICIAL","HORA FINAL","OBSERVAÇÃO","RESPONSÁVEL"] },
  hidrometro4: { nome: "Hidrômetro — m³ (4 colunas)",    titulo: "CONTROLE HIDRÔMETRO",
                 cols: ["DATA","M³ INICIAL","M³ FINAL","RESPONSÁVEL"] },
  hidrometro5: { nome: "Hidrômetro — m³ com observação", titulo: "CONTROLE HIDRÔMETRO",
                 cols: ["DATA","M³ INICIAL","M³ FINAL","OBSERVAÇÃO","RESPONSÁVEL"] },
  leituraEquip:{ nome: "Leitura de equipamento",         titulo: "LEITURA EQUIPAMENTO",
                 cols: ["DATA","HORA","HORÍMETRO","MEDIDOR DE VAZÃO","RESPONSÁVEL"] },
  custom:      { nome: "Personalizado",                  titulo: "CONTROLE",
                 cols: [] }
};

// Larguras: DATA sempre larga (escrita à mão); colunas de hora/m³ estreitas
function largurasColunas(colunas){
  const estreita = (c) => /^(HORA|M³|HOR[ÍI]METRO)/i.test(c);
  const pesos = colunas.map((c,i) => i === 0 ? 22 : (estreita(c) ? 21 : 0));
  const fixo = pesos.reduce((a,b) => a + b, 0);
  const livres = pesos.filter(p => p === 0).length;
  const sobra = livres ? (100 - fixo) / livres : 0;
  return pesos.map(p => (p === 0 ? sobra : p));
}

const COLS_IRRIGACAO = ["DATA","HORA LIGOU","HORA DESLIGOU","CULTURA","PIVÔ","PLANTIO"];

// ---------- CARGA INICIAL (usada na primeira execução e no "restaurar padrão") ----------
const SEED_PRODUTORES = ["G8","SAKUMA"];

const SEED = [
  { nome:"Faz. Faca", tipo:"Fazenda", cabecalho:"FAZ: FACA", controles:[
    ["Bomba D'Água Nº 1","FAZ: FACA / BOMBA D'ÁGUA Nº 1","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro4"],
    ["Bomba D'Água Nº 2","FAZ: FACA / BOMBA D'ÁGUA Nº 2","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro4"],
    ["Cisterna","FAZ: FACA / CISTERNA","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro5"],
    ["Poço Artesiano 1 Piscinão","FAZ: FACA / POÇO ARTESIANO 1 PISCINÃO","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro4"],
    ["Poço Artesiano 2 Piscinão / Abacate","FAZ: FACA / POÇO ARTESIANO 2 PISCINÃO / ABACATE","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro4"],
    ["Poço Artesiano 3 Piscinão / Abacate","FAZ: FACA / POÇO ARTESIANO 3 PISCINÃO / ABACATE","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro4"]
  ]},
  { nome:"Faz. Quebra Cocão", tipo:"Fazenda", cabecalho:"FAZ: QUEBRA COCÃO", controles:[
    ["Poço Artesiano (Horímetro)","FAZ: QUEBRA COCÃO / POÇO ARTESIANO","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro4"],
    ["Poço Artesiano (Leitura Equip.)","FAZ: QUEBRA COCÃO / POÇO ARTESIANO","LEITURA EQUIPAMENTO","leituraEquip"]
  ]},
  { nome:"Faz. Três Riachos", tipo:"Fazenda", cabecalho:"FAZ: TRÊS RIACHOS", controles:[
    ["Principal","FAZ: TRÊS RIACHOS","CONTROLE HIDRÔMETRO","hidrometro4"],
    ["Cisterna (Hidrômetro)","FAZ: TRÊS RIACHOS / CISTERNA","CONTROLE HIDRÔMETRO","horimetro5"],
    ["Cisterna (Horímetro)","FAZ: TRÊS RIACHOS / CISTERNA","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro5"]
  ]},
  { nome:"Faz. Morro Branco", tipo:"Fazenda", cabecalho:"FAZ: MORRO BRANCO", controles:[
    ["Principal","FAZ: MORRO BRANCO","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro4"]
  ]},
  { nome:"Lote 35 Padap", tipo:"Fazenda", cabecalho:"FAZ: LOTE 35 PADAP", controles:[
    ["Principal","FAZ: LOTE 35 PADAP","CONTROLE HORÍMETRO BOMBA D'ÁGUA","horimetro4"]
  ]}
];

// ---------- ESTADO ----------
const now = new Date();
const state = {
  modulo: "outorga",
  locais: [],
  produtores: [],
  online: false,
  localId: null,
  controleId: null,
  meses: [now.getMonth()],
  ano: now.getFullYear(),
  irr: { produtores: [], locais: [], meses: [now.getMonth()], ano: now.getFullYear(), linhas: 26, numerarDias: false }
};

// ---------- UTILITÁRIOS ----------
const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if(cls) e.className = cls; if(txt!==undefined) e.textContent = txt; return e; };
const diasNoMes = (ano, mes) => new Date(ano, mes + 1, 0).getDate();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));

let toastTimer = null;
function toast(msg){
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

function setDbStatus(online, label){
  state.online = online;
  const dot = $("dbDot");
  dot.className = "db-dot " + (online ? "ok" : "off");
  $("dbLabel").textContent = label;
}

// ---------- ACESSO AO BANCO ----------
const dbConfigurado = () => DB.url && !DB.url.startsWith("__");

async function api(path, options = {}){
  const res = await fetch(DB.url + "/rest/v1/" + path, {
    ...options,
    headers: {
      "apikey": DB.key,
      "Authorization": "Bearer " + DB.key,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {})
    }
  });
  if(!res.ok) throw new Error(await res.text());
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

function salvarCache(){
  try{
    localStorage.setItem("outorga_cache", JSON.stringify({ locais: state.locais, produtores: state.produtores }));
  }catch(e){ /* cache é opcional */ }
}

function lerCache(){
  try{
    const raw = localStorage.getItem("outorga_cache");
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function montarSeed(){
  const produtores = SEED_PRODUTORES.map((nome,i) => ({ id: uid(), nome, ordem: i }));
  const locais = SEED.map((l,i) => ({
    id: uid(), nome: l.nome, tipo: l.tipo, cabecalho: l.cabecalho, ordem: i,
    controles: l.controles.map((c,j) => ({
      id: uid(), nav_label: c[0], header: c[1], titulo: c[2], colunas: MODELOS[c[3]].cols.slice(), ordem: j
    }))
  }));
  return { locais, produtores };
}

async function carregarDados(){
  if(dbConfigurado()){
    try{
      const [locais, controles, produtores] = await Promise.all([
        api("out_locais?select=*&order=ordem"),
        api("out_controles?select=*&order=ordem"),
        api("out_produtores?select=*&order=ordem")
      ]);
      state.locais = locais.map(l => ({ ...l, controles: controles.filter(c => c.local_id === l.id).sort((a,b)=>a.ordem-b.ordem) }));
      state.produtores = produtores;
      if(state.locais.length === 0){ await semearBanco(); return; }
      setDbStatus(true, "banco conectado");
      salvarCache();
      return;
    }catch(e){
      console.error("Falha ao ler o banco:", e);
    }
  }
  const cache = lerCache();
  const dados = cache && cache.locais && cache.locais.length ? cache : montarSeed();
  state.locais = dados.locais;
  state.produtores = dados.produtores;
  setDbStatus(false, dbConfigurado() ? "sem conexão — usando cópia local" : "banco não configurado");
}

async function semearBanco(){
  const seed = montarSeed();
  const locais = await api("out_locais", { method: "POST", body: JSON.stringify(
    seed.locais.map(l => ({ id: l.id, nome: l.nome, tipo: l.tipo, cabecalho: l.cabecalho, ordem: l.ordem }))
  )});
  const controles = [];
  seed.locais.forEach(l => l.controles.forEach(c => controles.push({
    id: c.id, local_id: l.id, nav_label: c.nav_label, header: c.header, titulo: c.titulo, colunas: c.colunas, ordem: c.ordem
  })));
  await api("out_controles", { method: "POST", body: JSON.stringify(controles) });
  const prods = await api("out_produtores", { method: "POST", body: JSON.stringify(
    seed.produtores.map(p => ({ id: p.id, nome: p.nome, ordem: p.ordem }))
  )});
  state.locais = locais.map(l => ({ ...l, controles: controles.filter(c => c.local_id === l.id) }));
  state.produtores = prods;
  setDbStatus(true, "banco conectado");
  salvarCache();
}

// Grava uma alteração no banco; se estiver offline, mantém só no cache local.
async function persistir(fn){
  if(state.online){
    try{ await fn(); }
    catch(e){ console.error(e); toast("Não consegui salvar no banco — a alteração ficou só neste navegador."); setDbStatus(false, "sem conexão — usando cópia local"); }
  }
  salvarCache();
}

// ---------- SELETORES ----------
function getLocal(id){ return state.locais.find(l => l.id === id); }

function garantirSelecao(){
  if(!getLocal(state.localId)) state.localId = state.locais[0] ? state.locais[0].id : null;
  const local = getLocal(state.localId);
  if(local && !local.controles.some(c => c.id === state.controleId)){
    state.controleId = local.controles[0] ? local.controles[0].id : null;
  }
  state.irr.locais = state.irr.locais.filter(id => getLocal(id));
  if(state.irr.locais.length === 0 && state.locais.length) state.irr.locais = [state.locais[0].id];
  state.irr.produtores = state.irr.produtores.filter(id => state.produtores.some(p => p.id === id));
  if(state.irr.produtores.length === 0 && state.produtores.length) state.irr.produtores = [state.produtores[0].id];
}

// ---------- RENDER: MÓDULO OUTORGA ----------
function renderFarmTabs(){
  const wrap = $("farmTabs"); wrap.innerHTML = "";
  state.locais.forEach(l => {
    const b = el("button", l.id === state.localId ? "active" : "", l.nome);
    b.onclick = () => { state.localId = l.id; state.controleId = null; garantirSelecao(); renderOutorga(); };
    wrap.appendChild(b);
  });
  const bNovo = el("button","add-tab","+ Novo local");
  bNovo.title = "Cadastrar um novo local";
  bNovo.onclick = () => { renderManager(); $("managerDlg").showModal(); abrirLocalDlg(null); };
  wrap.appendChild(bNovo);
  if(!state.locais.length) wrap.appendChild(el("p","hint","Nenhum local cadastrado. Use “+ Novo local”."));
}

function renderControlTabs(){
  const wrap = $("controlTabs"); wrap.innerHTML = "";
  const local = getLocal(state.localId);
  if(!local) return;
  local.controles.forEach(c => {
    const b = el("button", c.id === state.controleId ? "active" : "", c.nav_label);
    b.onclick = () => { state.controleId = c.id; renderOutorga(); };
    wrap.appendChild(b);
  });
  const bNovo = el("button","add-tab","+ Novo ponto de controle");
  bNovo.title = "Cadastrar um ponto de controle neste local";
  bNovo.onclick = () => { renderManager(); $("managerDlg").showModal(); abrirCtrlDlg(local, null); };
  wrap.appendChild(bNovo);
  if(!local.controles.length) wrap.appendChild(el("p","hint","Este local ainda não tem pontos de controle."));
}

function renderMesChips(container, selecionados, onToggle){
  container.innerHTML = "";
  MESES.forEach((m,i) => {
    const c = el("button", "chip sub" + (selecionados.includes(i) ? " on" : ""), m.slice(0,3));
    c.title = m;
    c.onclick = () => onToggle(i);
    container.appendChild(c);
  });
}

function buildFichaOutorga(controle, local, mesIndex, dias){
  const page = el("div","print-page");
  page.appendChild(el("p","ficha-block-title", `${local.nome} · ${controle.nav_label} · ${MESES[mesIndex]}/${state.ano}`));
  const ficha = el("div","ficha");
  ficha.appendChild(el("p","ficha-title", controle.titulo));
  ficha.appendChild(el("p","ficha-farm", controle.header));

  const meta = el("div","ficha-meta");
  const left = el("span"); left.innerHTML = "<strong>Período:</strong> " + MESES[mesIndex] + " / " + state.ano;
  const right = el("span"); right.innerHTML = "<strong>Local:</strong> " + local.nome;
  meta.append(left, right);
  ficha.appendChild(meta);

  const table = el("table","ficha-table");
  const cg = el("colgroup");
  largurasColunas(controle.colunas).forEach(w => {
    const col = el("col"); col.style.width = w.toFixed(2) + "%"; cg.appendChild(col);
  });
  table.appendChild(cg);
  const thead = el("thead"); const hr = el("tr");
  controle.colunas.forEach(c => hr.appendChild(el("th", null, c)));
  thead.appendChild(hr); table.appendChild(thead);

  const tbody = el("tbody");
  dias.forEach(() => {
    const tr = el("tr");
    controle.colunas.forEach(() => tr.appendChild(el("td")));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  ficha.appendChild(table);

  const foot = el("div","ficha-foot");
  foot.appendChild(el("div","","Responsável"));
  foot.appendChild(el("div","","Visto"));
  ficha.appendChild(foot);

  page.appendChild(ficha);
  return page;
}

function renderOutorga(){
  renderFarmTabs();
  renderControlTabs();
  renderMesChips($("monthPicker"), state.meses, (i) => {
    const p = state.meses.indexOf(i);
    if(p >= 0){ if(state.meses.length > 1) state.meses.splice(p,1); }
    else state.meses.push(i);
    state.meses.sort((a,b)=>a-b);
    renderOutorga();
  });
  $("anoInput").value = state.ano;

  const container = $("fichasOutorga"); container.innerHTML = "";
  const local = getLocal(state.localId);
  const controle = local && local.controles.find(c => c.id === state.controleId);
  const resumo = $("outorgaSummary");

  if(!local || !controle){
    resumo.textContent = "Selecione um local e um ponto de controle.";
    container.appendChild(el("p","empty-msg","Nada para gerar ainda."));
    return;
  }

  // Uma única via por mês: o mês inteiro cabe em uma página
  state.meses.forEach(mes => {
    const total = diasNoMes(state.ano, mes);
    container.appendChild(buildFichaOutorga(controle, local, mes, Array.from({length: total})));
  });
  resumo.textContent = `${state.meses.length} ficha(s), uma página por mês — ${local.nome} / ${controle.nav_label}.`;
}

// ---------- RENDER: MÓDULO IRRIGAÇÃO ----------
function renderIrrPickers(){
  const pp = $("prodPicker"); pp.innerHTML = "";
  state.produtores.forEach(p => {
    const c = el("button","chip" + (state.irr.produtores.includes(p.id) ? " on" : ""), p.nome);
    c.onclick = () => { toggleArr(state.irr.produtores, p.id); renderIrrigacao(); };
    pp.appendChild(c);
  });

  const fp = $("fazPicker"); fp.innerHTML = "";
  state.locais.forEach(l => {
    const c = el("button","chip" + (state.irr.locais.includes(l.id) ? " on" : ""), l.nome);
    c.onclick = () => { toggleArr(state.irr.locais, l.id); renderIrrigacao(); };
    fp.appendChild(c);
  });

  renderMesChips($("monthPickerIrr"), state.irr.meses, (i) => { toggleArr(state.irr.meses, i); state.irr.meses.sort((a,b)=>a-b); renderIrrigacao(); });
  $("anoInputIrr").value = state.irr.ano;
  $("linhasInput").value = state.irr.linhas;
  $("numerarDias").checked = state.irr.numerarDias;
}

function toggleArr(arr, v){
  const i = arr.indexOf(v);
  if(i >= 0) arr.splice(i,1); else arr.push(v);
}

function buildFichaIrrigacao(local, produtor, mesIndex){
  const page = el("div","print-page");
  page.appendChild(el("p","ficha-block-title", `${local.nome} · ${produtor.nome} · ${MESES[mesIndex]}/${state.irr.ano}`));
  const ficha = el("div","ficha");
  ficha.appendChild(el("p","ficha-title","CONTROLE MENSAL IRRIGAÇÃO"));
  const nomeFaz = local.cabecalho ? local.cabecalho.replace(/^FAZ:\s*/i,"FAZ. ") : local.nome.toUpperCase();
  ficha.appendChild(el("p","ficha-farm", `${nomeFaz}  /  ${produtor.nome}`));

  const meta = el("div","ficha-meta");
  const left = el("span"); left.innerHTML = "<strong>Mês:</strong> " + MESES[mesIndex] + " / " + state.irr.ano;
  const right = el("span"); right.innerHTML = "<strong>Produtor:</strong> " + produtor.nome;
  meta.append(left, right);
  ficha.appendChild(meta);

  const table = el("table","ficha-table");
  // DATA · HORA LIGOU · HORA DESLIGOU · CULTURA · PIVÔ · PLANTIO
  const larguras = [16, 13, 13, 22, 12, 24];
  const cg = el("colgroup");
  larguras.forEach(w => { const col = el("col"); col.style.width = w + "%"; cg.appendChild(col); });
  table.appendChild(cg);
  const thead = el("thead"); const hr = el("tr");
  COLS_IRRIGACAO.forEach(c => hr.appendChild(el("th",null,c)));
  thead.appendChild(hr); table.appendChild(thead);

  const totalDias = diasNoMes(state.irr.ano, mesIndex);
  const linhas = state.irr.linhas;
  const tbody = el("tbody");
  for(let i = 0; i < linhas; i++){
    const tr = el("tr");
    COLS_IRRIGACAO.forEach((_, j) => {
      const td = el("td");
      if(false){
        td.className = "dia";
        td.textContent = String(i+1).padStart(2,"0") + "/" + String(mesIndex+1).padStart(2,"0");
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  ficha.appendChild(table);

  const foot = el("div","ficha-foot");
  foot.appendChild(el("div","","Responsável"));
  foot.appendChild(el("div","","Visto"));
  ficha.appendChild(foot);

  page.appendChild(ficha);
  return page;
}

function renderIrrigacao(){
  renderIrrPickers();
  const container = $("fichasIrrigacao"); container.innerHTML = "";
  const resumo = $("irrSummary");

  const prods = state.produtores.filter(p => state.irr.produtores.includes(p.id));
  const locs  = state.locais.filter(l => state.irr.locais.includes(l.id));

  if(!prods.length || !locs.length || !state.irr.meses.length){
    resumo.textContent = "Selecione ao menos um produtor, uma fazenda e um mês.";
    container.appendChild(el("p","empty-msg","Nada para gerar ainda."));
    return;
  }

  prods.forEach(p => locs.forEach(l => state.irr.meses.slice().sort((a,b)=>a-b).forEach(m => {
    container.appendChild(buildFichaIrrigacao(l, p, m));
  })));

  const total = prods.length * locs.length * state.irr.meses.length;
  resumo.textContent = `${total} ficha(s) serão impressas — ${prods.length} produtor(es) × ${locs.length} fazenda(s) × ${state.irr.meses.length} mês(es).`;
}

// ---------- GERENCIAR LOCAIS ----------
let editandoLocalId = null;
let editandoCtrl = { localId: null, ctrlId: null };

function renderManager(){
  const wrap = $("managerList"); wrap.innerHTML = "";
  state.locais.forEach(l => {
    const item = el("div","manager-item");
    const head = el("div","manager-head");
    const info = el("div");
    info.appendChild(el("strong", null, l.nome));
    info.appendChild(el("div","tipo", `${l.tipo} · ${l.cabecalho || "sem cabeçalho"}`));
    const acts = el("div","row-actions");
    const bEd = el("button","btn ghost small","Editar"); bEd.onclick = () => abrirLocalDlg(l);
    const bAdd = el("button","btn ghost small","+ Ponto de controle"); bAdd.onclick = () => abrirCtrlDlg(l, null);
    const bDel = el("button","btn danger small","Excluir"); bDel.onclick = () => excluirLocal(l);
    acts.append(bEd, bAdd, bDel);
    head.append(info, acts);
    item.appendChild(head);

    const body = el("div","manager-body");
    if(!l.controles.length) body.appendChild(el("p","hint","Nenhum ponto de controle neste local."));
    l.controles.forEach(c => {
      const row = el("div","ctrl-row");
      const ci = el("div","info");
      ci.appendChild(document.createTextNode(c.nav_label));
      const tipo = Object.values(MODELOS).find(m => m.cols.length && m.cols.join("|") === c.colunas.join("|"));
      ci.appendChild(el("span", null, `${c.titulo} · ${tipo ? tipo.nome : "colunas personalizadas"}`));
      const ca = el("div","row-actions");
      const e1 = el("button","btn ghost small","Editar"); e1.onclick = () => abrirCtrlDlg(l, c);
      const e2 = el("button","btn danger small","Excluir"); e2.onclick = () => excluirControle(l, c);
      ca.append(e1, e2);
      row.append(ci, ca);
      body.appendChild(row);
    });
    item.appendChild(body);
    wrap.appendChild(item);
  });
}

function abrirLocalDlg(local){
  editandoLocalId = local ? local.id : null;
  $("localDlgTitle").textContent = local ? "Editar local" : "Novo local";
  $("localNome").value = local ? local.nome : "";
  $("localTipo").value = local ? local.tipo : "Fazenda";
  $("localCabecalho").value = local ? (local.cabecalho || "") : "";
  $("localDlg").showModal();
}

async function salvarLocal(){
  const nome = $("localNome").value.trim();
  if(!nome){ toast("Informe o nome do local."); return; }
  const dados = { nome, tipo: $("localTipo").value, cabecalho: $("localCabecalho").value.trim() };

  if(editandoLocalId){
    const l = getLocal(editandoLocalId);
    Object.assign(l, dados);
    await persistir(() => api(`out_locais?id=eq.${l.id}`, { method: "PATCH", body: JSON.stringify(dados) }));
  }else{
    const novo = { id: uid(), ...dados, ordem: state.locais.length, controles: [] };
    state.locais.push(novo);
    await persistir(() => api("out_locais", { method: "POST", body: JSON.stringify([{ id: novo.id, ...dados, ordem: novo.ordem }]) }));
  }
  $("localDlg").close();
  garantirSelecao(); renderManager(); renderTudo();
}

async function excluirLocal(local){
  if(state.locais.length <= 1){ toast("É preciso manter ao menos um local cadastrado."); return; }
  if(!confirm(`Excluir "${local.nome}" e todos os seus pontos de controle?`)) return;
  state.locais = state.locais.filter(l => l.id !== local.id);
  await persistir(async () => {
    await api(`out_controles?local_id=eq.${local.id}`, { method: "DELETE", prefer: "return=minimal" });
    await api(`out_locais?id=eq.${local.id}`, { method: "DELETE", prefer: "return=minimal" });
  });
  garantirSelecao(); renderManager(); renderTudo();
}

function abrirCtrlDlg(local, ctrl){
  editandoCtrl = { localId: local.id, ctrlId: ctrl ? ctrl.id : null };
  $("ctrlDlgTitle").textContent = ctrl ? "Editar ponto de controle" : "Novo ponto de controle";
  $("ctrlNav").value = ctrl ? ctrl.nav_label : "";
  $("ctrlHeader").value = ctrl ? ctrl.header : (local.cabecalho || "");
  $("ctrlTitulo").value = ctrl ? ctrl.titulo : "CONTROLE HORÍMETRO BOMBA D'ÁGUA";

  const sel = $("ctrlModelo"); sel.innerHTML = "";
  Object.entries(MODELOS).forEach(([k,v]) => sel.appendChild(new Option(v.nome, k)));
  let chave = "custom";
  if(ctrl){
    const achado = Object.entries(MODELOS).find(([k,v]) => k !== "custom" && v.cols.join("|") === ctrl.colunas.join("|"));
    chave = achado ? achado[0] : "custom";
  }else{
    chave = "horimetro4";
  }
  sel.value = chave;
  $("ctrlCustom").value = ctrl ? ctrl.colunas.join("; ") : MODELOS.horimetro4.cols.join("; ");
  $("ctrlCustomWrap").hidden = chave !== "custom";
  $("ctrlDlg").showModal();
}

async function salvarControle(){
  const local = getLocal(editandoCtrl.localId);
  const navLabel = $("ctrlNav").value.trim();
  if(!navLabel){ toast("Informe o nome da aba."); return; }
  const modelo = $("ctrlModelo").value;
  const colunas = modelo === "custom"
    ? $("ctrlCustom").value.split(";").map(s => s.trim()).filter(Boolean)
    : MODELOS[modelo].cols.slice();
  if(colunas.length < 2){ toast("Informe pelo menos duas colunas."); return; }

  const dados = {
    nav_label: navLabel,
    header: $("ctrlHeader").value.trim() || (local.cabecalho || local.nome.toUpperCase()),
    titulo: $("ctrlTitulo").value.trim() || "CONTROLE",
    colunas
  };

  if(editandoCtrl.ctrlId){
    const c = local.controles.find(x => x.id === editandoCtrl.ctrlId);
    Object.assign(c, dados);
    await persistir(() => api(`out_controles?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify(dados) }));
  }else{
    const novo = { id: uid(), local_id: local.id, ...dados, ordem: local.controles.length };
    local.controles.push(novo);
    await persistir(() => api("out_controles", { method: "POST", body: JSON.stringify([novo]) }));
  }
  $("ctrlDlg").close();
  garantirSelecao(); renderManager(); renderTudo();
}

async function excluirControle(local, ctrl){
  if(!confirm(`Excluir o ponto de controle "${ctrl.nav_label}"?`)) return;
  local.controles = local.controles.filter(c => c.id !== ctrl.id);
  await persistir(() => api(`out_controles?id=eq.${ctrl.id}`, { method: "DELETE", prefer: "return=minimal" }));
  garantirSelecao(); renderManager(); renderTudo();
}

async function restaurarPadrao(){
  if(!confirm("Isto apaga os locais cadastrados e volta à lista original. Continuar?")) return;
  if(state.online){
    try{
      await api("out_controles?id=not.is.null", { method: "DELETE", prefer: "return=minimal" });
      await api("out_locais?id=not.is.null", { method: "DELETE", prefer: "return=minimal" });
      await api("out_produtores?id=not.is.null", { method: "DELETE", prefer: "return=minimal" });
      await semearBanco();
    }catch(e){ console.error(e); toast("Não consegui restaurar no banco."); return; }
  }else{
    const seed = montarSeed();
    state.locais = seed.locais; state.produtores = seed.produtores; salvarCache();
  }
  garantirSelecao(); renderManager(); renderTudo();
  toast("Cadastro restaurado.");
}

// ---------- IMPRESSÃO ----------
function imprimir(modulo){
  if(state.modulo !== modulo) trocarModulo(modulo);
  const container = modulo === "outorga" ? $("fichasOutorga") : $("fichasIrrigacao");
  if(!container.querySelector(".print-page")){ toast("Não há fichas para imprimir com a seleção atual."); return; }
  window.print();
}

// ---------- NAVEGAÇÃO ----------
function trocarModulo(mod){
  state.modulo = mod;
  $("modOutorga").hidden = mod !== "outorga";
  $("modIrrigacao").hidden = mod !== "irrigacao";
  document.querySelectorAll(".module-tabs button").forEach(b => b.classList.toggle("active", b.dataset.mod === mod));
}

function renderTudo(){
  renderOutorga();
  renderIrrigacao();
}

// ---------- EVENTOS ----------
function ligarEventos(){
  document.querySelectorAll(".module-tabs button").forEach(b => b.onclick = () => trocarModulo(b.dataset.mod));

  $("anoInput").onchange = (e) => { const v = parseInt(e.target.value,10); if(v >= 2000 && v <= 2100){ state.ano = v; renderOutorga(); } };
  $("allMonthsBtn").onclick = () => { state.meses = state.meses.length === 12 ? [now.getMonth()] : MESES.map((_,i)=>i); renderOutorga(); };
  $("printOutorgaBtn").onclick = () => imprimir("outorga");

  $("anoInputIrr").onchange = (e) => { const v = parseInt(e.target.value,10); if(v >= 2000 && v <= 2100){ state.irr.ano = v; renderIrrigacao(); } };
  $("linhasInput").onchange = (e) => { const v = parseInt(e.target.value,10); if(v >= 5 && v <= 40){ state.irr.linhas = v; renderIrrigacao(); } };
  $("numerarDias").onchange = (e) => { state.irr.numerarDias = e.target.checked; renderIrrigacao(); };
  $("allMonthsIrrBtn").onclick = () => { state.irr.meses = state.irr.meses.length === 12 ? [now.getMonth()] : MESES.map((_,i)=>i); renderIrrigacao(); };
  $("allFarmsBtn").onclick = () => {
    state.irr.locais = state.irr.locais.length === state.locais.length ? [state.locais[0].id] : state.locais.map(l => l.id);
    renderIrrigacao();
  };
  $("printIrrBtn").onclick = () => imprimir("irrigacao");

  $("openManagerBtn").onclick = () => { renderManager(); $("managerDlg").showModal(); };
  $("closeManagerBtn").onclick = () => $("managerDlg").close();
  $("addLocalBtn").onclick = () => abrirLocalDlg(null);
  $("resetSeedBtn").onclick = restaurarPadrao;

  $("localCancel").onclick = () => $("localDlg").close();
  $("localSave").onclick = salvarLocal;
  $("ctrlCancel").onclick = () => $("ctrlDlg").close();
  $("ctrlSave").onclick = salvarControle;
  $("ctrlModelo").onchange = (e) => {
    const modelo = MODELOS[e.target.value];
    const custom = e.target.value === "custom";
    $("ctrlCustomWrap").hidden = !custom;
    if(!custom){
      $("ctrlCustom").value = modelo.cols.join("; ");
      $("ctrlTitulo").value = modelo.titulo;   // título da ficha segue o tipo escolhido
    }
  };
}

// ---------- INICIALIZAÇÃO ----------
(async function init(){
  ligarEventos();
  setDbStatus(false, "carregando…");
  await carregarDados();
  garantirSelecao();
  trocarModulo("outorga");
  renderTudo();
})();
