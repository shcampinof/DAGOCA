function exportBatchReport(batch, events = []) {
  const report = {
    generatedAt: new Date().toISOString(),
    batch,
    traceability: events.filter(event => event.message?.includes(batch.id))
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const anchor = Object.assign(document.createElement("a"), { href: url, download: `${batch.id}_trazabilidad.json` });
  anchor.click();
  URL.revokeObjectURL(url);
}
