"""Serves the built client app (Expo web export of apps/client) as a single-page app.

Any GET that is not the API, the panel or a static file gets index.html, and the app's router
takes over: /, /tg, /cart, /orders/<id> and so on.
"""

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

from app.core.config import settings

router = APIRouter(include_in_schema=False)

RESERVED_PREFIXES = ("api/", "admin", "static/", "health", "docs", "openapi.json", "legal", "auth/")

NOT_BUILT = """<!doctype html><html lang="ru"><meta charset="utf-8"><title>Брайт</title>
<body style="font-family:system-ui;padding:40px;max-width:560px">
<h1>Сайт ещё не собран</h1>
<p>API работает. Чтобы открыть витрину, соберите клиент:</p>
<pre>cd apps/client &amp;&amp; npm install &amp;&amp; npx expo export -p web</pre>
<p>и укажите папку <code>apps/client/dist</code> в <code>CLIENT_DIST_DIR</code>. В Docker это делается само.</p>
<p><a href="/admin/orders">Панель оператора →</a></p></body></html>"""


def _dist() -> Path:
    return Path(settings.client_dist_dir)


@router.get("/{path:path}")
def client_app(path: str):
    if path.startswith(RESERVED_PREFIXES):
        return HTMLResponse("Not found", status_code=404)
    dist = _dist()
    if not (dist / "index.html").exists():
        return HTMLResponse(NOT_BUILT, status_code=503)
    candidate = (dist / path).resolve()
    if path and candidate.is_file() and dist.resolve() in candidate.parents:
        # Hashed bundles never change under the same name.
        cache = "public, max-age=31536000, immutable" if "/_expo/" in f"/{path}" else "public, max-age=3600"
        return FileResponse(candidate, headers={"Cache-Control": cache})
    return FileResponse(dist / "index.html", headers={"Cache-Control": "no-store"})
