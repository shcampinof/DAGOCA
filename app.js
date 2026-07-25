import { ScadaSimulator, demoConfig } from "./simulator.js";
import { AlarmManager } from "./alarms.js";
import { TrendManager } from "./charts.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const simulator = new ScadaSimulator(demoConfig);
const alarms = new AlarmManager(simulator.bus);
const trends = new TrendManager(demoConfig, simulator);
let role = localStorage.getItem("dagoca-role") || "Operador";
let soundEnabled = localStorage.getItem("dagoca-sound") !== "false";
let cipTimer = null;
let cipRunning = false;
let selectedCip = new Set();

const stageEquipmentTags = ["CIP-01", "T1", "T3", "T4", "T5", "IC1", "TF", "TM", "CIP-01", "TM", "T7", "EMB-01"];

function safeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { toast("No fue posible guardar la preferencia local.", "error"); }
}

function formatTime(value, secondsOnly = false) {
  const seconds = Number(value || 0);
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor(seconds % 3600 / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return secondsOnly ? `${m}:${s}` : `${h}:${m}:${s}`;
}

function toast(message, type = "") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  $("#toast-region").append(item);
  setTimeout(() => item.remove(), 4200);
}

function equipmentStatusClass(equipment) {
  if (equipment.status === "Alarma") return "alarm";
  if (equipment.status === "Operando") return "active";
  return "";
}

function equipmentCard(equipment, displayName = equipment.tag) {
  const reading = equipment.temperature != null ? `${equipment.temperature.toFixed?.(1) ?? equipment.temperature} °C` : equipment.status;
  return `<button class="equipment ${equipmentStatusClass(equipment)}" data-equipment="${equipment.tag}" title="${equipment.name} · ${equipment.status}">
    <span class="equip-icon ${equipment.type}"><i class="level" style="--level:${equipment.level}%"></i></span>
    <strong>${displayName}</strong><small>${equipment.name}</small><span class="reading">${reading}</span>
  </button>`;
}

function classicUnit(equipment, options = {}) {
  const {
    compact = false,
    shape = equipment.type === "filter" ? "filter" : equipment.type === "cooler" ? "cooler" : "tank",
    process = "MOSTO",
    showGauge = true
  } = options;
  const status = equipment.status === "Operando" ? "RUN" : equipment.status === "Alarma" ? "FALLA" : equipment.available ? "LISTO" : equipment.status.toUpperCase();
  const statusClass = equipment.status === "Operando" ? "run" : equipment.status === "Alarma" ? "fault" : equipment.available ? "ready" : "stopped";
  const secondary = equipment.ph != null ? `pH ${equipment.ph}` : equipment.density != null ? `${equipment.density} SG` : equipment.turbidity != null ? `${equipment.turbidity} NTU` : `${equipment.pressure ?? 0} bar`;
  return `<button class="classic-unit ${compact ? "compact" : ""} ${shape} ${equipmentStatusClass(equipment)}" data-equipment="${equipment.tag}" aria-label="${equipment.tag}, ${equipment.name}, ${equipment.status}">
    <span class="unit-title">${equipment.name}</span>
    <span class="vessel-wrap">
      <span class="vessel-top"></span>
      <span class="vessel-body">
        <i class="liquid ${process.toLowerCase()}" style="height:${equipment.level}%"></i>
        ${shape === "tank" ? '<i class="agitator">↻</i>' : ""}
        ${shape === "filter" ? '<i class="filter-plates"></i>' : ""}
        ${shape === "cooler" ? '<i class="cooler-coil">〰</i>' : ""}
      </span>
      <span class="vessel-cone"></span><span class="leg left"></span><span class="leg right"></span>
    </span>
    ${showGauge ? `<span class="classic-gauge"><i style="height:${equipment.level}%"></i><b>100</b><b>50</b><b>0</b></span>` : ""}
    <span class="unit-tag">${equipment.tag}</span>
    <span class="unit-readings"><b>${equipment.temperature?.toFixed?.(1) ?? equipment.temperature} °C</b><small>${secondary}</small></span>
    <span class="classic-status ${statusClass}"><i></i>${status}</span>
  </button>`;
}

