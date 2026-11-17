/**
 * Playlist Duration Sort - experimental TidaLuna renderer plugin
 *
 * Injects two entries beside the native folder "Alphabetical" sort option.
 * Uses TidaLuna's authenticated TidalApi.playlist(uuid) for duration (seconds).
 * Uses CSS order instead of moving React-owned DOM nodes, so it does NOT alter
 * TIDAL's stored playlist organization or corrupt React's child ordering.
 *
 * IMPORTANT: Sorts the cards TIDAL currently renders. Virtualized/unloaded
 * playlists cannot be placed globally until TIDAL renders them.
 */
import type { LunaUnload } from "@luna/core";
import { TidalApi } from "@luna/lib";
import { sortDurationRows, type DurationDirection } from "./sorting";

export const unloads = new Set<LunaUnload>();

const PREFIX = "luna-playlist-duration-sort";
const STORAGE_KEY = `${PREFIX}:direction`;
const UUID_RE = /(?:^|\/)playlist\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
const MENU_CHOICES: readonly { direction: DurationDirection; label: string }[] = [
  { direction: "shortest", label: "Total duration · Shortest first" },
  { direction: "longest", label: "Total duration · Longest first" },
];

let selectedDirection: DurationDirection | null = loadSavedDirection();
let alive = true;
let scanPending = false;
let applyPending = false;
let queueBusy = 0;
const MAX_PARALLEL = 5;
const taskQueue: string[] = [];
const requested = new Set<string>();
const durations = new Map<string, number | null>();
const touched = new Map<HTMLElement, string>();
let statusTimer: ReturnType<typeof setTimeout> | null = null;

const css = document.createElement("style");
css.id = `${PREFIX}-styles`;
css.textContent = `
  .${PREFIX}-choice { cursor: pointer; }
  .${PREFIX}-choice:focus-visible { outline: 2px solid #29dbec; outline-offset: -2px; }
  .${PREFIX}-check { margin-left: auto; color: #27e5e3; font-weight: 800; }
  #${PREFIX}-status {
    position: fixed; z-index: 2147483000; right: 28px; bottom: 88px;
    color: #fff; background: #282828; border: 1px solid #555;
    border-radius: 10px; padding: 10px 14px; font: 13px system-ui, sans-serif;
    box-shadow: 0 8px 25px #0008; pointer-events: none;
    max-width: min(360px, calc(100vw - 56px));
  }
`;
document.head.append(css);

function loadSavedDirection(): DurationDirection | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "shortest" || value === "longest" ? value : null;
  } catch {
    return null;
  }
}

function saveDirection(direction: DurationDirection | null): void {
  selectedDirection = direction;
  try {
    if (direction) localStorage.setItem(STORAGE_KEY, direction);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled. The active session still works.
  }
}

function showStatus(message: string, durationMs = 3200): void {
  if (!alive) return;
  const el = document.getElementById(`${PREFIX}-status`) ?? document.createElement("div");
  el.id = `${PREFIX}-status`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.textContent = message;
  if (!el.isConnected) document.body.append(el);
  if (statusTimer !== null) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.remove();
    statusTimer = null;
  }, durationMs);
}

function labelOf(el: Element): string {
  return (el.textContent ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Find a rendered native sorting submenu from its three familiar labels,
 * avoiding brittle minified class names and translated CSS selectors.
 */
function findSortMenu(): { parent: HTMLElement; reference: HTMLElement } | null {
  const candidates = document.querySelectorAll<HTMLElement>("span,div,button,li,[role='menuitem']");
  for (const leaf of Array.from(candidates)) {
    if (leaf.childElementCount !== 0 || labelOf(leaf) !== "Alphabetical") continue;
    let current: HTMLElement | null = leaf;
    for (let i = 0; current && i < 6; i++, current = current.parentElement) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent || parent.children.length < 3 || parent.children.length > 12) continue;
      const children = Array.from(parent.children) as HTMLElement[];
      const hasCreated = children.some((c) => labelOf(c).includes("Created date"));
      const hasUpdated = children.some((c) => labelOf(c).includes("Updated date"));
      const reference = children.find((c) => labelOf(c) === "Alphabetical" || labelOf(c).startsWith("Alphabetical"));
      if (hasCreated && hasUpdated && reference) return { parent, reference };
    }
  }
  return null;
}

