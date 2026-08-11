"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { updateProfilePhoto, removeProfilePhoto } from "@/app/(app)/profile/photo-actions";

/**
 * My Profile header (spec: profile picture) — the employee's avatar plus self-service
 * Upload / Change / Remove controls. Photo shown here, in the Team Directory, and the nav.
 */
export function ProfilePhotoHeader({
  name,
  photoUrl,
  title,
  department,
}: {
  name: string;
  photoUrl: string | null;
  title: string | null;
  department: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    const fd = new FormData();
    fd.append("photo", file);
    setError(null);
    startTransition(async () => {
      const res = await updateProfilePhoto(fd);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function onRemove() {
    setError(null);
    startTransition(async () => {
      const res = await removeProfilePhoto();
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-5">
      <Avatar name={name} photoUrl={photoUrl} size={88} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">My Profile</p>
        <h1 className="mt-0.5 font-serif text-3xl text-ink">{name}</h1>
        <p className="mt-0.5 text-muted">
          {title ?? "—"}
          {department ? ` · ${department}` : ""}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onPick}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
            className={
              photoUrl
                ? "rounded-lg bg-navy-50 px-3.5 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-100 disabled:opacity-60"
                : "rounded-lg bg-navy-800 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
            }
          >
            {pending ? "Uploading…" : photoUrl ? "Change photo" : "Upload photo"}
          </button>
          {photoUrl ? (
            <button
              type="button"
              disabled={pending}
              onClick={onRemove}
              className="text-sm text-muted underline hover:text-red-600 disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
        <p className="mt-2 text-xs text-muted">JPG, PNG, WEBP or GIF, up to 5 MB. Shown to colleagues in the Team Directory.</p>
      </div>
    </div>
  );
}
