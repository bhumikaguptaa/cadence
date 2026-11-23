/** Join class names, skipping falsy values. Tiny stand-in for a classnames dependency. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}
