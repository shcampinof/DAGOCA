const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const memory = new Map();

global.localStorage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
  clear: () => memory.clear(),
  key: index => [...memory.keys()][index],
  get length() { return memory.size; }
};
global.CustomEvent ??= class CustomEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    this.detail = init.detail;
  }
};

for (const file of ["js/state.js", "js/permissions.js", "js/recipes.js", "js/sequence.js", "js/process.js", "js/history.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

const evaluate = expression => vm.runInThisContext(expression);
const createSimulator = () => evaluate("new ScadaSimulator(demoConfig)");
const productNames = evaluate("Object.keys(productProfiles)");
const baseParameters = evaluate("({ ...baseOperatingParameters })");
const fermentation = ["TK-006A", "TK-006B", "TK-006C", "TK-006D", "TK-006E"];
const maturation = ["TK-008A", "TK-008B", "TK-008C", "TK-008D", "TK-008E", "TK-008F", "TK-008G", "TK-008H", "TK-008I", "TK-008J"];
const expectedOrder = [
  "CIP_INITIAL", "WATER_PREPARATION", "MASHING", "PRIMARY_FILTRATION", "BOILING",
  "COOLING", "FERMENTATION", "MATURATION", "FINAL_FILTRATION", "PACKAGING"
];

function batchData(index = 0, overrides = {}) {
  return {
    id: `TEST-${index + 1}`,
    product: productNames[index],
    volume: 481,
    fermenter: fermentation[index],
    maturation: maturation[index],
    operator: "Prueba automática",
    parameters: { ...baseParameters },
    ...overrides
  };
}

memory.clear();
assert.equal(productNames.length, 3, "deben existir exactamente tres perfiles activos");
assert.equal(new Set(evaluate("Object.values(productProfiles).map(item => item.sequence)")).size, 1, "los perfiles comparten una secuencia");
assert.deepEqual(evaluate("operatorSequence.map(item => item.code)"), expectedOrder);
assert.equal(evaluate("hasPermission('Operador', 'configureBatch')"), true);
assert.equal(evaluate("hasPermission('Operador', 'editProductionDefaults')"), false);
assert.equal(evaluate("hasPermission('Supervisor', 'editProductionDefaults')"), true);
assert.equal(evaluate("hasPermission('Supervisor', 'editLimits')"), false);
assert.equal(evaluate("hasPermission('Ingeniería', 'editLimits')"), true);

const simulator = createSimulator();
assert.deepEqual(simulator.steps.map(step => step.code), expectedOrder);
assert.deepEqual(simulator.tanks.filter(item => item.tag.startsWith("TK-006")).map(item => item.tag), fermentation);
assert.deepEqual(simulator.tanks.filter(item => item.tag.startsWith("TK-008")).map(item => item.tag), maturation);
assert.equal(simulator.equipment.has("P-004"), true);
assert.equal(new Set(simulator.equipment.keys()).size, simulator.equipment.size);

const callerParameters = { ...baseParameters, mashTemp: 67.2, maturationDays: 21 };
const snapshotBatch = simulator.createBatch(batchData(0, { id: "SNAPSHOT-001", parameters: callerParameters }));
callerParameters.mashTemp = 70;
assert.equal(snapshotBatch.parameters.mashTemp, 67.2, "el lote conserva una copia de parámetros");
assert.equal(Object.isFrozen(snapshotBatch.parameters), true, "la copia de parámetros es inmutable");
simulator.activeBatch = snapshotBatch;
assert.equal(simulator.effectiveSetpoint("TT-105"), 67.2, "el SP efectivo llega al simulador");
assert.equal(simulator.effectiveSetpoint("TT-113"), 3, "el SP de maduración llega al simulador");

for (const [key, invalid] of [
  ["mashMinutes", -1], ["mashMinutes", 121],
  ["boilMinutes", 181], ["postBoilWaitMinutes", 61],
  ["coolerOutletTemp", 35], ["maturationDays", 13]
]) {
  const errors = evaluate(`validateOperatingParameters(${JSON.stringify({ ...baseParameters, [key]: invalid })})`);
  assert.ok(errors[key], `${key} debe rechazar ${invalid}`);
}

memory.clear();
const coolerSimulator = createSimulator();
const coolerBatch = coolerSimulator.createBatch(batchData(0, { id: "COOL-001" }));
coolerSimulator.activeBatch = coolerBatch;
coolerBatch.stageIndex = 5;
coolerSimulator.running = true;
coolerSimulator.stageProgress = coolerSimulator.config.simulation.secondsPerStage;
coolerSimulator.equipment.get("E-001").temperature = 35;
coolerSimulator.updateConditions();
assert.equal(coolerSimulator.conditions.coolerOk, false, "E-001 bloquea PV igual a 35 °C");
assert.equal(coolerSimulator.canAdvance(), false);

memory.clear();
for (let index = 0; index < productNames.length; index++) {
  memory.clear();
  const run = createSimulator();
  const batch = run.createBatch(batchData(index, { id: `RUN-${index + 1}` }));
  run.config.simulation.secondsPerStage = 4;
  run.mode = "auto";
  assert.equal(run.start(), true);
  assert.throws(() => run.updateBatchProduct(batch.id, productNames[(index + 1) % 3]), /bloqueado/, "no puede cambiar producto iniciado");
  clearInterval(run.interval);
  run.interval = null;
  for (let tick = 0; run.activeBatch && tick < 300; tick++) run.tick();
  assert.equal(run.activeBatch, null, `el lote ${productNames[index]} debe completar la secuencia común`);
  assert.equal(batch.status, "FINALIZADO");
  assert.equal(batch.sequenceId, "DAGOCA-BATCH-V1");
}

memory.clear();
localStorage.setItem("dagoca-storage-schema", JSON.stringify(1));
localStorage.setItem("dagoca-batches", JSON.stringify([{
  id: "LEGACY-001",
  recipe: "DAGOCA Clara",
  volume: "dato inválido",
  fermenter: "TF-01",
  maturation: "TM-04",
  operator: "Migración",
  parameters: { mashTemp: "NaN", coolerOutletTemp: 99, maturationDays: 2 },
  stage: "Filtrado II",
  stageIndex: 7,
  status: "En proceso"
}]));
localStorage.setItem("dagoca-equipment", JSON.stringify({ "TK-003": { temperature: "NaN", level: 700 } }));
const migrated = createSimulator();
assert.equal(migrated.activeBatch.recipe, "DAGOCA Clara", "se conserva el nombre histórico");
assert.equal(migrated.activeBatch.product, "DAGOCA Clara");
assert.equal(migrated.activeBatch.stageIndex, 7);
assert.equal(migrated.activeBatch.stage, "Maduración");
assert.equal(migrated.activeBatch.fermenter, "TK-006A");
assert.equal(migrated.activeBatch.maturation, "TK-008D");
assert.equal(migrated.activeBatch.volume, 481);
assert.equal(migrated.activeBatch.parameters.mashTemp, baseParameters.mashTemp);
assert.equal(migrated.activeBatch.parameters.coolerOutletTemp, baseParameters.coolerOutletTemp);
assert.equal(migrated.activeBatch.parameters.maturationDays, 14);
assert.equal(migrated.equipment.get("TK-003").level, 100);
assert.equal(Number.isFinite(migrated.equipment.get("TK-003").temperature), true);
assert.equal(migrated.equipment.get("TK-008D").level, 90);
assert.equal(migrated.equipment.get("TK-007").level, 0);
assert.equal(JSON.parse(localStorage.getItem("dagoca-storage-schema")), 3);

global.__trendSimulator = migrated;
const trendManager = evaluate("new TrendManager(demoConfig, __trendSimulator)");
trendManager.selectedTag = "TT-105";
const setpointSeries = trendManager.datasets(evaluate("demoConfig.tags['TT-105']"), 15)[1];
assert.equal(setpointSeries.data.at(-1).y, migrated.activeBatch.parameters.mashTemp, "históricos usan el SP efectivo");
delete global.__trendSimulator;
const appSource = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const sequenceSource = fs.readFileSync(path.join(root, "js/sequence.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const currentMimic = appSource.slice(appSource.lastIndexOf("function renderMimic()"), appSource.indexOf("function renderMetrics()"));
const equipmentDetail = appSource.slice(appSource.indexOf("function equipmentDetailVisual"), appSource.indexOf("function detailValue"));
assert.match(currentMimic, /P-001[\s\S]*TK-002 → TK-003/);
assert.match(currentMimic, /P-002[\s\S]*TK-004 → TK-005/);
assert.match(currentMimic, /P-003[\s\S]*TK-005 → E-001/);
assert.match(currentMimic, /P-004[\s\S]*Maduración → TK-007/);
assert.doesNotMatch(currentMimic, /\["P-001", "P-002", "P-003"\]/, "las bombas de proceso no se muestran como skid final");
assert.match(currentMimic, /continuous-synoptic/);
assert.match(currentMimic, /fermenterTags\.map\(synopticTank\)/);
assert.match(currentMimic, /maturationTags\.map\(synopticTank\)/);
assert.match(currentMimic, /equipos en paralelo/);
assert.doesNotMatch(currentMimic, /process-step/, "la vista general no debe volver a ser una cuadrícula de tarjetas");
assert.match(equipmentDetail, /detail-pump/);
assert.match(equipmentDetail, /detail-exchanger/);
assert.match(equipmentDetail, /detail-valve/);
assert.match(equipmentDetail, /detail-agitator/);
assert.match(equipmentDetail, /detail-bottling/);
assert.match(equipmentDetail, /detail-cip/);
assert.doesNotMatch(equipmentDetail, /tank-large/, "el detalle no debe representar todos los equipos como tanques");
assert.match(equipmentDetail, /Temperatura de entrada/);
assert.match(equipmentDetail, /Turbidez de salida/);
assert.match(appSource, /"P-002": "TK-004", "P-003": "TK-005"/);
assert.match(appSource, /selectedMaturationTag/);
assert.match(appSource, /steamVesselTag/);
assert.match(appSource, /effectiveSp/);
assert.match(fs.readFileSync(path.join(root, "js/history.js"), "utf8"), /effectiveSetpoint/);
assert.doesNotMatch(`${appSource}\n${sequenceSource}`.toLowerCase(), /calentar\s+(?:el\s+)?fermentador|calentar\s+(?:el\s+)?tanque\s+de\s+maduraci[oó]n/);
assert.doesNotMatch(`${html}\n${appSource}`, /Aplicación académica|proyecto académico|demostración académica/i);
assert.doesNotMatch(appSource, /\bprompt\s*\(/);
assert.match(html, /Productos y sabores/);
assert.match(html, /Nueva orden de lote/);
assert.match(html, /id="sidebar-collapse"[^>]*aria-controls="sidebar"/);
assert.match(appSource, /dagoca-sidebar-collapsed/);
assert.match(css, /\.app-shell\.sidebar-collapsed \.workspace\s*\{\s*margin-left:\s*86px/);
assert.match(css, /--process-water:\s*#6ec6e8/i);
assert.match(css, /\.home-process-node\[data-go="water"\][^{]*\.symbol-level\s*\{[\s\S]*?background:\s*var\(--process-water\)/i);

console.log("DAGOCA smoke tests: OK · 3 perfiles · esquema v3 · secuencia común · SP efectivos · P-004");
