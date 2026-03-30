let cachedCsrfToken = "";

export async function getCsrfToken({ force = false } = {}) {
  if (!force && cachedCsrfToken) return cachedCsrfToken;

  const res = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
  });

  if (!res.ok) {
    throw new Error("Failed to initialize security token");
  }

  const data = await res.json();
  cachedCsrfToken = String(data?.csrfToken || "");
  if (!cachedCsrfToken) {
    throw new Error("Missing security token");
  }

  return cachedCsrfToken;
}

export async function csrfFetch(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const headers = { ...(init.headers || {}) };
  const shouldAttach = !["GET", "HEAD", "OPTIONS"].includes(method);

  const doFetch = async (token) => {
    const nextHeaders = { ...headers };
    if (shouldAttach && token) nextHeaders["x-csrf-token"] = token;
    return fetch(input, {
      ...init,
      headers: nextHeaders,
      credentials: init.credentials || "same-origin",
    });
  };

  let token = shouldAttach ? await getCsrfToken() : "";
  let res = await doFetch(token);

  if (shouldAttach && res.status === 403) {
    let data = null;
    try {
      data = await res.clone().json();
    } catch {}
    if (data?.message === "Invalid CSRF token") {
      cachedCsrfToken = "";
      token = await getCsrfToken({ force: true });
      res = await doFetch(token);
    }
  }

  return res;
}
