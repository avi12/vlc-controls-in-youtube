/**
 * Chromium dev-server target factory, shared by every Chromium-family browser (Chrome here, Opera in
 * `dev-opera.ts`): profile cloning, sideload launch over web-ext-run, and evaluating the rebuilt page scripts
 * into the open YouTube tabs over CDP.
 *
 * Every Chromium target launches against its OWN cloned `--user-data-dir` under user-profiles/, seeded once
 * from the real profile so the dev browser carries the YouTube session, while closing it never touches the
 * user's real browser.
 */

import {
  type BrowserTarget,
  cloneFile,
  findFreeTcpPort,
  isYoutubePageUrl,
  LANG_ARGS,
  PROJECT_ROOT,
  START_URL,
  USER_PROFILES_DIR
} from "./dev-shared";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import webExtRun from "web-ext-run";

const DEFAULT_CHROMIUM_PROFILE_NAME = "Default";

interface ChromiumTargetOptions {
  name: string;
  wxtBrowser: "chrome" | "opera";
  // Sub-directory under user-profiles/ for this browser's isolated dev profile
  profileSubdir: string;
  // Preferred debug port; the first free loopback port at or above it is used, so another browser already
  // listening there can never capture this server's reloads
  debugPort: number;
  // Where each OS keeps this browser's real "User Data" root, cloned once into the dev profile
  sourceUserData: Partial<Record<NodeJS.Platform, string>>;
  // The real profile to clone, when it isn't the default one
  sourceProfileName?: string;
  // Omit for Chrome (web-ext finds it)
  findBinary?: () => string | undefined;
}

// ── Profile setup ────────────────────────────────────────────────────────────

// Only what a logged-in debug session needs: Local State holds the key that decrypts the cookies, the
// profile files carry settings and session, Network/ the cookies themselves. Cache, extensions and storage
// are skipped so the browser starts lean
const USER_DATA_FILES = ["Local State"];
const PROFILE_FILES = [
  "Preferences",
  "Secure Preferences",
  "Bookmarks",
  "Login Data",
  "Login Data For Account",
  "History",
  "Favicons",
  "Web Data",
  "Top Sites"
];
const PROFILE_NETWORK_FILES = ["Cookies", "Network Persistent State", "TransportSecurity"];

// web-ext loads the unpacked build over CDP, which needs developer mode on - the cloned preferences carry
// the real profile's setting, which may be off
function ensureDeveloperMode(profileDir: string) {
  const preferencesPath = join(profileDir, DEFAULT_CHROMIUM_PROFILE_NAME, "Preferences");
  mkdirSync(dirname(preferencesPath), { recursive: true });
  const preferences = existsSync(preferencesPath) ? JSON.parse(readFileSync(preferencesPath, "utf-8")) : {};
  preferences.extensions = {
    ...preferences.extensions,
    ui: {
      ...preferences.extensions?.ui,
      developer_mode: true
    }
  };
  delete preferences.protection;
  writeFileSync(preferencesPath, JSON.stringify(preferences));
}

function setupChromiumProfile({ profileDir, sourceUserData, sourceProfileName = DEFAULT_CHROMIUM_PROFILE_NAME }: {
  profileDir: string;
} & Pick<ChromiumTargetOptions, "sourceUserData" | "sourceProfileName">) {
  const seededSentinel = join(profileDir, DEFAULT_CHROMIUM_PROFILE_NAME, ".seeded");
  const isSeeded = existsSync(seededSentinel);
  const sourceRoot = sourceUserData[platform()];
  const sourceProfile = sourceRoot && join(sourceRoot, sourceProfileName);
  if (!isSeeded && sourceRoot && sourceProfile && existsSync(sourceProfile)) {
    console.log(`Cloning ${basename(profileDir)} profile from ${sourceProfile}...`);
    const destinationProfile = join(profileDir, DEFAULT_CHROMIUM_PROFILE_NAME);
    for (const file of USER_DATA_FILES) {
      cloneFile({
        source: join(sourceRoot, file),
        destination: join(profileDir, file)
      });
    }
    for (const file of PROFILE_FILES) {
      cloneFile({
        source: join(sourceProfile, file),
        destination: join(destinationProfile, file)
      });
    }
    for (const file of PROFILE_NETWORK_FILES) {
      cloneFile({
        source: join(sourceProfile, "Network", file),
        destination: join(destinationProfile, "Network", file)
      });
    }
  }

  ensureDeveloperMode(profileDir);
  writeFileSync(seededSentinel, "");
  return profileDir;
}

