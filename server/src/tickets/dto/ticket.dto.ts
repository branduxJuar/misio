import { IsInt, IsMongoId, Min } from 'class-validator';

/**
 * Compra de boleto. OJO: el userId NO viene en el body — se toma del JWT
 * (@CurrentUser) para que nadie compre "a nombre de otro".
 */
export class CreateTicketDto {
  @IsMongoId()
  raffleId: string;

  @IsInt()
  @Min(1)
  ticketNumber: number;
}
