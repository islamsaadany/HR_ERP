"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveVideoProgress } from "@/app/(app)/learning/actions";
import { youTubeId, vimeoId } from "@/lib/learning/video";
import type { VideoProvider } from "@/lib/learning/video";
import { CheckpointPrompt, type Checkpoint } from "@/components/learning/CheckpointPrompt";

/**
 * The instrumented video player — resume, watch-credit and checkpoints.
 *
 * Three very different playback APIs (a native `<video>`, the YouTube IFrame API, the Vimeo SDK)
 * feed ONE tick handler, so the credit rules below are written once rather than three times with
 * two of them subtly wrong.
 *
 * TWO RULES MAKE THE CREDIT HONEST:
 *  - a tick only credits time when the gap since the last tick is small (< 1.5s). Dragging the
 *    playhead forward produces a huge gap, so skipped material earns nothing.
 *  - credit accumulates in a ref and is only ever sent upward; the server maxes it, so rewinding
 *    to rewatch never costs the learner anything.
 *
 * ── WHY EVERY CALLBACK BELOW LIVES IN A REF ────────────────────────────────────────────────────
 * A player must be built ONCE per video and then left alone. The first version of this file put
 * `processTick` (and through it `onWatched`) in the player effects' dependency arrays, and
 * `onWatched` arrives as an inline arrow from the parent — a new function on every render. The
 * result was a loop that shipped and broke playback: press play → first tick → `onWatched` →
 * parent `setState` → re-render → new `onWatched` → new `processTick` → effect deps changed →
 * cleanup DESTROYS the player → a fresh one is built at the start position. The video played for
 * about half a second, stopped, and reset, forever.
 *
 * So: the effects below depend on `provider` and `src` ONLY — the two things that genuinely mean
 * "this is a different video". Everything else is reached through a ref that is kept current by
 * its own effect, which is what lets the callbacks change freely without touching the player.
 */

const scriptCache = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = scriptCache.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(el);
    });
    scriptCache.set(src, p);
  }
  return p;
}

