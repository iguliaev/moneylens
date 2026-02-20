/**
 * Retry an async operation with exponential backoff
 * @param operation - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Object with success status and optional error
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<{ success: boolean; data?: T; error?: Error }> {
  const delays = [100, 200, 400]; // Exponential backoff delays in ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;

      if (isLastAttempt) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }

  return { success: false, error: new Error("Max retries exceeded") };
}
