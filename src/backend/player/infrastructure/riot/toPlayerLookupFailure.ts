import { HTTPError } from "ky";
import { PlayerLookupAuthenticationError } from "../../application/errors/PlayerLookupAuthenticationError";
import { PlayerLookupError } from "../../application/errors/PlayerLookupError";
import type { PlayerLookupFailure } from "../../application/errors/PlayerLookupFailure";
import { PlayerLookupRateLimitError } from "../../application/errors/PlayerLookupRateLimitError";
import { PlayerLookupRequestError } from "../../application/errors/PlayerLookupRequestError";
import { PlayerLookupResponseError } from "../../application/errors/PlayerLookupResponseError";
import { PlayerLookupUnavailableError } from "../../application/errors/PlayerLookupUnavailableError";
import { PlayerNotFoundError } from "../../application/errors/PlayerNotFoundError";

export function toPlayerLookupFailure(
  cause: unknown,
): PlayerLookupFailure | PlayerNotFoundError {
  if (cause instanceof SyntaxError) {
    return new PlayerLookupResponseError({ cause });
  }

  if (!(cause instanceof HTTPError)) {
    return new PlayerLookupError({ cause });
  }

  const { status, headers } = cause.response;

  if (status === 404) {
    return new PlayerNotFoundError({ cause });
  }

  if (status === 401 || status === 403) {
    return new PlayerLookupAuthenticationError({ status, cause });
  }

  if (status === 429) {
    return new PlayerLookupRateLimitError({
      retryAfter: headers.get("Retry-After"),
      cause,
    });
  }

  if (status >= 500) {
    return new PlayerLookupUnavailableError({ status, cause });
  }

  return new PlayerLookupRequestError({ status, cause });
}
