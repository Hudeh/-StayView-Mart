const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    console.warn("Could not load env file", filePath, error.message);
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const APP_NAME = "StayView Mart";
app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId(APP_NAME);

const PORT = process.env.NEXT_PUBLIC_APP_PORT || "3003";
const APP_PROTOCOL = process.env.NEXT_PUBLIC_APP_PROTOCOL || "http";
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost";

let mainWindow = null;
let propertyPromptWindow = null;

function lastCodePath() {
  return path.join(app.getPath("userData"), "property-code.txt");
}

function getLastPropertyCode() {
  try {
    return fs.readFileSync(lastCodePath(), "utf8").trim();
  } catch {
    return "";
  }
}

function setLastPropertyCode(code) {
  try {
    fs.mkdirSync(path.dirname(lastCodePath()), { recursive: true });
    fs.writeFileSync(lastCodePath(), code);
  } catch (error) {
    console.warn(error.message);
  }
}

function isLocalDomain(domain) {
  const host = String(domain || "").split(":")[0].trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

function buildAppUrl(propertyCode) {
  const code = (propertyCode || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!code) return `http://localhost:${PORT}`;
  // 1010.localhost with no port hits Windows on port 80 and returns HTTP 404.
  if (process.env.POS_USE_LOCALHOST === "1" || isLocalDomain(APP_DOMAIN)) {
    return `http://localhost:${PORT}/?property=${encodeURIComponent(code)}`;
  }
  return `${APP_PROTOCOL}://${code}.${APP_DOMAIN}`;
}

function createPropertyPrompt() {
  const lastCode = getLastPropertyCode();
  const promptHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Segoe UI,sans-serif;margin:0;padding:24px;background:#f7f5fb}
    .card{background:#fff;padding:28px;border-radius:12px;max-width:360px;margin:auto}
    h1{margin:0 0 8px;font-size:20px;color:#5e3bb7} p{color:#6b6578;font-size:14px}
    input,button{width:100%;padding:12px;font-size:16px;border-radius:8px}
    input{border:1px solid #e4dff0;margin:12px 0}
    button{background:#7352c7;color:#fff;border:0;font-weight:700;cursor:pointer}
    .error{color:#e73145;font-size:13px;min-height:18px}
  </style></head><body><div class="card">
    <h1>StayView Mart</h1>
    <p>Enter the property code for this supermarket.</p>
    <input id="propertyCode" value="${(lastCode || "").replace(/"/g, "&quot;")}" autofocus />
    <div id="error" class="error"></div>
    <button id="submit" type="button">Continue</button>
  </div><script>
    const input = document.getElementById("propertyCode");
    const err = document.getElementById("error");
    function submit(){
      const code = (input.value || "").trim();
      if (!code) { err.textContent = "Enter a property code."; return; }
      if (!/^[a-zA-Z0-9-]+$/.test(code)) { err.textContent = "Use letters, numbers, and hyphens."; return; }
      window.__submitPropertyCode__(code);
    }
    document.getElementById("submit").onclick = submit;
    input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  </script></body></html>`;

  propertyPromptWindow = new BrowserWindow({
    width: 440,
    height: 340,
    resizable: false,
    title: "StayView Mart",
    webPreferences: {
      preload: path.join(__dirname, "property-prompt-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  propertyPromptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(promptHtml)}`);
  propertyPromptWindow.on("closed", () => {
    propertyPromptWindow = null;
    if (!mainWindow) app.quit();
  });
}

function createMainWindow(propertyCode) {
  const url = buildAppUrl(propertyCode);
  if (propertyCode) setLastPropertyCode(propertyCode);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.on("property-code-submitted", (_event, propertyCode) => {
  if (propertyPromptWindow) {
    propertyPromptWindow.close();
    propertyPromptWindow = null;
  }
  createMainWindow(propertyCode);
});

let silentPrintWindow = null;

function ensureSilentPrintWindow() {
  if (silentPrintWindow && !silentPrintWindow.isDestroyed()) return Promise.resolve();
  silentPrintWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const blank = "<!DOCTYPE html><html><body><pre id='c' style='font-family:monospace;font-size:12px;width:80mm'></pre></body></html>";
  return silentPrintWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(blank)}`);
}

ipcMain.handle("print-receipt", async (_event, plainText, deviceName) => {
  await ensureSilentPrintWindow();
  const win = silentPrintWindow;
  if (!win || win.isDestroyed()) throw new Error("Print window unavailable");
  await win.webContents.executeJavaScript(
    `document.getElementById('c').textContent = decodeURIComponent(${JSON.stringify(encodeURIComponent(plainText || ""))}); true;`,
  );
  await new Promise((resolve, reject) => {
    const options = { silent: true, printBackground: false, copies: 1, margins: { marginType: "none" } };
    if (deviceName && String(deviceName).trim()) options.deviceName = String(deviceName).trim();
    win.webContents.print(options, (success, failureReason) => {
      if (success) resolve();
      else reject(new Error(failureReason || "Print failed"));
    });
  });
  return { ok: true };
});

ipcMain.handle("list-printers", async (event) => {
  try {
    const wc = event.sender;
    if (wc && typeof wc.getPrintersAsync === "function") {
      const printers = await wc.getPrintersAsync();
      return (printers || []).map((printer) => ({
        name: printer.name,
        displayName: printer.displayName || printer.name,
        isDefault: Boolean(printer.isDefault),
      }));
    }
    return [];
  } catch (error) {
    console.error("list-printers failed", error);
    return [];
  }
});

ipcMain.handle("print-raw-network", async (_event, payload) => {
  const host = payload && payload.host ? String(payload.host).trim() : "";
  const port = Number(payload && payload.port) || 9100;
  const plainText = payload && payload.plainText != null ? String(payload.plainText) : "";
  if (!host) throw new Error("Network printer host is required");
  const data = Buffer.from(`${plainText}\n\n\n\x1D\x56\x00`, "utf8");
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      socket.write(data, (err) => {
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end();
        resolve();
      });
    });
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${host}:${port}`));
    });
    socket.on("error", reject);
  });
  return { ok: true };
});

app.whenReady().then(() => {
  createPropertyPrompt();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
