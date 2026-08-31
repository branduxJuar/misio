import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Roles disponibles en la plataforma. */
/**
 * MÓDULOS del panel de administración. Cada cuenta de personal recibe
 * SOLO los que necesita (principio de mínimo privilegio): si al operador
 * de pagos le roban la clave, el atacante no llega a la contabilidad.
 */
export const ADMIN_MODULES = [
  'dashboard',
  'sorteos',
  'pagos',
  'usuarios',
  'tienda',
  'erp',
  'reclamos',
  'subastas',
  'contabilidad',
  'contenido',
  'marketing',
] as const;
export type AdminModule = (typeof ADMIN_MODULES)[number];

/** Permisos por defecto de cada rol (se pueden ajustar uno por uno). */
export const DEFAULT_PERMISSIONS: Record<string, AdminModule[]> = {
  admin: [...ADMIN_MODULES],
  operator: ['pagos', 'tienda'],
  presenter: ['sorteos'],
  seller: ['tienda'],
  systems: ['dashboard', 'usuarios', 'pagos', 'tienda', 'reclamos'],
  user: [],
};

export enum UserRole {
  ADMIN = 'admin', // Dueño: acceso total
  OPERATOR = 'operator', // Personal delegado: verifica pagos y atiende canjes
  PRESENTER = 'presenter', // Personal delegado: gestiona y ejecuta sorteos
  SELLER = 'seller', // Personal delegado: gestiona ventas de tienda
  SYSTEMS = 'systems', // Personal de TI: soporte, auditoría, resolución de incidencias
  USER = 'user',
}

/**
 * Interface TypeScript del usuario (contrato para servicios y DTOs).
 * `walletBalance` es la "Billetera Misio": aquí regresa el valor del boleto
 * cuando el usuario pierde una rifa (modelo Cero Pérdida).
 */
export interface IUser {
  name: string;
  dni: string;
  phone: string;
  role: UserRole;
  walletBalance: number;
  walletCanje: number;
  canjeTranches?: {
    amount: number;
    originalAmount: number;
    expiresAt: Date;
    source: string;
    createdAt?: Date;
  }[];
  autocontrol?: {
    option: 'none' | 'monthly_spend' | 'daily_time' | 'exclusion';
    monthlySpendLimit?: number | null;
    dailyTimeLimit?: number | null;
    pendingDisableAt?: Date | string | null;
    lastModifiedAt?: Date | string | null;
  };
  readAnnouncements?: string[];
  forgotPasswordAttempts?: number;
  createdAt: Date;
}

@Schema({ timestamps: { createdAt: true, updatedAt: true }, collection: 'users' })
export class User implements IUser {
  @Prop({ required: true, trim: true })
  name: string;

  /** DNI peruano: 8 dígitos, único (evita cuentas duplicadas para sorteos). */
  @Prop({ required: true, unique: true, match: /^\d{8}$/ })
  dni: string;

  /** Celular usado para notificaciones de Yape/Plin y avisos de sorteo. */
  @Prop({ required: true, trim: true })
  phone: string;

