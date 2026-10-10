import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

import { workspaceSourceAliases } from "../../config/source-entrypoints";

const certificationImage = `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <rect width="1600" height="1000" fill="#174b72"/>
  <rect x="96" y="96" width="1408" height="808" rx="32" fill="#e8f4ff"/>
  <path d="M96 720 480 420l320 220 240-180 464 340v104H96z" fill="#5ba86f"/>
  <circle cx="1260" cy="300" r="112" fill="#f2c14e"/>
  <text x="800" y="190" text-anchor="middle" font-family="system-ui, sans-serif" font-size="64" font-weight="700" fill="#17324d">
    AT certification full image
  </text>
</svg>`.trim();

function sendCertificationImage(response: ServerResponse) {
  response.statusCode = 200;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "image/svg+xml");
  response.end(certificationImage);
}

function certificationMediaMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  const url = new URL(request.url ?? "/", "http://snap-motion.local");

  if (url.pathname.endsWith("/__at-media__/delayed.svg")) {
    setTimeout(() => sendCertificationImage(response), 1_500);
    return;
  }

  if (url.pathname.endsWith("/__at-media__/retry.svg")) {
    if (url.searchParams.has("snap-motion-retry")) {
      sendCertificationImage(response);
      return;
    }

    response.statusCode = 200;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "image/png");
    response.end("intentionally invalid image bytes");
    return;
  }

  if (url.pathname.endsWith("/__at-media__/retry-fallback.svg")) {
    sendCertificationImage(response);
    return;
  }

  if (url.pathname.endsWith("/__at-media__/invalid.png")) {
    response.statusCode = 200;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "image/png");
    response.end("intentionally invalid image bytes");
    return;
  }

  next();
}

function certificationMediaPlugin(): Plugin {
  return {
    name: "snap-motion-at-certification-media",
    configurePreviewServer(server) {
      server.middlewares.use(certificationMediaMiddleware);
    },
    configureServer(server) {
      server.middlewares.use(certificationMediaMiddleware);
    },
  };
}

/**
 * Match static directory-index redirects without losing deep-link queries. Development keeps
 * the Lab at `/`; built output serves it at `/lab/` and the Playground at both `/` and `/playground/`.
 */
function directoryTrailingSlashMiddleware(base: string, entries: readonly string[]) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? "/", "http://snap-motion.local");
    if (!entries.some((entry) => url.pathname === `${base}${entry}`)) {
      next();
      return;
    }
    response.statusCode = 308;
    response.setHeader("Location", `${url.pathname}/${url.search}`);
    response.end();
  };
}

function directoryTrailingSlashPlugin(): Plugin {
  return {
    name: "snap-motion-directory-trailing-slash",
    configurePreviewServer(server) {
      server.middlewares.use(
        directoryTrailingSlashMiddleware(server.config.base, ["playground", "lab"]),
      );
    },
    configureServer(server) {
      server.middlewares.use(directoryTrailingSlashMiddleware(server.config.base, ["playground"]));
    },
  };
}

/** Preserve the source Lab entry while publishing the Playground as the site's default page. */
function publicEntriesPlugin(): Plugin {
  return {
    name: "snap-motion-public-entries",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const lab = bundle["index.html"];
      const playground = bundle["playground/index.html"];
      if (lab?.type !== "asset" || playground?.type !== "asset") {
        throw new Error("The Lab and Playground HTML entries are required for the public build.");
      }
      this.emitFile({ type: "asset", fileName: "lab/index.html", source: lab.source });
      lab.source = playground.source;
    },
  };
}

export default defineConfig(({ command }) => ({
  build: {
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        // `index` keeps the Lab's emitted asset names unchanged.
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        playground: fileURLToPath(new URL("./playground/index.html", import.meta.url)),
      },
    },
  },
  plugins: [
    certificationMediaPlugin(),
    directoryTrailingSlashPlugin(),
    vue(),
    publicEntriesPlugin(),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // Serve only. `vite dev` (and the E2E server it backs) resolves the workspace packages from
      // source so the lab hot-reloads package edits with no build step. `vite build` keeps its
      // node_modules resolution, so every production bundle, preview, and packaged-consumer check
      // still exercises the real published entrypoints and distributable artifacts.
      ...(command === "serve" ? workspaceSourceAliases() : []),
    ],
  },
  server: {
    host: "127.0.0.1",
  },
}));
