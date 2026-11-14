import type { ScriptErrorPhase } from '@/types/script';

export interface ScriptErrorInfo {
  phase: ScriptErrorPhase;
  script?: string;
  line?: number;
  command?: string;
}

/** 解析、加载、运行时共用的错误类型；`phase` 区分发生阶段 */
export class VNScriptError extends Error {
  public readonly phase: ScriptErrorPhase;
  public readonly script?: string;
  public readonly line?: number;
  public readonly command?: string;

  constructor(message: string, info: ScriptErrorInfo, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VNScriptError';
    this.phase = info.phase;
    this.script = info.script;
    this.line = info.line;
    this.command = info.command;
  }
}

export function toScriptError(
  error: unknown,
  info: ScriptErrorInfo,
): VNScriptError {
  if (error instanceof VNScriptError) return error;
  return new VNScriptError(
    error instanceof Error ? error.message : String(error),
    info,
    { cause: error },
  );
}
