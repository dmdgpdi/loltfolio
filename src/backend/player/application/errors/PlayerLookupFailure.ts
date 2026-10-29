import type { PlayerLookupAuthenticationError } from "./PlayerLookupAuthenticationError";
import type { PlayerLookupConfigurationError } from "./PlayerLookupConfigurationError";
import type { PlayerLookupError } from "./PlayerLookupError";
import type { PlayerLookupRateLimitError } from "./PlayerLookupRateLimitError";
import type { PlayerLookupRequestError } from "./PlayerLookupRequestError";
import type { PlayerLookupResponseError } from "./PlayerLookupResponseError";
import type { PlayerLookupUnavailableError } from "./PlayerLookupUnavailableError";

export type PlayerLookupFailure =
  | PlayerLookupError
  | PlayerLookupAuthenticationError
  | PlayerLookupRateLimitError
  | PlayerLookupUnavailableError
  | PlayerLookupRequestError
  | PlayerLookupResponseError
  | PlayerLookupConfigurationError;
