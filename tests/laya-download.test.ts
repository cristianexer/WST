import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BrowserController, type LayaBrowserArtifact } from '../apps/web/src/ai/laya-browser';

const model = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const digest = createHash('sha256').update(model).digest('hex');
const manifest: LayaBrowserArtifact = JSON.parse(readFileSync(new URL('../apps/web/public/models/laya/manifest.json', import.meta.url), 'utf8'));
const artifact: LayaBrowserArtifact = {
  ...manifest,
  model: {bytes: model.length, sha256: digest, chunks: [{url: 'https://model.test/part000', bytes: model.length, sha256: digest}]},
};
function runtime() {
  const tokenizer = Object.assign(() => ({ input_ids: { data: [10, 11] } }), {
    mask_token: '[MASK]', mask_token_id: 3, pad_token_id: 0, sep_token_id: 2,
    convert_tokens_to_ids: (token: string) => ['[PAD]', '[CLS]', '[SEP]', '[MASK]'].indexOf(token),
  });
  return {
    createTokenizer: vi.fn(async () => tokenizer),
    createSession: vi.fn(async (_model: Uint8Array) => ({provider: 'webgpu' as const, session: {run: async () => ({logits: {data: new Float32Array(16)}})}})),
    tensor: vi.fn(async () => ({})),
  };
}
afterEach(() => vi.unstubAllGlobals());

// Fetch exposes decoded bytes even though Content-Length describes the encoded
// transfer. This fixture models the observed gzip response from GitHub Pages.
describe('Laya model integrity after HTTP content decoding', () => {
  it.each(['gzip', 'br'])('loads verified decoded bytes despite a different %s transport length', async encoding => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(model, {headers: {'Content-Encoding': encoding, 'Content-Length': '5'}})));
    const mock = runtime();
    const controller = new BrowserController({artifact, runtime: mock});
    await controller.load(() => undefined);
    expect(controller.checkpoint.ready).toBe(true);
    expect(mock.createSession.mock.calls[0][0]).toEqual(model);
    controller.dispose();
  });

  it('supports absent transport metadata and ordinary identity responses', async () => {
    for (const headers of [new Headers(), new Headers({'Content-Length': '8'})]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(model, {headers})));
      const controller = new BrowserController({artifact, runtime: runtime()});
      await controller.load(() => undefined);
      expect(controller.checkpoint.ready).toBe(true);
      controller.dispose();
    }
  });

  it('still rejects truncated decoded data before creating an inference session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(model.slice(0, 7), {headers: {'Content-Encoding': 'gzip'}})));
    const mock = runtime();
    const controller = new BrowserController({artifact, runtime: mock});
    await expect(controller.load(() => undefined)).rejects.toMatchObject({code: 'integrity-failed'});
    expect(mock.createSession).not.toHaveBeenCalled();
  });

  it('still rejects same-size corruption by checksum', async () => {
    const corrupt = model.slice(); corrupt[0] = 99;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(corrupt, {headers: {'Content-Encoding': 'gzip'}})));
    const mock = runtime();
    const controller = new BrowserController({artifact, runtime: mock});
    await expect(controller.load(() => undefined)).rejects.toThrow('checksum does not match');
    expect(mock.createSession).not.toHaveBeenCalled();
  });

  it('cancels an oversized decoded stream without waiting for the server to finish', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({start(c) {c.enqueue(new Uint8Array(9));}, cancel});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {headers: {'Content-Encoding': 'gzip'}})));
    const mock = runtime();
    const controller = new BrowserController({artifact, runtime: mock});
    await expect(controller.load(() => undefined)).rejects.toMatchObject({code: 'integrity-failed'});
    expect(cancel).toHaveBeenCalledOnce();
    expect(mock.createSession).not.toHaveBeenCalled();
  }, 500);
});
