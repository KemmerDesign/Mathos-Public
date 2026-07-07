"""
Mathós — Servicio NotebookLM MCP.

Comunica con notebooklm-mcp via JSON-RPC sobre stdio para:
- Crear notebooks por materia
- Ingerir teoría como fuente
- Generar Audio Overviews (podcast)
- Descargar el audio a disco

Requiere autenticación previa: ejecutar notebooklm-mcp interactivo una vez.
"""

import asyncio
import json
import os
import hashlib
import time
from pathlib import Path
from typing import Optional

# Directorio de caché de audio
AUDIO_DIR = Path(__file__).resolve().parent.parent / "data" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Timeouts
INIT_TIMEOUT = 15  # segundos para iniciar MCP
TOOL_TIMEOUT = 300  # segundos para generar audio (puede tardar varios minutos)


class NotebookLMClient:
    """Cliente JSON-RPC asíncrono para notebooklm-mcp."""

    __slots__ = ("process", "buffer", "_next_id", "_responses", "_initialized")

    def __init__(self):
        self.process: Optional[asyncio.subprocess.Process] = None
        self.buffer = ""
        self._next_id = 1
        self._responses: dict[int, asyncio.Future] = {}
        self._initialized = False

    async def start(self):
        """Inicia el proceso notebooklm-mcp."""
        self.process = await asyncio.create_subprocess_exec(
            "notebooklm-mcp",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        # Iniciar lectura en background
        asyncio.create_task(self._read_stdout())

        # Inicializar MCP
        await self._send_rpc("initialize", {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "mathos", "version": "1.0.0"},
        })
        # Enviar notificación initialized
        self.process.stdin.write(
            json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
        ).encode()
        try:
            await self.process.stdin.drain()
        except Exception:
            pass

        self._initialized = True

    async def _read_stdout(self):
        """Lee stdout del proceso MCP y resuelve futures pendientes."""
        while self.process and self.process.stdout:
            try:
                line = await self.process.stdout.readline()
                if not line:
                    break
                line_str = line.decode("utf-8").strip()
                if not line_str:
                    continue
                try:
                    msg = json.loads(line_str)
                except json.JSONDecodeError:
                    continue

                # Si es una respuesta a una llamada, resolver el future
                if "id" in msg and msg["id"] in self._responses:
                    future = self._responses.pop(msg["id"])
                    if "error" in msg:
                        future.set_exception(
                            RuntimeError(msg["error"].get("message", "MCP error"))
                        )
                    else:
                        future.set_result(msg.get("result", {}))
            except Exception:
                continue

    async def _send_rpc(self, method: str, params: dict) -> dict:
        """Envía un JSON-RPC request y espera la respuesta."""
        rid = self._next_id
        self._next_id += 1

        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._responses[rid] = future

        req = json.dumps({
            "jsonrpc": "2.0",
            "id": rid,
            "method": method,
            "params": params,
        })
        self.process.stdin.write((req + "\n").encode())
        try:
            await self.process.stdin.drain()
        except Exception:
            pass

        try:
            return await asyncio.wait_for(future, timeout=TOOL_TIMEOUT)
        except asyncio.TimeoutError:
            self._responses.pop(rid, None)
            raise RuntimeError("Timeout esperando respuesta del MCP")

    async def call_tool(self, name: str, args: dict = None) -> dict:
        """Llama a una herramienta MCP por nombre."""
        return await self._send_rpc("tools/call", {
            "name": name,
            "arguments": args or {},
        })

    async def close(self):
        """Cierra el proceso MCP."""
        if self.process:
            try:
                self.process.stdin.close()
            except Exception:
                pass
            try:
                self.process.kill()
            except Exception:
                pass
            await self.process.wait()
            self.process = None
        self._initialized = False


# ─── API pública ────────────────────────────────────


def _audio_cache_key(tema_id: str, contenido_hash: str) -> str:
    """Clave de caché para el audio de un tema."""
    key = f"{tema_id}_{contenido_hash}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _cached_audio_path(cache_key: str) -> Optional[Path]:
    """Retorna el path del audio cacheado, o None."""
    audio_file = AUDIO_DIR / f"{cache_key}.m4a"
    if audio_file.exists() and audio_file.stat().st_size > 0:
        return audio_file
    return None


