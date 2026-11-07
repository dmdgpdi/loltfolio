import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { CalculatedAnalysisReader } from "../application/CalculatedAnalysisReader";
import { AnalysisCalculationError } from "../application/errors/AnalysisCalculationError";
import { AnalysisReadError } from "../application/errors/AnalysisReadError";
import { AnalysisController } from "./AnalysisController";

it("일반 DTO를 200으로 반환하고 Query 입력만 전달한다", async () => {
  // Arrange
  const calls: unknown[] = [];
  const query = new CalculatedAnalysisReader({
    findLatest: async (target) => {
      calls.push(target);
      return Result.succeed({ selectedMatchIds: [], matches: [] });
    },
  });
  const controller = new AnalysisController(query);
  const request = new Request(
    "http://localhost/api/analysis?puuid=player&queueId=420",
  );

  // Act
  const response = await controller.get(request);
  const dto = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(calls).toEqual([{ puuid: "player", queueId: 420 }]);
  expect(dto.target).toEqual({ puuid: "player", queueId: 420 });
  expect(dto.position.matchCount).toBe(0);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it.each([
  "",
  "?puuid=player",
  "?queueId=420",
  "?puuid=%20&queueId=420",
  "?puuid=%20player&queueId=420",
  "?puuid=player&queueId=999",
  "?puuid=player&queueId=4.2e2",
  "?puuid=player&queueId=0420",
  "?puuid=a&puuid=b&queueId=420",
  "?puuid=player&queueId=420&queueId=440",
])("잘못된 인자 %s는 Query를 호출하지 않고 400을 반환한다", async (search) => {
  // Arrange
  let calls = 0;
  const controller = new AnalysisController({
    findLatest: async () => {
      calls += 1;
      return Result.succeed(null);
    },
  });

  // Act
  const response = await controller.get(
    new Request(`http://localhost/api/analysis${search}`),
  );

  // Assert
  expect(response.status).toBe(400);
  expect(calls).toBe(0);
  expect(await response.json()).toMatchObject({
    error: { code: "INVALID_ANALYSIS_QUERY" },
  });
});

it("완료 표본이 없으면 자동 생성 없이 404를 반환한다", async () => {
  // Arrange
  const controller = new AnalysisController({
    findLatest: async () => Result.succeed(null),
  });

  // Act
  const response = await controller.get(
    new Request("http://localhost/api/analysis?puuid=player&queueId=450"),
  );

  // Assert
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    error: { code: "ANALYSIS_NOT_FOUND" },
  });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it.each([
  {
    error: new AnalysisReadError({
      cause: new Error("secret database detail"),
    }),
    status: 503,
    code: "ANALYSIS_READ_FAILED",
  },
  {
    error: new AnalysisCalculationError({
      cause: new Error("secret observation"),
    }),
    status: 500,
    code: "ANALYSIS_CALCULATION_FAILED",
  },
])("$code 오류를 내부 원인 노출 없이 반환한다", async ({
  error,
  status,
  code,
}) => {
  // Arrange
  const controller = new AnalysisController({
    findLatest: async () => Result.fail(error),
  });

  // Act
  const response = await controller.get(
    new Request("http://localhost/api/analysis?puuid=player&queueId=440"),
  );
  const body = await response.text();

  // Assert
  expect(response.status).toBe(status);
  expect(JSON.parse(body)).toMatchObject({ error: { code } });
  expect(body).not.toContain("secret");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("예상하지 못한 초기화·실행 예외도 내부 상세 없이 500을 반환한다", async () => {
  // Arrange
  const controller = new AnalysisController({
    findLatest: async () => {
      throw new Error("secret configuration");
    },
  });

  // Act
  const response = await controller.get(
    new Request("http://localhost/api/analysis?puuid=player&queueId=420"),
  );

  // Assert
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({
    error: { code: "INTERNAL_ERROR" },
  });
});
