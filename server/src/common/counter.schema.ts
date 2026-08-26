import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * CONTADORES ATÓMICOS.
 *
 * Para cualquier numeración correlativa (folios del Libro de
 * Reclamaciones, órdenes, etc.). Se incrementa con `$inc` dentro de un
 * `findOneAndUpdate`, que MongoDB ejecuta de forma atómica sobre el
 * documento: aunque lleguen mil peticiones en el mismo milisegundo, cada
 * una recibe un número distinto.
 *
 * La alternativa ingenua —contar documentos y sumar uno— falla apenas hay
 * concurrencia: dos lecturas simultáneas ven el mismo total y generan el
 * mismo folio.
 */
@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  /** Nombre de la serie: 'complaints', 'orders', … */
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ default: 0 })
  seq: number;
}
export type CounterDocument = HydratedDocument<Counter>;
export const CounterSchema = SchemaFactory.createForClass(Counter);
