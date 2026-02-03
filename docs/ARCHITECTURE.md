# Arquitectura del Sistema EJE

## Visión General

El sistema EJE (Expediente Judicial Electrónico) está compuesto por tres componentes principales que trabajan juntos para extraer, almacenar y servir datos de expedientes judiciales del Poder Judicial de la Ciudad de Buenos Aires.

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │   UI (React)    │              │  Admin UI       │           │
│  │   Port: 3000    │              │  Port: 3001     │           │
│  └────────┬────────┘              └────────┬────────┘           │
└───────────┼────────────────────────────────┼────────────────────┘
            │                                │
            ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         APIS                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ law-analytics   │  │    eje-api      │  │    pjn-api      │  │
│  │    server       │  │   Port: 3004    │  │   Port: 3003    │  │
│  │   Port: 8080    │  │                 │  │                 │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MONGODB                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   users     │  │  causas-eje │  │ causas-pjn  │              │
│  │   folders   │  │             │  │ (4 fueros)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
            ▲                    ▲                    ▲
            │                    │                    │
┌───────────┼────────────────────┼────────────────────┼───────────┐
│           │      WORKERS       │                    │           │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴────────┐  │
│  │  law-analytics  │  │   eje-workers   │  │  pjn-workers   │  │
│  │    workers      │  │                 │  │                │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes EJE

### 1. eje-models

**Ubicación:** `/home/mcerra/www/eje-models`

Paquete TypeScript que define los modelos de datos para MongoDB.

**Modelos:**
- `CausasEje`: Expedientes judiciales de EJE
- `ConfiguracionEje`: Configuración de scraping

**Uso:**
```javascript
const { CausasEje, ConfiguracionEje } = require('eje-models');
```

### 2. eje-workers

**Ubicación:** `/home/mcerra/www/eje-workers`

Workers de scraping que extraen datos del sitio EJE usando Puppeteer.

**Workers:**
- `verification-worker`: Verifica existencia de expedientes
- `update-worker`: Extrae detalles completos (movimientos, intervinientes)
- `stuck-worker`: Recupera documentos bloqueados

**Servicios:**
- `eje-scraper`: Orquestador principal de scraping
- `eje-navigation`: Navegación en el sitio Angular
- `eje-parser`: Extracción de datos del HTML

### 3. eje-api

**Ubicación:** `/home/mcerra/www/eje-api`

API REST que expone los datos de EJE.

**Endpoints principales:**
- `/api/causas-eje`: CRUD de causas
- `/api/causas-eje-service`: Servicios (folders, locks)
- `/api/worker-stats`: Estadísticas de procesamiento

---

## Flujos de Datos

### Flujo 1: Usuario agrega expediente EJE

```
┌──────────┐    ┌─────────────────┐    ┌─────────┐    ┌─────────────┐
│   UI     │───▶│law-analytics-   │───▶│eje-api  │───▶│  MongoDB    │
│          │    │    server       │    │         │    │ causas-eje  │
└──────────┘    └─────────────────┘    └─────────┘    └─────────────┘
     │                                                       │
     │                                                       ▼
     │                                              ┌─────────────┐
     │                                              │ eje-workers │
     │                                              │ (verificar) │
     │                                              └─────────────┘
     │                                                       │
     ▼                                                       ▼
┌──────────┐                                        ┌─────────────┐
│ Ver      │◀───────────────────────────────────────│  Detalles   │
│ detalles │                                        │  cargados   │
└──────────┘                                        └─────────────┘
```

**Pasos:**
1. Usuario busca expediente en UI
2. UI llama a `law-analytics-server`
3. Server llama a `eje-api` para asociar folder
4. API crea documento ligero en `causas-eje` con `verified: false`
5. `verification-worker` detecta documento pendiente
6. Worker verifica existencia en sitio EJE
7. Si existe, marca `verified: true`
8. `update-worker` detecta documento verificado sin detalles
9. Worker extrae datos completos (movimientos, intervinientes)
10. Marca `detailsLoaded: true`
11. Usuario ve datos completos en UI

### Flujo 2: Verificación de expediente

