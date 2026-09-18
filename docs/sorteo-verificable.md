# Sorteo verificable v1

## Alcance

- Las rifas existentes siguen en `legacy`. Solo rifas nuevas configuradas como `verifiable_v1` usan este mecanismo.
- En un paquete hay una bolsa comun. Cada boleto aparece como maximo una vez en todo el paquete. Por premio se consumen `winningAttempt - 1` boletos al agua y luego un ganador; el premio siguiente continua con los boletos restantes.
- Los premios se sortean en el orden guardado al preparar. No se permite cambiarlo, elegir un numero manualmente ni reiniciar tiradas verificables.
- No se inicia si los boletos vendidos no alcanzan para todas las tiradas previstas. Los boletos no vendidos nunca entran en la bolsa.

## Preparacion y prueba

1. El administrador cierra ventas pasando la rifa a `live` y pulsa **Preparar sorteo**.
2. Se guarda una lista ordenada de numeros vendidos activos, premios y reglas. Se selecciona una ronda futura de drand quicknet, al menos dos minutos despues de preparar. `commitment` es SHA-256 del JSON canonico `{version,raffleId,tickets,prizes,beaconChain,beaconRound}`.
3. La lista, la huella y el numero de ronda se publican en `GET /api/v1/live/:id/proof` antes de disponer de la firma de esa ronda. Conviene conservar una copia externa de esta respuesta antes de la ronda; una base de datos controlada por el operador **no prueba por si sola** la hora de publicacion.
4. El cliente oficial de drand verifica la firma de la ronda fija. La clave de la secuencia es SHA-256 de `verifiable_v1:<commitment>:<signature>`; Fisher-Yates usa HMAC-SHA256 y rechazo de valores para no sesgar los indices.
5. Cada pulsacion revela el siguiente boleto de la unica secuencia. Boleto, resultado, ganador y cursor se guardan en una transaccion de MongoDB. Si falla una escritura, no avanza la tirada.
6. `GET /api/v1/live/:id/verify` comprueba el acta. Tambien se puede verificar fuera del servidor: compilar con `npm run build` y ejecutar `node scripts/verify-draw.js URL_DEL_ACTA` desde `server/`.

## Operacion y limites

- Requiere Atlas ReplicaSet para transacciones y Redis compartido para coordinar replicas de Railway.
- Si drand no responde o la ronda todavia no existe, la tirada se detiene sin elegir un reemplazo. No se cambia de ronda tras publicar el compromiso.
- La ronda publica permite anticipar toda la secuencia desde que aparece su firma. El presentador controla el ritmo, no el resultado; cancelar el sorteo requiere una justificacion auditable.
- La API de verificacion reproduce la prueba, pero una verificacion realmente independiente debe guardar la huella publicada antes de la ronda y comparar luego el acta con ella. La pagina no sustituye un acta externa, auditoria independiente ni asesoramiento legal.
- La modalidad presencial queda separada y no se presenta como verificable por esta secuencia.
