# EJE API

API REST para el sistema EJE (Expediente Judicial Electrónico) del Poder Judicial de la Ciudad de Buenos Aires.

## Descripción

Esta API sirve como puente entre la UI/Admin UI y los datos de expedientes judiciales extraídos por los workers de scraping (`eje-workers`). Proporciona endpoints para:

- Consulta y búsqueda de causas judiciales
- Gestión de asociaciones folder-causa
- Monitoreo de workers de scraping
- Estadísticas y reportes

## Estructura del Proyecto

```
eje-api/
├── src/
│   ├── config/
│   │   ├── aws.js              # Cliente AWS SES para emails
│   │   ├── env.js              # Carga de secretos desde AWS Secrets Manager
│   │   └── pino.js             # Configuración del logger
│   ├── controllers/
│   │   ├── causasEjeController.js        # CRUD y búsqueda de causas
│   │   ├── causasEjeServiceController.js # Operaciones de servicio (folders, locks)
│   │   └── workerStatsController.js      # Estadísticas de procesamiento
│   ├── middleware/
│   │   └── auth.js             # Autenticación JWT, API Key, Admin
│   ├── routes/
│   │   ├── index.js            # Agregador de rutas
│   │   ├── causasEjeRoutes.js
│   │   ├── causasEjeServiceRoutes.js
│   │   └── workerStatsRoutes.js
│   ├── service/
│   │   └── causasEjeService.js # Lógica de negocio
│   ├── utils/
│   │   └── helpers.js          # Funciones utilitarias
│   ├── logs/                   # Archivos de log (auto-generado)
│   └── server.js               # Entry point de la aplicación
├── ecosystem.config.js         # Configuración PM2
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Instalación

```bash
# Clonar el repositorio
cd /home/mcerra/www
git clone <repo-url> eje-api

# Instalar dependencias
cd eje-api
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con las credenciales correctas

# Iniciar en desarrollo
npm run dev
```

## Variables de Entorno

```env
# Server
PORT=3004
NODE_ENV=development

# MongoDB
URLDB=mongodb://localhost:27017/law-analytics
URLDB_LOCAL=mongodb://localhost:27017/law-analytics-local

# Autenticación
JWT_SECRET=your-jwt-secret
SEED=your-seed-fallback
API_KEY=your-api-key-for-workers

