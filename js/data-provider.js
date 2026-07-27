class ScadaDataProvider {
  async connect() { throw new Error("Proveedor de datos no configurado."); }
  disconnect() {}
  readSnapshot() { return null; }
  writeCommand() { throw new Error("Escritura no disponible."); }
  subscribe() { return () => {}; }
}

class SimulationDataProvider extends ScadaDataProvider {
  constructor(simulator) {
    super();
    this.simulator = simulator;
    this.connected = false;
  }
  async connect() { this.connected = true; return true; }
  disconnect() { this.connected = false; }
  readSnapshot() { return this.simulator.snapshot(); }
  writeCommand(command, payload) {
    if (!this.connected) throw new Error("Simulador desconectado.");
    if (typeof this.simulator[command] !== "function") throw new Error(`Comando no soportado: ${command}`);
    return this.simulator[command](payload);
  }
  subscribe(handler) {
    const listener = event => handler(event.detail);
    this.simulator.bus.addEventListener("state", listener);
    return () => this.simulator.bus.removeEventListener("state", listener);
  }
}

class OpcUaDataProvider extends ScadaDataProvider {}
class WebSocketDataProvider extends ScadaDataProvider {}
class EtherNetIpGatewayDataProvider extends ScadaDataProvider {}
