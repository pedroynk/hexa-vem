type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function getSupabaseErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as SupabaseLikeError;
    return message ?? 'Erro no Supabase.';
  }

  return error instanceof Error ? error.message : 'Erro inesperado.';
}

export function isMissingRelationError(error: unknown): boolean {
  const supabaseError = error as SupabaseLikeError;
  const text = [supabaseError.code, supabaseError.message, supabaseError.details, supabaseError.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes('pgrst205') || text.includes('could not find') || text.includes('does not exist');
}

export function isForbiddenError(error: unknown): boolean {
  const supabaseError = error as SupabaseLikeError;
  const text = [supabaseError.code, supabaseError.message, supabaseError.details, supabaseError.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes('42501') || text.includes('permission denied') || text.includes('forbidden');
}
