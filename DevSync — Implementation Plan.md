# DevSync — Implementation Plan
## 1. Project Overview

**DevSync** is a self-hosted development workspace synchronization, versioning, backup, and recovery platform.

It allows multiple developers to work on synchronized project folders while a central server maintains:

- Automatic synchronization
- Multi-device support
- Unique device identification
- File version history
- Project snapshots
- Deleted-file recovery
- Project recovery
- Conflict detection
- Backup and restore
- User and device management
- Full change attribution
- Audit history

The initial deployment target is an unused/old laptop acting as the private DevSync server.

---

# 2. Core Objective

The system must satisfy this workflow:

```text
Developer A
     │
     │ modifies project
     ▼
DevSync Desktop Client
     │
     │ Device ID: DEV-7F3A9C21
     ▼
DevSync Server
     │
     ├── Current Project State
     ├── Version History
     ├── Snapshots
     ├── Change Attribution
     └── Backup
     │
     ├───────────────┐
     ▼               ▼
Developer B      Developer C
     │               │
     │               │
Device B         Device C
     │               │
     └── automatic ──┘
          sync
```

Every important operation must answer:

```text
WHO?
     User ID

WHICH DEVICE?
     Device ID

WHAT?
     File / Operation

WHEN?
     Timestamp

WHICH VERSION?
     Version ID

WHICH PROJECT?
     Project ID
```

---

# 3. Core Product Principle

> **Work normally. DevSync automatically synchronizes, versions, protects, and makes every change recoverable.**

Developers should not need to manually:

- Upload files
- Download files
- Create backups
- Create snapshots
- Remember which device changed something
- Manually synchronize after every change

---

# 4. User / Device Identity Model

User identity and device identity are separate.

```text
User
│
├── Device A
│   └── DEV-7F3A9C21
│
├── Device B
│   └── DEV-91BD42E7
│
└── Device C
    └── DEV-C82A61F4
```

One user can have multiple devices.

Multiple users can work on the same project.

---

# 5. Unique Device ID

Every DevSync Desktop installation receives a unique permanent device identifier.

Example:

```text
Device ID:
DEV-7F3A9C21
```

Device information:

```text
Device ID:       DEV-7F3A9C21
Device Name:     Asadullah's Laptop
Owner:           Asadullah
Platform:        Windows
Platform Version: Windows 11
Hostname:        ASAD-PC
App Version:     1.0.0
Status:          ONLINE
```

The Device ID must:

- Be globally unique
- Be generated securely
- Remain stable across application restarts
- Remain stable across normal application updates
- Be associated with the authenticated user
- Be revocable by the user/admin
- Be recorded against synchronization operations

If the application is completely removed and reinstalled, the system should treat it as a new device unless a secure device-recovery mechanism is explicitly implemented.

---

# 6. Change Attribution

Every server-side mutation must be attributable to:

```text
User ID
Device ID
Operation ID
Project ID
File Path
Timestamp
Version ID
```

Example:

```text
Change
├── Change ID: CHG-84D921
├── Project: Payment Service
├── File: src/payment.service.ts
├── Operation: MODIFY
├── User: Developer A
├── User ID: USR-10291
├── Device: Asadullah's Laptop
├── Device ID: DEV-7F3A9C21
├── Version: VER-000043
└── Timestamp: 2026-08-09T15:42:00Z
```

---

# 7. History Example

The project history should show exactly who and which device produced each change.

```text
Payment Service — History

15:42  Developer A
       Asadullah's Laptop
       DEV-7F3A9C21
       Modified payment.service.ts
       Version 43

15:35  Developer B
       Office PC
       DEV-91BD42E7
       Added webhook.controller.ts
       Version 42

15:18  Developer C
       MacBook
       DEV-C82A61F4
       Modified transaction.model.ts
       Version 41
```

The UI should allow filtering by:

```text
User
Device
Date
Operation
File
Version
```

---

# 8. High-Level Architecture

