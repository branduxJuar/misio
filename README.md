# Misio — Plataforma de Sorteos "Cero Pérdida" 🎰⚡

PWA de rifas donde el boleto perdedor regresa como saldo digital ("Misio")
canjeable en la tienda interna. Incluye Bingo Familiar (leads), Modo
Presentador para sorteos en vivo con tiradas "al agua" y un ERP logístico
para el Super Admin (inventario, márgenes y tracking nacional).

## Estructura del Monorepo

```
misio/
├── client/                      # Frontend — React + Vite + AntD (PWA)
│   ├── vite.config.js           # Config Vite + vite-plugin-pwa (manifest)
│   └── src/
│       ├── main.jsx             # ConfigProvider (tema oscuro) + locale es_ES
│       ├── App.jsx              # Shell + Router (4 vistas)
│       ├── theme/misioTheme.js  # Tokens del tema Dark Gaming
│       ├── mocks/mockData.js    # TODA la data ficticia (1 solo archivo)
│       └── views/
│           ├── MarketplaceLanding/      # Vitrina + pasarela simulada
│           ├── UserDashboard/           # Saldo, boletos, tienda de canjes
│           ├── LiveDrawRoom/            # Modo Presentador (al agua)
│           └── AdminLogisticsDashboard/ # ERP: KPIs, inventario, envíos
│
└── server/                      # Backend — NestJS + Mongoose
    └── src/
        ├── main.ts              # Bootstrap (prefijo /api/v1, CORS, pipes)
        ├── app.module.ts        # Módulo raíz + conexión MongoDB
        ├── users/               # Schema User + walletBalance atómico
        ├── raffles/             # Schema Raffle + winningAttempt (al agua)
        ├── tickets/             # Schema Ticket + burn/winner endpoints
        ├── transactions/        # Ledger de la Billetera (Cero Pérdida)
        └── logistics/           # ERP: costos, márgenes, tracking, evidencia
```

Cada módulo del backend sigue el patrón `schema + module + controller +
service`, y cada vista del frontend vive en su propia carpeta: ideal para
que cada dev junior trabaje una feature en su rama de Gitflow
(`feature/live-draw-room`, `feature/wallet-refunds`, etc.).

## Cómo levantar el proyecto

### Backend
```bash
cd server
cp .env.example .env      # ajustar MONGO_URI si es necesario
npm install
npm run start:dev         # http://localhost:3000/api/v1
```

### Frontend
```bash
cd client
npm install
npm run dev               # http://localhost:5173
```

Las 4 vistas renderizan de inmediato con mock data (`src/mocks/mockData.js`).
Para conectar el backend real, reemplazar los imports de mocks por
fetch/axios a `/api/v1/*` — los shapes ya coinciden con los esquemas Mongoose.

## Reglas de negocio clave (implementadas en los esquemas)

- **Cero Pérdida:** `TransactionsService.refundCeroPerdida()` acredita el
  valor del boleto perdedor a `User.walletBalance`. El saldo NUNCA se edita
  sin transacción (ledger auditable).
- **Al agua:** `Raffle.winningAttempt = N` → las tiradas 1..N-1 marcan
  boletos como `burned_al_agua`; la tirada N marca el `winner`.
- **ERP:** `LogisticsService.financialSummary()` calcula margen neto
  (ingresos por boletos − costo de premios) con un aggregate de MongoDB.

## Convención de colores (tema Dark Gaming)

| Color | Hex | Uso exclusivo |
|---|---|---|
| Púrpura eléctrico | `#7c4dff` | Acciones primarias, marca |
| Azul eléctrico | `#2e9bff` | Enlaces, streams, info |
| Verde neón | `#00e58f` | **Solo** saldo Misio e ingresos |
| Dorado | `#f5c542` | **Solo** premios y ganadores |

## Roadmap sugerido (Gitflow)

1. `feature/auth-jwt` — login por DNI + celular (OTP).
2. `feature/websockets-live` — participantes y tiradas en tiempo real.
3. `feature/bingo-familiar` — módulo gratuito de captación de leads.
4. `feature/yape-webhook` — confirmación automática de depósitos.

---

## ✅ Iteración 1 — Auth y Seguridad (completada)

**Backend nuevo:**
- `src/auth/` — AuthModule completo: registro/login por DNI + contraseña
  (bcrypt), JWT firmado (`JWT_SECRET` en .env), `JwtStrategy` de Passport.
- Guards: `JwtAuthGuard` (exige token) y `RolesGuard` + decorador
  `@Roles(UserRole.ADMIN)` para endpoints de admin.
- Decorador `@CurrentUser()`: el userId sale SIEMPRE del token, nunca del
  body — nadie compra boletos ni consulta saldos a nombre de otro.
- DTOs con class-validator en TODOS los módulos (`dto/` por módulo):
  bodies inválidos → 400 con mensaje en español; campos extra → eliminados
  por el whitelist del ValidationPipe.

**Mapa de permisos:**
| Endpoint | Acceso |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Público |
| `GET /raffles`, `GET /raffles/:id` | Público (vitrina) |
| `GET /users/me`, `GET /tickets/mine`, `GET /transactions/mine` | Autenticado |
| `POST /tickets`, `POST /transactions/deposit` | Autenticado |
| `POST/PATCH /raffles`, `/tickets/:id/burn`, `/tickets/:id/winner` | Solo admin |
| Todo `/logistics` y `GET /users` | Solo admin |

**Frontend nuevo:**
- `src/auth/AuthContext.jsx` — sesión global con restauración al recargar
  (token en localStorage → `GET /users/me`).
- `src/auth/api.js` — cliente fetch que inyecta el Bearer token.
- `src/auth/ProtectedRoute.jsx` — `/mi-cuenta` exige sesión; `/admin`
  exige rol admin (y el menú oculta "Admin ERP" a usuarios normales).
- `src/views/AuthPage/` — login/registro en tabs con validación AntD.

**Crear el primer admin:**
```bash
cd server
node scripts/create-admin.js 12345678 miClaveSegura "Nombre Admin" 987654321
```

**Nota de diseño:** el registro devuelve el token de inmediato (login
automático) y el rol admin JAMÁS se asigna vía API — solo con el script o
directamente en Mongo. Login por OTP/SMS queda como mejora futura
(reemplaza el password en `AuthService` sin tocar guards ni frontend).

---

## ✅ Iteración 2 — Compra atómica, depósitos Yape y seed (completada)

**Compra atómica de boletos (`POST /tickets/purchase`):**
Todo ocurre dentro de una transacción MongoDB — o pasa completo, o no pasa nada:
1. Valida rifa en venta → 2. asigna los N números libres más bajos →
3. descuenta el saldo Misio (falla si no alcanza) → 4. inserta boletos
(el índice único detecta colisiones → retry automático, máx. 3) →
5. registra el movimiento en el ledger.

> ⚠️ **Requisito:** las transacciones MongoDB exigen replica set.
> MongoDB Atlas lo trae por defecto. En local:
> `mongod --replSet rs0` y luego `rs.initiate()` en mongosh.

**Flujo de depósitos Yape/Plin (confirmación manual):**
1. Usuario registra recarga → transacción `deposit_yape` nace `pending`
   (el saldo NO se toca).
2. El operador ve la cola en el panel admin (`GET /transactions/pending`),
   verifica su app de Yape y Confirma o Rechaza.
3. Confirmar acredita el saldo; el filtro por status `pending` en el
   backend impide acreditar dos veces (doble clic / dos admins).

**Frontend conectado (con fallback a demo):**
- Hook `useApiOrMock`: intenta la API real y cae al mock si el backend no
  responde — el prototipo sigue renderizando solo, con banner "Modo demo".
- Marketplace: rifas reales con `soldTickets` del aggregate; checkout con
  opción "⚡ Saldo Misio" (compra real) o Yape/Plin (registra recarga pendiente).
- Mi Misio: saldo, boletos y ledger reales (los depósitos pendientes se
  muestran con tag "Pendiente").
- Admin: nueva tarjeta "Depósitos por confirmar" con Confirmar/Rechazar.

**Seed de desarrollo:**
```bash
cd server
node scripts/seed.js
# Admin:  DNI 11111111 / admin123
# Carla:  DNI 74581236 / demo123  (saldo S/ 47)
# Jorge:  DNI 45678912 / demo123  (saldo S/ 10 + 1 depósito pendiente)
```

---

## ✅ Iteración 3 — LiveDrawRoom en tiempo real (completada)

**Backend (`src/live/`):**
- `LiveGateway` (Socket.IO, namespace `/live`): salas por rifa
  (`raffle:<id>`), contador de espectadores en vivo, y evento
  `presenter_draw` que ejecuta la tirada y transmite `draw_result` a toda
  la sala al instante.
- Seguridad: los espectadores entran SIN token; el presentador manda su
  JWT en el handshake y el gateway lo verifica **en cada tirada** (rol
  admin obligatorio). Los errores vuelven solo al presentador vía ack.
- `LiveService.drawNext()`: el número de intento se DERIVA de los boletos
  ya quemados (stateless: un reinicio del server no pierde el conteo).
  Boleto aleatorio con `$sample` de MongoDB. La tirada `winningAttempt`
  marca al ganador y pasa la rifa a `completed`.
- `GET /live/:raffleId` (público): estado inicial de la sala (tiradas
  ejecutadas + participantes); el resto llega por socket.

**Frontend:**
- El LiveDrawRoom busca la rifa `live`, carga el estado por REST y se
  suscribe por socket: tiradas y contador de espectadores en tiempo real.
- Panel del presentador (solo admin): botón "🎱 Lanzar tirada X de N" con
  feedback de errores; al salir el ganador, celebración + tag FINALIZADO.
- Sin rifa en vivo o backend apagado → modo demo con mocks.

**Probar el flujo completo (2 navegadores):**
```bash
# 1. Seed + levantar server y client
node scripts/seed.js && npm run start:dev   # (en /server)
npm run dev                                  # (en /client)
# 2. Navegador A: login admin (11111111/admin123) → "En Vivo" → Lanzar tirada
# 3. Navegador B (incógnito): "En Vivo" sin login → ve las tiradas llegar solas
```

---

## ✅ Iteración 4 — Cierre orquestado y Cero Pérdida real (completada)

**`RaffleClosingService` (src/raffles/raffle-closing.service.ts):**
Cuando sale la tirada ganadora, se dispara automáticamente:
1. **Candado de idempotencia:** `refundsProcessed` pasa de false → true
   con findOneAndUpdate atómico. Un crash + retry o dos admins cerrando a
   la vez JAMÁS duplican reembolsos. Si el cierre falla a mitad, el
   candado se libera y el admin reintenta con `POST /raffles/:id/close`.
2. **Reembolsos masivos en bulk:** los boletos perdedores se agrupan POR
   USUARIO (aggregate) → una sola transacción de reembolso por usuario
   (3 boletos perdedores = 1 movimiento de 3 × precio) → `insertMany` al
   ledger + `bulkWrite` de incrementos a las billeteras. Dos round-trips
   a Mongo aunque haya 500 boletos.
3. **ERP activado:** el registro logístico recibe el `winnerId` → el
   premio entra al flujo de envío del Super Admin.

**Tiempo real:** el gateway emite `raffle_completed` a toda la sala con el
resumen (ganador, monto devuelto, usuarios beneficiados). El LiveDrawRoom
lo muestra como banner dorado: *"Cero Pérdida cumplido: S/ X devueltos a
N participantes"* — la prueba social del modelo, en vivo.

**Flujo completo de prueba:**
```bash
node scripts/seed.js && npm run start:dev    # server
# Admin lanza tiradas en "En Vivo" hasta la ganadora →
#   - la sala ve el banner dorado al instante
#   - Carla/Jorge entran a "Mi Misio": reembolso acreditado en su ledger
#   - el panel ERP muestra el premio con ganador asignado
```

---

## ✅ Iteración 5 — ERP completo: uploads, tracking y bitácora (completada)

**Uploads con Multer (`src/logistics/upload.config.ts`):**
- `POST /logistics/:id/receipt` — boleta de compra (JPG/PNG/WEBP/PDF, 5MB).
- `POST /logistics/:id/evidence` — foto de entrega (solo imagen, 5MB).
- Archivos en `/uploads` (gitignored), servidos estáticos en
  `GET /uploads/<archivo>`. Para producción multi-nodo: cambiar
  `diskStorage` por S3/Cloudinary en la config, sin tocar controladores.

**Bitácora automática (`history` en el schema):**
Cada hito escribe su entrada solo — nadie redacta la bitácora a mano:
- Registro del premio → "Premio comprado — costo S/ X"
- Cierre de rifa → "Rifa completada — ganador: ... (boleto #N)"
- Guía registrada → "Guía OLV-... registrada con Olva Courier"
- Cambio de estado → "Premio en tránsito..." / "Premio ENTREGADO ✓"
- Upload → "Boleta adjuntada" / "Foto de evidencia adjuntada 📸"

**Panel admin conectado:**
- KPIs reales del aggregate (`/logistics/summary`) e inventario con
  ganadores poblados (`/logistics`).
- Clic en una fila → su bitácora real aparece en el Timeline.
- Botón **Gestionar** → modal con courier (select), guía, ciudad destino,
  estado de entrega, y los dos uploads. El PATCH fusiona `shippingDetails`
  (no pisa campos que no enviaste).

---

## ✅ Iteración 6 — Bingo Familiar, code-splitting y pulido PWA (completada)

**Bingo Familiar (`server/src/bingo/` + vista `/bingo`):**
El motor de captación de leads: jugar es GRATIS y SIN CUENTA.
- Inscripción = lead: nombre + celular → cartón 5×5 clásico de 75 bolas
  (columnas B-I-N-G-O, centro libre ⚡) generado al instante.
- Un cartón por celular por sala (índice único); reingresar con el mismo
  celular devuelve el cartón original.
- El cartón se marca solo contra los números cantados (polling cada 5s);
  el admin canta números desde la misma vista ("📣 Cantar siguiente número").
