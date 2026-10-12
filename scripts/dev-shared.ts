/**
 * Dev-server core shared by the browser targets (`dev-chrome.ts`, `dev-opera.ts`, `dev-firefox.ts`,
 * dispatched from `dev.ts`), ported from youtube-time-manager's extension dev server.
 *
 * It owns everything that does not depend on the browser: WXT development builds (with inline source
 * maps), the polling file watcher + debounced rebuild queue, classifying what a build effectively
 * changed, the reload decision, the dev log and shutdown. Each browser supplies a `BrowserTarget`
 * describing how to set up its isolated profile, launch it, and reload the open YouTube tabs.
 *
 * Must run via tsx (Node), not Bun - web-ext-run waits for the browser's randomly assigned debug port
 * to start listening, which depends on Node's child_process socket handling.
 */

import { reloadDevEnv } from "./dev-env";
import chokidar from "chokidar";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import {
  basename,
  dirname,
  join,
  relative,
  resolve
} from "node:path";
import { inspect } from "node:util";
import webExtRun from "web-ext-run";
import { consoleStream as webExtConsoleStream } from "web-ext-run/util/logger";
import { build } from "wxt";

export const PROJECT_ROOT = resolve(import.meta.dirname, "..");
export const USER_PROFILES_DIR = resolve(PROJECT_ROOT, "user-profiles");
export const START_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const { LANG = "en" } = process.env;
export const LANG_ARGS = LANG === "en" ? [] : [`--lang=${LANG}`];
const REBUILD_DEBOUNCE_MS = 800;

// ── Dev log ──────────────────────────────────────────────────────────────────

// Every console line (ours and WXT/Vite's) is mirrored to .dev-logs/<browser>.log, so a session's build
// output and errors survive the process being killed. The previous session is kept as .prev.log, and the
// file rotates once it passes DEV_LOG_MAX_BYTES so it never grows without bound
const DEV_LOG_DIR = resolve(PROJECT_ROOT, ".dev-logs");
const DEV_LOG_MAX_BYTES = 1_000_000;
const DEV_LOG_MAX_ENTRY_CHARS = 2000;
const devLog = {
  path: "",
  previousPath: "",
  bytes: 0
};

function rotateDevLog() {
  try {
    renameSync(devLog.path, devLog.previousPath);
  } catch { /* previous log locked - truncated in place below instead */ }
  writeFileSync(devLog.path, "");
  devLog.bytes = 0;
}

function appendToDevLog({ level, args }: {
  level: string;
  args: unknown[];
}) {
  if (!devLog.path) {
    return;
  }

  const text = args.map(arg => typeof arg === "string" ? arg : inspect(arg, {
    depth: 2,
    breakLength: 120
  })).join(" ");
  const isTooLong = text.length > DEV_LOG_MAX_ENTRY_CHARS;
  const line = `[${new Date().toISOString()}] [${level}] ${isTooLong ? `${text.slice(0, DEV_LOG_MAX_ENTRY_CHARS)} ...[truncated]` : text}\n`;
  try {
    if (devLog.bytes + line.length > DEV_LOG_MAX_BYTES) {
      rotateDevLog();
    }

    appendFileSync(devLog.path, line);
    devLog.bytes += line.length;
  } catch { /* logging must never take the dev server down */ }
}

function initDevLog(browserName: string) {
  mkdirSync(DEV_LOG_DIR, { recursive: true });
  const logName = browserName.toLowerCase();
  devLog.path = join(DEV_LOG_DIR, `${logName}.log`);
  devLog.previousPath = join(DEV_LOG_DIR, `${logName}.prev.log`);

  if (existsSync(devLog.path)) {
    rotateDevLog();
  }

  writeFileSync(devLog.path, "");
  for (const level of ["log", "warn", "error"] as const) {
    const writeToConsole = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      writeToConsole(...args);
      appendToDevLog({
        level,
        args
      });
    };
  }

  logEvent(`Dev log -> ${devLog.path}`);
}

