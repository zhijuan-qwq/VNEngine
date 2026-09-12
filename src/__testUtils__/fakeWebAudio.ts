export class FakeAudioParam {
  public value = 0;
}

class FakeAudioNode {
  public connections: unknown[] = [];
  public disconnected = false;

  public connect(node: unknown): void {
    this.connections.push(node);
  }

  public disconnect(): void {
    this.disconnected = true;
    this.connections = [];
  }
}

export class FakeGainNode extends FakeAudioNode {
  public gain = new FakeAudioParam();
}

export class FakeBufferSourceNode extends FakeAudioNode {
  public buffer: AudioBuffer | null = null;
  public loop = false;
  public starts: Array<{ when: number; offset: number | undefined }> = [];
  public stopCount = 0;

  public start(when = 0, offset?: number): void {
    this.starts.push({ when, offset });
  }

  public stop(): void {
    this.stopCount += 1;
  }
}

export class FakeAudioContext {
  public static instances: FakeAudioContext[] = [];

  public currentTime = 0;
  public destination = new FakeAudioNode() as unknown as AudioNode;
  public gains: FakeGainNode[] = [];
  public sources: FakeBufferSourceNode[] = [];
  public closed = false;
  public suspendCount = 0;
  public resumeCount = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  public createGain(): GainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node as unknown as GainNode;
  }

  public createBufferSource(): AudioBufferSourceNode {
    const node = new FakeBufferSourceNode();
    this.sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  public suspend(): Promise<void> {
    this.suspendCount += 1;
    return Promise.resolve();
  }

  public resume(): Promise<void> {
    this.resumeCount += 1;
    return Promise.resolve();
  }

  public close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

export function makeAudioBuffer(duration = 10): AudioBuffer {
  return { duration } as unknown as AudioBuffer;
}

export function asFakeGain(node: GainNode): FakeGainNode {
  return node as unknown as FakeGainNode;
}

export function makeAudioContext(): {
  context: AudioContext;
  fake: FakeAudioContext;
} {
  const fake = new FakeAudioContext();
  return { context: fake as unknown as AudioContext, fake };
}
