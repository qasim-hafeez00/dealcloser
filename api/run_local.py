"""Run the API locally (Windows-safe: psycopg async needs the selector event loop)."""
import asyncio
import sys

import uvicorn

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7860
    config = uvicorn.Config("app.main:app", host="127.0.0.1", port=port, log_level="info")
    server = uvicorn.Server(config)
    if sys.platform == "win32":
        asyncio.run(server.serve(), loop_factory=asyncio.SelectorEventLoop)
    else:
        asyncio.run(server.serve())