function renderMimic() {
  const get = tag => simulator.equipment.get(tag);
  const fermenters = [...simulator.equipment.values()].filter(e => e.tag.startsWith("TF-"));
  const maturation = [...simulator.equipment.values()].filter(e => e.tag.startsWith("TM-"));
  const active = simulator.activeStage;
  $("#plant-mimic").innerHTML = `
    <div class="classic-board ${simulator.running ? "system-running" : ""}">
      <div class="classic-board-head">
        <strong>DAGOCA · SINÓPTICO GENERAL DE PROCESO</strong>
        <div class="pilot-bank">
          <span><i class="${simulator.running ? "green on" : "green"}"></i>MARCHA</span>
          <span><i class="${simulator.emergency ? "red on" : "red"}"></i>FALLO</span>
          <span><i class="${active >= 0 ? "amber on" : "amber"}"></i>PROCESO</span>
        </div>
      </div>
      <svg class="process-pipes" viewBox="0 0 1200 720" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pipeMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fafafa"/><stop offset=".45" stop-color="#777"/><stop offset=".7" stop-color="#f5f5f5"/><stop offset="1" stop-color="#555"/></linearGradient>
        </defs>
        <path class="pipe" d="M28 184H108 M214 184H264 M382 184H432 M550 184H600 M718 184H770 M886 184H926"/>
        <path class="pipe" d="M1040 184H1110V328H300"/>
        <path class="pipe ${active >= 5 && active <= 7 ? "product-flow" : ""}" d="M300 328V350 M405 328V350 M510 328V350 M615 328V350 M720 328V350"/>
        <path class="pipe" d="M300 523V548H900V328H1015"/>
        <path class="pipe ${active >= 7 && active <= 10 ? "product-flow" : ""}" d="M790 548V568 M895 548V568 M1000 548V568 M1105 548V568"/>
        <path class="pipe" d="M1015 328H1145V610H970"/>
        <path class="cip-pipe ${cipRunning ? "cip-flowing" : ""}" d="M46 682H1130V635 M190 682V610 M585 682V525 M900 682V610"/>
      </svg>
      <div class="process-label water-label">1 · PREPARACIÓN DE AGUA</div>
      <div class="process-label brew-label">2 · ELABORACIÓN</div>
      <div class="process-label ferm-label">3 · FERMENTACIÓN</div>
      <div class="process-label mat-label">4 · MADURACIÓN / ACABADO</div>
      <div class="primary-equipment">
        ${classicUnit(get("T1"), { shape: "filter", process: "agua" })}
        ${classicUnit(get("T2"), { process: "agua" })}
        ${classicUnit(get("T3"), { process: "mosto" })}
        ${classicUnit(get("T4"), { shape: "filter", process: "mosto" })}
        ${classicUnit(get("T5"), { process: "mosto" })}
        ${classicUnit(get("IC1"), { shape: "cooler", process: "refrigerante" })}
      </div>
      <div class="valve-row top-valves">
        ${["XV-101", "XV-201", "XV-301"].map((tag, index) => `<button class="valve-symbol ${simulator.running && active >= index * 2 ? "open" : ""}" data-equipment="${tag}" title="${tag}"><i></i><b>${tag}</b></button>`).join("")}
      </div>
      <div class="bank fermenter-bank">
        <div class="bank-header"><b>COLECTOR TF</b><span>Selección automática de fermentador</span></div>
        <div class="classic-tank-row">${fermenters.map(e => classicUnit(e, { compact: true, process: "cerveza", showGauge: false })).join("")}</div>
      </div>
      <div class="bank maturation-bank">
        <div class="bank-header"><b>COLECTOR TM</b><span>Transferencia a maduración</span></div>
        <div class="classic-tank-row">${maturation.map(e => classicUnit(e, { compact: true, process: "cerveza", showGauge: false })).join("")}</div>
      </div>
      <div class="final-skid">
        ${classicUnit(get("T7"), { compact: true, shape: "filter", process: "cerveza", showGauge: false })}
        <div class="pump-set">
          ${["B1", "B2", "B3"].map((tag, index) => `<button class="pump-symbol ${simulator.running && active >= index * 4 ? "run" : ""}" data-equipment="${tag}"><i>▶</i><b>${tag}</b><small>${get(tag).status}</small></button>`).join("")}
        </div>
        <button class="bottling-machine ${active === 11 ? "active" : ""}" data-equipment="EMB-01"><i>▥ ▥ ▥</i><b>EMBOTELLADO</b><small>EMB-01 · ${get("EMB-01").status}</small></button>
      </div>
      <div class="cip-classic"><b>CIP-01</b><span class="cip-reservoir">CIP</span><span>RETORNO DE LIMPIEZA</span></div>
      <div class="classic-disclaimer">SIMULACIÓN ACADÉMICA · LOS VALORES NO SON PARÁMETROS DE INGENIERÍA</div>
    </div>`;
  $$(".equipment").forEach(button => button.addEventListener("click", () => openEquipment(button.dataset.equipment)));
  $$("#plant-mimic [data-equipment]").forEach(button => button.addEventListener("click", () => openEquipment(button.dataset.equipment)));
}

