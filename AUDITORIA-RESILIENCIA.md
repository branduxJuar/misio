# Auditoria y refuerzo de resiliencia

Fecha: 2026-09-14. Cambios locales; no se desplego ni se modifico Atlas.

## Cambios implementados

| Punto | Cambio | Limite de verificacion |
| --- | --- | --- |
| 1. Tienda | Stock, saldo, ledger, orden y respuesta idempotente en una transaccion. Un aviso fallido no invalida la compra. | Frontera transaccional probada con dobles; falta ejecutar rollback real. |
| 2. Reembolsos | Marca refundsProcessed y abonos en la misma transaccion. Cancelacion y cierre comparten lock. Cancelacion consulta boletos dentro de la transaccion. | Falta prueba real; las tareas posteriores no quedaron transaccionales. |
| 3. Cupones | El carrito envia ticketPromoCode; Yape lo conserva hasta comprar. El modal no repite el campo de promociones de boletos. | Orquestacion cubierta por prueba unitaria; falta compra integral con cupon. |
| 4. Recuperacion de pagos | La confirmacion persiste fulfillment.pending. La compra marca ok en su propia transaccion. Un recuperador revisa pendientes cada 30 segundos sin volver a abonar. | Pruebas unitarias de reanudacion, duplicados y errores transitorios. |
| 5. Redis | Recuperacion tras fallo inicial; sin fallback local cuando Redis configurado esta caido. Socket.IO falla al arrancar si no conecta. Se eliminan credenciales de sus logs. | Pruebas con dobles; falta desconectar Redis real con dos replicas. |
| 6. Bingo | Cantar y reiniciar usan un lock por sala. Reinicio transaccional; versionado optimista de sala; limites para ingreso y reinicio. | Falta prueba real multiusuario. |
| 7. Disponibilidad | /api/v1/health/ready devuelve 503 si Mongo figura desconectado o Redis configurado no responde. Cliente Redis reutilizable. | Dos pruebas unitarias. No mide capacidad ni latencia de consultas reales. |
| 8. Consultas | Pendientes se agrupan por numero; consulta de vendidos limitada a numeros solicitados. Presencia usa SCAN y pipeline, no KEYS. | Falta paginacion de pendientes y medicion de carga. |
| 9. Correos | Web/POS registran ticket_email_outbox dentro de la compra. BullMQ reintenta con identificador estable; sin Redis, entrega con lease en Mongo. | Fallo de proveedor probado con doble; falta SMTP/Resend y Redis reales. |
| 10. Contenido | Portada usa textos guardados; registro consulta terminos editables; bases se actualizan al abrir/foco, con reintento. Se evita guardar legales vacios si fallo su carga. | Build frontend correcto; falta recorrido visual/manual completo. |

## Pruebas

- Build backend correcto.
- Build frontend correcto durante la implementacion; repetir tras cualquier cambio adicional.
- 21 pruebas unitarias correctas.
- 7 pruebas transaccionales preparadas en `server/test/resilience.spec.ts`, no ejecutadas satisfactoriamente: el sandbox impidio iniciar mongod y la autorizacion fue rechazada.
- No se ejecuto carga contra produccion, no se enviaron correos reales y no se probaron dos replicas con Redis real.

Desde `server`, las pruebas normales no requieren MongoDB:

```powershell
node node_modules/jest/bin/jest.js --runInBand
```

Las pruebas de integracion requieren permiso para iniciar un MongoDB temporal. No utilizan MONGO_URI ni Atlas. En Windows pueden reutilizar el binario ya presente en la cache; otras plataformas pueden requerir descarga:

```powershell
$env:RUN_MONGO_INTEGRATION = '1'
node node_modules/jest/bin/jest.js --runInBand test/resilience.spec.ts
Remove-Item Env:RUN_MONGO_INTEGRATION
```

## Pendientes prioritarios

1. **B2B:** revisar antes de habilitar liquidaciones. TicketsService.purchase acredita partner.walletBalance por venta y RaffleClosingService vuelve a acreditarlo al cerrar. Definir un unico momento de liquidacion, contemplar POS/cancelaciones y conciliar historicos sin descontar saldos automaticamente.
2. **Cierre posterior al reembolso:** ERP, liquidacion y avisos al ganador todavia necesitan estados recuperables independientes. No borrar refundsProcessed para reintentar estas tareas: duplicaria abonos ya realizados.
3. **Carga real:** staging con dos replicas, Mongo replica set, Redis y cuentas de prueba. Medir p95/p99, errores, memoria, event-loop, conexiones de Mongo y retraso de colas. Aumentar concurrencia gradualmente; verificar que un mismo boleto o ultimo producto se venda una vez.
4. **Fallas inducidas:** cortar Redis, reiniciar el backend tras confirmar un deposito y cortar el proveedor de correo. Comprobar recuperacion y reconciliar ledger/saldos/boletos/stock.
5. **Pendientes de pago:** paginar servidor y pantalla; limitar detalle de conflictos masivos. El resultado puede seguir siendo grande aunque se haya eliminado el recorrido innecesario de todos los pares.
6. **Archivos:** los uploads del volumen local no se convierten en almacenamiento compartido al agregar replicas. Resolver almacenamiento comun antes de escalar procesos que sirvan archivos.
7. **Secretos:** rotar credenciales expuestas anteriormente en el chat y actualizar sus servicios dependientes. No incluir los nuevos valores en informes ni repositorio.
8. **Sockets publicos:** auditar eventos de grilla enviados por el cliente y contrastarlos con Mongo antes de anunciar ventas o reservas; no confiar en numeros declarados por el navegador.

## Despliegue y operacion

- Validar primero en staging. No mezclar versiones antiguas y nuevas procesando compras mientras se despliega este cambio.
- Requiere replica set para tienda, reembolsos y reinicio de Bingo. Compras y confirmaciones en produccion rechazan el modo standalone donde se agrego la comprobacion.
- Mantener REDIS_URL del backend y ambas origins de cliente. No hace falta una variable nueva para fulfillment o el outbox.
- Configurar la sonda de disponibilidad del despliegue con `/api/v1/health/ready`; revisar la configuracion real del proveedor, no asumir que leer la ruta modifica el balanceo.
- El usuario de Mongo debe poder crear la coleccion e indices del outbox. Revisar indices efectivos de tickets, idempotencia y transactions.fulfillment.status en staging/Atlas.
- Los pagos nuevos guardan fulfillment. No se intenta comprar automaticamente otra vez sobre todos los depositos historicos: algunos ya entregaron boletos aunque no tengan ese campo.
- Outbox: pending = recuperable; sent = proveedor acepto el envio; failed = agotados los reintentos. Esto no garantiza llegada a bandeja principal. Revisar failed con alertas operativas.
- Los correos son entrega al menos una vez: si el proveedor acepta el mensaje y el proceso cae antes de registrar sent, puede llegar un duplicado. No se vuelve a cobrar por ello.
- Los correos enviados expiran del outbox despues de 30 dias; los fallidos se conservan para revision.
- Antes de volver a una version anterior, pausar compras y revisar pagos/outbox pendientes. No restaurar una copia vieja de la base para revertir codigo.

Este trabajo reduce riesgos concretos. No certifica todo el sistema ni garantiza una cantidad determinada de usuarios concurrentes.
