---
name: monitor-eje-api
description: Carga contexto operacional de eje-api (API REST para causas EJE/CABA — 1 proceso PM2 `eje/api` en 🔵 hub 15.229.93.121, puerto 3004, max-mem 1GB). 46 endpoints + /health en 4 dominios: causas-eje, causas-eje-service (M2M con API key para workers), worker-stats, config (incluye sub-dominio manager). **Tiene auth dual JWT + API key** porque eje-workers consume este API. Sin .env.local propio — comparte creds con law-analytics-server (`DEPLOY_PM2_APP=eje/api`).
---

# Skill — monitor-eje-api

Contexto operacional vivo de **eje-api**, la API REST de causas EJE (Expediente Judicial Electrónico, CABA). Lo lee `/monitor-eje-api` antes de inspeccionar; se va llenando con cada corrida.

> **Convención**: append-only en secciones `<!-- APPEND HERE -->`. Curado manual cuando supere ~15kb.

## 1. Cuándo activar

- Antes de inspeccionar eje-api (vía `/monitor-eje-api` o ad-hoc).
- Cuando reportan errores en consumo de la API desde law-analytics-front o admin.
- Cuando `eje-workers` (worker-cloud-01) reporta `401 unauthorized` o `5xx` en sus llamadas a `causas-eje-service/*` — el workers consume este API con API key.
- Cuando un pivote EJE no resuelve (causa con isPivot que no avanza).
- Antes de tocar `src/routes/*` o `src/controllers/*`.

## 2. Arquitectura del servicio

`eje-api` corre como **1 proceso PM2 `eje/api`** (con slash) en **🔵 hub `15.229.93.121`**. Ver [[ecosystem-topology]] para el mapa completo.

