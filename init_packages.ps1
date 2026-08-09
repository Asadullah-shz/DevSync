$packages = @("shared-types", "sync-protocol", "crypto", "validation", "logger")
foreach ($pkg in $packages) {
    $pkgJson = @"
{
  "name": "@devsync/$pkg",
  "version": "1.0.0",
  "main": "index.ts",
  "dependencies": {}
}
"@
    Set-Content -Path "packages/$pkg/package.json" -Value $pkgJson
    Set-Content -Path "packages/$pkg/index.ts" -Value "// @devsync/$pkg`nexport {};"
}

$serverPkg = @"
{
  "name": "@devsync/server",
  "version": "1.0.0",
  "main": "src/app.ts",
  "scripts": {
    "dev": "ts-node src/app.ts"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pino": "^8.16.1",
    "@devsync/shared-types": "*",
    "@devsync/logger": "*"
  },
  "devDependencies": {
    "@types/express": "^4.17.20",
    "@types/cors": "^2.8.15",
    "ts-node": "^10.9.1"
  }
}
"@
Set-Content -Path "apps/server/package.json" -Value $serverPkg
Set-Content -Path "apps/server/src/app.ts" -Value "import express from 'express';`nconst app = express();`napp.get('/', (req, res) => res.send('DevSync Server'));`napp.listen(3000, () => console.log('Server running on port 3000'));"

$desktopPkg = @"
{
  "name": "@devsync/desktop",
  "version": "1.0.0",
  "main": "src/main/index.js",
  "scripts": {
    "dev": "vite src/renderer"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "electron": "^27.0.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.1.0"
  }
}
"@
Set-Content -Path "apps/desktop/package.json" -Value $desktopPkg
