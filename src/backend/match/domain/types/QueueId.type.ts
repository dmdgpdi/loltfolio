import type { QueueId as QueueIdValues } from "../QueueId";

/** @description 현재 QueueId 상수에 등록된 지원 값의 유니온 타입. 외부 응답 전체를 무조건 허용하는 타입은 아니다. */
export type QueueId = (typeof QueueIdValues)[keyof typeof QueueIdValues];
