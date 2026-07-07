"""
Mathós — Seed de materia de ESP32.

Inserta la materia de Entrenamiento en ESP32.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from models import Dominio, Materia, Tema
from shared.database import async_session_factory, init_db
from sqlalchemy import select

MATERIA_ESP32 = {
    "nombre": "Programación y Electrónica con ESP32",
    "codigo_uned": "IOT-ESP32",
    "curso": 1,
    "semestre": 1,
    "categoria": "entrenamiento",
    "sandbox_tipo": "cpp",
    "descripcion": (
        "Entrenamiento intensivo en programación del microcontrolador ESP32. "
        "Combina conceptos de electrónica básica, circuitos, sensores, protocolos de comunicación, "
        "conectividad WiFi y programación en C/C++ (Arduino/ESP-IDF)."
    ),
    "temas": [
        {
            "orden": 1,
            "nombre": "Introducción al ESP32 y Electrónica Básica",
            "descripcion": "Conceptos de voltaje, corriente, resistencia, Ley de Ohm, uso de protoboard y arquitectura general del microcontrolador ESP32."
        },
        {
            "orden": 2,
            "nombre": "Entorno de Desarrollo y Primeros Pasos",
            "descripcion": "Configuración de Arduino IDE y PlatformIO. Estructura de un programa en C++ para microcontroladores y el clásico 'Blink'."
        },
        {
            "orden": 3,
            "nombre": "Entradas y Salidas Digitales (GPIO)",
            "descripcion": "Control de LEDs y lectura de botones. Resistencias Pull-up y Pull-down, y soluciones por software/hardware para el rebote (debounce)."
        },
        {
            "orden": 4,
            "nombre": "Señales Analógicas, ADC y PWM",
            "descripcion": "Conversor Analógico-Digital (ADC) para lectura de potenciómetros y sensores analógicos. Modulación por Ancho de Pulso (PWM) para motores y atenuación de luz."
        },
        {
            "orden": 5,
            "nombre": "Sensores y Actuadores de Nivel Medio",
            "descripcion": "Uso de sensores de movimiento (PIR), ultrasonido (HC-SR04), control de cargas de potencia con transistores (MOSFET) y relés."
        },
        {
            "orden": 6,
            "nombre": "Comunicación Serie (UART y Bluetooth)",
            "descripcion": "Comunicación asíncrona. Intercambio de datos entre el PC y el ESP32, comunicación con otros microcontroladores y Bluetooth Clásico/BLE."
        },
        {
            "orden": 7,
            "nombre": "Protocolo I2C: Pantallas y Sensores Complejos",
            "descripcion": "Teoría del bus I2C. Integración de pantallas OLED (SSD1306), displays LCD 16x2 y lectura de módulos inerciales (MPU6050) o climáticos (BME280)."
        },
        {
            "orden": 8,
            "nombre": "Protocolo SPI: Almacenamiento y Displays Rápidos",
            "descripcion": "Funcionamiento del bus SPI de alta velocidad. Interfaz con tarjetas MicroSD para registro de datos (Datalogging) y pantallas TFT en color."
        },
        {
            "orden": 9,
            "nombre": "Conectividad WiFi y Redes Básicas",
            "descripcion": "Modos Station (STA) y Access Point (AP). Peticiones HTTP GET/POST (Cliente Web) y creación de un Servidor Web embebido para controlar el ESP32 desde un navegador."
        },
        {
            "orden": 10,
            "nombre": "Internet de las Cosas (IoT) y MQTT",
            "descripcion": "Arquitectura IoT. Protocolo MQTT: brokers, publicadores, suscriptores. Integración con plataformas como Node-RED, Home Assistant y Adafruit IO."
        },
        {
            "orden": 11,
            "nombre": "Eficiencia Energética y Sleep Modes",
            "descripcion": "Modos de ahorro de energía. Implementación de Deep Sleep, Timer Wakeup y despertar mediante interrupciones externas (pines RTC) para proyectos a batería."
        },
        {
            "orden": 12,
            "nombre": "Sistemas Operativos en Tiempo Real (FreeRTOS)",
            "descripcion": "Introducción a FreeRTOS nativo del ESP32. Creación de tareas, prioridades, colas de mensajes, semáforos, mutex y aprovechamiento del procesador de doble núcleo."
        }
    ]
}

async def seed_esp32():
    print("🚀 Insertando materia de ESP32...")
    await init_db()

    async with async_session_factory() as session:
        # Check if exists
        result = await session.execute(
            select(Materia).where(Materia.nombre == MATERIA_ESP32["nombre"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            print("⚠️  La materia ESP32 ya existe en la base de datos.")
            return

        temas_data = MATERIA_ESP32.pop("temas")
        materia = Materia(
            nombre=MATERIA_ESP32["nombre"],
            codigo_uned=MATERIA_ESP32.get("codigo_uned"),
            curso=MATERIA_ESP32["curso"],
            semestre=MATERIA_ESP32["semestre"],
            descripcion=MATERIA_ESP32.get("descripcion"),
            categoria=MATERIA_ESP32.get("categoria"),
            sandbox_tipo=MATERIA_ESP32.get("sandbox_tipo"),
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

        await session.commit()
        print(f"✅ Materia '{materia.nombre}' insertada exitosamente con {len(temas_data)} temas.")

if __name__ == "__main__":
    asyncio.run(seed_esp32())