```text
                         DEVICES

              ┌──────────────────────────┐
              │      Developer A         │
              │      Desktop Client      │
              │                          │
              │ DEV-7F3A9C21             │
              └────────────┬─────────────┘
                           │
              ┌────────────▼─────────────┐
              │      Developer B         │
              │      Desktop Client      │
              │                          │
              │ DEV-91BD42E7             │
              └────────────┬─────────────┘
                           │
              ┌────────────▼─────────────┐
              │      Developer C         │
              │      Desktop Client      │
              │                          │
              │ DEV-C82A61F4             │
              └────────────┬─────────────┘
                           │
                       LAN / HTTPS
                           │
                           ▼
              ┌──────────────────────────┐
              │     DevSync Server       │
              │                          │
              │ API                      │
              │ Authentication           │
              │ Device Management        │
              │ Sync Engine              │
              │ Version Engine            │
              │ Snapshot Engine           │
              │ WebSocket                │
              │ Audit Engine              │
              └────────────┬─────────────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
          PostgreSQL             Object Storage
          Metadata              Project Files
                                      │
                                      ▼
                               Backup Storage
```

---

# 9. Initial Technology Stack

## Desktop Client

- Electron
- React
- TypeScript
- Node.js
- SQLite
- Chokidar
- WebSocket client
- HTTP client
- Native OS notifications

## Server

- Node.js
- TypeScript
- Fastify or Express
- PostgreSQL
- Redis
- WebSocket
- Filesystem-based object storage initially

## Infrastructure

- Docker
- Docker Compose
- Nginx
- Linux on old laptop

## Testing

- Vitest/Jest
- Supertest
- Playwright
- Integration tests
- Filesystem synchronization tests

---

# 10. Repository Structure

```text
devsync/
│
├── apps/
│   │
│   ├── server/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── database/
│   │   │   ├── middleware/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── devices/
│   │   │   │   ├── workspaces/
│   │   │   │   ├── projects/
│   │   │   │   ├── files/
│   │   │   │   ├── sync/
│   │   │   │   ├── versions/
│   │   │   │   ├── snapshots/
│   │   │   │   ├── conflicts/
│   │   │   │   ├── backups/
│   │   │   │   ├── audit/
│   │   │   │   └── health/
│   │   │   ├── storage/
│   │   │   ├── websocket/
│   │   │   ├── jobs/
│   │   │   ├── utils/
│   │   │   └── app.ts
│   │   └── package.json
│   │
│   └── desktop/
│       ├── src/
│       │   ├── main/
│       │   ├── renderer/
│       │   ├── preload/
│       │   ├── database/
│       │   ├── filesystem/
│       │   ├── device/
│       │   ├── sync/
│       │   ├── network/
│       │   ├── notifications/
│       │   └── services/
│       └── package.json
│
├── packages/
│   ├── shared-types/
│   ├── sync-protocol/
│   ├── crypto/
│   ├── validation/
│   └── logger/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   ├── postgres/
│   ├── redis/
│   └── backup/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── sync-protocol/
│   ├── device-identity/
│   └── decisions/
│
├── scripts/
├── docker-compose.yml
├── package.json
└── README.md
```

---

# 11. Phase 1 — Foundation ✅ COMPLETED

## Objectives

Create the monorepo and basic applications.

## Tasks

- [x] Initialize Git repository
- [x] Configure TypeScript
- [x] Configure ESLint
- [x] Configure Prettier
- [x] Configure package manager
- [x] Create server
- [x] Create Electron client
- [x] Create React renderer
- [x] Create shared packages
- [x] Configure environment variables
- [x] Configure logging
- [x] Configure error handling

## Deliverable

Both applications start successfully:

```bash
npm run dev:server
npm run dev:desktop
```

---

# 12. Phase 2 — Database ✅ COMPLETED

Use MongoDB with Prisma.

Initial tables:

```text
users
sessions
devices
device_keys
workspaces
workspace_members
projects
project_devices
files
file_versions
snapshots
snapshot_files
sync_operations
conflicts
backup_jobs
audit_logs
```

---

# 13. Phase 3 — Authentication ✅ COMPLETED

Implement:

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Requirements:

- Password hashing
- Access tokens
- Refresh tokens
- Session management
- Secure token storage
- Authentication middleware
- Token rotation

---

# 14. Phase 4 — Device Identity & Registration ✅ COMPLETED

This is a dedicated core phase.

When DevSync Desktop is installed for the first time:

