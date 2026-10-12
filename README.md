# VLC Shortcuts for YouTube

A browser extension that gives YouTube's player VLC's keyboard shortcuts. YouTube's player tooltips and its
<kbd>Shift</kbd> + <kbd>/</kbd> shortcuts dialog are rewritten to match, and every action shows YouTube's own on-screen
feedback.  
Click the toolbar icon to turn it off and on (it's on by default).

Works on the watch page, Shorts, embedded players and YouTube Music.

[![Chrome Web Store users](https://img.shields.io/chrome-web-store/users/ccfncalinmelfdbodiediojhddcljnpl?color=white&label=Chrome&style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ccfncalinmelfdbodiediojhddcljnpl)  
[![Firefox Add-on users](https://img.shields.io/amo/users/vlc-controls-in-youtube@avi12.com?color=white&label=Firefox&style=flat-square&logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/firefox/addon/vlc-controls-in-youtube@avi12.com)  
[![Opera Add-ons users](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Faddons.opera.com%2Fextensions%2Fdetails%2Fvlc-controls-for-youtube%2F&search=Downloads%3C%2Fdt%3E%3Cdd%3E%28%5B0-9%2C%5D%2B%29%3C%2Fdd%3E&replace=%241&color=white&label=Opera&style=flat-square&logo=opera&logoColor=white)](https://addons.opera.com/extensions/details/vlc-controls-for-youtube)

Made by [Avi](https://avi12.com)

Powered by [WXT](https://github.com/wxt-dev/wxt)

## Shortcuts

Press <kbd>Shift</kbd> + <kbd>/</kbd> on YouTube for the full list in your own language.

### Playback

|                                                 Key | Action                                       |
|----------------------------------------------------:|----------------------------------------------|
|                                    <kbd>Space</kbd> | Play/pause                                   |
|                                        <kbd>S</kbd> | Stop                                         |
|                     <kbd>Shift</kbd> + <kbd>←</kbd> | Jump back 3 seconds                          |
|                     <kbd>Shift</kbd> + <kbd>→</kbd> | Jump forward 3 seconds                       |
|                                  <kbd>←</kbd>/<kbd>→</kbd> | Jump back/forward 5 seconds           |
|                <kbd>Alt</kbd> + <kbd>←</kbd>/<kbd>→</kbd> | Jump back/forward 10 seconds          |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>←</kbd>/<kbd>→</kbd> | Jump back/forward 1 minute        |
|   <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>←</kbd>/<kbd>→</kbd> | Jump back/forward 5 minutes       |
|                           <kbd>P</kbd>/<kbd>N</kbd> | Previous/next video                          |
|                                        <kbd>E</kbd> | Next frame                                   |
|                     <kbd>Shift</kbd> + <kbd>E</kbd> | Previous frame                               |
|                           <kbd>-</kbd>/<kbd>+</kbd> | Slower/faster                                |
|                           <kbd>[</kbd>/<kbd>]</kbd> | Slower/faster by 0.1x                        |
|                                        <kbd>=</kbd> | Normal speed                                 |
|                                        <kbd>L</kbd> | Toggle loop                                  |

### General

|                                         Key | Action                                     |
|--------------------------------------------:|--------------------------------------------|
|                                <kbd>F</kbd> | Toggle fullscreen                          |
|                                <kbd>M</kbd> | Mute/unmute                                |
|                   <kbd>↑</kbd>/<kbd>↓</kbd> | Volume up/down, up to 200% like VLC        |
|              <kbd>Shift</kbd> + mouse wheel | Volume up/down                             |
|                                <kbd>B</kbd> | Cycle audio track                          |
|                                <kbd>A</kbd> | Cycle aspect ratio                         |
|             <kbd>Shift</kbd> + <kbd>S</kbd> | Take snapshot                              |
|              <kbd>Ctrl</kbd> + <kbd>H</kbd> | Hide/show controls                         |
|                                <kbd>I</kbd> | Toggle miniplayer (<kbd>Shift</kbd> + <kbd>I</kbd> on 360° videos) |

### Subtitles

|                           Key | Action                          |
|------------------------------:|---------------------------------|
|                  <kbd>V</kbd> | Cycle subtitle track            |
| <kbd>Alt</kbd> + <kbd>V</kbd> | Cycle subtitle track in reverse |

### 360° videos

|                                                 Key | Action               |
|----------------------------------------------------:|----------------------|
|              <kbd>Page Up</kbd>/<kbd>Page Down</kbd> | Zoom in/out          |
| <kbd>I</kbd>/<kbd>J</kbd>/<kbd>K</kbd>/<kbd>L</kbd> | Pan up/left/down/right |

YouTube keeps its own keys for what VLC doesn't have: <kbd>T</kbd> theater mode, <kbd>0</kbd>-<kbd>9</kbd> seek to a
percentage, <kbd>Ctrl</kbd> + <kbd>←</kbd>/<kbd>→</kbd> previous/next chapter and
<kbd>Esc</kbd> to close the miniplayer.

### YouTube Music

The same keys work on YouTube Music, riding Music's own keys, with a few differences:

|                                    Key | Action                                     |
|---------------------------------------:|--------------------------------------------|
|                           <kbd>L</kbd> | Cycle repeat (off, all, one)               |
|                           <kbd>R</kbd> | Shuffle the queue                          |
|                           <kbd>+</kbd> | Like, as on Music (use <kbd>]</kbd> to speed up) |
|          <kbd>Shift</kbd> + <kbd>-</kbd> | Dislike, as on Music                       |
|                           <kbd>Q</kbd> | Show/hide the queue, as on Music           |

Music has no miniplayer or 360° videos, and keeps its own <kbd>G</kbd> navigation keys (<kbd>G</kbd> then
<kbd>L</kbd> opens the library).

## Requirements for setting up

Install [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io/installation)

## Install dependencies

```shell
pnpm i
```

## Start the dev server & run in a test browser

Each command builds the extension, loads it into a separate copy of your browser profile and reloads it on every change,
swapping the new code into the open YouTube tabs without reloading them.

### Chrome

```shell
pnpm dev
```

### Firefox

```shell
pnpm dev:firefox
```

### Opera

```shell
pnpm dev:opera
```

## Build

These are also the build instructions for store reviewers. Run them from the repo root (or the source archive's root)
after installing the dependencies.

### Chrome

```shell
pnpm build
```

The unpacked extension is written to `build/chrome-mv3-production/`.

### Firefox

```shell
pnpm build:firefox
```

The unpacked extension is written to `build/firefox-mv3-production/`.

### Opera

```shell
pnpm build:opera
```

The unpacked extension is written to `build/opera-mv3-production/`.

### All browsers at once

```shell
pnpm build:all
```

## Zip

Each command builds the extension and zips it into `build/`.

### Chrome

```shell
pnpm zip
```

To also pack a signed `.crx`:

```shell
pnpm crx
```

### Firefox

```shell
pnpm zip:firefox
```

Also writes the source zip that Firefox Add-ons requires.

### Opera

```shell
pnpm zip:opera
```

Also writes the source zip that Opera Add-ons requires.

### All browsers at once

```shell
pnpm zip:all
```

## License

[GPL-3.0-or-later](LICENSE)