- `GET /bingo/leads` (admin): LA COSECHA — nombres y celulares para
  campañas de WhatsApp/SMS de las rifas pagadas.
- Futuro: migrar el polling a WebSocket reutilizando el patrón de LiveModule.

**Code-splitting (React.lazy + Suspense):**
Cada vista es su propio chunk descargado al navegar. El bundle inicial
bajó de **1.19 MB → ~600 KB** (núcleo AntD) + chunks de 4-7 KB por vista.

**PWA de verdad:** `pwa-192.png` y `pwa-512.png` (con safe-zone maskable)
generados con el rayo Misio, `favicon.svg`, y `.gitignore` raíz.

## 🌳 Gitflow sugerido para el equipo

```
main ──────●───────────●──────────── (solo releases etiquetadas)
            \         /
develop ─────●──●──●──●──●────────── (integración continua)
              \    \     \
               \    \     feature/bingo-websocket
                \    feature/marketplace-canjes
                 feature/notificaciones-whatsapp
```
- `feature/*` sale de `develop` y vuelve por Pull Request.
- Cada módulo del backend y cada carpeta de `views/` es un territorio
  natural para una feature: dos juniors rara vez tocan el mismo archivo.
- `hotfix/*` sale de `main` solo para bugs en producción.

## 📦 Estado final del proyecto (6 iteraciones)

| Capa | Qué hay |
|---|---|
| Auth | JWT + roles + guards, DTOs validados en todos los módulos |
| Billetera | Ledger auditable, compra atómica (transacciones Mongo), depósitos con confirmación de operador |
| En vivo | Socket.IO: salas, espectadores, tiradas al agua, cierre con reembolsos masivos idempotentes |
| ERP | Márgenes reales, uploads Multer, bitácora automática, tracking nacional |
| Leads | Bingo Familiar gratis con cosecha de celulares |
| PWA | Code-splitting, íconos maskable, Service Worker autoUpdate |

**Pendientes conocidos para producción:** tests (Jest/Vitest), rate
limiting (@nestjs/throttler), notificaciones WhatsApp/SMS (Twilio),
storage S3/Cloudinary para uploads multi-nodo, y endpoint real de canjes
del marketplace.

---

## ✅ Pulido responsive (verificado con capturas reales a 390px)

**El bug principal:** el menú horizontal de AntD en el header no comprime
bajo ~600px y forzaba scroll horizontal en TODA la app en celulares.
Detectado midiendo capturas headless: el documento renderizaba más ancho
que el viewport.

**Fixes aplicados:**
- **Header adaptativo** (`useBreakpoint` de AntD Grid): en desktop (≥ lg)
  menú horizontal; en móvil/tablet, botón hamburguesa → Drawer lateral
  con el menú vertical. En móvil el badge CERO PÉRDIDA y el nombre del
  usuario se ocultan (solo avatar) para que todo quepa.
- **Candado global:** `overflow-x: hidden` en html/body como red de
  seguridad.
- **KPIs fluidos:** los valores de `Statistic` escalan con
  `clamp(17px, 4.5vw, 26px)` — "S/ 24,350" ya no se parte en dos líneas
  en 390px. El KPI de Inventario se reestructuró (valor + línea
  secundaria "🚚 N en ruta").
- **Tablas con scroll propio:** boletos del usuario (x:420) y depósitos
  pendientes (x:480) scrollean DENTRO de su Card sin empujar el layout.
- **Cabecera del live:** título con ellipsis y tag de espectadores
  sin salto de línea.

**Verificación:** las 6 vistas capturadas con Chrome headless a 390×844
(2x) miden exactamente 780px de ancho = cero overflow horizontal.

---

## ✅ SPRINT 1 — Gestión de creación de sorteos (completado)

**Panel nuevo: `/admin/rifas` (menú "Gestión Sorteos", solo admin).**

**Crear rifa con TODO lo configurable:**
- Producto, descripción y FOTOS (hasta 5, upload Multer, con eliminación).
- **Numerología:** prefijo (ej. PS5) → boletos PS5-0001 … PS5-0100, con
  vista previa en vivo en el formulario. El padding crece con la cantidad.
- **Formato:** 🎯 Ganador directo (1ra tirada gana) o 💧 Al agua
  (defines la tirada ganadora; las anteriores se queman).
- **Delimitador:** máx. de boletos por persona POR RIFA (validado en la
  compra: ya-tiene + nuevos ≤ límite).
- Fecha/hora del sorteo (DatePicker) + check "🔔 avisar a compradores
  cuando falte 1 día" (cron horario con candado anti-duplicado).

**Anti doble-compra del mismo número:** índice único raffleId+ticketNumber
+ transacción MongoDB. Si dos personas pagan el MISMO número a la vez,
solo una inserción gana; la otra aborta completa (no se le cobra) y
recibe "alguien acaba de comprar ese número". La compra ahora acepta
números elegidos (`ticketNumbers[]`) además de cantidad.

**Gestión post-creación:**
- ✏️ Editar todos los campos (solo rifa en venta).
- 📅 Aplazar: motivo + nueva fecha → historial de aplazamientos +
  notificación automática a TODOS los compradores con el motivo; el
  recordatorio de 1 día se re-arma para la nueva fecha.
- ❌ Cancelar (rifa estropeada): devuelve el 100% a TODOS (bulk, con el
  candado de idempotencia), estado 'cancelled', notificación con motivo.
  Nuevo tipo en el ledger: `raffle_cancelled_refund`.

**Notificaciones in-app:** módulo nuevo (`/notifications/mine`); el
usuario ve el último aviso destacado en "Mi Misio".

**Próximos:** SPRINT 2 (día del sorteo: panel presentador con tómbola
virtual/presencial, link público con token de 5 min, reacciones 👍😢) y
SPRINT 3 (recarga standalone, métodos de pago con QR configurables,
detalle de rifa con selección de números y carrito).

---

## ✅ SPRINT 2 — El día del sorteo (completado)

**Iniciar sorteo:** desde Gestión de Sorteos, botón ▶ en cada rifa lleva
al panel del sorteo, que sugiere los días restantes para la fecha
programada ("Faltan N días… puedes iniciarlo igual") con el botón
"Iniciar sorteo AHORA".

**Panel especializado (`/admin/sorteo/:id`):**
- Link de transmisión multi-plataforma (YouTube/Kick/TikTok/Facebook)
  con guardado en caliente (editable incluso EN VIVO) y embed inmediato.
