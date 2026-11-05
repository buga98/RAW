// RAW Studio Lab: single exclusive studio lease and an in-memory FAKE wallet.
// FOR TESTS ONLY. No accounts, payments, persistent balances or hardware confirmation.
export const DEVICE_PRICES_CENTS_PER_MINUTE = Object.freeze({
  bettermaker_eq: 29,
  ngbuscomp: 19,
  ngtubecomp: 24
});
export const LAB_START_BALANCE_CENTS = 1000;

export class StudioLab {
  constructor({ balanceCents = LAB_START_BALANCE_CENTS, now = () => Date.now() } = {}) {
    if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) throw new Error("Invalid test credit balance");
    this.balanceCents = balanceCents;
    this.now = now;
    this.owner = null;
    this.lastTick = null;
    this.accruedFractionalCents = 0;
    this.spentCents = 0;
    this.enabledDevices = new Set(["bettermaker_eq"]);
  }
  get rateCentsPerMin() {
    return [...this.enabledDevices].reduce((sum, id) => sum + DEVICE_PRICES_CENTS_PER_MINUTE[id], 0);
  }
  get available() { return this.owner === null; }
  claim(client) {
    this.tick();
    if (this.owner !== null) return false;
    if (this.balanceCents < 1) return false;
    this.owner = client;
    this.lastTick = this.now();
    return true;
  }
  owns(client) { return client != null && this.owner === client; }
  setEnabled(client, ids) {
    this.tick();
    if (!this.owns(client)) throw new Error("Studio is not owned by this connection");
    if (!Array.isArray(ids) || ids.length < 1 || new Set(ids).size !== ids.length ||
        ids.some(id => !Object.hasOwn(DEVICE_PRICES_CENTS_PER_MINUTE, id))) {
      throw new Error("Invalid device selection");
    }
    this.enabledDevices = new Set(ids);
  }
  tick() {
    if (this.owner === null) return;
    const current = this.now();
    const elapsed = Math.max(0, Math.min(current - this.lastTick, 60_000));
    this.lastTick = current;
    // Fractional cents are tracked rather than rounding up every second.
    this.accruedFractionalCents += elapsed * this.rateCentsPerMin / 60_000;
    const dueCents = Math.min(this.balanceCents, Math.floor(this.accruedFractionalCents + 1e-9));
    this.accruedFractionalCents -= dueCents;
    this.balanceCents -= dueCents;
    this.spentCents += dueCents;
    if (this.balanceCents === 0) {
      const expiredClient = this.owner;
      this.owner = null;
      this.lastTick = null;
      this.accruedFractionalCents = 0;
      return expiredClient;
    }
    return null;
  }
  release(client) {
    if (!this.owns(client)) return false;
    this.tick();
    if (!this.owns(client)) return true;
    this.owner = null;
    this.lastTick = null;
    this.accruedFractionalCents = 0;
    return true;
  }
  snapshot(client) {
    return {
      type: "studio-state",
      labOnly: true,
      status: this.owner === null ? (this.balanceCents ? "free" : "credits-exhausted") :
        this.owns(client) ? "yours" : "occupied",
      owner: this.owns(client),
      balanceCents: this.owns(client) ? this.balanceCents : null,
      spentCents: this.owns(client) ? this.spentCents : null,
      devices: [...this.enabledDevices],
      rateCentsPerMin: this.rateCentsPerMin
    };
  }
}
