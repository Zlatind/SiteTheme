// Tiny typed request/response layer over postMessage.

export interface RpcProgress { key: string; current: number; total: number }

type Pending = {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  onProgress?: (p: RpcProgress) => void;
};

export class CancelledError extends Error {
  constructor() { super('Cancelled'); this.name = 'CancelledError'; }
}

export class WorkerClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(private factory: () => Worker) {}

  private get w(): Worker {
    if (!this.worker) {
      const w = this.factory();
      w.onmessage = (e: MessageEvent) => {
        const { rid, ok, result, error, progress } = e.data;
        const p = this.pending.get(rid);
        if (!p) return;
        if (progress) { p.onProgress?.(progress); return; }
        this.pending.delete(rid);
        if (ok) p.resolve(result);
        else p.reject(new Error(error));
      };
      w.onerror = (e) => {
        const err = new Error(e.message || 'Worker crashed');
        this.pending.forEach((p) => p.reject(err));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
      this.worker = w;
    }
    return this.worker;
  }

  call<T>(type: string, payload: unknown, transfer: Transferable[] = [], onProgress?: (p: RpcProgress) => void): Promise<T> {
    const rid = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(rid, { resolve, reject, onProgress });
      this.w.postMessage({ rid, type, payload }, transfer);
    });
  }

  /** Hard cancel: kills the worker; it is lazily recreated on the next call. */
  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach((p) => p.reject(new CancelledError()));
    this.pending.clear();
  }
}

type Handler = (payload: any, ctx: { progress: (p: RpcProgress) => void; transfer: Transferable[] }) => Promise<unknown> | unknown;

export function serve(handlers: Record<string, Handler>) {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  // Calls run strictly one after another, so a render never sees a half-loaded image.
  let queue: Promise<void> = Promise.resolve();
  scope.onmessage = (e: MessageEvent) => {
    queue = queue.then(() => handle(e));
  };
  const handle = async (e: MessageEvent) => {
    const { rid, type, payload } = e.data;
    const transfer: Transferable[] = [];
    try {
      const h = handlers[type];
      if (!h) throw new Error(`Unknown worker call: ${type}`);
      const result = await h(payload, {
        progress: (progress) => scope.postMessage({ rid, progress }),
        transfer,
      });
      scope.postMessage({ rid, ok: true, result }, transfer);
    } catch (err) {
      scope.postMessage({ rid, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
}