- **DOS MODOS de tirada:**
  - 🎪 **Presencial:** giras la tómbola física, ingresas el N° del boleto
    que salió → el sistema valida (que exista, que siga activo) y te
    SUGIERE aceptar: "¿Registrar #0042 como tirada 2 — sale AL AGUA?".
    Así sucesivamente hasta la ganadora.
  - 💻 **Tómbola virtual:** todos los boletos activos con nombres
    parciales (BRAN… JUA… #1234), animación de giro (~2.5s) y selección
    aleatoria del servidor ($sample). Modal de resultado con "Aceptar".
- Progreso de tiradas en vivo + al ganar: resumen Cero Pérdida y botón
  "Finalizar sorteo".

**Lista pública con TOKEN de 5 minutos (`/lista/:id?t=...`):**
- El link SOLO se genera desde la web Misio (requiere sesión). Token JWT
  con expiración de 5 min: compartir el link después = candado "enlace
  vencido".
- Nombres PARCIALMENTE ocultos desde el SERVIDOR (BRAN… JUA… + código):
  aunque alguien inspeccione el tráfico, el nombre completo nunca viaja.
- Cuenta regresiva visible; al llegar a 0 la lista se oculta sola.
- Disuasores: no imprimible (@media print), sin clic derecho, sin
  selección, bloqueo de F12/Ctrl+P/S/U/Shift+I. *Nota honesta:* son
  disuasores del lado del cliente; la protección REAL es el token de
  5 min + el enmascarado en servidor.

**Vista del usuario en el live:**
- Iframe REAL embebido cuando el presentador fija el streamUrl.
- Reacciones: SOLO 👍 y 😢, con contadores en tiempo real vía socket
  (en memoria por sala) y cooldown anti-spam de 1.5s.
- Botón "📋 Lista de participantes" que genera el link tokenizado.
- El recordatorio "falta 1 día" ya llega por las notificaciones del Sprint 1.

---

## ✅ Corrección — Detalle de rifa con selección de números (flujo real de compra)

**Reportado en pruebas:** las cards del marketplace vendían por modal y no
se podía ver el detalle. Corregido:

- Las cards del marketplace ahora NAVEGAN a `/rifa/:id` (card completa y
  botón "Ver rifa y elegir números"). El modal de compra rápida se eliminó.
- **`/rifa/:id` — Detalle completo:** carrusel de fotos del producto (o
  🎁 si no tiene), descripción, formato del sorteo, fecha, progreso y
  precio.
- **Grilla de tickets según la numerología configurada:** todos los
  códigos (PS5-0001…) paginados de 100 en 100. Vendidos en gris tachado,
  los tuyos en dorado, los elegidos en gradiente púrpura. El delimitador
  por persona se valida al elegir (tus boletos previos + carrito ≤ máx).
- **Carrito flotante:** chips removibles de los números elegidos, total
  en vivo y "Pagar con mi Misio" → `POST /tickets/purchase` con
  `ticketNumbers` (la compra atómica anti doble-compra del Sprint 1).
  Si otro compra tu número mientras eliges, el pago completo se aborta
  (no se cobra nada) y la grilla se refresca.
- Backend: nuevo `GET /raffles/:id/sold` (público) con los números vendidos.

Pago con QR Yape directo en el carrito: Sprint 3.

---

## ✅ SPRINT 3 — Ciclo de pagos completo (completado)

**Recarga standalone ("Mi Misio"):** botón "💳 Recargar saldo" — una sola
opción, sin necesidad de comprar tickets. Flujo: monto → método → QR →
N° de operación → registrado (pending) hasta confirmación del operador.

**Métodos de pago configurables (admin, `/admin/pagos`):**
- CRUD completo: nombre (Yape/Plin/BCP…), número/cuenta, titular,
  instrucciones, visible sí/no, y SUBIDA DEL QR (imagen).
- El usuario ve exactamente lo configurado: QR grande + titular +
  número copiable + monto exacto.

**Pago del carrito con Yape (detalle de rifa):**
- Junto a "Pagar con mi Misio" (instantáneo) ahora está "🟣 Pagar con
  Yape": sale el QR con el monto EXACTO del carrito y el depósito viaja
  con la INTENCIÓN DE COMPRA (rifa + números elegidos).
- **AUTO-COMPRA:** al confirmar el operador, el sistema acredita el
  saldo Y compra esos números automáticamente. Si alguien los ganó
  mientras tanto, el saldo queda intacto en la billetera y el usuario
  recibe la notificación para elegir otros. Cero riesgo de doble cobro.

**Panel dedicado de verificación (`/admin/pagos`):**
- Cola con: usuario (DNI/celular), monto, método, N° DE OPERACIÓN (para
  verificar rápido en la app), e intención (🎟️ N números vs recarga libre).
- Confirmar/Rechazar notifica al usuario en ambos casos; el resultado de
  la auto-compra se muestra al operador al instante.
- La card de depósitos del ERP se reemplazó por un link a este panel.

**Arquitectura:** `PaymentsModule` orquesta por encima de Transactions y
Tickets (evita dependencia circular). `Transaction.meta` guarda método,
operación e intención. Seed incluye el método "Yape" de ejemplo.

---

## ✅ SPRINT A — Experiencia de compra del usuario (completado)

**Grilla con 4 estados:** disponible · elegido (púrpura) · vendido (gris
tachado) · **EN PROCESO (ámbar)** — números que viajan en pagos Yape
pendientes de OTRA persona. No se pueden seleccionar; si ese pago se
rechaza, se liberan solos (consulta en vivo, sin reservas que limpiar).
La compra por saldo también los respeta, y la auto-compra tras confirmar
un pago usa un bypass (su propio pago pendiente ERA la reserva).

**Compra como invitado:** cualquiera entra al detalle y elige números
sin cuenta. RECIÉN al pagar se le pide registrarse/iniciar sesión — y su
carrito se conserva (sessionStorage) para retomarlo al volver del login.

**Cards del marketplace:** botón "Comprar — S/ X" → detalle. Si la rifa
está EN VIVO, el card completo y el botón "🔴 Ir al sorteo EN VIVO"
llevan directo a la sala. "Mis boletos" pasó de tabla a cards.

**Fix streaming (YouTube/Twitch/Kick):** el problema NO era falta de API
— YouTube bloquea el embed de links watch?v= (X-Frame-Options). Ahora el
backend NORMALIZA cualquier link al pegar:
- youtube.com/watch?v=ID · youtu.be/ID · /live/ · /shorts/ → /embed/ID
- twitch.tv/canal → player.twitch.tv/?channel=canal (+parent= que exige
  Twitch, agregado por el cliente con su dominio)
- kick.com/canal → player.kick.com/canal
Links irreconocibles se rechazan con mensaje claro.

**Términos y Condiciones (Perú):** checkbox OBLIGATORIO en el registro
(validado también en el backend: `acceptTerms === true`), con modal de
9 secciones adaptadas: mayoría de edad, Ley N° 29733 (datos personales,
derechos ARCO), naturaleza del saldo Misio, transparencia de sorteos,
verificación de pagos, conducta y baja de cuentas, entrega de premios,
Libro de Reclamaciones/Indecopi (Ley N° 29571). Se guarda
`acceptedTermsAt` como evidencia de consentimiento.
⚠️ Es una PLANTILLA: antes de producción debe revisarla un abogado
colegiado (las promociones comerciales/sorteos tienen regulación
específica ante Indecopi).

**Pendiente (siguientes sprints):** SPRINT B — bono de bienvenida
configurable, gestión/baneo de usuarios, tienda de canjes configurable.
SPRINT C — Bingo.

---

## ✅ SPRINT B — Poder del admin (completado)

**🎁 Bono de bienvenida configurable (/admin/usuarios):**
- Switch activo/inactivo · tipo: 💵 crédito Misio (S/ X) o 🎟️ ticket
  gratis en la rifa que elijas (sorteo de bienvenida).
- Se aplica automáticamente al registrarse: crédito → ledger
  `welcome_bonus` + saldo; ticket → número libre más bajo de la rifa,
  con su código. El usuario ve el toast "🎁 Bono aplicado" y la
  notificación. Si el bono falla (rifa agotada), el registro NO se rompe.

**👥 Gestión de usuarios (/admin/usuarios):**
- Tabla con búsqueda (nombre/DNI/celular), saldo, fecha de registro.
- BANEAR con motivo obligatorio / Reactivar. Los admins no son baneables
  desde la interfaz.
- **Corte instantáneo:** el flag `banned` se verifica en el login Y en
  cada request (JwtStrategy consulta la BD) — banear saca al usuario del
  sistema al momento, sin esperar a que venza su token de 7 días. El
  motivo se le muestra al intentar entrar. Saldo y boletos se conservan.

**🛍️ Tienda de canjes configurable (/admin/tienda):**
- Catálogo CRUD: nombre, precio en Misio, emoji, stock (-1 = ilimitado),
  visible sí/no.
- Canje ATÓMICO en 3 pasos: (1) stock se decrementa solo si queda,
  (2) cobro vía ledger con guard de saldo (si falla, el stock se
  restaura), (3) orden de canje creada + notificación.
- Panel de canjes: pendientes primero, botón "Marcar entregado" que
  notifica al usuario. "Mi Misio" ahora usa el catálogo REAL.

Seed: 3 productos + bono de S/ 5 activado.

---

## ✅ SPRINT C — Bingo social (completado)

**Rediseño total:** el Bingo dejó de ser captación de leads — ahora es un
JUEGO social entre usuarios registrados. Gratis, sin créditos ni premios
del sistema, y el administrador NO participa.

**Cómo funciona:**
1. Cualquier usuario registrado crea una sala: título, máx. de jugadores
   (2-50) y modo de victoria (🟰 línea o 🎯 cartón lleno).
2. Recibe un CÓDIGO corto (ZB-XXXX, sin caracteres ambiguos como O/0/I/1)
   y lo comparte por WhatsApp (botón directo) o copiándolo.
3. Los amigos entran con el código; cada uno recibe su cartón único
   (formato 75 bolas, columnas B-I-N-G-O, centro libre).
4. El ANFITRIÓN canta los números (botón "sacar bola" — aleatorio entre
   las no cantadas); todos los ven llegar en tiempo real (WebSocket
   /bingo, todo autenticado).
5. Los cartones se auto-marcan con cada número cantado.

**Detección AUTOMÁTICA de BINGO (anti-trampa):** nadie "canta" su
victoria — el servidor evalúa cada cartón tras cada número (helper
hasWon: filas, columnas, diagonales o cartón lleno según el modo). En
empate gana quien se unió primero a la sala. Al ganar: banner para toda
la sala y la sala pasa a 'finished'.

**Detalles:** lista de jugadores en vivo ordenada por aciertos (corona 👑
al anfitrión), el host TAMBIÉN juega con su cartón, salas abiertas se
listan en "Mis salas" para retomar, y /bingo pide iniciar sesión si no
hay cuenta (Result con CTA al login).

**Seed:** sala ZB-DEMO abierta (host Carla, modo línea, máx 10).

---

## ✅ SPRINT D — Panel Admin unificado, roles de personal y rediseño (completado)

**Área Admin unificada (/admin):** un solo ítem "Admin" en el nav abre el
panel con pestañas: 📊 Dashboard · 🎁 Sorteos · 💳 Pagos · 👥 Usuarios ·
🛍️ Tienda · 🗄️ ERP. El dashboard muestra estadísticas en vivo
(GET /admin/stats): usuarios (total/nuevos 7d/baneados), rifas
(activas/en vivo/completadas), boletos vendidos, ingresos por boletos,
pasivo de billeteras (saldo Misio en manos de usuarios) y colas
pendientes (pagos y canjes por atender).

**Roles de personal (delegación):**
- 💳 OPERADOR: solo Pagos y Tienda (verifica depósitos, atiende canjes).
- 🎪 PRESENTADOR: solo Sorteos (gestión + panel de la ruleta en vivo).
- 👑 ADMIN: todo, incluida la creación de personal (botón "Crear
  personal" en Usuarios: nombre, DNI, celular, contraseña y rol).
Los permisos se validan en el BACKEND por endpoint (guards por rol) y el
frontend solo muestra las pestañas de cada rol; si intentan entrar a otra
sección, caen en la suya.

**Nav del usuario:** se quitó "En Vivo" (al sorteo se entra desde el card
de la rifa cuando está 🔴 EN VIVO) y el logo ya no lleva el tag CERO
PÉRDIDA.

**Rediseño "sobrio moderno":** grafito neutro en capas (#0e1015 →
#151821 → #1c202b), acento índigo único (#6366f1), colores semánticos
calmados (verde SOLO dinero, dorado SOLO premios), sin brillos neón, y
tipografía Inter con radios contenidos.

**Panel del sorteo:** el video pasó a una columna menor y la tómbola
virtual ahora es una 🎡 RULETA VISIBLE (SVG por sectores con nombres
enmascarados): el servidor elige primero al azar ($sample) y la ruleta
gira ~4s hasta clavar el puntero en el boleto elegido — animación
honesta, el resultado nunca depende del navegador.

---

## 🔧 Ronda de correcciones de arranque

**Diagnóstico con arranque real del backend** (no solo tsc):

1. **Crash fatal al iniciar** — `CannotDetermineTypeError: Cannot
   determine a type for the "User.acceptedTermsAt" field`. Los @Prop con
   tipo union (`Date | null`) necesitan el tipo explícito. Corregido:
   `@Prop({ type: Date, default: null })` en acceptedTermsAt y bannedAt.
   Este error tumbaba TODO el servidor en bucle — era "el montón de
   errores".
2. **Endpoint de estadísticas duplicado** — existían /admin/stats y
   /stats/admin haciendo lo mismo. Se eliminó el duplicado; queda
   `GET /api/v1/stats/admin` (el que consume el dashboard).
3. **Verificación completa**: arranque smoke del Nest con los 35 módulos
   y 68 rutas mapeadas sin errores + auditoría del frontend buscando
   componentes JSX usados sin importar (0 hallazgos) + builds de ambos
   lados.

**⚠️ RECORDATORIO CRÍTICO DE ENTORNO — MongoDB replica set:**
La compra atómica usa transacciones de MongoDB, que SOLO funcionan en
replica set. Si corres un `mongod` local pelado, las compras fallarán
con "Transaction numbers are only allowed on a replica set member".
Soluciones:
- MongoDB Atlas (gratis, ya es replica set) ← recomendado, o
- Local: `mongod --replSet rs0` y una vez: `mongosh --eval "rs.initiate()"`.

---

## ✅ SPRINT E — Tienda principal, tiempo real, correo y ganadores

**Nav renovado:** 🎁 Sorteos (antes "Rifas") · 🛍️ Tienda · 🏆 Ganadores ·
Mi Misio · Bingo Gratis · Admin.

**🛍️ Tienda como sección principal (/tienda):** catálogo público con
FOTOS (hasta 4 por producto, subidas desde el admin), descripciones,
stock y carrito con cantidades. Checkout con saldo Misio (una sola
transacción por carrito, stock atómico con rollback). Sin sesión se
puede mirar y armar el carrito; el login se pide RECIÉN al pagar. Si
falta saldo, atajo directo a Recargar. La tienda del dashboard ahora es
un CTA a esta página.

**⚡ Selección de tickets EN TIEMPO REAL:** cuando Brandux selecciona un
número, María lo ve marcarse al instante en SU navegador ("BRAN… lo está
eligiendo", celeste, bloqueado) vía WebSocket. Al comprar, los números
pasan a vendidos en todas las pantallas al momento — y si te ganaron uno
del carrito, se te quita con aviso. Las selecciones se liberan solas al
cerrar la pestaña. La verdad autoritativa sigue siendo la compra atómica
en BD; el socket es sincronización visual.

**🎟️ Grilla sin paginar:** TODOS los números con scroll interno + buscador
del número de la suerte ("77" encuentra 77, 177, 770…).

**📧 Verificación de correo (activable):** el registro pide correo; con el
toggle del admin activo (Usuarios → "Verificación de correo"), llega un
código de 6 dígitos (15 min) que se ingresa para activar la cuenta — el
bono de bienvenida se aplica recién al verificar. Sin SMTP configurado
(SMTP_HOST/PORT/USER/PASS/FROM en .env), el código sale en la consola
del servidor para probar. El login de cuentas sin verificar reenvía el
código y muestra el paso de verificación.

**🏆 Página de Ganadores (/ganadores):** sorteos completados con premio,
ganador (nombre enmascarado desde el servidor), código del boleto,
estado de entrega y la FOTO de evidencia del ERP cuando existe.

Verificación: boot smoke 35 módulos / 76 rutas / 0 errores + builds.

---

## ✅ SPRINT F — Doble billetera: saldo CONTABLE vs saldo de CANJE

**El modelo de negocio protegido:**
- 💵 **Saldo contable** (`walletBalance`): dinero REAL — recargas Yape
  confirmadas y devoluciones por rifa cancelada. Compra TICKETS de
  sorteos y productos de VENTA.
- 🎁 **Saldo de canje** (`walletCanje`): lo que vuelve por Cero Pérdida
  al perder un sorteo. SOLO compra artículos marcados como CANJE — el
  reembolso promocional no puede llevarse mercadería de venta real.

**Enrutamiento de cada flujo:**
- Recarga Yape confirmada → contable · Compra de tickets → contable
- Cero Pérdida (perdiste) → CANJE · Rifa cancelada → contable (pagaron
  con dinero real, vuelve como real)
- Bono de bienvenida (crédito) → contable (para que el nuevo juegue)
- Tienda: producto CANJE → cobra walletCanje · producto VENTA → contable

**Tienda con tipo de producto:** el admin marca cada artículo 🎁 Canje o
💵 Venta (radio en el form + tag en tabla y catálogo). El checkout
DIVIDE el carrito: cobra el subtotal canje del saldo canje y el subtotal
venta del contable — con compensación automática (si el segundo cobro
falla, el primero se reversa y el stock se restaura; nunca queda dinero
colgado).

**Ledger:** cada transacción registra `wallet: contable|canje`. Las
estadísticas del dashboard separan ambos pasivos.

**UI:** Mi Misio muestra los dos saldos con su explicación; la tienda
muestra ambos, badges por producto y subtotales separados en el carrito
con validación por billetera.

Migración de datos existentes: `walletBalance` pasa a ser el contable
tal cual; `walletCanje` inicia en 0 (default del schema). Seed: Carla
S/ 20 contable + S/ 27 canje; producto de VENTA de ejemplo (JBL).

---

## ✅ SPRINT G — Perfil, Reclamaciones, Nosotros, maqueta de Subastas

**Correcciones:** la card "Tienda Misio" salió de Mi Misio (la Tienda vive
en su sección), y el EN VIVO del usuario ya NO muestra el panel del
presentador aunque entres como admin — tu panel está en Admin → Sorteos → ▶.

**👤 Mi Perfil (/perfil):** foto de perfil (upload), correo, celular,
WhatsApp alternativo y DIRECCIÓN DE ENVÍO completa (calle, ciudad,
región, referencia para el courier) — lo que el admin necesita para
despachar. Además "Mis recargas y recibos": cada depósito con su estado,
método y N° de operación, y la subida del COMPROBANTE (imagen/PDF) —
puede subirlo el usuario o el personal (admin/operador); el operador lo
ve como link "🧾 Ver recibo adjunto" en la cola de Pagos.

**📕 Libro de Reclamaciones (/reclamaciones):** formulario público (la
ley exige que cualquiera pueda reclamar, con o sin cuenta) con folio
LR-XXXXXX, tipo reclamo/queja, y "Mis reclamos" para usuarios logueados.
Panel admin nuevo (pestaña Reclamos): cola con pendientes primero,
respuesta oficial que notifica al usuario y cierra el folio. Recordatorio
del plazo legal de 30 días (Ley N° 29571).

**🏢 Quiénes somos (/nosotros):** misión, pilares (transparencia, dinero
protegido, hecho en Perú) y el "cómo funciona" en 5 pasos.

**Footer nuevo:** Quiénes somos · Libro de Reclamaciones · Ganadores +
sello "+18".

**🔨 Subastas (/subastas) — MAQUETA navegable:** subasta destacada con
cuenta regresiva animada, anti-sniping señalizado (últimos 2 min), barra
de puja con retención de saldo explicada, atajos de puja, "Cómpralo ya",
historial de pujas con líder 👑 y próximas subastas. Marcada claramente
como maqueta sin backend.

---

## ✅ Mejoras de navegación (menú del avatar)

El menú al hacer click en tu usuario logueado ahora es el centro de la
cuenta:
- 👛 Mi Misio (saldos y boletos) — salió del nav principal
- 🪪 Mi Perfil (dirección, foto y recibos) — ya no vive dentro de Mi Misio
- 🖥️ Panel de Administración — SOLO si el rol es de personal, con el
  nombre según el rol: "Panel de Administración" (admin), "Panel de
  Pagos" (operador), "Panel de Sorteos" (presentador)
- Cerrar sesión

El nav principal quedó: Sorteos · Tienda · Ganadores · Subastas ·
Bingo Gratis · Quiénes somos (a la mano, como se pidió).

---

## ✅ SPRINT H — Subastas reales, modo claro/oscuro y 5 correcciones

### 🐛 Correcciones (de las pruebas reales)
1. **"Error de tickets" al girar la tómbola** — causa raíz: en modo
   DIRECTO la rifa usaba winningAttempt=3 (default) → todas las tiradas
   salían "al agua" hasta vaciar la rifa ("No quedan boletos activos").
   Fix: modo directo = 1 sola tirada ganadora (al crear Y al sortear) +
   REGLA DE ORO: si queda un solo boleto activo, ES el ganador — el
   sorteo siempre termina con ganador.
2. **Ganador no se guardaba en el sorteo** — ahora queda GRABADO en la
   rifa (`raffle.winner`: número, código, nombre, userId, fecha).
3. **Error al recargar saldo a una persona** — confirmación blindada: si
   el abono falla, el depósito REVIERTE a pendiente (nunca queda
   "completado" sin acreditar); las notificaciones ya no pueden tumbar
   la confirmación; doble click seguro (protección ya existente).
4. **Saldo viejo hasta recargar la página** — el saldo se refresca solo:
   al volver el foco a la pestaña, cada 45 s, al cerrar el modal de
   recarga y tras cada compra/puja.
5. **Sección de tiradas invisible** — el panel del sorteo se reorganizó:
   🎱 Tiradas (al agua/ganador) va ARRIBA a ancho completo; abajo video
   compacto (lg 9) + ruleta protagonista (lg 15).

### 🌗 Modo claro / oscuro
Botón ☀️/🌙 en el header. Los colores son variables CSS (`--z-*`) con
paletas en `:root` (oscuro) y `body.light` (claro) — todos los estilos
inline cambian solos — y el tema AntD se reconstruye por modo
(`buildAntdTheme`). Preferencia en localStorage.

### 🔨 SUBASTAS (módulo completo)
- **Interruptor de emergencia** (Admin → Subastas): apaga TODO el módulo
  al instante; la página pública muestra "en pausa".
- **Matrícula**: listado tipo sorteos; en programadas te matriculas y el
  sistema avisa 15 min antes y al arrancar (cron cada minuto). La SALA
  solo deja entrar matriculados (verificado en el gateway).
- **Pujas en tiempo real con DINERO REAL**: al pujar, el monto se
  RETIENE del saldo contable (walletBalance → walletHeld, atómico); si
  te superan, se libera al instante + notificación. Pujas procesadas EN
  SERIE por subasta (mutex) — imposible que haya dos líderes.
- **Anti-sniping**: puja en los últimos 2 min → cierre +2 min.
- **Cómpralo ya** opcional; al ganar (puja o compra): consumeHeld +
  transacción `auction_payment` + entrada en el ERP logístico (flujo de
  envío idéntico a los sorteos) + notificación.
- **Cancelación admin** con motivo: libera la retención del líder y
  notifica a los matriculados.
- Mi Misio muestra "🔒 Retenido en subastas" cuando hay puja líder.
- Seed: subasta 🎧 programada a +10 min con flag ACTIVO.

Verificación: tsc + boot smoke 39 módulos / 93 rutas / 0 errores + build.

---

## ✅ SPRINT I — En Vivo reorganizado, iniciar subasta, modo claro real y rediseño UX/UI

**En Vivo:** la lista "👥 En la sala" salió del lateral (los curiosos la
tienen en el botón "Lista de participantes"); en su lugar viven las
🎱 Tiradas de la tómbola — lo que la gente mira durante el sorteo, ahora
siempre a la vista junto al video.

**Subastas:** botón ▶ "Iniciar ahora" (admin) en subastas programadas:
arranca al instante conservando la duración completa y notifica a los
matriculados — sin esperar la hora ni el cron.

**Modo claro ARREGLADO** — la causa: colores oscuros clavados que no
cambiaban con el tema: el header (rgba púrpura fijo), los gradientes del
stream y de las cards, el footer y los glows. Todos pasaron a variables
CSS (--z-header-bg, --z-border, gradientes por --z-*) y los glows pierden
la sombra neón en claro.

**Rediseño UX/UI:**
- Contenido centrado a 1280px (líneas de lectura cómodas en desktop).
- Hero renovado: titular escalable (clamp), CTA primario "Ver sorteos" +
  secundario "¿Cómo funciona?", y chips de confianza (Cero Pérdida, en
  vivo, envío nacional, Libro de Reclamaciones).
- Microinteracciones: cards que se elevan al pasar, botones con feedback
  táctil (scale al presionar) y sombra en hover del primario.
- Accesibilidad: foco visible con teclado (WCAG 2.4.7) en toda la app.
- Affordance de scroll en la grilla de boletos (desvanecido inferior que
  indica "hay más").
- Footer estructurado: marca, enlaces (Nosotros/Ganadores/Subastas/
  Reclamaciones) y sello legal +18, con borde superior.
- Jerarquía tipográfica: tracking ajustado en títulos.

Verificación: tsc + boot smoke + build + auditoría de identificadores en 0.

---

## ✅ SPRINT J — PWA instalable y Bingo completo

### 📲 PWA con invitación a instalar
- **Banner propio** (no el discreto del navegador): en Android/Chrome/Edge
  capturamos `beforeinstallprompt` y mostramos la tarjeta "Instala Misio
  en tu celular" con el botón que abre el instalador real.
- **iPhone/Safari**: Apple NO permite instalador automático → el banner
  abre las instrucciones exactas (Compartir → Añadir a inicio → Añadir).
- **Sin insistir**: no aparece si ya está instalada (display-mode
  standalone) ni si el usuario dijo "Ahora no" en los últimos 14 días.
- **Manifest actualizado**: paleta nueva (#0e1015), descripción, lang
  es-PE, categorías, íconos maskable y ATAJOS al mantener pulsado el
  ícono (Sorteos · Mi Misio · Tienda · Bingo Gratis).
- **iOS metas**: apple-touch-icon, título y barra de estado; theme-color
  por modo claro/oscuro.

### 🎲 Bingo completo (es un JUEGO, gratis, requiere cuenta)
Ya estaba construido (crear sala, código para invitar, cartones únicos
75 bolas, canto del anfitrión, auto-marcado, detección AUTOMÁTICA de
bingo por el servidor, revancha, sonido WebAudio, compartir por
WhatsApp). Lo que faltaba y se cerró ahora:
- **RESCATE DE PARTIDA**: si el anfitrión cerraba la pestaña, la sala
  quedaba muerta — nadie podía cantar. Ahora el servidor detecta que su
  socket se fue (`host_left`), avisa a la sala y **cualquier jugador
  puede "Tomar el control"** (`claim_host`); el backend verifica que el
  anfitrión realmente no esté conectado antes de transferir. Si el
  anfitrión sale ordenadamente, el control pasa solo al jugador más
  antiguo.
- **Tema**: el cartón y los brillos usaban púrpura clavado → variables
  CSS (se ve bien en modo claro).

### 🎨 Últimos colores clavados eliminados
RaffleDetail (gradiente y sombra del carrito), AuthPage (glow) y el
cartón del bingo ahora usan variables — el modo claro es consistente en
toda la app.

Verificación: tsc + boot smoke 39 módulos / 96 rutas / 0 errores + build
+ auditoría de identificadores en 0 + capturas.

---

## ✅ SPRINT K — Fix de entrada al bingo, Landing y subastas moderadas

### 🐛 "No estás en esta sala" al entrar al bingo
El botón Entrar hacía `GET /bingo/rooms/:id`, que EXIGE tener cartón: si
el cartón no existía (p. ej. la sala se creó pero el cartón no llegó a
guardarse), rebotaba con 403 aunque la sala apareciera en "Mis partidas".
Fix: `POST /bingo/rooms/:id/enter` — ENTRAR ES IDEMPOTENTE: si no tienes
cartón y hay cupo, se te reparte en el acto (respetando maxPlayers,
partida no terminada y carreras entre pestañas). Entrar ahora hace lo
que el usuario espera: entrar.

### 🚀 LANDING PAGE (/ para visitantes · /bienvenido siempre)
Portada inteligente: el visitante ve el landing; el usuario logueado va
directo a Sorteos (ya está convencido). Nav "Sorteos" → /sorteos.
Secciones y el principio psicológico detrás de cada una:
1. **Hero** — aversión a la pérdida invertida: "Juega por el premio.
   Nunca pierdas tu plata".
2. **Contraste rifa normal vs Misio** — anclaje: S/ 0 vs S/ 5 de vuelta.
3. **Cómo funciona en 3 pasos** — fluidez cognitiva (lo simple se
   percibe como más verdadero) + efecto dotación ("elige TU número").
4. **"¿Y ustedes de qué viven?"** — transparencia anti-estafa: se
   responde la objeción incómoda ANTES de que la piensen.
5. **Sorteo real corriendo** — escasez REAL (números libres y countdown
   traídos de la BD, nunca falsos) + efecto Zeigarnik (barra a medio
   llenar).
6. **Qué encontrarás** — Sorteos · Tienda · Subastas · Bingo.
7. **Prueba social** — ganadores reales con evidencia de entrega.
8. **FAQ** — aversión a la ambigüedad (incluye "¿puedo retirar el saldo
   en efectivo?" respondido con honestidad).
9. **Cierre** — regla del pico-final + compartir por WhatsApp.

### 🎙️ Subastas: modo MODERADO (en vivo) vs AUTOMÁTICO
- Al crear: eliges 🤖 **Automática** (arranca y cierra sola por reloj,
  como estaba) o 🎙️ **Moderada** (tú conduces).
- Moderada: pones el enlace de transmisión igual que en los sorteos
  (YouTube/Kick/TikTok/Facebook, mismo normalizador) y la sala de pujas
  muestra tu video junto a la barra de puja.
- **Panel moderador** (Admin → Subastas → 🎥): transmisión editable
  incluso EN VIVO, **pujas entrando en tiempo real** con destello de
  "¡NUEVA PUJA!" para narrarlas, puja actual gigante, countdown,
  matriculados y botón Iniciar.
- Las moderadas NO las arranca el cron: las abres tú cuando estás al
  aire (el cierre por reloj y el anti-sniping se mantienen).
- El admin entra a la sala como OBSERVADOR (sin matricularse ni pujar) —
  `watch_auction`, solo rol admin.

Verificación: tsc + boot smoke 39 módulos / 98 rutas / 0 errores + build
+ auditoría de identificadores en 0.

---

## ✅ SPRINT L — La cartilla de bingo, rediseñada

**El bug de diseño (causa raíz):** la cabecera y las casillas usaban
`<Col span={24 / 5}>` = **4.8**. Ant Design solo acepta enteros de 0 a 24,
así que esas columnas se quedaban sin ancho: las letras B-I-N-G-O
colapsaban a la izquierda y no coincidían con sus números. Ahora la
cartilla es una **rejilla CSS de 5 columnas** — verificado midiendo el
DOM: los centros de B/I/N/G/O (213/301/389/477/565 px) coinciden al píxel
con los de la primera fila.

**La cartilla ahora parece una cartilla:**
- Tarjeta con marco y sombra; en modo claro es **cartulina** (#fffdf7),
  no una caja gris.
- **Cabecera de colores**, una por columna (B índigo · I celeste · N
  verde · G dorado · O rosa) — como las cartillas de toda la vida.
- Casillas cuadradas con rejilla y número grande y legible.
- **Marcado con dauber**: el sello de tinta translúcido de los bingos
  reales, con animación de sellado — el número se sigue leyendo debajo
  (antes el número desaparecía bajo un degradado).
- Casilla central **★ LIBRE** en dorado, como manda el formato de 75.
- La bola recién cantada **late** en tu cartilla (contorno dorado).

**La bola cantada** dejó de ser una etiqueta: ahora es una **bola de
bombo** con volumen (degradado radial, sombra interior) que cae con
animación, con su letra en el color de su columna.

**Tablero de bolas** (antes "Números cantados"): ya no es una lista que
crece sin control, sino el **tablero completo 1-75 en 5 filas B/I/N/G/O**
— de un vistazo ves qué salió y qué falta, con la última bola resaltada
en dorado. Es el tablero que cuelgan en los bingos de verdad.

Verificación: build + auditoría de identificadores + medición del DOM
renderizado (25 casillas, 24 marcadas, 1 libre, 75 del tablero).

---

## ✅ SPRINT M — Panel tipo AdminLTE, CMS, permisos, contabilidad, login y seguridad

### 🖥️ Panel de administración rediseñado (AdminShell)
Sidebar fijo estilo AdminLTE (Drawer en móvil) con el menú agrupado en
**Operación · Gestión · Configuración**, cabecera con breadcrumb y
avatar. El dashboard dejó de ser el layout viejo (traía sus propias
pestañas y quedaba anidado dentro del sider: nav duplicada) y ahora es
un **tablero de tareas**: 4 cajas de color con lo accionable (pagos por
verificar, canjes por atender, sorteos en venta, sorteos EN VIVO) que
llevan a su módulo con un clic, más cifras de contexto y accesos rápidos.

### 🔐 Permisos por módulo (no todos ven todo)
- `User.permissions: string[]` + `ADMIN_MODULES` (dashboard, sorteos,
  pagos, usuarios, tienda, erp, reclamos, subastas, contabilidad,
  contenido) y presets por rol.
- En **Usuarios y permisos** creas personal marcando casillas por módulo.
- El menú se filtra con `canSee()`, `ProtectedRoute perm="x"` corta la
  ruta y `firstAllowed()` manda a cada quien a su primer módulo.
- **La verdad vive en el servidor**: `PermissionsGuard` consulta el
  permiso EN LA BD en cada request (no en el token) — si le quitas un
  permiso a alguien, surte efecto al instante, sin esperar a que expire
  su sesión. Ocultar el botón es cosmética; el guard es la seguridad.
- Verificado: un operador con solo `pagos` y `tienda` ve exactamente
  esos dos ítems, y escribiendo /admin/contabilidad a mano termina de
  vuelta en /admin/pagos.

### 🎨 CMS de marca y contenido (Admin → Contenido y marca)
Editas sin tocar código: **nombre de la empresa, logo, color primario,
tagline**, todo el texto de la **landing** (titular, subtítulo, CTA,
chips, secciones) y el **Quiénes somos**. Se guarda en Settings
(`site`), lo sirve `GET /site` (público) y `SiteProvider` lo aplica EN
VIVO: nombre, logo, `--z-primary` y hasta el título de la pestaña.

### 📒 Contabilidad (Admin → Contabilidad)
Separa lo que de verdad importa: **dinero real** (depósitos confirmados)
vs **promocional** (reembolsos Cero Pérdida, bonos) — que no es ingreso
ni costo, es marketing. Incluye actividad (boletos, tienda canje/venta,
subastas), **pasivo con usuarios** (contable + canje + retenido), premios
entregados, caja neta, cola de depósitos pendientes, y **libro mayor**
filtrable con exportación CSV (con BOM, abre bien en Excel en español).

### 🔑 Login pro (usuarios y personal)
Pantalla dividida: panel de marca (logo, nombre y colores del CMS) +
formulario, con Segmented Ingresar/Registrarme, autocompletado correcto,
mostrar/ocultar contraseña y el paso de verificación por código. En móvil
el panel se recoge y manda el formulario. **Un solo acceso** para
usuarios y staff: el rol lo decide el servidor con el token — dos puertas
de login serían dos superficies que atacar.

### 🛡️ Seguridad (primera capa)
- **helmet** (cabeceras), `x-powered-by` off, `trust proxy` para IP real.
- **ValidationPipe** con `whitelist` + `forbidNonWhitelisted`: se
  eliminan y rechazan propiedades no declaradas (payload injection).
- **CORS** solo a los orígenes de `CLIENT_URL` (lista separada por comas).
- **Rate limit global** (120 req/min por IP) con ThrottlerGuard.
- **bodyParser 256kb** (corta payloads gigantes).
- **Aborta el arranque en producción sin `JWT_SECRET`** — nada de
  secretos por defecto.
- Permisos validados en BD por request; contraseñas con bcrypt; el
  cliente nunca decide qué puede hacer.

Pendiente para el próximo sprint de seguridad: rotación/expiración de
refresh tokens, 2FA para el admin, auditoría de acciones del staff,
subida de archivos a S3 con antivirus, y backups automáticos.

Verificación: tsc + boot smoke **42 módulos / 105 rutas / 0 errores** +
build + auditoría de identificadores en 0 + medición del DOM (sidebar,
grupos, 4 StatBox, login 469/469 px) + prueba real de permisos.

---

## ✅ SPRINT N — Tres mundos separados, seguridad real y rediseño juvenil

### 🧱 El panel ya NO vive dentro del sitio
Antes TODO (incluido /admin) colgaba de un único Shell público: por eso
el panel salía embebido, con la cabecera de Sorteos/Tienda/Bingo encima y
el footer del Libro de Reclamaciones debajo. Ahora hay **tres mundos
independientes**:
1. `/login` → pantalla completa, sin cabecera del sitio.
2. `/admin/*` → **aplicación de administración propia**: sider fijo de
   borde a borde (100vh), su cabecera pegajosa con breadcrumb, su tema
   claro/oscuro, su pie con la sesión activa y salida "ver el sitio
   público". Piel propia (`--z-admin-bg`), más sobria que el sitio.
3. El resto → sitio público en `PublicShell` (con `<Outlet />`).
Verificado midiendo el DOM: 0 cabeceras públicas dentro de /admin, sider
en top:0 con 900px de alto, sin footer público.

### 🔐 Seguridad (capa 2 — la que de verdad para ataques)
- **Bloqueo por fuerza bruta**: 5 fallos seguidos → 5 min bloqueada; 10 →
  30 min (escalonado: mata al bot, no al que se equivocó de tecla). El
  DNI es público y solo tiene 8 dígitos: sin esto, probar contraseñas es
  gratis. Al entrar bien, el contador se limpia.
- **Mismo mensaje de error exista o no el DNI**: no confirmamos qué
  cuentas existen (enumeración de usuarios).
- **Anti-inyección NoSQL** (`MongoSanitizeMiddleware`, global): elimina
  claves con `$` o puntos de body, params y query. Sin esto,
  `{"dni": {"$ne": null}}` en el login significa "cualquier usuario" y se
  entra sin contraseña. Además deja aviso en consola: nadie manda `$` por
  accidente.
- **Contraseñas decentes al registrarse**: mínimo 8 con letras y números
  (el login sigue aceptando las viejas: no rompe cuentas existentes).
- **BITÁCORA DE AUDITORÍA** (`/admin/auditoria`, solo admin): cada
  escritura del personal queda firmada — quién, qué, cuándo, IP y si
  salió bien. Interceptor global (ningún módulo puede "olvidarse"),
  filtra secretos (nunca guarda contraseñas ni tokens), es de solo
  escritura y jamás rompe la operación si falla. Motivo: en plataformas
  con dinero, el fraude interno (confirmar un depósito que no llegó) es
  más frecuente que el hacker externo.
- Ya estaban: helmet, CORS por lista, ValidationPipe con
  whitelist+forbidNonWhitelisted, rate limit global 120/min, límites
  estrictos por endpoint de auth (login 8/min, registro 5/min, reenvío
  3/min), body 256kb, sin arranque en producción sin JWT_SECRET, permisos
  validados en BD por request.

### 🎨 Rediseño juvenil del sitio de sorteos
- Titulares con **degradado de marca** (`.z-gradient-text`).
- **Tarjetas de sorteo** rediseñadas: radio 20px, cinta de color superior
  (dorada si está EN VIVO), foto con badge encima, **precio protagonista
  en degradado**, píldoras de datos (`🎟️ quedan 42`, `🔥 ¡Últimos 12!`
  cuando de verdad quedan pocos), barra de avance fina y CTA "Elegir mi
  número →" con degradado y rebote al pulsar.
- **Badge EN VIVO que late** (pulso real, no un tag plano).
- Hero con blobs de color desenfocados.
- Grilla de números con rebote al elegir.

Verificación: tsc + boot smoke **44 módulos / 106 rutas** + build +
auditoría de identificadores en 0 + medición del DOM.

---

## ✅ SPRINT O — Robustez, escala y limpieza (backend NestJS)

### 🚀 El cuello de botella real: la portada
`GET /raffles` (la ruta MÁS visitada) hacía un `$lookup` que cargaba
**todos los boletos de cada rifa** solo para contarlos con `$size`. Con
400 boletos por rifa, 5 rifas y 1.000 visitas/minuto, eso son **2
millones de documentos leídos por minuto** para mostrar "287/400".
- Ahora `Raffle.soldCount` es un contador denormalizado que se actualiza
  con `$inc` **dentro de la misma transacción de compra**: si la compra
  falla, no queda contado. La vitrina es una lectura pura sobre el índice
  `status+drawDate`, sin tocar la colección de boletos.
- `POST /raffles/recount` (admin) recuenta y corrige si el contador se
  desvía alguna vez. **Todo contador rápido necesita una forma de volver
  a la verdad** — sin eso, la optimización es una bomba de tiempo.

### 📄 Consultas sin techo (lo que revienta al crecer)
- `GET /transactions/mine` devolvía TODOS los movimientos: ahora paginado
  (`?page&limit`, tope duro de 100) y con compatibilidad para el cliente
  actual.
- `GET /tickets/mine`: tope de 300 (máx. 500), ordenado por recientes.
- La lista de rifas tiene tope de 200.
- (Usuarios y auditoría ya estaban paginados.)

### 🛡️ El agujero abierto: los WebSockets
El rate limit HTTP **no protege los sockets** — una vez abierta la
conexión, los eventos no pasan por Express. Un bot podía disparar miles
de `place_bid` por segundo: tumbar el proceso o ganar por saturación.
- Nuevo `WsRateLimiter`: ventana deslizante por socket y por evento, en
  memoria (O(1), sin BD), con límites según el costo real: `place_bid`
  12/10s, `buy_now` 3/10s, `host_call` 30/10s, `grid_select` 60/10s…
- Se libera solo al desconectar el socket (sin fugas de memoria en
  servidores con meses de uptime).
- Aplicado en los gateways de subastas, bingo y sorteos en vivo.
- **Probado**: de 50 pujas seguidas de un bot pasan 12 y se bloquean 38;
  otros sockets no se ven afectados; cada evento tiene su propia cubeta.

### 🧹 Clean code
- `maskName` estaba centralizado pero varios módulos lo importaban **a
  través de** `live.service` (re-export puente): ahora todos usan
  `common/mask-name.util` y el puente desapareció.
- Tipos explícitos donde la inferencia de Mongoose reventaba el
  compilador (`RaffleListItem`) — el contrato queda escrito, no inferido.
- `Record<string, unknown>` en vez de `any` en las firmas tocadas.

### Ya estaba (de sprints previos, verificado)
Índices compuestos en las 8 colecciones calientes · caché de settings con
TTL · `compression` · `enableShutdownHooks` · pool de Mongo acotado
(30/instancia) · validación de entorno al arrancar · sondas
`/health` y `/health/ready` · filtro global de excepciones · helmet ·
CORS por lista · throttler global y por endpoint · sanitizador NoSQL ·
bloqueo por fuerza bruta · bitácora de auditoría · permisos en BD.

Verificación: tsc limpio + boot smoke **45 módulos / 109 rutas** + build
del cliente + prueba unitaria real del limitador de sockets.

---

## 🔧 HOTFIX (post Sprint O) — el interceptor de auditoría rompía TODA escritura del staff

**Síntoma:** `PUT /api/v1/auctions/flag → 500 TypeError:
pipe_1.pipeFromArray(...) is not a function`, y los bingos no se creaban.

**Causa:** en `audit.interceptor.ts` escribí
`next.handle().pipe({ next, error } as any)`. `pipe()` recibe
**operadores**, no un observador. El `as any` silenció a TypeScript: sin
ese cast, el compilador lo habría cazado. Peor aún, `pipe()` reventaba
ANTES de suscribirse al observable, así que **el handler de Nest nunca
llegaba a ejecutarse** — por eso además de dar 500, no se creaba nada.

**Alcance:** cualquier POST/PUT/PATCH/DELETE hecho por admin, operador o
presentador: crear salas de bingo, crear rifas, confirmar pagos, el flag
de subastas… todo. Los usuarios normales no pasaban por el interceptor,
así que solo fallaba el staff.

**Arreglo:** usar el operador `tap`, que espía el flujo sin alterarlo:
```ts
return next.handle().pipe(
  tap({ next: () => void write$(true), error: () => void write$(false) }),
);
```
**Verificado** con la petición exacta que fallaba: PUT /auctions/flag
responde `{enabled:true}`, la bitácora escribe `PUT /auctions/flag`
success=true, los intentos fallidos quedan con success=false, los
usuarios normales y los GET no ensucian la bitácora, y las contraseñas
siguen sin guardarse.

**Lección aplicada:** se eliminó el único `as any` de operadores rxjs del
backend; no queda ningún otro `.pipe()` en el código.

### 🎨 Frontend: clave duplicada en App.jsx
`borderBottom` estaba dos veces en el estilo del header: la segunda
(`MISIO_COLORS.bgElevated`) pisaba a la buena (`var(--z-border)`). Se
eliminó la duplicada — build sin advertencias.

Verificación: tsc + boot smoke 45 módulos / 109 rutas + build del cliente
limpio + prueba del interceptor contra la petición real.

---

## 🔎 REVISIÓN DE SALDOS + SELLO DE VERSIÓN (v1.0.0)

### Los 3 problemas reportados YA estaban corregidos en el código
Se auditó cada ruta que mueve dinero y cada archivo señalado:

1. **"Compré 2 boletos de S/ 5 con S/ 20 y quedé en S/ 0"** → era el
   **DOBLE COBRO**: la compra hacía `adjustWallet(-total)` Y ADEMÁS
   `txService.create({status: COMPLETED})`, que también mueve el saldo →
   cobraba dos veces (20 − 10 − 10 = 0). También explicaba el "no tienes
   saldo" a quien SÍ tenía (el segundo cobro no alcanzaba).
   Estado: **corregido** — el cobro ocurre UNA vez, dentro del asiento
   contable. Verificado: `grep -c "adjustWallet("` en
   `tickets.service.ts` → **1**.
2. **`AdminUsers.jsx: useEffect is not defined`** → el import existe en
   la línea 1 del archivo actual.
3. **Recibos** → el usuario ya está en SOLO LECTURA (`MiPerfil`: "el
   recibo lo EMITE la empresa: aquí solo se consulta"), el admin sube
   desde **Pagos** (`receiptUploader`) y el backend acepta la subida
   **solo de personal** (antes el dueño podía adjuntar cualquier archivo
   a su propio movimiento y hacerlo pasar por comprobante nuestro).

Conclusión: el entorno local estaba corriendo un build anterior.

### 🏷️ Sello de versión (para que esto no vuelva a pasar)
Diagnosticar "sigue fallando" era adivinar: ¿bug nuevo, o servidor con
código viejo? Ahora se ve:
- `server/package.json` y `client/package.json` → **v1.0.0** (única
  fuente de verdad).
- `GET /api/v1/health` devuelve `version`, `uptimeSeconds` y `startedAt`.
  Verificado en vivo: `{"status":"ok","version":"1.0.0",…}`.
- Vite inyecta `__APP_VERSION__` al compilar.
- El **pie del panel** muestra `panel v1.0.0` · `API v1.0.0`, y si NO
  coinciden pinta un aviso rojo: "el panel y la API son de versiones
  distintas".

### ⚠️ Cómo instalar sin dejar archivos viejos
Descomprimir ENCIMA de la carpeta anterior deja código viejo si el
sistema pregunta y se elige "omitir", y además quedan archivos que ya no
existen (p. ej. `views/AdminHome/`, borrado al crear `AdminDashboard`).
Recomendado:
1. Borrar `client/src` y `server/src` (o extraer en carpeta limpia).
2. Extraer el zip nuevo.
3. `npm install` en `client` y `server` (cambió package.json).
4. Reiniciar ambos servidores; en el cliente, borrar `node_modules/.vite`
   si el navegador insiste con módulos cacheados.
5. Comprobar en el pie del panel: debe decir **panel v1.0.0 · API v1.0.0**.

---

## ✅ v1.1.0 — Historial de pagos, logística enfocada y seguimiento del ganador

### 🧾 Admin → Pagos: historial con recibos
`GET /payments/history?status=completed|failed&from=&to=&page=&limit=`
(paginado, tope 100). Nueva tarjeta **Historial de pagos** con filtro
Aprobados/Rechazados y rango de fechas: desde ahí se adjunta o reemplaza
el recibo de un pago YA aprobado. Antes solo existía la cola de
"pendientes", y un pago aprobado desaparecía de la vista — pero el
comprobante casi nunca se emite en ese mismo segundo.

### 🚚 Logística: fuera lo que ya vive en otro módulo
- **Eliminados** los KPIs de Ingresos / Costos / Margen neto y las
  columnas de Ingresos y Margen: eso es **Contabilidad** (que ya lee el
  `purchaseCost` del ERP para su costo de premios). Tener el mismo número
  en dos pantallas garantiza que un día no coincidan.
- El panel ahora mide lo suyo: **En almacén · En tránsito · Entregados**.
- Título honesto: "Logística de premios" (era "Logística y Finanzas") con
  un enlace directo a Contabilidad para lo del dinero.

### 📦 Gestión del estado del premio (el gesto del día a día)
- `PATCH /logistics/:id/status` — cambia **solo** el estado, sin abrir un
  formulario con datos que no vas a tocar.
- Columna **Avanzar entrega**: "Despachar" (en almacén) → "Marcar
  entregado" (en tránsito) → "✓ Cerrado".
- **Reglas que protegen la operación**, validadas en el servidor:
  · a TRÁNSITO se exige courier + guía (sin guía el ganador no puede
  rastrear nada);
  · a ENTREGADO se exige la foto de evidencia (es lo que hace verificable
  la promesa de que sí entregamos).
- Cada cambio escribe la bitácora solo.

### 📇 Contacto del ganador en el mismo módulo
La lista trae el ganador con teléfono, correo y dirección de envío
(`populate` de nombre, dni, teléfono, email, dirección, contacto alterno).
El modal de despacho muestra **a quién enviar**, su dirección con
referencia y un enlace directo a **WhatsApp** — sin saltar a Usuarios a
buscar a la persona.

### 🎁 El ganador ve su premio y sigue el envío
- `GET /my-prizes` en un **controlador aparte** (`MyPrizesController`):
  el controlador del ERP es `@Roles(ADMIN)` a nivel de clase y colgar ahí
  una ruta de usuario obligaría a recordar un override por método — el
  detalle que un día se olvida y abre el inventario entero.
- El servicio decide qué sale: **nunca** el costo de compra ni la boleta
  del proveedor (información interna).
- Nueva vista **Mis premios y envíos** (arriba de Mis boletos en Mi
  Misio): pasos Preparando → En camino → Entregado, courier y **número de
  guía copiable** para rastrear en la web del courier, la bitácora real y
  la foto de la entrega cuando llega.

Verificación: tsc + boot smoke **45 módulos / 112 rutas** + build + auditoría
de identificadores en 0.

---

## ✅ v1.2.0 — Rescate de rifas atascadas, reparación de datos y ganadores visibles

### 🩺 Diagnóstico de los síntomas reportados
El código de v1.1.0 ya cerraba bien el ciclo ganador→ERP→Mis premios,
pero **el código corregido no cura los datos que se rompieron con las
versiones anteriores**: rifas con todos los boletos quemados (bug viejo
de tiradas al agua infinitas) y cierres que corrieron sin el upsert del
ERP (ganador asignado a una fila inexistente, perdido en silencio). De
ahí: "no hay tickets activos", "no me sale el ganador", "no veo mis
premios". La solución no es solo código: son HERRAMIENTAS DE REPARACIÓN.

### 🔄 Reiniciar tiradas (rifa atascada)
- `POST /raffles/:id/reset-draws` (admin): devuelve al juego los boletos
  quemados al agua. SOLO si la rifa no tiene ganador: un resultado
  declarado es público y no se rebobina.
- Botón **"Reiniciar tiradas"** en el panel del sorteo (con confirmación).
- El error de la tómbola ahora dice la verdad: distingue "aún no se
  vendió ningún boleto" de "todo se quemó al agua — usa Reiniciar
  tiradas".

### 🔗 Sincronizar ganadores (repara el pasado)
- `POST /logistics/sync-winners` (admin): recorre TODOS los sorteos
  completados y crea/actualiza la fila de envío de cada ganador que
  falte (fuente primaria: snapshot `raffle.winner`; fallback: boleto
  ganador). Deja constancia en la bitácora ("reparación de datos").
- Botón **"🔗 Sincronizar ganadores"** en Logística. Un clic y aparecen:
  el ganador con su contacto, la columna "Avanzar entrega" (que se
  ocultaba sin winnerId) y los premios en "Mis premios" del usuario.

### 🏆 Pestaña global de ganadores — ahora sí muestra datos
Existía (/ganadores en el menú) pero estaba VACÍA por un desajuste de
contrato: la API devuelve `winner: {code, name}` anidado y la página leía
`winnerName`/`winnerCode` planos → undefined. Alineado. Además:
- La API usa como fuente primaria el snapshot `raffle.winner` (sobrevive
  aunque los boletos se borren o se re-siembre la base) con fallback al
  boleto ganador.
- **Formato acordado**: `#PS500004 Brand.... Juare....` — código del
  boleto con prefijo + nombre enmascarado.
- `maskName` global actualizado a ese estilo (ganadores, pujas, lista
  pública de boletos y bingo, todos consistentes).

### 📋 Pasos para dejar TU base sana (una sola vez)
1. Instala v1.2.0 (verifica el pie del panel: panel v1.2.0 · API v1.2.0).
2. Logística → **🔗 Sincronizar ganadores** (repara los sorteos pasados).
3. Si una rifa vieja quedó atascada: panel del sorteo → **Reiniciar
   tiradas** y sortea de nuevo.

Verificación: tsc + boot smoke **45 módulos / 114 rutas** + build +
auditoría de identificadores en 0 + prueba del formato de máscara
("Brandux Juarez" → "Brand.... Juare....").

---

## ✅ v1.2.0 — Diagnóstico de la tómbola, cierre visible y reparación de datos

### 🔎 Diagnóstico: el código v1.1.0 estaba bien; los DATOS eran viejos
Los síntomas reportados ("no hay tickets activos", ganador manual sin
fila en envíos) los producen datos creados por versiones ANTERIORES:
boletos quemados por el bug viejo del modo directo, y cierres que
corrieron antes del upsert al ERP. El código nuevo no re-repara solo esa
historia — por eso esta versión añade herramientas de reparación.

### 🛠️ Qué se corrigió / añadió de verdad en esta versión
1. **El cierre ya nunca falla en silencio**: si la tirada ganadora sale
   bien pero el cierre (reembolsos Cero Pérdida + fila en Logística)
   revienta, el panel muestra una alerta roja con el detalle y un botón
   **"Reintentar cierre"** (`POST /raffles/:id/close`, idempotente por el
   candado `refundsProcessed`). Antes había un `catch {}` vacío: el admin
   veía "hay ganador" y dos pantallas después no encontraba a nadie en
   Logística, sin ninguna pista.
2. **Conteo real de boletos activos**: la decisión de si se puede girar
   salía de la lista de participantes, que está RECORTADA a 200 y
   ordenada por número. En rifas grandes con muchos quemados, la pantalla
   podía decir "0 activos" habiendo activos. Ahora `GET /live/:id`
   devuelve `activeCount` (countDocuments sin techo) y el panel decide
   con ese número; la lista además prioriza los activos.
3. **`POST /raffles/:id/reset-draws`** (botón "Reiniciar tiradas" en el
   panel del sorteo): devuelve al juego los boletos `burned_al_agua` de
   una rifa SIN ganador — rescata rifas atascadas por pruebas o por el
   bug viejo del modo directo.
4. **`POST /logistics/sync-winners`** (botón "🔗 Sincronizar ganadores"
   en Logística): recorre los sorteos COMPLETADOS y crea/actualiza la
   fila del ERP del ganador que falte (fuente: snapshot `raffle.winner`,
   con fallback al boleto WINNER). Repara la historia rota por cierres de
   versiones viejas.
5. **Mensajes honestos de la tómbola**: distingue "aún no se vendió
   ningún boleto" de "todo se quemó al agua — usa Reiniciar tiradas".

### 🏆 Ya existía y queda verificado en esta versión
- **Pestaña global Ganadores** (`/ganadores`, pública): cada sorteo
  terminado con `#PS500004 Brand.... Juare....` (código de boleto +
  nombre enmascarado DESDE EL SERVIDOR), estado de entrega y foto de
  evidencia. `maskName("Brandux Juarez")` → **"Brand.... Juare...."**
  (probado contra el compilado).
- **Mis premios y envíos** (arriba de Mis boletos en Mi Misio):
  Preparando → En camino → Entregado, guía copiable, bitácora y foto.
- Columna **"Avanzar entrega"** y contacto del ganador en Logística.

### 📋 Pasos para sanar TU base de datos (una sola vez)
1. Instala v1.2.0 completa (borra `src` viejos, extrae, `npm install` en
   ambos). Verifica el pie del panel: **panel v1.2.0 · API v1.2.0**.
2. Logística → **🔗 Sincronizar ganadores** → aparecen las filas de envío
   de los sorteos ya terminados, con su ganador y el botón de estado.
3. Si una rifa está atascada ("no hay tickets activos" sin ganador):
   panel del sorteo → **Reiniciar tiradas** → girar de nuevo.
4. Con eso: Logística muestra ganador y "Avanzar entrega", el usuario ve
   "Mis premios", y `/ganadores` lista los sorteos pasados.

Verificación: tsc limpio + boot smoke **45 módulos / 114 rutas** + build
del cliente + auditoría de identificadores en 0 + test real de maskName.

---

## ✅ v1.3.0 — Refresh token, tests automatizados, 404 y S3-ready

### 🔐 Refresh token con rotación (la sesión ya no muere sin aviso)
Antes: un JWT de 7 días que al expirar dejaba al usuario viendo errores
401 sin entender qué pasó. Ahora:
- **Access token**: corto (2h), viaja en cada request.
- **Refresh token**: largo (30d), se usa UNA vez para pedir un access
  nuevo — y se ROTA: cada uso invalida el anterior.
- **Renovación silenciosa**: si un request falla con 401, el cliente
  intenta renovar con el refresh token y reintenta. El usuario no nota
  nada. Si el refresh también falla (token robado y rotado, o sesión
  cerrada), limpia todo y manda al login.
- **POST /auth/logout**: revoca el refresh token en el servidor — el
  access viejo expira solo en 2h pero ya no se puede renovar.
- El refresh se guarda HASHEADO en la BD: si alguien la lee, no puede
  usar los tokens.

### 🧪 Tests automatizados (10 tests, los que importan)
Cada test existe porque ESE bug ocurrió:
- `maskName` — formato exacto acordado con el negocio.
- `WsRateLimiter` — acepta 12 de 50 pujas, otro socket no se ve
  afectado, cubetas por evento, mensaje de espera.
- `AuditInterceptor` — no revienta con pipe() (el bug que mató toda
  escritura del staff), registra la acción, filtra contraseñas, ignora
  usuarios normales.
`npx jest --runInBand` → 10 passed.

### 🚫 Página 404
Una URL mal escrita muestra "404 — Esta página no existe" con botón al
inicio, en vez de pantalla blanca.

### ☁️ Uploads listos para S3
`multer.config.ts` documentado con los 4 pasos exactos para migrar de
disco local a S3 (instalar multer-s3, cambiar el storage, borrar
serveStatic, ajustar las rutas). Los controladores no se tocan.

### 🛠️ Fix: /health requería package.json con ruta incorrecta
`require('../../package.json')` no resuelve desde `dist/src/` → corregido
a `../../../package.json`. El boot fallaba silenciosamente en producción
(donde no hay dist limpio del sprint anterior).

Verificación: tsc + boot smoke **45 módulos / 116 rutas** + build + 10
tests passing + auditoría de identificadores en 0.

---

## ✅ v1.4.0 — 2FA, backups, paginación y TTL

### 🔑 2FA para el administrador (TOTP / Google Authenticator)
Tu cuenta admin es la llave de todo: saldo, pagos, cierre de sorteos.
Una contraseña robada (phishing, reutilización) lo abre todo. Ahora:
- **POST /auth/setup-2fa** → genera secreto y QR para escanear.
- **POST /auth/confirm-2fa** → confirma con el primer código → activa.
- **POST /auth/disable-2fa** → desactiva (requiere el código actual).
- **POST /auth/verify-2fa** → login paso 2: manda el código TOTP.
- En el login, si el usuario tiene 2FA activo, la respuesta es
  `{ requires2FA: true, dni }` sin tokens — el frontend pide el código
  antes de entregar la sesión.
- El secreto TOTP se guarda con `select: false` (nunca sale en consultas
  normales — es equivalente a una contraseña).

### 💾 Backups automáticos de MongoDB
Script `server/scripts/backup.sh`:
- `mongodump --gzip` → tar → (opcional) upload a S3.
- Limpia backups locales de más de 14 días.
- Configurar en cron: `0 */6 * * * /ruta/backup.sh >> backup.log 2>&1`
- Variables: `MONGO_URI`, `BACKUP_DIR`, `S3_BUCKET`, `RETENTION_DAYS`.

### 📄 Paginación real en el dashboard del usuario
El historial de movimientos ahora pagina contra el backend (`?page&limit`)
en vez de cargar todo de golpe. Un usuario con 500 movimientos ya no
sufre en el móvil.

### ⏱️ TTL en la bitácora de auditoría
Índice `expireAfterSeconds: 90 días` en `audit_logs`. MongoDB borra los
registros viejos automáticamente: sin esto, la bitácora crece sin límite.

Verificación: tsc + boot smoke **45 módulos / 120 rutas** + 10 tests
passing + build + auditoría de identificadores en 0.

---

## ✅ v1.5.0 — Open Graph, Redis para Socket.IO y modo mantenimiento

### 🔗 Open Graph / Twitter Cards (WhatsApp deja de ser un link pelado)
Cuando alguien comparte un link de Misio en WhatsApp, Facebook o
cualquier red, sale la imagen de portada, el título y la descripción —
en vez de un URL sin contexto. Incluye:
- `og:image` (1200×630 con la marca y los blobs de color del tema).
- `og:title`, `og:description`, `og:locale` (es_PE), `og:site_name`.
- `twitter:card` = `summary_large_image` (también lo lee WhatsApp como
  fallback).
Para cambiar la imagen: reemplaza `client/public/og-cover.png`.

### 📡 Redis adapter para Socket.IO (escala horizontal)
Hoy con un solo proceso funciona sin Redis. Con dos procesos (detrás de
un load balancer), los usuarios en procesos distintos no comparten sala:
no ven las tiradas, el bingo se rompe.
- **Activación**: basta con `REDIS_URL=redis://localhost:6379` en el
  `.env`. Sin esa variable, el adaptador NO se activa y todo sigue
  funcionando como hoy.
- Sin Redis: el log dice "Socket.IO funciona en modo local (un solo
  proceso)". Con Redis: "escala horizontal activa".

### 🔧 Modo mantenimiento (switch, no apagar el servidor)
- **Admin → Contenido y marca**: switch ON/OFF con mensaje configurable.
- El middleware intercepta TODA la API y devuelve 503 con el mensaje.
- Siguen funcionando: `/health` (load balancer), `/auth` (para que el
  admin pueda loguearse y desactivar), `/settings/maintenance` (para
  poder apagarlo), `/site` (el frontend lo necesita).
- El sitio público muestra un banner amarillo con el mensaje.
- Útil para: migraciones de BD, reparaciones de datos, deploys que tocan
  el schema — sin reiniciar nada.

Verificación: tsc + boot smoke **45 módulos / 120 rutas** + 10 tests
passing + build + auditoría de identificadores en 0 + adaptador Redis
con fallback verificado.

---

## ✅ v1.6.0 — Correos transaccionales, k6 y notificaciones por email

### 📧 SMTP listo para producción (4 correos transaccionales)
`MailService` reescrito con templates HTML inline y verificación de
conexión al arrancar. Sin SMTP: todo funciona y los correos salen por
consola. Con SMTP: se envían de verdad.

Correos que se mandan automáticamente:
1. **Código de verificación** (registro): ya existía.
2. **🎉 ¡Ganaste!** → al cerrar la rifa (`closeRaffle`): el ganador se
   entera por correo, no cuando abra la app por casualidad.
3. **✅ Pago confirmado** → al confirmar un depósito: el usuario sabe que
   su plata llegó.
4. **🚚 Premio despachado** → al cambiar estado a tránsito: el tracking
   es lo primero que quiere saber el ganador.

Todos con `try/catch { /* nunca rompen la operación */ }` — si el SMTP
falla, el pago sigue confirmado y la rifa sigue cerrada.

Proveedores recomendados documentados en el archivo:
- **Resend**: 100 emails/día gratis, dominio verificado.
- **Amazon SES**: ~$0.10 por 1.000 correos.
- **Gmail**: gratis con contraseña de app (500/día).

### 📊 Prueba de carga k6 (`scripts/load-test.js`)
Simula el flujo real: portada → registro → recarga → compra, con 500
usuarios virtuales durante 2 minutos. Thresholds configurados:
- `p95 < 500ms` → bien
- `failed_requests < 5%` → bien
Instalar k6 y ejecutar: `k6 run scripts/load-test.js`

Verificación: tsc + boot smoke **45 módulos / 120 rutas** + 10 tests
passing + build + auditoría en 0 + SMTP con fallback + Redis con
fallback.

---

## ✅ v1.7.0 — Pulido visual (revisión de interfaz con capturas reales)

Revisé todas las pantallas con capturas reales y estas son las mejoras:

### Lo que arreglé:
1. **Placeholder de tarjetas sin imagen**: de un emoji en fondo gris plano
   a un degradado con los colores de marca. Se ve como una tarjeta de
   verdad aunque no tenga foto del producto.
2. **Saldo del usuario ("Mi Misio")**: el saldo contable ahora es un
   HÉROE VISUAL — grande, con degradado de marca, acompañado del canje y
   el retenido en texto más pequeño, y el botón de recarga al lado. Antes
   eran 3 cards iguales compitiendo por atención; ahora hay jerarquía:
   lo que más te importa es lo más grande.
3. **Ganadores**: las tarjetas tienen cinta dorada superior y el badge
   del ganador (`🏆 #PS500004 Brand.... Juare....`) es una píldora
   dorada con borde en vez de texto plano. Hover con elevación.
4. **CSS de pulido**: clases utilitarias para hero con blobs
   (`.z-hero-section`), wallet protagonista (`.z-wallet-hero`),
   placeholder de tarjeta con degradado (`.z-card-placeholder`),
   tarjeta de ganador con brillo (`.z-winner-card`) y footer limpio.

### Lo que dejé como está (y por qué):
- **Login split-screen**: se ve profesional, la marca del CMS funciona,
  el formulario es claro. No lo toqué.
- **Panel admin**: la piel sobria cumple su función (administrar, no
  vender). No merece los mismos recursos visuales que el sitio público.
- **Bingo**: la cartilla de v1.2.0 con el dauber y las cabeceras de
  colores ya está bien.

Verificación: build limpio + auditoría de identificadores en 0.

---

## ✅ v1.8.0 — Compartir, tickets descargables, anuncios, tracking y countdown

### 🔗 Compartir sorteo en redes sociales
Componente `ShareButtons` en cada sorteo con tres opciones:
- **Web Share API** (celular): abre la bandeja nativa con todas las apps.
- **WhatsApp directo**: mensaje armado con título, precio y link.
- **Copiar link**: para pegar donde quieran.
El link incluye UTM automático (`?utm_source=share&utm_campaign=...`) y
los OG tags ya hacen que WhatsApp muestre la foto del premio.

### 📊 Tracking de origen (de dónde vienen los usuarios)
- `User.registration` guarda `source`, `medium`, `campaign` y `referrer`
  al momento de registrarse (del query string UTM del frontend).
- El DTO de registro acepta los campos UTM opcionales.
- Cada link compartido arma su propio UTM: el tracking es automático.

### 🎟️ Tickets descargables como imagen PNG
Cada boleto se ve como una tarjeta visual con la marca, el sorteo, el
número grande con degradado, el código y el estado. Botón "Descargar"
que genera un PNG a 2x (calidad retina) con `html2canvas`.
**Cada ticket descargado es publicidad gratis** cuando el usuario lo
comparte en su historia de Instagram o WhatsApp.

### 📢 Anuncios emergentes
- Backend: `GET/PUT /settings/announcements` (array de avisos con id,
  título, cuerpo, tipo info/warning/promo y flag activo).
- Frontend: al cargar la app, consulta los activos y muestra como modal
  los que el usuario NO ha visto (localStorage por ID). "Entendido" y no
  vuelve a aparecer.
- Admin → Contenido: editor de avisos con tipo, activar/desactivar y
  eliminar. Un aviso nuevo lo ven todos al instante.

### ⏱️ Countdown en mantenimiento
El modo mantenimiento ahora acepta `resumeAt` (datetime opcional). Si lo
llenas, el banner muestra un countdown en vivo: "volvemos en 2h 34m 12s".
Cuando llega la hora, el texto cambia a "¡ya deberíamos estar de vuelta!".

Verificación: tsc + boot smoke **45 módulos / 120 rutas** + 10 tests
passing + build + auditoría de identificadores en 0.

---

## 🔧 v1.8.1 — Fix: tarjetas de boletos apretadas y precio vacío

**Síntoma reportado:** las tarjetas de "Mis boletos" se veían apretadas
y el precio mostraba "S/ —".

**Causas y arreglos:**
1. **Apretadas**: el grid usaba `md={8}` (3 tarjetas por fila desde
   pantallas medianas, sin espacio). Ahora `xs=24 sm=12 lg=12 xl=8`: una
   por fila en móvil, dos en desktop, tres solo en pantallas grandes. El
   gutter subió de 12 a 16px y el padding interno de la tarjeta a 22-24px.
2. **"S/ —"**: el backend en `/tickets/mine` solo poblaba `title status`
   del sorteo, no `ticketPrice`. Se agregó al populate, el normalizador
   del frontend lo expone, y la tarjeta ahora oculta el precio si no
   existe en vez de mostrar "—".

Verificación: tsc + build del cliente sin errores.

---

## ✅ v1.9.0 — Boletos rediseñados: ticket de rifa + pestañas por estado

### 🎟️ Nuevo diseño: ticket de rifa horizontal con talón perforado
El diseño anterior (tarjeta vertical apretada) se reemplazó por el
formato clásico de boleto de tómbola:
- **Cuerpo a la izquierda**: marca, nombre del sorteo, precio, estado.
- **Talón a la derecha**: el número grande sobre fondo con degradado.
- **Perforación central**: línea de puntos vertical con dos muescas
  redondas — como un ticket que arrancas por la mitad.
- Descarga PNG a 3x (calidad para imprimir o compartir en historias).

### 📑 Tres pestañas separadas por estado del SORTEO
1. **Vigentes**: boletos de sorteos `active`/`live` que aún participan.
2. **🏆 Ganadores**: apartado especial — diseño premium DORADO (fondo
   ámbar, talón dorado, sombra cálida, sello 🏆), pensado para presumir
   en redes. La pestaña se abre por defecto si tienes un boleto ganador.
3. **Anteriores**: boletos de sorteos ya terminados (`completed`) que no
   ganaron — el historial, sin saturar la vista principal.

La separación usa el `status` del sorteo (viene poblado en
`/tickets/mine`), no el del boleto. El normalizador del frontend expone
`raffleStatus` para el filtro.

Verificación: build del cliente + auditoría de identificadores en 0 +
capturas de las pestañas Vigentes y Ganadores.

---

## ✅ v2.0.0 — Bugs de sorteo, contraseñas, fotos y reset de data

Trabajo organizado en iteraciones.

### Iteración 1 — Bugs del flujo de sorteo
Los tres bugs (#1 reembolso, #2 "sin tickets", #3 ganador manual) estaban
conectados. Diagnóstico y arreglos:
- **Causa raíz de #2/#3**: el socket del sorteo tomaba el token JWT una
  sola vez al conectar. Como el token ahora dura 2h, si expiraba, las
  tiradas fallaban en silencio mientras la pantalla seguía cargando.
  **Fix**: el socket relee el token en cada (re)conexión con una función
  `auth: (cb) => cb({ token: tokenStore.get() })`, reconexión automática
  (5 intentos), y muestra los errores de conexión claramente.
- **#1 (reembolso Cero Pérdida)**: el código ya era correcto — reembolsa
  a `walletCanje`. Solo corría si la rifa llegaba a `completed`, lo cual
  fallaba por #3. Al arreglar #3 + resetear data, el flujo completo
  funciona.
- Endpoints de rescate ya existían: `POST /raffles/:id/close` (reintentar
  cierre) y `POST /raffles/:id/reset-draws` (devolver boletos quemados).

### Iteración 2 — Recuperación y gestión de contraseñas
- **Olvidé mi contraseña**: link en el login → formulario por DNI →
  `POST /auth/forgot-password` envía correo con enlace (vence en 1h) →
  página `/reset-password?token=xxx` para crear la nueva.
- **Admin resetea contraseña**: botón "Resetear clave" en cada usuario →
  `POST /users/:id/reset-password` genera una clave TEMPORAL (Misio####)
  que el admin le comunica. Modal muestra la clave para copiar.
- **Cambio forzado**: el usuario con clave temporal (mustChangePassword)
  ve al entrar un modal que NO se puede cerrar hasta crear su propia
  contraseña. `POST /auth/change-password` con force=true.
- Nuevos campos en el schema: `mustChangePassword`, `resetToken`,
  `resetTokenExpires`. Correo de recuperación en MailService.

### Iteración 3 — Fotos de artículos
El sistema de imágenes ya existía y quedó verificado:
- `POST /raffles/:id/images`, `/store/items/:id/images`,
  `/auctions/:id/images` (hasta 4-5 fotos, campo "files").
- Botón 🖼️ en la tabla de cada panel (rifas, tienda, subastas) abre el
  modal de gestión de fotos. Las fotos se suben DESPUÉS de crear el ítem.
- El formulario de crear rifa avisa dónde subirlas.

### Iteración 4 — Reset de data
Script `server/scripts/reset-data.ts`:
- Borra sorteos, boletos, transacciones, logística, subastas, bingo,
  pagos, reclamos, notificaciones y auditoría.
- Crea un admin nuevo: DNI `00000000`, clave `Admin2026` (pide cambio al
  entrar). Conserva la configuración de marca (settings).
- `--keep-users` conserva las cuentas y solo resetea billeteras a 0.
- Ejecutar: `npx ts-node scripts/reset-data.ts`

Nota técnica: resolví una dependencia circular entre módulos (Settings ↔
Users ↔ Auth) moviendo `adminResetPassword` a UsersService.

Verificación: tsc + boot smoke **45 módulos / 124 rutas** + build +
auditoría de identificadores en 0.

---

## ✅ v2.1.0 — Legal/confianza + operación real

### 🔴 Legal y confianza (requisitos para lanzar)
- **Páginas públicas**: /como-funciona, /terminos, /privacidad. Renderizan
  markdown editable desde el CMS. Textos por defecto redactados para Perú
  (Indecopi, Ley N° 29733, saldo de canje no retirable, mayoría de edad),
  con avisos de "revisar con abogado".
- **Editor en Admin → Contenido**: tres pestañas para editar los textos
  sin tocar código (PUT /settings/legal).
- **Consentimiento**: el checkbox de registro enlaza a las páginas reales
  (abren en pestaña nueva). La fecha de aceptación ya se guardaba.
- **Enlaces en el footer**: Cómo funciona, Términos, Privacidad.

### 🟡 Operación real
- **Web Push** (PushService): avisos al celular como app nativa. Se activa
  con claves VAPID en el .env (`npx web-push generate-vapid-keys`); sin
  ellas queda desactivado sin romper nada. Push automático al ganador al
  cerrar un sorteo. Endpoints: GET /notifications/vapid-key, POST subscribe
  / unsubscribe. Banner "Activa notificaciones" en Mi Misio.
- **Export CSV**: GET /stats/export/:kind (users|deposits|raffles) con BOM
  para Excel. Tres botones en el dashboard admin.
- **Gráficos de tendencia**: GET /stats/trends?days=30 → registros/día
  (línea) y recargas/día (barras) con recharts. Rellena días vacíos con 0.

Nota: los endpoints públicos de /settings (legal, announcements,
maintenance) se separaron en un PublicSettingsController sin guard, para
que el sitio los consuma sin login.

Verificación: tsc + boot smoke **45 módulos / 135 rutas** + build +
auditoría de identificadores en 0.

---

## 🔧 v2.1.1 — Fix: "No quedan boletos activos" al girar la tómbola

**Síntoma:** la pantalla mostraba "Boletos activos: 15" y la ruleta con 15
boletos, pero al girar salía "No quedan boletos activos en esta rifa".

**Causa raíz:** inconsistencia de tipos en la consulta del boleto ganador.
- El contador de la pantalla usa `countDocuments({ raffleId })`, donde
  Mongoose castea automáticamente el string a ObjectId → contaba 15 ✓.
- El sorteo elegía el boleto con un `aggregate([{ $match: { raffleId:
  raffle._id } }])`. En un aggregate, `$match` NO castea tipos. Si los
  tickets se guardaron con `raffleId` como string (lo que pasa en algunas
  versiones de `insertMany`), el ObjectId no matcheaba ninguno → 0
  boletos → "No quedan boletos activos".

**Arreglos (dos capas):**
1. **Inserción**: los boletos ahora se guardan con `raffleId` casteado
   explícitamente a `new Types.ObjectId(raffleId)`, garantizando el tipo
   correcto de aquí en adelante.
2. **Sorteo**: el `$match` del `$sample` ahora usa `$or` para matchear el
   raffleId tanto como ObjectId como string, así los boletos viejos (con
   el tipo inconsistente) también se pueden sortear sin necesidad de
   resetear la data. Mensaje de error más claro si algo falla.

Verificación: tsc + boot smoke 45 módulos / 135 rutas + 10 tests passing.

---

## ✅ v2.2.0 — Compra resiliente, salud del servidor y sync en vivo

### 🎯 Causa raíz de "compré y no aparece nada"
La compra de boletos usa transacciones de MongoDB, que **requieren un
replica set**. El MongoDB standalone típico de Windows NO las soporta:
`withTransaction` lanzaba error, la compra fallaba en silencio, y por eso
la tómbola mostraba 0, "mis boletos" salía vacío y no había nada que
sincronizar entre usuarios.

**Fix**: la compra detecta si el Mongo soporta transacciones. Si no
(standalone), corre SIN transacción (los índices únicos siguen evitando
números duplicados) y deja un warning en el log. En producción con
replica set, sigue siendo 100% atómica.

### 🩺 Salud del servidor (lo que pediste)
- `GET /health/system`: diagnóstico completo — MongoDB (¿conectado?
  ¿standalone o replica set? ¿transacciones?), Redis, claves VAPID,
  SMTP, JWT_SECRET, memoria, uptime, versión.
- **Panel "Salud del servidor"** en el dashboard admin: cada dependencia
  con ✅/⚠️/❌ y una explicación en cristiano de qué significa y cómo
  arreglarlo. Botón "Revisar de nuevo".

### 📡 Sincronización en vivo arreglada
- **Bug real**: `join_raffle` se emitía UNA vez al entrar. Si el socket
  se reconectaba (red inestable, backend reiniciado), quedabas FUERA de
  la sala en silencio: dejabas de ver las selecciones de otros usuarios.
  Ahora el join va en el evento `connect` → se re-une en cada reconexión.
- Token del socket como función (se relee al reconectar, igual que el
  fix del panel admin).
- **Indicador "● En vivo / ○ Sin conexión"** junto al título de la rifa:
  ahora puedes VER si el tiempo real está funcionando.

Verificación: tsc + boot smoke 45 módulos / 136 rutas + 10 tests passing
+ build + auditoría en 0.

---

## 🔧 v2.2.1 — La tómbola en 0 ahora te dice POR QUÉ

**El misterio resuelto:** hay dos formas de comprar boletos — con saldo
(inmediata) y **"Pagar con Yape"** (queda PENDIENTE hasta que el admin
confirma el pago en Admin → Pagos; recién ahí se crean los boletos).
Tras el reset, los usuarios tienen saldo 0 → compran por Yape → los
boletos quedan pendientes e invisibles para la tómbola. El sistema
funcionaba; lo que faltaba era que TE LO DIJERA.

**Lo nuevo:**
1. **Diagnóstico automático en el panel del sorteo**: cuando la tómbola
   está en 0, aparece un aviso que dice exactamente por qué:
   - "Hay N compras por Yape PENDIENTES de confirmar" → con los números
     y un link directo a Admin → Pagos.
   - "Nadie ha comprado boletos todavía".
   - "Los boletos se quemaron en tiradas al agua" → usar Reiniciar tiradas.
2. **Endpoint** `GET /raffles/:id/diagnostics` (admin): desglose de
   boletos por estado + compras pendientes con sus números.
3. **Fix del retry de compra**: si la detección de "Mongo sin
   transacciones" ocurría en el último reintento, la compra devolvía
   undefined sin error. Ahora aprender el modo no consume intentos y el
   agotamiento de reintentos lanza un error claro.

Verificación: tsc + boot smoke 45 módulos / 137 rutas + 10 tests + build.

---

## 🔎 v2.2.2 — Herramientas de diagnóstico definitivas

### Script de diagnóstico de base de datos
`node scripts/diagnose.js` (desde server/) imprime el estado REAL:
- Topología de MongoDB (standalone vs replica set)
- Usuarios con sus saldos
- Cada rifa con sus boletos por estado y el TIPO de raffleId
- Transacciones pendientes (compras Yape sin confirmar) con sus números
- Últimas transacciones ejecutadas

Si la tómbola está en 0, la salida de este script dice exactamente por qué.

### Usuario de prueba con saldo en el reset
`npm run reset-data` ahora crea también:
- 🧪 DNI **11111111** · clave **Test2026** · **S/ 500 de saldo**

Con este usuario pruebas compras DIRECTAS (botón "Pagar con mi Misio"):
los boletos se crean al instante, sin pasar por la confirmación de Yape.

### Flujo de prueba recomendado
1. `npm run reset-data`
2. Crea una rifa como admin (00000000/Admin2026) y pásala a "En venta"
3. Entra como 11111111/Test2026 → compra boletos con "Pagar con mi Misio"
4. La tómbola ya muestra los boletos
5. Si compras por Yape: Admin → Pagos → CONFIRMAR → recién ahí se crean

---

## 🔧 v2.2.3 — Compra directa robusta (Mongo standalone)

**El problema real** con "Pagar con mi Misio" en Mongo standalone: el
código detectaba la falta de transacciones A MITAD de la compra (por
ensayo y error). En ese momento, el cobro o la inserción de boletos ya
podían haber corrido parcialmente sin poder revertirse, dejando la compra
en un estado inconsistente — cobrado sin boletos, o boletos a medias que
hacían fallar el reintento.

**Arreglo:**
1. **Detección al inicio**: el soporte de transacciones se prueba UNA vez
   (transacción vacía de prueba) antes de cualquier compra, y se cachea.
   Ninguna compra descubre el modo a media ejecución.
2. **Compensación manual sin transacción**: si el cobro tiene éxito pero
   la inserción de boletos falla (y no hay transacción que revierta), se
   devuelve el cobro automáticamente. El usuario nunca queda cobrado sin
   boletos.
3. **insertMany ordered**: inserción determinista de boletos.

Verificación: tsc + boot smoke 45 módulos / 137 rutas + 10 tests + build.

---

## 🔧 v2.3.0 — Detección de transacciones a prueba de balas + corrección manual

### La causa raíz (por fin)
La detección de "¿Mongo soporta transacciones?" de la v2.2.3 usaba una
LECTURA de prueba. Pero en Mongo standalone el error de replica set solo
salta al ESCRIBIR dentro de la transacción — una lectura puede pasar sin
error y dar un falso positivo. Resultado: el sistema creía que había
transacciones, las compras las usaban, y fallaban en silencio sin
guardar nada. Por eso "Nadie ha comprado boletos".

**Fix:** la prueba ahora hace una ESCRITURA real (en una colección
temporal, que se revierte). Cualquier fallo → modo sin-transacción. Ya no
hay falsos positivos: si tu Mongo es standalone, las compras SIEMPRE
corren en el modo que funciona.

### 🔧 Corrección manual de boletos (lo que pediste)
Cuando la tómbola está en 0, el panel del sorteo ahora tiene:
- **"🔧 Agregar boletos a mano"**: elige un usuario y escribe los números
  (ej: "1 2 3") → los boletos se crean directo, sin cobro. Para arreglar
  compras que no se registraron o para armar pruebas al instante.
- **"Recontar"**: recalcula el contador de vendidos contando los boletos
  reales, por si quedó desincronizado.
- Endpoints: POST /tickets/admin-add, POST /tickets/admin-recount.

### 🔎 Diagnóstico de base de datos
`node scripts/diagnose.js` (desde server/) imprime el estado real:
topología de Mongo, usuarios y saldos, boletos por rifa y estado, tipo de
raffleId, transacciones pendientes. Pégalo si algo sigue raro.

Verificación: tsc + boot smoke 45 módulos / 139 rutas + 10 tests + build.

---

## 🔧 v2.3.1 — La tómbola ahora SÍ lee los boletos (fix de tipos definitivo)

**El diagnóstico reveló la verdad:** los boletos SÍ se guardaban (7 activos,
tipo ObjectId correcto, transacciones completed). El problema era de
LECTURA: algunas consultas del panel podían devolver 0 por un desajuste
de tipo del raffleId entre lo guardado y lo consultado.

**Fix aplicado a TODAS las consultas por raffleId:**
- `getRoomState` (panel del sorteo: activeCount, draws, participantes)
- `drawNext` (el conteo y el $sample que elige ganador)
- `findByRaffle` (lista de participantes del detalle público)

Cada una ahora matchea el raffleId como ObjectId O string
(`$in: [ObjectId, string]`), así ninguna devuelve 0 por tipos aunque haya
datos de versiones distintas.

Verificación: tsc + boot smoke 45 módulos / 139 rutas + 10 tests + build.

---

## ✅ v2.4.0 — Gestión de entregas de tienda + correo interno

### Detalle y gestión de canjes
- Cada canje de la tienda tiene un **modal de gestión** ("Gestionar
  entrega") que muestra: producto, usuario, precio, y los datos de
  entrega. El admin marca entregado desde ahí.
- **Físico vs virtual**: el producto ahora tiene tipo de entrega. El
  físico pide dirección; el virtual pide correo/contacto. El formulario
  de canje del usuario se adapta solo.
- **Pestañas Pendientes / Entregados** en el panel de tienda, con el
  historial de entregas completadas.

### Datos de entrega del usuario
- Al canjear, el usuario completa un formulario según el tipo: dirección
  y referencia (físico) o correo y teléfono (virtual). Se guardan en el
  canje para que el admin gestione el envío.

### Evidencia de entrega (legal)
- El admin sube capturas/fotos de la entrega a cada canje. Visible para
  admin y para el usuario que compró. Respaldo anti-fraude.
- Endpoint: POST /store/redemptions/:id/evidence.

### Correo interno + entrega de códigos virtuales
- **Nuevo módulo Inbox**: buzón de correo interno del usuario, montado en
  Mi Misio. Los códigos llegan resaltados y copiables.
- Al entregar un producto virtual, el código se envía por **tres
  canales**: correo interno (registrado), correo externo (si tiene email)
  y notificación push. El admin también puede copiar o mandar por
  WhatsApp desde el modal.
- Endpoints: GET /inbox, GET /inbox/unread, PATCH /inbox/:id/read,
  PATCH /inbox/read-all.

Verificación: tsc + boot smoke 47 módulos / 146 rutas + build + auditoría en 0.

---

## ✅ v2.5.0 — Experiencia de sorteo en vivo (7 mejoras)

### #1 Botón Finalizar sorteo
Ahora aparece cuando `raffle.winner` existe, no solo cuando el cierre
financiero (Cero Pérdida) tiene éxito. Antes, si `closeRaffle` fallaba,
el botón no aparecía.

### #2 Ruleta sin auto-reset
La ruleta se queda apuntando al resultado hasta que el admin cierra el
modal con "Preparar siguiente tirada". El modal no se puede cerrar con
clic fuera ni con X — el admin decide cuándo avanzar.

### #3 Animación de victoria (usuario)
Cuando sale el ganador, todos los usuarios conectados a esa rifa ven un
modal con trofeo animado, nombre del ganador, boleto y monto devuelto.

### #4 Ganador vacío → siempre se emite
`raffle_completed` ahora se emite SIEMPRE que hay winner, con o sin
cierre financiero exitoso. El panel siempre muestra quién ganó.

### #5 Redirigir al sorteo en vivo / sacar al terminar
Cuando el admin pone la rifa "live", los usuarios en esa página reciben
`raffle_status` y se les avisa. Al completarse, también.
Implementado vía EventEmitter2 (desacoplado, sin dependencia circular).

### #6 Tickets comprados no visibles desde otro usuario
El endpoint `/raffles/:id/sold` tenía el mismo bug de tipos de raffleId
(ObjectId vs string). Ahora usa match robusto `$in: [ObjectId, string]`.

### #7 Barra de progreso vacía
Dependía de `/sold` que devolvía vacío por el mismo bug. Corregido con #6.

Verificación: tsc + boot 48 módulos / 146 rutas + 10 tests + build.
