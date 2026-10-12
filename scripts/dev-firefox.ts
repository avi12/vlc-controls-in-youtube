/**
 * Firefox dev-server target: profile cloning (re-cloned every launch), sideload launch over web-ext-run, and
 * evaluating the rebuilt page scripts into the open YouTube tabs over RDP (Firefox's own remote debugging
 * protocol - its CDP endpoint is gone).
 *
 * Marionette and the Remote Agent are on by default so the firefox-devtools MCP can attach. Both flip
 * navigator.webdriver to true, which makes Google refuse sign-in, so `--no-marionette` drops them for a
 * one-off session to sign in to YouTube; web-ext's own RDP server survives either way.
 */

import { FALLBACK_GECKO_ID } from "../wxt.config";
import {
  type BrowserTarget,
  cloneFile,
  findFreeTcpPort,
  isYoutubePageUrl,
  LANG_ARGS,
  logEvent,
  PROJECT_ROOT,
  START_URL,
  USER_PROFILES_DIR
} from "./dev-shared";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { connect } from "node:net";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import webExtRun from "web-ext-run";

const OUTPUT_DIR_NAME = "firefox-mv3-development";
const FIREFOX_PROFILE_DIR = join(USER_PROFILES_DIR, "firefox");
const FIREFOX_REMOTE_AGENT_PORT = 9230;
const FIREFOX_MARIONETTE_PORT = 2829;
const PROBE_TIMEOUT_MS = 2000;
const POWERSHELL_TIMEOUT_MS = 10_000;
const { GECKO_ID = FALLBACK_GECKO_ID, EXTENSION_UUID = "7c1e4a52-3b9d-4f60-a8e2-5d0c9b7f1e36" } = process.env;

function findFirefoxBinary() {
  if (platform() !== "win32") {
    return undefined;
  }

  return [
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe"
  ].find(candidatePath => existsSync(candidatePath));
}

function runPowershell(script: string) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "-"], {
    input: script,
    encoding: "utf-8",
    timeout: POWERSHELL_TIMEOUT_MS
  }).stdout ?? "";
}

// ── Profile setup ────────────────────────────────────────────────────────────

// Only session state is cloned; the real prefs.js is left out so web-ext's launch prefs aren't shadowed.
// SQLite keeps recent writes (a fresh login included) in the -wal sidecar until Firefox checkpoints it, so
// the sidecars are cloned too - SQLite replays them when the dev Firefox opens each database
const FIREFOX_SESSION_FILES = [
  "cookies.sqlite",
  "cookies.sqlite-wal",
  "key4.db",
  "logins.json",
  "cert9.db",
  "permissions.sqlite",
  "permissions.sqlite-wal",
  "places.sqlite",
  "places.sqlite-wal",
  "favicons.sqlite",
  "favicons.sqlite-wal"
];

// Firefox gives a sideloaded extension a random moz-extension:// UUID per profile; pinning it keeps the
// extension's origin (and anything keyed on it) stable across sessions. remote.active-protocols=3 turns on
// both the CDP and BiDi halves of the Remote Agent the MCP attaches to
function writeUserJs() {
  const uuidByExtensionId = JSON.stringify({ [GECKO_ID]: EXTENSION_UUID });
  const lines = [
    `user_pref("extensions.webextensions.uuids", ${JSON.stringify(uuidByExtensionId)});`,
    `user_pref("marionette.port", ${FIREFOX_MARIONETTE_PORT});`,
    "user_pref(\"remote.active-protocols\", 3);"
  ];
  writeFileSync(join(FIREFOX_PROFILE_DIR, "user.js"), `${lines.join("\n")}\n`);
}

