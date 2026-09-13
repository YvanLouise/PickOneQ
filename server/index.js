import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.js';
import { createStore } from './store.js';
import { createCredentials } from './credentials.js';

const port = Number(process.env.PORT || 4311);
const { app, tick } = createApp({ store: createStore(), credentials: createCredentials(), port });
if (process.argv.includes('--production')) {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: { port: 24679, host: '127.0.0.1' } }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(port, '127.0.0.1', () => console.log(`PickOneQ: http://127.0.0.1:${port}`));
tick();
setInterval(tick, 15000).unref();