function makeMenuChoice(reference: HTMLElement, choice: (typeof MENU_CHOICES)[number]): HTMLElement {
  const clone = reference.cloneNode(true) as HTMLElement;
  // Remove UI that belongs to the native selection state, leaving TIDAL styles.
  clone.querySelectorAll("svg,[role='img'],input").forEach((el) => el.remove());
  const textLeaf = Array.from(clone.querySelectorAll<HTMLElement>("span,div,button"))
    .find((el) => el.childElementCount === 0 && labelOf(el) === "Alphabetical");
  if (textLeaf) textLeaf.textContent = choice.label;
  else clone.textContent = choice.label;
  clone.classList.add(`${PREFIX}-choice`);
  clone.dataset.lunaDurationSort = choice.direction;
  clone.removeAttribute("aria-checked");
  clone.setAttribute("role", "menuitemradio");
  clone.setAttribute("aria-checked", String(selectedDirection === choice.direction));
  clone.tabIndex = 0;

  if (selectedDirection === choice.direction) {
    const check = document.createElement("span");
    check.className = `${PREFIX}-check`;
    check.textContent = "✓";
    check.setAttribute("aria-hidden", "true");
    clone.append(check);
  }
  const activate = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    saveDirection(choice.direction);
    showStatus(`Sorting by total duration — ${choice.direction} first. Loading playlist times…`, 4500);
    scheduleApply();
    // Native sorting menus are usually dismissed by Escape.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    clone.closest("[role='menu']")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  };
  clone.addEventListener("click", activate);
  clone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") activate(e);
  });
  return clone;
}

function injectMenu(): void {
  const result = findSortMenu();
  if (!result) return;
  const { parent, reference } = result;
  const existing = Array.from(parent.children).filter((el) =>
    Boolean((el as HTMLElement).dataset.lunaDurationSort),
  ) as HTMLElement[];
  // IMPORTANT: Do not remove/recreate on every MutationObserver notification:
  // that would trigger an infinite observer -> inject -> observer loop.
  if (existing.length === MENU_CHOICES.length) {
    for (const el of existing) {
      const active = el.dataset.lunaDurationSort === selectedDirection;
      el.setAttribute("aria-checked", String(active));
      const check = el.querySelector(`.${PREFIX}-check`);
      if (active && !check) {
        const mark = document.createElement("span");
        mark.className = `${PREFIX}-check`;
        mark.textContent = "✓";
        mark.setAttribute("aria-hidden", "true");
        el.append(mark);
      } else if (!active && check) check.remove();
    }
    return;
  }
  for (const stale of existing) stale.remove();
  let after: Element = reference;
  for (const choice of MENU_CHOICES) {
    const el = makeMenuChoice(reference, choice);
    after.insertAdjacentElement("afterend", el);
    after = el;
  }
}

function extractPlaylistId(el: Element): string | null {
  const link = el.closest<HTMLAnchorElement>("a[href]");
  const href = link?.getAttribute("href") ?? el.getAttribute("href") ?? "";
  const match = href.match(UUID_RE);
  if (match) return match[1].toLowerCase();
  // Some TIDAL grid cards expose their id on a wrapper instead of the link.
  for (const key of ["data-playlist-id", "data-uuid"]) {
    const id = el.getAttribute(key);
    if (id && /^[0-9a-f-]{36}$/i.test(id)) return id.toLowerCase();
  }
  return null;
}

type Card = { id: string; node: HTMLElement; originalIndex: number };
type CardGroup = { container: HTMLElement; cards: Card[] };

/**
 * Only consider a flex/grid containing distinct playlist cards. This purposely
 * avoids the sidebar, individual playlist titles, menus, and the player.
 */
function findCardGroups(): CardGroup[] {
  const root = document.querySelector("main") ?? document.querySelector("[data-test='main-content']") ?? document.body;
  // Folder and All Playlists pages expose the native "Filter playlists" box.
  const isPlaylistListing = Array.from(document.querySelectorAll("input"))
    .some((el) => /filter playlists/i.test(el.getAttribute("placeholder") ?? "")) ||
    !!document.querySelector("[data-test*='playlist-folder'],[data-test*='playlistFolder']");
  if (!isPlaylistListing) return [];

  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href*='playlist/'],a[href*='playlists/']"));
  const groups = new Map<HTMLElement, Map<HTMLElement, string>>();
  for (const anchor of anchors) {
    if (anchor.closest(`.${PREFIX}-choice,nav,aside,[role='navigation']`)) continue;
    const id = extractPlaylistId(anchor);
    if (!id) continue;
    let element: HTMLElement | null = anchor;
    for (let i = 0; element && i < 10; i++, element = element.parentElement) {
      const parent = element.parentElement;
      if (!parent || parent === document.body) break;
      const display = getComputedStyle(parent).display;
      if (display.includes("grid") || display.includes("flex")) {
        if (!groups.has(parent)) groups.set(parent, new Map());
        groups.get(parent)!.set(element, id);
      }
    }
  }

  const choices: CardGroup[] = [];
  for (const [container, entries] of groups) {
    const uniqueIds = new Set(entries.values());
    if (uniqueIds.size < 2 || entries.size < 2) continue;
    const cards: Card[] = [];
    const childList = Array.from(container.children);
    for (const [node, id] of entries) {
      cards.push({ node, id, originalIndex: childList.indexOf(node) });
    }
    if (cards.some((c) => c.originalIndex < 0)) continue;
    choices.push({ container, cards });
  }
  // Prefer the most specific grid rather than nested grids containing same cards.
  return choices.filter((group) => !choices.some(
    (other) => other !== group && group.container.contains(other.container) &&
      other.cards.length >= Math.min(group.cards.length, 2),
  ));
}

