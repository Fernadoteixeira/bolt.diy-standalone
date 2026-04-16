@echo off
REM ======================================
REM Setup Bolt.diy - Docker + Local
REM ======================================

echo.
echo ======================================
echo  Bolt.diy - Setup Multi-Model
echo  Docker (Gemma4) + Local (Backup)
echo ======================================
echo.

REM Verificar Docker
echo [1/5] Verificando Docker...
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Docker nao encontrado!
    echo.
    echo Instale Docker Desktop: https://docker.com/products/docker-desktop
    echo.
    pause
    exit /b 1
)
echo ✅ Docker encontrado
echo.

REM Verificar se container Ollama está rodando
echo [2/5] Verificando Ollama no Docker...
docker ps | findstr "ollama" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ Ollama rodando no Docker
    docker ps | findstr "ollama"
) else (
    echo ⚠️  Ollama nao esta rodando no Docker
    echo.
    echo Deseja iniciar o container Ollama? (S/N)
    set /p resposta=""
    if /i "%resposta%"=="S" (
        echo Iniciando Ollama no Docker...
        docker run -d -p 11434:11434 --name bolt-ollama ollama/ollama:latest
        timeout /t 5 /nobreak >nul
    ) else (
        echo ⚠️  Setup nao podera continuar sem Ollama
        pause
        exit /b 1
    )
)
echo.

REM Testar conexao com Ollama Docker
echo [3/5] Testando conexao com Ollama (Docker)...
ollama list >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ Conexao com Ollama estabelecida
    echo.
    echo Modelos disponiveis no Ollama:
    ollama list
) else (
    echo ⚠️  Nao foi possivel conectar ao Ollama
    echo Verifique se o container esta rodando
)
echo.

REM Instalar modelo local de backup
echo [4/5] Instalando modelo local de backup...
echo.
echo   - Instalando Llama3.2:3b (rapido, backup)...
ollama pull llama3.2:3b
echo.

REM Mostrar resumo
echo [5/5] Resumo da configuracao...
echo.
echo ======================================
echo  Configuracao Multi-Model:
echo ======================================
echo.
echo  🐳 Docker (Primario):
echo     - Ollama com Gemma4
echo     - URL: http://host.docker.internal:11434
echo.
echo  💻 Local (Backup):
echo     - Ollama com Llama3.2:3b
echo     - URL: http://127.0.0.1:11434
echo.
echo ======================================
echo  Modelos Disponiveis:
echo ======================================
ollama list
echo.
echo ======================================
echo  Setup Concluido!
echo ======================================
echo.
echo  Para iniciar o Bolt.diy:
echo  1. Verifique se Ollama (Docker) esta rodando
echo  2. Execute: pnpm start
echo  3. Selecione o modelo na UI
echo.
pause