  /**
   * Hash bcrypt de la contraseña. `select: false` evita que se filtre en
   * queries normales: solo AuthService lo pide explícitamente con
   * `.select('+passwordHash')`. (Futuro: reemplazable por OTP vía SMS.)
   */
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER, index: true })
  role: UserRole;

  /**
   * PERMISOS por módulo del panel. El admin los tiene todos siempre; al
   * resto del personal se los das a medida ("este solo ve Pagos").
   */
  @Prop({ type: [String], default: [] })
  permissions: string[];

  /**
   * Saldo Misio en soles (PEN). NUNCA modificar directamente desde un
   * controlador: todo cambio pasa por TransactionsService para dejar rastro.
   */
  /**
   * 💵 SALDO CONTABLE: dinero REAL (recargas Yape confirmadas). Con este
   * se compran tickets de sorteos y productos de VENTA de la tienda.
   */
  @Prop({ default: 0, min: 0 })
  walletBalance: number;

  /**
   * 🎁 SALDO DE CANJE: el que vuelve por Cero Pérdida al perder un
   * sorteo. SOLO sirve para artículos marcados como CANJE en la tienda —
   * así el reembolso promocional no compra mercadería de venta real.
   */
  @Prop({ default: 0, min: 0 })
  walletCanje: number;

  /**
   * Tramos del Saldo de Canje. Cada vez que se devuelve saldo, se añade un tramo
   * con fecha de vencimiento. Cuando se gasta, se usa el método FIFO.
   */
  @Prop({
    type: [{
      amount: Number,
      originalAmount: Number,
      expiresAt: Date,
      source: String,
      createdAt: { type: Date, default: Date.now },
    }],
    default: [],
  })
  canjeTranches: {
    amount: number;
    originalAmount: number;
    expiresAt: Date;
    source: string;
    createdAt?: Date;
  }[];


  /**
   * 🔒 FONDOS RETENIDOS (subastas): al pujar, el monto sale del contable
   * y queda aquí. Si te superan, vuelve al contable al instante. Si
   * ganas, se consume como pago. Disponible real = walletBalance.
   */
  @Prop({ default: 0, min: 0 })
  walletHeld: number;

  /** Fecha de aceptación de Términos y Condiciones (evidencia de consentimiento). */
  @Prop({ type: Date, default: null })
  acceptedTermsAt: Date | null;

  /** Correo del usuario (verificable con código si el admin lo activa). */
  @Prop({ default: '', lowercase: true, trim: true })
  email: string;

  @Prop({ type: Date, default: null })
  emailVerifiedAt: Date | null;

  @Prop({ type: Number, default: 0 })
  verificationAttempts: number;

  @Prop({ type: Boolean, default: false })
  isLockedForSpam: boolean;

  /** Foto de perfil (subida a /uploads). */
  @Prop({ default: '' })
  avatarUrl: string;

  /**
   * DIRECCIÓN DE ENVÍO — clave para que el admin sepa a dónde despachar
   * premios y compras de la tienda.
   */
  @Prop({ type: Object, default: null })
  address: {
    line1?: string; // Calle/Mz/Lote
    city?: string;
    region?: string;
    country?: string; // País para campañas internacionales
    reference?: string; // "Frente al parque…"
  } | null;

  /** Fecha para invalidar sesiones activas (Expulsar del sistema) */
  @Prop({ type: Date, default: null })
  forceLogoutAt: Date | null;

  /** Contacto adicional (WhatsApp u otro número). */
  @Prop({ default: '' })
  altContact: string;

  /** Código de verificación vigente (6 dígitos) y su expiración. */
  @Prop({ default: '', select: false })
  verifyCode: string;

  @Prop({ type: Date, default: null, select: false })
  verifyCodeExpires: Date | null;

  /** BANEO: cuenta suspendida por incumplir normas (falsificar pagos, etc.). */
  @Prop({ default: false, index: true })
  banned: boolean;

  @Prop({ default: '' })
  banReason: string;

  @Prop({ type: Date, default: null })
  bannedAt: Date | null;

  /**
   * ANTI FUERZA BRUTA: intentos fallidos seguidos y hasta cuándo queda
   * bloqueada la cuenta. Sin esto, un bot puede probar miles de
   * contraseñas contra un DNI (que es público y solo tiene 8 dígitos).
   */
  @Prop({ default: 0 })
  failedLogins: number;

  @Prop({ type: Date, default: null })
  lockedUntil: Date | null;

  /**
   * REFRESH TOKEN (hash): permite renovar el JWT sin volver a pedir la
   * contraseña. Se guarda HASHEADO: si alguien lee la BD, no puede usar
   * los tokens. Se borra al cerrar sesión (revocación instantánea).
   */
  @Prop({ select: false, default: '' })
  hashedRefreshToken: string;

  /**
   * 2FA (TOTP): secreto para Google Authenticator / Authy.
   * select:false = nunca sale en consultas normales (es equivalente a
   * una contraseña). Solo se lee al verificar el código.
   */
  @Prop({ select: false, default: '' })
  totpSecret: string;

  @Prop({ default: false })
  totpEnabled: boolean;

  /** Suscripciones Web Push (una por dispositivo). */
  @Prop({ type: [Object], default: [] })
  pushSubscriptions: any[];

  /**
   * Fuerza el cambio de contraseña al siguiente login. Lo activa el admin
   * cuando resetea la clave de un usuario (queda temporal), o el seed del
   * admin inicial. El usuario no puede usar el sistema hasta cambiarla.
   */
  @Prop({ default: false })
  mustChangePassword: boolean;

  /**
   * Token de recuperación de contraseña (hash) y su expiración. Se genera
   * al pedir "olvidé mi contraseña" y se invalida al usarlo o al vencer.
   */
  @Prop({ select: false, default: '' })
  resetToken: string;

  @Prop({ type: Date, default: null })
  resetTokenExpires: Date | null;

  @Prop({ type: Number, default: 0 })
  forgotPasswordAttempts: number;

  /**
   * TRACKING: de dónde vino este usuario. Se captura una sola vez al
   * registrarse (del query string ?utm_source=...). Después ya no cambia.
   * Sirve para saber qué canal y qué sorteo te trae gente.
   */
  @Prop({ type: Object, default: {} })
  registration: {
    source?: string;     // utm_source (whatsapp, facebook, google...)
    medium?: string;     // utm_medium (social, cpc, organic...)
    campaign?: string;   // utm_campaign (iphone16, bingo-navidad...)
    referrer?: string;   // document.referrer del navegador
    registeredAt?: Date;
  };

  /**
   * AUTOCONTROL Y JUEGO RESPONSABLE:
   * Límite de gasto mensual, límite de tiempo diario o autoexclusión.
   * Con regla de 24h obligatorias para desactivación o modificación.
   */
  @Prop({
    type: Object,
    default: { option: 'none' },
  })
  autocontrol: {
    option: 'none' | 'monthly_spend' | 'daily_time' | 'exclusion';
    monthlySpendLimit?: number | null;
    dailyTimeLimit?: number | null;
    pendingDisableAt?: Date | string | null;
    lastModifiedAt?: Date | string | null;
  };

  /** IDs de los avisos emergentes que el usuario ya cerró (leyó). */
  @Prop({ type: [String], default: [] })
  readAnnouncements: string[];

  createdAt: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
