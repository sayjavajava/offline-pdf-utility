/**
 * Client side of the PDF worker (F-9 / P2-24).
 *
 * The worker is inlined into the bundle (`?worker&inline`) because the app
 * ships as a single HTML file opened from disk — a worker referenced as a
 * sibling file could never be fetched from a null origin.
 */
import PdfWorker from './pdf.worker?worker&inline';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let disabled = false;
let nextId = 1;
const pending = new Map<number, Pending>();

/** Mark an error as a transport failure so callers can retry inline. */
function transportFailure(message: string): Error {
  const error = new Error(message);
  (error as { workerTransportFailure?: boolean }).workerTransportFailure = true;
  return error;
}

export function workerAvailable(): boolean {
  return !disabled && typeof Worker !== 'undefined';
}

/** Drop the worker and fail everything waiting on it, so nothing hangs. */
function teardown(reason: string) {
  disabled = true;
  worker?.terminate();
  worker = null;
  for (const [, entry] of pending) entry.reject(transportFailure(reason));
  pending.clear();
}

function ensureWorker(): Worker {
  if (worker) return worker;

  const created = new PdfWorker();
  created.onmessage = (event: MessageEvent) => {
    const { id, ok, result, message } = event.data ?? {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(result);
    else entry.reject(new Error(message));
  };
  created.onerror = () => teardown('The PDF worker stopped unexpectedly.');
  created.onmessageerror = () => teardown('The PDF worker sent an unreadable message.');

  worker = created;
  return created;
}

export function runInWorker(op: string, args: unknown[]): Promise<unknown> {
  if (!workerAvailable()) return Promise.reject(transportFailure('Workers are unavailable.'));

  let active: Worker;
  try {
    active = ensureWorker();
  } catch {
    disabled = true;
    return Promise.reject(transportFailure('The PDF worker could not be started.'));
  }

  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      active.postMessage({ id, op, args });
    } catch {
      pending.delete(id);
      // Structured clone can reject an argument (a function, say). That is a
      // transport problem, not an operation failure, so fall back inline.
      reject(transportFailure('Could not send this operation to the worker.'));
    }
  });
}

/** Test seam: forget any worker state between cases. */
export function resetWorkerForTests(): void {
  worker?.terminate();
  worker = null;
  disabled = false;
  pending.clear();
}
