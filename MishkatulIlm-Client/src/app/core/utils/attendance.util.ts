export type LessonAttendanceStatus = 'attending' | 'not_attending';

/** Parse API attendance values (camelCase, PascalCase, or stored codes). */
export function parseLessonAttendanceStatus(
  value: string | null | undefined,
): LessonAttendanceStatus {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (key === 'not_attending' || key === 'notattending' || key === 'absent') {
    return 'not_attending';
  }
  return 'attending';
}
