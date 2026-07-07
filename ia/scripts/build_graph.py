#!/usr/bin/env python3
"""
Mathós — GraphRAG Builder

Lee los 170 chunks de Mathos desde la DB de Hermes, extrae entidades y
relaciones con DeepSeek, y construye un grafo de conocimiento en:
  Mathos/ia/graph/mathos_graph.json

Uso:
  python3 build_graph.py              # procesa todo
  python3 build_graph.py --test 10   # solo 10 chunks (para validar)
  python3 build_graph.py --resume    # retoma desde checkpoint

Costo estimado: < $0.05 (170 chunks × ~550 tokens input + ~200 output)
"""

import argparse
import asyncio
import json
import os
import sqlite3
import sys
from pathlib import Path

import httpx

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent
# HERMES_DB: path to the chunks database (from RAG indexing)
HERMES_DB = Path(os.getenv("CHUNKS_DB_PATH", str(ROOT / "ia" / "chunks.db")))
MATHOS_DB = ROOT / "backend" / "api" / "data" / "chunks.db"
GRAPH_DIR = ROOT / "ia" / "graph"
GRAPH_PATH = GRAPH_DIR / "mathos_graph.json"
PROCESSED_IDS_PATH = GRAPH_DIR / "processed_ids.json"
CHECKPOINT_PATH = GRAPH_DIR / "build_checkpoint.json"

# Agrega aquí nuevas colecciones de Mathos cuando se indexen
MATHOS_COLLECTIONS = (
    "lenguajes-programacion",
    "geometria-euclidiana",
    "nietzsche",
    "karl-marx",
)

BATCH_SIZE = 5
MAX_CONCURRENT = 8
CHECKPOINT_EVERY = 10  # batches

# ── Config ─────────────────────────────────────────────────────────────────

def load_env() -> dict:
    env_file = ROOT / ".env"
    env = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    env.update({k: v for k, v in os.environ.items() if k in ("DEEPSEEK_API_KEY", "QWEN_API_KEY")})
    return env


# ── DB ─────────────────────────────────────────────────────────────────────

def load_chunks() -> list[dict]:
    chunks = []

    # Hermes DB — colecciones indexadas por Hermes (lenguajes-prog, geometria)
    hermes_cols = [c for c in MATHOS_COLLECTIONS if HERMES_DB.exists()]
    if hermes_cols:
        conn = sqlite3.connect(str(HERMES_DB))
        placeholders = ",".join("?" * len(hermes_cols))
        rows = conn.execute(
            f"SELECT id, texto, coleccion, metadata_json FROM chunks WHERE coleccion IN ({placeholders})",
            hermes_cols,
        ).fetchall()
        conn.close()
        chunks += [{"id": r[0], "texto": r[1], "coleccion": r[2], "meta": json.loads(r[3]) if r[3] else {}} for r in rows]

    # Mathos DB local — colecciones indexadas por indexar_materias.py
    if MATHOS_DB.exists():
        conn = sqlite3.connect(str(MATHOS_DB))
        placeholders = ",".join("?" * len(MATHOS_COLLECTIONS))
        rows = conn.execute(
            f"SELECT id, texto, materia, metadata FROM chunks WHERE materia IN ({placeholders})",
            MATHOS_COLLECTIONS,
        ).fetchall()
        conn.close()
        hermes_ids = {c["id"] for c in chunks}
        chunks += [
            {"id": r[0], "texto": r[1], "coleccion": r[2], "meta": json.loads(r[3]) if r[3] else {}}
            for r in rows if r[0] not in hermes_ids
        ]

    return chunks


# ── Extracción con DeepSeek ────────────────────────────────────────────────

SYSTEM_PROMPT = """Eres un experto en matemáticas y programación. Analiza los fragmentos de texto dados y extrae:
1. ENTIDADES: conceptos, teoremas, tipos, técnicas, operaciones matemáticas o de programación relevantes.
2. RELACIONES entre esas entidades.

Tipos de relación válidos:
- prerequisito_de   (A es necesario antes de entender B)
- es_tipo_de        (A es una clasificación de B)
- se_demuestra_con  (A se prueba usando B)
- se_aplica_en      (A se usa en contexto B)
- define            (A introduce/define B formalmente)
- generaliza        (A es más general que B)
- contiene          (A incluye a B como parte)
- relacionado_con   (A y B están conceptualmente ligados)

RESPONDE SOLO con un JSON válido. Sin texto adicional. Formato exacto:
{
  "entidades": [
    {"nombre": "Isometría", "tipo": "concepto", "descripcion": "Transformación que conserva distancias"}
  ],
  "relaciones": [
    {"origen": "Isometría", "tipo": "es_tipo_de", "destino": "Transformación del Plano"}
  ]
}

Extrae máximo 8 entidades y 10 relaciones por batch. Solo entidades que aparecen realmente en el texto."""


