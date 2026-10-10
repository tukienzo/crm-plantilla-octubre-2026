# sincronizar-youtube.py — trae del canal los videos largos publicados y los carga en
# crm_youtube_videos. Es el mismo criterio que POST /api/youtube {accion:"sync"}: solo videos de
# 3 minutos o más (los Shorts no son proyectos de este tablero) y nunca pisa el guion, las notas
# ni el responsable que se cargaron a mano en el CRM.
#   python scripts/sincronizar-youtube.py
import io, os, sys, json, re, urllib.request, urllib.parse

raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for linea in io.open(os.path.join(raiz, ".env.local"), encoding="utf-8-sig"):
    if "=" in linea and not linea.strip().startswith("#"):
        k, v = linea.split("=", 1); env[k.strip()] = v.strip().strip('"')
KEY = env.get("YOUTUBE_API_KEY"); CANAL = env.get("YOUTUBE_CHANNEL_ID")
if not KEY or not CANAL: sys.exit("faltan YOUTUBE_API_KEY / YOUTUBE_CHANNEL_ID en .env.local")

def yt(path, **params):
    params["key"] = KEY
    url = f"https://www.googleapis.com/youtube/v3/{path}?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)

uploads = "UU" + CANAL[2:]
items, token = [], None
while True:
    p = dict(part="snippet,contentDetails", playlistId=uploads, maxResults=50)
    if token: p["pageToken"] = token
    j = yt("playlistItems", **p)
    items += j.get("items", [])
    token = j.get("nextPageToken")
    if not token: break

ids = [i["contentDetails"]["videoId"] for i in items if i.get("contentDetails", {}).get("videoId")]
detalle = {}
def dur(iso):
    m = re.match(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", iso or "")
    return None if not m else int(m.group(1) or 0)*3600 + int(m.group(2) or 0)*60 + int(m.group(3) or 0)
for i in range(0, len(ids), 50):
    for v in yt("videos", part="statistics,contentDetails", id=",".join(ids[i:i+50])).get("items", []):
        s = v.get("statistics", {})
        detalle[v["id"]] = dict(
            vistas=int(s.get("viewCount", 0) or 0), likes=int(s.get("likeCount", 0) or 0),
            comentarios=int(s.get("commentCount", 0) or 0), duracion=dur(v.get("contentDetails", {}).get("duration")))

def q(v):
    if v is None: return "null"
    if isinstance(v, int): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

filas, salteados = [], 0
for it in items:
    s = it["snippet"]; vid = it["contentDetails"]["videoId"]
    d = detalle.get(vid, {})
    if d.get("duracion") is not None and d["duracion"] < 180:
        salteados += 1; continue
    t = s.get("thumbnails", {})
    mini = (t.get("maxres") or t.get("standard") or t.get("high") or t.get("medium") or {}).get("url")
    filas.append("(" + ", ".join([
        q(s.get("title", "")[:300]), "'publicado'", q((s.get("description") or "")[:2000] or None),
        q(mini), q(f"https://www.youtube.com/watch?v={vid}"), q(vid), q(s.get("publishedAt")),
        q(d.get("duracion")), q(d.get("vistas")), q(d.get("likes")), q(d.get("comentarios")),
        "'youtube'", "now()",
    ]) + ")")

sql = """insert into public.crm_youtube_videos
 (titulo, estado, descripcion, miniatura_url, video_url, youtube_id, publicado_at, duracion_seg, vistas, likes, comentarios, origen, stats_at)
values
""" + ",\n".join(filas) + """
on conflict (youtube_id) do update set
  titulo = excluded.titulo, miniatura_url = excluded.miniatura_url, publicado_at = excluded.publicado_at,
  duracion_seg = excluded.duracion_seg, vistas = excluded.vistas, likes = excluded.likes,
  comentarios = excluded.comentarios, stats_at = excluded.stats_at;"""

destino = os.path.join(raiz, "scripts", "out-youtube.sql")
io.open(destino, "w", encoding="utf-8").write(sql)
print(f"{len(filas)} videos largos ({salteados} shorts salteados) -> {destino}")
