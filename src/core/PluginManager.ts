import type { IPluginManager, Plugin, VNEngine } from '@/types/engine';
import type { Updatable } from './Updater';

class PluginManager implements IPluginManager, Updatable {
  private readonly plugins = new Map<string, Plugin>();
  private installed: Plugin[] = [];
  private readonly game: VNEngine;

  constructor(game: VNEngine) {
    this.game = game;
  }

  /** 仅记录元信息，不调用 install（安装由 loadAll 统一完成） */
  public register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  public unregister(name: string): void {
    const plugin = this.plugins.get(name);
    if (!plugin) return;
    if (this.installed.includes(plugin)) {
      plugin.uninstall?.(this.game);
      this.installed = this.installed.filter((item) => item !== plugin);
    }
    this.plugins.delete(name);
  }

  public get(name: string): Plugin | null {
    return this.plugins.get(name) ?? null;
  }

  public list(): Plugin[] {
    return [...this.plugins.values()];
  }

  /** 注册全部插件，按依赖拓扑排序后依次调用 install(game) */
  public loadAll(plugins: Plugin[]): void {
    for (const plugin of plugins) this.register(plugin);
    for (const plugin of this.resolveOrder()) {
      plugin.install(this.game);
      this.installed.push(plugin);
    }
  }

  public update(dt: number): void {
    for (const plugin of this.installed) plugin.update?.(dt);
  }

  /**
   * Kahn 拓扑排序：入度为 0 的插件按注册顺序安装；
   * 缺失依赖或存在循环依赖时抛错。
   */
  private resolveOrder(): Plugin[] {
    const names = new Set(this.plugins.keys());
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const name of names) {
      indegree.set(name, 0);
      dependents.set(name, []);
    }

    for (const plugin of this.plugins.values()) {
      for (const dep of new Set(plugin.dependencies ?? [])) {
        if (!names.has(dep)) {
          throw new Error(
            `Plugin "${plugin.name}" depends on missing plugin "${dep}"`,
          );
        }
        indegree.set(plugin.name, (indegree.get(plugin.name) ?? 0) + 1);
        dependents.get(dep)?.push(plugin.name);
      }
    }

    const queue: string[] = [];
    for (const [name, degree] of indegree) {
      if (degree === 0) queue.push(name);
    }

    const order: Plugin[] = [];
    while (queue.length > 0) {
      const name = queue.shift();
      if (name === undefined) break;
      const plugin = this.plugins.get(name);
      if (plugin) order.push(plugin);
      for (const dependent of dependents.get(name) ?? []) {
        const remaining = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, remaining);
        if (remaining === 0) queue.push(dependent);
      }
    }

    if (order.length !== this.plugins.size) {
      throw new Error('Circular plugin dependency detected');
    }
    return order;
  }
}

export { PluginManager };
export default PluginManager;