```
┌─────────────────┐
│verification-    │
│worker           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ GET /pending-   │────▶│   eje-api       │
│ verification    │     └────────┬────────┘
└─────────────────┘              │
         ▲                       ▼
         │              ┌─────────────────┐
         │              │    MongoDB      │
         │              │  causas-eje     │
         │              └─────────────────┘
         │
         │ Para cada documento:
         ▼
┌─────────────────┐
│ POST /lock/:id  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  EjeScraper     │────▶│  eje.juscaba    │
│  searchAndGet   │     │   .gob.ar       │
│  BasicData()    │◀────│                 │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Actualizar      │
│ documento       │
│ verified: true  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│POST /unlock/:id │
└─────────────────┘
```

### Flujo 3: Carga de detalles

```
┌─────────────────┐
│update-worker    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GET /pending-   │
│ update          │
└────────┬────────┘
         │
         ▼ Para cada documento
┌─────────────────┐
│ POST /lock/:id  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  EjeScraper     │
│  scrapeExpe-    │
│  dienteByCuij() │
└────────┬────────┘
         │
         │ 1. Buscar expediente
         │ 2. Click en resultado
         │ 3. Expandir accordion
         │ 4. Extraer ficha
         │ 5. Click tab Actuaciones
         │ 6. Extraer movimientos
         │ 7. Click tab Sujetos
         │ 8. Extraer intervinientes
         │ 9. Click tab Causas Relacionadas
         │ 10. Extraer relacionadas
         │
         ▼
┌─────────────────┐
│ Actualizar      │
│ documento       │
│ detailsLoaded:  │
│ true            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│POST /unlock/:id │
└─────────────────┘
```

---

## Estructura de la Base de Datos

### Colección: causas-eje

```javascript
{
  // === IDENTIFICACIÓN ===
  _id: ObjectId,
  cuij: "EXP J-01-00015050-5/2021-0",
  numero: 15050,
  anio: 2021,

  // === DATOS DEL EXPEDIENTE ===
  caratula: "GCBA CONTRA AGUIRRE...",
  objeto: "EJECUCION FISCAL",
  monto: 3269391,
  montoMoneda: "ARS",
  fechaInicio: ISODate("2021-02-01"),
  juzgado: "JUZGADO 19 - SECRETARIA 38",
  sala: null,
  tribunalSuperior: null,
  ubicacionActual: "JUZGADO 19 - JUZG19_SEC38",
  estado: "EN LETRA",

  // === MOVIMIENTOS ===
  movimientos: [
    {
      fecha: ISODate("2023-10-11T16:01:21"),
      tipo: "DN1",
      descripcion: "DN1 SELLO",
      detalle: "CEDEXT 18735415/2023",
      firmante: "Dr. Juan Pérez",
      numero: "18735415"
    }
  ],
  movimientosCount: 5,
  ultimoMovimiento: ISODate("2023-10-11T16:01:21"),

  // === INTERVINIENTES ===
  intervinientes: [
    {
      tipo: "ACTOR",
      nombre: "GCBA",
      representante: "MANDATARIO (AGIP): ALEJANDRO CLAUDIO..."
    },
    {
      tipo: "DEMANDADO",
      nombre: "MIRTHA MERCEDES, AGUIRRE"
    }
  ],

  // === CAUSAS RELACIONADAS ===
  causasRelacionadas: [],

  // === ESTADO DE PROCESAMIENTO ===
  isPrivate: false,
  source: "app",            // "app" | "import" | "scraping"
  verified: true,
  verifiedAt: ISODate("2024-01-15T10:30:00"),
  isValid: true,
  detailsLoaded: true,
  detailsLastUpdate: ISODate("2024-01-15T10:35:00"),
  lastError: null,
  errorCount: 0,
  stuckSince: null,

  // === LOCKING ===
  lockedBy: null,           // "verification-worker-1"
  lockedAt: null,

  // === ASOCIACIONES ===
  folderIds: [ObjectId("...")],
  userCausaIds: [ObjectId("...")],
  userUpdatesEnabled: [
    { userId: ObjectId("..."), enabled: true }
  ],
  update: true,

  // === HISTORIAL ===
  updateHistory: [
    {
      timestamp: ISODate("2024-01-15T10:30:00"),
      source: "api",
      updateType: "link",
      success: true,
      movimientosAdded: 0,
      movimientosTotal: 0,
      details: {
        folderId: "...",
        userId: "...",
        searchTerm: "15050/2021"
      }
    }
  ],

  // === TIMESTAMPS ===
  createdAt: ISODate("2024-01-15T10:00:00"),
  updatedAt: ISODate("2024-01-15T10:35:00"),
  lastUpdate: ISODate("2024-01-15T10:35:00")
}
```

