import { Result } from "@praha/byethrow";
import { expect, it, vi } from "vitest";
import { PlayerLookupAuthenticationError } from "../../application/errors/PlayerLookupAuthenticationError";
import { PlayerLookupConfigurationError } from "../../application/errors/PlayerLookupConfigurationError";
import { PlayerLookupRateLimitError } from "../../application/errors/PlayerLookupRateLimitError";
import { PlayerLookupRequestError } from "../../application/errors/PlayerLookupRequestError";
import { PlayerLookupResponseError } from "../../application/errors/PlayerLookupResponseError";
import { PlayerLookupUnavailableError } from "../../application/errors/PlayerLookupUnavailableError";
import { PlayerNotFoundError } from "../../application/errors/PlayerNotFoundError";
import { PlayerLookupService } from "../../application/PlayerLookupService";
import { RiotId } from "../../domain/RiotId.VO";
import { RiotAccountAdapter } from "./RiotAccountAdapter";

const riotId = Result.unwrap(RiotId.create("플레이어 / 이름", "KR1"));

function createAdapter(
  request: typeof fetch,
  options: { apiKey?: string; region?: string } = {},
) {
  return new RiotAccountAdapter({
    apiKey: "test-key",
    region: "ASIA",
    ...options,
    fetch: request,
  });
}

it.each([
  "ASIA",
  "AMERICAS",
  "EUROPE",
])("%s 호스트에서 계정을 조회하고 Player로 변환한다", async (region) => {
  // Arrange
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      puuid: "test-puuid",
      gameName: "응답 이름",
      tagLine: "KR2",
    }),
  );
  const adapter = createAdapter(request, { region });

  // Act
  const result = await adapter.findByRiotId(riotId);

  const player = Result.unwrap(result);

  // Assert
  expect(player).toMatchObject({
    puuid: "test-puuid",
    riotId: { name: "응답 이름", tagLine: "KR2" },
  });
  expect(request).toHaveBeenCalledOnce();
  const sentRequest = request.mock.calls[0][0] as Request;

  // Assert
  expect(sentRequest.url).toBe(
    `https://${region.toLowerCase()}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(riotId.name)}/KR1`,
  );
  expect(sentRequest.method).toBe("GET");
  expect(sentRequest.headers.get("X-Riot-Token")).toBe("test-key");
  expect(sentRequest.cache).toBe("no-store");
});

it("응답에서 이름과 태그가 생략되면 검색에 사용한 Riot ID를 유지한다", async () => {
  // Arrange
  const adapter = createAdapter(async () =>
    Response.json({ puuid: "test-puuid" }),
  );

  const player = Result.unwrap(await adapter.findByRiotId(riotId));

  // Act
  const isEqual = player?.riotId.equals(riotId);

  // Assert
  expect(isEqual).toBe(true);
});

it("404는 미발견 결과로 반환한다", async () => {
  // Arrange
  const adapter = createAdapter(
    async () => new Response(null, { status: 404 }),
  );

  // Act
  const lookupResult = await adapter.findByRiotId(riotId);

  // Assert
  expect(lookupResult).toEqual(Result.succeed(null));
});

it.each([
  [400, PlayerLookupRequestError],
  [401, PlayerLookupAuthenticationError],
  [403, PlayerLookupAuthenticationError],
  [405, PlayerLookupRequestError],
  [415, PlayerLookupRequestError],
  [429, PlayerLookupRateLimitError],
  [500, PlayerLookupUnavailableError],
  [502, PlayerLookupUnavailableError],
  [503, PlayerLookupUnavailableError],
  [504, PlayerLookupUnavailableError],
])("HTTP %i는 조회 실패로 반환한다", async (status, ErrorClass) => {
  // Arrange
  const adapter = createAdapter(async () => new Response(null, { status }));

  // Act
  const lookupResult = await adapter.findByRiotId(riotId);

  // Assert
  expect(lookupResult).toEqual(Result.fail(expect.any(ErrorClass)));
});

it.each([
  null,
  [],
  {},
  { puuid: " " },
  { puuid: "id", gameName: 123 },
  { puuid: "" },
  { puuid: 123 },
  { puuid: "id", gameName: "" },
  { puuid: "id", tagLine: null },
])("잘못된 계정 응답(%j)은 실패로 반환한다", async (body) => {
  // Arrange
  const adapter = createAdapter(async () => Response.json(body));

  // Act
  const lookupResult = await adapter.findByRiotId(riotId);

  // Assert
  expect(lookupResult).toEqual(
    Result.fail(expect.any(PlayerLookupResponseError)),
  );
});

it("네트워크 오류를 원인으로 보존한다", async () => {
  // Arrange
  const cause = new Error("network failure");
  const adapter = createAdapter(async () => {
    throw cause;
  });

  // Act
  const lookupResult = await adapter.findByRiotId(riotId);

  // Assert
  expect(lookupResult).toMatchObject({
    error: { cause },
  });
});

it.each([
  { apiKey: "", region: "ASIA" },
  { apiKey: "test-key", region: "INVALID" },
])("잘못된 설정이면 외부 호출 없이 실패한다", async (options) => {
  // Arrange
  const request = vi.fn<typeof fetch>();
  const adapter = createAdapter(request, options);

  // Act
  const lookupResult = await adapter.findByRiotId(riotId);

  // Assert
  expect(lookupResult).toEqual(
    Result.fail(expect.any(PlayerLookupConfigurationError)),
  );
  expect(request).not.toHaveBeenCalled();
});

it.each([
  [401, PlayerLookupAuthenticationError],
  [404, PlayerNotFoundError],
  [429, PlayerLookupRateLimitError],
  [503, PlayerLookupUnavailableError],
])("HTTP %i 오류가 Adapter에서 LookupService까지 전달된다", async (status, ErrorClass) => {
  // Arrange
  const adapter = createAdapter(async () => new Response(null, { status }));
  const service = new PlayerLookupService(adapter);

  // Act
  const result = await service.findByRiotId(riotId);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(ErrorClass)));
});

it("JSON 파싱 실패도 응답 오류로 반환한다", async () => {
  // Arrange
  const adapter = createAdapter(
    async () => new Response("invalid json", { status: 200 }),
  );

  // Act
  const lookupResult = await adapter.findByRiotId(riotId);

  // Assert
  expect(lookupResult).toEqual(
    Result.fail(expect.any(PlayerLookupResponseError)),
  );
});

it.each([429, 503])("HTTP %i 응답을 자동 재시도하지 않는다", async (status) => {
  // Arrange
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(null, { status }));
  const adapter = createAdapter(request);

  // Act
  await adapter.findByRiotId(riotId);

  // Assert
  expect(request).toHaveBeenCalledOnce();
});

it("요청 제한의 Retry-After가 LookupService까지 전달된다", async () => {
  // Arrange
  const adapter = createAdapter(
    async () =>
      new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
  );
  const service = new PlayerLookupService(adapter);

  // Act
  const result = await service.findByRiotId(riotId);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(PlayerLookupRateLimitError)));
  expect(result).toMatchObject({ error: { retryAfter: "120" } });
});
