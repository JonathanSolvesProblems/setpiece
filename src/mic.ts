/**
 * Whether this page may use the microphone: 'granted', 'denied', 'prompt' (not asked yet) or 'unknown' (the browser
 * will not say). A Quest cannot show the microphone's question in the middle of an immersive session (a Quest 3S,
 * Nov 15: Talk did nothing at all), so the page asks it before the session starts and Talk says so if it never was.
 */
export async function micAnswer(): Promise<string> {
  try {
    return (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state;
  } catch {
    return 'unknown';
  }
}