function findDefaultFirefoxProfile() {
  const firefoxDataPaths: Partial<Record<NodeJS.Platform, string>> = {
    win32: join(process.env.APPDATA ?? "", "Mozilla", "Firefox"),
    darwin: join(homedir(), "Library", "Application Support", "Firefox"),
    linux: join(homedir(), ".mozilla", "firefox")
  };
  const firefoxDataPath = firefoxDataPaths[platform()];
  const profilesIniPath = firefoxDataPath && join(firefoxDataPath, "profiles.ini");
  if (!firefoxDataPath || !profilesIniPath || !existsSync(profilesIniPath)) {
    return undefined;
  }

  // Modern Firefox records the profile in use under [Install<hash>]; the per-profile Default=1 flag is a
  // legacy fallback that can point at an abandoned profile
  const ini = readFileSync(profilesIniPath, "utf-8");
  const installedDefault = ini.match(/^\[Install[0-9A-F]+][\r\n]+(?:[^\r\n]*[\r\n]+)*?Default=(.+)$/m)?.[1];
  if (installedDefault) {
    return join(firefoxDataPath, installedDefault.trim());
  }

  const defaultSection = ini.split(/(?=^\[Profile\d)/m).find(section => /^Default=1$/m.test(section));
  const profilePath = defaultSection?.match(/^Path=(.+)$/m)?.[1].trim();
  if (!defaultSection || !profilePath) {
    return undefined;
  }

  const isRelative = /^IsRelative=1$/m.test(defaultSection);
  return isRelative ? join(firefoxDataPath, profilePath) : profilePath;
}

// Re-cloned every launch, so a fresh login in the real Firefox reaches the next dev session
function setupFirefoxProfile() {
  mkdirSync(FIREFOX_PROFILE_DIR, { recursive: true });
  const sourceProfile = findDefaultFirefoxProfile();
  if (sourceProfile && existsSync(sourceProfile)) {
    console.log(`Cloning Firefox profile from ${sourceProfile}...`);
    for (const file of FIREFOX_SESSION_FILES) {
      cloneFile({
        source: join(sourceProfile, file),
        destination: join(FIREFOX_PROFILE_DIR, file)
      });
    }
  }

  writeUserJs();
  return FIREFOX_PROFILE_DIR;
}

// A dev Firefox left over from a crashed session keeps the profile locked, so it is closed and its stale
// lock files removed before launching
function closeLeftoverFirefox() {
  if (platform() !== "win32") {
    return;
  }

  runPowershell(
    `
$profile = '${FIREFOX_PROFILE_DIR.replaceAll("'", "''")}'
Get-CimInstance Win32_Process -Filter "name='firefox.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500
`
  );
  for (const lockFile of ["parent.lock", ".parentlock", "lock"]) {
    rmSync(join(FIREFOX_PROFILE_DIR, lockFile), { force: true });
  }
}

// ── Content script injection over RDP ────────────────────────────────────────

// web-ext picks its -start-debugger-server port per launch, so read it off the dev Firefox's command line.
// -split, not -match: Windows PowerShell 5.1 silently fails -match when the script arrives over stdin
let rdpPort: number | undefined;

function findRdpPort() {
  if (rdpPort !== undefined || platform() !== "win32") {
    return rdpPort;
  }

  const port = Number.parseInt(runPowershell(`$p = '${FIREFOX_PROFILE_DIR.replaceAll("'", "''")}'; $cmd = Get-CimInstance Win32_Process -Filter "name='firefox.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) -and $_.CommandLine -like '*start-debugger-server*' } | Select-Object -First 1 -ExpandProperty CommandLine; if ($cmd) { ($cmd -split 'start-debugger-server ')[1].Split(' ')[0] }`).trim(), 10);
  rdpPort = Number.isNaN(port) ? undefined : port;
  return rdpPort;
}

const EVALUATION_RESULT_TYPE = "evaluationResult";

// A tab that stops answering can't hold up the reload of the others
const TAB_REFRESH_TIMEOUT_MS = 10_000;

interface RdpPacket {
  from?: string;
  type?: string;
  tabs?: {
    actor: string;
    url?: string;
  }[];
  frame?: { consoleActor?: string };
  resultID?: string;
}

// RDP frames every packet as `<byteLength>:<json>`. A reply comes from the actor the request went to and,
// unlike an event, carries no type
async function connectRdp(port: number) {
  const socket = connect(port, "127.0.0.1");
  let buffer = Buffer.alloc(0);
  const waiters: {
    isMatch: (packet: RdpPacket) => boolean;
    fulfill: (packet: RdpPacket) => void;
  }[] = [];

  socket.on("data", chunk => {
    buffer = Buffer.concat([buffer, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
    for (let iColon = buffer.indexOf(":"); iColon !== -1; iColon = buffer.indexOf(":")) {
      const length = Number.parseInt(buffer.subarray(0, iColon).toString(), 10);
      const isPacketComplete = buffer.length >= iColon + 1 + length;
      if (!isPacketComplete) {
        return;
      }

      const packet: RdpPacket = JSON.parse(buffer.subarray(iColon + 1, iColon + 1 + length).toString());
      buffer = buffer.subarray(iColon + 1 + length);
      const iWaiter = waiters.findIndex(waiter => waiter.isMatch(packet));
      if (iWaiter !== -1) {
        waiters.splice(iWaiter, 1)[0].fulfill(packet);
      }
    }
  });

  function waitFor(isMatch: (packet: RdpPacket) => boolean) {
    return new Promise<RdpPacket>((fulfill, reject) => {
      waiters.push({
        isMatch,
        fulfill
      });
      socket.once("error", reject);
      socket.once("close", () => reject(new Error("RDP socket closed")));
    });
  }

  function request(message: {
    to: string;
    type: string;
  } & Record<string, unknown>) {
    const json = JSON.stringify(message);
    socket.write(`${Buffer.byteLength(json)}:${json}`);
    return waitFor(packet => packet.from === message.to && !packet.type);
  }

  await waitFor(packet => packet.from === "root");
  return {
    request,
    waitFor,
    close: () => socket.end()
  };
}

// A tab's web console evaluates in the page's own context - the MAIN world - regardless of the page's CSP. Each
// evaluation replies at once with an id, and later with its result as an event
async function refreshTabOverRdp({ rdp, tabActor, expressions }: {
  rdp: Awaited<ReturnType<typeof connectRdp>>;
  tabActor: string;
  expressions: string[];
}) {
  const { frame } = await rdp.request({
    to: tabActor,
    type: "getTarget"
  });
  const consoleActor = frame?.consoleActor;
  if (!consoleActor) {
    return false;
  }

  for (const expression of expressions) {
    const { resultID } = await rdp.request({
      to: consoleActor,
      type: "evaluateJSAsync",
      text: expression
    });
    await rdp.waitFor(packet => packet.type === EVALUATION_RESULT_TYPE && packet.resultID === resultID);
  }
  return true;
}

// Straight from the dev server into each tab, so the add-on needs neither the scripting permission nor host access.
// Firefox debugs a tab through its top frame, so a YouTube embed inside another site keeps its copy until reloaded
async function refreshYoutubeTabsOverRdp({ expressions }: { expressions: string[] }) {
  const port = findRdpPort();
  if (port === undefined) {
    logEvent("Firefox's RDP port not found - reload the YouTube tabs by hand");
    return 0;
  }

  const rdp = await connectRdp(port);
  try {
    const { tabs = [] } = await rdp.request({
      to: "root",
      type: "listTabs"
    });
    let refreshedCount = 0;
    for (const { actor, url = "" } of tabs) {
      if (!isYoutubePageUrl(url)) {
        continue;
      }

      const timedOut = new Promise<boolean>(fulfill => {
        AbortSignal.timeout(TAB_REFRESH_TIMEOUT_MS).addEventListener("abort", () => fulfill(false));
      });
      const isRefreshed = await Promise.race([
        refreshTabOverRdp({
          rdp,
          tabActor: actor,
          expressions
        }),
        timedOut
      ]);
      refreshedCount += Number(isRefreshed);
    }
    return refreshedCount;
  } finally {
    rdp.close();
  }
}

// ── Launch ───────────────────────────────────────────────────────────────────

// The Remote Agent listens for as long as Firefox runs, so a refused TCP connect means it was closed
function isRemoteAgentAlive(port: number) {
  return new Promise<boolean>(resolvePromise => {
    const socket = connect({
      port,
      host: "127.0.0.1"
    });
    function settle(isAlive: boolean) {
      socket.destroy();
      resolvePromise(isAlive);
    }

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

export function createFirefoxTarget({ isMarionetteEnabled }: {
  isMarionetteEnabled: boolean;
}): BrowserTarget {
  async function launch(profileDirectory: string) {
    // The MCP's privileged tools (piercing shadow roots, reading extension storage) only work when Firefox
    // itself was started with system access granted; web-ext passes this env down to Firefox
    if (isMarionetteEnabled) {
      process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = "1";
    }

    const remoteAgentPort = await findFreeTcpPort(FIREFOX_REMOTE_AGENT_PORT);
    const automationArgs = isMarionetteEnabled ? ["--marionette", `--remote-debugging-port=${remoteAgentPort}`] : [];
    const firefoxBinary = findFirefoxBinary();
    const runner = await webExtRun.cmd.run(
      {
        target: "firefox-desktop",
        sourceDir: resolve(PROJECT_ROOT, "build", OUTPUT_DIR_NAME),
        startUrl: [START_URL],
        keepProfileChanges: true,
        firefoxProfile: profileDirectory,
        ...firefoxBinary && {
          firefox: firefoxBinary
        },
        args: [...LANG_ARGS, ...automationArgs, "--allow-downgrade"],
        customPrefs: {
          "marionette.log.level": "Fatal",
          "marionette.port": FIREFOX_MARIONETTE_PORT,
          "app.update.auto": false,
          "app.update.enabled": false
        },
        noReload: true,
        noInput: true
      },
      { shouldExitProgram: false }
    );
    return {
      runner,
      debugPort: remoteAgentPort
    };
  }

  return {
    name: "Firefox",
    wxtBrowser: "firefox",
    outputDir: resolve(PROJECT_ROOT, "build", OUTPUT_DIR_NAME),
    outDirTemplate: OUTPUT_DIR_NAME,
    prepare: closeLeftoverFirefox,
    setupProfile: setupFirefoxProfile,
    launch,
    refreshYoutubeTabs: refreshYoutubeTabsOverRdp,
    // Without marionette there is no Remote Agent to probe; web-ext's cleanup callback is the only signal
    ...isMarionetteEnabled && {
      isBrowserAlive: isRemoteAgentAlive
    }
  };
}
