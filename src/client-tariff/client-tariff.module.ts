import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientTariffEntity } from './entities/client-tariff.entity';
import { ClientTariffService } from './services/client-tariff.service';
import { ClientTariffController } from './controllers/client-tariff.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ClientTariffEntity])],
  controllers: [ClientTariffController],
  providers: [ClientTariffService],
  exports: [ClientTariffService],
})
export class ClientTariffModule {}
