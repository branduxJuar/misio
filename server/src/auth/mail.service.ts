import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

/**
 * CORREOS TRANSACCIONALES DE MISIO.
 *
 * Configuración en .env:
 *   RESEND_API_KEY=re_xxxxxxx         (Recomendado: API de Resend para evitar bloqueos)
 *   SMTP_HOST=smtp.gmail.com          (Fallback SMTP si no hay Resend)
 *   SMTP_PORT=587
 *   SMTP_USER=adminmisio@gmail.com
 *   SMTP_PASS=xxxx
 *   SMTP_FROM="Misio <adminmisio@gmail.com>"
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private resend: Resend | null = null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get('SMTP_FROM', '"Misio" <no-reply@misio.pe>');
    
    // 1. Intentar usar Resend API (vía HTTPS)
    const resendKey = this.config.get<string>('RESEND_API_KEY');
    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.logger.log('📧 Configurado para usar Resend (API Web)');
      return;
    }

    // 2. Fallback a Nodemailer (SMTP Puro)
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      const port = Number(this.config.get('SMTP_PORT', 587));
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 8000,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
      this.transporter.verify()
        .then(() => this.logger.log(`📧 SMTP conectado (${host}:${port})`))
        .catch((e) => this.logger.error(`📧 SMTP falló: ${e.message}`));
    } else {
      this.logger.warn('📧 SMTP no configurado — los correos se imprimen en consola');
    }
  }

  // ═══ Templates HTML (inline, sin dependencias) ═══

  private wrap(body: string) {
    return `
      <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#f8f9fa;border-radius:16px">
        <div style="text-align:center;margin-bottom:20px">
          <span style="font-size:24px;font-weight:800;color:#0d9488">⚡ Misio</span>
        </div>
        ${body}
        <p style="color:#999;font-size:11px;text-align:center;margin-top:24px">
          Este correo fue enviado por Misio. Si no lo esperabas, ignóralo.
        </p>
      </div>`;
  }

  private async send(to: string, subject: string, html: string) {
    // Si no hay ninguno configurado, solo lo loguea (DEV)
    if (!this.transporter && !this.resend) {
      this.logger.warn(`📧 [DEV] ${subject} → ${to}`);
      return { dev: true };
    }

    try {
      if (this.resend) {
        // Enviar vía Resend API
        const { data, error } = await this.resend.emails.send({
          from: this.from,
          to: [to],
          subject,
          html,
        });
        if (error) throw new Error(error.message);
        return { dev: false, id: data?.id };
      } else if (this.transporter) {
        // Enviar vía SMTP Nodemailer
        await Promise.race([
          this.transporter.sendMail({ from: this.from, to, subject, html }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP Connection Timeout')), 7000))
        ]);
        return { dev: false };
      }
    } catch (e) {
      this.logger.error(`Error enviando correo a ${to}: ${e.message}`);
      throw new InternalServerErrorException(`Fallo al enviar correo: ${e.message}`);
    }
  }

  // ═══ Correos del sistema ═══

  /** Correo genérico (entrega de códigos, avisos personalizados). */
  async sendGenericMail(to: string, subject: string, bodyHtml: string) {
    return this.send(to, subject, this.wrap(bodyHtml));
  }

  /** Código de verificación (registro / login con 2FA de email). */
  async sendVerificationCode(email: string, name: string, code: string) {
    return this.send(email, `${code} es tu código de verificación — Misio`,
      this.wrap(`
        <p>Hola <b>${name}</b>, tu código de verificación es:</p>
        <p style="font-size:36px;font-weight:800;letter-spacing:10px;text-align:center;
           color:#0d9488;background:#fff;padding:16px;border-radius:12px">${code}</p>
        <p style="color:#666">Vence en 15 minutos.</p>
      `));
  }

  /** 🎉 ¡Ganaste! — se manda al cerrar la rifa (closeRaffle). */
  async sendWinnerNotification(email: string, name: string, prize: string, raffleTitle: string) {
    return this.send(email, `🎉 ¡Ganaste "${prize}"! — Misio`,
      this.wrap(`
        <h2 style="color:#e8b84a;text-align:center">🏆 ¡Felicidades, ${name}!</h2>
        <p style="text-align:center;font-size:16px">
          Ganaste <b>${prize}</b> en el sorteo <i>"${raffleTitle}"</i>.
        </p>
        <p style="text-align:center">
          Entra a <b>Mi Misio → Mis premios</b> para seguir el estado de tu envío.
        </p>
        <div style="text-align:center;margin-top:16px">
          <a href="${process.env.CLIENT_URL ?? 'https://misio.pe'}/mi-cuenta"
             style="display:inline-block;padding:12px 28px;background:#0d9488;color:#fff;
                    border-radius:10px;text-decoration:none;font-weight:700">
            Ver mi premio →
          </a>
        </div>
      `));
  }

  /** 💵 Pago confirmado — se manda al confirmar el depósito. */
  async sendPaymentConfirmed(email: string, name: string, amount: number) {
    return this.send(email, `✅ Tu recarga de S/ ${amount.toFixed(2)} fue confirmada — Misio`,
      this.wrap(`
        <p>Hola <b>${name}</b>,</p>
        <p>Tu recarga de <b style="color:#22c55e">S/ ${amount.toFixed(2)}</b> fue
           verificada y el saldo ya está en tu cuenta.</p>
        <p style="color:#666">Ahora puedes comprar boletos en los sorteos activos.</p>
      `));
  }

  /** ⛔ Cuenta suspendida por spam en recuperación de clave. */
  async sendAccountBannedForSpam(email: string, name: string) {
    return this.send(email, '⛔ Tu cuenta ha sido bloqueada por seguridad — Misio',
      this.wrap(`
        <p>Hola <b>${name}</b>,</p>
        <p>Hemos detectado múltiples intentos fallidos de recuperación de contraseña en tu cuenta y, por tu seguridad, la hemos bloqueado preventivamente.</p>
        <p>Para recuperar el acceso a tu cuenta, por favor comunícate con soporte técnico.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://wa.me/51999999999" target="_blank"
             style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">
            Contactar a Soporte
          </a>
        </div>
      `));
  }

  /** 🔑 Recuperación de contraseña. */
  async sendPasswordReset(email: string, name: string, token: string) {
    const link = `${process.env.CLIENT_URL ?? 'https://misio.pe'}/reset-password?token=${token}`;
    return this.send(email, '🔑 Recupera tu contraseña — Misio',
      this.wrap(`
        <p>Hola <b>${name}</b>,</p>
        <p>Pediste recuperar tu contraseña. Haz clic en el botón (vence en 1 hora):</p>
        <div style="text-align:center;margin:18px 0">
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#0d9488;
             color:#fff;border-radius:10px;text-decoration:none;font-weight:700">
            Cambiar mi contraseña →
          </a>
        </div>
        <p style="color:#666;font-size:12px">Si no lo pediste, ignora este correo — tu clave sigue igual.</p>
      `));
  }

  /** 🚚 Premio despachado — se manda al cambiar estado a transit. */
  async sendPrizeShipped(email: string, name: string, prize: string, courier: string, tracking: string) {
    return this.send(email, `🚚 Tu premio "${prize}" fue despachado — Misio`,
      this.wrap(`
        <p>Hola <b>${name}</b>,</p>
        <p>Tu premio <b>${prize}</b> va en camino con <b>${courier}</b>.</p>
        <p>Número de guía: <b style="font-size:18px;letter-spacing:1px">${tracking}</b></p>
        <p style="color:#666">Puedes rastrear tu envío en la web de ${courier} con ese número,
           o seguirlo en Mi Misio → Mis premios.</p>
      `));
  }

  /** 🎟️ Compra Física Exitosa — se manda al realizar venta offline (POS) */
  async sendOfflineSaleTickets(email: string, name: string, raffleTitle: string, raffleDate: Date, tickets: string[]) {
    // Generar representación HTML de los boletos
    const ticketsHtml = tickets.map(ticketCode => `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;display:flex;margin-bottom:12px;overflow:hidden;max-width:320px;margin-left:auto;margin-right:auto;">
        <div style="flex:1;padding:16px;">
          <div style="color:#047857;font-weight:900;font-size:16px;">
            <span style="color:#f59e0b">⚡</span> Misio
          </div>
          <div style="font-size:14px;font-weight:800;color:#0f172a;margin-top:8px;">${raffleTitle}</div>
          <div style="font-size:10px;color:#475569;margin-top:2px;">👤 ${name}</div>
          <div style="font-size:12px;font-weight:700;color:#047857;background:#ecfdf5;padding:2px 8px;border-radius:12px;display:inline-block;margin-top:12px;">
            Comprado
          </div>
        </div>
        <div style="width:100px;background:#047857;color:#ffffff;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:10px;">
          <div style="font-size:10px;font-weight:600;">Nº BOLETO</div>
          <div style="font-size:14px;font-weight:900;margin-top:8px;">${ticketCode}</div>
        </div>
      </div>
    `).join('');

    const loginUrl = `${process.env.CLIENT_URL ?? 'https://misio.pe'}/login`;
    const drawDateFormatted = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(raffleDate));

    return this.send(email, `🎟️ Tus boletos para "${raffleTitle}" — Misio`,
      this.wrap(`
        <h2 style="color:#047857;text-align:center">¡Felicidades por tu compra, ${name}! 🎉</h2>
        <p style="text-align:center;font-size:15px;color:#334155;">
          Has adquirido boletos para el sorteo <b>"${raffleTitle}"</b> que se realizará el <b>${drawDateFormatted}</b>.
        </p>
        <div style="margin:24px 0;">
          ${ticketsHtml}
        </div>
        <p style="text-align:center;font-size:15px;color:#334155;">
          ¡Mucha suerte! 🍀
        </p>
        <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="text-align:center;font-size:14px;color:#475569;">
          <b>¿Aún no tienes cuenta en Misio?</b><br />
          Tus boletos ya están seguros, pero si quieres verlos en cualquier momento y participar más fácilmente:
        </p>
        <div style="text-align:center;margin-top:16px">
          <a href="${loginUrl}"
             style="display:inline-block;padding:12px 28px;background:#0f172a;color:#fff;
                    border-radius:10px;text-decoration:none;font-weight:700">
            Crea tu usuario o Inicia Sesión →
          </a>
        </div>
        <p style="text-align:center;font-size:12px;color:#64748b;margin-top:8px;">
          Usa el mismo correo o número de celular con el que te registraron.
        </p>
      `));
  }
}
