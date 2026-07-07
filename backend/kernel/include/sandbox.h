#ifndef MATHOS_SANDBOX_H
#define MATHOS_SANDBOX_H

#include <json/json.h>
#include <string>

struct CompileResult {
    bool        success;
    std::string stdout_str;
    std::string stderr_str;
    int         exit_code;
};

CompileResult compile_and_run(const std::string& code, int timeout_seconds = 10);

#endif // MATHOS_SANDBOX_H
