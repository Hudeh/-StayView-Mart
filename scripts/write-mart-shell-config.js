const fs = require("fs");
const path = require("path");

const config = {
  appUrl: (process.env.MART_APP_URL || "").trim(),
  appOrigin: (process.env.MART_APP_ORIGIN || "").trim().replace(/\/$/, ""),
};

const target = path.join(__dirname, "..", "electron", "bundled-config.json");
fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${target}`);
