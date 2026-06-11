import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import syncMatchesHandler from './api/sync-matches';
import checkMatchResultHandler from './api/check-match-result';

type LocalHandler = typeof syncMatchesHandler;

function registerJsonApiRoute(server: ViteDevServer, path: string, handler: LocalHandler) {
  server.middlewares.use(path, async (request, response) => {
    const requestUrl = new URL(request.url ?? '', 'http://localhost');
    let statusCode = 200;

    try {
      await handler(
        {
          method: request.method,
          query: Object.fromEntries(requestUrl.searchParams.entries()),
        },
        {
          setHeader(name, value) {
            response.setHeader(name, value);
          },
          status(code) {
            statusCode = code;
            response.statusCode = code;
            return this;
          },
          json(body) {
            response.statusCode = statusCode;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(body));
          },
        },
      );
    } catch (error) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Erro inesperado na rota local.',
        }),
      );
    }
  });
}

function localApiPlugin(): Plugin {
  return {
    name: 'local-api-routes',
    configureServer(server) {
      registerJsonApiRoute(server, '/api/sync-matches', syncMatchesHandler);
      registerJsonApiRoute(server, '/api/check-match-result', checkMatchResultHandler);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  return {
    plugins: [react(), localApiPlugin()],
  };
});
