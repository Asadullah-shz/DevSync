$directories = @(
    "apps/server/src/config",
    "apps/server/src/database",
    "apps/server/src/middleware",
    "apps/server/src/modules/auth",
    "apps/server/src/modules/users",
    "apps/server/src/modules/devices",
    "apps/server/src/modules/workspaces",
    "apps/server/src/modules/projects",
    "apps/server/src/modules/files",
    "apps/server/src/modules/sync",
    "apps/server/src/modules/versions",
    "apps/server/src/modules/snapshots",
    "apps/server/src/modules/conflicts",
    "apps/server/src/modules/backups",
    "apps/server/src/modules/audit",
    "apps/server/src/modules/health",
    "apps/server/src/storage",
    "apps/server/src/websocket",
    "apps/server/src/jobs",
    "apps/server/src/utils",
    "apps/desktop/src/main",
    "apps/desktop/src/renderer",
    "apps/desktop/src/preload",
    "apps/desktop/src/database",
    "apps/desktop/src/filesystem",
    "apps/desktop/src/device",
    "apps/desktop/src/sync",
    "apps/desktop/src/network",
    "apps/desktop/src/notifications",
    "apps/desktop/src/services",
    "packages/shared-types",
    "packages/sync-protocol",
    "packages/crypto",
    "packages/validation",
    "packages/logger",
    "infrastructure/docker",
    "infrastructure/nginx",
    "infrastructure/postgres",
    "infrastructure/redis",
    "infrastructure/backup",
    "docs/architecture",
    "docs/api",
    "docs/sync-protocol",
    "docs/device-identity",
    "docs/decisions",
    "scripts"
)

foreach ($dir in $directories) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$files = @(
    "apps/server/src/app.ts",
    "apps/server/package.json",
    "apps/desktop/package.json",
    "docker-compose.yml",
    "package.json",
    "README.md"
)

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        New-Item -ItemType File -Force -Path $file | Out-Null
    }
}
