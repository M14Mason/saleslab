import { memo, useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";
import type { Persona } from "../../shared/scenarios";

// Illustrated buyer faces (Avataaars by Pablo Stanley, free for commercial use; DiceBear, MIT).
// The face always matches the buyer's gender and voice, and changes expression with the call.

export type Mood = "neutral" | "talking" | "thinking" | "happy" | "upset" | "listening";

const FEMALE_TOPS = ["bob", "bun", "curly", "curvy", "longButNotTooLong", "miaWallace", "straight01", "straight02", "straightAndStrand", "bigHair", "froBand"];
const MALE_TOPS = ["shortFlat", "shortRound", "shortWaved", "shortCurly", "theCaesar", "theCaesarAndSidePart", "sides", "frizzle", "shaggy", "dreads01"];
const SKINS = ["614335", "d08b5b", "ae5d29", "edb98a", "ffdbb4"];
const HAIR = ["2c1b18", "4a312c", "724133", "a55728", "b58143", "d6b370"];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T,>(arr: T[], n: number) => arr[n % arr.length];

const EXPRESSION: Record<Mood, { mouth: string; eyes: string; eyebrows: string }> = {
  neutral: { mouth: "default", eyes: "default", eyebrows: "defaultNatural" },
  listening: { mouth: "serious", eyes: "default", eyebrows: "defaultNatural" },
  talking: { mouth: "twinkle", eyes: "default", eyebrows: "raisedExcitedNatural" },
  thinking: { mouth: "serious", eyes: "side", eyebrows: "upDownNatural" },
  happy: { mouth: "smile", eyes: "happy", eyebrows: "raisedExcitedNatural" },
  upset: { mouth: "concerned", eyes: "default", eyebrows: "sadConcernedNatural" },
};

export function faceUri(p: Pick<Persona, "name" | "gender" | "look">, mood: Mood = "neutral"): string {
  const h = hash(p.name);
  const look = p.look ?? {};
  const female = p.gender === "female";
  const top = look.top ?? pick(female ? FEMALE_TOPS : MALE_TOPS, h);
  const hair = look.hairColor ?? (look.age === "senior" ? "e8e1e1" : pick(HAIR, h >> 3));
  const facial = look.facialHair === undefined ? (!female && h % 3 === 0 ? "beardLight" : null) : look.facialHair;
  const e = EXPRESSION[mood];
  return createAvatar(avataaars, {
    seed: p.name,
    top: [top as never],
    hairColor: [hair],
    facialHairColor: [hair],
    facialHair: facial ? [facial as never] : undefined,
    facialHairProbability: facial ? 100 : 0,
    skinColor: [look.skin ?? pick(SKINS, h >> 5)],
    clothing: [(look.clothing ?? (female ? "blazerAndShirt" : "collarAndSweater")) as never],
    clothesColor: [pick(["25557c", "3c4f5c", "262e33", "5199e4", "929598"], h >> 7)],
    accessories: look.accessories ? [look.accessories as never] : undefined,
    accessoriesProbability: look.accessories ? 100 : 0,
    mouth: [e.mouth as never],
    eyes: [e.eyes as never],
    eyebrows: [e.eyebrows as never],
    style: ["circle"],
    backgroundColor: ["transparent"],
  }).toDataUri();
}

/** The buyer's face. `level` (0-1) gently bobs the face while they talk. */
export const Face = memo(function Face({ persona, mood = "neutral", size = 96, level = 0, className = "" }: {
  persona: Pick<Persona, "name" | "gender" | "look">; mood?: Mood; size?: number; level?: number; className?: string;
}) {
  const uri = useMemo(() => faceUri(persona, mood), [persona, mood]);
  return (
    <img
      src={uri}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={`select-none ${className}`}
      style={{ transform: `translateY(${-level * 4}px) scale(${1 + level * 0.04})`, transition: "transform 80ms linear" }}
    />
  );
});

export default Face;