export function logEvent(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function msSince(startedAt: number) {
  return `${Date.now() - startedAt}ms`;
}

// A transient browser/CDP hiccup during a reload must not end the whole session, so async failures are
// logged and the process kept alive. A closed stdout (EPIPE) would loop forever through console, so it exits
export function installProcessDiagnostics() {
  process.on("exit", code => logEvent(`Process exiting with code ${code}`));
  process.on("uncaughtException", (error, origin) => {
    const isClosedStdout = error instanceof Error && "code" in error && error.code === "EPIPE";
    if (isClosedStdout) {
      process.exit(1);
    }

    logEvent(`uncaughtException (${origin}) - kept alive:`);
    console.error(error);
  });
  process.on("unhandledRejection", reason => {
    logEvent("unhandledRejection - kept alive:");
    console.error(reason);
  });
}

// ── Helpers for the browser targets ──────────────────────────────────────────

export async function findFreeTcpPort(startPort: number) {
  const MAX_PROBES = 50;
  for (let port = startPort; port < startPort + MAX_PROBES; port++) {
    const isAvailable = await new Promise<boolean>(resolvePromise => {
      const server = createServer();
      server.once("error", () => resolvePromise(false));
      server.once("listening", () => server.close(() => resolvePromise(true)));
      server.listen(port, "127.0.0.1");
    });
    if (isAvailable) {
      return port;
    }
  }

  return startPort;
}

// A source browser that is running holds some profile files open (Cookies, History), so copying them
// fails with EBUSY/EPERM - skip that file and clone the rest, the dev profile still comes up
export function cloneFile({ source, destination }: {
  source: string;
  destination: string;
}) {
  if (!existsSync(source)) {
    return;
  }

  mkdirSync(dirname(destination), { recursive: true });
  try {
    cpSync(source, destination);
  } catch (error) {
    const isLockError = /EBUSY|EPERM/.test(String(error));
    if (!isLockError) {
      throw error;
    }

    logEvent(`Skipped locked profile file (source browser running?): ${basename(source)}`);
  }
}

export function sleep(durationMs: number) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, durationMs));
}

// Evaluated in the reloaded extension's background: injects its manifest's content scripts (and their CSS) into
// every open tab they match, as the browser would on load. Each new MAIN-world copy retires the one already running
// (see src/entrypoints/vlc-controls.content.ts), so the tab keeps playing - reloading it would bring up YouTube
// Music's "Leave site?" prompt, which only a click can answer. Tab URLs are hidden without the tabs permission, so
// every tab is tried and the browser refuses the ones outside the content scripts' matches. Chrome holds an
// injection into a hidden tab until the tab is shown, so only the visible tabs are waited on. Resolves to how many
// visible tabs were refreshed
export const INJECT_CONTENT_SCRIPTS_EXPRESSION = `(async () => {
  const api = globalThis.browser ?? globalThis.chrome;
  const contentScripts = api.runtime.getManifest().content_scripts ?? [];
  async function inject(tabId) {
    for (const { js = [], css = [], world = "ISOLATED", all_frames: allFrames } of contentScripts) {
      const target = { tabId, allFrames };
      if (css.length > 0) {
        await api.scripting.insertCSS({ target, files: css });
      }
      await api.scripting.executeScript({ target, files: js, world, injectImmediately: true });
    }
  }
  const visibleInjections = [];
  for (const { id, active } of await api.tabs.query({})) {
    const injection = inject(id);
    if (active) {
      visibleInjections.push(injection);
    } else {
      injection.catch(() => {});
    }
  }
  const results = await Promise.allSettled(visibleInjections);
  return results.filter(({ status }) => status === "fulfilled").length;
})()`;

// ── Build ────────────────────────────────────────────────────────────────────

async function buildExtension({ wxtBrowser, outDirTemplate }: Pick<BrowserTarget, "wxtBrowser" | "outDirTemplate">) {
  process.env.WXT_INLINE_SOURCEMAPS = "1";
  await build({
    root: PROJECT_ROOT,
    browser: wxtBrowser,
    mode: "development",
    manifestVersion: 3,
    outDirTemplate
  });
}

// The browser reads the extension straight off the output dir and holds each file open while it does, so a
// rebuild's write can hit a transient Windows file lock. Builds are idempotent, so retry rather than drop the
// edit; any other failure (a mid-edit syntax error) rethrows at once
const TRANSIENT_FS_ERROR_PATTERN = /EPERM|EBUSY/;
const BUILD_RETRY_DELAY_MS = 300;
const MAX_BUILD_ATTEMPTS = 3;

