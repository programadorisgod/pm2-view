export function getZodErrorMessage(result: {
  success: boolean;
  error?: { issues?: Array<{ message: string }> };
}): string {
  if (result.success) return '';
  const firstError = result.error?.issues?.[0];
  return firstError?.message ?? 'Validation failed';
}