### Índices

```javascript
// Búsqueda por CUIJ
{ cuij: 1 }

// Búsqueda por número/año
{ numero: 1, anio: 1 }

// Documentos pendientes de verificación
{ verified: 1, isValid: 1, errorCount: 1 }

// Documentos pendientes de actualización
{ verified: 1, isValid: 1, isPrivate: 1, detailsLoaded: 1 }

// Documentos por folder
{ folderIds: 1 }

// Documentos por usuario
{ userCausaIds: 1 }

// Documentos con updates habilitados
{ update: 1 }

// Documentos locked
{ lockedBy: 1, lockedAt: 1 }
```

---

## Configuración de Workers

### ecosystem.config.js (eje-workers)

```javascript
module.exports = {
  apps: [
    {
      name: 'eje/verification-worker',
      script: 'dist/workers/verification-worker.js',
      instances: 1,
      cron_restart: '0 */2 * * *',  // Cada 2 horas
      env_production: {
        NODE_ENV: 'production',
        BATCH_SIZE: 10,
        DELAY_BETWEEN_DOCS: 5000
      }
    },
    {
      name: 'eje/update-worker',
      script: 'dist/workers/update-worker.js',
      instances: 1,
      cron_restart: '30 */2 * * *',  // Cada 2 horas, offset 30min
      env_production: {
        NODE_ENV: 'production',
        BATCH_SIZE: 5,
        DELAY_BETWEEN_DOCS: 10000,
        MAX_MOVIMIENTOS_PAGES: 10
      }
    },
    {
      name: 'eje/stuck-worker',
      script: 'dist/workers/stuck-worker.js',
      instances: 1,
      cron_restart: '0 */6 * * *',  // Cada 6 horas
      env_production: {
        NODE_ENV: 'production',
        STUCK_THRESHOLD_MINUTES: 10
      }
    }
  ]
};
```

---

## Variables de Entorno

### eje-workers

```env
# MongoDB
URLDB=mongodb://...

# Scraping
DELAY_BETWEEN_REQUESTS=3000
MAX_MOVIMIENTOS_PAGES=10

# API (para usar endpoints de lock/unlock)
EJE_API_URL=http://localhost:3004/api
API_KEY=your-api-key
```

### eje-api

```env
# Server
PORT=3004
NODE_ENV=development

# MongoDB
URLDB=mongodb://...

# Auth
JWT_SECRET=...
API_KEY=...
```

---

## Manejo de Errores

### Errores de Scraping

| Error | Causa | Acción |
|-------|-------|--------|
| `Expediente no encontrado` | CUIJ inválido o no existe | Marcar `isValid: false` |
| `Timeout` | Sitio lento o caído | Incrementar `errorCount`, reintentar |
| `Tab no encontrado` | Expediente privado | Marcar `isPrivate: true` |
| `Spinner timeout` | Página no cargó | Incrementar `errorCount`, reintentar |

### Manejo de Documentos Stuck

Un documento se considera "stuck" si:
- `lockedBy` existe
- `lockedAt` es mayor a 10 minutos

El `stuck-worker` libera estos documentos periódicamente.

### Límite de Reintentos

- `errorCount` se incrementa con cada error
- Documentos con `errorCount >= 3` se omiten
- Admin puede resetear con `/api/worker-stats/reset-error/:id`

---

## Monitoreo

### Métricas Clave

1. **Tasa de verificación**: `verified / total`
2. **Tasa de detalles**: `detailsLoaded / verified`
3. **Documentos con errores**: `errorCount > 0`
4. **Documentos stuck**: `lockedBy != null && lockedAt < 10min ago`
5. **Procesados últimas 24h**: `verifiedAt >= 24h ago || detailsLastUpdate >= 24h ago`

### Dashboard Admin

```
GET /api/worker-stats
```

Retorna todas las métricas para mostrar en Admin UI.

---

## Seguridad

### Autenticación

- **UI/Users**: JWT Token
- **Workers**: API Key
- **Admin**: JWT + Role Check

### Rate Limiting (Scraping)

- Delay entre requests: 2-3 segundos
- Delay entre documentos: 5-10 segundos
- Máximo páginas de movimientos: 10

### Protección de Datos

- Expedientes privados (`isPrivate: true`) no muestran detalles
- Solo usuarios autenticados pueden ver movimientos/intervinientes
