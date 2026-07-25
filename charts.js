class TrendManager {
  constructor(config, simulator) {
    this.config = config;
    this.simulator = simulator;
    this.chart = null;
    this.paused = false;
    this.history = new Map();
    this.selectedTag = Object.keys(config.tags)[0];
    this.seedHistory();
  }

  seedHistory() {
    Object.entries(this.config.tags).forEach(([tag, meta]) => {
      const now = Date.now();
      const data = [];
      for (let i = 180; i >= 0; i--) {
        const wave = Math.sin(i / 14) * (meta.high - meta.low) * .035;
        const noise = (Math.random() - .5) * (meta.high - meta.low) * .025;
        data.push({ x: now - i * 60_000, y: +(meta.setpoint + wave + noise).toFixed(meta.unit === "SG" ? 3 : 2) });
      }
      this.history.set(tag, data);
    });
  }

  init(canvas) {
    if (!window.Chart) return false;
    const meta = this.config.tags[this.selectedTag];
    this.chart = new Chart(canvas, {
      type: "line",
      data: { datasets: this.datasets(meta) },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        interaction: { intersect: false, mode: "index" },
        scales: {
          x: { type: "linear", grid: { color: "rgba(145,170,162,.12)" }, ticks: { color: "#91aaa2", callback: value => new Date(value).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) } },
          y: { grid: { color: "rgba(145,170,162,.12)" }, ticks: { color: "#91aaa2" }, title: { display: true, color: "#91aaa2", text: meta.unit } }
        },
        plugins: {
          legend: { labels: { color: "#91aaa2", boxWidth: 20, usePointStyle: true } },
          tooltip: { callbacks: { title: items => new Date(items[0].parsed.x).toLocaleString("es-CO"), label: item => `${item.dataset.label}: ${item.parsed.y} ${meta.unit}` } }
        }
      }
    });
    return true;
  }

  datasets(meta, range = 15) {
    const points = this.filtered(this.selectedTag, range);
    const times = points.map(point => point.x);
    return [
      { label: this.selectedTag, data: points, borderColor: "#4ed29d", backgroundColor: "rgba(78,210,157,.08)", borderWidth: 2, pointRadius: 0, fill: true, tension: .28 },
      { label: "Setpoint", data: times.map(x => ({ x, y: meta.setpoint })), borderColor: "#5aa9ff", borderWidth: 1, pointRadius: 0, borderDash: [5, 5] },
      { label: "Límite alto", data: times.map(x => ({ x, y: meta.high })), borderColor: "#ff626b", borderWidth: 1, pointRadius: 0, borderDash: [3, 5] },
      { label: "Límite bajo", data: times.map(x => ({ x, y: meta.low })), borderColor: "#f2c94c", borderWidth: 1, pointRadius: 0, borderDash: [3, 5] }
    ];
  }

  filtered(tag, range) {
    const source = this.history.get(tag) || [];
    if (range === "batch") return source;
    const cutoff = Date.now() - Number(range) * 60_000;
    return source.filter(point => point.x >= cutoff);
  }

  select(tag, range) {
    this.selectedTag = tag;
    if (!this.chart) return;
    const meta = this.config.tags[tag];
    this.chart.data.datasets = this.datasets(meta, range);
    this.chart.options.scales.y.title.text = meta.unit;
    this.chart.update();
  }

  addPoint() {
    if (this.paused) return;
    Object.entries(this.config.tags).forEach(([tag, meta]) => {
      const source = this.history.get(tag);
      const last = source.at(-1)?.y ?? meta.setpoint;
      let target = meta.setpoint;
      const equipmentValue = this.readSimulatorValue(tag);
      if (equipmentValue != null) target = equipmentValue;
      const next = last + (target - last) * .3 + (Math.random() - .5) * (meta.high - meta.low) * .012;
      source.push({ x: Date.now(), y: +next.toFixed(meta.unit === "SG" ? 3 : 2) });
      if (source.length > 1600) source.shift();
    });
  }

  readSimulatorValue(tag) {
    const s = this.simulator.equipment;
    const map = {
      "TT-T3": s.get("T3")?.temperature, "AIT-pH-T3": s.get("T3")?.ph, "TT-T5": s.get("T5")?.temperature,
      "TT-IC1": s.get("IC1")?.temperature, "TT-TF": s.get(this.simulator.activeBatch?.fermenter)?.temperature,
      "PT-TF": s.get(this.simulator.activeBatch?.fermenter)?.pressure, "AIT-SG-TF": s.get(this.simulator.activeBatch?.fermenter)?.density,
      "TT-TM": s.get(this.simulator.activeBatch?.maturation)?.temperature, "PT-TM": s.get(this.simulator.activeBatch?.maturation)?.pressure,
      "AIT-TU-T7": s.get("T7")?.turbidity
    };
    return Number.isFinite(map[tag]) ? map[tag] : null;
  }

  refresh(range) {
    this.addPoint();
    if (!this.chart || this.paused) return;
    this.chart.data.datasets = this.datasets(this.config.tags[this.selectedTag], range);
    this.chart.update("none");
  }

  summary(range) {
    const data = this.filtered(this.selectedTag, range).map(point => point.y);
    if (!data.length) return { current: "—", min: "—", max: "—" };
    return { current: data.at(-1), min: Math.min(...data), max: Math.max(...data) };
  }

  exportCsv(range) {
    const meta = this.config.tags[this.selectedTag];
    const rows = [["timestamp", "tag", `value_${meta.unit}`], ...this.filtered(this.selectedTag, range).map(point => [new Date(point.x).toISOString(), this.selectedTag, point.y])];
    const csv = rows.map(row => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = Object.assign(document.createElement("a"), { href: url, download: `DAGOCA_${this.selectedTag}.csv` });
    anchor.click(); URL.revokeObjectURL(url);
  }
}