// ── Refreshing the open tabs over CDP ────────────────────────────────────────

// A page that stops answering can't hold up the reload of the others
const TAB_REFRESH_TIMEOUT_MS = 10_000;
// An embed on another site is a cross-site frame, which Chrome debugs as a target of its own
const REFRESHED_TARGET_TYPES = new Set(["page", "iframe"]);

interface CdpTarget {
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface CdpFrameTree {
  frame: {
    id: string;
    url: string;
  };
  childFrames?: CdpFrameTree[];
}

interface CdpExecutionContext {
  id: number;
  auxData?: {
    isDefault?: boolean;
    frameId?: string;
  };
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: { context?: CdpExecutionContext };
  result?: { frameTree?: CdpFrameTree };
}

function readFrameUrls(frameTree: CdpFrameTree | undefined) {
  const urlByFrameId = new Map<string, string>();
  const pendingTrees = frameTree ? [frameTree] : [];
  for (let tree = pendingTrees.pop(); tree; tree = pendingTrees.pop()) {
    urlByFrameId.set(tree.frame.id, tree.frame.url);
    pendingTrees.push(...tree.childFrames ?? []);
  }
  return urlByFrameId;
}

// Every frame of the target that shows a YouTube page gets the rebuilt scripts in its main world - the page's own
// context, which CDP evaluates in regardless of the page's CSP. Runtime.enable replays one executionContextCreated
// event per existing context before it replies, so the list is complete by then. Tells whether any frame was reached
async function refreshTargetOverCdp({ webSocketUrl, expressions }: {
  webSocketUrl: string;
  expressions: string[];
}) {
  const webSocket = new WebSocket(webSocketUrl);
  const contexts: CdpExecutionContext[] = [];
  const replyById = new Map<number, (message: CdpMessage) => void>();
  let nextId = 1;
  webSocket.onmessage = e => {
    const message: CdpMessage = JSON.parse(String(e.data));
    if (message.method === "Runtime.executionContextCreated" && message.params?.context) {
      contexts.push(message.params.context);
    }

    if (message.id === undefined) {
      return;
    }

    replyById.get(message.id)?.(message);
    replyById.delete(message.id);
  };

  function call(method: string, params: Record<string, unknown> = {}) {
    return new Promise<CdpMessage>(fulfill => {
      const id = nextId++;
      replyById.set(id, fulfill);
      webSocket.send(
        JSON.stringify({
          id,
          method,
          params
        })
      );
    });
  }

  async function refresh() {
    await new Promise(fulfill => webSocket.addEventListener("open", fulfill, { once: true }));
    const { result } = await call("Page.getFrameTree");
    const urlByFrameId = readFrameUrls(result?.frameTree);
    await call("Runtime.enable");
    const youtubeContexts = contexts.filter(({ auxData }) => {
      const frameUrl = auxData?.isDefault && auxData.frameId ? urlByFrameId.get(auxData.frameId) : undefined;
      return frameUrl !== undefined && isYoutubePageUrl(frameUrl);
    });
    for (const { id: contextId } of youtubeContexts) {
      for (const expression of expressions) {
        await call("Runtime.evaluate", {
          expression,
          contextId
        });
      }
    }
    return youtubeContexts.length > 0;
  }

  const timedOut = new Promise<boolean>(fulfill => {
    AbortSignal.timeout(TAB_REFRESH_TIMEOUT_MS).addEventListener("abort", () => fulfill(false));
  });
  try {
    return await Promise.race([refresh(), timedOut]);
  } catch {
    return false;
  } finally {
    webSocket.close();
  }
}

// Straight from the dev server into each page over its own debugging session, so the extension needs neither the
// scripting permission nor host access, and a service worker still starting up can't delay it
async function refreshYoutubeTabsOverCdp({ debugPort, expressions }: {
  debugPort: number;
  expressions: string[];
}) {
  const targets: CdpTarget[] = await fetch(`http://127.0.0.1:${debugPort}/json`)
    .then(response => response.json())
    .catch(() => []);
  const webSocketUrls = targets.flatMap(target => {
    const isYoutubeTarget = REFRESHED_TARGET_TYPES.has(target.type ?? "") && isYoutubePageUrl(target.url ?? "");
    return isYoutubeTarget && target.webSocketDebuggerUrl ? [target.webSocketDebuggerUrl] : [];
  });
  const results = await Promise.all(
    webSocketUrls.map(webSocketUrl => refreshTargetOverCdp({
      webSocketUrl,
      expressions
    }))
  );
  return results.filter(Boolean).length;
}

// ── Target factory ───────────────────────────────────────────────────────────

export function createChromiumTarget(options: ChromiumTargetOptions): BrowserTarget {
  const outputDirName = `${options.name.toLowerCase()}-mv3-development`;
  const profileDir = join(USER_PROFILES_DIR, options.profileSubdir);

  async function launch(profileDirectory: string) {
    const debugPort = await findFreeTcpPort(options.debugPort);
    if (debugPort !== options.debugPort) {
      console.log(`${options.name} debug port ${options.debugPort} busy; using ${debugPort} instead`);
    }

    const chromiumBinary = options.findBinary?.();
    const runner = await webExtRun.cmd.run(
      {
        target: "chromium",
        sourceDir: resolve(PROJECT_ROOT, "build", outputDirName),
        startUrl: [START_URL],
        keepProfileChanges: true,
        chromiumProfile: profileDirectory,
        ...chromiumBinary && {
          chromiumBinary
        },
        args: [
          ...LANG_ARGS,
          "--remote-debugging-address=127.0.0.1",
          `--remote-debugging-port=${debugPort}`,
          "--no-first-run",
          "--no-default-browser-check",
          `--profile-directory=${DEFAULT_CHROMIUM_PROFILE_NAME}`,
          "--disable-blink-features=AutomationControlled"
        ],
        noReload: true,
        noInput: true
      },
      { shouldExitProgram: false }
    );
    return {
      runner,
      debugPort
    };
  }

  return {
    name: options.name,
    wxtBrowser: options.wxtBrowser,
    outputDir: resolve(PROJECT_ROOT, "build", outputDirName),
    outDirTemplate: outputDirName,
    setupProfile: () => setupChromiumProfile({
      profileDir,
      sourceUserData: options.sourceUserData,
      sourceProfileName: options.sourceProfileName
    }),
    launch,
    refreshYoutubeTabs: refreshYoutubeTabsOverCdp
  };
}

// ── Chrome ───────────────────────────────────────────────────────────────────

// 9222 is often already taken by the user's own debuggable browser
const CHROME_DEBUG_PORT = 9333;
const { LOCALAPPDATA = "" } = process.env;

export const chromeTarget = createChromiumTarget({
  name: "Chrome",
  wxtBrowser: "chrome",
  profileSubdir: "chrome",
  debugPort: CHROME_DEBUG_PORT,
  sourceProfileName: process.env.DEV_CHROME_SOURCE_PROFILE,
  sourceUserData: {
    win32: join(LOCALAPPDATA, "Google", "Chrome", "User Data"),
    darwin: join(homedir(), "Library", "Application Support", "Google", "Chrome"),
    linux: join(homedir(), ".config", "google-chrome")
  }
});
