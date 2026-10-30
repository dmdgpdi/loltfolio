import { z } from "zod";
import type { Stat } from "../domain/types/Stat.type";

/** @description 원본 누락·빈 문자열은 NOT_PROVIDED, 자료형은 맞지만 지원 목록 밖인 분류는 UNKNOWN으로 구분한다. */
export function classifiedStatSchema<T extends string | number>(
  values: readonly T[],
) {
  return z
    .unknown()
    .optional()
    .transform((input, context): Stat<T> => {
      if (
        input === null ||
        input === undefined ||
        (typeof input === "string" && input.trim() === "")
      )
        return { status: "NOT_PROVIDED" };
      if (typeof input !== typeof values[0]) {
        context.addIssue({
          code: "custom",
          message: "분류 값의 자료형이 올바르지 않습니다.",
        });
        return z.NEVER;
      }
      if (
        typeof input === "number" &&
        (!Number.isFinite(input) || !Number.isInteger(input))
      ) {
        context.addIssue({
          code: "custom",
          message: "숫자 분류는 유한한 정수여야 합니다.",
        });
        return z.NEVER;
      }
      const value = values.find((candidate) => candidate === input);
      return value === undefined
        ? { status: "UNKNOWN" }
        : { status: "AVAILABLE", value };
    });
}