function renderMetrics() {
  const batch = simulator.activeBatch;
  const current = simulator.currentEquipment();
  const metrics = [
    ["Lote activo", batch?.id || "Sin lote", batch?.recipe || "Cree un lote para comenzar", "#4ed29d"],
    ["Progreso de etapa", `${Math.min(100, Math.round(simulator.stageProgress / demoConfig.simulation.secondsPerStage * 100))}%`, simulator.currentStep()?.name || "En espera", "#5aa9ff"],
    ["Equipo en operación", current?.tag || "—", current?.status || "Sistema preparado", "#e5a94a"],
    ["Alarmas activas", alarms.alarms.filter(a => a.state === "Activa").length, `${alarms.alarms.filter(a => a.priority === "Crítica" && a.state !== "Normalizada").length} críticas`, "#ff626b"]
  ];
  $("#overview-metrics").innerHTML = metrics.map(([label, value, detail, color]) => `<div class="metric" style="--accent:${color}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join("");
}

function renderMiniGrafcet() {
  const groups = [
    ["0.10", "Elaboración y selección", [0, 5]],
    ["0.20", "Fermentación y transferencia", [6, 8]],
    ["0.30", "Maduración y filtrado final", [9, 11]]
  ];
  $("#mini-grafcet").innerHTML = groups.map(([code, name, range]) => {
    const active = simulator.activeStage >= range[0] && simulator.activeStage <= range[1];
    const done = simulator.activeStage > range[1] || simulator.activeBatch?.status === "Completado";
    return `<div class="mini-step ${active ? "active" : ""}"><strong>${code}</strong><span>${name}</span><small>${done ? "✓ Completo" : active ? "● Activo" : "Pendiente"}</small></div>`;
  }).join("");
}

function renderEvents() {
  $("#event-list").innerHTML = simulator.events.slice(0, 8).map(event => `<li><time>${new Date(event.time).toLocaleTimeString("es-CO")}</time><span>${event.message}</span></li>`).join("") || "<li><span>Sin eventos registrados.</span></li>";
}

function renderBatches() {
  $("#batch-table").innerHTML = simulator.batches.map(batch => `<tr>
    <td><code>${batch.id}</code></td><td>${batch.recipe}</td><td>${batch.volume} L</td>
    <td>${batch.startedAt ? new Date(batch.startedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
    <td><span class="badge ${batch.status === "En proceso" ? "Reconocida" : "Normalizada"}">${batch.stage}</span></td>
    <td>${formatTime(batch.elapsed)}</td><td>${batch.fermenter} → ${batch.maturation}</td>
  </tr>`).join("") || `<tr><td colspan="7" class="empty-row">No hay lotes. Cree el primero para iniciar la demostración.</td></tr>`;
}

function renderRecipes() {
  $("#recipe-cards").innerHTML = Object.entries(demoConfig.recipes).map(([name, recipe]) => `<article class="recipe-card">
    <div class="panel-heading"><h3>${name}</h3><button class="text-button recipe-edit" data-recipe="${name}" ${role !== "Supervisor" ? "disabled title='Requiere rol Supervisor'" : ""}>Editar</button></div>
    <div class="recipe-stats">
      <span>Maceración<strong>${recipe.mashTemp} °C</strong></span><span>pH<strong>${recipe.mashPh}</strong></span>
      <span>Fermentación<strong>${recipe.fermentationTemp} °C</strong></span><span>Densidad final<strong>${recipe.finalDensity} SG</strong></span>
      <span>Maduración<strong>${recipe.maturationTemp} °C</strong></span><span>Turbidez máx.<strong>${recipe.turbidityMax} NTU</strong></span>
    </div>
  </article>`).join("");
  $$(".recipe-edit").forEach(button => button.addEventListener("click", () => editRecipe(button.dataset.recipe)));
}

function editRecipe(name) {
  if (role !== "Supervisor") return toast("Interlock de permisos: se requiere rol Supervisor.", "error");
  const recipe = demoConfig.recipes[name];
  const value = prompt(`Temperatura de maceración DEMO para ${name} (°C):`, recipe.mashTemp);
  if (value == null) return;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 40 || number > 90) return toast("Valor fuera del rango de simulación 40–90 °C.", "error");
  recipe.mashTemp = number;
  safeStore("dagoca-recipes", JSON.stringify(demoConfig.recipes));
  renderRecipes(); toast(`Parámetro DEMO de ${name} actualizado.`);
}

function renderGrafcet() {
  const groups = ["0.10", "0.20", "0.30"];
  const titles = { "0.10": "Elaboración", "0.20": "Fermentación", "0.30": "Maduración y acabado" };
  $("#grafcet-board").innerHTML = groups.map(group => `<div class="grafcet-column"><h3>${group} · ${titles[group]}</h3>${
    simulator.steps.filter(step => step.group === group).map(step => {
      const index = simulator.steps.indexOf(step);
      const active = index === simulator.activeStage;
      const transitionClass = active ? (simulator.canAdvance() ? "satisfied" : simulator.emergency ? "blocked" : "pending") : step.status === "complete" ? "satisfied" : "pending";
      const text = step.status === "complete" ? "Transición satisfecha" : active ? (simulator.canAdvance() ? "Lista para transición" : `Pendiente: ${simulator.blockReason()}`) : "En espera de secuencia";
      return `<article class="grafcet-step ${step.status} ${simulator.emergency && active ? "blocked" : ""}">
        <header><strong>${step.code}</strong><span class="badge">${step.status === "complete" ? "COMPLETO" : active ? "ACTIVO" : "PENDIENTE"}</span></header>
        <p>${step.name}</p><div class="transition ${transitionClass}"><span>${transitionClass === "satisfied" ? "✓" : transitionClass === "blocked" ? "×" : "◷"}</span><span>${text}</span></div>
      </article>`;
    }).join("")
  }</div>`).join("");
}

function renderAlarmSummary() {
  const data = [
    ["Críticas", alarms.alarms.filter(a => a.priority === "Crítica" && a.state !== "Normalizada").length, "#ff626b"],
    ["Activas", alarms.alarms.filter(a => a.state === "Activa").length, "#e5a94a"],
    ["Reconocidas", alarms.alarms.filter(a => a.state === "Reconocida").length, "#5aa9ff"],
    ["Normalizadas", alarms.alarms.filter(a => a.state === "Normalizada").length, "#4ed29d"]
  ];
  $("#alarm-summary").innerHTML = data.map(([label, count, color]) => `<div class="alarm-stat" style="--accent:${color}"><span>${label}</span><strong>${count}</strong></div>`).join("");
}

function renderAlarmTable() {
  const priority = $("#alarm-priority").value;
  const equipment = $("#alarm-equipment").value;
  const state = $("#alarm-state").value;
  const search = $("#alarm-search").value.toLowerCase();
  const filtered = alarms.alarms.filter(alarm =>
    (!priority || alarm.priority === priority) && (!equipment || alarm.equipment === equipment) &&
    (!state || alarm.state === state) && (!search || `${alarm.tag} ${alarm.description} ${alarm.batch}`.toLowerCase().includes(search))
  );
  $("#alarm-table").innerHTML = filtered.map(alarm => `<tr>
    <td>${new Date(alarm.timestamp).toLocaleString("es-CO")}</td><td><span class="badge ${alarm.priority}">${alarm.priority}</span></td>
    <td><code>${alarm.tag}</code></td><td>${alarm.description}</td><td>${alarm.equipment}</td><td>${alarm.batch}</td>
    <td><span class="badge ${alarm.state}">${alarm.state}</span></td>
    <td>${alarm.state === "Activa" ? `<button class="ack-button" data-ack="${alarm.id}">Reconocer</button>` : "—"}</td>
  </tr>`).join("") || `<tr><td colspan="8" class="empty-row">No hay alarmas que coincidan con los filtros.</td></tr>`;
  $$("[data-ack]").forEach(button => button.addEventListener("click", () => alarms.acknowledge(button.dataset.ack)));
  $("#alarm-count").textContent = alarms.alarms.filter(a => a.state === "Activa").length;
  $("#alarm-beacon").hidden = !alarms.activeCritical;
}

function updateAlarmEquipmentFilter() {
  const current = $("#alarm-equipment").value;
  const values = [...new Set(alarms.alarms.map(alarm => alarm.equipment))].sort();
  $("#alarm-equipment").innerHTML = `<option value="">Todos</option>${values.map(value => `<option ${value === current ? "selected" : ""}>${value}</option>`).join("")}`;
}

function renderCipTargets() {
  const targets = [...simulator.equipment.values()].filter(item => ["tank", "filter"].includes(item.type) && item.tag !== "T1");
  $("#cip-targets").innerHTML = targets.map(item => `<button class="cip-target ${selectedCip.has(item.tag) ? "selected" : ""}" data-cip="${item.tag}" ${cipRunning ? "disabled" : ""}><strong>${item.tag}</strong><small>${item.clean ? "Limpio" : "Sucio"}</small></button>`).join("");
  $$("[data-cip]").forEach(button => button.addEventListener("click", () => {
    selectedCip.has(button.dataset.cip) ? selectedCip.delete(button.dataset.cip) : selectedCip.add(button.dataset.cip);
    renderCipTargets();
  }));
}

function renderCipSteps(active = -1) {
  const steps = ["Sucio", "Enjuague", "Lavado", "Enjuague final", "Drenado", "Limpio"];
  $("#cip-steps").innerHTML = steps.map((step, index) => `<div class="cip-step ${index < active ? "complete" : index === active ? "active" : ""}">${index + 1}. ${step}</div>`).join("");
}

function startCip() {
  if (cipRunning) return;
  if (!selectedCip.size) return toast("Seleccione al menos un equipo para limpiar.", "error");
  const occupied = [...selectedCip].find(tag => simulator.equipment.get(tag)?.status === "Operando");
  if (occupied) return toast(`Interlock: ${occupied} está en producción.`, "error");
  const duration = Number(new FormData($("#cip-config")).get("duration")) || 8;
  cipRunning = true;
  [...selectedCip].forEach(tag => { const e = simulator.equipment.get(tag); e.status = "En limpieza"; e.clean = false; });
  let step = 0, phaseTick = 0;
  $("#cip-flow").classList.add("flowing");
  $("#cip-status").textContent = "Ciclo en curso";
  renderCipTargets(); renderCipSteps(step);
  simulator.log(`CIP iniciado: ${[...selectedCip].join(", ")}`);
  cipTimer = setInterval(() => {
    phaseTick++;
    const total = duration * 5;
    $("#cip-progress-bar").style.width = `${Math.min(100, ((step * duration + phaseTick) / total) * 100)}%`;
    if (phaseTick >= duration) { phaseTick = 0; step++; renderCipSteps(step); }
    if (step >= 5) {
      clearInterval(cipTimer); cipTimer = null; cipRunning = false;
      simulator.markClean([...selectedCip]); $("#cip-flow").classList.remove("flowing");
      $("#cip-status").textContent = "Ciclo completo"; $("#cip-progress-bar").style.width = "100%";
      toast("Ciclo CIP completado y ruta drenada."); selectedCip.clear(); renderCipTargets();
    }
  }, 1000);
}

function openEquipment(tag) {
  const equipment = simulator.equipment.get(tag);
  if (!equipment) return;
  $("#drawer-title").textContent = `${equipment.tag} · ${equipment.name}`;
  const related = alarms.alarms.filter(alarm => alarm.equipment === equipment.tag || alarm.tag.includes(equipment.tag)).slice(0, 3);
  $("#drawer-content").innerHTML = `<div class="detail-hero">
    <div class="tank-large"><i class="level" style="height:${equipment.level}%"></i></div>
    <div><p class="detail-status">● ${equipment.status}</p><p style="margin-top:8px;color:var(--muted);font-size:10px">Lote: ${equipment.batchId || "Sin asignar"}<br>${equipment.clean ? "Limpio" : "Requiere limpieza"} · ${equipment.closed ? "Cerrado" : "Abierto"}</p></div>
  </div>
  <div class="detail-grid">
    ${detailValue("Nivel", `${equipment.level}%`)}${detailValue("Temperatura", `${equipment.temperature ?? "—"} °C`)}
    ${detailValue("Presión", `${equipment.pressure ?? "—"} bar`)}${detailValue("pH", equipment.ph ?? "N/A")}
    ${detailValue("Densidad", equipment.density ? `${equipment.density} SG` : "N/A")}${detailValue("Turbidez", equipment.turbidity ? `${equipment.turbidity} NTU` : "N/A")}
  </div>
  <h3>Alarmas relacionadas</h3><div>${related.length ? related.map(a => `<p class="engineering-note">${a.tag} · ${a.description}</p>`).join("") : '<p style="color:var(--muted);font-size:10px">Sin alarmas relacionadas.</p>'}</div>
  <h3>Actuadores asociados</h3><p style="color:var(--muted);font-size:10px">Válvulas: XV-101 cerrada · XV-201 cerrada<br>Bombas: B1 detenida · B2 detenida</p>
  <h3>Comandos manuales</h3><div class="drawer-actions"><button class="btn" ${simulator.mode !== "manual" || simulator.emergency ? "disabled" : ""}>Abrir válvula</button><button class="btn" ${simulator.mode !== "manual" || simulator.emergency || !equipment.clean ? "disabled" : ""}>Arrancar bomba</button></div>
  <p class="engineering-note" style="margin-top:12px">La HMI demo no sustituye protecciones mecánicas de presión ni circuitos instrumentados de seguridad.</p>`;
  $("#equipment-drawer").classList.add("open");
  $("#equipment-drawer").setAttribute("aria-hidden", "false");
  $("#close-drawer").focus();
}

function detailValue(label, value) { return `<div class="detail-value"><span>${label}</span><strong>${value}</strong></div>`; }
function closeDrawer() { $("#equipment-drawer").classList.remove("open"); $("#equipment-drawer").setAttribute("aria-hidden", "true"); }

function populateBatchForm() {
  $("#batch-form [name=id]").value = `DG-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(simulator.batches.length + 1).padStart(2, "0")}`;
  $("#batch-recipe").innerHTML = Object.keys(demoConfig.recipes).map(name => `<option>${name}</option>`).join("");
  const options = items => items.length ? items.map(item => `<option value="${item.tag}">${item.tag} · ${item.status}</option>`).join("") : `<option value="">Sin equipos disponibles</option>`;
  $("#batch-fermenter").innerHTML = options(simulator.availableFermenters);
  $("#batch-maturation").innerHTML = options(simulator.availableMaturation);
  $("#batch-validation").textContent = "";
}

function submitBatch(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    simulator.createBatch(data);
    $("#batch-dialog").close();
    renderAll(); toast(`Lote ${data.id} creado y destinos reservados.`);
  } catch (error) { $("#batch-validation").textContent = error.message; }
}

function updateStatus() {
  const batch = simulator.activeBatch;
  $("#system-status").textContent = simulator.emergency ? "PARADA DE EMERGENCIA" : simulator.running ? "Secuencia en ejecución" : "Sistema preparado";
  $("#mode-label").textContent = simulator.mode.toUpperCase();
  $("#stage-label").textContent = simulator.currentStep()?.name.toUpperCase() || "EN ESPERA";
  $("#active-batch-label").textContent = batch?.id || "—";
  $("#emergency-btn").classList.toggle("active", simulator.emergency);
}

function renderTrendSummary() {
  const range = $("#range-select").value;
  const values = trends.summary(range);
  const unit = demoConfig.tags[trends.selectedTag].unit;
  $("#trend-summary").innerHTML = Object.entries(values).map(([key, value]) => `<div class="trend-stat"><small>${{ current: "ACTUAL", min: "MÍNIMO", max: "MÁXIMO" }[key]}</small><strong>${value} ${unit}</strong></div>`).join("");
}

function renderAll() {
  renderMetrics(); renderMimic(); renderMiniGrafcet(); renderEvents(); renderBatches(); renderRecipes(); renderGrafcet();
  renderAlarmSummary(); updateAlarmEquipmentFilter(); renderAlarmTable(); renderCipTargets(); updateStatus();
}

function switchView(view) {
  $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".nav-item").forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    active ? button.setAttribute("aria-current", "page") : button.removeAttribute("aria-current");
  });
  $("#view-title").textContent = $(`#view-${view}`).dataset.title;
  $("#sidebar").classList.remove("open");
  if (view === "trends" && trends.chart) { trends.chart.resize(); trends.select($("#tag-select").value, $("#range-select").value); }
}

function initNavigation() {
  $$(".nav-item").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.go)));
  $("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
}

