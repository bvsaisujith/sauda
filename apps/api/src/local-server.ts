import { env } from './config.js';
import { closeDb } from './db.js';
import { createApp } from './express-app.js';

const server = createApp().listen(env.PORT, () => {
  console.log(`Sauda API listening on port ${env.PORT}`);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`${signal} received, shutting down`);

  server.close(() => {
    void closeDb()
      .catch((error: unknown) => {
        console.error('Failed to close database', error);
      })
      .finally(() => {
        process.exit(0);
      });
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
