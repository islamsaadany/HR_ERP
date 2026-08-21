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
  onWatched,
}: {
  lessonId: string;
  src: string;
  provider: VideoProvider;
  initialPositionSec: number;
  initialWatchedSec: number;
  checkpoints: Checkpoint[];
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

  // ── The moving parts, held in refs so the player effects never see them change ──
  const onWatchedRef = useRef(onWatched);
  const checkpointsRef = useRef(checkpoints);
  const lessonIdRef = useRef(lessonId);
  const startAtRef = useRef(initialPositionSec);
  useEffect(() => {
    onWatchedRef.current = onWatched;
    checkpointsRef.current = [...checkpoints].sort((a, b) => a.atSec - b.atSec);
    lessonIdRef.current = lessonId;
  });

  const save = useCallback((positionSec: number, durationSec: number) => {
    void saveVideoProgress(
      lessonIdRef.current,
      positionSec,
      Math.round(watchedRef.current),
      Math.round(durationSec)
    );
  }, []);

  /** Shared per-tick logic. Stable by construction — it closes over refs only. */
  const processTick = useRef(
    (now: number, duration: number, isPlaying: boolean, pause: () => void) => {
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
      processTick(el.currentTime, el.duration || 0, !el.paused, () => el.pause());
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
          playerVars: { start: Math.floor(startAtRef.current), rel: 0, playsinline: 1 },
          events: {
            onReady: () => {
              resumeRef.current = () => player?.playVideo();
              timer = setInterval(() => {
                if (!player) return;
                processTick(
                  player.getCurrentTime(),
                  player.getDuration() || 0,
                  player.getPlayerState() === 1, // 1 = playing
                  () => player?.pauseVideo()
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
        processTick(now, duration || 0, !paused, () => void player?.pause());
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
      {activeCue ? <CheckpointPrompt checkpoint={activeCue} onPass={() => passCue(activeCue)} /> : null}
    </div>
  );
}
