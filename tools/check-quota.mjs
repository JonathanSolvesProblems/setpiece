/**
 * What is left of the two paid services the live site leans on, so they do not run dry while the entry is being
 * judged: the voice's monthly characters at ElevenLabs, and that the set designer still answers on the live site.
 * Prints numbers only, never a key.
 *
 *   node tools/check-quota.mjs
 */
try {
  process.loadEnvFile('.env.local');
} catch {
  // The keys may be in the shell instead.
}
const SITE = 'https://setpiece.jonathansolvesproblems.com';
let bad = 0;
const say = (ok, line) => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'LOOK'} ${line}`);
};

// The voice: characters used and allowed this period, and when the period turns over.
const voiceKey = process.env.ELEVENLABS_API_KEY;
if (!voiceKey) {
  say(false, 'no ELEVENLABS_API_KEY here: the voice quota was not read');
} else {
  const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': voiceKey } });
  if (!response.ok) {
    say(false, `ElevenLabs answered ${response.status} to the subscription question`);
  } else {
    const plan = await response.json();
    const used = plan.character_count ?? 0;
    const limit = plan.character_limit ?? 0;
    const left = limit - used;
    const resets = plan.next_character_count_reset_unix ? new Date(plan.next_character_count_reset_unix * 1000).toISOString().slice(0, 10) : 'unknown';
    // A reply read aloud is about 110 characters; a visit that builds, looks twice and covers a scene reads about 12.
    const visits = Math.floor(left / (110 * 12));
    say(left > limit * 0.25, `voice: ${used} of ${limit} characters used on the ${plan.tier} plan, ${left} left, about ${visits} more visits with the voice on; the count starts again on ${resets}`);
  }
}

// The designer: one small request through the live site, as a visitor makes it.
{
  const started = Date.now();
  const response = await fetch(`${SITE}/api/director`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE },
    body: JSON.stringify({ said: 'hello', set: '', heard: [] }),
  });
  const text = await response.text();
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  const error = lines.map((line) => { try { return JSON.parse(line); } catch { return {}; } }).find((event) => event.t === 'error');
  say(response.ok && error == null && lines.length > 0, `designer: ${response.status} in ${((Date.now() - started) / 1000).toFixed(1)} s${error ? `, saying "${error.m}"` : ''}`);
}
process.exit(bad === 0 ? 0 : 1);
