import { IsString, Length, IsMongoId } from 'class-validator';

export class CancelPosSaleDto {
  @IsMongoId()
  transactionId: string;

  @IsString()
  @Length(4, 6)
  adminPin: string;
}
