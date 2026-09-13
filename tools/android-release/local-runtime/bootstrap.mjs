// PickOneQ embedded-Node runtime bootstrap (nodejs-mobile, Node 18.20.4).
// Executed as `node <bundleRoot>/bootstrap.mjs --production` with cwd = bundle root.
// `server/index.js` reads process.argv itself; this file must not consume flags.

if (typeof AbortSignal.any !== 'function') {
  AbortSignal.any = function any(signals) {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  };
}

if (process.env.PICKONEQ_ROOT) {
  try { process.chdir(process.env.PICKONEQ_ROOT); } catch {}
}

await import('./server/index.js');
