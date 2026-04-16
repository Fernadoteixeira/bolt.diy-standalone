@echo off
REM ======================================
REM Setup Gemma4 para Bolt.diy
REM ======================================

echo.
echo ======================================
echo  Bolt.diy - Setup Gemma4
echo  i9-14900K + 64GB RAM
echo ======================================
echo.

REM Verificar Ollama
echo [1/4] Verificando Ollama...
where ollama >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Ollama nao encontrado!
    echo.
    echo Instale com: winget install Ollama.Ollama
    echo ou acesse: https://ollama.com/download
    echo.
    pause
    exit /b 1
)
echo ✅ Ollama encontrado
echo.

REM Iniciar Ollama em background
echo [2/4] Iniciando Ollama...
start /B ollama serve
timeout /t 3 /nobreak >nul
echo ✅ Ollama iniciado
echo.

REM Instalar Gemma4
echo [3/4] Instalando Gemma4 (pode demorar)...
echo.
ollama pull gemma4:1163f19dcd9
echo.

if %ERRORLEVEL% EQU 0 (
    echo ✅ Gemma4 instalado com sucesso!
) else (
    echo ⚠️  Erro ao instalar Gemma4
    echo Verifique sua conexao com a internet
)
echo.

REM Mostrar modelos
echo [4/4] Modelos instalados:
echo.
ollama list
echo.

echo ======================================
echo  Configuracao concluida!
echo ======================================
echo.
echo  Modelo padrao: Gemma4
echo  Para iniciar o Bolt.diy: pnpm start
echo.
pause
