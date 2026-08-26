/**
 * NORMALIZADOR DE LINKS DE TRANSMISIÓN.
 *
 * El problema reportado: pegar un link normal de YouTube
 * (youtube.com/watch?v=XXX) NO funciona en un iframe — YouTube bloquea
 * esa URL con X-Frame-Options. NO se necesita la API de YouTube: basta
 * convertir al formato /embed/. Lo mismo aplica a Twitch y Kick, que
 * tienen sus propios players embebibles.
 *
 * Soporta:
 *  YouTube: watch?v=ID · youtu.be/ID · /live/ID · /shorts/ID · /embed/ID
 *  Twitch:  twitch.tv/CANAL → player.twitch.tv/?channel=CANAL
 *           (el cliente agrega &parent=<dominio>, requisito de Twitch)
 *  Kick:    kick.com/CANAL → player.kick.com/CANAL
 */
export function normalizeStreamUrl(raw: string): {
  ok: boolean;
  url: string;
  platform: 'youtube' | 'twitch' | 'kick' | 'otro' | 'invalido';
} {
  const input = (raw ?? '').trim();
  if (!input) return { ok: true, url: '', platform: 'otro' };

  let u: URL;
  try {
    u = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    return { ok: false, url: input, platform: 'invalido' };
  }
  const host = u.hostname.replace(/^www\./, '');

  // ── YouTube ──────────────────────────────────────────────────────
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    let videoId = '';
    if (host === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0];
    else if (u.pathname === '/watch') videoId = u.searchParams.get('v') ?? '';
    else {
      const m = u.pathname.match(/^\/(embed|live|shorts)\/([\w-]{6,})/);
      if (m) videoId = m[2];
    }
    if (!videoId) return { ok: false, url: input, platform: 'youtube' };
    return { ok: true, url: `https://www.youtube.com/embed/${videoId}`, platform: 'youtube' };
  }

  // ── Twitch ───────────────────────────────────────────────────────
  if (host === 'twitch.tv') {
    const channel = u.pathname.slice(1).split('/')[0];
    if (!channel) return { ok: false, url: input, platform: 'twitch' };
    // parent lo agrega el cliente (Twitch exige el dominio que embebe)
    return { ok: true, url: `https://player.twitch.tv/?channel=${channel}`, platform: 'twitch' };
  }
  if (host === 'player.twitch.tv') return { ok: true, url: input, platform: 'twitch' };

  // ── Kick ─────────────────────────────────────────────────────────
  if (host === 'kick.com') {
    const channel = u.pathname.slice(1).split('/')[0];
    if (!channel) return { ok: false, url: input, platform: 'kick' };
    return { ok: true, url: `https://player.kick.com/${channel}`, platform: 'kick' };
  }
  if (host === 'player.kick.com') return { ok: true, url: input, platform: 'kick' };

  // Facebook Live u otros: se guarda tal cual (el embed depende del origen)
  return { ok: true, url: input, platform: 'otro' };
}
