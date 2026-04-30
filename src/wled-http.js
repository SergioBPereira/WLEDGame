function abortAfter(ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('timeout')), ms);
  return { signal: ctl.signal, cancel: () => clearTimeout(timer) };
}

async function tryFetch(url, opts, timeoutMs) {
  const { signal, cancel } = abortAfter(timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal });
    cancel();
    if (!res.ok) throw new Error(`http ${res.status} on ${url}`);
    return res;
  } catch (e) {
    cancel();
    if (e.name === 'AbortError' || /aborted/.test(String(e))) {
      throw new Error(`timeout after ${timeoutMs}ms: ${url}`);
    }
    throw e;
  }
}

export async function probeInfo({ host, httpPort = 80 }, timeoutMs = 1500) {
  const url = `http://${host}:${httpPort}/json/info`;
  const res = await tryFetch(url, {}, timeoutMs);
  const info = await res.json();
  return {
    name: info.name || `WLED-${host}`,
    ledCount: info.leds?.count ?? 60,
    version: info.ver || 'unknown',
    udpPort: info.udpport ?? 21324,
    raw: info,
  };
}

export async function getState({ host, httpPort = 80 }, timeoutMs = 1500) {
  const url = `http://${host}:${httpPort}/json/state`;
  const res = await tryFetch(url, {}, timeoutMs);
  return res.json();
}

export async function postState({ host, httpPort = 80 }, state, timeoutMs = 1500) {
  const url = `http://${host}:${httpPort}/json/state`;
  const res = await tryFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(state),
  }, timeoutMs);
  return res.json().catch(() => ({}));
}
