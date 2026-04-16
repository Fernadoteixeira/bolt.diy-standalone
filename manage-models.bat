@echo off
REM ======================================
REM Gerenciar Modelos Ollama - Docker + Local
REM ======================================

echo.
echo ======================================
echo  Gerenciador de Modelos Ollama
echo  Docker + Local
echo ======================================
echo.

echo Escolha uma opcao:
echo.
echo [1] Ver modelos instalados (Docker)
echo [2] Ver modelos instalados (Local)
echo [3] Instalar Gemma4 no Docker
echo [4] Instalar modelo no Local
echo [5] Remover modelo
echo [6] Testar conexao Docker
echo [7] Testar conexao Local
echo [0] Sair
echo.
set /p opcao="Digite sua opcao: "

if "%opcao%"=="1" goto ver_docker
if "%opcao%"=="2" goto ver_local
if "%opcao%"=="3" goto instalar_gemma4
if "%opcao%"=="4" goto instalar_local
if "%opcao%"=="5" goto remover_modelo
if "%opcao%"=="6" goto testar_docker
if "%opcao%"=="7" goto testar_local
if "%opcao%"=="0" goto fim
goto menu

:ver_docker
echo.
echo ======================================
echo  Modelos no Ollama (Docker)
echo ======================================
docker exec -it bolt-ollama ollama list
echo.
pause
goto menu

:ver_local
echo.
echo ======================================
echo  Modelos no Ollama (Local)
echo ======================================
ollama list
echo.
pause
goto menu

:instalar_gemma4
echo.
echo ======================================
echo  Instalando Gemma4 no Docker...
echo  (Isso pode demorar dependendo da internet)
echo ======================================
echo.
docker exec -it bolt-ollama ollama pull gemma4:1163f19dcd9
echo.
if %ERRORLEVEL% EQU 0 (
    echo ✅ Gemma4 instalado com sucesso!
) else (
    echo ⚠️  Erro ao instalar Gemma4
)
echo.
pause
goto menu

:instalar_local
set /p modelo="Digite o nome do modelo (ex: llama3.2:3b): "
echo.
echo ======================================
echo  Instalando %modelo% no Local...
echo ======================================
echo.
ollama pull %modelo%
echo.
if %ERRORLEVEL% EQU 0 (
    echo ✅ Modelo instalado com sucesso!
) else (
    echo ⚠️  Erro ao instalar modelo
)
echo.
pause
goto menu

:remover_modelo
set /p modelo="Digite o nome do modelo para remover: "
echo.
echo ======================================
echo  Removendo %modelo%...
echo ======================================
echo.
ollama rm %modelo%
echo.
if %ERRORLEVEL% EQU 0 (
    echo ✅ Modelo removido com sucesso!
) else (
    echo ⚠️  Erro ao remover modelo
)
echo.
pause
goto menu

:testar_docker
echo.
echo ======================================
echo  Testando conexao com Ollama (Docker)
echo ======================================
echo.
docker exec -it bolt-ollama ollama list
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Conexao com Docker Ollama bem-sucedida!
) else (
    echo.
    echo ⚠️  Erro na conexao com Docker Ollama
    echo Verifique se o container esta rodando:
    echo   docker ps ^| findstr ollama
)
echo.
pause
goto menu

:testar_local
echo.
echo ======================================
echo  Testando conexao com Ollama (Local)
echo ======================================
echo.
ollama list
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Conexao com Local Ollama bem-sucedida!
) else (
    echo.
    echo ⚠️  Erro na conexao com Local Ollama
    echo Verifique se Ollama esta rodando:
    echo   ollama serve
)
echo.
pause
goto menu

:menu
cls
goto inicio

:fim
echo.
echo ======================================
echo  Obrigado!
echo ======================================
