@echo off
REM ======================================
REM Bolt.diy - Otimizacao para i9-14900K
REM ======================================
REM Script de otimizacao automatica para CPU-only inference
REM

echo.
echo ======================================
echo  Bolt.diy - Otimizacao de Hardware
echo  Intel i9-14900K + 64GB RAM
echo ======================================
echo.

REM Verificar se Ollama esta instalado
echo [1/6] Verificando Ollama...
where ollama >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Ollama nao encontrado!
    echo.
    echo Instale com: winget install Ollama.Ollama
    echo.
    pause
    exit /b 1
)
echo ✅ Ollama encontrado
echo.

REM Criar arquivo .env.local
echo [2/6] Criando .env.local otimizado...
if not exist .env.local (
    copy .env.example .env.local >nul
    echo ✅ .env.local criado
) else (
    echo ℹ️  .env.local ja existe
)
echo.

REM Adicionar configuracoes otimizadas
echo [3/6] Adicionando configuracoes de otimizacao...

REM Backup do .env.local se já tiver configuracoes
findstr /C:"OLLAMA_NUM_PARALLEL" .env.local >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ℹ️  Configuracoes ja presentes
) else (
    echo.>> .env.local
    echo # ====================================== >> .env.local
    echo # CPU Optimization - i9-14900K >> .env.local
    echo # ====================================== >> .env.local
    echo OLLAMA_NUM_PARALLEL=4 >> .env.local
    echo OLLAMA_MAX_LOADED_MODELS=2 >> .env.local
    echo OLLAMA_KEEP_ALIVE=24h >> .env.local
    echo DEFAULT_NUM_CTX=16384 >> .env.local
    echo DEFAULT_LLM_PROVIDER=Ollama >> .env.local
    echo DEFAULT_LLM_MODEL=gemma2:9b >> .env.local
    echo VITE_LOG_LEVEL=info >> .env.local
    echo ✅ Configuracoes adicionadas
)
echo.

REM Instalar modelos recomendados
echo [4/6] Instalando modelos recomendados...
echo.

echo   - Instalando Gemma2 2B (ultra-rapido)...
ollama pull gemma2:2b
echo.

echo   - Instalando Gemma2 9B (recomendado)...
ollama pull gemma2:9b
echo.

echo   - Instalando Llama3.2 3B (rapido)...
ollama pull llama3.2:3b
echo.

echo   - Instalando CodeLlama 7B (codigo)...
ollama pull codellama:7b
echo.

echo ✅ Modelos instalados
echo.

REM Mostrar resumo
echo [5/6] Resumo da configuracao...
echo.
echo ======================================
echo  Modelos Instalados:
echo ======================================
ollama list
echo.

echo ======================================
echo  Configuracoes Aplicadas:
echo ======================================
echo  - OLLAMA_NUM_PARALLEL=4
echo  - OLLAMA_MAX_LOADED_MODELS=2
echo  - DEFAULT_LLM_MODEL=gemma2:9b
echo  - DEFAULT_NUM_CTX=16384
echo.

REM Iniciar Bolt.diy
echo [6/6] Iniciando Bolt.diy...
echo.
echo ℹ️  Pressione Ctrl+C para parar
echo.

pnpm start

echo.
echo ======================================
echo  Bolt.diy finalizado
echo ======================================
pause
