import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from shared.database import get_session
from shared.auth import get_current_user
from models import BibliosSession, BibliosMacroSession, Usuario, CerebroNota, CerebroEnlace
from schemas import BibliosSessionResponse, BibliosMacroSessionResponse
from services.asistente_service import llamar_ia

router = APIRouter(prefix="/api/v1/biblios", tags=["Biblios"])

@router.get("/nota/{nota_id}", response_model=list[BibliosSessionResponse])
async def get_biblios_sessions(
    nota_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    stmt = select(BibliosSession).where(
        BibliosSession.nota_id == nota_id,
        BibliosSession.usuario_id == current_user["sub"]
    ).order_by(desc(BibliosSession.created_at))
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return sessions

from pydantic import BaseModel

class EvalNotaRequest(BaseModel):
    instrucciones: str = ""

@router.post("/evaluar/{nota_id}", response_model=BibliosSessionResponse)
async def evaluate_nota(
    nota_id: str,
    req: EvalNotaRequest,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    # 1. Traer la nota
    stmt_nota = select(CerebroNota).where(
        CerebroNota.id == nota_id, CerebroNota.usuario_id == current_user["sub"]
    )
    res_nota = await db.execute(stmt_nota)
    nota = res_nota.scalar_one_or_none()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")

    # 2. Traer la sesión anterior para comparar
    stmt_prev = select(BibliosSession).where(
        BibliosSession.nota_id == nota_id,
        BibliosSession.usuario_id == current_user["sub"]
    ).order_by(desc(BibliosSession.created_at)).limit(1)
    res_prev = await db.execute(stmt_prev)
    prev_session = res_prev.scalar_one_or_none()

    # 3. Prompt de Biblios
    # Biblios es un auditor epistemológico estricto.
    sys_prompt = (
        "Eres Biblios, el auditor epistemológico y corrector de ortografía de Mathós. "
        "Tu misión es evaluar notas de estudio de los usuarios de manera estricta y constructiva.\n"
        "Debes evaluar tres aspectos:\n"
        "1. Ortografía y gramática (ESTRICTO).\n"
        "2. Coherencia y claridad de las ideas explicadas.\n"
        "3. Sugerencias de mejora o redacción.\n"
        "Tu salida debe ser ÚNICAMENTE un objeto JSON válido con este esquema exacto:\n"
        "{\n"
        "  \"orthography_score\": 0-100,\n"
        "  \"coherence_score\": 0-100,\n"
        "  \"feedback_ortografia\": [{\"error\": \"palabra_mal\", \"correccion\": \"palabra_bien\", \"razon\": \"motivo\"}],\n"
        "  \"feedback_coherencia\": \"tu evaluación de claridad\",\n"
        "  \"feedback_mejoras\": \"tips de redacción\",\n"
        "  \"comparacion_anterior\": \"(opcional) cómo mejoró respecto a la versión anterior\"\n"
        "}\n"
    )

    user_prompt = f"Título de la Nota: {nota.title}\nContenido actual:\n{nota.content}\n\n"
    
    if req.instrucciones.strip():
        user_prompt += f"\nINSTRUCCIONES ESPECÍFICAS DEL USUARIO:\n{req.instrucciones}\n\n"
        
    if prev_session:
        user_prompt += f"--- VERSIÓN ANTERIOR ---\n{prev_session.original_text}\n"
        user_prompt += "Por favor compara la versión actual con la anterior y llena el campo 'comparacion_anterior' mencionando si el usuario corrigió sus errores o mejoró la claridad."

    # 4. Llamar al LLM (JSON format esperado)
    llm_response = await llamar_ia(
        system=sys_prompt,
        user=user_prompt
    )

    try:
        # Extraer JSON
        json_str = llm_response
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        data = json.loads(json_str)
    except Exception as e:
        # Fallback
        data = {
            "orthography_score": 0,
            "coherence_score": 0,
            "feedback_ortografia": [{"error": "Error JSON", "correccion": "N/A", "razon": str(e)}],
            "feedback_coherencia": "Falló el parseo de la IA.",
            "feedback_mejoras": "N/A",
            "comparacion_anterior": ""
        }

    # 5. Guardar sesión
    new_session = BibliosSession(
        nota_id=nota.id,
        usuario_id=current_user["sub"],
        original_text=nota.content,
        coherence_score=data.get("coherence_score", 0),
        orthography_score=data.get("orthography_score", 0),
        feedback_ortografia=json.dumps(data.get("feedback_ortografia", [])),
        feedback_coherencia=data.get("feedback_coherencia", ""),
        feedback_mejoras=data.get("feedback_mejoras", ""),
        comparacion_anterior=data.get("comparacion_anterior", "")
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)

    return new_session

from pydantic import BaseModel
from typing import List, Dict, Any

class MacroEvalRequest(BaseModel):
    target_type: str
    target_id: str
    notas: List[Dict[str, Any]]
    enlaces: List[Dict[str, Any]]
    instrucciones: str = ""

@router.get("/macro/{target_type}/{target_id}", response_model=list[BibliosMacroSessionResponse])
async def get_biblios_macro_sessions(
    target_type: str,
    target_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    stmt = select(BibliosMacroSession).where(
        BibliosMacroSession.target_type == target_type,
        BibliosMacroSession.target_id == target_id,
        BibliosMacroSession.usuario_id == current_user["sub"]
    ).order_by(desc(BibliosMacroSession.created_at))
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/macro/evaluar", response_model=BibliosMacroSessionResponse)
async def evaluate_macro(
    req: MacroEvalRequest,
    db: AsyncSession = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    # Traer la sesión anterior para comparar
    stmt_prev = select(BibliosMacroSession).where(
        BibliosMacroSession.target_type == req.target_type,
        BibliosMacroSession.target_id == req.target_id,
        BibliosMacroSession.usuario_id == current_user["sub"]
    ).order_by(desc(BibliosMacroSession.created_at)).limit(1)
    res_prev = await db.execute(stmt_prev)
    prev_session = res_prev.scalar_one_or_none()

    # Preparar el contenido a evaluar
    texto_a_evaluar = ""
    for n in req.notas:
        texto_a_evaluar += f"\n\n--- NODO: {n.get('title', 'Sin título')} (ID: {n.get('id')}) ---\n"
        texto_a_evaluar += n.get('content', '')

    texto_a_evaluar += "\n\n--- ENLACES (Relaciones) ---\n"
    for e in req.enlaces:
        texto_a_evaluar += f"{e.get('source_id') or e.get('source')} -> {e.get('target_id') or e.get('target')}\n"

    sys_prompt = """Eres Biblios, el auditor de conocimiento y redacción.
El usuario te enviará un conjunto de nodos (y sus enlaces) que representan un tema, carpeta o grafo completo.
Tu tarea es hacer una evaluación MACRO:
1. coherence_score (0-100): Qué tan bien fluyen las ideas entre los diferentes nodos.
2. feedback_global: Un párrafo detallado evaluando la estructura general, conceptos faltantes y la progresión lógica.
3. feedback_nodos: Una lista JSON de objetos {"id_nodo": "...", "observacion": "..."} con comentarios específicos para los nodos que necesiten mejorar su conexión o contenido.
4. comparacion_anterior: Si se provee contexto de la versión anterior, indica si mejoró la estructura global.

Responde ÚNICAMENTE con un objeto JSON con esta estructura exacta:
{
  "coherence_score": 85,
  "feedback_global": "El tema está bien estructurado pero falta conectar A con B...",
  "feedback_nodos": [{"id_nodo": "n1", "observacion": "Ampliar este concepto"}],
  "comparacion_anterior": ""
}"""

    user_prompt = f"Aquí están los nodos y enlaces:\n{texto_a_evaluar}\n"
    
    if req.instrucciones.strip():
        user_prompt += f"\nINSTRUCCIONES ESPECÍFICAS DEL USUARIO:\n{req.instrucciones}\n"
        
    if prev_session:
        user_prompt += "\nPor favor compara la versión actual con la anterior y llena el campo 'comparacion_anterior'."

    llm_response = await llamar_ia(system=sys_prompt, user=user_prompt)

    try:
        json_str = llm_response
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        data = json.loads(json_str)
    except Exception as e:
        data = {
            "coherence_score": 0,
            "feedback_global": f"Error parseando respuesta: {str(e)}",
            "feedback_nodos": [],
            "comparacion_anterior": ""
        }

    new_session = BibliosMacroSession(
        usuario_id=current_user["sub"],
        target_type=req.target_type,
        target_id=req.target_id,
        coherence_score=data.get("coherence_score", 0),
        feedback_global=data.get("feedback_global", ""),
        feedback_nodos=json.dumps(data.get("feedback_nodos", [])),
        comparacion_anterior=data.get("comparacion_anterior", "")
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)

    return new_session
