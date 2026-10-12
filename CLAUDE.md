# Stack
- pnpm (single package at the repo root)
- WXT extension framework
- TypeScript, no UI framework (100% type safety, let TypeScript infer return types - never write them explicitly)
- Chromium (Chrome, Opera) MV3 + Firefox MV3
  - Single shared code path; branch only when an API genuinely diverges
  - Cross-browser parity is a hard constraint - test Firefox first, it is the strictest environment

# Architecture
The extension replaces YouTube's player keyboard controls with VLC's hotkeys, rewrites the player tooltips and the Shift+/ help dialog to match, and toggles off/on from the toolbar icon (on by default).
- Two worlds:
  - Isolated world - `src/entrypoints/bridge.content.ts` mirrors the toggle onto `<html data-vlc-controls="on|off">` (`src/lib/enabled-flag.ts`). It has two switches: the toolbar's, which is the `isEnabledItem` storage item and global (kept in sync via `watch`), and the context menu's, which holds for one tab only (`src/lib/tab-enabled.ts`, the page's own `sessionStorage`, so the videos that follow in that tab keep it and a fresh tab does not). The tab's switch wins while it is set, and a flip of the global one clears it. It also injects the player-effects stylesheet (aspect ratio, hidden controls), since only manifest content scripts can inject CSS
  - MAIN world - `src/entrypoints/vlc-controls.content.ts` owns the player API: hotkeys (`src/lib/hotkeys/`), tooltips (`src/lib/tooltips/`) and the help dialog (`src/lib/help-dialog/`). It has no extension APIs, reads the toggle from the `<html>` attribute and treats a missing attribute as enabled
- `src/lib/vlc-keymap.ts` is the single source of truth for VLC bindings - hotkeys, tooltips and the help dialog all read from it, never restate a key. A binding that does exactly what a YouTube key does names it as `youtubeEquivalent`, and the help dialog then shows YouTube's own localized label for it
- `src/lib/shortcut.ts` is the shared shortcut vocabulary both keymaps build on: key combos, matching a combo to a key event, YouTube's two display notations, and the help dialog sections
- YouTube native UI only - never render an overlay, toast or tooltip of our own. VLC actions run through YouTube's own keys (`YOUTUBE_HOTKEYS` in `src/lib/youtube-keymap.ts`, dispatched via `src/lib/hotkeys/youtube-hotkey-dispatch.ts`) so YouTube shows its own bezel, seek overlay and caption card. Where YouTube has no exact key (3s jumps, fine speed), ride the nearest native press and correct the text inside YouTube's own element (`src/lib/hotkeys/native/`); where YouTube has no feedback at all (loop, aspect ratio, audio track, snapshot, hide/show controls, and the silent fallbacks on players that ignore a YouTube key), write the status into YouTube's own bezel text pill (`showStatusInNativeBezel` in `src/lib/hotkeys/native/status-bezel.ts`, driving YouTube's own bezel component and its show/hide timers; `src/lib/hotkeys/native/bezel-component.ts` catches base.js assigning `_yt_player` at document_start and records each bezel instance as YouTube creates it) - the embedded player has no bezel, so there it stays silent
- Every visual modification must go through YouTube's own functions, never by hand-editing YouTube's DOM to imitate them: show feedback by calling the player component that YouTube itself calls (e.g. its bezel's show/update methods), so YouTube's own timing, animation and state flags apply. Hand-written DOM/class/style changes to YouTube's elements drift from YouTube's behavior (a stale `ytp-bezel-text-hide` flag hid our status text, and hide-then-show restarts fought YouTube's fade). The one allowed exception is `src/lib/help-dialog/help-dialog.css`: YouTube has no function for it, and its fixed 130px key cell can't line up VLC's longer combos, so a stylesheet aligns the help dialog's key column
- Volume goes past YouTube's 100% up to VLC's 200% (`src/lib/hotkeys/volume-boost.ts`): a Web Audio gain on the `<video>`, shown in YouTube's own volume bezel. The audio graph is only created once the viewer has interacted with the page (sticky user activation, so Shift+wheel can boost too), and the video is routed into it only once the context is running - routed into a suspended context it would go silent
- `src/lib/youtube-keymap.ts` is the single source of truth for YouTube's own keys: controls only YouTube's player has (theater, 0-9 seek...) keep YouTube's keys and pass through untouched; YouTube keys for controls VLC also has are swallowed. On a key clash, theater mode kept T (VLC's "show time" was dropped) and Ctrl+Left/Right kept chapter navigation (VLC's 1-minute jump moved to Ctrl+Shift+Left/Right), while VLC kept B and +/- over YouTube's caption styling keys, and the miniplayer is also on Shift+I, since I/J/K/L pan 360° videos (there plain I pans up)
- 360° videos (`isSphericalVideo` in `src/lib/player.ts`): bindings marked `isSphericalOnly` act only there and take over keys other videos bind (l loops elsewhere, pans right on 360°). Page Up/Down zoom (VLC's viewpoint keys) and I/J/K/L pan, each holding YouTube's own key (`YOUTUBE_360_HOTKEYS`: `]`/`[`, W/A/S/D) for as long as the viewer holds theirs, since YouTube moves the view only while its key is down. A/S stay VLC's aspect ratio and stop
- Every YouTube player is supported: the watch page, Shorts (`#shorts-player`, while the watch player stays mounted but hidden) and embeds - `getPlayer()` in `src/lib/player.ts` returns whichever `.html5-video-player` is visible. Shorts and embeds honor only some of YouTube's keys (`getPlayerKind()` in `src/lib/player.ts`, `isHotkeyHonored` in `src/lib/youtube-keymap.ts`); `dispatchYoutubeHotkey` never sends a player a key it ignores and runs the action's silent API fallback instead. Shorts keeps its own Up/Down and wheel for moving between shorts; VLC's n/p click Shorts' own next/previous buttons
- YouTube Music (`music.youtube.com`) is supported too: `src/lib/page-matches.ts` is the single source of truth for the content scripts' URL matches, and `getSite()`/`isMusicSite()` in `src/lib/site.ts` tell the sites apart (`PlayerKind.Music` in `src/lib/player.ts`). Music's player ignores YouTube's player keys, so `src/lib/youtube-music-keymap.ts` is the single source of truth for Music's own keys (`YOUTUBE_MUSIC_HOTKEYS`) and maps each YouTube key to Music's (`findMusicHotkey`); `dispatchYoutubeHotkey` sends Music's key there. A binding's `site` limits it to one site (Music keeps + for like, has no miniplayer or 360°; only Music has Shuffle on r), and `musicEquivalent` names Music's key so the help dialog shows Music's own label (VLC's loop is Music's repeat cycle). Music's "g" navigation chords pass through, and on Music the volume keys and Ctrl/Alt combos act regardless of focus but only while something is playing or paused (`isMediaActive` in `src/lib/player.ts`, read from the player's own state), since Music's player can't take focus while its player page is closed; otherwise they stay the browser's (Alt+Left goes back). The help dialog reads Music's `ytmusic-hotkey-dialog-renderer` and its "SHIFT + n" notation
- Hot swap: when the extension reloads, the old content script copy is retired (`retire()` in `src/lib/enabled-flag.ts`, wired to the MAIN world's `ContentScriptContext.onInvalidated`) and acts as switched off, so the new copy takes over without reloading the tab. The bezel registry lives on `globalThis.vlcControlsBezelRegistry` so a new copy reuses it instead of patching `_yt_player` twice. The dev server injects the rebuilt content scripts into the open YouTube tabs (Chromium via the service worker over CDP, Firefox over RDP) instead of reloading them, using the dev-only `scripting` permission and host permissions
- `src/entrypoints/background.ts` toggles `isEnabledItem` on toolbar click and reflects the state on the toolbar (badge `OFF`, title)
- Message passing goes through `@webext-core/messaging` with a protocol map keyed by a string enum - never a bare `browser.runtime.sendMessage`. `src/lib/world-messaging.ts` is the MAIN world's only way out: a `defineCustomEventMessaging` channel to the isolated bridge, which owns the extension APIs (the context menu's "VLC shortcuts" toggle row sends `WorldMessage.SetTabEnabled`, and the bridge sets this tab's switch). A channel to the background would be a second module, `defineExtensionMessaging`, declared the same way
- VLC's right-click submenus (`src/lib/context-menu/`) are added to YouTube's own context menu, built from YouTube's own menu components rather than hand-written DOM:
  - `src/lib/player-namespace.ts` catches base.js assigning `_yt_player` (shared with the bezel registry) and finds each component by what its code is made of - the CSS class names its source carries and the method names the compiler keeps (`setIcon`, `open`, `enable`) - since every minified name changes with each player release. It fails closed: no component found, no rows
  - `context-menu/native-menu.ts` wraps the row list's own add method to record every panel menu by its element (the registry lives on `globalThis` for hot swap), so the right-click menu is the one whose element sits in `.ytp-contextmenu`. Our rows are YouTube's own classes: a choice row is the class YouTube's quality and speed rows are, which builds its own sub-panel, header, back button and radio rows, so picking an option, going back and resizing are all YouTube's. It is added with the row list's own add method and never `enable()`, whose host would have to be the settings menu
  - `context-menu/menu-model.ts` is the single source of what the menu offers; every row reads its options and current value from the same action modules the hotkeys use, and a command row takes its wording and its key from the VLC binding it runs. Rows are re-read on every open (the video, its tracks and its speed change under the menu), a choice with no options is dropped, and switching the controls off removes every row but the "VLC shortcuts" toggle, which shows On or Off and is how they come back. Only a retired copy leaves the menu entirely to YouTube (`isCopyRetired`)
  - `context-menu/menu-icons.ts` is the one hand-drawn part - YouTube has no icon for VLC's controls, so the row icons are Material paths handed to YouTube's own `setIcon`

# Code style
- WXT APIs (`storage`, `browser`, `defineBackground`, `defineContentScript`, ...) are imported explicitly from `"#imports"`
- Use the `browser` namespace
- Use early returns for readability and maintainability
- Use functional programming
- Use async/await whenever possible
- Use DRY with separation of concerns, prioritizing readability
- Tree-shaking friendly modules: named exports only, no barrel files with side effects, no namespace imports (`import * as`)
- Minimize indentations
- An arrow that only hands back a value is expression-bodied, never braces around a lone `return` - an object property's value (`manifest: ({ browser }) => ({ ... })`, never a method), a callback, or a returned closure (`return player => seekNatively({ ... });`). A long body is broken over lines and indented the way ESLint/oxlint format it, not wrapped in braces. Standalone functions stay `function` declarations (oxlint `func-style` forbids `const f = () => ...`)
- A callback that gets hard to read on one line is broken over properly indented lines rather than crammed in
- Use `for-of` instead of `.forEach`, and a plain `for` loop instead of `.reduce()`
- Use modern browser and CSS features
- Prefer semantic HTML elements (`button`, `nav`, `ul`/`li`, `section`, `header`, `footer`, `dialog`, `menu`, `output`, etc.) over `div`/`span` with a `role`; only add ARIA when no native element carries the semantics or state, and never add ARIA that merely restates what the element already means
- Never use `window.` prefixes - call globals bare (`addEventListener(...)`, not `window.addEventListener(...)`)
- Pass event listener options as an object (`{ capture: true }`), never the positional boolean `true`
- Avoid `setTimeout` unless absolutely necessary
- Avoid comments unless absolutely necessary - prefer descriptive names; default to zero comments and rename variables/functions until they read like the comment would
- Don't use em dashes - use regular hyphens
- If a callback arrow function has a typed param, don't annotate the type explicitly
- Functions with 2+ params take a single destructured object param (`f({ a, b }: {...})`) so every argument is self-documenting at the call site. Reuse an existing/built-in type when one fits the object shape; only inline the object type when nothing fits - never invent a named type just to convert. EXEMPT (stay positional): key/value-style accessors where the first arg is a key/identifier and the second its value/operation/options, and framework/runtime-positional signatures the caller controls (HOF callbacks, `addEventListener`, Promise executors, event handlers with first param `e`, `browser.*` listener callbacks, external-library-dictated signatures)
- Avoid nested try/catch - flatten with early returns or extracted functions
- Validate loose data with zod, not hand-rolled checks: any multi-clause shape/range/format validation on external/storage/message payloads becomes a module-level zod schema + `safeParse`. Bounds always come from the existing `SCREAMING_SNAKE_CASE` constants via `.min()`/`.max()`; reuse an existing schema before authoring one; a schema consumed only for its inferred type stays un-exported. Import `z` from `@/lib/zod` (jitless CSP wrapper). NOT zod material: single trivial checks, TS union narrowing of already-typed values, hot-loop arithmetic guards
- `safeParse` results take exactly two forms. Validity only: `schema.safeParse(x).success` inline in the condition or into an `is`-prefixed boolean. `.data`/`.error` consumed: store the result as `parsed` (`parsed<Subject>` when one scope holds several parses) and guard with `parsed.success` - never name it `result`/`<x>Parse`
- Inline one-off variables (assigned once, used once) when it stays readable - but NOT when the variable names a magic number/string or documents an otherwise opaque expression
- Extract an `if`/ternary/guard condition into a descriptive `is`-prefixed boolean variable rather than inlining the raw expression into the condition
- Apply parallel modifications whenever possible
- Always prefer the `@` path alias (`@/lib/foo`) over parent-relative (`../`) imports. Same-directory `./foo` stays relative

# Naming conventions
- Variables and functions: `camelCase`, full words (no abbreviations)
- Module-level constants: `SCREAMING_SNAKE_CASE`
- Exception: event handler first parameter is always `e`

## Variable prefixes
- Element: `el` prefix (e.g. `elButton`)
- Index: `i` prefix (e.g. `iItem`), or bare `i` when iterating in a for loop/higher-order function
- Boolean: `is` prefix (e.g. `isLoading`), phrased positively (e.g. `isEnabled`, not `isDisabled` or `isNotEnabled`)

# Hardcoded values
- Strings: use enums; if no enum fits, use a descriptive `SCREAMING_SNAKE_CASE` constant
- Numbers: use a descriptive `SCREAMING_SNAKE_CASE` constant

# CSS
- Use native CSS nesting - nest child and state selectors under their parent (`&:hover`, a nested `.child`) instead of repeating the parent in flat sibling rules
- Always respect `prefers-reduced-motion` - never ship an ungated transition/animation. Add a `@media (prefers-reduced-motion: reduce)` override that removes the motion; in JS collapse the duration to 0
- Never the `transform` shorthand - use the individual `translate`/`rotate`/`scale` properties, and transition the individual property
- Never hand-write vendor prefixes (`-webkit-` etc.) - author the unprefixed standard only

# Storage
- Storage goes through WXT storage only - `storage.defineItem` from `"#imports"` (see `src/lib/storage.ts`), never `browser.storage.*`
- Don't automatically persist to storage - rely on fallback values; only write when the user has explicitly set something (e.g. `isEnabledItem` is never written on install, its default comes from `fallback: true`)
- Only use the `local:` or `sync:` storage areas - never `session:` (Firefox doesn't support it)

# UI copy
- No full stops at end of messages
- Informal tone

# Linting
After each modification, lint with oxlint, ESLint and Stylelint, and typecheck:
- `pnpm lint` runs `pnpm fallow && oxlint --type-aware --fix -c .oxlintrc.fix.json && eslint --fix && oxlint --type-aware` - the fallow dead-code audit gates first (as in youtube-time-manager), then oxlint owns the logic and type-aware rules, ESLint owns the stylistic ones (plus the local rules in `eslint-rules/`)
- `pnpm stylelint` runs stylelint over `src/**/*.css` with `--fix`
- `pnpm typecheck`
- After every bug fix, feature, or refactor - anything that removes or rewires code - run a fallow dead-code audit and clean up what it flags as newly unused (imports, helpers, exports, whole files) so changes never leave orphans behind. Act on the audit by hand - never run `fallow fix`
  - The config is `/.fallowrc.json` (entry `src/entrypoints/**`). It carries NO ignore lists - only `health` thresholds and `unused-enum-members: warn`. Run fallow from the repo root
  - `pnpm fallow` (= `fallow audit --base HEAD`) is the incremental gate; `pnpm exec fallow dead-code --root .` is the full sweep
  - fallow is PINNED to 2.103.0 (devDep) - never invoke it via `pnpx`/`pnpm dlx` (that fetches latest and ignores the pin), always the local bin (`pnpm fallow` / `pnpm exec fallow`)
  - An export used only WITHIN its own file is an over-export: drop the `export` keyword rather than adding an ignore

# Dev server
Never build - the dev server is always running. `pnpm dev` (or `pnpm dev:firefox` / `pnpm dev:opera`) runs `scripts/dev.ts`, ported from youtube-time-manager's extension dev server: it builds into `build/<browser>-mv3-development/`, sideloads it into an isolated clone of the real browser profile under `user-profiles/`, and on any change under `src/` rebuilds and - only when the output's bytes actually changed - reloads the extension and injects the rebuilt content scripts into the open YouTube tabs without reloading them (Chromium over CDP, Firefox over RDP). Each session logs to `.dev-logs/<browser>.log`. `pnpm dev:firefox:no-marionette` drops the automation flags so Google sign-in works. The dev server's own scripts aren't watched - restart it after editing `scripts/`. Only run a build when explicitly asked.

# Store deploy
Store releases (Chrome Web Store, Opera Add-ons, Firefox AMO - no Edge) go out via `web-ext-deploy` (Avi's own tool - npm `web-ext-deploy`, source at `/c/repositories/avi/web-ext-deploy`), NOT `wxt submit`. Flow:
1. Bump `package.json` `version` (must exceed the live store version - stores reject same-or-lower) and commit `chore(release): X.Y.Z`
2. `pnpm zip:all` builds the production zips into `build/`: `vlc-shortcuts-for-youtube-{version}-{chrome,firefox,opera}-production.zip` plus `-firefox-source.zip`/`-opera-source.zip` (AMO and Opera require the reviewable source zip; only Firefox's carries a README with build instructions, since the repo is open source)
3. Run `pnpx web-ext-deploy env --auto-fetch-credentials` (`web-ext-deploy` is not a project dep - always invoke it via `pnpx`) - always `--dry-run` FIRST to validate creds + inputs without uploading, then re-run without `--dry-run` to publish. It reads whichever gitignored per-store `chrome.env`/`firefox.env`/`opera.env` files are PRESENT and skips any store whose file is absent. Each file holds that store's creds + `ZIP="build/vlc-shortcuts-for-youtube-{version}-<browser>-production.zip"` (`{version}` is replaced by the `package.json` version) and `ZIP_SOURCE` for Firefox/Opera
- ALWAYS pass `--auto-fetch-credentials`: it fetches the volatile creds and saves them back to the `.env` (Opera `SESSIONID`/`CSRFTOKEN` via Playwright, Chrome `REFRESH_TOKEN` via OAuth). Both may open a browser for an interactive login. `--publish-only chrome firefox` narrows to a subset of the PRESENT stores; per-store changelogs via `--firefox-changelog`/`--opera-changelog`
- The `*.env` credential files are gitignored and must never be committed
- The Firefox add-on ID comes from the `GECKO_ID` env var, falling back to `vlc-controls-in-youtube@avi12.com` - kept from the old name vlc-controls-in-youtube, since AMO ties the listing to this ID

# Browser debugging
Prefer the chrome-devtools MCP for driving the running Chrome. When it can't reach a target - it does not list/control the extension's service worker or `chrome-extension://` pages, so `chrome.storage`, the background console, and SW-only state are invisible to it - fall back to raw CDP on the dev Chrome's remote-debugging port (`http://localhost:9333`, or the next free port - the dev server prints it). Find the service-worker target via `GET /json/list` (`type === "service_worker"`, url contains the extension id), open its `webSocketDebuggerUrl`, and `Runtime.evaluate` with `awaitPromise`+`returnByValue` to run e.g. `chrome.storage.local.get(...)` inside the background. A short Node script (global `fetch` + global `WebSocket`) is enough.

For Firefox, prefer the firefox-devtools MCP. When it can't reach into something (its snapshots do NOT pierce shadow roots) fall back to raw RDP (Firefox's classic remote debugging protocol, NOT CDP). web-ext launches Firefox with `-start-debugger-server <port>`; find the port in the firefox.exe command line (`Get-CimInstance Win32_Process -Filter "name='firefox.exe'"`, the arg after `-start-debugger-server`). RDP frames packets as `<byteLength>:<JSON>`; connect via TCP, read the `{"from":"root"}` hello, then `listTabs` -> pick the tab by url -> `{to: tab.actor, type:"getTarget"}` -> `consoleActor` -> `{type:"evaluateJSAsync", text}` (it replies with a `resultID`, then a later `evaluationResult` packet carrying the value). A short Node script (`net` + a length-prefix parser) is enough.
