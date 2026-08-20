# DevSync — System Architecture & Flowcharts

This document details the system design, components, and core flow diagrams of the DevSync synchronization engine.

---

## 1. System Topology & Architecture

Below is the layout of the DevSync ecosystem, showing how the desktop clients interact with the central server and how the server manages local SQLite caches, remote storage, and configuration.

```mermaid
graph TD
    subgraph Clients ["Developer Devices"]
        DevA["Developer A (Client App)<br/>Device: DEV-7F3A9C21"]
        DevB["Developer B (Client App)<br/>Device: DEV-91BD42E7"]
    end

    subgraph ProxyAndTunnel ["Network Layer"]
        Caddy["Caddy (Reverse Proxy)<br/>HTTPS/WS"]
        CFTunnel["Cloudflare Tunnel<br/>(Secure Tunneling)"]
    end

    subgraph ServerNode ["DevSync Central Server"]
        API["Express API Server<br/>(File, Auth, Workspace, Device)"]
        WS["WebSocket Server<br/>(Real-Time Broadcasts)"]
        SyncEngine["Sync Engine<br/>(Attribution, Versioning, Snapshots)"]
        BackupEngine["Backup Engine<br/>(Verification, Retention, External Drive)"]
    end

    subgraph DataStorage ["Data & Object Store"]
        Postgres[(PostgreSQL Database<br/>Metadata, Audit, Auth)]
        Redis[(Redis Cache<br/>Pub/Sub, Rates, Session)]
        ObjStore["Content-Addressed Storage<br/>(Deduplicated Project Objects)"]
    end

    DevA <-->|HTTPS / WSS| Caddy
    DevB <-->|HTTPS / WSS| Caddy
    Caddy <--> CFTunnel
    CFTunnel <--> API
    CFTunnel <--> WS
    
    API <--> SyncEngine
    WS <--> SyncEngine
    BackupEngine <--> SyncEngine
    
    SyncEngine <--> Postgres
    SyncEngine <--> Redis
    SyncEngine <--> ObjStore
    BackupEngine -->|Archive & Verify| ObjStore
```

---

## 2. File Synchronization & Propagation Loop

This flowchart displays the path of a local file modification from the watcher to database attribution, storage deduplication, and immediate propagation to other registered clients.

```mermaid
sequenceDiagram
    autonumber
    actor DevA as Developer A
    participant ClientA as Desktop Client A
    participant Server as DevSync Server
    participant DB as Metadata (PostgreSQL)
    participant Storage as Object Storage
    participant ClientB as Desktop Client B

    DevA->>ClientA: Modify local file (e.g. payment.ts)
    ClientA->>ClientA: Filesystem Watcher (Chokidar) detects change
    ClientA->>ClientA: Calculate SHA-256 Hash of content
    ClientA->>ClientA: Queue local sync job (status: PENDING)
    ClientA->>Server: Request upload (Check if Hash exists)
    
    alt Hash Already Exists (Deduplication)
        Server-->>ClientA: Object exists (Skip binary upload)
    else Hash is New
        Server-->>ClientA: Object missing (Request upload)
        ClientA->>Server: Stream file object
        Server->>Storage: Store content in CAS (hash-addressed directory)
    end
    
    ClientA->>Server: Commit Sync Operation (Project, Path, Hash, DeviceID)
    Server->>Server: Verify token & Device ID mapping
    Server->>DB: Write file_versions & sync_operations with User/Device attribution
    Server->>DB: Generate new Project Snapshot
    Server-->>ClientA: Confirm sync completed successfully
    Server->>ClientB: Broadcast real-time notification (via WebSocket)
    ClientB->>Server: Pull project changes
    Server-->>ClientB: Transfer missing files
    ClientB->>ClientB: Update local filesystem
```

---

## 3. Conflict Detection & Resolution Workflow

When two clients submit edits on the same file starting from the same base version, DevSync prevents overwrites through this verification and resolution workflow.

```mermaid
graph TD
    Start([Sync Operation Received]) --> Verify[Compare Incoming Base Version with Current Server Version]
    Verify --> VersionCheck{Is Incoming Base == Server Current?}
    
    VersionCheck -->|Yes: No conflict| ApplyChange[Apply modification, update snapshot] --> Finish([Sync Successful])
    
    VersionCheck -->|No: Versions mismatch| HashCheck{Is Current Server File Hash == Incoming File Hash?}
    
    HashCheck -->|Yes: Content is identical| Deduplicate[Update pointer / ignore conflict] --> Finish
    HashCheck -->|No: Content is different| RaiseConflict[Create Conflict Entry in database]
    
    RaiseConflict --> Notify[Notify clients of Conflict via WebSocket]
    Notify --> Resolution{Choose Resolution Policy}
    
    Resolution -->|Keep Mine| ResolveMine[Apply Client version as new current version] --> ResolveConflict
    Resolution -->|Keep Server| ResolveServer[Discard incoming version, keep server version] --> ResolveConflict
    Resolution -->|Keep Both| ResolveBoth[Rename incoming file e.g., filename.client.ts and commit both] --> ResolveConflict
    
    ResolveConflict[Mark Conflict status as RESOLVED] --> Finish
```

---

## 4. Device Identity & Handshake flow

This process secures the client connection and verifies cryptographic identities before any synchronization operation is permitted.

```mermaid
sequenceDiagram
    autonumber
    participant Client as Desktop Client
    participant Server as DevSync Server
    participant DB as database

    Note over Client: Fresh installation
    Client->>Client: Generate RSA/ECDSA Private/Public Key Pair
    Client->>Client: Generate Unique Device ID (e.g. DEV-7F3A9C21)
    Client->>Client: Save private key locally
    Client->>Server: Login with User Credentials
    Server-->>Client: Return JWT Auth Token
    Client->>Server: Register Device (JWT + Device ID + Public Key + Metadata)
    Server->>DB: Verify user session & save device credentials
    Server-->>Client: Device Registered & Trusted (Status: ACTIVE)
    
    Note over Client, Server: Subsequent Synchronization Request
    Client->>Server: Request sync with Device ID
    Server->>DB: Check if Device ID status is REVOKED
    alt Device is Revoked
        Server-->>Client: 401 Unauthorized / Device Revoked
    else Device is Active
        Server-->>Client: Accept synchronization payload
    end
```
