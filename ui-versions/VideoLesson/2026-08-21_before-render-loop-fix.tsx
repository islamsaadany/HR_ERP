"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveVideoProgress } from "@/app/(app)/learning/actions";
import { youTubeId, vimeoId } from "@/lib/learning/video";
import type { VideoProvider } from "@/lib/learning/video";
import { CheckpointPrompt, type Checkpoint } from "@/components/learning/CheckpointPrompt";

/**
 * The instrumented video player — resume, watch-credit and checkpoints.
 *
 * Adapted from the FFLMS player. Three very different playback APIs (a native `<video>`, the
 * YouTube IFrame API, the Vimeo SDK) all feed ONE tick handler, so the rules below are written
 * once rather than three times with two of them subtly wrong.
 *
 * TWO RULES MAKE THE CREDIT HONEST:
 *  - a tick only credits time when the gap since the last tick is small (< 1.5s). Dragging the
 *    playhead forward produces a huge gap, so skipped material earns nothing.
 *  - credit accumulates in a ref and is only ever sent upward; the server maxes it, so rewinding
 *    to rewatch never costs the learner anything.
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

  const sorted = [...checkpoints].sort((a, b) => a.atSec - b.atSec);

  const save = useCallback(
    (positionSec: number, durationSec: number) => {
      void saveVideoProgress(
        lessonId,
        positionSec,
        Math.round(watchedRef.current),
        Math.round(durationSec)
      );
    },
    [lessonId]
  );

  const processTick = useCallback(
    (now: number, duration: number, isPlaying: boolean, pause: () => void) => {
      const delta = now - lastTimeRef.current;
      // < 1.5s means genuine playback. A drag forward produces a far bigger gap and earns nothing.
      if (delta > 0 && delta < 1.5 && isPlaying) {
        watchedRef.current = Math.min(
          watchedRef.current + delta,
          duration || watchedRef.current + delta
        );
        onWatched?.(watchedRef.current, duration || 0);
      }
      lastTimeRef.current = now;

      if (now - lastSaveRef.current > 5) {
        lastSaveRef.current = now;
        save(now, duration);
      }

      if (!activeCueRef.current) {
        const due = sorted.find((c) => !answeredRef.current.has(c.id) && now >= c.atSec);
        if (due) {
          activeCueRef.current = due;
          setActiveCue(due);
          pause();
        }
      }
    },
    // `sorted` is derived from a stable prop each render; save/onWatched are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [save, onWatched]
  );

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
    if (initialPositionSec > 0) el.currentTime = initialPositionSec;
    resumeRef.current = () => void el.play();

    const onTime = () =>
      processTick(el.currentTime, el.duration || 0, !el.paused, () => el.pause());
    const onEnd = () => save(el.currentTime, el.duration || 0);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onEnd);
      save(el.currentTime, el.duration || 0);
    };
  }, [provider, initialPositionSec, processTick, save]);

  // ── YouTube ──
  useEffect(() => {
    if (provider !== "youtube") return;
    const id = youTubeId(src);
    const mount = mountRef.current;
    if (!id || !mount) return;

    let player: { getCurrentTime: () => number; getDuration: () => number; getPlayerState: () => number; pauseVideo: () => void; playVideo: () => void; destroy: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    void loadScript("https://www.youtube.com/iframe_api").then(() => {
      const start = () => {
        if (cancelled) return;
        const YT = (window as unknown as { YT?: { Player: new (el: HTMLElement, o: unknown) => typeof player } }).YT;
        if (!YT?.Player) return void setTimeout(start, 120);
        player = new YT.Player(mount, {
          videoId: id,
          playerVars: { start: Math.floor(initialPositionSec), rel: 0 },
          events: {
            onReady: () => {
              resumeRef.current = () => player?.playVideo();
              timer = setInterval(() => {
                if (!player) return;
                processTick(
                  player.getCurrentTime(),
                  player.getDuration() || 0,
                  player.getPlayerState() === 1,
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
    };
  }, [provider, src, initialPositionSec, processTick, save]);

  // ── Vimeo ──
  useEffect(() => {
    if (provider !== "vimeo") return;
    const id = vimeoId(src);
    const mount = mountRef.current;
    if (!id || !mount) return;

    let player: { getCurrentTime: () => Promise<number>; getDuration: () => Promise<number>; getPaused: () => Promise<boolean>; pause: () => Promise<void>; play: () => Promise<void>; setCurrentTime: (t: number) => Promise<number>; destroy: () => Promise<void> } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    void loadScript("https://player.vimeo.com/api/player.js").then(async () => {
      if (cancelled) return;
      const Vimeo = (window as unknown as { Vimeo?: { Player: new (el: HTMLElement, o: unknown) => NonNullable<typeof player> } }).Vimeo;
      if (!Vimeo?.Player) return;
      player = new Vimeo.Player(mount, { id: Number(id), responsive: true });
      resumeRef.current = () => void player?.play();
      if (initialPositionSec > 0) await player.setCurrentTime(initialPositionSec).catch(() => {});
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
      void player?.destroy();
    };
  }, [provider, src, initialPositionSec, processTick, save]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-navy-900">
      {provider === "file" ? (
        <video ref={videoRef} src={src} controls playsInline className="h-full w-full" />
      ) : (
        <div ref={mountRef} className="h-full w-full" />
      )}
      {activeCue ? <CheckpointPrompt checkpoint={activeCue} onPass={() => passCue(activeCue)} /> : null}
    </div>
  );
}