# Contador global de tokens (thread-safe via asyncio — single loop)
_tokens = {"input": 0, "output": 0}

PRECIO_INPUT  = 0.27 / 1_000_000
PRECIO_OUTPUT = 1.10 / 1_000_000


def costo_acumulado() -> str:
    usd = _tokens["input"] * PRECIO_INPUT + _tokens["output"] * PRECIO_OUTPUT
    return f"${usd:.3f} ({_tokens['input']//1000}k in / {_tokens['output']//1000}k out)"


async def extraer_con_deepseek(
    client: httpx.AsyncClient,
    chunks: list[dict],
    api_key: str,
    semaphore: asyncio.Semaphore,
) -> dict:
    texto_batch = "\n\n---\n\n".join(
        f"[Fragmento {i+1} - {c['coleccion']}]\n{c['texto'][:800]}"
        for i, c in enumerate(chunks)
    )

    async with semaphore:
        for intento in range(3):
            try:
                resp = await client.post(
                    "https://api.deepseek.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": "deepseek-chat",
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": f"Extrae entidades y relaciones de estos fragmentos:\n\n{texto_batch}"},
                        ],
                        "max_tokens": 800,
                        "temperature": 0.1,
                    },
                    timeout=30.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    usage = data.get("usage", {})
                    _tokens["input"]  += usage.get("prompt_tokens", 0)
                    _tokens["output"] += usage.get("completion_tokens", 0)
                    content = data["choices"][0]["message"]["content"].strip()
                    # Limpiar markdown si viene envuelto
                    if content.startswith("```"):
                        content = content.split("```")[1]
                        if content.startswith("json"):
                            content = content[4:]
                        content = content.rsplit("```", 1)[0]
                    parsed = json.loads(content.strip())
                    parsed["_ok"] = True  # API respondió correctamente
                    return parsed
                elif resp.status_code == 429:
                    await asyncio.sleep(2 ** intento)
            except (json.JSONDecodeError, KeyError):
                pass
            except Exception:
                await asyncio.sleep(1)
        return {"entidades": [], "relaciones": []}


# ── Construcción del grafo ─────────────────────────────────────────────────

def merge_into_graph(graph: dict, extraction: dict, coleccion: str) -> None:
    for ent in extraction.get("entidades", []):
        nombre = ent.get("nombre", "").strip()
        if not nombre:
            continue
        if nombre not in graph["nodos"]:
            graph["nodos"][nombre] = {
                "tipo": ent.get("tipo", "concepto"),
                "descripcion": ent.get("descripcion", ""),
                "materias": [coleccion],
                "apariciones": 1,
            }
        else:
            graph["nodos"][nombre]["apariciones"] += 1
            if coleccion not in graph["nodos"][nombre]["materias"]:
                graph["nodos"][nombre]["materias"].append(coleccion)

    for rel in extraction.get("relaciones", []):
        origen = rel.get("origen", "").strip()
        destino = rel.get("destino", "").strip()
        tipo = rel.get("tipo", "relacionado_con").strip()
        if not origen or not destino:
            continue
        edge_key = f"{origen}|{tipo}|{destino}"
        if edge_key not in graph["_edge_keys"]:
            graph["_edge_keys"].add(edge_key)
            graph["aristas"].append({"origen": origen, "tipo": tipo, "destino": destino})


def save_graph(graph: dict, path: Path) -> None:
    exportable = {
        "nodos": graph["nodos"],
        "aristas": graph["aristas"],
        "meta": graph["meta"],
    }
    path.write_text(json.dumps(exportable, ensure_ascii=False, indent=2))


def save_checkpoint(processed_ids: list[int], graph: dict, path: Path) -> None:
    data = {
        "processed_ids": processed_ids,
        "graph": {"nodos": graph["nodos"], "aristas": graph["aristas"], "meta": graph["meta"]},
    }
    path.write_text(json.dumps(data, ensure_ascii=False))


def load_checkpoint(path: Path) -> tuple[set[int], dict] | None:
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    graph = data["graph"]
    graph["_edge_keys"] = {f"{e['origen']}|{e['tipo']}|{e['destino']}" for e in graph["aristas"]}
    return set(data["processed_ids"]), graph


def load_processed_ids() -> set[int]:
    """Carga los IDs de chunks ya procesados en ejecuciones anteriores."""
    if not PROCESSED_IDS_PATH.exists():
        return set()
    return set(json.loads(PROCESSED_IDS_PATH.read_text()))


