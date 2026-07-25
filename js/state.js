class PersistentState {
  static read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  static write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  static reset() {
    Object.keys(localStorage)
      .filter(key => key.startsWith("dagoca-"))
      .forEach(key => localStorage.removeItem(key));
  }
}

const signalQuality = Object.freeze({
  GOOD: "GOOD",
  UNCERTAIN: "UNCERTAIN",
  BAD: "BAD",
  SIMULATED: "SIMULATED"
});
