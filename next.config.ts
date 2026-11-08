import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["highs"],
  outputFileTracingIncludes: {
    "/api/ocr-assets/*": ["./node_modules/tesseract.js-core/*.wasm.js"],
    "/api/optimize": ["./lib/optimizer-worker.mjs", "./lib/optimizer.cjs", "./lib/nutrients.mjs", "./lib/profile-estimates.mjs", "./node_modules/highs/package.json", "./node_modules/highs/build/**/*"],
  },
};
export default config;
