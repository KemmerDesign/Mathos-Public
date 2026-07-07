"""Mathós — Seed script.

Inserts the two UNED subjects with their full temarios:

  - Lenguajes de Programación (6102210-) — 7 temas
  - Geometría Básica (61021105) — 13 temas

Usage:
    python seed.py
"""

import asyncio
import sys
from pathlib import Path

# Add api directory to path so we can import project modules
sys.path.insert(0, str(Path(__file__).resolve().parent))

from models import Dominio, Materia, Tema
from shared.database import async_session_factory, init_db


MATERIAS_DATA = [
    {
        "nombre": "Lenguajes de Programación",
        "codigo_uned": "6102210-",
        "curso": 2,
        "semestre": 2,
        "categoria": "carrera",
        "sandbox_tipo": "cpp",
        "descripcion": (
            "Estudio de los fundamentos de los lenguajes de programación: "
            "paradigmas, tipos de datos, control de flujo, subprogramas, "
            "estructuras de datos y algoritmos. Incluye programación práctica en C++."
        ),
        "temas": [
            {
                "orden": 1,
                "nombre": "Fundamentos de Programación",
                "descripcion": (
                    "Evolución histórica de los lenguajes de programación, "
                    "arquitectura de von Neumann, paradigmas de programación, "
                    "e implementación de lenguajes."
                ),
            },
            {
                "orden": 2,
                "nombre": "Variables y Tipos de Datos",
                "descripcion": (
                    "Variables, constantes, ámbito, tipos primitivos, arrays, "
                    "cadenas, punteros y memoria dinámica."
                ),
            },
            {
                "orden": 3,
                "nombre": "Asignaciones y Expresiones",
                "descripcion": (
                    "Sentencias de asignación, operadores, precedencia, sistema "
                    "de tipos, sobrecarga de operadores y conversiones."
                ),
            },
            {
                "orden": 4,
                "nombre": "Control del Flujo del Programa",
                "descripcion": (
                    "Sentencias de selección e iteración, break, continue, "
                    "y manejo de excepciones."
                ),
            },
            {
                "orden": 5,
                "nombre": "Subprogramas",
                "descripcion": (
                    "Definición e invocación de funciones, paso de parámetros, "
                    "ámbito, recursividad y procedimientos."
                ),
            },
            {
                "orden": 6,
                "nombre": "Estructuras de Datos",
                "descripcion": (
                    "Tipos Abstractos de Datos (TAD): lista, pila, cola, mapa, "
                    "árbol. Implementación con arrays y estructuras autorreferenciadas."
                ),
            },
            {
                "orden": 7,
                "nombre": "Algoritmos",
                "descripcion": (
                    "Paradigmas de diseño, pseudocódigo, complejidad O, "
                    "y algoritmos de ordenación clásicos."
                ),
            },
        ],
    },
    {
        "nombre": "Geometría Básica",
        "codigo_uned": "61021105",
        "curso": 1,
        "semestre": 2,
        "categoria": "carrera",
        "sandbox_tipo": "none",
        "descripcion": (
            "Geometría euclidiana axiomática: espacios métricos, isometrías, "
            "ángulos, teoremas de Tales y Pitágoras, semejanzas, circunferencias, "
            "geometría hiperbólica, polígonos, geometría del espacio y poliedros."
        ),
        "temas": [
            {
                "orden": 1,
                "nombre": "Espacios Métricos",
                "descripcion": (
                    "La geometría como medición. Definición de espacio métrico, "
                    "noción de distancia y sus propiedades."
                ),
            },
            {
                "orden": 2,
                "nombre": "Axiomas para la Geometría Euclidiana Plana",
                "descripcion": (
                    "Geometría axiomática: axiomas de la geometría plana, "
                    "primeras propiedades y el método axiomático en matemáticas."
                ),
            },
            {
                "orden": 3,
                "nombre": "Isometrías del Plano",
                "descripcion": (
                    "Transformaciones que conservan distancias: clasificación "
                    "en 5 tipos (identidad, reflexiones, traslaciones, rotaciones, "
                    "reflexiones con deslizamiento)."
                ),
            },
            {
                "orden": 4,
                "nombre": "Ángulos",
                "descripcion": (
                    "Definición y propiedades de los ángulos. Teorema: suma "
                    "de ángulos de un triángulo = 180°. Dependencia del axioma "
                    "de las paralelas."
                ),
            },
            {
                "orden": 5,
                "nombre": "El Teorema de Tales",
                "descripcion": (
                    "Uno de los teoremas más importantes de la geometría. "
                    "Fundamento de las razones trigonométricas y semejanza de triángulos."
                ),
            },
            {
                "orden": 6,
                "nombre": "El Teorema de Pitágoras",
                "descripcion": (
                    "Fórmulas fundamentales para triángulos. Introducción "
                    "a la geometría analítica plana."
                ),
            },
            {
                "orden": 7,
                "nombre": "Semejanzas",
                "descripcion": (
                    "Transformaciones que amplían o reducen figuras manteniendo "
                    "ángulos. Aplicaciones a teoremas clásicos sobre triángulos."
                ),
            },
            {
                "orden": 8,
                "nombre": "Circunferencias",
                "descripcion": (
                    "Una de las figuras más importantes de la geometría plana. "
                    "Definición de la inversión como nueva transformación."
                ),
            },
            {
                "orden": 9,
                "nombre": "Introducción a la Geometría Hiperbólica",
                "descripcion": (
                    "Geometría construida dentro de la euclidiana que verifica "
                    "todos los axiomas excepto el de las paralelas. Demostración "
                    "de independencia del axioma."
                ),
            },
            {
                "orden": 10,
                "nombre": "Polígonos. Construcciones con Regla y Compás",
                "descripcion": (
                    "Generalización de triángulos. Problema histórico de la "
                    "construcción de polígonos regulares con regla y compás."
                ),
            },
            {
                "orden": 11,
                "nombre": "Axiomas para la Geometría Euclidiana Espacial",
                "descripcion": (
                    "Modelo axiomático del espacio tridimensional. Introducción "
                    "a la geometría analítica del espacio."
                ),
            },
            {
                "orden": 12,
                "nombre": "Isometrías del Espacio",
                "descripcion": (
                    "Clasificación de isometrías en el espacio tridimensional "
                    "con sus características particulares."
                ),
            },
            {
                "orden": 13,
                "nombre": "Poliedros",
                "descripcion": (
                    "Las figuras más importantes del espacio. Poliedros regulares "
                    "(sólidos platónicos): belleza e importancia histórica."
                ),
            },
        ],
    },
    {
        "nombre": "Oracle Database Administrator 19c",
        "codigo_uned": None,
        "curso": 1,
        "semestre": 1,
        "categoria": "certificacion",
        "sandbox_tipo": "sql",
        "descripcion": (
            "Preparación para la certificación Oracle Database Administration I (1Z0-082) y II (1Z0-083). "
            "Cubre arquitectura Oracle, SQL avanzado, PL/SQL, seguridad, backup/recovery con RMAN, "
            "Oracle Multitenant (CDB/PDB), y performance tuning. "
            "Sandbox SQL con esquema HR de Oracle para práctica real."
        ),
        "temas": [
            {
                "orden": 1,
                "nombre": "Arquitectura de Oracle Database 19c",
                "descripcion": (
                    "Instancia Oracle: SGA (Buffer Cache, Shared Pool, Redo Log Buffer), PGA, "
                    "procesos background (DBWR, LGWR, CKPT, SMON, PMON). "
                    "Estructura física: datafiles, redo log files, control files, archive logs. "
                    "Estructura lógica: tablespaces, segmentos, extensiones, bloques de datos."
                ),
            },
            {
                "orden": 2,
                "nombre": "SQL: Consultas Básicas y Funciones",
                "descripcion": (
                    "SELECT, FROM, WHERE, ORDER BY, DISTINCT. "
                    "Operadores: BETWEEN, IN, LIKE, IS NULL, AND/OR/NOT. "
                    "Funciones de una fila: UPPER/LOWER, SUBSTR, INSTR, ROUND, TRUNC, TO_DATE, NVL, DECODE, CASE. "
                    "Tipos de datos Oracle: VARCHAR2, NUMBER, DATE, TIMESTAMP, CLOB, BLOB."
                ),
            },
            {
                "orden": 3,
                "nombre": "SQL: Joins y Subconsultas",
                "descripcion": (
                    "INNER JOIN, LEFT/RIGHT OUTER JOIN, FULL OUTER JOIN, CROSS JOIN, NATURAL JOIN, JOIN USING. "
                    "Subconsultas escalares, correlacionadas, en FROM (inline views). "
                    "Operadores de conjuntos: UNION, UNION ALL, INTERSECT, MINUS. "
                    "WITH clause (Common Table Expressions)."
                ),
            },
            {
                "orden": 4,
                "nombre": "SQL: Funciones de Grupo y Analíticas",
                "descripcion": (
                    "GROUP BY, HAVING, ROLLUP, CUBE, GROUPING SETS. "
                    "Funciones de agregación: COUNT, SUM, AVG, MAX, MIN, LISTAGG. "
                    "Funciones analíticas (window functions): RANK, DENSE_RANK, ROW_NUMBER, "
                    "LEAD, LAG, FIRST_VALUE, LAST_VALUE, PARTITION BY, ORDER BY en funciones analíticas."
                ),
            },
            {
                "orden": 5,
                "nombre": "DDL: Gestión de Objetos de Base de Datos",
                "descripcion": (
                    "CREATE/ALTER/DROP TABLE, TRUNCATE. "
                    "Constraints: PRIMARY KEY, FOREIGN KEY (ON DELETE CASCADE/SET NULL), UNIQUE, CHECK, NOT NULL. "
                    "Índices: B-Tree, Bitmap, basado en función, compuesto. "
                    "Vistas: CREATE VIEW, WITH CHECK OPTION, WITH READ ONLY. "
                    "Secuencias, sinónimos, vistas materializadas."
                ),
            },
            {
                "orden": 6,
                "nombre": "DML: Manipulación de Datos y Transacciones",
                "descripcion": (
                    "INSERT (simple, multi-table, INSERT AS SELECT), UPDATE, DELETE, MERGE (UPSERT). "
                    "Control de transacciones: COMMIT, ROLLBACK, SAVEPOINT. "
                    "Concurrencia: bloqueos (row locks, table locks), niveles de aislamiento. "
                    "Lecturas consistentes: undo segments, SCN (System Change Number)."
                ),
            },
            {
                "orden": 7,
                "nombre": "Gestión de Usuarios y Seguridad",
                "descripcion": (
                    "CREATE/ALTER/DROP USER, gestión de contraseñas, perfiles (CREATE PROFILE). "
                    "Privilegios del sistema: CREATE SESSION, CREATE TABLE, DBA, SYSDBA. "
                    "Privilegios de objeto: SELECT, INSERT, UPDATE, DELETE, EXECUTE. "
                    "GRANT, REVOKE, roles (CREATE ROLE, predefinidos: DBA, CONNECT, RESOURCE). "
                    "Virtual Private Database (VPD), auditoría, Oracle Vault."
                ),
            },
            {
                "orden": 8,
                "nombre": "Gestión de Almacenamiento y Tablespaces",
                "descripcion": (
                    "Tablespaces: SYSTEM, SYSAUX, USERS, TEMP, UNDO, permanente vs temporal. "
                    "Creación y gestión: CREATE TABLESPACE, ALTER TABLESPACE, DROP TABLESPACE. "
                    "Gestión de UNDO: UNDO_RETENTION, flashback, resolución de problemas ORA-01555. "
                    "Datafiles: agregar, redimensionar, renombrar. "
                    "Gestión automática de almacenamiento (ASM)."
                ),
            },
            {
                "orden": 9,
                "nombre": "Backup y Recovery con RMAN",
                "descripcion": (
                    "Recovery Manager (RMAN): conexión, catálogo, comandos básicos. "
                    "Tipos de backup: full, incremental diferencial/acumulativo. "
                    "Escenarios de recovery: complete, incompleto, point-in-time (PITR). "
                    "Flashback Technology: Flashback Query, Table, Database, Drop (Recycle Bin). "
                    "Data Pump (expdp/impdp), SQL*Loader."
                ),
            },
            {
                "orden": 10,
                "nombre": "Oracle Multitenant (CDB/PDB)",
                "descripcion": (
                    "Arquitectura multitenant: Container Database (CDB), Pluggable Databases (PDB). "
                    "CDB$ROOT, PDB$SEED, Application Container. "
                    "Operaciones PDB: CREATE, CLONE, PLUG/UNPLUG, OPEN/CLOSE. "
                    "Objetos comunes vs locales. Gestión de usuarios comunes y locales. "
                    "Backup/recovery en entornos multitenant."
                ),
            },
            {
                "orden": 11,
                "nombre": "Performance Tuning y Optimización",
                "descripcion": (
                    "Herramientas de diagnóstico: AWR (Automatic Workload Repository), "
                    "ASH (Active Session History), ADDM (Automatic Database Diagnostic Monitor). "
                    "Optimizer: Cost-Based Optimizer (CBO), estadísticas (DBMS_STATS), hints. "
                    "EXPLAIN PLAN, V$SQL, SQL Tuning Advisor. "
                    "Índices: estrategias, índices compuestos, índices de función. "
                    "Particionado de tablas: range, list, hash, composite."
                ),
            },
            {
                "orden": 12,
                "nombre": "PL/SQL: Programación en Oracle",
                "descripcion": (
                    "Estructura de bloques PL/SQL: DECLARE, BEGIN, EXCEPTION, END. "
                    "Variables, constantes, tipos (%TYPE, %ROWTYPE), registros, colecciones. "
                    "Cursores: implícitos, explícitos, REF CURSOR. "
                    "Manejo de excepciones: predefinidas (NO_DATA_FOUND, TOO_MANY_ROWS), definidas por el usuario. "
                    "Subprogramas: procedimientos almacenados, funciones, triggers (BEFORE/AFTER), paquetes. "
                    "Uso de DBMS_OUTPUT, UTL_FILE, DBMS_JOB/DBMS_SCHEDULER."
                ),
            },
        ],
    },
]