async def generate_audio(
    tema_id: str,
    tema_nombre: str,
    contenido_teoria: str,
    regenerar: bool = False,
) -> dict:
    """
    Genera un Audio Overview estilo podcast para un tema usando NotebookLM.

    El audio se cachea en disco. La generación puede tardar 2-5 minutos.

    Returns:
        dict con {url, cached, cache_key, duracion_segundos}
    """
    contenido_hash = hashlib.sha256(contenido_teoria.encode()).hexdigest()[:12]
    ck = _audio_cache_key(tema_id, contenido_hash)

    # Verificar caché
    if not regenerar:
        cached = _cached_audio_path(ck)
        if cached:
            return {
                "url": f"/resources/audio/{ck}.m4a",
                "cached": True,
                "cache_key": ck,
                "path": str(cached),
            }

    # Generar con NotebookLM MCP
    client = NotebookLMClient()
    try:
        await client.start()

        # 1. Obtener o crear notebook para la materia
        # Primero listamos notebooks existentes
        list_result = await client.call_tool("list_notebooks")
        notebooks = _parse_notebook_list(list_result)
        notebook_id = None

        # Buscar notebook por nombre
        notebook_name = f"Mathós - {tema_nombre}"
        for nb in notebooks:
            if tema_nombre.lower() in nb.get("name", "").lower():
                notebook_id = nb["id"]
                break

        if not notebook_id:
            # Crear nuevo notebook
            create_result = await client.call_tool("add_notebook", {
                "name": notebook_name,
                "description": f"Contenido académico de {tema_nombre} — Mathós UNED",
            })
            notebook_id = _parse_notebook_id(create_result)
            if not notebook_id:
                # Usar el primer notebook disponible o fallback
                list_result2 = await client.call_tool("list_notebooks")
                notebooks2 = _parse_notebook_list(list_result2)
                notebook_id = notebooks2[0]["id"] if notebooks2 else None

        if not notebook_id:
            raise RuntimeError("No se pudo crear/encontrar un notebook")

        # Seleccionar notebook
        await client.call_tool("select_notebook", {"id": notebook_id})

        # 2. Añadir teoría como fuente
        source_text = f"# {tema_nombre}\n\n{contenido_teoria[:8000]}"
        await client.call_tool("add_source", {
            "type": "text",
            "content": source_text,
        })

        # 3. Generar audio
        await client.call_tool("generate_audio", {})

        # 4. Esperar a que el audio esté listo
        max_attempts = 30
        for attempt in range(max_attempts):
            await asyncio.sleep(10)
            status_result = await client.call_tool("get_audio_status", {})
            status = _parse_audio_status(status_result)
            if status == "complete":
                break
            if status == "error":
                raise RuntimeError("La generación de audio falló en NotebookLM")
        else:
            raise RuntimeError("Timeout: la generación de audio tardó demasiado")

        # 5. Descargar audio
        audio_path = AUDIO_DIR / f"{ck}.m4a"
        download_result = await client.call_tool("download_audio", {
            "output_path": str(audio_path),
        })

        return {
            "url": f"/resources/audio/{ck}.m4a",
            "cached": False,
            "cache_key": ck,
            "path": str(audio_path),
        }

    except Exception as e:
        # Si falla NotebookLM, devolver error claro
        raise RuntimeError(f"NotebookLM MCP error: {e}")
    finally:
        await client.close()


def _parse_notebook_list(result: dict) -> list[dict]:
    """Extrae la lista de notebooks del resultado MCP."""
    # El resultado puede venir en diferentes formatos
    if isinstance(result, dict):
        content = result.get("content", [])
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text", "")
                    if "notebooks" in text.lower():
                        try:
                            data = json.loads(text)
                            return data if isinstance(data, list) else data.get("notebooks", [])
                        except json.JSONDecodeError:
                            pass
    return []


def _parse_notebook_id(result: dict) -> Optional[str]:
    """Extrae el ID del notebook del resultado MCP."""
    if isinstance(result, dict):
        content = result.get("content", [])
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text", "")
                    for word in text.split():
                        if len(word) > 20 and "-" in word:
                            return word.strip('",.')
    return None


def _parse_audio_status(result: dict) -> str:
    """Parsea el estado del audio. Retorna 'generating', 'complete', o 'error'."""
    parts: list[str] = []
    if isinstance(result, dict):
        content = result.get("content", [])
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    parts.append(item.get("text", ""))
    text = "".join(parts)
    text_lower = text.lower()
    if "complete" in text_lower or "ready" in text_lower:
        return "complete"
    if "error" in text_lower or "fail" in text_lower:
        return "error"
    return "generating"
