import { z } from "zod";
import { toProvidedStat } from "../domain/toProvidedStat";

/** @description 저장된 상태 객체와 과거 원시값을 함께 검증한다. 과거 null·누락·빈 문자열은 미제공으로 복원한다. */
export function storedStatSchema<T extends z.ZodType>(value: T) {
  return z.preprocess(
    (input) => {
      if (
        input === null ||
        input === undefined ||
        (typeof input === "string" && input.trim() === "")
      )
        return { status: "NOT_PROVIDED" };
      return typeof input === "object" && "status" in input
        ? input
        : toProvidedStat(input);
    },
    z.discriminatedUnion("status", [
      z.object({ status: z.literal("AVAILABLE"), value }),
      z.object({ status: z.literal("NOT_PROVIDED") }),
      z.object({ status: z.literal("UNKNOWN") }),
    ]),
  );
}
