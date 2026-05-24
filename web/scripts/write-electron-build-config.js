/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

const config = {
  startUrl: process.env.ELECTRON_START_URL || "",
  apiBase: process.env.NEXT_PUBLIC_API_BASE || "",
};

const outputPath = path.join(__dirname, "..", "electron", "build-config.json");

fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
