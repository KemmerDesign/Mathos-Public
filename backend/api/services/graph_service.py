"""Mathós — Graph RAG Service

Consulta el grafo de conocimiento construido por ia/scripts/build_graph.py
para expandir el contexto de una query más allá de los chunks vectoriales.

Uso típico:
    contexto_grafo = expandir_con_grafo(["Isometría", "Espacio Métrico"])
    # → texto con descripciones y relaciones de nodos vecinos
"""

import json
from pathlib import Path
from typing import Optional

GRAPH_PATH = Path(__file__).resolve().parent.parent.parent.parent / "ia" / "graph" / "mathos_graph.json"

_graph: dict | None = None


def _load_graph() -> dict:
    global _graph
    if _graph is None:
        if not GRAPH_PATH.exists():
            _graph = {"nodos": {}, "aristas": []}
        else:
            _graph = json.loads(GRAPH_PATH.read_text())
    return _graph


def _build_adjacency(graph: dict) -> dict[str, list[dict]]:
    adj: dict[str, list[dict]] = {}
    for arista in graph["aristas"]:
        origen = arista["origen"]
        destino = arista["destino"]
        tipo = arista["tipo"]
        adj.setdefault(origen, []).append({"nodo": destino, "relacion": tipo, "direccion": "salida"})
        adj.setdefault(destino, []).append({"nodo": origen, "relacion": tipo, "direccion": "entrada"})
    return adj


def buscar_entidades_en_texto(texto: str, graph: dict) -> list[str]:
    """Encuentra nombres de nodos del grafo que aparecen en el texto (case-insensitive)."""
    texto_lower = texto.lower()
    return [nombre for nombre in graph["nodos"] if nombre.lower() in texto_lower]


def expandir_con_grafo(
    texto_query: str,
    profundidad: int = 1,
    max_nodos: int = 6,
    coleccion: Optional[str] = None,
) -> str:
    """
    Dado un texto (pregunta del usuario o chunks RAG), encuentra entidades
    mencionadas en el grafo y devuelve su contexto de relaciones como string.

    Args:
        texto_query: texto donde buscar entidades (pregunta + chunks RAG)
        profundidad: 1 = vecinos directos, 2 = vecinos de vecinos
        max_nodos: máximo de nodos adicionales a incluir
        coleccion: si se especifica, filtra nodos por materia

    Returns:
        Contexto adicional listo para inyectar en el prompt del LLM.
        Vacío si no se encuentran entidades relevantes.
    """
    graph = _load_graph()
    if not graph["nodos"]:
        return ""

    adj = _build_adjacency(graph)
    entidades_encontradas = buscar_entidades_en_texto(texto_query, graph)

    if not entidades_encontradas:
        return ""

    # BFS hasta profundidad indicada
    visitados: set[str] = set(entidades_encontradas)
    frontera = set(entidades_encontradas)

    for _ in range(profundidad):
        nueva_frontera: set[str] = set()
        for nodo in frontera:
            for vecino_data in adj.get(nodo, []):
                vecino = vecino_data["nodo"]
                if vecino not in visitados:
                    nueva_frontera.add(vecino)
                    visitados.add(vecino)
        frontera = nueva_frontera
        if not frontera:
            break

    # Filtrar por colección si se pide
    nodos_relevantes = list(visitados)
    if coleccion:
        nodos_relevantes = [
            n for n in nodos_relevantes
            if coleccion in graph["nodos"].get(n, {}).get("materias", [])
        ]

    nodos_relevantes = nodos_relevantes[:max_nodos]

    if not nodos_relevantes:
        return ""

    # Construir texto de contexto
    lineas = ["[Grafo de conocimiento — conceptos relacionados con la pregunta]"]

    for nombre in nodos_relevantes:
        nodo_data = graph["nodos"].get(nombre, {})
        desc = nodo_data.get("descripcion", "")
        tipo = nodo_data.get("tipo", "concepto")
        lineas.append(f"• {nombre} ({tipo}): {desc}")

        # Relaciones directas de este nodo
        relaciones = adj.get(nombre, [])[:4]
        for rel in relaciones:
            if rel["direccion"] == "salida":
                lineas.append(f"  → {rel['relacion']} → {rel['nodo']}")
            else:
                lineas.append(f"  ← {rel['relacion']} ← {rel['nodo']}")

    return "\n".join(lineas)
