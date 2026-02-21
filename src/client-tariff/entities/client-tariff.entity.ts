import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('client_tariff')
export class ClientTariffEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  cliente: string;

  @Column({ length: 255 })
  partida: string;

  @Column({ length: 255 })
  llegada: string;

  @Column({ length: 255 })
  material: string;

  @Column({ type: 'decimal', precision: 15, scale: 8, default: 0 })
  precioVentaSinIgv: number;

  @Column({ length: 50 })
  moneda: string;

  @Column({ type: 'decimal', precision: 15, scale: 8, default: 0 })
  precioCostoSinIgv: number;

  @Column({ length: 50 })
  divisa: string;
}
