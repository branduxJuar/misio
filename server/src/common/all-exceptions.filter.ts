import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';

/**
 * FILTRO GLOBAL DE ERRORES.
 *
 * Sin esto, un error inesperado viaja al cliente con su stack trace: le
 * regala al atacante los nombres de archivos, las rutas del servidor y la
 * versión de las librerías. Y al usuario le muestra un muro de inglés.
 *
 * Aquí toda excepción sale con la MISMA forma y en español:
 *   { statusCode, message, timestamp, path }
 * Los errores esperados (400/401/403/404) conservan su mensaje — están
 * escritos para el usuario. Los inesperados (500) se registran completos
 * en el log del servidor y al cliente solo le llega un mensaje genérico:
 * el detalle es para nosotros, no para quien esté probando la puerta.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Ocurrió un error inesperado. Inténtalo de nuevo.';
    let isMaintenance = false;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message ?? exception.message);
      if (typeof body === 'object' && body !== null && (body as any).maintenance) {
        isMaintenance = true;
      }
    } else if (exception instanceof MongooseError.ValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = Object.values(exception.errors).map((e) => e.message);
    } else if (exception instanceof MongooseError.CastError) {
      // Un id con formato inválido es culpa del cliente, no del servidor
      status = HttpStatus.BAD_REQUEST;
      message = 'Identificador inválido';
    } else if ((exception as MongoServerError)?.code === 11000) {
      status = HttpStatus.CONFLICT;
      message = 'Ese registro ya existe';
    }

    // Los 5xx son problema NUESTRO: al log con todo el detalle (excepto Mantenimiento esperado)
    if (status >= 500 && !isMaintenance) {
      this.logger.error(
        `${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
