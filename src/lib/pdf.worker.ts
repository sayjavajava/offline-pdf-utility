/**
 * Worker entry for PDF operations (F-9 / P2-24).
 *
 * Everything here runs off the main thread so a large document cannot freeze
 * the tab. It must stay a *classic* worker: module workers fail to start from
 * file://, which is the app's primary distribution mode (see vite.config.ts).
 */
import * as ops from './pdf-ops';

type Request = { id: number; op: string; args: unknown[] };

const post = (message: unknown) => (self as unknown as Worker).postMessage(message);

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, op, args } = event.data;
  try {
    const fn = (ops as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[op];
    if (typeof fn !== 'function') throw new Error(`Unknown PDF operation "${op}".`);
    const result = await fn(...args);
    post({ id, ok: true, result });
  } catch (error) {
    // Errors do not survive structured cloning with their prototype intact,
    // so the message is sent across and rebuilt as an Error on the other side.
    post({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
