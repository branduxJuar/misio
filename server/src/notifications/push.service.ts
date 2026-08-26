import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as webpush from 'web-push';
import { User, UserDocument } from '../users/user.schema';

/**
 * 🔔 WEB PUSH — avisos que llegan al celular como una app nativa.
 *
 * Requiere claves VAPID en el .env (se generan UNA vez con
 * `npx web-push generate-vapid-keys`):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:tu@correo.pe
 *
 * Sin esas claves, el push queda desactivado silenciosamente — el resto
 * del sistema funciona igual.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@misio.pe', pub, priv);
      this.enabled = true;
      this.logger.log('🔔 Web Push activado (VAPID configurado)');
    } else {
      this.logger.warn('🔔 Web Push desactivado — falta VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
    }
  }

  getPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY || '', enabled: this.enabled };
  }

  async subscribe(userId: string, subscription: any) {
    await this.userModel.updateOne({ _id: userId }, { $addToSet: { pushSubscriptions: subscription } });
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.userModel.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint } } });
    return { ok: true };
  }

  /** Envía push a todos los dispositivos de un usuario; limpia los muertos. */
  async sendToUser(userId: string, title: string, body: string, url = '/') {
    if (!this.enabled) return;
    const user = await this.userModel.findById(userId).select('pushSubscriptions').lean();
    const subs = (user as any)?.pushSubscriptions ?? [];
    if (!subs.length) return;
    const payload = JSON.stringify({ title, body, url, icon: '/pwa-192.png' });
    await Promise.all(subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await this.userModel.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } });
        }
      }
    }));
  }
}
