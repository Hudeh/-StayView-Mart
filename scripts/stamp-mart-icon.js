const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function findRcedit() {
  const root = path.join(process.env.LOCALAPPDATA || "", "electron-builder", "Cache", "winCodeSign");
  if (!fs.existsSync(root)) return "";
  for (const name of fs.readdirSync(root)) {
    const candidate = path.join(root, name, "rcedit-x64.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

exports.default = async function stampMartIcon(context) {
  if (context.electronPlatformName !== "win32") return;
  const rcedit = findRcedit();
  if (!rcedit) {
    throw new Error("rcedit-x64.exe was not found, so the StayView icon cannot be written into the app.");
  }
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icon = path.join(__dirname, "..", "public", "icon.ico");
  execFileSync(rcedit, [exe, "--set-icon", icon], { stdio: "inherit" });
};
