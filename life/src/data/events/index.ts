import type { GameEvent } from "../../game/events";
import { ADULT } from "./adult";
import { CAREER } from "./career";
import { CHILDHOOD } from "./childhood";
import { EDU } from "./edu";
import { LOVE } from "./love";
import { SCHOOL } from "./school";
import { SENIOR } from "./senior";
import { YOUTH } from "./youth";

/** 인생의 큰 사건(milestone)은 이 순서대로 한 해 안에서 일어난다 */
export const EVENTS: GameEvent[] = [...CHILDHOOD, ...SCHOOL, ...EDU, ...YOUTH, ...CAREER, ...LOVE, ...ADULT, ...SENIOR];

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export function eventById(id: string): GameEvent | undefined {
  return BY_ID.get(id);
}
