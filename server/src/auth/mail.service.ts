import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * CORREOS TRANSACCIONALES DE MISIO.
 *
 * Configuración en .env:
 *   SMTP_HOST=smtp.resend.com      (o smtp.gmail.com, ses-smtp...)
 *   SMTP_PORT=465                  (465=SSL, 587=TLS)
 *   SMTP_USER=resend               (o tu correo)
 *   SMTP_PASS=re_xxxxxxx           (API key o contraseña de app)
 *   SMTP_FROM="Misio <no-reply@misio.pe>"
 *
 * PROVEEDORES RECOMENDADOS (julio 2026):
 *   - Resend: 100 emails/día gratis, API sencilla, dominio verificado.
 *   - Amazon SES: ~$0.10 por 1.000 correos, escala sin límite.
 *   - Gmail: gratis con "contraseña de app", pero límite de 500/día.
 *
 * SIN SMTP (desarrollo): imprime en consola — el flujo funciona igual,
 * solo que nadie recibe el correo.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get('SMTP_FROM', '"Misio" <no-reply@misio.pe>');
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      const port = Number(this.config.get('SMTP_PORT', 587));
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
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
    if (!this.transporter) {
      this.logger.warn(`📧 [DEV] ${subject} → ${to}`);
      return { dev: true };
    }
    await this.transporter.sendMail({ from: this.from, to, subject, html });
    return { dev: false };
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
}
