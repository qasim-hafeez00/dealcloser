"""One psycopg async pool shared by LangGraph's saver/store and our own queries."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from . import config

log = logging.getLogger("dealcloser.db")
SQL_DIR = Path(__file__).resolve().parents[1] / "sql"

pool: AsyncConnectionPool | None = None


def make_pool(url: str | None = None) -> AsyncConnectionPool:
    return AsyncConnectionPool(
        conninfo=url or config.DATABASE_URL,
        min_size=1,
        max_size=8,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        check=AsyncConnectionPool.check_connection,
        max_idle=240,
        timeout=20,
        open=False,
    )


async def open_pool() -> AsyncConnectionPool:
    global pool
    if pool is None:
        pool = make_pool()
    await pool.open(wait=True, timeout=30)
    return pool


async def close_pool() -> None:
    if pool is not None:
        await pool.close()


def get_pool() -> AsyncConnectionPool:
    if pool is None:
        raise RuntimeError("DB pool not initialised")
    return pool


async def fetch(sql: str, *args: Any) -> list[dict]:
    async with get_pool().connection() as conn:
        cur = await conn.execute(sql, args or None)
        return await cur.fetchall() if cur.description else []


async def fetchrow(sql: str, *args: Any) -> dict | None:
    rows = await fetch(sql, *args)
    return rows[0] if rows else None


async def fetchval(sql: str, *args: Any) -> Any:
    row = await fetchrow(sql, *args)
    return next(iter(row.values())) if row else None


async def execute(sql: str, *args: Any) -> int:
    async with get_pool().connection() as conn:
        cur = await conn.execute(sql, args or None)
        return cur.rowcount


async def run_sql_file(name: str) -> None:
    sql = (SQL_DIR / name).read_text(encoding="utf-8")
    async with get_pool().connection() as conn:
        await conn.execute(sql, prepare=False)