function initControls() {
  $$(".mode-switch button").forEach(button => button.addEventListener("click", () => {
    $$(".mode-switch button").forEach(item => item.classList.remove("active")); button.classList.add("active");
    simulator.setMode(button.dataset.mode);
  }));
  $("#start-btn").addEventListener("click", () => simulator.start());
  $("#stop-btn").addEventListener("click", () => simulator.stop());
  $("#reset-btn").addEventListener("click", () => simulator.emergency ? simulator.resetEmergency() : toast("Reset ejecutado: no había fallos enclavados."));
  $("#emergency-btn").addEventListener("click", () => simulator.triggerEmergency());
  $("#advance-btn").addEventListener("click", () => simulator.advance());
  $("#step-mode").addEventListener("change", event => { simulator.stepMode = event.target.checked; simulator.emitState(); });
  $("#new-batch-btn").addEventListener("click", () => { populateBatchForm(); $("#batch-dialog").showModal(); });
  $("#batch-form").addEventListener("submit", submitBatch);
  $("#role-select").value = role;
  $("#role-select").addEventListener("change", event => { role = event.target.value; safeStore("dagoca-role", role); renderRecipes(); toast(`Rol demo cambiado a ${role}.`); });
  $("#theme-toggle").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme; safeStore("dagoca-theme", theme);
  });
  $("#sound-toggle").addEventListener("click", event => {
    soundEnabled = !soundEnabled; event.currentTarget.textContent = soundEnabled ? "🔊" : "🔇";
    safeStore("dagoca-sound", String(soundEnabled)); toast(soundEnabled ? "Aviso sonoro habilitado." : "Aviso sonoro silenciado.");
  });
  $("#sound-toggle").textContent = soundEnabled ? "🔊" : "🔇";
  $("#demo-alarm-btn").addEventListener("click", () => alarms.generateDemo(simulator.activeBatch?.id));
  ["alarm-priority", "alarm-equipment", "alarm-state", "alarm-search"].forEach(id => $(`#${id}`).addEventListener("input", renderAlarmTable));
  $("#start-cip-btn").addEventListener("click", startCip);
  $("#close-drawer").addEventListener("click", closeDrawer); $("#drawer-backdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });
}