# AWS (opcional, para producción)
AWS_SES_KEY_ID=
AWS_SES_ACCESS_KEY=
```

## Scripts

```bash
npm run dev      # Desarrollo con nodemon (puerto 3004)
npm run local    # Local con nodemon (puerto 8084)
npm run start    # Producción
npm run prod     # Producción con NODE_ENV=production
```

## Autenticación

La API soporta tres métodos de autenticación:

### 1. JWT Token
- Cookie: `auth_token`
- Header: `Authorization: Bearer <token>`
- Query param: `?token=<token>`

### 2. API Key (para workers)
- Header: `x-api-key: <key>` o `api-key: <key>`
- Query param: `?apiKey=<key>`
- Body: `{ "apiKey": "<key>" }`

### 3. Admin Role
Requiere JWT + usuario con `role: 'ADMIN_ROLE'`

---

## Endpoints

### Health Check

```
GET /api/health
```

Respuesta:
```json
{
  "success": true,
  "message": "EJE API is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "development"
}
```

---

### Causas EJE

#### Obtener estadísticas

```
GET /api/causas-eje/stats
Auth: JWT o API Key
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "total": 150,
    "verified": 120,
    "valid": 145,
    "private": 10,
    "detailsLoaded": 100,
    "pendingVerification": 30,
    "pendingDetails": 20,
    "withErrors": 5,
    "estadoDistribution": [
      { "_id": "EN LETRA", "count": 80 },
      { "_id": "ARCHIVADO", "count": 40 }
    ],
    "recentActivity": [...]
  }
}
```

#### Buscar causas

```
GET /api/causas-eje/buscar
Auth: JWT o API Key
```

Query params:
| Param | Tipo | Descripción |
|-------|------|-------------|
| `cuij` | string | Filtrar por CUIJ (parcial) |
| `numero` | number | Número de expediente |
| `anio` | number | Año |
| `caratula` | string | Búsqueda en carátula |
| `juzgado` | string | Filtrar por juzgado |
| `objeto` | string | Filtrar por objeto |
| `estado` | string | Estado (EN LETRA, ARCHIVADO, etc.) |
| `verified` | boolean | Filtrar verificados |
| `isValid` | boolean | Filtrar válidos |
| `isPrivate` | boolean | Filtrar privados |
| `detailsLoaded` | boolean | Filtrar con detalles cargados |
| `folderId` | ObjectId | Causas de un folder |
| `userId` | ObjectId | Causas de un usuario |
| `update` | boolean | Filtrar con updates habilitados |
| `fechaInicioFrom` | date | Fecha inicio desde |
| `fechaInicioTo` | date | Fecha inicio hasta |
| `page` | number | Página (default: 1) |
| `limit` | number | Items por página (default: 20, max: 100) |
| `sortBy` | string | Campo para ordenar (default: createdAt) |
| `sortOrder` | string | asc o desc (default: desc) |

Respuesta:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### Buscar por CUIJ

```
GET /api/causas-eje/cuij/:cuij
Auth: JWT o API Key
```

#### Buscar por número y año

```
GET /api/causas-eje/:number/:year
Auth: JWT o API Key
```

#### Buscar por ID

```
GET /api/causas-eje/id/:id
Auth: JWT o API Key
```

#### Obtener movimientos

```
GET /api/causas-eje/:id/movimientos
Auth: JWT
```

Query params:
- `page`: Página (default: 1)
- `limit`: Items por página (default: 20, max: 100)

Respuesta:
```json
{
  "success": true,
  "data": [
    {
      "fecha": "2024-01-15T10:30:00.000Z",
      "tipo": "CEDELE",
      "descripcion": "CEDULA ELECTRONICA",
      "detalle": "...",
      "firmante": "Dr. Juan Pérez",
      "numero": "12345"
    }
  ],
  "pagination": {...},
  "cuij": "EXP J-01-00015050-5/2021-0"
}
```

#### Obtener intervinientes

```
GET /api/causas-eje/:id/intervinientes
Auth: JWT
```

Respuesta:
```json
{
  "success": true,
  "data": [
    {
      "tipo": "ACTOR",
      "nombre": "GCBA",
      "representante": "MANDATARIO: Juan Pérez"
    },
    {
      "tipo": "DEMANDADO",
      "nombre": "María García"
    }
  ],
  "cuij": "EXP J-01-00015050-5/2021-0"
}
```

#### Obtener causas relacionadas

```
GET /api/causas-eje/:id/relacionadas
Auth: JWT
```

#### Causas por folder

```
GET /api/causas-eje/folder/:folderId
Auth: JWT
```

#### Causas por usuario

```
GET /api/causas-eje/user/:userId
Auth: JWT
```

Query params: `page`, `limit`

#### Crear causa (Admin)

```
POST /api/causas-eje
Auth: JWT + Admin
```

Body:
```json
{
  "cuij": "EXP J-01-00015050-5/2021-0",
  "numero": 15050,
  "anio": 2021,
  "caratula": "GCBA CONTRA ...",
  "objeto": "EJECUCION FISCAL",
  "juzgado": "JUZGADO 19",
  "source": "app"
}
```

#### Actualizar causa (Admin)

```
PATCH /api/causas-eje/:id
Auth: JWT + Admin
```

Body: campos a actualizar

#### Eliminar causa (Admin)

```
DELETE /api/causas-eje/:id
Auth: JWT + Admin
```

---

### Causas EJE Service

#### Asociar folder a causa

```
POST /api/causas-eje-service/associate-folder
Auth: JWT
```

Body:
```json
{
  "folderId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "causaId": "60f7b3b3b3b3b3b3b3b3b3b4",  // opcional
  "cuij": "EXP J-01-00015050-5/2021-0",    // opcional
  "numero": 15050,                          // opcional
  "anio": 2021,                             // opcional
  "searchTerm": "15050/2021"                // opcional, para historial
}
```

> Nota: Debe proporcionar `causaId`, `cuij`, o `numero/anio`

Respuesta:
```json
{
  "success": true,
  "message": "Folder associated to existing causa",
  "created": false,
  "causaId": "60f7b3b3b3b3b3b3b3b3b3b4",
  "cuij": "EXP J-01-00015050-5/2021-0"
}
```

#### Desasociar folder de causa

```
DELETE /api/causas-eje-service/dissociate-folder
Auth: JWT
```

Body:
```json
{
  "causaId": "60f7b3b3b3b3b3b3b3b3b3b4",
  "folderId": "60f7b3b3b3b3b3b3b3b3b3b3"
}
```

#### Buscar causa por folder

```
GET /api/causas-eje-service/by-folder/:folderId
Auth: JWT
```

#### Actualizar preferencia de updates

```
PATCH /api/causas-eje-service/update-preference
Auth: JWT
```

Body:
```json
{
  "causaId": "60f7b3b3b3b3b3b3b3b3b3b4",
  "enabled": true
}
```

#### Endpoints para Workers

```
GET /api/causas-eje-service/pending-verification?limit=10
Auth: API Key
```

```
GET /api/causas-eje-service/pending-update?limit=10
Auth: API Key
```

```
POST /api/causas-eje-service/lock/:causaId
Auth: API Key
Body: { "workerId": "verification-worker-1" }
```

```
POST /api/causas-eje-service/unlock/:causaId
Auth: API Key
```

---

### Worker Stats

#### Obtener estadísticas de procesamiento

```
GET /api/worker-stats
Auth: JWT o API Key
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "total": 150,
    "verification": {
      "pending": 30,
      "completed": 120,
      "rate": "80.0"
    },
    "details": {
      "pending": 20,
      "completed": 100,
      "rate": "83.3"
    },
    "status": {
      "valid": 145,
      "invalid": 5,
      "private": 10
    },
    "processing": {
      "locked": 2,
      "stuck": 0,
      "recentlyProcessed": 15
    },
    "errors": {
      "total": 5,
      "distribution": [
        { "_id": 1, "count": 3 },
        { "_id": 2, "count": 2 }
      ]
    }
  }
}
```

#### Obtener actividad reciente

```
GET /api/worker-stats/activity?hours=24
Auth: JWT o API Key
```

#### Obtener documentos con errores (Admin)

```
GET /api/worker-stats/errors?page=1&limit=20
Auth: JWT + Admin
```

#### Obtener documentos stuck (Admin)

```
GET /api/worker-stats/stuck
Auth: JWT + Admin
```

#### Limpiar locks stuck (Admin)

```
POST /api/worker-stats/clear-stuck
Auth: JWT + Admin
```

#### Reset error count (Admin)

```
POST /api/worker-stats/reset-error/:id
Auth: JWT + Admin
```

---

## Modelo de Datos

### CausasEje

```javascript
{
  // Identificación
  cuij: String,           // "EXP J-01-00015050-5/2021-0"
  numero: Number,         // 15050
  anio: Number,           // 2021

  // Datos del expediente
  caratula: String,
  objeto: String,
  monto: Number,
  montoMoneda: String,    // default: "ARS"
  fechaInicio: Date,
  juzgado: String,
  sala: String,
  tribunalSuperior: String,
  ubicacionActual: String,
  estado: String,         // "EN LETRA", "ARCHIVADO", etc.

  // Movimientos
  movimientos: [{
    fecha: Date,
    tipo: String,
    descripcion: String,
    detalle: String,
    firmante: String,
    numero: String
  }],
  movimientosCount: Number,
  ultimoMovimiento: Date,

  // Intervinientes
  intervinientes: [{
    tipo: String,         // "ACTOR", "DEMANDADO", "FISCAL"
    nombre: String,
    representante: String
  }],

  // Causas relacionadas
  causasRelacionadas: [{
    cuij: String,
    caratula: String,
    relacion: String
  }],

  // Estado de procesamiento
  isPrivate: Boolean,
  source: String,         // "app", "import", "scraping"
  verified: Boolean,
  verifiedAt: Date,
  isValid: Boolean,
  detailsLoaded: Boolean,
  detailsLastUpdate: Date,
  lastError: String,
  errorCount: Number,
  stuckSince: Date,

  // Locking para workers
  lockedBy: String,
  lockedAt: Date,

  // Asociaciones
  folderIds: [ObjectId],
  userCausaIds: [ObjectId],
  userUpdatesEnabled: [{
    userId: ObjectId,
    enabled: Boolean
  }],
  update: Boolean,
  updateHistory: [{
    timestamp: Date,
    source: String,
    updateType: String,   // "link", "unlink", "update", "verify"
    success: Boolean,
    movimientosAdded: Number,
    movimientosTotal: Number,
    details: Object
  }],

  // Timestamps
  createdAt: Date,
  updatedAt: Date,
  lastUpdate: Date
}
```

---

## PM2

### Iniciar con PM2

```bash
# Desarrollo
pm2 start ecosystem.config.js --env development

