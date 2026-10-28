import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react(), {
      name: 'bidwave-api',
      async configureServer(server) {
        const [{ createApp }, { openDatabase }, { nodeHandler }] = await Promise.all([
          import('./server/app.js'), import('./server/database.js'), import('./server/http.js'),
        ]);
        const app = createApp({ db: openDatabase(env.DATABASE_PATH || 'data/bidwave.sqlite'), env });
        app.start();
        const handler = nodeHandler(app);
        server.middlewares.use((req, res, next) => req.url.startsWith('/api/') ? handler(req, res) : next());
        server.httpServer?.once('close', () => { app.stop(); app.db.close(); });
      },
    }],
  };
});
