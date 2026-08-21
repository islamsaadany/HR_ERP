"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  removeGroupMember,
  renameGroup,
} from "@/app/(app)/admin/learning/access-actions";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT } from "@/components/learning/ui";

export type GroupRow = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; department: string | null }>;
  courseCount: number;
};

/**
 * Named cohorts for the cases no registry field describes — "2026 new joiners", "Client X
 * project team". Read-first, following DepartmentsManager.
 *
 * Membership is LIVE: adding someone hands them every course currently assigned to the group,
 * with no back-fill. The row says how many courses that is, so nobody adds a person to a group
 * without seeing what they're about to be given.
 */
export function GroupManager({
  groups,
  employees,
}: {
  groups: GroupRow[];
  employees: Array<{ id: string; name: string; department: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input
          className={INPUT}
          value={newName}
          placeholder="New group name, e.g. 2026 new joiners"
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="button"
          disabled={pending || !newName.trim()}
          className={BTN_NAVY}
          onClick={() => run(() => createGroup(newName), () => setNewName(""))}
        >
          Create group
        </button>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          No groups yet. Groups are for cohorts that no department or tenure band describes.
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                {editingId === group.id ? (
                  <>
                    <input
                      className={INPUT}
                      value={draft}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={pending}
                      className={BTN_GHOST}
                      onClick={() => run(() => renameGroup(group.id, draft), () => setEditingId(null))}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted hover:underline"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[14px] font-bold text-navy-800">{group.name}</span>
                    <span className={CHIP.muted}>
                      {group.members.length} member{group.members.length === 1 ? "" : "s"}
                    </span>
                    {group.courseCount > 0 ? (
                      <span className={CHIP.navy}>
                        {group.courseCount} course{group.courseCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="text-xs font-semibold text-navy-700 hover:underline"
                      onClick={() => setOpenId(openId === group.id ? null : group.id)}
                    >
                      {openId === group.id ? "Close" : "Members"}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-navy-700 hover:underline"
                      onClick={() => {
                        setEditingId(group.id);
                        setDraft(group.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-red-700 hover:underline"
                      onClick={() => run(() => deleteGroup(group.id))}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>

              {openId === group.id ? (
                <div className="border-t border-line px-4 py-3">
                  {group.courseCount > 0 ? (
                    <p className="mb-2 text-[12px] text-muted">
                      Anyone added here immediately gets this group&rsquo;s {group.courseCount}{" "}
                      course{group.courseCount === 1 ? "" : "s"}.
                    </p>
                  ) : null}
                  <ul className="mb-3 space-y-1">
                    {group.members.length === 0 ? (
                      <li className="text-[13px] text-muted">Nobody in this group yet.</li>
                    ) : (
                      group.members.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 text-[13px]">
                          <span className="min-w-0 flex-1 truncate">
                            {m.name}
                            {m.department ? (
                              <span className="text-muted"> — {m.department}</span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            disabled={pending}
                            className="text-xs text-red-700 hover:underline"
                            onClick={() => run(() => removeGroupMember(group.id, m.id))}
                          >
                            Remove
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                  <select
                    className={INPUT}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) run(() => addGroupMembers(group.id, [e.target.value]));
                    }}
                  >
                    <option value="">Add someone…</option>
                    {employees
                      .filter((p) => !group.members.some((m) => m.id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.department ? ` — ${p.department}` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
