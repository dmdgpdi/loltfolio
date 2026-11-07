import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MatchRepositoryError } from "../../../match/domain/errors/MatchRepositoryError";
import { PlayerMatch } from "../../../match/domain/PlayerMatch";
import { createPlayerMatchData } from "../../../match/testing/createPlayerMatchData";
import { AnalysisReadError } from "../../application/errors/AnalysisReadError";
import { StoredAnalysisInputReader } from "./StoredAnalysisInputReader";

it("공개 match Reader만 호출해 순서와 상태를 유지한 입력을 반환한다", async () => {
  // Arrange
  const calls: unknown[] = [];
  const reader = new StoredAnalysisInputReader({
    findLatest: async (...target) => {
      calls.push(target);
      return Result.succeed({
        selectedMatchIds: ["failed", "KR_1"],
        matches: [new PlayerMatch(createPlayerMatchData())],
      });
    },
  });

  // Act
  const result = await reader.findLatest({ puuid: "player", queueId: 420 });

  if (Result.isFailure(result) || result.value === null) {
    throw new Error("입력 집합을 반환해야 합니다.");
  }

  // Assert
  expect(calls).toEqual([["player", 420]]);
  expect(result.value.selectedMatchIds).toEqual(["failed", "KR_1"]);
  expect(result.value.matches[0].matchId).toBe("KR_1");
  expect(result.value.matches[0].vision.wardsPlaced).toEqual({
    status: "NOT_PROVIDED",
  });
  expect(Object.isFrozen(result.value.matches)).toBe(true);
});

it("null과 빈 완료를 구분한다", async () => {
  // Arrange
  const absent = new StoredAnalysisInputReader({
    findLatest: async () => Result.succeed(null),
  });
  const empty = new StoredAnalysisInputReader({
    findLatest: async () =>
      Result.succeed({ selectedMatchIds: [], matches: [] }),
  });
  const target = { puuid: "player", queueId: 420 } as const;

  // Act
  const noSelection = await absent.findLatest(target);
  const emptySelection = await empty.findLatest(target);

  // Assert
  expect(noSelection).toEqual(Result.succeed(null));
  expect(emptySelection).toEqual(
    Result.succeed({ selectedMatchIds: [], matches: [] }),
  );
});

it("원천 조회 실패를 원인과 함께 전달한다", async () => {
  // Arrange
  const error = new MatchRepositoryError();
  const reader = new StoredAnalysisInputReader({
    findLatest: async () => Result.fail(error),
  });

  // Act
  const result = await reader.findLatest({ puuid: "player", queueId: 420 });

  // Assert
  expect(result).toEqual(Result.fail(expect.any(AnalysisReadError)));

  if (Result.isFailure(result)) {
    expect(result.error.cause).toBe(error);
  }
});
