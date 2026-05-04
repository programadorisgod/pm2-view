# Architecture

## Overview

PM2 View uses a layered architecture with dependency injection and registry patterns for extensibility.

## Layers

```mermaid
graph TB
    subgraph Presentation
        R1[Routes - Dashboard]
        R2[Routes - Projects]
        R3[Routes - Metrics]
        R4[Routes - Auth]
    end

    subgraph Services
        SC[createServices Factory]
        PS[PM2Service]
        MS[MetricsService]
        ES[EnvVarService]
        AS[AuthService]
    end

    subgraph Data Access
        subgraph Database
            DI[DatabaseDriver Interface]
            LD[LibSQL Driver]
            PGD[PostgreSQL Driver]
            DialectReg[Dialect Registry]
        end

        subgraph Auth
            API[AuthProvider Interface]
            BAP[BetterAuth Provider]
            AuthReg[Provider Registry]
        end

        subgraph Repositories
            PM2R[PM2Repository]
            MR[MetricsRepository]
            ER[EnvVarRepository]
            TFR[TeamRepository]
            TMR[TeamMemberRepository]
            PFR[ProjectFavoriteRepository]
        end
    end

    subgraph Infrastructure
        L[Logger]
        U[Shared Utils]
        S[Shell Escape]
    end

    R1 --> SC
    R2 --> SC
    R3 --> SC
    R4 --> AS

    SC --> PS
    SC --> MS
    SC --> ES

    PS --> PM2R
    MS --> MR
    ES --> ER

    DI --> LD
    DI --> PGD
    DialectReg -. detects .-> DI

    API --> BAP
    AuthReg -. selects .-> API

    PS --> L
    MS --> L
    ES --> L
    PM2R --> S
```

## Key Patterns

### Registry Pattern (Open/Closed)
Drivers and providers are selected via registry maps — adding new options requires zero changes to existing code.

### Dependency Injection
Services are created via a centralized factory (`createServices()`) — route files never instantiate dependencies directly.

### Repository Pattern
Data access is abstracted behind interfaces — the domain layer doesn't know about Drizzle, SQLite, or PostgreSQL.
