"""
Mathós — Seed de materias y temarios para UNED Matemáticas.

Inserta temas en las materias que existen pero están vacías.
Las materias ya están creadas en la BD; este script solo agrega los temas faltantes.

Ejecutar:
    cd backend/api
    python seed_temarios.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from models import Dominio, Tema
from shared.database import async_session_factory, init_db
from sqlalchemy import select, func


MATERIAS_TEMARIOS = [
    # ── Geometría Euclidiana (código 6102211-) ─────────────────────
    {
        "nombre": "Geometría Euclidiana",
        "temas": [
            {"orden": 1, "nombre": "Geometría Absoluta",
             "descripcion": "Los primeros 28 teoremas de Euclides prescindiendo del axioma de las paralelas. Geometría neutra o absoluta."},
            {"orden": 2, "nombre": "Geometría Euclidiana Plana",
             "descripcion": "Axioma de las paralelas de Euclides. Consecuencias: suma de ángulos del triángulo = 180°, teorema de Pitágoras generalizado."},
            {"orden": 3, "nombre": "Semejanza y Teorema de Tales",
             "descripcion": "Teorema de Tales, división áurea, semejanza de triángulos, criterios de semejanza y aplicaciones."},
            {"orden": 4, "nombre": "Inversión",
             "descripcion": "Definición y propiedades de la inversión, circunferencias ortogonales, aplicación a problemas clásicos."},
            {"orden": 5, "nombre": "Coordenadas Baricéntricas",
             "descripcion": "Sistema de coordenadas basado en masas, relación con áreas, aplicaciones a geometría del triángulo."},
            {"orden": 6, "nombre": "Geometría Proyectiva",
             "descripcion": "Puntos del infinito, dualidad, razón cruzada, teorema de Desargues y teorema de Pascal."},
            {"orden": 7, "nombre": "Cónicas",
             "descripcion": "Elipse, hipérbola y parábola como lugares geométricos. Propiedades focales y ecuación general."},
        ],
    },
    # ── Álgebra Lineal (código 6102212-) ──────────────────────────
    {
        "nombre": "Álgebra Lineal",
        "temas": [
            {"orden": 1, "nombre": "Sistemas de Ecuaciones Lineales",
             "descripcion": "Método de eliminación de Gauss, rango de una matriz, sistemas homogéneos, teorema de Rouché-Frobenius."},
            {"orden": 2, "nombre": "Matrices y Determinantes",
             "descripcion": "Álgebra de matrices, matriz inversa, determinantes: propiedades, regla de Cramer, matriz adjunta."},
            {"orden": 3, "nombre": "Espacios Vectoriales",
             "descripcion": "Definición y ejemplos, subespacios, combinación lineal, dependencia e independencia lineal, base y dimensión."},
            {"orden": 4, "nombre": "Aplicaciones Lineales",
             "descripcion": "Definición, núcleo e imagen, teorema de la dimensión, matriz asociada, cambios de base."},
            {"orden": 5, "nombre": "Diagonalización",
             "descripcion": "Valores y vectores propios, polinomio característico, diagonalización de matrices, multiplicidad algebraica y geométrica."},
            {"orden": 6, "nombre": "Espacio Dual y Formas Bilineales",
             "descripcion": "Espacio dual, bases duales, formas bilineales, formas cuadráticas, signatura."},
            {"orden": 7, "nombre": "Espacios con Producto Escalar",
             "descripcion": "Producto escalar, norma, ortogonalidad, Gram-Schmidt, proyecciones, teorema espectral."},
        ],
    },
    # ── Análisis Matemático I (código 6102213-) ──────────────────
    {
        "nombre": "Análisis Matemático I",
        "temas": [
            {"orden": 1, "nombre": "Números Reales",
             "descripcion": "Construcción axiomática de los números reales, supremo e ínfimo, principio de inducción, valor absoluto."},
            {"orden": 2, "nombre": "Sucesiones de Números Reales",
             "descripcion": "Sucesiones convergentes, propiedades, sucesiones monótonas, sucesiones de Cauchy, teorema de Bolzano-Weierstrass."},
            {"orden": 3, "nombre": "Funciones Reales de Variable Real",
             "descripcion": "Límites, continuidad, teorema de Bolzano, teorema de Weierstrass, continuidad uniforme."},
            {"orden": 4, "nombre": "Derivación",
             "descripcion": "Definición de derivada, reglas de derivación, teorema de Rolle, teorema del valor medio, regla de L'Hôpital."},
            {"orden": 5, "nombre": "Series Numéricas",
             "descripcion": "Series convergentes, criterios de convergencia (comparación, cociente, raíz, Leibniz), series de potencias."},
            {"orden": 6, "nombre": "Integral de Riemann",
             "descripcion": "Sumas de Riemann, condiciones de integrabilidad, teorema fundamental del cálculo, teorema del valor medio integral."},
            {"orden": 7, "nombre": "Técnicas de Integración",
             "descripcion": "Integración por partes, cambio de variable, integración de funciones racionales, integrales impropias."},
        ],
    },
    # ── Estadística Descriptiva (código 6102214-) ─────────────────
    {
        "nombre": "Estadística Descriptiva",
        "temas": [
            {"orden": 1, "nombre": "Conceptos Básicos y Organización de Datos",
             "descripcion": "Población, muestra, variable. Tablas de frecuencias, representaciones gráficas (histograma, diagrama de barras, sectores)."},
            {"orden": 2, "nombre": "Medidas de Tendencia Central",
             "descripcion": "Media aritmética, mediana, moda, cuartiles, percentiles. Propiedades y comparación."},
            {"orden": 3, "nombre": "Medidas de Dispersión",
             "descripcion": "Rango, varianza, desviación típica, coeficiente de variación, rango intercuartílico."},
            {"orden": 4, "nombre": "Medidas de Forma y Asociación",
             "descripcion": "Asimetría, curtosis. Covarianza, coeficiente de correlación lineal de Pearson."},
            {"orden": 5, "nombre": "Regresión Lineal",
             "descripcion": "Recta de regresión por mínimos cuadrados, bondad del ajuste (R²), predicción."},
            {"orden": 6, "nombre": "Probabilidad Básica",
             "descripcion": "Espacio muestral, axiomas de probabilidad, probabilidad condicionada, teorema de Bayes, independencia."},
            {"orden": 7, "nombre": "Variables Aleatorias",
             "descripcion": "Variables discretas y continuas, función de probabilidad/densidad, función de distribución, esperanza y varianza."},
        ],
    },
    # ── Métodos Numéricos (código 6102215-) ──────────────────────
    {
        "nombre": "Métodos Numéricos",
        "temas": [
            {"orden": 1, "nombre": "Error y Aritmética de Precisión Finita",
             "descripcion": "Error absoluto y relativo, representación en coma flotante, cancelación catastrófica, condicionamiento y estabilidad."},
            {"orden": 2, "nombre": "Resolución de Ecuaciones No Lineales",
             "descripcion": "Método de bisección, método de Newton-Raphson, método de la secante, punto fijo, convergencia."},
            {"orden": 3, "nombre": "Interpolación Polinómica",
             "descripcion": "Polinomio de Lagrange, diferencias divididas de Newton, error de interpolación, fenómeno de Runge."},
            {"orden": 4, "nombre": "Diferenciación e Integración Numérica",
             "descripcion": "Fórmulas de diferencias finitas, regla del trapecio, Simpson, error de cuadratura."},
            {"orden": 5, "nombre": "Resolución de Sistemas Lineales",
             "descripcion": "Eliminación gaussiana con pivoteo, factorización LU, condicionamiento de matrices, métodos iterativos (Jacobi, Gauss-Seidel)."},
            {"orden": 6, "nombre": "Ecuaciones Diferenciales Ordinarias",
             "descripcion": "Método de Euler, Runge-Kutta de orden 2 y 4, error y estabilidad, problemas de valor inicial."},
            {"orden": 7, "nombre": "Aproximación de Funciones",
             "descripcion": "Aproximación por mínimos cuadrados, splines cúbicos, series de Fourier discretas."},
        ],
    },
    # ── Análisis Matemático II (código 6102216-) ─────────────────
    {
        "nombre": "Análisis Matemático II",
        "temas": [
            {"orden": 1, "nombre": "Topología en Rⁿ",
             "descripcion": "Norma, distancia, bolas abiertas y cerradas, conjuntos abiertos y cerrados, compactos, conexos en Rⁿ."},
            {"orden": 2, "nombre": "Límites y Continuidad en Varias Variables",
             "descripcion": "Límites direccionales y dobles, continuidad, teorema de Weierstrass para funciones de varias variables."},
            {"orden": 3, "nombre": "Diferenciación en Varias Variables",
             "descripcion": "Derivadas parciales, diferencial, matriz jacobiana, regla de la cadena, derivadas de orden superior."},
            {"orden": 4, "nombre": "Teoremas Clásicos del Cálculo Diferencial",
             "descripcion": "Teorema de la función implícita, teorema de la función inversa, multiplicadores de Lagrange."},
            {"orden": 5, "nombre": "Integración Múltiple",
             "descripcion": "Integrales dobles y triples, teorema de Fubini, cambio de variable, aplicaciones (área, volumen)."},
            {"orden": 6, "nombre": "Integrales de Línea y Superficie",
             "descripcion": "Curvas paramétricas, integral de línea, campos conservativos, integral de superficie."},
            {"orden": 7, "nombre": "Teoremas de Stokes, Gauss y Green",
             "descripcion": "Teorema de Green, teorema de la divergencia (Gauss), teorema de Stokes, aplicaciones físicas."},
        ],
    },
    # ── Estructuras Algebraicas (código 6102217-) ────────────────
    {
        "nombre": "Estructuras Algebraicas",
        "temas": [
            {"orden": 1, "nombre": "Grupos",
             "descripcion": "Definición de grupo, subgrupos, grupos cíclicos, teorema de Lagrange, subgrupos normales, grupos cociente."},
            {"orden": 2, "nombre": "Homomorfismos de Grupos",
             "descripcion": "Homomorfismos, núcleo e imagen, teoremas de isomorfía, grupo simétrico y teorema de Cayley."},
            {"orden": 3, "nombre": "Anillos",
             "descripcion": "Definición de anillo, subanillos, dominios de integridad, cuerpos, anillos de polinomios."},
            {"orden": 4, "nombre": "Ideales y Anillos Cociente",
             "descripcion": "Ideales, anillos cociente, teoremas de isomorfía para anillos, ideales primos y maximales."},
            {"orden": 5, "nombre": "Cuerpos y Extensiones",
             "descripcion": "Cuerpos, extensiones algebraicas y trascendentes, cuerpo de descomposición, cierre algebraico."},
            {"orden": 6, "nombre": "Teoría de Galois (Introducción)",
             "descripcion": "Grupo de Galois, correspondencia de Galois, resolución de ecuaciones por radicales."},
            {"orden": 7, "nombre": "Módulos y Álgebras",
             "descripcion": "Definición de módulo, submódulos, módulos sobre un DIP, álgebras, producto tensorial."},
        ],
    },
    # ── Ecuaciones Diferenciales (código 6102218-) ───────────────
    {
        "nombre": "Ecuaciones Diferenciales",
        "temas": [
            {"orden": 1, "nombre": "EDO de Primer Orden",
             "descripcion": "Variables separables, exactas, factor integrante, ecuaciones lineales, Bernoulli, existencia y unicidad (Picard)."},
            {"orden": 2, "nombre": "EDO de Orden Superior",
             "descripcion": "EDO lineales homogéneas y no homogéneas, coeficientes constantes, variación de parámetros, Wronskiano."},
            {"orden": 3, "nombre": "Transformada de Laplace",
             "descripcion": "Definición, propiedades, transformada inversa, aplicaciones a EDO, convolución."},
            {"orden": 4, "nombre": "Sistemas de EDO",
             "descripcion": "Sistemas lineales, matriz fundamental, exponencial de matrices, retratos de fase."},
            {"orden": 5, "nombre": "Análisis Cualitativo",
             "descripcion": "Puntos de equilibrio, estabilidad, linealización, teorema de Hartman-Grobman, ciclos límite."},
            {"orden": 6, "nombre": "Series de Potencias y Frobenius",
             "descripcion": "Soluciones en serie alrededor de puntos ordinarios y singulares regulares, ecuación de Legendre y Bessel."},
            {"orden": 7, "nombre": "EDP Elementales",
             "descripcion": "Ecuación de onda, calor y Laplace. Separación de variables, series de Fourier."},
        ],
    },
    # ── Variable Compleja (código 6102219-) ──────────────────────
    {
        "nombre": "Variable Compleja",
        "temas": [
            {"orden": 1, "nombre": "Números Complejos y Funciones",
             "descripcion": "Cuerpo de los complejos, forma polar, raíces, funciones elementales complejas, límites y continuidad."},
            {"orden": 2, "nombre": "Funciones Holomorfas",
             "descripcion": "Derivada compleja, ecuaciones de Cauchy-Riemann, funciones armónicas, exponencial y logaritmo complejo."},
            {"orden": 3, "nombre": "Integración Compleja",
             "descripcion": "Integral de línea compleja, teorema de Cauchy-Goursat, fórmula integral de Cauchy, aplicaciones."},
            {"orden": 4, "nombre": "Series de Potencias y Laurent",
             "descripcion": "Series de Taylor complejas, serie de Laurent, singularidades, clasificación de singularidades."},
            {"orden": 5, "nombre": "Teorema de los Residuos",
             "descripcion": "Cálculo de residuos, teorema de los residuos, aplicaciones a integrales reales impropias."},
            {"orden": 6, "nombre": "Transformaciones Conformes",
             "descripcion": "Aplicaciones conformes, transformación de Möbius, mapeo del semiplano al círculo."},
            {"orden": 7, "nombre": "Principio del Argumento y Aplicaciones",
             "descripcion": "Principio del argumento, teorema de Rouché, teorema de la aplicación abierta."},
        ],
    },
    # ── Topología (código 6102220-) ──────────────────────────────
    {
        "nombre": "Topología",
        "temas": [
            {"orden": 1, "nombre": "Espacios Topológicos",
             "descripcion": "Definición de topología, bases y subbases, topología inducida, topología producto y cociente."},
            {"orden": 2, "nombre": "Continuidad y Homeomorfismos",
             "descripcion": "Funciones continuas, homeomorfismos, propiedades topológicas, invariantes topológicos."},
            {"orden": 3, "nombre": "Conexión y Compacidad",
             "descripcion": "Espacios conexos, componentes conexas, conexión por caminos. Compacidad, teorema de Heine-Borel, Tíjonov."},
            {"orden": 4, "nombre": "Separación y Metrizabilidad",
             "descripcion": "Axiomas de separación (T₀ a T₄), lema de Urysohn, teorema de metrización de Urysohn."},
            {"orden": 5, "nombre": "Espacios Métricos Completos",
             "descripcion": "Sucesiones de Cauchy, completitud, teorema de Baire, aplicaciones (existencia de funciones continuas no derivables)."},
            {"orden": 6, "nombre": "Homotopía y Grupo Fundamental",
             "descripcion": "Homotopía de caminos, grupo fundamental, cálculo del grupo fundamental del círculo."},
            {"orden": 7, "nombre": "Recubridores",
             "descripcion": "Espacios recubridores, levantamiento de caminos, teorema de levantamiento de homotopía, aplicaciones."},
        ],
    },
    # ── Filosofía: Nietzsche ────────────────────────────────────
    {
        "nombre": "Filosofía: Nietzsche",
        "temas": [
            {"orden": 1, "nombre": "Vida y Obra de Nietzsche",
             "descripcion": "Contexto histórico, etapas de su pensamiento, obras principales, relación con Wagner y Schopenhauer."},
            {"orden": 2, "nombre": "La Muerte de Dios y el Nihilismo",
             "descripcion": "El anuncio del loco, consecuencias de la muerte de Dios, el nihilismo como destino histórico de Occidente."},
            {"orden": 3, "nombre": "Voluntad de Poder",
             "descripcion": "La voluntad de poder como principio ontológico, más allá del bien y del mal, crítica a la metafísica."},
            {"orden": 4, "nombre": "Superhombre y Eterno Retorno",
             "descripcion": "El Übermensch como sentido de la tierra, eterno retorno como prueba y afirmación de la vida."},
            {"orden": 5, "nombre": "Crítica de la Moral",
             "descripcion": "Genealogía de la moral, moral de señores vs moral de esclavos, resentimiento, mala conciencia, ideal ascético."},
            {"orden": 6, "nombre": "Apología de la Estética",
             "descripcion": "Lo apolíneo y lo dionisíaco, el arte como justificación de la existencia, crítica al racionalismo socrático."},
            {"orden": 7, "nombre": "Perspectivismo y Lenguaje",
             "descripcion": "Verdad como metáfora, crítica al lenguaje, el perspectivismo como superación de la verdad absoluta."},
        ],
    },
    # ── Filosofía: Marx ─────────────────────────────────────────
    {
        "nombre": "Filosofía: Marx",
        "temas": [
            {"orden": 1, "nombre": "Contexto Histórico e Intelectual",
             "descripcion": "Revolución Industrial, socialismo utópico, izquierda hegeliana, Feuerbach, juventud de Marx."},
            {"orden": 2, "nombre": "Materialismo Histórico",
             "descripcion": "Infraestructura y superestructura, modos de producción, fuerzas productivas y relaciones de producción."},
            {"orden": 3, "nombre": "Crítica de la Economía Política",
             "descripcion": "Mercancía, valor de uso y valor de cambio, plusvalía, acumulación de capital, crisis del capitalismo."},
            {"orden": 4, "nombre": "Alienación y Emancipación",
             "descripcion": "Trabajo enajenado, alienación religiosa y política, emancipación humana vs emancipación política."},
            {"orden": 5, "nombre": "Teoría del Estado y la Revolución",
             "descripcion": "Estado como instrumento de clase, dictadura del proletariado, extinción del Estado, Comuna de París."},
            {"orden": 6, "nombre": "Ideología y Conciencia de Clase",
             "descripcion": "Ideología alemana, falsa conciencia, lucha de clases, conciencia de clase, proletariado como clase universal."},
            {"orden": 7, "nombre": "Legado y Actualidad del Marxismo",
             "descripcion": "Marxismo occidental (Lukács, Gramsci, Althusser), Escuela de Frankfurt, vigencia del análisis marxista."},
        ],
    },
    # ── Oracle DBA 19c ──────────────────────────────────────────
    {
        "nombre": "Oracle Database Administrator 19c",
        "temas": [
            {"orden": 1, "nombre": "Arquitectura de Oracle Database 19c",
             "descripcion": "Instancia Oracle: SGA, PGA, procesos background. Estructura física y lógica: datafiles, tablespaces, segmentos."},
            {"orden": 2, "nombre": "SQL Avanzado",
             "descripcion": "Consultas complejas, funciones analíticas, MODEL clause, pivot/unpivot, expresiones regulares."},
            {"orden": 3, "nombre": "PL/SQL y Programación",
             "descripcion": "Bloques, cursores, excepciones, procedimientos, funciones, paquetes, triggers, colecciones."},
            {"orden": 4, "nombre": "Seguridad y Gestión de Usuarios",
             "descripcion": "Privilegios, roles, VPD, Fine-Grained Access Control, Data Redaction, auditoría unificada."},
            {"orden": 5, "nombre": "Backup y Recovery con RMAN",
             "descripcion": "Tipos de backup, recovery completo e incompleto, PITR, Flashback Technology, Data Pump."},
            {"orden": 6, "nombre": "Oracle Multitenant (CDB/PDB)",
             "descripcion": "Arquitectura multitenant, creación y gestión de PDBs, clonación, plug/unplug, backup en multitenant."},
            {"orden": 7, "nombre": "Performance Tuning",
             "descripcion": "AWR, ASH, ADDM, SQL Tuning Advisor, índices, particionado, estadísticas, SQL Plan Management."},
            {"orden": 8, "nombre": "RAC y Alta Disponibilidad",
             "descripcion": "Real Application Clusters, Data Guard, Active Data Guard, Oracle GoldenGate."},
            {"orden": 9, "nombre": "Automatic Storage Management (ASM)",
             "descripcion": "Grupos de discos ASM, redundancia, rebalanceo, compatibilidad con versiones."},
            {"orden": 10, "nombre": "Gestión de Red y Networking",
             "descripcion": "Listener, tnsnames.ora, sqlnet.ora, conexiones dedicadas vs compartidas, Oracle Connection Manager."},
            {"orden": 11, "nombre": "Migración y Actualización",
             "descripcion": "Autoupgrade, Full Transportable Export/Import, migración a Cloud (OCI), cross-platform migration."},
            {"orden": 12, "nombre": "Preparación para Certificación 1Z0-082 y 1Z0-083",
             "descripcion": "Temario oficial, simulacros, escenarios prácticos, laboratorios recomendados."},
        ],
    },
]


async def seed_temarios():
    """Inserta los temas faltantes en materias que ya existen pero están vacías."""
    print("🚀 Insertando temarios en materias existentes...\n")
    await init_db()

    async with async_session_factory() as session:
        for mat_data in MATERIAS_TEMARIOS:
            nombre_materia = mat_data["nombre"]

            # Buscar la materia por nombre
            result = await session.execute(
                select(Tema.__table__.c.materia_id)
                .select_from(Tema)
                .join(Tema.materia)
                .where(Tema.materia.has(nombre=nombre_materia))
                .limit(1)
            )
            tiene_temas = result.scalar_one_or_none() is not None

            if tiene_temas:
                print(f"  ⏭️  {nombre_materia} — ya tiene temas, se omite")
                continue

            # Buscar la materia
            from models import Materia
            mat_result = await session.execute(
                select(Materia).where(Materia.nombre == nombre_materia)
            )
            materia = mat_result.scalar_one_or_none()

            if not materia:
                print(f"  ❌  {nombre_materia} — materia no encontrada en BD")
                continue

            # Insertar temas
            for t_data in mat_data["temas"]:
                tema = Tema(
                    materia_id=materia.id,
                    nombre=t_data["nombre"],
                    orden=t_data["orden"],
                    descripcion=t_data["descripcion"],
                )
                session.add(tema)
                await session.flush()

                # Crear registro de dominio para cada tema
                dominio = Dominio(tema_id=tema.id)
                session.add(dominio)

            await session.flush()
            total = len(mat_data["temas"])
            print(f"  ✅ {nombre_materia} — {total} temas insertados")

        await session.commit()

    print("\n✅ Seed de temarios completado!")


if __name__ == "__main__":
    asyncio.run(seed_temarios())
