class VariableStore {
  private variables: Map<string, unknown>;
  private flags: Set<string>;

  constructor() {
    this.variables = new Map<string, unknown>();
    this.flags = new Set<string>();
  }

  public has(name: string): boolean {
    return this.variables.has(name);
  }

  public get(name: string): unknown {
    return this.variables.get(name);
  }

  public set(name: string, value: unknown): void {
    this.variables.set(name, value);
  }

  public delete(name: string): void {
    this.variables.delete(name);
  }

  public hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }

  public setFlag(flag: string): void {
    this.flags.add(flag);
  }

  public clearFlag(flag: string): void {
    this.flags.delete(flag);
  }

  public toggleFlag(flag: string): void {
    if (this.flags.has(flag)) {
      this.flags.delete(flag);
    } else {
      this.flags.add(flag);
    }
  }

  public clearAllFlags(): void {
    this.flags.clear();
  }

  public dump(): VariableStoreData {
    const variablesObj: Record<string, unknown> = {};
    this.variables.forEach((value, key) => {
      variablesObj[key] = value;
    });

    return {
      variables: variablesObj,
      flags: Array.from(this.flags),
    };
  }

  public restore(data: VariableStoreData): void {
    this.variables.clear();
    for (const [key, value] of Object.entries(data.variables)) {
      this.variables.set(key, value);
    }

    this.flags.clear();
    for (const flag of data.flags) {
      this.flags.add(flag);
    }
  }
}
export type VariableStoreData = {
  variables: Record<string, unknown>;
  flags: string[];
};
export default VariableStore;