```text
Install Application
       ↓
Generate Device Identity
       ↓
Login/Register User
       ↓
Register Device
       ↓
Server assigns/validates Device ID
       ↓
Device becomes trusted
```

Example:

```text
DEV-7F3A9C21
```

## Device Registration API

```http
POST /api/v1/devices/register
GET  /api/v1/devices
GET  /api/v1/devices/:id
PATCH /api/v1/devices/:id
POST /api/v1/devices/:id/revoke
DELETE /api/v1/devices/:id
```

## Device metadata

```text
id
deviceId
userId
deviceName
hostname
platform
platformVersion
appVersion
publicKey
lastIp
lastSeenAt
registeredAt
revokedAt
status
```

## Device statuses

```text
PENDING
ACTIVE
OFFLINE
REVOKED
```

---

# 15. Phase 5 — Device Security ✅ COMPLETED

Every device should have a cryptographic identity.

Recommended:

```text
Device
│
├── Device ID
│
└── Device Key Pair
      ├── Private Key
      └── Public Key
```

The private key must remain on the device.

The server stores the public key.

Use the device identity to strengthen:

- Authentication
- Device verification
- Device revocation
- Audit logging
- Change attribution

Do not rely only on hostname or MAC address because those are not reliable permanent identities.

---

# 16. Phase 6 — Workspace & Project Management ✅ COMPLETED

Implement:

```http
POST   /api/v1/workspaces
GET    /api/v1/workspaces
POST   /api/v1/workspaces/:id/members
DELETE /api/v1/workspaces/:id/members/:userId

POST   /api/v1/projects
GET    /api/v1/projects
GET    /api/v1/projects/:id
DELETE /api/v1/projects/:id
```

Project membership:

```text
OWNER
ADMIN
EDITOR
VIEWER
```

---

# 17. Phase 7 — Desktop Folder Registration ✅ COMPLETED

Developer selects:

```text
D:\Projects\PaymentService
```

Client registers:

```text
Project
Local Folder
Device
```

Store local metadata in SQLite.

```text
local_projects

id
project_id
local_path
device_id
last_sync_cursor
sync_status
created_at
```

---

# 18. Phase 8 — Filesystem Watcher ✅ COMPLETED

Use Chokidar.

Detect:

```text
CREATE
MODIFY
DELETE
RENAME
```

Events must be debounced.

Ignore by default:

```text
node_modules/
.git/
.dev-sync/
dist/
build/
.tmp/
coverage/
```

Allow user-defined ignore rules.

---

# 19. Phase 9 — File Hashing ✅ COMPLETED

Use SHA-256.

For every relevant file:

```text
path
size
modifiedAt
hash
```

Example:

```json
{
  "path": "src/payment.service.ts",
  "size": 18342,
  "hash": "sha256:...",
  "modifiedAt": "2026-08-09T10:30:00Z"
}
```

Never trust timestamps alone.

---

# 20. Phase 10 — Object Storage ✅ COMPLETED

Implement content-addressed storage.

```text
storage/
├── objects/
│   ├── ab/
│   │   └── ab82931...
│   ├── cd/
│   │   └── cd72191...
│   └── ef/
│       └── ef91823...
│
└── projects/
```

Object ID:

```text
SHA-256(file content)
```

If the same content already exists:

```text
DO NOT STORE AGAIN
```

This provides deduplication.

---

# 21. Phase 11 — Initial Project Sync ✅ COMPLETED

When a project is first connected:

```text
Client
 ↓
Scan directory
 ↓
Build manifest
 ↓
Compare with server
 ↓
Upload missing objects
 ↓
Create file records
 ↓
Create initial snapshot
 ↓
Mark project synchronized
```

---

# 22. Phase 12 — Incremental Synchronization ✅ COMPLETED

Core workflow:

```text
Developer changes file
        ↓
Filesystem watcher
        ↓
Calculate hash
        ↓
Create local operation
        ↓
Queue operation
        ↓
Upload object
        ↓
Server validates operation
        ↓
Create file version
        ↓
Create snapshot/update state
        ↓
Record User ID
        ↓
Record Device ID
        ↓
Notify other clients
        ↓
Other clients download
```

Every mutation must carry:

```text
userId
deviceId
operationId
projectId
path
hash
timestamp
```

---