function restoreOrders(): void {
  for (const [el, original] of touched) {
    // Do not rewrite native elements after they have disappeared.
    if (el.isConnected) el.style.order = original;
  }
  touched.clear();
}

function applyOrdering(): void {
  if (!alive) return;
  if (!selectedDirection) {
    restoreOrders();
    return;
  }
  const groups = findCardGroups();
  for (const { container, cards } of groups) {
    const byIndex = [...cards].sort((a, b) => a.originalIndex - b.originalIndex);
    const slots = byIndex.map((c) => c.originalIndex);
    const sorted = sortDurationRows(byIndex.map((c) => ({ ...c, duration: durations.get(c.id) ?? undefined })), selectedDirection);
    const assigned = new Map(sorted.map((c, i) => [c.node, slots[i]]));
    const allChildren = Array.from(container.children) as HTMLElement[];
    for (let i = 0; i < allChildren.length; i++) {
      const el = allChildren[i];
      if (!touched.has(el)) touched.set(el, el.style.order);
      el.style.order = String(assigned.get(el) ?? i);
    }
    for (const card of cards) requestDuration(card.id);
  }
}

function scheduleApply(): void {
  if (!alive || applyPending) return;
  applyPending = true;
  requestAnimationFrame(() => {
    applyPending = false;
    applyOrdering();
  });
}

function requestDuration(id: string): void {
  if (durations.has(id) || requested.has(id)) return;
  requested.add(id);
  taskQueue.push(id);
  void processQueue();
}

async function processQueue(): Promise<void> {
  while (alive && queueBusy < MAX_PARALLEL && taskQueue.length) {
    const id = taskQueue.shift()!;
    queueBusy++;
    void (async () => {
      try {
        const playlist = await TidalApi.playlist(id);
        const seconds = Number(playlist?.duration);
        durations.set(id, playlist && Number.isFinite(seconds) && seconds >= 0 ? seconds : null);
      } catch (error) {
        durations.set(id, null);
        console.warn(`[${PREFIX}] Unable to fetch playlist ${id}`, error);
      } finally {
        queueBusy--;
        if (alive) {
          scheduleApply();
          void processQueue();
          if (queueBusy === 0 && taskQueue.length === 0 && selectedDirection) {
            const valid = Array.from(durations.values()).filter((n) => n !== null).length;
            showStatus(`Sorted loaded playlists by duration (${valid} times available).`);
          }
        }
      }
    })();
  }
}

function scan(): void {
  if (!alive) return;
  injectMenu();
  if (selectedDirection) scheduleApply();
}
function scheduleScan(): void {
  if (!alive || scanPending) return;
  scanPending = true;
  requestAnimationFrame(() => {
    scanPending = false;
    scan();
  });
}

/** If a built-in sort is clicked, stop overriding its layout. */
function nativeSortClicked(event: MouseEvent): void {
  const element = event.target;
  if (!(element instanceof Element) || element.closest(`.${PREFIX}-choice`)) return;
  let el: Element | null = element;
  for (let i = 0; el && i < 3; i++, el = el.parentElement) {
    if (el.childElementCount > 4) continue;
    const label = labelOf(el);
    if (label !== "Created date" && label !== "Updated date" && label !== "Alphabetical") continue;
    const menu = findSortMenu();
    if (menu && menu.parent.contains(el)) {
      saveDirection(null);
      restoreOrders();
    }
    return;
  }
}

const observer = new MutationObserver(scheduleScan);
observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener("click", nativeSortClicked, true);
scan();

unloads.add(() => {
  alive = false;
  observer.disconnect();
  document.removeEventListener("click", nativeSortClicked, true);
  restoreOrders();
  css.remove();
  document.getElementById(`${PREFIX}-status`)?.remove();
  if (statusTimer !== null) clearTimeout(statusTimer);
  document.querySelectorAll(`.${PREFIX}-choice`).forEach((el) => el.remove());
  taskQueue.length = 0;
  requested.clear();
  durations.clear();
});
