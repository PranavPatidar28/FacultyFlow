"use client";
import {
  Activity,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AppData } from "@/lib/types";
import { Modal, type RunAction } from "./ui/workspace-ui";
import { Button } from "./ui/button";
export function GenerationDialog({
  data,
  busy,
  run,
  onClose,
  onGenerated,
}: {
  data: AppData;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
  onGenerated: () => void;
}) {
  return (
    <Modal title="Generate timetable" onClose={onClose}>
      <div className="generation-intro">
        <span className="generation-icon">
          <Sparkles size={30} />
        </span>
        <p>
          The scheduler allocates qualified teachers, then fits every class into
          available periods and rooms.
        </p>
      </div>
      <div className="generation-stats">
        <span>
          <strong>{data.faculty.length}</strong>faculty
        </span>
        <span>
          <strong>{data.sections.length}</strong>sections
        </span>
        <span>
          <strong>
            {data.requirements.reduce((s, r) => s + r.sessions, 0)}
          </strong>
          weekly sessions
        </span>
      </div>
      <div className="policy-list">
        <p>
          <ShieldCheck size={17} /> Qualifications, availability, and teaching
          limits come first.
        </p>
        <p>
          <Activity size={17} /> Fair workloads, fewer gaps, then preferred
          hours.
        </p>
        <p>
          <Clock3 size={17} /> Up to 120 seconds of solving; review before
          publishing.
        </p>
      </div>
      <div className="info-box">
        Generation creates a new draft. Locked assignments in the latest draft
        are preserved.
      </div>
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={
            busy ||
            !data.requirements.length ||
            data.jobs.some((j) => ["queued", "running"].includes(j.status))
          }
          onClick={async () => {
            const result = await run({
              type: "generate",
              key: crypto.randomUUID(),
              versionId: [...data.versions]
                .reverse()
                .find((v) => v.status === "draft")?.id,
            });
            if (result) {
              onGenerated();
            }
          }}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          Generate a draft
        </Button>
      </div>
    </Modal>
  );
}