# 23. Phase 13 — Sync Queue ✅ COMPLETED

SQLite:

```text
sync_queue

id
operation_id
project_id
device_id
operation
path
hash
status
retry_count
created_at
last_attempt
error
```

Statuses:

```text
PENDING
UPLOADING
COMPLETED
FAILED
CONFLICT
```

Offline behavior:

```text
Internet OFFLINE
     ↓
Changes continue locally
     ↓
Queue operations
     ↓
Internet returns
     ↓
Resume automatically
```

---

# 24. Phase 14 — Sync Protocol ✅ COMPLETED

Create a deterministic protocol.

Example:

```json
{
  "operationId": "uuid",
  "projectId": "uuid",
  "deviceId": "DEV-7F3A9C21",
  "baseVersion": 42,
  "operation": "MODIFY",
  "path": "src/payment.ts",
  "hash": "sha256:..."
}
```

The server determines the authenticated user from the session/token and validates that the submitted Device ID belongs to that user.

Server response:

```json
{
  "status": "ACCEPTED",
  "version": 43
}
```

Possible responses:

```text
ACCEPTED
CONFLICT
ALREADY_PROCESSED
INVALID
UNAUTHORIZED
DEVICE_REVOKED
```

Operations must be idempotent.

---

# 25. Phase 15 — Version Engine ✅ COMPLETED

Every accepted change creates a recoverable version.

```text
Project Version 41
Project Version 42
Project Version 43
Project Version 44
```

Version metadata:

```text
versionId
projectId
createdByUserId
createdByDeviceId
timestamp
parentVersionId
```

---

# 26. Phase 16 — Snapshots ✅ COMPLETED

A snapshot represents the complete project state at a specific point in time.

Example:

```text
Snapshot #105

src/
  payment.ts → object A
  webhook.ts → object B

models/
  payment.ts → object C

package.json → object D
```

Snapshot metadata:

```text
snapshotId
projectId
createdByUserId
createdByDeviceId
createdAt
parentSnapshotId
```

Snapshots reference stored objects rather than duplicate them.

---

# 27. Phase 17 — Version History ✅ COMPLETED

Project history should show:

```text
Payment Service — History

15:42  Developer A
       Asadullah's Laptop
       DEV-7F3A9C21
       Modified payment.service.ts
       Version 43

15:35  Developer B
       Office PC
       DEV-91BD42E7
       Added webhook.controller.ts
       Version 42

15:18  Developer C
       MacBook
       DEV-C82A61F4
       Modified transaction.model.ts
       Version 41
```

Filters:

```text
User
Device
Date
File
Operation
Version
```

---

# 28. Phase 18 — Recovery ✅ COMPLETED

Implement:

```http
GET  /api/v1/projects/:id/versions
GET  /api/v1/projects/:id/snapshots
POST /api/v1/projects/:id/restore
POST /api/v1/projects/:id/files/restore
```

Before restoring an old snapshot:

```text
Current State
     ↓
Create Recovery Point
     ↓
Restore Requested Snapshot
```

This makes restoration reversible.

---

# 29. Phase 19 — Deleted File Recovery ✅ COMPLETED

When a file is deleted:

```text
Developer A
    ↓
delete payment.ts
    ↓
Server
    ↓
mark file deleted
```

Do not immediately delete its object.

Store:

```text
deletedAt
deletedByUserId
deletedByDeviceId
deletedVersionId
```

The file remains recoverable.

---

# 30. Phase 20 — Project Destruction Recovery ✅ COMPLETED

Example:

```text
Developer A
     ↓
Deletes entire project folder
     ↓
DevSync detects mass deletion
     ↓
Server preserves historical state
     ↓
Developer B opens History
     ↓
Selects previous snapshot
     ↓
Restore
```

For mass deletion events, the client should provide a safety warning:

```text
247 files appear to have been deleted.

[Continue]
[Pause Sync]
```

This prevents an accidental filesystem operation from immediately propagating destructive changes.

---

# 31. Phase 21 — Conflict Detection ✅ COMPLETED

Example:

```text
Server Version = 20

Developer A starts from 20
Developer B starts from 20

A → Version 21

B → tries to modify based on Version 20
```

Server detects:

```text
CONFLICT
```

Conflict record:

```text
conflictId
projectId
fileId
userId
deviceId
baseVersionId
serverVersionId
incomingVersionId
createdAt
status
```

---

# 32. Phase 22 — Conflict Resolution ✅ COMPLETED

Initial options:

```text
Keep Mine
Keep Server
Keep Both
Cancel
```

For text files, later implement:

```text
3-way merge
```

For binary files:

```text
Keep Mine
Keep Server
Keep Both
```

Never silently overwrite conflicting changes.

---

# 33. Phase 23 — Real-Time Notifications ✅ COMPLETED

Use WebSocket.

Events:

```text
PROJECT_UPDATED
FILE_UPDATED
FILE_DELETED
SNAPSHOT_CREATED
CONFLICT_CREATED
DEVICE_CONNECTED
DEVICE_DISCONNECTED
DEVICE_REVOKED
SYNC_REQUIRED
```

Example:

```json
{
  "event": "FILE_UPDATED",
  "projectId": "...",
  "path": "src/payment.ts",
  "version": 45,
  "userId": "USR-10291",
  "deviceId": "DEV-7F3A9C21"
}
```

---

# 34. Phase 24 — Backup Engine ✅ COMPLETED

Primary:

```text
DevSync Storage
```

Backup:

```text
External Drive
```

Implement:

```text
Daily backup
Weekly snapshot
Retention policy
Backup verification
```

Suggested retention:

```text
Last 7 daily
Last 4 weekly
Last 12 monthly
```

Never consider a backup successful until it has been verified.

---

# 35. Phase 25 — Backup Recovery ✅ COMPLETED

If the old laptop fails:

```text
Server Failure
      ↓
Install DevSync Server
      ↓
Attach Backup Drive
      ↓
Restore Metadata
      ↓
Restore Objects
      ↓
Verify Hashes
      ↓
Server Operational
```

---

# 36. Phase 26 — Security ✅ COMPLETED

Implement:

- HTTPS
- Secure password hashing
- Refresh-token rotation
- Device authentication
- Device revocation
- Role-based authorization
- Rate limiting
- Request validation
- File path sanitization
- Directory traversal protection
- Audit logs
- Encryption at rest
- Secure secret management

Never allow arbitrary paths such as:

```text
../../../../etc/passwd
```

or equivalent Windows traversal paths.

---

# 37. Phase 27 — Device Revocation ✅ COMPLETED

If a laptop is stolen or compromised:

```text
Settings
   ↓
Devices
   ↓
Asadullah's Laptop
   ↓
DEV-7F3A9C21
   ↓
Revoke
```

Server immediately marks:

```text
status = REVOKED
```

The device must no longer be able to:

```text
Upload
Download
Sync
Create operations
Access projects
```

Existing sessions/tokens associated with that device should be invalidated.

---

# 38. Phase 28 — Integrity Verification ✅ COMPLETED

Periodically verify stored objects:

```text
Stored Object
     ↓
Calculate SHA-256
     ↓
Compare Expected Hash
```

If mismatch:

```text
CORRUPTED OBJECT
```

Restore from backup.

---

# 39. Phase 29 — Resource Management ✅ COMPLETED

The old laptop may have limited resources.

Implement:

- Upload concurrency limits
- Download concurrency limits
- CPU-conscious hashing
- Memory-conscious processing
- Streaming file transfers
- Disk-space monitoring
- Storage quotas
- Background job limits

Never load huge files completely into RAM.

Use streams.

---

# 40. Phase 30 — Large File Handling ✅ COMPLETED

For large files:

```text
File
 ↓
Chunk
 ↓
Chunk
 ↓
Chunk
 ↓
Chunk
```

Implement resumable uploads.

Example:

```text
10 GB file

Chunk 1 ✓
Chunk 2 ✓
Chunk 3 ✓
Chunk 4 ✗

Connection lost

Resume:
Chunk 4
```

Do not restart from zero.

---

# 41. Phase 31 — Ignore Rules ✅ COMPLETED

Support:

```text
.dev-syncignore
```

Example:

```text
node_modules/
dist/
build/
.env
.env.local
*.log
coverage/
```

Never automatically upload sensitive files without warning.

---

# 42. Phase 32 — Desktop UI ✅ COMPLETED

