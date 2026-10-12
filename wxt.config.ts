import packageJson from "./package.json" with { type: "json" };
import { strToU8, unzipSync, zipSync } from "fflate";
import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "wxt";

const EXTENSION_NAME = "VLC Shortcuts for YouTube";
export const FALLBACK_GECKO_ID = "vlc-controls-in-youtube@avi12.com";
// Firefox reads the data_collection_permissions key AMO requires from 140 on. Chromium before 137 reports a held
// key's auto-repeats as KeyboardEvent.repeat false while another key (Shift, Ctrl) is also held, so toggles like
// Shift+S would re-fire
const FIREFOX_MIN_VERSION = "140.0";
const CHROMIUM_MIN_VERSION = "137";

const url = packageJson.repository;
const [, author, email] = packageJson.author.match(/(.+) <(.+)>/)!;

// Firefox reviewers rebuild from the source zip, so it ships build (not install) instructions
function renderBuildInstructions(browser: string) {
  return `# Build instructions

${EXTENSION_NAME} is built with the WXT framework (https://wxt.dev).

## Requirements
- Node.js 22 or newer
- pnpm (https://pnpm.io/installation)

## Steps
1. Extract this source archive
2. From the archive root, install dependencies: \`pnpm install\`
3. Build the ${browser} extension: \`pnpm build:${browser}\`

The unpacked build is written to build/${browser}-mv3-production/
`;
}

const BROWSERS_REQUIRING_SOURCES = new Set(["firefox", "opera"]);
// The repo is open source, so only AMO's reviewers, who rebuild from the archive itself, get build instructions in it
const BROWSERS_REQUIRING_BUILD_README = new Set(["firefox"]);

async function addReadmeToSourcesZip({ zipPath, instructions }: {
  zipPath: string;
  instructions: string;
}) {
  const entries = unzipSync(await readFile(zipPath));
  entries["README.md"] = strToU8(instructions);
  await writeFile(zipPath, zipSync(entries));
}

// The dev browsers' cloned profiles live in user-profiles/ (see scripts/dev-*.ts); Vite's watcher would otherwise
// crawl them and hit EBUSY on files the running browser holds. WXT replaces server.watch wholesale, so a plugin
// config hook (deep-merged) is the only way to extend the ignore list
const ignoreDevProfilesInWatcher = {
  name: "wxt:ignore-dev-profiles-watch",
  config: () => ({
    server: {
      watch: {
        ignored: [(watchedPath: string) => /[\\/]user-profiles([\\/]|$)/.test(watchedPath)]
      }
    }
  })
};

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  publicDir: "src/public",
  manifest: ({ browser }) => ({
    name: EXTENSION_NAME,
    description: "VLC's keyboard shortcuts for YouTube's player - click the toolbar icon to toggle",
    homepage_url: url,
    // No popup: the toolbar click toggles the extension (see background.ts)
    action: {},
    permissions: ["storage"],
    // Chrome's manifest takes author as { email }; Opera and Firefox take the "Name <email>" string
    author: browser === "opera" || browser === "firefox" ? packageJson.author : { email },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: process.env.GECKO_ID ?? FALLBACK_GECKO_ID,
          strict_min_version: FIREFOX_MIN_VERSION,
          data_collection_permissions: {
            required: ["none"]
          }
        }
      },
      developer: {
        name: author,
        url
      }
    }),
    ...(browser !== "firefox" && {
      minimum_chrome_version: CHROMIUM_MIN_VERSION
    })
  }),
  outDir: "build",
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}-{{mode}}",
  zip: {
    // user-profiles/ holds the dev browsers' cloned profiles (cookies, tokens) and is locked while they run, and
    // keys/ holds the private key the CRX is signed with
    excludeSources: [
      "keys/**",
      "build/**",
      ".output/**",
      "*.env",
      ".env*",
      ".idea/**",
      ".claude/**",
      "user-profiles/**",
      ".dev-logs/**",
      ".fallow/**"
    ],
    artifactTemplate: "{{name}}-{{version}}-{{browser}}-{{mode}}.zip",
    sourcesTemplate: "{{name}}-{{version}}-{{browser}}-source.zip"
  },
  vite: () => ({
    plugins: [ignoreDevProfilesInWatcher],
    build: {
      // Only the dev server's builds (scripts/dev.ts) carry source maps; the store build ships none
      sourcemap: process.env.WXT_INLINE_SOURCEMAPS === "1" ? "inline" : false
    }
  }),
  hooks: {
    "zip:start"(wxt) {
      // Only a production build ships to stores, so only then is a reviewable source zip worth making
      const isStoreBuild = wxt.config.mode === "production" && BROWSERS_REQUIRING_SOURCES.has(wxt.config.browser);
      if (!isStoreBuild) {
        wxt.config.zip.zipSources = false;
      }
    },
    async "zip:sources:done"(wxt, sourcesZipPath) {
      if (!BROWSERS_REQUIRING_BUILD_README.has(wxt.config.browser)) {
        return;
      }

      await addReadmeToSourcesZip({
        zipPath: sourcesZipPath,
        instructions: renderBuildInstructions(wxt.config.browser)
      });
    }
  }
});
