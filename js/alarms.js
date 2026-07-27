class Alarm {
  constructor({ id = crypto.randomUUID(), priority, tag, description, equipment, batch = "—", state = "ACTIVA NO RECONOCIDA", timestamp = new Date().toISOString(), source = "simulation", variable = "—", measuredValue = "—", limit = "—", acknowledgedAt = null, acknowledgedBy = null, normalizedAt = null, automaticAction = "Registro y aviso al operador" }) {
    const legacy = { Activa: "ACTIVA NO RECONOCIDA", Reconocida: "ACTIVA RECONOCIDA", Normalizada: "NORMALIZADA NO RECONOCIDA" };
    Object.assign(this, { id, priority, tag, description, equipment, batch, state: legacy[state] || state, timestamp, source, variable, measuredValue, limit, acknowledgedAt, acknowledgedBy, normalizedAt, automaticAction });
  }
}

const alarmCatalog = [
  ["Crítica", "ESD-001", "Parada de emergencia activada", "Seguridad"],
  ["Alta", "LSH-100", "Nivel alto en almacenamiento de agua", "TK-002"],
  ["Alta", "LSL-100", "Nivel bajo en almacenamiento de agua", "TK-002"],
  ["Alta", "LSH/LSL-100", "Inconsistencia entre señales de nivel", "TK-002"],
  ["Alta", "FLT-P-001", "Falla de bomba P-001", "P-001"],
  ["Alta", "FLT-P-002", "Falla de bomba P-002", "P-002"],
  ["Alta", "FLT-P-003", "Falla de bomba P-003", "P-003"],
  ["Alta", "TAH-105", "Temperatura alta de maceración", "TK-003"],
  ["Media", "TAL-105", "Temperatura baja de maceración", "TK-003"],
  ["Alta", "TAH-107", "Temperatura alta de cocción", "TK-005"],
  ["Media", "AIT-105", "pH simulado fuera de la ventana de receta", "TK-003"],
  ["Alta", "TAH-109", "Temperatura de salida igual o superior a 35 °C", "E-001"],
  ["Alta", "SEL-TF", "Fermentador seleccionado no disponible", "Fermentación"],
  ["Media", "AIT-SG-TF", "Fermentación sin progreso de densidad", "Fermentación"],
  ["Alta", "PAH-TF", "Presión alta en fermentador", "Fermentación"],
  ["Media", "TAL/H-TM", "Temperatura fuera de rango", "Maduración"],
  ["Media", "AIT-125", "Turbidez simulada alta en Filtrado II", "TK-007"],
  ["Alta", "PDT-125", "Diferencial simulado alto en Filtrado II", "TK-007"],
  ["Media", "CIP-SEQ", "Limpieza incompleta", "CIP-01"],
  ["Alta", "ROUTE-INT", "Ruta de válvulas incompatible", "Válvulas"],
  ["Crítica", "COM-PLC", "Falla de comunicación PLC-HMI", "Control"]
  ,["Alta", "PS-24V", "Baja tensión de alimentación 24 VDC", "Control"]
];

const safeRead = () => {
  try { return JSON.parse(localStorage.getItem("dagoca-alarms") || "[]"); }
  catch { return []; }
};

class AlarmManager {
  constructor(bus) {
    this.bus = bus;
    this.alarms = safeRead().map(item => new Alarm(item));
    this.demoIndex = 1;
    bus.on("emergency", active => active ? this.raise({ priority: "Crítica", tag: "ESD-001", description: "Parada de emergencia activada", equipment: "Seguridad", source: "process" }) : this.normalizeByTag("ESD-001"));
  }

  raise(data) {
    const existing = this.alarms.find(item => item.tag === data.tag && item.state !== "CERRADA");
    if (existing) return existing;
    const alarm = new Alarm(data);
    this.alarms.unshift(alarm);
    this.persist(); this.bus.emit("alarms", this.alarms);
    return alarm;
  }

  generateDemo(batch = "—") {
    const [priority, tag, description, equipment] = alarmCatalog[this.demoIndex++ % alarmCatalog.length];
    return this.raise({ priority, tag, description, equipment, batch });
  }

  acknowledge(id, user = "Operador") {
    const alarm = this.alarms.find(item => item.id === id);
    if (!alarm || alarm.state === "CERRADA") return;
    alarm.acknowledgedAt = new Date().toISOString();
    alarm.acknowledgedBy = user;
    alarm.state = alarm.state === "NORMALIZADA NO RECONOCIDA" ? "CERRADA" : "ACTIVA RECONOCIDA";
    this.persist(); this.bus.emit("alarms", this.alarms);
  }

  normalizeByTag(tag) {
    this.alarms.filter(item => item.tag === tag && item.state !== "CERRADA").forEach(item => {
      item.normalizedAt = new Date().toISOString();
      item.state = item.state === "ACTIVA RECONOCIDA" ? "CERRADA" : "NORMALIZADA NO RECONOCIDA";
    });
    this.persist(); this.bus.emit("alarms", this.alarms);
  }

  close(id) {
    const alarm = this.alarms.find(item => item.id === id);
    if (!alarm || !alarm.normalizedAt) return false;
    alarm.state = "CERRADA";
    this.persist(); this.bus.emit("alarms", this.alarms);
    return true;
  }

  persist() {
    try { localStorage.setItem("dagoca-alarms", JSON.stringify(this.alarms.slice(0, 100))); } catch { /* La UI sigue operativa sin persistencia. */ }
  }

  get activeCritical() { return this.alarms.some(item => item.priority === "Crítica" && item.state.startsWith("ACTIVA")); }
}
