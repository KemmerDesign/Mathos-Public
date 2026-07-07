# Mathós — Contenido: Lenguajes de Programación (UNED)

**Código:** 6102210-
**Curso:** 2025/2026
**Titulación:** Grado en Matemáticas (2º curso, 2º semestre)
**Tipo:** Formación Básica
**Créditos:** 6 ECTS (150 horas)
**Departamento:** Informática y Automática (E.T.S. de Ingeniería Informática)
**Equipo docente:** Alfonso Urquía Moraleda (coord.), Carla Martín Villalba, Miguel Ángel Rubio González

## Evaluación
- **Examen presencial (50%):** 5 preguntas de desarrollo, 120 min, sin material
- **Trabajo práctico obligatorio (50%):** ejercicios de programación en C++
- **Foros:** participación voluntaria (hasta +1 punto si examen y trabajo aprobados)
- **Nota final:** mín(10, 0.5×notaExamen + 0.5×notaTrabajo + actividadForos)
- Para aprobar: nota ≥ 5 en examen Y ≥ 5 en trabajo

## Temario

### Tema 1: Fundamentos de Programación
- Evolución histórica de los lenguajes de programación
- Arquitectura de von Neumann y ejecución de programas
- Lenguajes de bajo nivel vs alto nivel
- Historia y aportaciones de: FORTRAN, ALGOL, LISP, COBOL, BASIC, Prolog, SIMULA 67, Pascal, C, Modula-2, Ada, Smalltalk, C++, Java, sh, awk, Perl, JavaScript, PHP, Python
- Programación estructurada
- Paradigmas: imperativo, funcional, lógico, orientado a objetos
- Implementación: interpretación pura, compilación, sistema híbrido
- Preprocesado
- **Práctica C++:** programa "Hola mundo!", flujos de salida, buffers, flujo estándar

### Tema 2: Variables y Tipos de Datos
- Variables: nombre, dirección, valor, tipo
- Declaración e inicialización
- Constantes (ligaduras estáticas y dinámicas)
- Bloques, ámbito y visibilidad
- Variables locales vs globales
- Tipos primitivos: entero, real, booleano, carácter
- Tipos definidos por el usuario
- Arrays: declaración, inicialización, almacenamiento en memoria
- Cadenas de caracteres (arrays vs string)
- Punteros: declaración, usos, errores típicos
- Memoria dinámica vs local/global
- **Práctica C++:** tipos básicos, límites numéricos, inicialización por defecto, enumerados, structs, arrays, std::string, std::vector, new/delete, ámbito y visibilidad

### Tema 3: Asignaciones y Expresiones
- Sentencia de asignación
- Expresiones: aritméticas, relacionales, booleanas, condicionales
- Operadores: unarios, binarios, ternarios; prefijo, infijo, sufijo
- Operadores combinados (+=, -=, etc.), incremento/decremento
- Precedencia y asociatividad
- Sistema de tipos
- Sobrecarga de operadores
- Conversiones explícitas e implícitas (coerciones)
- Verificación de tipos: estática vs dinámica
- Lenguajes fuertemente tipados
- **Práctica C++:** operadores aritméticos/lógicos, cortocircuito, math.h, punteros (*, &), std::complex, std::string, std::vector, iteradores, estructuras autorreferenciadas

### Tema 4: Control del Flujo del Programa
- Sentencias de selección: if, case/switch
- Problema del else ambiguo
- Sentencias break y continue
- Sentencias iterativas: for, while, do-while
- Excepciones: captura y tratamiento
- **Práctica C++:** if, switch, for, while, do-while, break, continue, try/catch, std::bad_alloc, flujo cin (estados, errores), ficheros de texto

### Tema 5: Subprogramas
- Definición de función: partes
- Invocación: parámetros formales y actuales
- Evaluación: paso por valor y por referencia
- Paso de parámetros en C y C++
- Ámbito y visibilidad en funciones
- Recursividad: lineal, de cola
- Funciones vs procedimientos
- **Práctica C++:** definición e invocación de funciones, ámbito, variables estáticas, return, excepciones en funciones, declaración vs definición, programas multi-archivo, espacios de nombres

### Tema 6: Estructuras de Datos
- Tipos Abstractos de Datos (TAD)
- Estructuras: lista, pila, cola, mapa, árbol
  - Características, utilidad, operaciones comunes
  - Implementación con arrays y con estructuras autorreferenciadas
- **Práctica C++:** STL (contenedores, algoritmos, iteradores), std::list, std::queue, std::stack, std::map

### Tema 7: Algoritmos
- Definición de algoritmo
- Paradigmas de diseño: fuerza bruta, divide y vencerás, programación dinámica, programación lineal, búsqueda y enumeración
- Descripción: pseudocódigo y diagrama de flujo
- Complejidad: notación O
- Algoritmos de ordenación: burbuja, inserción, mezcla
- **Práctica C++:** algoritmos STL (count, count_if, remove_copy, replace_copy, reverse, transform, sort, find_if), expresiones lambda

## Bibliografía básica
- Martín Villalba, C.; Urquía Moraleda, A.; Rubio González, M.Á. (2021). *Lenguajes de Programación* (2ª ed.). Editorial UNED. ISBN: 978-84-362-7691-6

## Bibliografía complementaria
- Schildt, H. (2003). *C++: The Complete Reference*. McGraw-Hill.
- Sebesta, R.W. (2009). *Concepts of Programming Languages*. Addison Wesley.
- Stroustrup, B. (2007). *The C++ Programming Language*. Pearson.
- Knuth, D.E. (2011). *The Art of Computer Programming* (3rd ed.). Addison-Wesley.
