import type { GameMode as GameModeValues } from "../GameMode";

/** @description 현재 GameMode 상수에 등록된 지원 값의 유니온 타입. 외부 응답 전체를 무조건 허용하는 타입은 아니다. */
export type GameMode = (typeof GameModeValues)[keyof typeof GameModeValues];
