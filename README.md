# TIDALuna Playlist Duration Sort (experimental)

Adds two options to the **Sorting** submenu on TIDAL's folder/playlist grid:

- **Total duration · Shortest first**
- **Total duration · Longest first**

This is the **source-code project**, not a precompiled `.luna` plugin. It follows
[the official TIDALuna plugin template](https://github.com/Inrixia/luna-template).
It has not been tested inside a live TIDAL desktop client.

## What it does

- Retrieves each rendered playlist's total `duration` (seconds) with TIDALuna's built-in
  authenticated `TidalApi.playlist(uuid)` method. No user-supplied API key.
- Maintains a temporary in-memory cache, fetching up to five playlists concurrently.
- Uses CSS `order` to display cards in shortest/longest order. It does **not** change
  playlist membership, playlist order on TIDAL servers, or folder ownership.
- Restores native order when you choose TIDAL's Created date, Updated date, or
  Alphabetical options, or disable/reload the plugin.
- Remembers your duration-sort preference on this computer (localStorage).

## Limitations (important)

1. **Only cards currently rendered in TIDAL are sorted.** If a folder contains
   166 playlists but TIDAL only renders the first batch, the plugin cannot establish
   a truly global order for all 166. More cards will be sorted as they appear.
2. This is a **prototype**. TIDAL is a private React app in beta, and internal DOM
   markup can change. We use labels and layout detection rather than minified CSS
   class names, but the UI may require adjustment for your installed build.
3. The plugin expects an English UI for the native Sorting menu and a playlist
   page with a `Filter playlists` search field.
4. It recognizes playlist UUIDs in `href` values like `/playlist/<uuid>`.
   If TIDAL only exposes click handlers and no playlist IDs in card markup, the
   sorting options may appear but the cards will not move.
5. Failed metadata requests put affected playlists at the end. TidalApi's
   memoization means metadata may stay stale until the client is restarted.

## Build / install for testing

Prerequisites: **TIDAL desktop with TIDALuna**, Node.js, pnpm, git.

1. Extract this project to a folder on your computer and open a terminal there.
2. Install pnpm if needed: `npm install -g pnpm` (Node.js 26 does not bundle Corepack).
3. Run `pnpm install` and then `pnpm run watch` (or `pnpm run build` for a one-time build).
4. The watch command starts a DEV plugin store at `http://localhost:3000/store.json`.
5. In TIDAL go to **Luna Settings > Plugin Store** and add/install the DEV store
   URL. Install **Playlist Duration Sort** from it.
6. Open a folder of playlists, open `... > Sorting`, and select one of the new
   **Total duration** options. Give duration lookups time to complete.
7. To stop the custom sorting, select a native sort option. To disable the
   plugin, use Luna Settings.

**Do not upload the source ZIP directly as a `.luna` file.** The plugin builder
creates its own compiled `.luna` artifact inside `dist`.

## Diagnostics

If the options do not appear, inspect the submenu's actual HTML in TIDAL's
DevTools: the plugin looks for the strings `Created date`, `Updated date`, and
`Alphabetical` as sibling menu choices. If they appear but the cards do not
move, inspect one playlist card and check whether it has a link containing its
playlist UUID and whether the grid uses CSS grid or flex.

For a full-library sort including playlists not yet loaded, the next iteration
needs integration with TIDAL's folder data/redux rendering rather than DOM-only
reordering. This prototype intentionally avoids undocumented server-side sort
writes or unsafe React element moves.

## Tested

- Pure sorting logic: Node.js test suite (`npm test`).
- Runtime plugin integration inside TIDAL: **not tested** here.

No affiliation with TIDAL or the TIDALuna maintainers.

## Publish from GitHub

See [GITHUB-PUBLISHING.md](GITHUB-PUBLISHING.md). The repository includes a workflow that publishes a `latest` release and `store.json`.
