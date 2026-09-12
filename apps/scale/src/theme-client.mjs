export async function saveScaleTheme(document, { slug, revision = null } = {}) {
  const response = await fetch(`/__muxui/scale/themes/${slug}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(revision ? { 'if-match': revision } : {}) },
    body: `${JSON.stringify(document)}\n`,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(response.status === 412 ? 'This theme exists or has changed. Load it before saving.' : body.error ?? 'Theme save failed');
  return { revision: body.revision };
}

export async function loadScaleTheme(slug) {
  const response = await fetch(`/__muxui/scale/themes/${slug}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Theme load failed');
  return { theme: body.theme, revision: body.revision };
}
