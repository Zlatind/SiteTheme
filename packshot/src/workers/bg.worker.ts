/// <reference lib="webworker" />
import { preload, segmentForeground, type Config } from '@imgly/background-removal';
import { serve } from './rpc';

type Model = 'isnet_fp16' | 'isnet_quint8';

const config = (model: Model, gpu: boolean, progress: Config['progress']): Config => ({
  model,
  device: gpu ? 'gpu' : 'cpu',
  output: { format: 'image/x-rgba8', quality: 1 },
  progress,
});

serve({
  async preload({ model, gpu }: { model: Model; gpu: boolean }, ctx) {
    await preload(config(model, gpu, (key, current, total) => ctx.progress({ key, current, total })));
    return true;
  },

  /** Returns the alpha mask (w*h bytes) for a raw RGBA image. */
  async segment({ buf, w, h, model, gpu }: { buf: ArrayBuffer; w: number; h: number; model: Model; gpu: boolean }, ctx) {
    const input = new Blob([buf], { type: `image/x-rgba8;width=${w};height=${h}` });
    const out = await segmentForeground(
      input,
      config(model, gpu, (key, current, total) => ctx.progress({ key, current, total })),
    );
    const rgba = new Uint8Array(await out.arrayBuffer());
    const n = w * h;
    if (rgba.length !== n * 4) throw new Error(`Unexpected mask size ${rgba.length}`);
    const data = new Uint8Array(n);
    for (let i = 0, p = 3; i < n; i++, p += 4) data[i] = rgba[p];
    ctx.transfer.push(data.buffer);
    return { w, h, data };
  },
});
