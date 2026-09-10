import type { Dictionary } from "@/i18n/dictionaries/types";
import { isDemoApiErrorCode } from "@/types/api-errors";

export function mapDemoApiError(dictionary: Dictionary, error: unknown): string {
  if (typeof error === "string" && isDemoApiErrorCode(error)) {
    return dictionary.errors.api[error];
  }

  return dictionary.errors.api.generation_failed;
}
