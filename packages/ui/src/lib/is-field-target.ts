/**
 * Whether an event target is a form field or editable text. Keys and pastes
 * there belong to the field, so list shortcuts and file paste skip them.
 */
export function isFieldTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}
