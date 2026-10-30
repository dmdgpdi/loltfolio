import { Result } from "@praha/byethrow";
import { expect, it, vi } from "vitest";
import { MatchCollectionError } from "../../application/errors/MatchCollectionError";
import { createRiotMatchResponse as matchResponse } from "../../testing/createRiotMatchResponse";
import { createRiotTimelineResponse as timelineResponse } from "../../testing/createRiotTimelineResponse";
import { RiotMatchAdapter } from "./RiotMatchAdapter";

it("큐·시작 위치·개수를 전달하고 API 키는 헤더로 보낸다", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(["KR_1"]));
  const adapter = new RiotMatchAdapter({
    apiKey: "test-key",
    region: "ASIA",
    fetch: request,
  });
  expect(await adapter.findRecentMatchIds("target/id", 420, 20, 40)).toEqual(
    Result.succeed(["KR_1"]),
  );
  const sent = request.mock.calls[0][0] as Request;
  expect(sent.url).toBe(
    "https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/target%2Fid/ids?queue=420&start=40&count=20",
  );
  expect(sent.headers.get("X-Riot-Token")).toBe("test-key");
});

it("경기 상세와 Timeline을 연결한다", async () => {
  const request: typeof fetch = async (input) =>
    Response.json(
      (input as Request).url.endsWith("/timeline")
        ? timelineResponse()
        : matchResponse(),
    );
  const adapter = new RiotMatchAdapter({
    apiKey: "test-key",
    region: "ASIA",
    fetch: request,
  });
  const match = Result.unwrap(await adapter.findPlayerMatch("KR_1", "target"));
  expect(match.stats.combat.kills).toEqual({ status: "AVAILABLE", value: 3 });
  expect(match.laningSnapshots).toHaveLength(2);
});

it("429는 자동 재시도 없이 재시도 가능 시각을 전달한다", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
    );
  const adapter = new RiotMatchAdapter({
    apiKey: "test-key",
    region: "ASIA",
    fetch: request,
  });
  const before = Date.now();
  const result = await adapter.findRecentMatchIds("target", 420, 20);
  expect(result).toEqual(Result.fail(expect.any(MatchCollectionError)));
  expect(result).toMatchObject({
    error: { status: 429, reason: "HTTP", retryAvailableAt: expect.any(Date) },
  });
  expect(
    Result.unwrapError(result).retryAvailableAt?.getTime(),
  ).toBeGreaterThanOrEqual(before + 120_000);
  expect(request).toHaveBeenCalledOnce();
});

it("잘못된 목록 응답은 조회 실패로 변환한다", async () => {
  const adapter = new RiotMatchAdapter({
    apiKey: "test-key",
    region: "ASIA",
    fetch: async () => Response.json([123]),
  });
  expect(await adapter.findRecentMatchIds("target", 420, 20)).toEqual(
    Result.fail(expect.any(MatchCollectionError)),
  );
});
