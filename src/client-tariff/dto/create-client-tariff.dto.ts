import { IsNotEmpty, IsOptional, IsNumber, IsString } from 'class-validator';

export class CreateClientTariffDto {
  @IsNotEmpty()
  @IsString()
  cliente: string;

  @IsNotEmpty()
  @IsString()
  partida: string;

  @IsNotEmpty()
  @IsString()
  llegada: string;

  @IsNotEmpty()
  @IsString()
  material: string;

  @IsOptional()
  @IsNumber()
  precioVentaSinIgv?: number;

  @IsNotEmpty()
  @IsString()
  moneda: string;

  @IsOptional()
  @IsNumber()
  precioCostoSinIgv?: number;

  @IsNotEmpty()
  @IsString()
  divisa: string;
}