async def seed():
    """Create tables and insert seed data."""
    print("🚀 Inicializando base de datos...")
    await init_db()

    async with async_session_factory() as session:
        # Check if already seeded
        from sqlalchemy import select as sa_select, func

        count_result = await session.execute(sa_select(func.count()).select_from(Materia))
        existing_count = count_result.scalar()
        if existing_count > 0:
            print(f"⚠️  Ya existen {existing_count} materias. Omitiendo seed (usa --force para re-ejecutar).")
            return

        materias_creadas = []

        for mat_data in MATERIAS_DATA:
            temas_data = mat_data.pop("temas")
            materia = Materia(
                nombre=mat_data["nombre"],
                codigo_uned=mat_data.get("codigo_uned"),
                curso=mat_data["curso"],
                semestre=mat_data["semestre"],
                descripcion=mat_data.get("descripcion"),
                categoria=mat_data.get("categoria", "carrera"),
                sandbox_tipo=mat_data.get("sandbox_tipo", "cpp"),
            )
            session.add(materia)
            await session.flush()  # get materia.id

            for t_data in temas_data:
                tema = Tema(
                    materia_id=materia.id,
                    nombre=t_data["nombre"],
                    orden=t_data["orden"],
                    descripcion=t_data["descripcion"],
                )
                session.add(tema)
                await session.flush()

                # Crear registro de dominio inicial para cada tema
                dominio = Dominio(tema_id=tema.id)
                session.add(dominio)

            materias_creadas.append((materia.nombre, len(temas_data)))

        await session.commit()

        print("\n✅ Seed completado exitosamente!")
        print(f"\n📚 Materias insertadas ({len(materias_creadas)}):")
        for nombre, num_temas in materias_creadas:
            print(f"   • {nombre} — {num_temas} temas")


if __name__ == "__main__":
    asyncio.run(seed())