- Path: `/var/www/eje-api`
- PM2 bin: `/usr/bin/pm2` (global) — requiere `sudo pm2 ...` en hub
- Puerto: `3004` (dev), prod sin PORT explícito (probablemente detrás de NGINX)
- Max memory restart: **1GB** (más grande que pjsalta-api que es 500M)
- Express.js + Mongoose + JWT + **`verifyApiKey`** (M2M)
- Modelos: `eje-models` (github:cerramaximiliano/eje-models — NPM github dep, NO file://)
- AWS Secrets Manager + AWS SES

### 2.1 Auth (DUAL: JWT + API key)

Esta API tiene 3 middlewares (`src/middleware/auth.js`):
| Middleware | Acepta | Uso |
|---|---|---|
| `verifyToken` | JWT desde cookie / header / query | Endpoints de usuarios finales |
| `verifyAdmin` | usuario con role admin/superadmin (tras `verifyToken`) | Mutaciones admin |
| `verifyApiKey` | API key estática (env) | M2M — usado por `eje-workers` |
| `verifyTokenOrApiKey` | acepta JWT **O** API key | Endpoints que sirven tanto a front como a workers |

⚠️ **Diferencia importante con pjsalta-api**: eje-api SÍ tiene M2M auth. Los workers consultan `causas-eje-service/*` (pending-verification, pending-update, lock, unlock) con API key — no usan Mongoose directo.

### 2.2 Dominios funcionales

Todos los routers cuelgan de `/api`:

| Dominio | Mount path | Endpoints | Auth principal |
|---|---|---|---|
| **Health** | `/api/health` | 1 (GET) | público |
| **Causas EJE** | `/api/causas-eje/*` | 16 (CRUD + search + folder/user/cuij/id + movimientos/intervinientes/relacionadas + pivote resolve) | mayoría `verifyTokenOrApiKey`, CRUD admin con `verifyAdmin` |
| **Causas EJE service** | `/api/causas-eje-service/*` | 8 (folder management + worker-facing M2M) | `verifyToken` o `verifyApiKey` (los M2M solo aceptan key) |
| **Worker stats** | `/api/worker-stats/*` | 7 (stats + admin: errors, stuck, clear, reset) | token + admin |
| **Config** | `/api/config/*` | 17 (general + manager subdomain + worker-stats nested) | token + admin |

Total: **46 endpoints + /health**.

### 2.3 Mapa detallado de endpoints

**Causas EJE** (`src/routes/causasEjeRoutes.js`):
- `GET /api/causas-eje/stats` (tokenOrApiKey)
- `GET /api/causas-eje/buscar` y `/search` (tokenOrApiKey) — aliases
- `GET /api/causas-eje/folder/:folderId` (token)
- `GET /api/causas-eje/user/:userId` (token)
- `GET /api/causas-eje/cuij/:cuij` (tokenOrApiKey)
- `GET /api/causas-eje/id/:id` (tokenOrApiKey)
- `GET /api/causas-eje/:id/movimientos` (token)
- `GET /api/causas-eje/:id/intervinientes` (token)
- `GET /api/causas-eje/:id/relacionadas` (token)
- `GET /api/causas-eje/:id/linked-causas` (token)
- `POST /api/causas-eje/:id/resolve` (admin) — resuelve pivote
- `GET /api/causas-eje/:number/:year` (tokenOrApiKey)
- `POST /api/causas-eje/` (admin) — crea
- `PATCH /api/causas-eje/:id` (admin)
- `DELETE /api/causas-eje/:id` (admin)

**Causas EJE service** (`src/routes/causasEjeServiceRoutes.js`):
- `POST /api/causas-eje-service/associate-folder` (tokenOrApiKey)
- `DELETE /api/causas-eje-service/dissociate-folder` (token)
- `GET /api/causas-eje-service/by-folder/:folderId` (token)
- `PATCH /api/causas-eje-service/update-preference` (token)
- `GET /api/causas-eje-service/pending-verification` (**apiKey only** — workers)
- `GET /api/causas-eje-service/pending-update` (**apiKey only** — workers)
- `POST /api/causas-eje-service/lock/:causaId` (**apiKey only** — workers)
- `POST /api/causas-eje-service/unlock/:causaId` (**apiKey only** — workers)

**Worker stats** (`src/routes/workerStatsRoutes.js`):
- `GET /api/worker-stats/` (tokenOrApiKey)
- `GET /api/worker-stats/activity` (tokenOrApiKey)
- `GET /api/worker-stats/eligibility` (tokenOrApiKey)
- `GET /api/worker-stats/errors` (admin)
- `GET /api/worker-stats/stuck` (admin)
- `POST /api/worker-stats/clear-stuck` (admin)
- `POST /api/worker-stats/reset-error/:id` (admin)

**Config** (`src/routes/configRoutes.js`):
- `GET /api/config/` (tokenOrApiKey) — config global
- `PATCH /api/config/` (admin)
- `POST /api/config/toggle` (admin)
- `GET /api/config/manager` (tokenOrApiKey) — config del eje-manager
- `GET /api/config/manager/full` (admin)
- `PATCH /api/config/manager` (admin)
- `POST /api/config/manager/toggle` (admin) — flip `isRunning`
- `POST /api/config/manager/pause` (admin) — flip `isPaused`
- `GET /api/config/manager/history` (admin)
- `GET /api/config/manager/alerts` (admin)
- `POST /api/config/manager/alerts/:index/acknowledge` (admin)
- `GET /api/config/manager/daily-stats` (admin)
- `GET /api/config/manager/workers` (admin)
- `PATCH /api/config/manager/settings` (admin)
- `GET /api/config/manager/worker/:workerType` (admin)
- `PATCH /api/config/manager/worker/:workerType` (admin)
- `POST /api/config/manager/worker/:workerType/toggle` (admin)
- `GET /api/config/worker-stats` (tokenOrApiKey) — duplica path con /worker-stats top-level
- `GET /api/config/worker-stats/today` (tokenOrApiKey)
- `GET /api/config/worker-stats/:workerType/:workerId/runs` (admin)

⚠️ Hay duplicación entre `/api/worker-stats/*` y `/api/config/worker-stats/*` — probablemente alias / leftover. Verificar primer monitoreo si ambos se usan.

### 2.4 Consumidores

- **`law-analytics-front`** — usuarios finales (via JWT). Endpoints típicos: search, stats, folder/user/cuij.
- **`law-analytics-admin`** — admin UI consume causas-eje admin endpoints + config manager.
- **`eje-workers`** (worker-cloud-01) — consume `causas-eje-service/{pending-*,lock,unlock}` con **API key** (M2M).

URLs públicas conocidas:
- Prod: pendiente confirmar — probable `https://eje.lawanalytics.com.ar` o ruteo via NGINX desde `api.lawanalytics.com.ar`.

### 2.5 Dependencias externas

- **MongoDB Atlas** (cluster compartido con eje-workers). Colección principal: `causaseje` (o similar — verificar en `eje-models`).
- **AWS Secrets Manager** — `URLDB`, `JWT_SECRET`/`SEED`, `API_KEY` (M2M), `AWS_SES_*`.
- **AWS SES** — emails desde algunos flows (pending selection digest, alertas).
- **JWT firmado por law-analytics-server** — no firma tokens nuevos, solo valida.

## 3. Endpoint de health

`GET /api/health` (definido inline en `src/routes/index.js`).

```bash
# URL pendiente de confirmar — primer monitoreo capturarla
curl -sS -o /dev/null -w "HTTP %{http_code} en %{time_total}s\n" \
  "https://<eje-prod-url>/api/health" --max-time 10
```

Respuesta esperada: `{ success: true, message: "EJE API is running", timestamp, environment }`.

## 4. Errores conocidos
<!-- Cada entrada: descripción + patrón grep + dominio afectado + acción típica -->
<!-- APPEND HERE -->

_(Sin entradas todavía — primer monitoreo lo poblará.)_

## 5. Endpoints con comportamiento especial
<!-- Endpoints que requieren consideraciones especiales (rate limit, timeouts largos, side-effects, M2M) -->
<!-- APPEND HERE -->

### `/api/causas-eje-service/{pending-verification,pending-update}` (apiKey only)
Endpoints **M2M consumidos por eje-workers**. Si fallan, los workers no pueden tomar trabajo nuevo — el portal EJE deja de scrapear-se aunque PM2 esté online.

### `/api/causas-eje-service/{lock,unlock}/:causaId` (apiKey only)
Side-effect: ponen/sacan locks en la causa para evitar doble procesamiento entre workers cluster. Si el unlock falla, la causa queda lock hasta que `eje-stuck-worker` la libere.

### `/api/causas-eje/:id/resolve` (admin)
Side-effect: resuelve un pivote (`isPivot: true`) moviendo `folderIds`/`userCausaIds` a la causa elegida + reasigna folders.

### `PATCH /api/config/manager*`
Cambios entran "en caliente" — el `eje-manager` (en worker-cloud-01) los lee en cada tick.

### `/api/worker-stats/clear-stuck` (admin)
Limpia locks expirados manualmente. Útil si el `eje-stuck-worker` está caído.

## 6. Queries útiles
<!-- Snippets SSH / pm2 / mongo -->
<!-- APPEND HERE -->

### Estado del proceso en hub
```bash
ssh -i /home/mcerra/www/lawanalytics.app.pem ubuntu@15.229.93.121 \
  "sudo pm2 list | grep eje/api"
```

### Logs (path estimado — confirmar con `pm2 show eje/api`)
```bash
$SSH_CMD "sudo pm2 show 'eje/api' | grep -E 'out log path|error log path'"
```

### Top endpoints en out.log
```bash
$SSH_CMD "sudo tail -n 500 /var/www/eje-api/logs/<out-file> | grep -oE '/api/(causas-eje[a-z-]*|worker-stats|config[a-z-/]*|health)' | sort | uniq -c | sort -rn | head -10"
```

### 4xx/5xx por dominio
```bash
$SSH_CMD "sudo tail -n 1000 /var/www/eje-api/logs/<out-file> | grep -E ' (4|5)[0-9]{2} ' | grep -oE '/api/[a-z-]+' | sort | uniq -c | sort -rn | head -10"
```

### Requests con API key (M2M de workers)
```bash
$SSH_CMD "sudo tail -n 500 /var/www/eje-api/logs/<out-file> | grep -iE 'apiKey|x-api-key|/causas-eje-service/(pending|lock|unlock)' | tail -50"
```

### Pendientes en Mongo (verifier + updater)
```bash
# Desde un box con acceso al cluster
mongo "$URLDB" --eval '
  db.getCollection("causaseje").aggregate([
    { $group: { _id: { verified: "$verified", isValid: "$isValid", update: "$update" }, n: { $sum: 1 } } },
    { $sort: { n: -1 } }
  ]).toArray()
'
```

## 7. Métricas baseline
<!-- Valores esperables en operación normal -->
<!-- APPEND HERE -->

_(Sin baselines todavía. Capturables en primer monitoreo: req/min promedio, RAM estable, latencia p95 de endpoints calientes — probablemente search/stats + el polling de los workers a `pending-*`.)_

## 8. Patrones de incidente
<!-- Síntoma → diagnóstico -->
<!-- APPEND HERE -->

_(Vacío — se llenará con incidentes reales.)_

## 9. Cosas que NO hacer

- **No restartear `eje/api` sin razón**: pierde flow en curso y los workers en worker-cloud-01 empiezan a fallar con `ECONNREFUSED` o timeouts hasta que vuelve.
- **No rotar el `API_KEY` sin coordinar con eje-workers**: ambos lados leen del mismo AWS Secret, pero hay que restartear los workers con `--update-env` para que pinchen la nueva key.
- **No editar `src/` directamente en el server**: cambios se sobreescriben en próximo `/deploy`.
- **No agregar endpoints M2M sin `verifyApiKey`**: cualquier endpoint nuevo que tenga que ser consumido por workers debe tener auth M2M, no solo JWT.
- **No olvidar el nombre exacto del proceso PM2**: es `eje/api` (con slash), no `eje-api`. Comandos como `pm2 restart eje-api` fallan silenciosamente.
- **No asumir que un 401 en M2M es bug del server**: la mayoría son `API_KEY` desactualizado en el worker tras un rotate.

## 10. Cómo se actualiza este skill

`/monitor-eje-api` al cierre puede:
- Agregar entradas en `## 4. Errores conocidos` (con grep pattern + dominio).
- Agregar entradas en `## 5. Endpoints con comportamiento especial`.
- Agregar snippets en `## 6. Queries útiles`.
- Agregar baselines en `## 7. Métricas baseline`.
- Agregar patrones en `## 8. Patrones de incidente`.

Formato de entrada nueva:
```markdown
### <título corto>
<!-- detectado: YYYY-MM-DD | dominio: <causas-eje|causas-eje-service|worker-stats|config|manager> | auth: <token|apiKey|admin> -->
**Síntoma**: <una línea>
**Patrón de detección**: `<grep o regex>`
**Acción**: <qué hacer>
```

## 11. Relacionados

- [[monitor-eje-workers]] — workers que consumen este API con API key (M2M) + escriben las colecciones que esta API lee
- [[ecosystem-topology]] — topología (eje/api en hub, eje-workers en worker-cloud-01)
- [[monitor-pjsalta-api]] — patrón similar pero sin M2M (workers PJSalta van directo a Mongo)
- [[monitor-pjn-api]] — patrón similar de single-PM2 con muchos routers en hub
- `eje-models` (github dep) — schemas Mongoose compartidos
- `law-analytics-server` — firma el JWT, comparte el `.env.local` para deploy de eje-api
- AWS Secret (`URLDB`, `API_KEY`, `JWT_SECRET`/`SEED`)
