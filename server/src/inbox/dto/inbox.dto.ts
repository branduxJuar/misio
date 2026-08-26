import { IsMongoId, IsString, Length } from 'class-validator';

export class SendAdminMessageDto {
  @IsMongoId()
  userId: string;

  @IsString()
  @Length(1, 100)
  subject: string;

  @IsString()
  @Length(1, 2000)
  message: string;
}
