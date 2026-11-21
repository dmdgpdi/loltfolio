import { HTTPError } from "ky";
import { PlayerLookupAuthenticationError } from "@/backend/player/application/errors/PlayerLookupAuthenticationError";
import { PlayerLookupError } from "@/backend/player/application/errors/PlayerLookupError";
import type { PlayerLookupFailure } from "@/backend/player/application/errors/PlayerLookupFailure";
import { PlayerLookupRateLimitError } from "@/backend/player/application/errors/PlayerLookupRateLimitError";
import { PlayerLookupRequestError } from "@/backend/player/application/errors/PlayerLookupRequestError";
import { PlayerLookupResponseError } from "@/backend/player/application/errors/PlayerLookupResponseError";
import { PlayerLookupUnavailableError } from "@/backend/player/application/errors/PlayerLookupUnavailableError";
import { PlayerNotFoundError } from "@/backend/player/application/errors/PlayerNotFoundError";

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
