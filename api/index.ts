// Vercel Function entrypoint.
//
// Vercel's zero-config Express detection (a root-level server.{js,ts,...}
// exporting `export default app`) only kicks in when the project has NO
// custom `buildCommand`/`outputDirectory` in vercel.json. This project needs
// both — a custom `buildCommand: "vite build"` to build the React frontend
// into `public/` — which switches Vercel into a plain static-build mode and
// skips the automatic Express-function detection entirely. The only
// reliable way to get an Express app built as a real Vercel Function
// alongside a custom build is to put its entry file under `/api`, which
// Vercel always treats as a Function regardless of buildCommand.
//
// This file is a thin re-export so `server.ts` itself doesn't have to move
// (it's still used as-is for local dev via `tsx server.ts` and for
// self-hosting via `npm start` / dist/server.cjs).
export { default } from "../server.ts";
