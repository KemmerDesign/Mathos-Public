cmake_minimum_required(VERSION 3.20)
project(mathos-kernel VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Drogon ───────────────────────────────────────────────────────────────────
# Buscar Drogon manualmente sin vcpkg
set(DROGON_INCLUDE_DIR "/usr/local/include")
set(DROGON_LIBRARY "/usr/local/lib/libdrogon.so")
set(TRANTOR_INCLUDE_DIR "/usr/local/include/trantor")
set(TRANTOR_LIBRARY "/usr/local/lib/libtrantor.so")

# ── Sources ──────────────────────────────────────────────────────────────────
set(HEADERS
    ${CMAKE_CURRENT_SOURCE_DIR}/include/sandbox.h
)

set(SOURCES
    src/main.cpp
    src/sandbox.cpp
)

add_executable(mathos-kernel ${SOURCES} ${HEADERS})
target_include_directories(mathos-kernel PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${DROGON_INCLUDE_DIR}
    ${TRANTOR_INCLUDE_DIR}
    /usr/include/jsoncpp
)
target_link_libraries(mathos-kernel PRIVATE
    ${DROGON_LIBRARY}
    ${TRANTOR_LIBRARY}
    pthread
    ssl
    crypto
    jsoncpp
    uuid
    z
)
# Forzar link de std::filesystem (GCC < 12)
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 12)
    target_link_libraries(mathos-kernel PRIVATE stdc++fs)
endif()

# ── Install ──────────────────────────────────────────────────────────────────
install(TARGETS mathos-kernel RUNTIME DESTINATION bin)