Main dashboard:

```text
┌──────────────────────────────────────┐
│ DevSync                         ✓    │
├──────────────────────────────────────┤
│ Projects                             │
│                                      │
│ Payment Service          ✓ Synced    │
│ SaaS Platform            ⟳ Syncing   │
│ Client Project           ⚠ Conflict  │
│                                      │
├──────────────────────────────────────┤
│ Storage: 42.3 GB / 500 GB            │
│ Devices: 3                           │
└──────────────────────────────────────┘
```

---

# 43. Phase 33 — Device Management UI ✅ COMPLETED

Add a dedicated Devices page.

```text
┌─────────────────────────────────────────────┐
│ Devices                                     │
├─────────────────────────────────────────────┤
│                                             │
│ ● Asadullah's Laptop                        │
│   DEV-7F3A9C21                               │
│   Windows 11                                 │
│   Last seen: Just now                        │
│   Status: ONLINE                             │
│                                             │
│ ● Office PC                                  │
│   DEV-91BD42E7                               │
│   Windows 11                                 │
│   Last seen: 5 minutes ago                   │
│   Status: ONLINE                             │
│                                             │
│ ○ Old Laptop                                 │
│   DEV-C82A61F4                               │
│   Linux                                      │
│   Last seen: 2 days ago                      │
│   Status: OFFLINE                            │
└─────────────────────────────────────────────┘
```

Actions:

```text
Rename Device
View Details
View Activity
Revoke Device
```

---

# 44. Phase 34 — Activity / Audit UI ✅ COMPLETED

Project activity:

```text
Today

15:42
Developer A
Asadullah's Laptop
DEV-7F3A9C21

Modified:
src/payment.service.ts

Version:
43
```

Clicking the activity should show:

```text
Change ID
User
Device
Project
File
Operation
Timestamp
Previous Version
New Version
IP
Client Version
```

---

# 45. Phase 35 — System Tray ✅ COMPLETED

The client should run quietly.

Tray states:

```text
✓ Synced

⟳ Synchronizing

⚠ Conflict

✕ Offline
```

Actions:

```text
Open DevSync
Pause Sync
Resume Sync
Open Project
View Conflicts
View History
View Devices
Exit
```

---

# 46. Phase 36 — Testing ✅ COMPLETED

## Basic

```text
Create file
Modify file
Delete file
Rename file
Move file
```

## Multi-device

```text
A creates
B receives

B modifies
A receives

C creates
A/B receive
```

## Attribution

Verify:

```text
Change
 ↓
Correct User ID
 ↓
Correct Device ID
 ↓
Correct Operation ID
 ↓
Correct Version
```

## Offline

```text
A goes offline
A changes 50 files
Internet returns
All 50 synchronize
```

## Conflict

```text
A modifies file
B modifies same file
Conflict detected
```

## Recovery

```text
Project deleted
Restore previous snapshot
```

## Device Revocation

```text
Device revoked
 ↓
Sync attempt
 ↓
Rejected
```

## Crash

```text
Kill client during upload
Restart
Operation resumes
```

## Server crash

```text
Kill server
Restart
No metadata corruption
```

## Storage corruption

```text
Corrupt object
Integrity check detects it
Backup restores it
```

---

# 47. Phase 37 — Deployment on Old Laptop

Install Linux on the old laptop.

Recommended:

```text
Ubuntu Server
```

Install:

```text
Docker
Docker Compose
Git
```

Deploy:

```text
PostgreSQL
Redis
DevSync Server
Nginx
```

Storage:

```text
OS Drive
   │
   └── Operating System

DevSync Drive
   │
   └── Project Objects
```

If possible, use an SSD for DevSync storage.

---

# 48. Phase 38 — LAN Deployment

First deployment should NOT use the public internet.

Example:

```text
Router
  │
  ├── Old Laptop
  │      192.168.1.50
  │
  ├── Developer A
  │
  ├── Developer B
  └── Developer C
```

Clients connect to the server through the local network.

Prove synchronization works locally before implementing remote access.

---

# 49. Phase 39 — Remote Access

Only after LAN synchronization is stable.

Architecture:

```text
Internet
   ↓
HTTPS
   ↓
Reverse Proxy
   ↓
DevSync API
   ↓
DevSync Services
```

