#include "sandbox.h"

#include <algorithm>
#include <array>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <memory>
#include <regex>
#include <string>
#include <sys/resource.h>
#include <system_error>
#include <unistd.h>
#include <vector>

#include <sys/types.h>
#include <sys/wait.h>
#include <signal.h>
#include <fcntl.h>
// (nlohmann/json.hpp not needed — using Json::Value from jsoncpp)

namespace fs = std::filesystem;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Create a temporary file whose name is returned, or throw on failure. */
static std::string make_temp_name(const std::string& suffix) {
    std::string pattern = "/tmp/mathos_XXXXXX" + suffix;
    // mkstemp modifies the string in place, so we need a mutable buffer
    std::vector<char> buf(pattern.begin(), pattern.end());
    buf.push_back('\0');
    int fd = mkstemps(buf.data(), static_cast<int>(suffix.size()));
    if (fd == -1)
        throw std::system_error(errno, std::generic_category(), "mkstemps");
    std::string name(buf.data());
    close(fd);
    return name;
}

/** Read a pipe fd into a string (up to max_bytes). */
static std::string read_fd(int fd, size_t max_bytes = 1024 * 1024) {
    std::string out;
    char chunk[4096];
    ssize_t n;
    while ((n = read(fd, chunk, sizeof(chunk))) > 0 && out.size() < max_bytes) {
        out.append(chunk, static_cast<size_t>(n));
    }
    if (n < 0 && errno != EINTR) {
        // non-fatal read error, return what we have
    }
    return out;
}

/** Run a child process, capturing stdout and stderr.
 *  Returns {exit_code, stdout, stderr}. timeout=0 means no timeout.
 */
struct ExecResult {
    int         exit_code;
    std::string stdout_str;
    std::string stderr_str;
};

static ExecResult exec_captured(const std::vector<std::string>& args,
                                 int timeout_seconds) {
    // pipes: [0] = read end, [1] = write end
    int out_pipe[2], err_pipe[2];
    if (pipe(out_pipe) < 0 || pipe(err_pipe) < 0) {
        throw std::system_error(errno, std::generic_category(), "pipe");
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(out_pipe[0]); close(out_pipe[1]);
        close(err_pipe[0]); close(err_pipe[1]);
        throw std::system_error(errno, std::generic_category(), "fork");
    }

    if (pid == 0) {
        // ── child ──────────────────────────────────────────────────────────
        close(out_pipe[0]); // close read end
        close(err_pipe[0]);

        // redirect stdout
        dup2(out_pipe[1], STDOUT_FILENO);
        // redirect stderr
        dup2(err_pipe[1], STDERR_FILENO);

        close(out_pipe[1]);
        close(err_pipe[1]);

        // set process group so we can kill the whole group
        setpgid(0, 0);

        // apply resource limits for safety (solo para ejecucion, no compilacion)
        // NOTA: No usamos RLIMIT_NPROC (afecta por UID) ni RLIMIT_AS
        // (cc1plus necesita memoria). Los limites se aplicaran al binario ejecutado.
        // max 60 seconds CPU time (evita loops infinitos)
        struct rlimit rl;
        rl.rlim_cur = rl.rlim_max = 60;
        setrlimit(RLIMIT_CPU, &rl);

        // apply timeout via alarm
        if (timeout_seconds > 0) {
            alarm(static_cast<unsigned int>(timeout_seconds));
        }

        // build argv
        std::vector<const char*> argv;
        for (const auto& a : args) argv.push_back(a.c_str());
        argv.push_back(nullptr);

        execvp(argv[0], const_cast<char* const*>(argv.data()));
        // if we get here, exec failed
        _exit(127 + errno);
    }

    // ── parent ─────────────────────────────────────────────────────────────
    close(out_pipe[1]);
    close(err_pipe[1]);

    // read output concurrently (simple sequential read – fine for small I/O)
    std::string stdout_str = read_fd(out_pipe[0]);
    std::string stderr_str = read_fd(err_pipe[0]);
    close(out_pipe[0]);
    close(err_pipe[0]);

    // wait for child
    int wstatus;
    pid_t wpid;
    do {
        wpid = waitpid(pid, &wstatus, 0);
    } while (wpid < 0 && errno == EINTR);

    int exit_code = -1;
    if (WIFEXITED(wstatus)) {
        exit_code = WEXITSTATUS(wstatus);
    } else if (WIFSIGNALED(wstatus)) {
        exit_code = 128 + WTERMSIG(wstatus);
    }

    return {exit_code, stdout_str, stderr_str};
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

CompileResult compile_and_run(const std::string& code, int timeout_seconds) {
    CompileResult result{false, "", "", -1};

    // 1. create temporary files
    std::string src_path, bin_path;
    try {
        src_path = make_temp_name(".cpp");
        bin_path = make_temp_name(".out");
    } catch (const std::exception& e) {
        result.stderr_str = "failed to create temp files: " + std::string(e.what());
        return result;
    }

    // ensure cleanup on scope exit
    auto cleanup = [&]() {
        if (!src_path.empty()) {
            std::error_code ec;
            fs::remove(src_path, ec);
        }
        if (!bin_path.empty()) {
            std::error_code ec;
            fs::remove(bin_path, ec);
        }
    };

    // 2. write source file
    {
        std::ofstream ofs(src_path, std::ios::binary);
        if (!ofs) {
            cleanup();
            result.stderr_str = "failed to write source file: " + src_path;
            return result;
        }
        ofs << code;
        ofs.close();
    }

    // 3. compile
    {
        std::vector<std::string> compiler_args = {
            "/usr/bin/g++",
            "-std=c++20",
            "-Wall",
            "-Wextra",
            "-O2",
            "-o", bin_path,
            src_path
        };
        // Use a generous timeout for compilation (2x the user timeout, min 30s)
        int compile_timeout = std::max(30, timeout_seconds * 2);
        auto comp = exec_captured(compiler_args, compile_timeout);

        if (comp.exit_code != 0) {
            cleanup();
            result.stderr_str = comp.stderr_str.empty()
                                    ? comp.stdout_str
                                    : comp.stderr_str;
            result.exit_code = comp.exit_code;
            // success = false already
            return result;
        }
    }

    // 4. run the binary
    {
        std::vector<std::string> run_args = {bin_path};
        auto run = exec_captured(run_args, timeout_seconds);

        result.stdout_str = run.stdout_str;
        result.stderr_str = run.stderr_str;
        result.exit_code  = run.exit_code;
    }

    // 5. cleanup
    cleanup();

    result.success = (result.exit_code == 0);
    return result;
}

// ---------------------------------------------------------------------------
// JSON serialisation (nlohmann)
// JSON serialisation removed — handled in main.cpp with Json::Value
// (sandbox.h no longer exports to_json)

