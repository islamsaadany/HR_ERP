/**
 * Pure helpers for classifying and normalising lesson video URLs (spec 038). Shared by the
 * authoring editor and the course player, so this module must stay free of any
 * server-only imports (safe to bundle on the client).
 */

const YT_HOSTS = ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"];
const VIMEO_HOSTS = ["vimeo.com", "www.vimeo.com", "player.vimeo.com"];
const DRIVE_HOSTS = ["drive.google.com", "docs.google.com"];

/** Extract a Google Drive file id from any of its share/link forms. */
function driveFileId(u: URL): string | null {
  // .../file/d/FILE_ID/view  or  .../d/FILE_ID/...
  const m = u.pathname.match(/\/(?:file\/)?d\/([^/]+)/);
  if (m?.[1]) return m[1];
  // ...?id=FILE_ID  (open?id=, uc?id=, etc.)
  return u.searchParams.get("id");
}

/**
 * Convert common YouTube/Vimeo share URLs to their embeddable player URL so an
 * instructor can paste a normal link (e.g. a `watch?v=…` or `youtu.be/…` URL)
 * and still get a working embed. Direct file URLs and already-embed URLs pass
 * through unchanged.
 */
export function normalizeVideoUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const host = u.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube.com/embed/${id}` : raw;
  }
  if (YT_HOSTS.includes(host)) {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : raw;
    }
    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      return id ? `https://www.youtube.com/embed/${id}` : raw;
    }
    return raw; // already an /embed/… URL
  }
  if (VIMEO_HOSTS.includes(host) && !host.startsWith("player.")) {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : raw;
  }
  if (DRIVE_HOSTS.includes(host)) {
    // Already a preview embed? Leave it alone.
    if (u.pathname.endsWith("/preview")) return raw;
    const id = driveFileId(u);
    return id ? `https://drive.google.com/file/d/${id}/preview` : raw;
  }
  return raw;
}

/**
 * A video's playback provider. "file" = a direct media file we play in a
 * native <video> (full control). "youtube"/"vimeo" = controllable via their
 * player SDKs. "embed" = an uncontrolled third-party iframe (e.g. Google Drive)
 * — plays, but we cannot read time, gate, or inject in-video questions.
 */
export type VideoProvider = "file" | "youtube" | "vimeo" | "embed";

export function videoProvider(url: string): VideoProvider {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (YT_HOSTS.includes(host) || host.endsWith("youtube-nocookie.com"))
      return "youtube";
    if (VIMEO_HOSTS.includes(host)) return "vimeo";
    if (DRIVE_HOSTS.includes(host)) return "embed";
    return "file";
  } catch {
    return "file";
  }
}

/** Extract the YouTube video id from any normalized/embed/watch/short URL. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
    if (u.pathname === "/watch") return u.searchParams.get("v");
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
    return null;
  } catch {
    return null;
  }
}

/** Extract the numeric Vimeo id from a vimeo.com or player.vimeo.com URL. */
export function vimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean);
    const id = u.pathname.includes("/video/") ? seg[seg.indexOf("video") + 1] : seg[0];
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * True when the URL is an embeddable third-party player page (rendered in an
 * `<iframe>`); false for a direct media file (rendered in a `<video>` element).
 */
export function isEmbedVideo(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      YT_HOSTS.includes(host) ||
      VIMEO_HOSTS.includes(host) ||
      DRIVE_HOSTS.includes(host) ||
      host.endsWith("youtube-nocookie.com")
    );
  } catch {
    return false;
  }
}

// ─── House adaptation (spec 038) ────────────────────────────────────────
// Everything above is lifted from the FFLMS codebase unchanged. Below is the bridge to this
// platform's stored `VideoSource` enum and the one predicate FR-031 turns on.

import type { VideoSource } from "@prisma/client";

/**
 * Classify a link into the `VideoSource` we STORE on a lesson block, so the server can later
 * check trackability without re-parsing the URL.
 *
 * Note there is no `UPLOAD` member: the platform hosts no video (research D8). A link we don't
 * recognise is treated as a direct media file, which is the safe reading — we render it in a
 * native `<video>` and get full control, or it simply fails to play. Guessing "embed" for an
 * unknown host would claim tracking we cannot deliver.
 */
export function videoSourceFor(url: string): VideoSource {
  switch (videoProvider(url)) {
    case "youtube":
      return "YOUTUBE";
    case "vimeo":
      return "VIMEO";
    case "embed":
      return "DRIVE";
    default:
      return "DIRECT_FILE";
  }
}

/**
 * Whether we can observe playback for this source — the gate behind FR-031.
 *
 * Google Drive embeds play but expose no playback API, so we can read no time from them. A lesson
 * on a DRIVE video therefore may carry NO watch requirement and NO checkpoint: the server refuses
 * to store either, rather than accepting a setting it could never enforce. That refusal is the
 * whole point — a gate that silently does nothing is worse than no gate, because everyone believes
 * the training was watched.
 */
export function isTrackableSource(source: VideoSource): boolean {
  return source !== "DRIVE";
}

/** Why a source can't be gated, for the message the operator actually sees. */
export function untrackableReason(source: VideoSource): string | null {
  return source === "DRIVE"
    ? "Google Drive can't report playback, so this lesson can't be gated or carry a checkpoint. The video will still play."
    : null;
}