Use a secure VPN/tunnel approach where possible.

Never expose directly:

```text
PostgreSQL
Redis
Object Storage
```

to the public internet.

---

# 50. Phase 40 — Observability ✅ COMPLETED

Server dashboard:

```text
Server Status
CPU
RAM
Disk
Storage
Database
Redis
Connected Devices
Active Syncs
Failed Syncs
Conflicts
Backups
```

Logs:

```text
INFO
WARN
ERROR
AUDIT
SYNC
SECURITY
DEVICE
RECOVERY
```

---

# 51. Phase 41 — Production Readiness ✅ COMPLETED

Before calling the system stable:

- Automated database backups
- Storage backups
- Restore testing
- Health checks
- Graceful shutdown
- Crash recovery
- Database migration system
- Rate limiting
- Authentication hardening
- Device security
- Audit logging
- Disk-space protection
- Integrity checks
- Automated tests
- Documentation

---

# 52. Core Database Relationships

```text
User
 │
 ├── Device
 │     └── Device ID
 │
 └── Workspace
       │
       ├── Member
       │
       └── Project
             │
             ├── File
             │
             ├── FileVersion
             │
             ├── Snapshot
             │
             ├── SyncOperation
             │
             └── Conflict
```

Every relevant operation should reference:

```text
userId
deviceId
projectId
```

---

# 53. Important Database Fields

## devices

```text
id
deviceId UNIQUE
userId
deviceName
hostname
platform
platformVersion
appVersion
publicKey
lastIp
lastSeenAt
registeredAt
revokedAt
status
```

## sync_operations

```text
id
operationId UNIQUE
projectId
userId
deviceId
operation
path
hash
baseVersionId
resultVersionId
status
createdAt
completedAt
```

## file_versions

```text
id
fileId
versionId
projectId
userId
deviceId
path
objectHash
size
createdAt
```

## snapshots

```text
id
projectId
versionId
createdByUserId
createdByDeviceId
createdAt
parentSnapshotId
```

## audit_logs

```text
id
userId
deviceId
projectId
operationId
action
resourceType
resourceId
metadata
ipAddress
createdAt
```

---

# 54. Change Attribution Rule

This is a mandatory system rule.

> **Every server-side file mutation, version, snapshot, synchronization operation, conflict, deletion, restoration, and audit event MUST be attributable to both a User ID and a unique Device ID.**

Example:

```text
WHO?
Developer A

DEVICE?
DEV-7F3A9C21

WHAT?
Modified payment.service.ts

WHEN?
15:42

OPERATION?
CHG-84D921

VERSION?
VER-000043
```

---

# 55. Critical Engineering Rules

## Rule 1 — Never permanently delete immediately

Deleted files must remain recoverable.

## Rule 2 — Never trust timestamps

Use content hashes.

## Rule 3 — Never overwrite conflicts silently

Create a conflict.

## Rule 4 — Never store every snapshot as a complete copy

Use content-addressed storage and deduplication.

## Rule 5 — Never depend on the network

The client must work offline and queue changes.

## Rule 6 — Never make the old laptop the only backup

Use external/off-site backup.

## Rule 7 — Never expose databases publicly

Only the API/reverse proxy should be remotely accessible.

## Rule 8 — Never accidentally upload secrets

Use ignore rules and secret-file warnings.

## Rule 9 — Every sync operation must be idempotent

Retrying an operation must not corrupt project state.

## Rule 10 — Recovery must itself be safe

Before restoring an old snapshot, create a recovery point.

## Rule 11 — Never trust a client-supplied identity

The server must authenticate the device and verify that the Device ID belongs to the authenticated user.

## Rule 12 — Every change must have attribution

No file mutation should enter the server without:

```text
User ID
Device ID
Operation ID
Timestamp
```

---

# 56. MVP Definition

The first production-like MVP is complete when all of this works:

```text
✓ User registration
✓ Login
✓ Device registration
✓ Unique Device ID
✓ Device management
✓ Device revocation
✓ Create workspace
✓ Create project
✓ Select local folder
✓ Initial synchronization
✓ Automatic file detection
✓ Automatic upload
✓ Automatic download
✓ Multiple devices
✓ Offline queue
✓ File hashing
✓ Version history
✓ Snapshots
✓ Deleted file recovery
✓ Project recovery
✓ Basic conflict detection
✓ Basic conflict resolution
✓ User attribution
✓ Device attribution
✓ Local server deployment
```

