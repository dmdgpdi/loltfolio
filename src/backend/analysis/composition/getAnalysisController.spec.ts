import { beforeEach, expect, it, vi } from "vitest";
import type { getDatabase as databaseFactory } from "../../db/client";

const { getDatabase } = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("../../db/client", () => ({ getDatabase }));

beforeEach(() => {
  vi.resetModules();
  getDatabase.mockReset();
});

/** @description DB 경계의 읽기 결과만 대체한다. 실제 Controller·Reader·Adapter·도메인 계산은 사용한다. */
function databaseWithSelection(rows: unknown[]) {
  const limit = vi.fn(async () => rows);
  const db = { select: () => ({ from: () => ({ where: () => ({ limit }) }) }) };
  getDatabase.mockReturnValue(
    db as unknown as ReturnType<typeof databaseFactory>,
  );
  return limit;
}

it("실제 GET 진입점의 잘못된 입력은 DB 초기화 전에 차단한다", async () => {
  // Arrange
  const { GET } = await import("../../../app/api/analysis/route");

  // Act
  const response = await GET(new Request("http://localhost/api/analysis"));

  // Assert
  expect(response.status).toBe(400);
  expect(getDatabase).not.toHaveBeenCalled();
});

it("조회 객체를 재사용하고 요청마다 저장 표본을 다시 읽어 DTO를 계산한다", async () => {
  // Arrange
  const reads = databaseWithSelection([
    { lastCompletedMatchIds: [], lastSucceededAt: new Date(0) },
  ]);
  const { GET } = await import("../../../app/api/analysis/route");
  const request = () =>
    new Request("http://localhost/api/analysis?puuid=player&queueId=420");

  // Act
  const first = await GET(request());
  const second = await GET(request());

  // Assert
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(await second.json()).toMatchObject({
    target: { puuid: "player", queueId: 420 },
    analyzedMatchIds: [],
    vision: { matchCount: 0 },
  });
  expect(getDatabase).toHaveBeenCalledTimes(1);
  expect(reads).toHaveBeenCalledTimes(2);
});

it("실제 저장 표본 부재도 수집·저장 없이 404로 반환한다", async () => {
  // Arrange
  databaseWithSelection([]);
  const { GET } = await import("../../../app/api/analysis/route");

  // Act
  const response = await GET(
    new Request("http://localhost/api/analysis?puuid=player&queueId=440"),
  );

  // Assert
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    error: { code: "ANALYSIS_NOT_FOUND" },
  });
});

it("DB 조회 예외를 저장소·Application 경계를 거쳐 503으로 반환한다", async () => {
  // Arrange
  const reads = databaseWithSelection([]);
  reads.mockRejectedValue(new Error("secret SQL detail"));
  const { GET } = await import("../../../app/api/analysis/route");

  // Act
  const response = await GET(
    new Request("http://localhost/api/analysis?puuid=player&queueId=420"),
  );

  // Assert
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: { code: "ANALYSIS_READ_FAILED" },
  });
});

it("설정 초기화 실패는 HTTP 밖으로 예외를 던지지 않는다", async () => {
  // Arrange
  getDatabase.mockImplementation(() => {
    throw new Error("secret configuration");
  });
  const { GET } = await import("../../../app/api/analysis/route");

  // Act
  const response = await GET(
    new Request("http://localhost/api/analysis?puuid=player&queueId=420"),
  );

  // Assert
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({
    error: { code: "INTERNAL_ERROR" },
  });
});
