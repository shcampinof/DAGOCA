export class Alarm {
  constructor({ id = crypto.randomUUID(), priority, tag, description, equipment, batch = "—", state = "Activa", timestamp = new Date().toISOString(), source = "demo" }) {
    Object.assign(this, { id, priority, tag, description, equipment, batch, state, timestamp, source });
  }
}

const alarmCatalog = [
  ["Crítica", "ESD-001", "Parada de emergencia activada", "Seguridad"],
  ["Alta", "LSH/L-T2", "Nivel alto o bajo inconsistente", "T2"],
  ["Alta", "TAH-T3", "Temperatura alta de maceración", "T3"],
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
];

const safeRead = () => {
  try { return JSON.parse(localStorage.getItem("dagoca-alarms") || "[]"); }
  catch { return []; }
};

export class AlarmManager {
  constructor(bus) {
    this.bus = bus;
    this.alarms = safeRead().map(item => new Alarm(item));
    this.demoIndex = 1;
    bus.on("emergency", active => active ? this.raise({ priority: "Crítica", tag: "ESD-001", description: "Parada de emergencia activada", equipment: "Seguridad", source: "process" }) : this.normalizeByTag("ESD-001"));
  }

  raise(data) {
    const existing = this.alarms.find(item => item.tag === data.tag && item.state !== "Normalizada");
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

  acknowledge(id) {
    const alarm = this.alarms.find(item => item.id === id);
    if (!alarm || alarm.state === "Normalizada") return;
    alarm.state = "Reconocida";
    this.persist(); this.bus.emit("alarms", this.alarms);
  }

  normalizeByTag(tag) {
    this.alarms.filter(item => item.tag === tag && item.state !== "Normalizada").forEach(item => item.state = "Normalizada");
    this.persist(); this.bus.emit("alarms", this.alarms);
  }

  persist() {
    try { localStorage.setItem("dagoca-alarms", JSON.stringify(this.alarms.slice(0, 100))); } catch { /* La UI sigue operativa sin persistencia. */ }
  }

  get activeCritical() { return this.alarms.some(item => item.priority === "Crítica" && item.state === "Activa"); }
}
