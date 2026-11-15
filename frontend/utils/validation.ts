// Letters in any script, combining marks (so decomposed forms like "e" + accent
// pass), spaces, hyphens, and straight or typographic apostrophes.
const NAME_PATTERN = /^[\p{L}\p{M}' \u2019-]+$/u;
const HAS_LETTER = /\p{L}/u;

export const MIN_NAME_LENGTH = 2;

/** True for names like Zoë, O'Brien, José and Nguyễn; false for digits and symbols. */
export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return NAME_PATTERN.test(trimmed) && HAS_LETTER.test(trimmed);
}

/** The message to show for a first or last name, or null when it is acceptable. */
export function nameError(name: string): string | null {
  const trimmed = name.trim();
  // Counted in characters as a reader sees them, not UTF-16 units.
  if (Array.from(trimmed).length < MIN_NAME_LENGTH) {
    return 'First name and last name must be at least 2 characters long.';
  }
  if (!isValidName(trimmed)) {
    return 'Names can only contain letters, spaces, apostrophes, or hyphens.';
  }
  return null;
}
