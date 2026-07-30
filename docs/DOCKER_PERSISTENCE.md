# Docker Persistence Guide

Este guia explica como configurar e usar persistência nos containers Docker do Bolt.diy.

## 📋 Visão Geral

O `docker-compose.yaml` foi configurado com **3 volumes nomeados** para persistência automática:

| Volume | Localização Padrão | Propósito |
| -------- | ------------------- | ---------- |
| `bolt-data` | `.docker/data` | Config Wrangler e dados da aplicação |
| `bolt-cache` | `.docker/cache` | Cache de build |
| `bolt-npm-cache` | `.docker/npm-cache` | Cache de pacotes NPM |

## 🚀 Início Rápido

### Windows (PowerShell)

```powershell
# Desenvolvimento
.\scripts\docker-setup.ps1 -Profile development

# Produção
.\scripts\docker-setup.ps1 -Profile production

# Prebuilt
.\scripts\docker-setup.ps1 -Profile prebuilt
```

### Linux/macOS (Bash)

```bash
# Desenvolvimento
./scripts/docker-setup.sh development

# Produção
./scripts/docker-setup.sh production

# Prebuilt
./scripts/docker-setup.sh prebuilt
```

## ⚙️ Configuração Manual

Se preferir iniciar manualmente:

```bash
# Criar diretórios
mkdir -p .docker/{data,cache,npm-cache}

# Iniciar (desenvolvimento)
docker-compose --profile development up -d --build

# Iniciar (produção)
docker-compose --profile production up -d --build

# Iniciar (prebuilt)
docker-compose --profile prebuilt up -d
```

## 🔧 Variáveis de Ambiente

No arquivo `.env.docker`, você pode customizar os caminhos dos volumes:

```env
# Caminhos relativos (padrão)
BOLT_DATA_PATH=./.docker/data
BOLT_CACHE_PATH=./.docker/cache
BOLT_NPM_CACHE_PATH=./.docker/npm-cache

# Caminhos absolutos (produção em servidor)
# BOLT_DATA_PATH=/data/bolt/data
# BOLT_CACHE_PATH=/data/bolt/cache
# BOLT_NPM_CACHE_PATH=/data/bolt/npm-cache
```

## 📊 Monitoramento e Gerenciamento

### Ver logs em tempo real

```bash
docker-compose logs -f
```

### Ver status dos containers

```bash
docker-compose ps
```

### Parar serviços (mantém volumes)

```bash
docker-compose down
```

### Parar e remover volumes (cuidado!)

```bash
docker-compose down -v
```

### Reconstruir sem cache

```bash
docker-compose build --no-cache
```

## 💾 Conteúdo dos Volumes

### `bolt-data` (.docker/data)

- Configuração do Wrangler (`.wrangler/`)
- Dados da aplicação
- Logs persistentes

### `bolt-cache` (.docker/cache)

- Cache de build do Remix/Vite
- Otimiza rebuilds subsequentes

### `bolt-npm-cache` (.docker/npm-cache)

- Cache de pacotes NPM
- Acelera instalações de dependências

## 🔒 Segurança

⚠️ **Importante**: Diretórios de dados persistentes podem conter dados sensíveis

- Não commite `.docker/` no git (já está em `.gitignore`)
- Em produção, use volumes Docker nomeados em vez de bind mounts
- Implemente permissões de arquivo apropriadas

## 🚨 Troubleshooting

### "Permission denied" ao iniciar

```bash
# Linux/macOS: Ajuste permissões
sudo chown -R $(id -u):$(id -g) .docker
```

### Volumes não estão persistindo

```bash
# Verifique se os volumes existem
docker volume ls | grep bolt

# Inspecione um volume
docker volume inspect bolt-data
```

### Limpeza completa

```bash
# Remove containers e volumes (IRREVERSÍVEL!)
docker-compose down -v --remove-orphans

# Remove imagens também
docker-compose down -v --remove-orphans --rmi all
```

## 📈 Performance em Produção

Para deployments em produção:

1. **Use volumes Docker nomeados** em vez de bind mounts
2. **Configure backup** dos dados em `.docker/data`
3. **Implemente monitoramento** de espaço em disco
4. **Rotação de logs** para evitar crescimento infinito

### Exemplo para Produção

```yaml
volumes:
  bolt-data:
    driver: local
    # Sem bind mount - Docker gerencia o storage
  bolt-cache:
    driver: local
  bolt-npm-cache:
    driver: local
```

## 🔄 Atualizações e Migrações

### Backup antes de atualizar

```bash
# Copiar dados persistentes
cp -r .docker/data .docker/data.backup
```

### Restaurar dados

```bash
# Em caso de problemas
rm -rf .docker/data
cp -r .docker/data.backup .docker/data
docker-compose restart
```

## 📚 Recursos Adicionais

- [Docker Volumes Documentation](https://docs.docker.com/storage/volumes/)
- [Docker Compose Services](https://docs.docker.com/compose/compose-file/03-compose-file-services/)
- [Healthchecks](https://docs.docker.com/compose/compose-file/05-compose-file-healthchecks/)
