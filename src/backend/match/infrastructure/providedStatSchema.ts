import { z } from "zod";
import { toProvidedStat } from "../domain/toProvidedStat";

/** @description 원본 누락·null·빈 문자열은 미제공으로 바꾸고, 자료형이 잘못된 값은 오류로 남긴다. */
export function providedStatSchema<T extends z.ZodType>(value: T) {
  return z.preprocess(
    (input) =>
      input === null ||
      input === undefined ||
      (typeof input === "string" && input.trim() === "")
        ? undefined
        : input,
    value.optional().transform((input) => toProvidedStat(input)),
  );
}
