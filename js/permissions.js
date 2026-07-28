const roleRank = Object.freeze({ Operador: 1, Supervisor: 2, Ingeniería: 3 });

const permissionMatrix = Object.freeze({
  view: 1,
  startBatch: 1,
  acknowledgeAlarm: 1,
  controlledStop: 1,
  manualOperation: 1,
  configureBatch: 1,
  editProductionDefaults: 2,
  resetProductionDefaults: 2,
  authorizeExceptionalSetpoint: 2,
  editLimits: 3,
  authorizeTransition: 2,
  resetSequence: 2,
  closeAlarm: 2,
  editCip: 2,
  forceSignal: 3,
  configureEquipment: 3,
  editSimulation: 3,
  resetSimulation: 3,
  maintenanceState: 3
});

function hasPermission(role, action) {
  return (roleRank[role] || 0) >= (permissionMatrix[action] || 99);
}

function requirePermission(role, action, notify) {
  const allowed = hasPermission(role, action);
  if (!allowed && notify) notify(`Permiso insuficiente: ${action} requiere un rol superior.`, "error");
  return allowed;
}
