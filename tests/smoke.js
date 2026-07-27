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
  key: index => [...memory.keys()][index],
  get length() { return memory.size; }
};
global.CustomEvent ??= class CustomEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    this.detail = init.detail;
  }
};

for (const file of ["js/state.js", "js/recipes.js", "js/sequence.js", "js/process.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

const createSimulator = () => vm.runInThisContext("new ScadaSimulator(demoConfig)");
const fermentation = ["TK-006A", "TK-006B", "TK-006C", "TK-006D", "TK-006E"];
const maturation = ["TK-008A", "TK-008B", "TK-008C", "TK-008D", "TK-008E", "TK-008F", "TK-008G", "TK-008H", "TK-008I", "TK-008J"];
const expectedOrder = [
  "CIP_INITIAL", "WATER_PREPARATION", "MASHING", "PRIMARY_FILTRATION", "BOILING",
  "COOLING", "FERMENTATION", "MATURATION", "FINAL_FILTRATION", "PACKAGING"
];

memory.clear();
const simulator = createSimulator();
assert.deepEqual(simulator.steps.map(step => step.code), expectedOrder);
assert.deepEqual(simulator.tanks.filter(item => item.tag.startsWith("TK-006")).map(item => item.tag), fermentation);
assert.deepEqual(simulator.tanks.filter(item => item.tag.startsWith("TK-008")).map(item => item.tag), maturation);
assert.equal(new Set(simulator.equipment.keys()).size, simulator.equipment.size);

const batch = simulator.createBatch({
  id: "AUD-001",
  recipe: "DAGOCA Clara",
  volume: 481,
  fermenter: "TK-006E",
  maturation: "TK-008J",
  operator: "Prueba automática"
});
simulator.config.simulation.secondsPerStage = 4;
simulator.mode = "auto";
assert.equal(simulator.start(), true);
clearInterval(simulator.interval);
simulator.interval = null;
for (let tick = 0; simulator.activeBatch && tick < 300; tick++) simulator.tick();
assert.equal(simulator.activeBatch, null);
assert.equal(batch.status, "FINALIZADO");
assert.equal(batch.stage, "Finalizado");

memory.clear();
localStorage.setItem("dagoca-storage-schema", JSON.stringify(1));
localStorage.setItem("dagoca-batches", JSON.stringify([{
  id: "LEGACY-001",
  recipe: "DAGOCA Clara",
  volume: 481,
  fermenter: "TF-01",
  maturation: "TM-04",
  operator: "Migración",
  stage: "Filtrado II",
  stageIndex: 7,
  status: "En proceso"
}]));
const migrated = createSimulator();
assert.equal(migrated.activeBatch.stageIndex, 7);
assert.equal(migrated.activeBatch.stage, "Maduración");
assert.equal(migrated.activeBatch.fermenter, "TK-006A");
assert.equal(migrated.activeBatch.maturation, "TK-008D");
assert.equal(migrated.equipment.get("TK-008D").level, 90);
assert.equal(migrated.equipment.get("TK-007").level, 0);

const appSource = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const sequenceSource = fs.readFileSync(path.join(root, "js/sequence.js"), "utf8");
const coldStages = `${appSource}\n${sequenceSource}`.toLowerCase();
assert.doesNotMatch(coldStages, /calentar\s+(?:el\s+)?fermentador|calentar\s+(?:el\s+)?tanque\s+de\s+maduraci[oó]n/);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(html, /data-view="recipes"/);
assert.match(html, /data-view="about"/);
assert.match(html, /sequence\.js\?v=1\.3\.0/);
assert.match(html, /app\.js\?v=1\.3\.0/);

console.log("DAGOCA smoke tests: OK");
