import { HTTPError, TimeoutError } from "ky";
import { MatchCollectionError } from "../../application/errors/MatchCollectionError";

export function toMatchCollectionError(cause: unknown): MatchCollectionError {
  if (cause instanceof TimeoutError)
    return new MatchCollectionError({ cause, reason: "TIMEOUT" });
  if (cause instanceof SyntaxError)
    return new MatchCollectionError({ cause, reason: "INVALID_RESPONSE" });
  if (!(cause instanceof HTTPError))
    return new MatchCollectionError({ cause, reason: "REQUEST_FAILED" });
  const retry =
    cause.response.status === 429
      ? cause.response.headers.get("Retry-After")
      : null;
  const retryTime =
    retry === null
      ? NaN
      : /^\d+(\.\d+)?$/.test(retry)
        ? Date.now() + Number(retry) * 1000
        : Date.parse(retry);
  return new MatchCollectionError({
    cause,
    reason: "HTTP",
    status: cause.response.status,
    retryAvailableAt: Number.isFinite(retryTime)
      ? new Date(retryTime)
      : undefined,
  });
}
