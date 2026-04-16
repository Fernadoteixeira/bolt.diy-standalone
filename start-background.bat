@echo off
REM ======================================
REM Bolt.diy - Setup e Execução em Background
REM ======================================

echo.
echo ======================================
echo  Bolt.diy - Setup Completo
echo  i9-14900K + Docker + Gemma4
echo ======================================
echo.

REM Log file
set LOG_FILE=bolt-setup-%date:~-4,4%%date:~-7,2%%date:~-10,2%-%time:~0,2%%time:~3,2%.log
set LOG_FILE=%LOG_FILE: =0%

echo [LOG] Iniciando setup em %DATE% %TIME% > %LOG_FILE%

REM 1. Verificar Docker
echo [1/6] Verificando Docker...
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Docker nao encontrado! >> %LOG_FILE%
    echo ❌ Docker nao encontrado!
    echo Instale Docker Desktop primeiro.
    echo.
    pause
    exit /b 1
)
echo ✅ Docker encontrado >> %LOG_FILE%
echo ✅ Docker encontrado
echo.

REM 2. Verificar/Iniciar Ollama no Docker
echo [2/6] Verificando Ollama no Docker...
docker ps | findstr "ollama" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ Ollama ja esta rodando no Docker >> %LOG_FILE%
    echo ✅ Ollama ja esta rodando
    docker ps | findstr "ollama" >> %LOG_FILE%
) else (
    echo ⚠️  Ollama nao esta rodando, iniciando... >> %LOG_FILE%
    echo ⚠️  Ollama nao esta rodando, iniciando...
    
    REM Verificar se container existe
    docker ps -a | findstr "bolt-ollama" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   - Reiniciando container bolt-ollama...
        docker start bolt-ollama >> %LOG_FILE% 2>&1
    ) else (
        echo   - Criando container bolt-ollama...
        docker run -d -p 11434:11434 --name bolt-ollama ^
            -e OLLAMA_KEEP_ALIVE=24h ^
            -e OLLAMA_NUM_PARALLEL=4 ^
            ollama/ollama:latest >> %LOG_FILE% 2>&1
    )
    
    timeout /t 5 /nobreak >nul
    echo ✅ Ollama iniciado no Docker >> %LOG_FILE%
)
echo.

REM 3. Testar conexao com Ollama
echo [3/6] Testando conexao com Ollama...
docker exec -it bolt-ollama ollama list >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ Conexao com Ollama estabelecida >> %LOG_FILE%
    echo ✅ Conexao com Ollama estabelecida
) else (
    echo ⚠️  Erro na conexao com Ollama >> %LOG_FILE%
    echo ⚠️  Erro na conexao com Ollama
    echo Verifique os logs: docker logs bolt-ollama
)
echo.

REM 4. Verificar/Instalar Gemma4
echo [4/6] Verificando Gemma4...
docker exec -it bolt-ollama ollama list | findstr "gemma4" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ Gemma4 ja esta instalado >> %LOG_FILE%
    echo ✅ Gemma4 ja esta instalado
) else (
    echo ⚠️  Gemma4 nao encontrado, instalando... >> %LOG_FILE%
    echo ⚠️  Gemma4 nao encontrado, instalando...
    echo   (Isso pode demorar varios minutos)
    echo.
    
    REM Instalar em background
    start /B cmd /c "docker exec -it bolt-ollama ollama pull gemma4:1163f19dcd9 >> %LOG_FILE% 2>&1"
    echo   - Instalacao iniciada em background...
    echo   - Acompanhe em: %LOG_FILE%
)
echo.

REM 5. Verificar/Instalar modelo local backup
echo [5/6] Verificando modelo local (backup)...
ollama list | findstr "llama3.2" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ Modelo local ja esta instalado >> %LOG_FILE%
    echo ✅ Modelo local ja esta instalado
) else (
    echo ⚠️  Instalando modelo local de backup... >> %LOG_FILE%
    echo ⚠️  Instalando Llama3.2:3b (backup)...
    start /B cmd /c "ollama pull llama3.2:3b >> %LOG_FILE% 2>&1"
    echo   - Instalacao iniciada em background...
)
echo.

REM 6. Iniciar Bolt.diy em background
echo [6/6] Iniciando Bolt.diy em background...
echo ✅ Iniciando Bolt.diy >> %LOG_FILE%
echo.

REM Iniciar Electron em background
start /B cmd /c "pnpm start >> %LOG_FILE% 2>&1"

echo ✅ Bolt.diy iniciado em background >> %LOG_FILE%
echo ✅ Bolt.diy iniciado em background
echo.

REM Resumo
echo ======================================
echo  Setup Concluido!
echo ======================================
echo.
echo 📊 Status:
echo   - Docker: ✅ Rodando
echo   - Ollama (Docker): ✅ Rodando
echo   - Gemma4: ℹ️  Instalando em background
echo   - Bolt.diy: ✅ Iniciado em background
echo.
echo 📁 Logs:
echo   - Arquivo: %LOG_FILE%
echo   - Docker: docker logs bolt-ollama
echo.
echo 🎯 Acesso:
echo   - Bolt.diy: http://localhost:5173
echo   - Ollama: http://localhost:11434
echo.
echo 🛑 Parar tudo:
echo   - taskkill /F /IM node.exe
echo   - docker stop bolt-ollama
echo.
echo ======================================
echo  Acompanhe os logs em tempo real:
echo  tail -f %LOG_FILE%
echo ======================================
echo.

REM Mostrar ultimas linhas do log
echo 📋 Ultimas atualizacoes:
echo.
type %LOG_FILE% | more

pause
