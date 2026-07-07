"""Mathós — Servicio de embeddings con TurboVec.

Reemplaza ChromaDB con TurboVec (Google TurboQuant) + SQLite para
búsqueda vectorial ultra-rápida con cuantización 4-bit.

Arquitectura:
  SQLite (texto + metadatos) ← id → TurboVec (vectores cuantizados)
"""

import json
import sqlite3
import numpy as np
from pathlib import Path
from typing import Optional

# ── DB y modelo ────────────────────────────────
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

CHUNKS_DB = str(DATA_DIR / "chunks.db")
INDEX_PATH = str(DATA_DIR / "mathos_rag.tvim")

# Dimension del embedding (all-MiniLM-L6-v2 = 384, OpenAI = 1536, etc.)
EMBEDDING_DIM = 384
# Bits por componente (2, 4, 8)
BIT_WIDTH = 4

# ── Inicialización lazy ─────────────────────────
_modelo = None
_index = None


def _get_modelo():
    global _modelo
    if _modelo is None:
        from sentence_transformers import SentenceTransformer
        _modelo = SentenceTransformer("all-MiniLM-L6-v2")
    return _modelo


def _get_index():
    global _index
    if _index is None:
        from turbovec import IdMapIndex
        idx_path = Path(INDEX_PATH)
        if idx_path.exists():
            _index = IdMapIndex.load(INDEX_PATH)
        else:
            _index = IdMapIndex(dim=EMBEDDING_DIM, bit_width=BIT_WIDTH)
    return _index


# ── Chunks DB (SQLite) ──────────────────────────
def _init_db():
    conn = sqlite3.connect(CHUNKS_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY,
            texto TEXT NOT NULL,
            materia TEXT NOT NULL,
            tema TEXT,
            fuente TEXT,
            metadata TEXT
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_chunks_materia ON chunks(materia)
    """)
    conn.commit()
    conn.close()


def _guardar_chunk(id_chunk: int, texto: str, materia: str,
                   tema: Optional[str] = None, fuente: Optional[str] = None,
                   metadata: Optional[dict] = None):
    conn = sqlite3.connect(CHUNKS_DB)
    conn.execute(
        "INSERT OR REPLACE INTO chunks (id, texto, materia, tema, fuente, metadata) VALUES (?,?,?,?,?,?)",
        (id_chunk, texto, materia, tema, fuente, json.dumps(metadata) if metadata else None)
    )
    conn.commit()
    conn.close()


def _recuperar_chunks(ids: list[int]) -> list[dict]:
    if not ids:
        return []
    conn = sqlite3.connect(CHUNKS_DB)
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT id, texto, materia, tema, fuente, metadata FROM chunks WHERE id IN ({placeholders})",
        ids
    ).fetchall()
    conn.close()
    resultados = []
    id_map = {r[0]: r for r in rows}
    for id_chunk in ids:
        r = id_map.get(id_chunk)
        if r:
            resultados.append({
                "id": r[0],
                "texto": r[1],
                "materia": r[2],
                "tema": r[3],
                "fuente": r[4],
                "metadata": json.loads(r[5]) if r[5] else {},
            })
    return resultados


# ── API pública ─────────────────────────────────
def agregar_texto(texto: str, materia: str, tema: Optional[str] = None,
                  fuente: Optional[str] = None, metadata: Optional[dict] = None) -> int:
    """Indexa un texto en TurboVec + guarda en SQLite. Retorna id del chunk."""
    _init_db()
    modelo = _get_modelo()
    index = _get_index()

    # Generar id único basado en hash
    id_chunk = abs(hash(texto[:200] + materia + str(tema))) % (2**63 - 1)

    # Generar embedding
    emb = modelo.encode(texto).astype(np.float32)

    # Agregar a TurboVec
    index.add_with_ids(np.array([emb]), np.array([id_chunk], dtype=np.uint64))

    # Guardar en SQLite
    _guardar_chunk(id_chunk, texto, materia, tema, fuente, metadata)

    # Persistir índice
    index.write(INDEX_PATH)

    return id_chunk


def buscar(texto: str, materia: Optional[str] = None, k: int = 5) -> list[dict]:
    """Busca los k chunks más relevantes. Opcionalmente filtra por materia."""
    _init_db()
    modelo = _get_modelo()
    index = _get_index()

    # Generar embedding de la consulta
    query_emb = modelo.encode(texto).astype(np.float32)

    # Filtro por materia (allowlist)
    allowlist = None
    if materia:
        conn = sqlite3.connect(CHUNKS_DB)
        rows = conn.execute("SELECT id FROM chunks WHERE materia = ?", (materia,)).fetchall()
        conn.close()
        if rows:
            allowlist = np.array([r[0] for r in rows], dtype=np.uint64)

    # Buscar en TurboVec (requiere batch 2D)
    scores, ids = index.search(np.array([query_emb]), k=k, allowlist=allowlist)

    # Desempaquetar batch de 1 query
    scores = scores[0] if len(scores.shape) > 1 else scores
    ids = ids[0] if len(ids.shape) > 1 else ids

    # Recuperar textos
    chunks = _recuperar_chunks(ids.tolist())

    # Agregar score a cada chunk
    for chunk, score in zip(chunks, scores.tolist()):
        chunk["distancia"] = round(score, 4)

    return chunks


def guardar_indice():
    """Persiste el índice TurboVec a disco."""
    index = _get_index()
    index.write(INDEX_PATH)


def cargar_indice():
    """Carga el índice TurboVec desde disco."""
    global _index
    from turbovec import IdMapIndex
    _index = IdMapIndex.load(INDEX_PATH)
