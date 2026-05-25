export const toError = (
  error: unknown,
  fallbackMessage: string
): Error | null => {
  if (!error) return null;
  if (error instanceof Error) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return new Error((error as { message: string }).message);
  }
  return new Error(fallbackMessage);
};