function initTrends() {
  $("#tag-select").innerHTML = Object.entries(demoConfig.tags).map(([tag, meta]) => `<option value="${tag}">${tag} · ${meta.label}</option>`).join("");
  const success = trends.init($("#trend-chart"));
  $("#chart-fallback").hidden = success;
  $("#trend-chart").hidden = !success;
  const update = () => { trends.select($("#tag-select").value, $("#range-select").value); renderTrendSummary(); };
  $("#tag-select").addEventListener("change", update); $("#range-select").addEventListener("change", update);
  $("#pause-chart").addEventListener("click", event => {
    trends.paused = !trends.paused; event.currentTarget.textContent = trends.paused ? "▶ Reanudar" : "Ⅱ Pausar";
  });
  $("#export-csv").addEventListener("click", () => trends.exportCsv($("#range-select").value));
  renderTrendSummary();
  setInterval(() => { trends.refresh($("#range-select").value); renderTrendSummary(); }, 3000);
}

function initBus() {
  simulator.bus.on("state", renderAll);
  simulator.bus.on("event", renderEvents);
  simulator.bus.on("rejected", message => toast(message, "error"));
  simulator.bus.on("batch", renderAll);
  simulator.bus.on("alarms", () => {
    renderAlarmSummary(); updateAlarmEquipmentFilter(); renderAlarmTable(); renderMetrics();
    if (alarms.activeCritical && soundEnabled) beep();
  });
}

function beep() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.value = 620; gain.gain.value = .035;
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .12);
  } catch { /* El navegador puede bloquear audio sin interacción previa. */ }
}

function init() {
  const savedRecipes = (() => { try { return JSON.parse(localStorage.getItem("dagoca-recipes")); } catch { return null; } })();
  if (savedRecipes) Object.assign(demoConfig.recipes, savedRecipes);
  document.documentElement.dataset.theme = localStorage.getItem("dagoca-theme") || "dark";
  initNavigation(); initControls(); initTrends(); initBus(); renderCipSteps(); renderAll();
  $("#clock").textContent = new Date().toLocaleTimeString("es-CO");
  setInterval(() => $("#clock").textContent = new Date().toLocaleTimeString("es-CO"), 1000);
  simulator.startTimer();
}

init();
