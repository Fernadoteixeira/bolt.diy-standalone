@echo off
REM ======================================
REM Monitor de Status - Bolt.diy
REM ======================================

:loop
cls
echo.
echo ======================================
echo  Bolt.diy - Monitor de Status
echo  %DATE% %TIME%
echo ======================================
echo.

REM Docker Status
echo 🐳 Docker:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | findstr "ollama"
if %ERRORLEVEL% NEQ 0 (
    echo   ⚠️  Ollama nao esta rodando no Docker
)
echo.

REM Ollama Models (Docker)
echo 📦 Modelos no Docker Ollama:
docker exec -it bolt-ollama ollama list 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   ⚠️  Nao foi possivel conectar ao Ollama Docker
)
echo.

REM Ollama Models (Local)
echo 📦 Modelos no Ollama Local:
ollama list 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   ⚠️  Ollama Local nao esta disponivel
)
echo.

REM Processos Node
echo 💻 Processos Bolt.diy:
tasklist | findstr "node" | findstr "remix"
if %ERRORLEVEL% NEQ 0 (
    echo   ⚠️  Bolt.diy nao esta rodando
)
echo.

REM Portas em uso
echo 🌐 Portas em uso:
echo   - 5173 (Bolt.diy):
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo     ✅ Ouvindo
) else (
    echo     ⚠️  Nao ouvindo
)
echo   - 11434 (Ollama):
netstat -ano | findstr ":11434" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo     ✅ Ouvindo
) else (
    echo     ⚠️  Nao ouvindo
)
echo   - 5432 (PostgreSQL):
netstat -ano | findstr ":5432" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo     ✅ Ouvindo
) else (
    echo     ⚠️  Nao ouvindo
)
echo.

REM Logs recentes do Docker
echo 📋 Logs recentes do Ollama (ultimas 5 linhas):
docker logs --tail 5 bolt-ollama 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   ⚠️  Nao foi possivel obter logs
)
echo.

echo ======================================
echo  Atualizando em 5 segundos...
echo  Pressione Ctrl+C para sair
echo ======================================

timeout /t 5 /nobreak >nul
goto loop