# Local
pm2 start ecosystem.config.js --env local

# Producción
pm2 start ecosystem.config.js --env production
```

### Comandos útiles

```bash
pm2 list                    # Ver procesos
pm2 logs eje/api            # Ver logs
pm2 restart eje/api         # Reiniciar
pm2 stop eje/api            # Detener
pm2 delete eje/api          # Eliminar
```

---

## Integración con eje-workers

Los workers utilizan esta API para:

1. **Obtener causas pendientes de procesamiento**
   ```
   GET /api/causas-eje-service/pending-verification
   GET /api/causas-eje-service/pending-update
   ```

2. **Bloquear causas durante el procesamiento**
   ```
   POST /api/causas-eje-service/lock/:causaId
   ```

3. **Liberar causas después del procesamiento**
   ```
   POST /api/causas-eje-service/unlock/:causaId
   ```

Los workers deben usar el header `x-api-key` con el valor de `API_KEY`.

---

## Integración con law-analytics-server

La API de `law-analytics-server` puede usar los endpoints de servicio para:

1. **Asociar folders a causas EJE**
   - Cuando un usuario vincula un folder con una causa EJE
   - Endpoint: `POST /api/causas-eje-service/associate-folder`

2. **Consultar causas por folder**
   - Para mostrar la causa asociada a un folder
   - Endpoint: `GET /api/causas-eje-service/by-folder/:folderId`

3. **Gestionar preferencias de actualización**
   - Para habilitar/deshabilitar actualizaciones automáticas
   - Endpoint: `PATCH /api/causas-eje-service/update-preference`

---

## Errores Comunes

### 401 Unauthorized
- Token JWT inválido o expirado
- API Key incorrecta
- Falta de autenticación

### 403 Forbidden
- Usuario no tiene rol de admin para endpoint protegido

### 404 Not Found
- Causa no encontrada
- Endpoint no existe

### 500 Internal Server Error
- Error de base de datos
- Error interno del servidor

---

## Logs

Los logs se guardan en `src/logs/logger.log` y se limpian automáticamente cuando exceden 10MB.

Niveles de log:
- `error`: Errores críticos
- `warn`: Advertencias
- `info`: Información general
- `debug`: Información de debugging

---

## Contribución

1. Crear branch desde `main`
2. Hacer cambios
3. Crear PR con descripción clara

---

## Licencia

ISC - Law Analytics