export function VideoLesson({
  lessonId,
  src,
  provider,
  initialPositionSec,
  initialWatchedSec,
  checkpoints,
  enforceNoSkip = false,
  onWatched,
}: {
  lessonId: string;
  src: string;
  provider: VideoProvider;
  initialPositionSec: number;
  initialWatchedSec: number;
  checkpoints: Checkpoint[];
  /**
   * Prevent dragging past the furthest point actually watched. Set when the lesson carries a watch
   * requirement — that requirement is the thing being enforced, so without one there is nothing to
   * police and the learner keeps a normal scrubber.
   */
  enforceNoSkip?: boolean;
  /** Report (watchedSec, durationSec) up so the page can show live progress toward the gate. */
  onWatched?: (watchedSec: number, durationSec: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const watchedRef = useRef(initialWatchedSec);
  const lastTimeRef = useRef(0);
  const lastSaveRef = useRef(0);
  const answeredRef = useRef<Set<string>>(new Set());
  const activeCueRef = useRef<Checkpoint | null>(null);
  const resumeRef = useRef<() => void>(() => {});
  const [activeCue, setActiveCue] = useState<Checkpoint | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [blockedSkip, setBlockedSkip] = useState(false);
  /**
   * The furthest point legitimately reached.
   *
   * Seeded from the LOWER of the resume position and the credited watched seconds, which is the
   * whole subtlety: the resume position is where playback last STOPPED, and someone who dragged to
   * the end once has a resume position at the end while having watched almost none of it. Seeding
   * from that alone (the first version of this, and the reason it did nothing) hands them the
   * entire scrubber on their next visit.
   *
   * Credited seconds alone would be wrong the other way: rewatching 0–30s twice credits 60s
   * against a furthest point of 30s, which would unlock 30 seconds they have never seen. The
   * lower of the two is true under both.
   */
  const maxReachedRef = useRef(Math.min(initialPositionSec, initialWatchedSec));
  const enforceRef = useRef(enforceNoSkip);

  // ── The moving parts, held in refs so the player effects never see them change ──
  const onWatchedRef = useRef(onWatched);
  const checkpointsRef = useRef(checkpoints);
  const lessonIdRef = useRef(lessonId);
  const startAtRef = useRef(initialPositionSec);
  useEffect(() => {
    onWatchedRef.current = onWatched;
    checkpointsRef.current = [...checkpoints].sort((a, b) => a.atSec - b.atSec);
    lessonIdRef.current = lessonId;
    enforceRef.current = enforceNoSkip;
  });

  // The notice is a nudge, not a state — it clears itself so it doesn't sit there accusing anyone.
  useEffect(() => {
    if (!blockedSkip) return;
    const t = setTimeout(() => setBlockedSkip(false), 4000);
    return () => clearTimeout(t);
  }, [blockedSkip]);

  const save = useCallback((positionSec: number, durationSec: number) => {
    void saveVideoProgress(
      lessonIdRef.current,
      positionSec,
      Math.round(watchedRef.current),
      Math.round(durationSec)
    );
  }, []);

  /** Shared per-tick logic. Stable by construction — it closes over refs only. */
  /** Tolerance for a legitimate advance. Ticks land every 500ms, so anything beyond this is a drag. */
  const SEEK_TOLERANCE_SEC = 1.5;

  const processTick = useRef(
    (
      now: number,
      duration: number,
      isPlaying: boolean,
      pause: () => void,
      seekTo?: (sec: number) => void
    ) => {
      // ── No skipping ahead ──────────────────────────────────────────────────────────────────
      // Credit already ignored a forward drag, so the watch requirement was never satisfiable by
      // skipping. But the learner could still drag to the end and SEE the video finish, which
      // reads as "done" even though the platform disagrees — a confusing place to leave someone.
      // On a lesson with a watch requirement we now put the playhead back where they got to.
      //
      // Rewinding stays free, deliberately: it is how you rewatch something you missed, and the
      // player already advertises that it costs nothing.
      if (enforceRef.current && seekTo && now > maxReachedRef.current + SEEK_TOLERANCE_SEC) {
        seekTo(maxReachedRef.current);
        lastTimeRef.current = maxReachedRef.current;
        setBlockedSkip(true);
        return;
      }
      if (now > maxReachedRef.current) maxReachedRef.current = now;

      const delta = now - lastTimeRef.current;
      // < 1.5s means genuine playback. A drag forward produces a far bigger gap and earns nothing.
      if (delta > 0 && delta < 1.5 && isPlaying) {
        watchedRef.current = Math.min(
          watchedRef.current + delta,
          duration || watchedRef.current + delta
        );
        onWatchedRef.current?.(watchedRef.current, duration || 0);
      }
      lastTimeRef.current = now;

      // ── Reaching the end credits the whole video ───────────────────────────────────────────
      // Without this, "must watch 100%" is unreachable and the Complete button stays dead
      // forever — which is exactly what happened on the live deploy. Credit only accrues on ticks
      // that see the video PLAYING, so every buffer, ad break, tab switch and the final partial
      // second is lost; a 2:06 video reliably lands around 2:00 of credit, and 100% of 126s is
      // 126s. No tolerance chosen by feel fixes that honestly.
      //
      // What does: playback arriving at the end IS the proof. It cannot be faked, because a watch
      // requirement always turns on the no-skip rule above — the playhead can't get here without
      // having passed through everything before it.
      if (duration > 0 && now >= duration - SEEK_TOLERANCE_SEC) {
        if (watchedRef.current < duration) {
          watchedRef.current = duration;
          onWatchedRef.current?.(watchedRef.current, duration);
        }
        // Persist immediately rather than waiting for the 5s throttle — the learner is about to
        // press Complete, and the server decides from what it has stored.
        lastSaveRef.current = now;
        void saveVideoProgress(lessonIdRef.current, now, Math.round(duration), Math.round(duration));
      }

      if (now - lastSaveRef.current > 5) {
        lastSaveRef.current = now;
        void saveVideoProgress(
          lessonIdRef.current,
          now,
          Math.round(watchedRef.current),
          Math.round(duration || 0)
        );
      }

      if (!activeCueRef.current) {
        const due = checkpointsRef.current.find(
          (c) => !answeredRef.current.has(c.id) && now >= c.atSec
        );
        if (due) {
          activeCueRef.current = due;
          setActiveCue(due);
          pause();
        }
      }
    }
  ).current;

  function passCue(cue: Checkpoint) {
    answeredRef.current.add(cue.id);
    activeCueRef.current = null;
    setActiveCue(null);
    resumeRef.current();
  }

  // ── native <video> ──
  useEffect(() => {
    if (provider !== "file") return;
    const el = videoRef.current;
    if (!el) return;
    if (startAtRef.current > 0) el.currentTime = startAtRef.current;
    resumeRef.current = () => void el.play();

    const onTime = () =>
      processTick(
        el.currentTime,
        el.duration || 0,
        !el.paused,
        () => el.pause(),
        (sec) => {
          el.currentTime = sec;
        }
      );
    const onPause = () => save(el.currentTime, el.duration || 0);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
      save(el.currentTime, el.duration || 0);
    };
  }, [provider, src, processTick, save]);

  // ── YouTube ──
  useEffect(() => {
    if (provider !== "youtube") return;
    const id = youTubeId(src);
    const host = mountRef.current;
    if (!id || !host) return;

    // The IFrame API REPLACES the element it is given, so it gets a disposable child rather than
    // the ref'd host — otherwise a remount would find its mount point gone.
    const target = document.createElement("div");
    host.appendChild(target);

    type YTPlayer = {
      getCurrentTime: () => number;
      getDuration: () => number;
      getPlayerState: () => number;
      pauseVideo: () => void;
      playVideo: () => void;
      seekTo: (seconds: number, allowSeekAhead: boolean) => void;
      destroy: () => void;
    };
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    void loadScript("https://www.youtube.com/iframe_api").then(() => {
      const start = () => {
        if (cancelled) return;
        const YT = (
          window as unknown as {
            YT?: { Player: new (el: HTMLElement, o: unknown) => YTPlayer };
          }
        ).YT;
        if (!YT?.Player) {
          setTimeout(start, 120);
          return;
        }
        player = new YT.Player(target, {
          videoId: id,
          // `origin` is REQUIRED, not optional politeness. With the JS API enabled, YouTube
          // postMessages back to the embedding page, and without being told our origin it aims at
          // https://www.youtube.com and the browser refuses:
          //   "Failed to execute 'postMessage'… target origin does not match the recipient
          //    window's origin"
          // which is what the live deploy reported. `host` uses the no-cookie domain, which also
          // stops the player calling doubleclick and pagead endpoints that ad blockers kill —
          // several of the console errors we saw were exactly those, and a blocked player can
          // stall rather than fail cleanly.
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            start: Math.floor(startAtRef.current),
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onError: (e: { data?: number }) => {
              // 2 bad id · 5 HTML5 error · 100 removed/private · 101 & 150 embedding disabled.
              // Surfacing this beats a black rectangle nobody can explain.
              setPlayerError(
                e?.data === 101 || e?.data === 150
                  ? "This video's owner doesn't allow it to be played outside YouTube. Use a different video, or upload it to a channel that permits embedding."
                  : e?.data === 100
                    ? "This video is private or has been removed."
                    : "This video couldn't be loaded."
              );
            },
            onReady: () => {
              resumeRef.current = () => player?.playVideo();
              timer = setInterval(() => {
                if (!player) return;
                processTick(
                  player.getCurrentTime(),
                  player.getDuration() || 0,
                  player.getPlayerState() === 1, // 1 = playing
                  () => player?.pauseVideo(),
                  (sec) => player?.seekTo(sec, true)
                );
              }, 500);
            },
          },
        });
      };
      start();
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (player) {
        save(player.getCurrentTime(), player.getDuration() || 0);
        player.destroy();
      }
      target.remove();
    };
  }, [provider, src, processTick, save]);

  // ── Vimeo ──
  useEffect(() => {
    if (provider !== "vimeo") return;
    const id = vimeoId(src);
    const host = mountRef.current;
    if (!id || !host) return;

    const target = document.createElement("div");
    host.appendChild(target);

    type VimeoPlayer = {
      getCurrentTime: () => Promise<number>;
      getDuration: () => Promise<number>;
      getPaused: () => Promise<boolean>;
      pause: () => Promise<void>;
      play: () => Promise<void>;
      setCurrentTime: (t: number) => Promise<number>;
      destroy: () => Promise<void>;
    };
    let player: VimeoPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    void loadScript("https://player.vimeo.com/api/player.js").then(async () => {
      if (cancelled) return;
      const Vimeo = (
        window as unknown as {
          Vimeo?: { Player: new (el: HTMLElement, o: unknown) => VimeoPlayer };
        }
      ).Vimeo;
      if (!Vimeo?.Player) return;
      player = new Vimeo.Player(target, { id: Number(id), responsive: true });
      resumeRef.current = () => void player?.play();
      if (startAtRef.current > 0) {
        await player.setCurrentTime(startAtRef.current).catch(() => 0);
      }
      timer = setInterval(async () => {
        if (!player) return;
        const [now, duration, paused] = await Promise.all([
          player.getCurrentTime(),
          player.getDuration(),
          player.getPaused(),
        ]).catch(() => [0, 0, true] as const);
        processTick(now, duration || 0, !paused, () => void player?.pause(), (sec) => {
          void player?.setCurrentTime(sec);
        });
      }, 500);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      void player?.destroy().catch(() => {});
      target.remove();
    };
  }, [provider, src, processTick, save]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-navy-900">
      {provider === "file" ? (
        <video ref={videoRef} src={src} controls playsInline className="h-full w-full" />
      ) : (
        <div ref={mountRef} className="h-full w-full [&>div]:h-full [&>div]:w-full [&_iframe]:h-full [&_iframe]:w-full" />
      )}
      {blockedSkip ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-navy-900/85 px-4 py-2.5 text-center text-[12.5px] text-white">
          This lesson has to be watched through — you can rewind, but not skip ahead.
        </div>
      ) : null}
      {playerError ? (
        <div className="absolute inset-0 grid place-items-center bg-navy-900 p-6 text-center">
          <p className="max-w-[42ch] text-sm text-white/90">{playerError}</p>
        </div>
      ) : null}
      {activeCue ? <CheckpointPrompt checkpoint={activeCue} onPass={() => passCue(activeCue)} /> : null}
    </div>
  );
}
