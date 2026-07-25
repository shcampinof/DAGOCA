class Alarm {
  constructor({ id = crypto.randomUUID(), priority, tag, description, equipment, batch = "—", state = "ACTIVA NO RECONOCIDA", timestamp = new Date().toISOString(), source = "simulation", variable = "—", measuredValue = "—", limit = "—", acknowledgedAt = null, acknowledgedBy = null, normalizedAt = null, automaticAction = "Registro y aviso al operador" }) {
    const legacy = { Activa: "ACTIVA NO RECONOCIDA", Reconocida: "ACTIVA RECONOCIDA", Normalizada: "NORMALIZADA NO RECONOCIDA" };
    Object.assign(this, { id, priority, tag, description, equipment, batch, state: legacy[state] || state, timestamp, source, variable, measuredValue, limit, acknowledgedAt, acknowledgedBy, normalizedAt, automaticAction });
  }
}

const alarmCatalog = [
  ["Crítica", "ESD-001", "Parada de emergencia activada", "Seguridad"],
  ["Alta", "LSH-T2", "Nivel alto en almacenamiento de agua", "T2"],
  ["Alta", "LSL-T2", "Nivel bajo en almacenamiento de agua", "T2"],
  ["Alta", "LSH/L-T2", "Inconsistencia entre señales de nivel", "T2"],
  ["Alta", "FLT-B1", "Falla de bomba B1", "B1"],
  ["Alta", "FLT-B2", "Falla de bomba B2", "B2"],
  ["Alta", "FLT-B3", "Falla de bomba B3", "B3"],
  ["Alta", "TAH-T3", "Temperatura alta de maceración", "T3"],
  ["Media", "TAL-T3", "Temperatura baja de maceración", "T3"],
  ["Alta", "TAH-T5", "Temperatura alta de cocción", "T5"],
  ["Media", "AIT-pH-T3", "pH fuera de la ventana de receta", "T3"],
  ["Alta", "TAH-IC1", "Temperatura de salida demasiado alta", "IC1"],
  ["Alta", "SEL-TF", "Fermentador seleccionado no disponible", "Fermentación"],
  ["Media", "AIT-SG-TF", "Fermentación sin progreso de densidad", "Fermentación"],
  ["Alta", "PAH-TF", "Presión alta en fermentador", "Fermentación"],
  ["Media", "TAL/H-TM", "Temperatura fuera de rango", "Maduración"],
  ["Media", "AIT-TU-T7", "Turbidez alta antes o después del filtrado", "T7"],
  ["Alta", "PDT-T7", "Diferencial / TMP alto en filtro", "T7"],
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
