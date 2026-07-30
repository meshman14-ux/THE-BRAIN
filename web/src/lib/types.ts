export type SystemKey = "life" | "empire";

export type Pillar = {
  id: string;
  system: SystemKey;
  name: string;
  emoji: string | null;
  standard: string | null;
  purpose?: string | null;
  vision?: string | null;
  current?: string | null;
  sort_order: number;
  active: boolean;
};

export type InboxItem = {
  id: string;
  raw_text: string;
  captured_at: string;
  status: string;
};

export type Priority = "High" | "Med" | "Low";
export type TaskStatus = "open" | "doing" | "done" | "dropped" | "waiting";

export type Task = {
  id: string;
  title: string;
  pillar_id: string | null;
  do_date: string | null;
  due_date: string | null;
  priority: Priority;
  status: TaskStatus;
};

export const SYSTEM_LABEL: Record<SystemKey, string> = {
  life: "LIFE_OS",
  empire: "EMPIRE_OS",
};

export const SYSTEM_BLURB: Record<SystemKey, string> = {
  life: "You as a person",
  empire: "You as an owner",
};

export const PRIORITY_COLOUR: Record<Priority, string> = {
  High: "var(--bad)",
  Med: "var(--warn)",
  Low: "var(--faint)",
};

/** Kanban lanes, in order. Moving right advances the task. */
export const LANES: { key: TaskStatus; label: string; colour: string }[] = [
  { key: "open", label: "To Do", colour: "var(--todo)" },
  { key: "doing", label: "In Progress", colour: "var(--doing)" },
  { key: "done", label: "Done", colour: "var(--done)" },
];

/** Monday-first ISO date list for the week containing `ref`. */
export function weekDates(ref: Date = new Date()): string[] {
  const d = new Date(ref);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
