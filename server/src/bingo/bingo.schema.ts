import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum BingoRoomStatus {
  OPEN = 'open', // Sala creada: amigos entrando con el código
  LIVE = 'live', // El anfitrión ya está cantando números
  FINISHED = 'finished', // Alguien hizo BINGO
}

/** Modo de victoria (lo configura el anfitrión al crear la sala). */
export enum BingoWinMode {
  LINE = 'line', // Fila, columna o diagonal completa
  FULL = 'full', // Cartón lleno (los 25)
}

/**
 * SALA DE BINGO v2 — JUEGO SOCIAL, GRATIS, ENTRE USUARIOS REGISTRADOS.
 * Cualquier usuario crea la sala y comparte el CÓDIGO con sus amigos.
 * El anfitrión canta los números; el sistema detecta el BINGO solo.
 * Sin admin, sin créditos, sin premios del sistema: pura reunión.
 */
@Schema({ timestamps: true, collection: 'bingo_rooms' })
export class BingoRoom {
  /** Código corto para compartir (ej: ZB-4F7K). */
  @Prop({ required: true, unique: true, uppercase: true })
  code: string;

  /** El usuario que creó la sala: el ÚNICO que canta números. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  hostId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  /** Configurable por el anfitrión (2 a 50). */
  @Prop({ default: 10, min: 2, max: 50 })
  maxPlayers: number;

  @Prop({ type: String, enum: BingoWinMode, default: BingoWinMode.LINE })
  winMode: BingoWinMode;

  @Prop({ type: String, enum: BingoRoomStatus, default: BingoRoomStatus.OPEN, index: true })
  status: BingoRoomStatus;

  /** Números cantados (1-75) en orden. */
  @Prop({ type: [Number], default: [] })
  calledNumbers: number[];

  /** Ganador (detectado por el sistema, no autodeclarado). */
  @Prop({ type: Object, default: null })
  winner: { userId: string; name: string } | null;
}
export type BingoRoomDocument = HydratedDocument<BingoRoom>;
export const BingoRoomSchema = SchemaFactory.createForClass(BingoRoom);

/** Cartón: un usuario registrado en una sala. */
@Schema({ timestamps: true, collection: 'bingo_cards' })
export class BingoCard {
  @Prop({ type: Types.ObjectId, ref: 'BingoRoom', required: true, index: true })
  roomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** 25 números columna por columna (B-I-N-G-O); posición 12 = 0 (libre). */
  @Prop({ type: [Number], required: true })
  numbers: number[];
}
export type BingoCardDocument = HydratedDocument<BingoCard>;
export const BingoCardSchema = SchemaFactory.createForClass(BingoCard);

/** Un cartón por usuario por sala. */
BingoCardSchema.index({ roomId: 1, userId: 1 }, { unique: true });

// ── Utilidades del juego ──────────────────────────────────────────

/** Rangos por columna del bingo de 75 bolas. */
export const COLUMN_RANGES: [number, number][] = [
  [1, 15], [16, 30], [31, 45], [46, 60], [61, 75],
];

/** Genera un cartón 5×5 clásico (columna por columna, centro libre). */
export function generateCard(): number[] {
  const sample = (min: number, max: number, count: number): number[] => {
    const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  };
  const numbers: number[] = [];
  COLUMN_RANGES.forEach(([min, max], col) => {
    sample(min, max, 5).forEach((n, row) => { numbers[col * 5 + row] = n; });
  });
  numbers[12] = 0; // Centro libre
  return numbers;
}

/**
 * DETECCIÓN DE BINGO (el sistema decide, no el jugador):
 * - line: cualquier fila, columna o diagonal con sus 5 marcados.
 * - full: los 25 marcados.
 * La grilla está aplanada columna-major: index = col*5 + row.
 */
export function hasWon(numbers: number[], called: Set<number>, mode: BingoWinMode): boolean {
  const marked = (i: number) => numbers[i] === 0 || called.has(numbers[i]);

  if (mode === BingoWinMode.FULL) {
    return numbers.every((_, i) => marked(i));
  }
  // Columnas
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every((r) => marked(c * 5 + r))) return true;
  }
  // Filas
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => marked(c * 5 + r))) return true;
  }
  // Diagonales
  if ([0, 1, 2, 3, 4].every((i) => marked(i * 5 + i))) return true;
  if ([0, 1, 2, 3, 4].every((i) => marked(i * 5 + (4 - i)))) return true;
  return false;
}