---

# 57. V2 Definition

After MVP:

```text
✓ Advanced merge
✓ Large-file chunking
✓ Resumable transfers
✓ Advanced deduplication
✓ External backup
✓ Backup verification
✓ Remote access
✓ Advanced permissions
✓ Team management
✓ Audit logs
✓ Encryption
✓ Server dashboard
✓ Storage quotas
✓ Advanced device management
```

---

# 58. V3 Definition

Long-term:

```text
✓ S3-compatible storage
✓ Multiple storage backends
✓ Server clustering
✓ Distributed synchronization
✓ Enterprise authentication
✓ SSO
✓ Advanced team policies
✓ Cloud deployment
✓ Mobile monitoring
✓ Admin console
✓ Automatic disaster recovery
```

---

# 59. Development Order

Follow this order:

```text
1.  Foundation
        ↓
2.  Database
        ↓
3.  Authentication
        ↓
4.  Device Identity
        ↓
5.  Device Registration
        ↓
6.  Device Security
        ↓
7.  Workspaces / Projects
        ↓
8.  Local Folder
        ↓
9.  File Watcher
        ↓
10. File Hashing
        ↓
11. Object Storage
        ↓
12. Initial Sync
        ↓
13. Incremental Sync
        ↓
14. Offline Queue
        ↓
15. Sync Protocol
        ↓
16. Version Engine
        ↓
17. Snapshots
        ↓
18. Recovery
        ↓
19. Conflict Detection
        ↓
20. Conflict Resolution
        ↓
21. WebSocket
        ↓
22. Backup
        ↓
23. Security
        ↓
24. Device Management UI
        ↓
25. Activity / Audit UI
        ↓
26. Desktop UI
        ↓
27. Testing
        ↓
28. Old Laptop Deployment
        ↓
29. Remote Access
        ↓
30. Production Hardening
```

---

# 60. First End-to-End Milestone

The first major milestone is:

```text
OLD LAPTOP
DevSync Server
Device ID:
SERVER-XXXXXXXX
       │
       │
       ▼
Developer A
Device:
DEV-7F3A9C21
       │
       │
       ▼
PaymentService/
       │
       │ Automatic Sync
       ▼
Developer B
Device:
DEV-91BD42E7
```

Developer A modifies:

```text
src/payment.service.ts
```

Server records:

```text
User:
Developer A

Device:
DEV-7F3A9C21

Operation:
CHG-84D921

Version:
43
```

Developer B automatically receives the change.

Then test:

```text
Developer A
     ↓
Deletes entire project
     ↓
DevSync detects mass deletion
     ↓
Server preserves historical snapshot
     ↓
Developer B
     ↓
History
     ↓
Version 42
     ↓
Restore
     ↓
Project recovered
```

---

# 61. Final Product Goal

The finished system should feel like:

```text
Install DevSync
       ↓
Login
       ↓
Register Device
       ↓
Create/Join Workspace
       ↓
Select Project Folder
       ↓
Done
```

After that:

```text
Developer works normally.

DevSync automatically:

• Detects changes
• Identifies the device
• Identifies the developer
• Synchronizes changes
• Keeps versions
• Handles offline changes
• Detects conflicts
• Protects deleted files
• Creates snapshots
• Enables recovery
• Maintains audit history
• Backs up data
```

The developer should not need to manually manage synchronization.

---

# 62. Final Architecture Principle

DevSync is not simply a file-sharing application.

It is a:

```text
                 DEVSync
                    │
       ┌────────────┼────────────┐
       │            │            │
    Sync         Versioning    Recovery
       │            │            │
       └────────────┼────────────┘
                    │
              Attribution
                    │
          ┌─────────┴─────────┐
          │                   │
       User ID            Device ID
          │                   │
          └─────────┬─────────┘
                    │
              Audit History
                    │
                    ▼
             Backup / Restore
```

The central principle is:

> **Every change is synchronized, versioned, recoverable, and attributable to the exact developer and exact device that produced it.**