async function buildWithFsRetry(target: BrowserTarget) {
  for (let attempt = 1; ; attempt++) {
    try {
      await buildExtension(target);
      return;
    } catch (error) {
      const isTransientFsError = TRANSIENT_FS_ERROR_PATTERN.test(String(error));
      if (!isTransientFsError || attempt >= MAX_BUILD_ATTEMPTS) {
        throw error;
      }

      logEvent(`Build hit a transient file lock (attempt ${attempt}/${MAX_BUILD_ATTEMPTS}) - retrying`);
      await sleep(BUILD_RETRY_DELAY_MS);
    }
  }
}

// WXT/Vite inline env vars into every output, so an env-file edit needs a rebuild with a refreshed
// process.env. The mode is encoded in the output dir name (`{browser}-mv{n}-{mode}`)
function getEnvFiles(outputDir: string) {
  const mode = basename(outputDir).match(/-mv\d+-(.+)$/)?.[1] ?? "production";
  return [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
}

// ── Output change detection ──────────────────────────────────────────────────

// WXT rewrites every output on every build, often with identical bytes, so mtimes can't tell a real change
// from a rewrite - each file's content is hashed instead, and only an effective change counts
function hashOutputFiles(outputDir: string) {
  const hashByFile = new Map<string, string>();
  if (!existsSync(outputDir)) {
    return hashByFile;
  }

  for (const entry of readdirSync(outputDir, {
    recursive: true,
    withFileTypes: true
  })) {
    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = join(entry.parentPath, entry.name);
    const outputPath = relative(outputDir, absolutePath).replaceAll("\\", "/");
    hashByFile.set(outputPath, createHash("sha1").update(readFileSync(absolutePath)).digest("hex"));
  }
  return hashByFile;
}

function isOutputChanged({ hashesBefore, hashesAfter }: {
  hashesBefore: Map<string, string>;
  hashesAfter: Map<string, string>;
}) {
  const files = new Set([...hashesBefore.keys(), ...hashesAfter.keys()]);
  return [...files].some(file => hashesBefore.get(file) !== hashesAfter.get(file));
}

// ── Browser strategy ─────────────────────────────────────────────────────────

type WebExtRunner = Awaited<ReturnType<typeof webExtRun.cmd.run>>;

export interface LaunchedBrowser {
  runner: WebExtRunner;
  debugPort: number;
}

// What each browser supplies to runDevServer: its isolated profile, how it launches, how to refresh the content
// scripts in the open YouTube tabs (CDP on Chromium, RDP on Firefox), and optionally how to tell it is still running
export interface BrowserTarget {
  name: string;
  wxtBrowser: "chrome" | "firefox" | "opera";
  outputDir: string;
  // Each target builds into its own dir, so dev servers for two browsers never race one output dir
  outDirTemplate: string;
  prepare?: () => void;
  setupProfile: () => string;
  launch: (profileDirectory: string) => Promise<LaunchedBrowser>;
  injectIntoYoutubeTabs: (debugPort: number) => Promise<void>;
  // web-ext's own "browser closed" callback is unreliable for Firefox on Windows, so a target can supply a
  // probe; the dev server shuts down once it keeps failing
  isBrowserAlive?: (debugPort: number) => Promise<boolean>;
}

// Chrome caches content scripts when the extension loads, so even a MAIN-world change needs an extension reload,
// and that reload orphans the scripts already running in open tabs (neither browser re-injects them), so the
// rebuilt scripts are injected into the tabs right after it
async function reloadExtensionAndTabs({ target, browser, startedAt }: {
  target: BrowserTarget;
  browser: LaunchedBrowser;
  startedAt: number;
}) {
  await browser.runner.reloadAllExtensions();
  await target.injectIntoYoutubeTabs(browser.debugPort);
  logEvent(`Reloaded the extension and injected it into the YouTube tabs (${msSince(startedAt)})`);
}

// web-ext-run's info logs are noise; surface warnings and up
function suppressWebExtInfoLogs() {
  const WARN_LOG_LEVEL = 40;
  webExtConsoleStream.write = ({ level, msg: message }) => {
    if (level >= WARN_LOG_LEVEL) {
      console.warn(message);
    }
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export async function runDevServer(target: BrowserTarget) {
  process.chdir(PROJECT_ROOT);
  initDevLog(target.name);
  target.prepare?.();
  const profileDirectory = target.setupProfile();

  console.log(`Building extension for ${target.name} (development + inline source maps)...`);
  await buildExtension(target);
  console.log("Build complete.\n");

  suppressWebExtInfoLogs();
  const browser = await target.launch(profileDirectory);
  console.log(`${target.name} launched with the extension sideloaded (debug port ${browser.debugPort}).`);
  console.log("Watching for file changes...\n");

  const pending: {
    filePath?: string;
    isEnvChange: boolean;
  } = { isEnvChange: false };
  let isRebuilding = false;
  let debounceTimer: NodeJS.Timeout | undefined;
  const envFiles = getEnvFiles(target.outputDir);

  async function rebuildAndReload({ filePath, isEnvChange }: {
    filePath: string;
    isEnvChange: boolean;
  }) {
    const startedAt = Date.now();
    logEvent(`Change detected: ${filePath} - rebuilding`);
    try {
      // The startup env load never overwrites a set var, and Vite prefers process.env over the file
      if (isEnvChange) {
        reloadDevEnv();
      }

      const hashesBefore = hashOutputFiles(target.outputDir);
      await buildWithFsRetry(target);
      // An env edit counts even when no output moved: the browser may still hold the stale values
      const isReloadNeeded = isEnvChange || isOutputChanged({
        hashesBefore,
        hashesAfter: hashOutputFiles(target.outputDir)
      });
      if (!isReloadNeeded) {
        logEvent(`No effective output change (${msSince(startedAt)}) - skipped reload`);
        return;
      }

      await reloadExtensionAndTabs({
        target,
        browser,
        startedAt
      });
    } catch (error) {
      logEvent("Rebuild failed:");
      console.error(error);
    }
  }

  // A change arriving mid-rebuild is parked and drained once the build finishes, so two WXT builds never
  // write the same output dir at once
  async function drainPendingRebuild() {
    if (isRebuilding) {
      return;
    }

    isRebuilding = true;
    while (pending.filePath !== undefined) {
      const { filePath, isEnvChange } = pending;
      pending.filePath = undefined;
      pending.isEnvChange = false;
      await rebuildAndReload({
        filePath,
        isEnvChange
      });
    }
    isRebuilding = false;
  }

  // The debounce doubles as the write-settle window, so a build never reads a half-written source
  function scheduleRebuild(filePath: string) {
    pending.filePath = filePath;
    pending.isEnvChange ||= envFiles.includes(filePath.replaceAll("\\", "/"));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      await drainPendingRebuild();
    }, REBUILD_DEBOUNCE_MS);
  }

  // Polling compares mtime/size snapshots, so file reads (the build itself, the TS server, a project-wide
  // search) never register as changes - native fs.watch surfaced those as phantom rebuilds
  const watcher = chokidar.watch(["src", "wxt.config.ts", ...envFiles], {
    cwd: PROJECT_ROOT.replaceAll("\\", "/"),
    ignoreInitial: true,
    usePolling: true,
    interval: 500
  });
  watcher.on("error", error => {
    logEvent("Watcher error:");
    console.error(error);
  });
  watcher.on("all", (_event, filePath) => scheduleRebuild(filePath));

  let isExiting = false;
  async function exit() {
    if (isExiting) {
      return;
    }

    isExiting = true;
    logEvent("Shutting down - closing watcher and browser");
    const FORCED_EXIT_MS = 3000;
    setTimeout(() => process.exit(0), FORCED_EXIT_MS).unref();
    await watcher.close().catch(() => {});
    await browser.runner.exit().catch(error => {
      logEvent("runner.exit() failed:");
      console.error(error);
    });
    process.exit(0);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      logEvent(`Received ${signal}`);
      await exit();
    });
  }

  browser.runner.registerCleanup(async () => {
    logEvent(`${target.name} closed`);
    await exit();
  });

  // A short streak of failed probes (not one blip) ends the session, so a hiccup during a reload never does
  async function monitorBrowserLiveness() {
    const { isBrowserAlive } = target;
    if (!isBrowserAlive) {
      return;
    }

    const LIVENESS_POLL_MS = 2000;
    const MAX_CONSECUTIVE_FAILURES = 3;
    let consecutiveFailures = 0;
    while (!isExiting) {
      await sleep(LIVENESS_POLL_MS);

      if (isExiting) {
        return;
      }

      consecutiveFailures = await isBrowserAlive(browser.debugPort) ? 0 : consecutiveFailures + 1;

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logEvent(`${target.name} is no longer reachable - shutting down`);
        await exit();
        return;
      }
    }
  }
  await monitorBrowserLiveness();

  await new Promise(() => {});
}
