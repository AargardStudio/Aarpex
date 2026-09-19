// Vercel Function entrypoint.
//
// This does NOT import ../server.ts directly. An earlier attempt did
// (`export { default } from "../server.ts"`) and deployed successfully,
// but crashed every request with:
//   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server.ts'
// Vercel compiles the /api entrypoint itself, but a raw .ts file reached
// only via a relative import from that entrypoint isn't transformed or
// bundled the same way -- it's still TypeScript source at runtime, and
// Node can't execute that.
//
// The project's own `npm run build` script already produces exactly what's
// needed: `esbuild server.ts --bundle --platform=node --format=cjs
// --packages=external --outfile=dist/server.cjs` bundles the whole Express
// app (server.ts + its own local imports) into one plain, already-compiled
// CommonJS file. vercel.json's buildCommand now runs that full `npm run
// build` (instead of just `vite build`), so dist/server.cjs exists by the
// time this function is packaged, and importing it here needs no further
// compilation -- it's just plain JS, however Vercel decides to bundle or
// trace this file.
export { default } from "../dist/server.cjs";
