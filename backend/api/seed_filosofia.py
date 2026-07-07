"""Mathós — Seed de materias de Filosofía.

Añade Nietzsche y Marx como materias de estudio personal.
Inocuo si ya existen (comprueba por nombre antes de insertar).

Uso:
    python seed_filosofia.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import select, func
from models import Dominio, Materia, Tema
from shared.database import async_session_factory, init_db


FILOSOFIA = [
    {
        "nombre": "Friedrich Nietzsche",
        "codigo_uned": None,
        "curso": 1,
        "semestre": 1,
        "categoria": "filosofia",
        "sandbox_tipo": "none",
        "descripcion": (
            "Estudio de la filosofía de Friedrich Nietzsche (1844-1900) desde cero. "
            "Recorre su diagnóstico de la cultura occidental, la crítica a la moral cristiana, "
            "la voluntad de poder, el eterno retorno y el superhombre. "
            "Sin prerequisitos: se parte del contexto histórico y se avanza hacia sus obras más densas."
        ),
        "temas": [
            {
                "orden": 1,
                "nombre": "Vida y contexto histórico (1844-1900)",
                "descripcion": (
                    "Nietzsche en su época: Prusia bismarckiana, el auge del positivismo y la ciencia, "
                    "la crisis religiosa del siglo XIX. Infancia y formación: filología clásica en Leipzig. "
                    "La influencia decisiva de Schopenhauer y Wagner. "
                    "Cronología de obras y períodos (temprano / ilustrado / tardío)."
                ),
            },
            {
                "orden": 2,
                "nombre": "El pesimismo de Schopenhauer: herencia y primera ruptura",
                "descripcion": (
                    "La voluntad ciega y sufriente de Schopenhauer como punto de partida. "
                    "Por qué Nietzsche lo admira y por qué lo supera. "
                    "El budismo y la negación de la vida como horizonte que Nietzsche rechazará. "
                    "Schopenhauer como educador (Consideraciones Intempestivas III)."
                ),
            },
            {
                "orden": 3,
                "nombre": "Apolo y Dioniso: El nacimiento de la tragedia (1872)",
                "descripcion": (
                    "La dualidad fundamental: Apolo (orden, razón, imagen) vs. Dioniso (caos, música, éxtasis). "
                    "La tragedia griega como síntesis saludable de ambos impulsos. "
                    "La muerte de la tragedia con Sócrates y el optimismo socrático. "
                    "Por qué el arte es más verdadero que la ciencia para el Nietzsche temprano."
                ),
            },
            {
                "orden": 4,
                "nombre": "La crítica a la cultura: Las Consideraciones Intempestivas",
                "descripcion": (
                    "Los cuatro ataques: al historicismo (Strauss), a la historia como enfermedad, "
                    "a la cultura alemana como farsa, al positivismo científico. "
                    "El concepto de 'intempestivo' (unzeitgemäß): actuar contra el propio tiempo. "
                    "La historia monumental, anticuaria y crítica."
                ),
            },
            {
                "orden": 5,
                "nombre": "El nihilismo: diagnóstico de Occidente",
                "descripcion": (
                    "¿Qué es el nihilismo? La devaluación de los valores supremos. "
                    "Nihilismo pasivo (decadencia, renuncia) vs. nihilismo activo (destrucción creadora). "
                    "Por qué Europa camina hacia el nihilismo según Nietzsche. "
                    "La Ciencia Jovial §125: el hombre loco y el anuncio de la muerte de Dios."
                ),
            },
            {
                "orden": 6,
                "nombre": "La muerte de Dios y sus consecuencias",
                "descripcion": (
                    "No es una afirmación atea banal: es un diagnóstico cultural. "
                    "Dios como garante de valores, verdad y sentido: ¿qué ocurre cuando ese garante cae? "
                    "El horizonte borrado y el peligro del vacío moral. "
                    "La tarea: crear nuevos valores frente al abismo."
                ),
            },
            {
                "orden": 7,
                "nombre": "La genealogía de la moral (1887): el método genealógico",
                "descripcion": (
                    "¿De dónde vienen nuestros valores morales? El método histórico-crítico. "
                    "Primer ensayo: 'bueno/malo' (aristocrático) vs. 'bueno/malvado' (esclavo). "
                    "La rebelión esclava en la moral: el resentimiento como motor. "
                    "El sacerdote ascético como tipo psicológico."
                ),
            },
            {
                "orden": 8,
                "nombre": "Moral de señores vs. moral de esclavos",
                "descripcion": (
                    "Los dos tipos morales fundamentales. "
                    "Moral noble: afirmación, espontaneidad, creación de valores desde la fuerza. "
                    "Moral del rebaño: negación reactiva, resentimiento, inversión de valores. "
                    "La culpa, la mala conciencia y los ideales ascéticos (segundo y tercer ensayo). "
                    "¿Es esta distinción una prescripción o un diagnóstico?"
                ),
            },
            {
                "orden": 9,
                "nombre": "La voluntad de poder",
                "descripcion": (
                    "No es voluntad de dominar a otros: es impulso de autoafirmación y superación. "
                    "La voluntad de poder como principio cosmológico y psicológico. "
                    "Crítica a Schopenhauer: la voluntad no busca el reposo sino el ejercicio. "
                    "Voluntad de poder en el arte, el conocimiento y la política. "
                    "El libro póstumo 'La voluntad de poder' y su problemática edición."
                ),
            },
            {
                "orden": 10,
                "nombre": "La transvaloración de todos los valores",
                "descripcion": (
                    "El proyecto central del Nietzsche maduro: invertir la inversión de valores. "
                    "No se trata de cambiar de valores sino de cambiar el principio desde el que se valora. "
                    "De los valores reactivos (resentimiento) a los valores activos (afirmación). "
                    "El Anticristo (1888): la crítica más radical al cristianismo."
                ),
            },
            {
                "orden": 11,
                "nombre": "El eterno retorno de lo idéntico",
                "descripcion": (
                    "La idea más abismal de Nietzsche: todo lo que ha ocurrido ocurrirá infinitamente. "
                    "¿Cosmología o experimento mental ético? Debate entre intérpretes. "
                    "Su función: el amor fati como respuesta (amor al destino). "
                    "La Ciencia Jovial §341: el demonio y el mayor peso. "
                    "El eterno retorno como criba: ¿puedes querer que esto se repita?"
                ),
            },
            {
                "orden": 12,
                "nombre": "El Übermensch (superhombre)",
                "descripcion": (
                    "El superhombre NO es una raza superior: es un ideal filosófico de superación. "
                    "El superhombre como el que crea valores más allá del bien y del mal heredado. "
                    "Las tres metamorfosis del espíritu: camello (obediencia), león (negación), niño (creación). "
                    "El último hombre como antítesis del superhombre. "
                    "Distancias con el darwinismo y el nacionalismo alemán."
                ),
            },
            {
                "orden": 13,
                "nombre": "Así habló Zaratustra (1883-1885): lectura guiada",
                "descripcion": (
                    "El libro más importante y más críptico de Nietzsche. "
                    "Estructura y forma: por qué eligió la parábola y la poesía. "
                    "Zaratustra como portavoz, no alter ego. "
                    "Textos clave: 'Las tres metamorfosis', 'La canción del noche', 'El convaleciente'. "
                    "El problema del eterno retorno en Zaratustra: por qué Zaratustra mismo lo teme."
                ),
            },
            {
                "orden": 14,
                "nombre": "Más allá del bien y del mal (1886) y el perspectivismo",
                "descripcion": (
                    "Crítica a la metafísica y a la filosofía dogmática. "
                    "El perspectivismo: no hay hechos, solo interpretaciones. "
                    "¿Es el perspectivismo autocontradictorio? Debate epistemológico. "
                    "Los 'prejuicios de los filósofos' y el ideal de objetividad. "
                    "El filósofo del futuro como legislador de valores."
                ),
            },
            {
                "orden": 15,
                "nombre": "Recepción e influencia: Heidegger, Foucault, Deleuze",
                "descripcion": (
                    "Cómo se leyó a Nietzsche: apropiaciones y malinterpretaciones (nazismo, elitismo). "
                    "Heidegger: Nietzsche como último metafísico (voluntad de poder = ser como voluntad). "
                    "Foucault: la genealogía como método histórico-crítico (Nietzsche, la genealogía, la historia). "
                    "Deleuze: Nietzsche contra la dialéctica hegeliana, la diferencia afirmativa. "
                    "Nietzsche hoy: relevancia para la crítica cultural y la ética contemporánea."
                ),
            },
        ],
    },
    {
        "nombre": "Karl Marx",
        "codigo_uned": None,
        "curso": 1,
        "semestre": 1,
        "categoria": "filosofia",
        "sandbox_tipo": "none",
        "descripcion": (
            "Estudio del pensamiento de Karl Marx (1818-1883) desde cero. "
            "Recorre la alienación, el materialismo histórico, la teoría del valor, "
            "El Capital y los debates sobre el marxismo del siglo XX. "
            "Sin prerequisitos: se parte del contexto hegeliano y se avanza hacia la economía política."
        ),
        "temas": [
            {
                "orden": 1,
                "nombre": "Vida y contexto histórico (1818-1883)",
                "descripcion": (
                    "Marx en su tiempo: la Revolución Industrial, el capitalismo temprano, las condiciones "
                    "obreras del siglo XIX. Nacimiento en Tréveris, estudios en Bonn y Berlín. "
                    "Los Jóvenes Hegelianos y el ambiente intelectual alemán. "
                    "Exilio en París, Bruselas y Londres: la experiencia directa del proletariado. "
                    "Colaboración con Engels: naturaleza y alcance."
                ),
            },
            {
                "orden": 2,
                "nombre": "Hegel y el idealismo: la herencia que Marx invertirá",
                "descripcion": (
                    "La dialéctica hegeliana: tesis-antítesis-síntesis (y por qué Hegel no la llamaba así). "
                    "El Espíritu Absoluto y la historia como su despliegue. "
                    "La Fenomenología del Espíritu: el amo y el esclavo como anticipo de la lucha de clases. "
                    "Por qué Marx dice que 'pone a Hegel de pie': del idealismo al materialismo. "
                    "Los Jóvenes Hegelianos: Strauss, Bauer, Feuerbach — y la crítica de Marx a Feuerbach."
                ),
            },
            {
                "orden": 3,
                "nombre": "Los Manuscritos de 1844: alienación y naturaleza humana",
                "descripcion": (
                    "El Marx más humanista: textos filosóficos que serán publicados póstumamente. "
                    "El concepto de Gattungswesen (ser genérico / ser de especie). "
                    "Las cuatro dimensiones de la alienación del trabajo: "
                    "del producto, del proceso, de la especie, del otro hombre. "
                    "La propiedad privada como resultado y causa de la alienación. "
                    "Debate: ¿ruptura o continuidad entre el Marx joven y el maduro?"
                ),
            },
            {
                "orden": 4,
                "nombre": "La ideología alemana: materialismo histórico",
                "descripcion": (
                    "Escrita con Engels en 1845-46, publicada en 1932. "
                    "La tesis central: 'No es la conciencia la que determina la vida, sino la vida la que determina la conciencia.' "
                    "Los modos de producción como base de la historia. "
                    "La ideología como 'falsa conciencia': reflejo invertido de las relaciones materiales. "
                    "Las Tesis sobre Feuerbach (1845): la undécima tesis — 'Los filósofos solo han interpretado el mundo...'"
                ),
            },
            {
                "orden": 5,
                "nombre": "El Manifiesto Comunista (1848): análisis completo",
                "descripcion": (
                    "Contexto: las revoluciones de 1848 en Europa. "
                    "La historia como historia de la lucha de clases: bourgeois y proletariado. "
                    "El capitalismo como fuerza revolucionaria que crea su propio sepulturero. "
                    "Las 10 medidas del Manifiesto y por qué Marx las consideró provisionales. "
                    "El comunismo como movimiento real, no como ideal utópico. "
                    "Lectura crítica: qué sigue vigente y qué no."
                ),
            },
            {
                "orden": 6,
                "nombre": "Teoría del valor: valor de uso y valor de cambio",
                "descripcion": (
                    "La mercancía como punto de partida de El Capital. "
                    "Valor de uso (utilidad concreta) vs. valor de cambio (relación de intercambio). "
                    "El valor como tiempo de trabajo socialmente necesario (TTSN). "
                    "El fetichismo de la mercancía: cómo las relaciones entre personas se convierten en relaciones entre cosas. "
                    "El dinero como forma general del valor: su origen lógico e histórico."
                ),
            },
            {
                "orden": 7,
                "nombre": "La plusvalía y la explotación",
                "descripcion": (
                    "El secreto del capital: ¿cómo se genera ganancia en el intercambio de equivalentes? "
                    "La fuerza de trabajo como mercancía especial: su valor vs. lo que produce. "
                    "Plusvalía absoluta (prolongar la jornada) y relativa (aumentar productividad). "
                    "La tasa de plusvalía como medida de la explotación: p' = p/v. "
                    "El capital constante (c) y el capital variable (v): la composición orgánica del capital."
                ),
            },
            {
                "orden": 8,
                "nombre": "El Capital, vol. I: estructura y conceptos clave",
                "descripcion": (
                    "La arquitectura del libro más importante de Marx. "
                    "Sección I: la mercancía y el dinero. "
                    "Sección II: la transformación del dinero en capital. "
                    "Sección III-V: la producción de plusvalía. "
                    "Sección VI-VII: el salario y la acumulación. "
                    "Sección VIII: la acumulación originaria y la expropiación histórica. "
                    "Cómo leer El Capital hoy: dificultades y estrategias de lectura."
                ),
            },
            {
                "orden": 9,
                "nombre": "Las clases sociales y la lucha de clases",
                "descripcion": (
                    "Marx no inventó la lucha de clases, pero la convirtió en motor de la historia. "
                    "¿Qué define a una clase? Relación con los medios de producción vs. conciencia de clase. "
                    "Burguesía, proletariado, pequeña burguesía, campesinado: las clases en el capitalismo. "
                    "La clase 'en sí' (posición objetiva) vs. clase 'para sí' (conciencia y organización). "
                    "El Dieciocho Brumario de Luis Bonaparte (1852): historia y clase como análisis concreto."
                ),
            },
            {
                "orden": 10,
                "nombre": "El Estado: instrumento de dominación de clase",
                "descripcion": (
                    "Contra el Estado liberal como árbitro neutral: el Estado como comité ejecutivo de la burguesía. "
                    "La Crítica a la Filosofía del Derecho de Hegel: el Estado como inversión de la sociedad civil. "
                    "La Comuna de París (1871): Marx ante el primer experimento de poder obrero. "
                    "El Estado y la revolución: ¿extinción gradual o ruptura violenta? "
                    "Debate con los anarquistas: Bakunin vs. Marx."
                ),
            },
            {
                "orden": 11,
                "nombre": "Base y superestructura: economía, política, cultura",
                "descripcion": (
                    "La metáfora arquitectónica: infraestructura económica y superestructura político-ideológica. "
                    "¿Determinismo mecánico o determinación 'en última instancia'? La carta de Engels sobre el determinismo. "
                    "La religión como 'opio del pueblo': análisis completo del párrafo. "
                    "Arte, derecho y filosofía como superestructuras: debate sobre autonomía relativa. "
                    "El problema de la 'falsa conciencia': ¿cómo los dominados interiorizan la ideología dominante?"
                ),
            },
            {
                "orden": 12,
                "nombre": "La acumulación del capital y las crisis",
                "descripcion": (
                    "La ley de la tendencia decreciente de la tasa de ganancia. "
                    "Las crisis capitalistas como contradicciones internas del sistema: sobreproducción, subconsumo. "
                    "La concentración y centralización del capital: de la competencia al monopolio. "
                    "El capital financiero y el crédito en la lógica de acumulación. "
                    "¿Predijo Marx el colapso inevitable del capitalismo? Lecturas y debates."
                ),
            },
            {
                "orden": 13,
                "nombre": "La revolución y la dictadura del proletariado",
                "descripcion": (
                    "¿Por qué la transformación socialista requiere revolución para Marx? "
                    "La dictadura del proletariado: qué significa exactamente (gobierno de la mayoría, no tiranía). "
                    "La diferencia entre socialismo (fase de transición) y comunismo (objetivo final). "
                    "La Crítica del Programa de Gotha (1875): el texto más explícito sobre el comunismo. "
                    "'De cada cual según su capacidad, a cada cual según su necesidad.'"
                ),
            },
            {
                "orden": 14,
                "nombre": "El comunismo como horizonte: la sociedad sin clases",
                "descripcion": (
                    "Marx casi no describe el comunismo: por qué evita el 'utopismo'. "
                    "La superación de la alienación: trabajo como autodesarrollo. "
                    "La extinción del Estado: condición y consecuencia. "
                    "El 'reino de la libertad' y el 'reino de la necesidad'. "
                    "Crítica a las utopías socialistas anteriores (Owen, Saint-Simon, Fourier). "
                    "¿Es el comunismo una promesa viable o un horizonte regulativo?"
                ),
            },
            {
                "orden": 15,
                "nombre": "Marxismos posteriores: Lenin, Gramsci, Althusser, Frankfurt",
                "descripcion": (
                    "El leninismo: el partido de vanguardia y el imperialismo como fase superior del capitalismo. "
                    "Gramsci: la hegemonía cultural y la guerra de posiciones — por qué la revolución tarda. "
                    "Althusser: el corte epistemológico entre Marx joven y maduro, los Aparatos Ideológicos del Estado. "
                    "La Escuela de Frankfurt (Horkheimer, Adorno, Marcuse): marxismo y teoría crítica. "
                    "Marx hoy: capitalismo financiero, precariado, ecosocialismo y los límites del planeta."
                ),
            },
        ],
    },
]


async def seed_filosofia():
    print("🚀 Añadiendo materias de filosofía...")
    await init_db()

    async with async_session_factory() as session:
        for mat_data in FILOSOFIA:
            # Comprobar si ya existe
            existing = await session.execute(
                select(Materia).where(Materia.nombre == mat_data["nombre"])
            )
            if existing.scalar_one_or_none():
                print(f"⚠️  '{mat_data['nombre']}' ya existe, omitiendo.")
                continue

            temas_data = mat_data.pop("temas")
            materia = Materia(
                nombre=mat_data["nombre"],
                codigo_uned=mat_data.get("codigo_uned"),
                curso=mat_data["curso"],
                semestre=mat_data["semestre"],
                descripcion=mat_data.get("descripcion"),
                categoria=mat_data.get("categoria", "filosofia"),
                sandbox_tipo=mat_data.get("sandbox_tipo", "none"),
            )
            session.add(materia)
            await session.flush()

            for t_data in temas_data:
                tema = Tema(
                    materia_id=materia.id,
                    nombre=t_data["nombre"],
                    orden=t_data["orden"],
                    descripcion=t_data["descripcion"],
                )
                session.add(tema)
                await session.flush()
                session.add(Dominio(tema_id=tema.id))

            print(f"✅ '{materia.nombre}' — {len(temas_data)} temas")

        await session.commit()
        print("\n🎉 Listo.")


if __name__ == "__main__":
    asyncio.run(seed_filosofia())
