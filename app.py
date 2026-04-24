from __future__ import annotations

from pathlib import Path

from flask import Flask


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")


@app.route("/")
def index() -> str:
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
