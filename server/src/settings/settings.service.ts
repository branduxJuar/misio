import { DEFAULT_TERMS, DEFAULT_PRIVACY, DEFAULT_HOW_IT_WORKS, DEFAULT_AUTOCONTROL, DEFAULT_RAFFLE_RULES } from './legal-defaults';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DEFAULT_WELCOME_BONUS, EMAIL_VERIFICATION_KEY, Setting, SettingDocument,
  WelcomeBonusConfig, WELCOME_BONUS_KEY, REFUND_PERCENTAGE_KEY
} from './setting.schema';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';
import { TicketsService } from '../tickets/tickets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.schema';
import { TransactionStatus, TransactionType } from '../transactions/transaction.schema';

/** Contenido por defecto: lo que se ve si el admin aún no editó nada. */
export const SITE_KEY = 'site';
export const DEFAULT_SITE = {
  brandName: 'Misio',
  tagline: 'Sorteos donde nunca pierdes',
  logoUrl: '',
  primaryColor: '#0d9488',
  whatsapp: '',
  landing: {
    heroTitle: 'Juega por el premio.',
    heroHighlight: 'Nunca pierdas tu plata.',
    heroSubtitle:
      'Si tu boleto no gana, el valor completo vuelve a ti como saldo de canje para nuestra tienda. Se llama Cero Pérdida y es nuestra única regla.',
    ctaText: 'Crear mi cuenta gratis',
    chips: [
      '✅ Reembolso garantizado',
      '🔴 Sorteos en vivo',
      '📕 Libro de Reclamaciones',
      '🚚 Envío a todo el país',
    ],
    businessTitle: 'Sorteos Transparentes',
    businessText:
      'Nacimos con una idea simple: los sorteos tradicionales tienen un problema — cuando no ganas, tu dinero desaparece. Nosotros lo cambiamos con el modelo Cero Pérdida: si tu boleto no gana, su valor completo vuelve a ti como saldo de canje para nuestra tienda.',
    closingTitle: 'Tú también puedes ser un ganador',
  },
  about: {
    title: 'Sobre Misio',
    intro:
      'Nacimos con una idea simple: los sorteos tradicionales tienen un problema — cuando no ganas, tu dinero desaparece. Nosotros lo cambiamos con el modelo Cero Pérdida: si tu boleto no gana, su valor completo vuelve a ti como saldo de canje para nuestra tienda.',
    location: 'Perú',
  },
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    private readonly usersService: UsersService,
    private readonly txService: TransactionsService,
    private readonly ticketsService: TicketsService,
    private readonly notifService: NotificationsService,
  ) {}

  /**
   * CACHÉ DE CONFIGURACIÓN (TTL corto).
   *
   * Estas claves las lee CADA petición: el flag de verificación de correo
   * en cada login, el de subastas en cada listado, y la marca del sitio en
   * cada visita a la portada. Son datos que cambian una vez al mes, pero
   * generaban una consulta por request: con 1.000 visitas por minuto son
   * 1.000 viajes a Mongo para leer lo mismo.
   *
   * 30 segundos de TTL: el admin guarda un cambio y lo ve al instante
   * (set() invalida la clave), pero el tráfico normal no toca la base.
   * Es memoria del proceso: si mañana hay varias instancias, cada una
   * tiene la suya y todas convergen en 30 s — suficiente para config.
   */
  private cache = new Map<string, { value: unknown; expires: number }>();
  private static readonly TTL_MS = 30_000;

  private cacheGet<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  private cacheSet(key: string, value: unknown) {
    this.cache.set(key, { value, expires: Date.now() + SettingsService.TTL_MS });
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    const cached = this.cacheGet<T>(key);
    if (cached !== undefined) return cached;

    const doc = await this.settingModel.findOne({ key }).lean();
    const value = (doc?.value as T) ?? fallback;
    this.cacheSet(key, value);
    return value;
  }

  async set(key: string, value: any) {
    this.cache.delete(key); // El cambio del admin se ve al instante
    return this.settingModel.findOneAndUpdate(
      { key },
      { value },
      { upsert: true, new: true },
    );
  }

  /** Contenido del sitio (marca + landing + nosotros), con defaults. */
  async getSite() {
    const saved = await this.get<any>(SITE_KEY, {});
    return {
      ...DEFAULT_SITE,
      ...(saved ?? {}),
      landing: { ...DEFAULT_SITE.landing, ...(saved?.landing ?? {}) },
      about: { ...DEFAULT_SITE.about, ...(saved?.about ?? {}) },
    };
  }

  /** Guarda parcialmente: manda solo lo que cambió. */
  async setSite(patch: any) {
    const current = await this.getSite();
    const next = {
      ...current,
      ...patch,
      landing: { ...current.landing, ...(patch?.landing ?? {}) },
      about: { ...current.about, ...(patch?.about ?? {}) },
    };
    await this.set(SITE_KEY, next);
    return next;
  }

  /** ¿Se exige verificar el correo con código al registrarse? (toggle admin). */
  // ═══ MODO MANTENIMIENTO ═══
  // Un flag que el admin activa desde el panel: el middleware intercepta
  // TODAS las requests de la API (excepto /health y /auth) y devuelve
  // 503 con el mensaje configurado. El sitio público muestra un banner.
  async getMaintenanceMode(): Promise<{ enabled: boolean; message: string; resumeAt?: string | null }> {
    return this.get('maintenance', { enabled: false, message: 'Estamos mejorando la plataforma. Volvemos pronto.' });
  }

  // ═══ PÁGINAS LEGALES Y DE CONTENIDO ═══
  // Editables desde Admin → Contenido. Los textos por defecto son un
  // punto de partida para Perú — revisar con un abogado antes de operar.
  async getLegalPages() {
    const pages = await this.get('legalPages', {
      terms: DEFAULT_TERMS,
      privacy: DEFAULT_PRIVACY,
      howItWorks: DEFAULT_HOW_IT_WORKS,
      autocontrol: DEFAULT_AUTOCONTROL,
      raffleRules: DEFAULT_RAFFLE_RULES,
      updatedAt: null,
    });
    if (!pages.autocontrol) pages.autocontrol = DEFAULT_AUTOCONTROL;
    if (!pages.raffleRules) pages.raffleRules = DEFAULT_RAFFLE_RULES;
    return pages;
  }
  async setLegalPages(pages: { terms?: string; privacy?: string; howItWorks?: string; autocontrol?: string; raffleRules?: string }) {
    const current = await this.getLegalPages();
    return this.set('legalPages', {
      terms: pages.terms ?? current.terms,
      privacy: pages.privacy ?? current.privacy,
      howItWorks: pages.howItWorks ?? current.howItWorks,
      autocontrol: pages.autocontrol ?? current.autocontrol,
      raffleRules: pages.raffleRules ?? current.raffleRules,
      updatedAt: new Date().toISOString(),
    });
  }

  // ═══ ANUNCIOS EMERGENTES ═══
  async getAnnouncements(): Promise<Array<{
    id: string; title: string; body: string;
    type: 'info' | 'warning' | 'promo';
    imageUrl?: string;
    active: boolean; createdAt: string;
  }>> {
    return this.get('announcements', []);
  }
  async setAnnouncements(announcements: any[]) {
    return this.set('announcements', announcements);
  }

  async markAnnouncementAsRead(userId: string, announcementId: string) {
    return this.usersService.markAnnouncementAsRead(userId, announcementId);
  }

  async getAnnouncementStats() {
    const announcements = await this.getAnnouncements();
    return this.usersService.getAnnouncementStats(announcements);
  }

  // ═══ COUNTDOWN de mantenimiento ═══
  async setMaintenanceMode(enabled: boolean, message?: string, resumeAt?: string) {
    const current = await this.getMaintenanceMode();
    return this.set('maintenance', {
      enabled,
      message: message ?? current.message,
      resumeAt: resumeAt ?? current.resumeAt ?? null,
    });
  }

  async isEmailVerificationEnabled(): Promise<boolean> {
    const cfg = await this.get<{ enabled: boolean }>(EMAIL_VERIFICATION_KEY, { enabled: false });
    return !!cfg?.enabled;
  }

  setEmailVerification(enabled: boolean) {
    return this.set(EMAIL_VERIFICATION_KEY, { enabled: !!enabled });
  }

  getWelcomeBonus() {
    return this.get<WelcomeBonusConfig>(WELCOME_BONUS_KEY, DEFAULT_WELCOME_BONUS);
  }

  setWelcomeBonus(config: WelcomeBonusConfig) {
    return this.set(WELCOME_BONUS_KEY, config);
  }

  /**
   * BONO DE BIENVENIDA — se aplica al registrarse (llamado por AuthService).
   * - credit: acredita S/ X a la billetera (ledger: welcome_bonus).
   * - ticket: regala el boleto libre más bajo de la rifa configurada.
   * Nunca rompe el registro: si el bono falla (rifa agotada, etc.), el
   * usuario se crea igual y solo queda el log.
   */
  async applyWelcomeBonus(userId: string): Promise<{ type: string; detail: string } | null> {
    try {
      const cfg = await this.getWelcomeBonus();
      if (!cfg?.enabled) return null;

      if (cfg.type === 'credit' && cfg.creditAmount > 0) {
        await this.txService.create({
          userId,
          amount: cfg.creditAmount,
          type: TransactionType.WELCOME_BONUS,
          status: TransactionStatus.COMPLETED,
        });
        await this.notifService.notifyUser(
          userId,
          `🎁 ¡Bienvenido a Misio! Te regalamos S/ ${cfg.creditAmount.toFixed(2)} de saldo para tu primera rifa.`,
          NotificationType.GENERAL,
        );
        return { type: 'credit', detail: `S/ ${cfg.creditAmount.toFixed(2)} de saldo de regalo` };
      }

      if (cfg.type === 'ticket' && cfg.raffleId) {
        const ticket = await this.ticketsService.grantFreeTicket(userId, cfg.raffleId);
        await this.notifService.notifyUser(
          userId,
          `🎁 ¡Bienvenido! Te regalamos el boleto ${ticket.code} — ya estás participando en el sorteo de bienvenida.`,
          NotificationType.GENERAL,
        );
        return { type: 'ticket', detail: `Boleto de regalo: ${ticket.code}` };
      }
      return null;
    } catch (err: any) {
      this.logger.warn(`Bono de bienvenida no aplicado a ${userId}: ${err.message}`);
      return null; // El registro NUNCA se rompe por el bono
    }
  }

  // ═══ DEVOLUCIÓN DE CONSUELO (CASHBACK) ═══
  async getRefundPercentage(): Promise<number> {
    return this.get<number>(REFUND_PERCENTAGE_KEY, 50);
  }

  async setRefundPercentage(percentage: number): Promise<number> {
    const valid = Math.max(0, Math.min(100, percentage));
    await this.set(REFUND_PERCENTAGE_KEY, valid);
    return valid;
  }
}
