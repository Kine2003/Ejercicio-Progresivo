"""Servidor local de la agenda. Solo utiliza la biblioteca estándar de Python 3."""
import argparse
import datetime as dt
import json
import mimetypes
import re
import sqlite3
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
MAX_BODY = 1024 * 1024
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("application/javascript", ".js")


def connect(path):
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    return db


def initialize(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, document TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS mutations (id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL);
            INSERT OR IGNORE INTO state VALUES (1, 0);
        """)
        if db.execute("SELECT revision FROM state WHERE id=1").fetchone()[0] == 0 and not db.execute("SELECT 1 FROM tasks LIMIT 1").fetchone():
            samples = [
                ("Practicar Fetch API y revisar el manejo de errores", "Desarrollo de plataformas", 1, "high"),
                ("Preparar el resumen de aplicaciones progresivas", "Tecnología web", 3, "normal"),
                ("Resolver los ejercicios de la unidad", "Matemáticas", 5, "low"),
            ]
            for index, (title, subject, days, priority) in enumerate(samples, 1):
                task = {"id": f"ejemplo-{index}", "title": title, "subject": subject,
                        "dueDate": (dt.date.today() + dt.timedelta(days=days)).isoformat(),
                        "priority": priority, "completed": False, "deleted": False,
                        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
                db.execute("INSERT INTO tasks VALUES (?, ?)", (task["id"], json.dumps(task, ensure_ascii=False)))
            db.execute("UPDATE state SET revision=1 WHERE id=1")


def validate(change):
    if not isinstance(change, dict):
        raise ValueError("Cambio no válido.")
    mutation = change.get("mutationId")
    if not isinstance(mutation, str) or not 1 <= len(mutation) <= 100:
        raise ValueError("Identificador de cambio no válido.")
    task = change.get("task")
    if not isinstance(task, dict):
        raise ValueError("Tarea no válida.")
    limits = {"id": 100, "title": 160, "subject": 80, "dueDate": 10, "updatedAt": 50}
    for field, length in limits.items():
        value = task.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > length:
            raise ValueError(f"Campo no válido: {field}.")
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", task["dueDate"]):
            raise ValueError("Formato de fecha no válido.")
        dt.date.fromisoformat(task["dueDate"])
    except ValueError as error:
        raise ValueError("Fecha de entrega no válida.") from error
    if task.get("priority") not in ("high", "normal", "low"):
        raise ValueError("Prioridad no válida.")
    if not isinstance(task.get("completed"), bool) or not isinstance(task.get("deleted"), bool):
        raise ValueError("Estado de tarea no válido.")
    clean = {field: task[field] for field in (*limits, "priority", "completed", "deleted")}
    return mutation, clean


def snapshot(db, acknowledged=()):
    return {"tasks": [json.loads(row[0]) for row in db.execute("SELECT document FROM tasks ORDER BY id")],
            "acknowledged": list(acknowledged),
            "revision": db.execute("SELECT revision FROM state WHERE id=1").fetchone()[0]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, data_path, **kwargs):
        self.data_path = data_path
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def json_response(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        if urlsplit(self.path).path == "/sw.js":
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Archivo no encontrado")
        return None

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == "/api/tasks":
            try:
                with connect(self.data_path) as db:
                    db.execute("BEGIN")
                    data = snapshot(db)
                self.json_response(200, data)
            except sqlite3.Error:
                self.json_response(503, {"error": "No se pudo leer la base de datos. Reintenta."})
        elif route.startswith("/api/"):
            self.json_response(404, {"error": "Ruta de API no encontrada."})
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/sync":
            self.json_response(404, {"error": "Ruta de API no encontrada."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                self.json_response(413, {"error": "Solicitud demasiado grande o vacía."})
                return
            payload = json.loads(self.rfile.read(length))
            changes = payload.get("changes") if isinstance(payload, dict) else None
            if not isinstance(changes, list) or len(changes) > 100:
                raise ValueError("El lote debe contener hasta 100 cambios.")
            validated = [validate(change) for change in changes]
            acknowledged = []
            with connect(self.data_path) as db:
                db.execute("BEGIN IMMEDIATE")
                for mutation, task in validated:
                    if not db.execute("SELECT 1 FROM mutations WHERE id=?", (mutation,)).fetchone():
                        db.execute("INSERT INTO tasks VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET document=excluded.document",
                                   (task["id"], json.dumps(task, ensure_ascii=False)))
                        db.execute("INSERT INTO mutations VALUES (?)", (mutation,))
                        db.execute("UPDATE state SET revision=revision+1 WHERE id=1")
                    acknowledged.append(mutation)
                data = snapshot(db, acknowledged)
            # La confirmación se envía solo después del commit.
            self.json_response(200, data)
        except (ValueError, UnicodeDecodeError) as error:
            self.json_response(400, {"error": str(error)})
        except sqlite3.Error:
            self.json_response(503, {"error": "No se pudieron guardar los cambios. Reintenta."})


def main():
    parser = argparse.ArgumentParser(description="Mi Agenda: servidor y API de sincronización")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "agenda.sqlite3")
    options = parser.parse_args()
    initialize(options.data)
    server = ThreadingHTTPServer((options.host, options.port), partial(Handler, data_path=options.data))
    print(f"Mi Agenda disponible en http://localhost:{options.port}", flush=True)
    print("Deja esta ventana abierta. Pulsa Ctrl+C para detener el servidor.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
