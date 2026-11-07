import { parseRoute } from './router';

function route(): void {
  const r = parseRoute(location.hash);
  if (r?.kind === 'book') import('./reader/open').then((m) => m.openBookRoute(r.id));
}

addEventListener('hashchange', route);
route();
