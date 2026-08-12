/**
 * Position a tooltip element as a fixed, viewport-anchored layer under (or above)
 * its trigger. Fixed positioning escapes any `overflow:hidden`/`overflow-x:auto`
 * ancestor, so a tip inside a horizontally-scrolling table is never clipped.
 * Shared by the incentive report's hover tips and the config ⓘ popover.
 */
export function placeFixedTip(trigger: HTMLElement, tip: HTMLElement): void {
  const r = trigger.getBoundingClientRect();
  const w = tip.offsetWidth || 220;
  const h = tip.offsetHeight || 44;
  const margin = 8;

  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));

  // Prefer below the trigger; flip above when there isn't room.
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - margin) top = r.top - h - 6;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}