def save_processed_ids(ids: set[int]) -> None:
    PROCESSED_IDS_PATH.write_text(json.dumps(list(ids)))


def load_existing_graph() -> dict:
    """Carga el grafo existente para modo incremental."""
    if not GRAPH_PATH.exists():
        return {"nodos": {}, "aristas": [], "_edge_keys": set(), "meta": {}}
    data = json.loads(GRAPH_PATH.read_text())
    data["_edge_keys"] = {f"{e['origen']}|{e['tipo']}|{e['destino']}" for e in data["aristas"]}
    return data


# ── Main ───────────────────────────────────────────────────────────────────

async def main(test_n: int | None, resume: bool) -> None:
    GRAPH_DIR.mkdir(parents=True, exist_ok=True)

    env = load_env()
    api_key = env.get("DEEPSEEK_API_KEY") or env.get("QWEN_API_KEY")
    if not api_key:
        print("ERROR: DEEPSEEK_API_KEY no encontrada en .env")
        sys.exit(1)

    all_chunks = load_chunks()
    print(f"Chunks en DB: {len(all_chunks)} ({', '.join(MATHOS_COLLECTIONS)})")

    # Modo incremental: cargar grafo existente + IDs ya procesados
    graph = load_existing_graph()
    processed_ids = load_processed_ids()

    # Si hay checkpoint de una ejecución interrumpida, tomarlo
    if resume or CHECKPOINT_PATH.exists():
        checkpoint = load_checkpoint(CHECKPOINT_PATH)
        if checkpoint:
            cp_ids, cp_graph = checkpoint
            processed_ids = processed_ids | cp_ids
            graph = cp_graph
            print(f"Retomando checkpoint: {len(cp_ids)} IDs extra recuperados")

    ya_procesados = len([c for c in all_chunks if c["id"] in processed_ids])
    pending = [c for c in all_chunks if c["id"] not in processed_ids]

    if ya_procesados:
        print(f"Ya procesados: {ya_procesados} chunks (incrementales omitidos)")

    if test_n:
        pending = pending[:test_n]
        print(f"Modo test: procesando solo {test_n} chunks nuevos")

    if not pending:
        print("Grafo al día — no hay chunks nuevos que procesar.")
        print(f"  Nodos: {len(graph['nodos'])}  |  Aristas: {len(graph['aristas'])}")
        return

    batches = [pending[i:i + BATCH_SIZE] for i in range(0, len(pending), BATCH_SIZE)]
    print(f"Chunks nuevos: {len(pending)} → {len(batches)} batches × {BATCH_SIZE}")

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async with httpx.AsyncClient() as client:
        for i, batch in enumerate(batches):
            coleccion = batch[0]["coleccion"]
            result = await extraer_con_deepseek(client, batch, api_key, semaphore)
            ents = len(result.get("entidades", []))
            rels = len(result.get("relaciones", []))

            merge_into_graph(graph, result, coleccion)

            # Solo marcar como procesado si la API respondió (evita saltear chunks
            # si los créditos se agotan a mitad — el --resume los retomará)
            if ents > 0 or rels > 0 or result.get("_ok"):
                for c in batch:
                    processed_ids.add(c["id"])
            print(f"  Batch {i+1}/{len(batches)} [{coleccion}] → +{ents} ents, +{rels} rels | Total: {len(graph['nodos'])} nodos, {len(graph['aristas'])} aristas")

            if (i + 1) % CHECKPOINT_EVERY == 0:
                save_checkpoint(list(processed_ids), graph, CHECKPOINT_PATH)
                print(f"  [checkpoint guardado] — costo sesión: {costo_acumulado()}")

    save_graph(graph, GRAPH_PATH)
    save_processed_ids(processed_ids)
    if CHECKPOINT_PATH.exists():
        CHECKPOINT_PATH.unlink()

    graph["meta"]["total_chunks"] = len(all_chunks)
    graph["meta"]["colecciones"] = list(MATHOS_COLLECTIONS)

    print(f"\nGrafo actualizado: {GRAPH_PATH}")
    print(f"  Nodos: {len(graph['nodos'])}  |  Aristas: {len(graph['aristas'])}")
    print(f"  Costo sesión: {costo_acumulado()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mathós GraphRAG Builder")
    parser.add_argument("--test", type=int, metavar="N", help="Procesar solo N chunks")
    parser.add_argument("--resume", action="store_true", help="Retomar desde checkpoint")
    args = parser.parse_args()
    asyncio.run(main(test_n=args.test, resume=args.resume))
