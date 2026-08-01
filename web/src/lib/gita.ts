/**
 * The Bhagavad Gita layer, ported from Jay's prototype (§B4).
 *
 * One source array, one deterministic selector. The verse rotates by date
 * rather than at random, so every surface asked on the same day agrees —
 * and an `offset` lets two panels on one screen show different verses
 * without either of them lying about which day it is.
 *
 * To add verses, extend GITA only. Nothing else needs to change.
 */

export type Verse = { v: string; ref: string };

export const GITA: Verse[] = [
  {
    v: "You have a right to your actions, but never to your actions' fruits. Act for the action's sake.",
    ref: "BG 2.47",
  },
  {
    v: "It is better to do your own duty badly, than to perfectly do another's.",
    ref: "BG 3.35",
  },
  {
    v: "A person can rise through the efforts of his own mind; or draw himself down, in the same manner.",
    ref: "BG 6.5",
  },
  {
    v: "The mind is restless and difficult to restrain, but it is subdued by practice.",
    ref: "BG 6.35",
  },
  {
    v: "Whatever you do, whatever you eat, whatever you offer — do it as an offering.",
    ref: "BG 9.27",
  },
  {
    v: "No effort on this path is ever wasted, and no obstacle prevails.",
    ref: "BG 2.40",
  },
  {
    v: "Set your heart on your work, but never on its reward.",
    ref: "BG 2.47",
  },
  {
    v: "The wise mourn neither for the living nor the dead.",
    ref: "BG 2.11",
  },
  {
    v: "Perform your duty with an even mind. Evenness of mind is called yoga.",
    ref: "BG 2.48",
  },
  {
    v: "He who has no attachments can truly love others, for his love is pure and divine.",
    ref: "BG 12.13",
  },
  {
    v: "Change is the law of the universe. You can be a millionaire, or a pauper, in an instant.",
    ref: "BG 2.14",
  },
  {
    v: "Let a man lift himself by himself; let him not degrade himself. The self alone is the friend of the self.",
    ref: "BG 6.5",
  },
  {
    v: "There is neither this world nor the world beyond for one who doubts.",
    ref: "BG 4.40",
  },
  {
    v: "Whatever action a great man performs, common men follow.",
    ref: "BG 3.21",
  },
  {
    v: "Fear not what is not real, never was and never will be. What is real, always was and cannot be destroyed.",
    ref: "BG 2.16",
  },
  {
    v: "The soul is neither born, and nor does it ever die.",
    ref: "BG 2.20",
  },
  {
    v: "Man is made by his belief. As he believes, so he is.",
    ref: "BG 17.3",
  },
  {
    v: "The peace of God is with them whose mind and soul are in harmony.",
    ref: "BG 5.24",
  },
  {
    v: "Do everything you have to do, but not with ego, nor with lust, nor with envy — but with love, compassion, humility and devotion.",
    ref: "BG 3.30",
  },
  {
    v: "Calmness, gentleness, silence, self-restraint, and purity: these are the disciplines of the mind.",
    ref: "BG 17.16",
  },
];

/**
 * Verse of the day, by date. Same date + same offset → same verse, on the
 * server and in the browser, so the hero line never flickers on hydration.
 *
 * `offset` varies the verse between panels on one screen (the hero and the
 * daily-inspiration widget should not read identically), exactly as the
 * prototype's `_verse(offset)` did.
 */
export function verseOfDay(todayIso: string, offset: number = 0): Verse {
  // Days since the epoch, from the ISO string only — no timezone involved.
  const [y, m, d] = todayIso.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
  const i = (((dayNumber + offset) % GITA.length) + GITA.length) % GITA.length;
  return GITA[i];
}
